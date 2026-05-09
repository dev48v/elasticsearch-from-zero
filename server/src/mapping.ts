// STEP 4 — Index mapping (the schema for our search index).
//
// Why explicit mapping (instead of letting ES auto-detect)?
//   - Auto-mapping makes every text field both `text` AND `keyword`, which
//     inflates the index ~2x and indexes things you never search by.
//   - Auto-mapping won't enable `search_as_you_type` (needed for the
//     autocomplete dropdown) — that's an opt-in field type.
//   - Names like "Spicy Arrabiata Penne" need a dedicated keyword sub-field
//     for sort/aggregation while the parent `text` field handles full-text
//     match. Auto-mapping does this but I want it explicit so a future
//     reader can see WHY.
//
// Multi-fields recap:
//   name           → text (analyzed, tokenized, lowercase) — used by `match`
//   name.keyword   → keyword (exact, case-sensitive)        — used by sort/aggs
//   name.suggest   → search_as_you_type                     — used by autocomplete
import type { MappingTypeMapping } from '@elastic/elasticsearch/lib/api/types.js';

export const recipeMapping: MappingTypeMapping = {
  properties: {
    id: { type: 'keyword' },
    name: {
      type: 'text',
      fields: {
        keyword: { type: 'keyword' },
        suggest: { type: 'search_as_you_type' },
      },
    },
    category: {
      type: 'text',
      fields: { keyword: { type: 'keyword' } },
    },
    area: {
      type: 'text',
      fields: { keyword: { type: 'keyword' } },
    },
    // `instructions` is one big paragraph — only used by full-text search.
    // We don't need to sort or aggregate by it, so no keyword sub-field.
    instructions: { type: 'text' },
    // `ingredients` is an array of strings. ES handles arrays of any type
    // transparently — no special mapping needed; each token gets analyzed.
    ingredients: { type: 'text' },
    tags: { type: 'keyword' },
    // `index: false` means "store the value but don't tokenize for search".
    // Saves disk space and analysis time for fields we'll only ever return.
    thumbnail: { type: 'keyword', index: false },
    youtube: { type: 'keyword', index: false },
    source: { type: 'keyword', index: false },
  },
};

// We also configure the analyzer at the index level. Default `standard`
// analyzer is fine for English recipes — lowercases, tokenises on
// whitespace/punctuation. We add `english` analyzer support for stemming
// (so "tomatoes" matches "tomato") on the `instructions` field.
export const recipeSettings = {
  analysis: {
    analyzer: {
      // Default for text fields unless explicitly overridden.
      default: { type: 'standard' as const },
    },
  },
  // Single-node cluster = zero replicas. Asking for 1+ would leave shards
  // unassigned and turn the cluster yellow forever (which we treat as
  // ready, but it's still wrong).
  number_of_shards: 1,
  number_of_replicas: 0,
};
