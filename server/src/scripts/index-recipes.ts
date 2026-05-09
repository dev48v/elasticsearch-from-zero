// STEP 5b — One-shot indexer. Run once (or whenever you want to reset
// the index) via `npm run index`.
//
// Flow:
//   1. Drop and recreate the `recipes` index with our explicit mapping.
//   2. Walk every category from TheMealDB.
//   3. For each category, get the meal stubs, then enrich each stub with
//      the full lookup (lookup.php returns one meal at a time — there's
//      no batched endpoint).
//   4. Stream every record into a single bulk request when the buffer
//      hits BATCH_SIZE.
//
// Why bulk instead of one POST per recipe?
//   The free-tier Elasticsearch deploys we target run with very limited
//   refresh resources. Single-doc index calls each trigger a refresh
//   cycle in the worst case — bulk batches them. Practical impact for
//   ~300 recipes: 12 seconds vs 90 seconds.
import { es, waitForReady } from '../es.js';
import { config } from '../config.js';
import { recipeMapping, recipeSettings } from '../mapping.js';
import {
  collapseIngredients,
  getMeal,
  listCategories,
  listMealsByCategory,
} from '../themealdb.js';

const BATCH_SIZE = 50;

// Throttled concurrency helper — TheMealDB doesn't publish a rate limit,
// but firing 300 simultaneous requests gets you transient 5xx errors.
// Eight concurrent in-flight is comfortable.
const mapWithConcurrency = async <T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> => {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
};

const recreateIndex = async (): Promise<void> => {
  const exists = await es.indices.exists({ index: config.indexName });
  if (exists) {
    console.log(`Dropping existing index "${config.indexName}"`);
    await es.indices.delete({ index: config.indexName });
  }
  console.log(`Creating index "${config.indexName}"`);
  await es.indices.create({
    index: config.indexName,
    settings: recipeSettings,
    mappings: recipeMapping,
  });
};

// Bulk format is a quirky two-line-per-doc protocol: action line, then
// source line, action line, then source line. The client wants this as
// a flat array of alternating objects.
const indexBatch = async (
  batch: { id: string; doc: Record<string, unknown> }[],
): Promise<void> => {
  if (batch.length === 0) return;
  const operations = batch.flatMap(({ id, doc }) => [
    { index: { _index: config.indexName, _id: id } },
    doc,
  ]);
  const res = await es.bulk({ refresh: false, operations });
  if (res.errors) {
    // Surface the first failure — bulk runs partial-success by default,
    // and silent partial-failure is the worst kind of bug.
    const firstError = res.items.find((it) => it.index?.error)?.index?.error;
    throw new Error(`Bulk index failed: ${JSON.stringify(firstError)}`);
  }
};

const run = async (): Promise<void> => {
  console.log(`Connecting to Elasticsearch at ${config.esNode}`);
  await waitForReady();
  await recreateIndex();

  const categories = await listCategories();
  console.log(`Found ${categories.length} categories`);

  let buffer: { id: string; doc: Record<string, unknown> }[] = [];
  let total = 0;

  for (const category of categories) {
    const stubs = await listMealsByCategory(category);
    console.log(`  ${category}: ${stubs.length} meals`);

    const fulls = await mapWithConcurrency(stubs, 8, (s) => getMeal(s.idMeal));

    for (const meal of fulls) {
      if (!meal) continue;
      buffer.push({
        id: meal.idMeal,
        doc: {
          id: meal.idMeal,
          name: meal.strMeal,
          category: meal.strCategory,
          area: meal.strArea,
          instructions: meal.strInstructions,
          ingredients: collapseIngredients(meal),
          tags: meal.strTags
            ? meal.strTags.split(',').map((t) => t.trim()).filter(Boolean)
            : [],
          thumbnail: meal.strMealThumb,
          youtube: meal.strYoutube,
          source: meal.strSource,
        },
      });
      if (buffer.length >= BATCH_SIZE) {
        await indexBatch(buffer);
        total += buffer.length;
        buffer = [];
      }
    }
  }

  await indexBatch(buffer);
  total += buffer.length;

  // Force a refresh so subsequent searches see everything immediately.
  // Without this, ES makes data searchable on its own ~1s schedule, so
  // the smoke test right after this script could come up empty.
  await es.indices.refresh({ index: config.indexName });
  console.log(`Indexed ${total} recipes total`);
};

run().catch((err) => {
  console.error('Indexer failed:', err);
  process.exit(1);
});
