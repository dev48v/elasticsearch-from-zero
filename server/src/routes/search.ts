// STEP 6 — Search routes. Five endpoints, each illustrating a different
// Elasticsearch capability:
//
//   GET /api/search?q=&category=&area=&size=&from=
//     → multi_match across name/category/area/instructions/ingredients
//       with field boosts, optional filters, highlights, and a terms
//       aggregation that powers the sidebar facet counts.
//
//   GET /api/suggest?q=
//     → search_as_you_type on name.suggest for the autocomplete dropdown.
//       Returns at most 8 hits, name only.
//
//   GET /api/recipe/:id
//     → simple GET by document id. ES retrieves from the translog or
//       segment files in O(1).
//
//   GET /api/random
//     → function_score with random_score — the ES-native way to pull a
//       single random document without scanning everything.
//
//   GET /api/facets
//     → terms aggregations on category.keyword and area.keyword. Used
//       to populate filter dropdowns on the home page.
import { Router, type Request, type Response } from 'express';
import { es } from '../es.js';
import { config } from '../config.js';

export const searchRouter = Router();

interface RecipeSource {
  id: string;
  name: string;
  category: string;
  area: string;
  instructions: string;
  ingredients: string[];
  tags: string[];
  thumbnail: string;
  youtube: string | null;
  source: string | null;
}

const wrapHandler = (
  fn: (req: Request, res: Response) => Promise<void>,
): ((req: Request, res: Response, next: (err?: unknown) => void) => void) => {
  // Express 4 doesn't await async handlers, so a rejection becomes an
  // unhandled promise. This wrapper forwards to the error middleware.
  return (req, res, next) => {
    fn(req, res).catch(next);
  };
};

searchRouter.get(
  '/search',
  wrapHandler(async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    const category = req.query.category ? String(req.query.category) : undefined;
    const area = req.query.area ? String(req.query.area) : undefined;
    const size = Math.min(Number(req.query.size ?? 20), 50);
    const from = Math.max(Number(req.query.from ?? 0), 0);

    // Build the bool query bottom-up. `must` clauses score; `filter`
    // clauses don't (they're cached and faster).
    const must: Record<string, unknown>[] = [];
    const filter: Record<string, unknown>[] = [];

    if (q) {
      must.push({
        multi_match: {
          query: q,
          // Boosts: name matches count 5x, category 2x, ingredients 1.5x,
          // instructions 1x. Without boosts, a recipe whose instructions
          // happen to mention "pasta" would outrank a recipe literally
          // CALLED "Pasta Primavera".
          fields: [
            'name^5',
            'name.suggest^3',
            'category^2',
            'area',
            'ingredients^1.5',
            'instructions',
          ],
          // best_fields = use the single best-matching field's score.
          // most_fields would average across fields; cross_fields treats
          // them as one virtual field. best_fields gives the most natural
          // ranking for "looks like this is what they meant" queries.
          type: 'best_fields',
          fuzziness: 'AUTO',
        },
      });
    } else {
      // Empty query = browse mode. We score everything equally.
      must.push({ match_all: {} });
    }

    // term filter on the keyword sub-field — exact match, no analysis.
    if (category) filter.push({ term: { 'category.keyword': category } });
    if (area) filter.push({ term: { 'area.keyword': area } });

    const response = await es.search<RecipeSource>({
      index: config.indexName,
      from,
      size,
      query: { bool: { must, filter } },
      // Highlights: ES rewrites matching tokens with <mark> tags so the
      // UI can show which words drove the match. unified highlighter
      // works for any field type and is the modern default.
      highlight: {
        pre_tags: ['<mark>'],
        post_tags: ['</mark>'],
        fields: {
          name: { number_of_fragments: 0 },
          ingredients: { number_of_fragments: 2, fragment_size: 80 },
          instructions: { number_of_fragments: 1, fragment_size: 140 },
        },
      },
      // Aggregations run against the SAME query result set, so the facet
      // counts show "what filters are valid given the current query"
      // — exactly what users expect from faceted search.
      aggs: {
        by_category: { terms: { field: 'category.keyword', size: 20 } },
        by_area: { terms: { field: 'area.keyword', size: 20 } },
      },
    });

    const hits = response.hits.hits.map((h) => ({
      ...(h._source as RecipeSource),
      score: h._score,
      highlights: h.highlight,
    }));

    res.json({
      total:
        typeof response.hits.total === 'object'
          ? response.hits.total.value
          : (response.hits.total ?? 0),
      took: response.took,
      hits,
      facets: {
        category: (response.aggregations?.by_category as { buckets: { key: string; doc_count: number }[] })
          ?.buckets ?? [],
        area: (response.aggregations?.by_area as { buckets: { key: string; doc_count: number }[] })
          ?.buckets ?? [],
      },
    });
  }),
);

searchRouter.get(
  '/suggest',
  wrapHandler(async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    if (!q) {
      res.json({ hits: [] });
      return;
    }
    // search_as_you_type generates _2gram and _3gram subfields under the
    // hood. Querying ALL of them with bool_prefix gives prefix matching
    // up to the trigram boundary — "spagh" matches "Spaghetti", "veg cu"
    // matches "Vegetarian Curry", etc.
    const response = await es.search<RecipeSource>({
      index: config.indexName,
      size: 8,
      _source: ['id', 'name', 'category', 'thumbnail'],
      query: {
        multi_match: {
          query: q,
          type: 'bool_prefix',
          fields: ['name.suggest', 'name.suggest._2gram', 'name.suggest._3gram'],
        },
      },
    });
    res.json({
      hits: response.hits.hits.map((h) => h._source),
    });
  }),
);

searchRouter.get(
  '/recipe/:id',
  wrapHandler(async (req, res) => {
    try {
      const response = await es.get<RecipeSource>({
        index: config.indexName,
        id: req.params.id,
      });
      res.json(response._source);
    } catch (err) {
      // The client throws ResponseError with statusCode 404 on missing
      // documents. Anything else is a real failure we should surface.
      if ((err as { statusCode?: number }).statusCode === 404) {
        res.status(404).json({ error: 'Recipe not found' });
        return;
      }
      throw err;
    }
  }),
);

searchRouter.get(
  '/random',
  wrapHandler(async (_req, res) => {
    // function_score with random_score is the canonical ES idiom for
    // random sampling. We seed with Date.now() so the same client refresh
    // gets a different random recipe each time.
    //
    // The client typings model `function_score.functions` as an array of
    // function containers. `random_score` is a top-level shorthand the
    // server accepts but the type lib doesn't expose — we cast to keep
    // the wire format readable rather than wrap in functions:[{...}].
    const response = await es.search<RecipeSource>({
      index: config.indexName,
      size: 1,
      query: {
        function_score: {
          query: { match_all: {} },
          random_score: { seed: Date.now(), field: '_seq_no' },
        },
      } as Record<string, unknown>,
    });
    const hit = response.hits.hits[0];
    if (!hit) {
      res.status(404).json({ error: 'No recipes indexed' });
      return;
    }
    res.json(hit._source);
  }),
);

searchRouter.get(
  '/facets',
  wrapHandler(async (_req, res) => {
    // size: 0 = "don't return any documents, just give me the aggs".
    // Cheaper than a regular search because ES skips the hit-collection
    // phase entirely.
    const response = await es.search({
      index: config.indexName,
      size: 0,
      aggs: {
        by_category: { terms: { field: 'category.keyword', size: 50 } },
        by_area: { terms: { field: 'area.keyword', size: 50 } },
      },
    });
    res.json({
      category: (response.aggregations?.by_category as { buckets: { key: string; doc_count: number }[] })
        ?.buckets ?? [],
      area: (response.aggregations?.by_area as { buckets: { key: string; doc_count: number }[] })
        ?.buckets ?? [],
    });
  }),
);
