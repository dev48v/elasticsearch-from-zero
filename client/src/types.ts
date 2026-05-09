// Shared shapes between client and server. Kept in sync by hand because
// duplicating ~50 lines is cheaper than wiring up a shared types package.
export interface Recipe {
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
  // Search-only fields — only populated by /api/search responses.
  score?: number;
  highlights?: {
    name?: string[];
    instructions?: string[];
    ingredients?: string[];
  };
}

export interface FacetBucket {
  key: string;
  doc_count: number;
}

export interface SearchResponse {
  total: number;
  took: number;
  hits: Recipe[];
  facets: {
    category: FacetBucket[];
    area: FacetBucket[];
  };
}

export interface SuggestResponse {
  hits: Pick<Recipe, 'id' | 'name' | 'category' | 'thumbnail'>[];
}
