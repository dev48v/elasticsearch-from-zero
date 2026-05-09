// STEP 8b — Tiny typed fetch wrapper. Centralises base-URL resolution
// so we never sprinkle `import.meta.env.VITE_API_URL` across components.
//
// Two reasons this is a function (not a top-level constant):
//   1. AbortController integration — every call gets a per-call signal so
//      callers can cancel stale searches when the user keeps typing.
//   2. Errors get normalised into ApiError with a stable shape, so the
//      React side has a single try/catch idiom.
import type { Recipe, SearchResponse, SuggestResponse } from './types';

const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

const request = async <T>(path: string, signal?: AbortSignal): Promise<T> => {
  const res = await fetch(`${BASE}${path}`, { signal });
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // Response wasn't JSON — keep the status-line fallback.
    }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
};

export const api = {
  search: (
    params: { q?: string; category?: string; area?: string; size?: number; from?: number },
    signal?: AbortSignal,
  ) => {
    const query = new URLSearchParams();
    if (params.q) query.set('q', params.q);
    if (params.category) query.set('category', params.category);
    if (params.area) query.set('area', params.area);
    if (params.size) query.set('size', String(params.size));
    if (params.from) query.set('from', String(params.from));
    return request<SearchResponse>(`/api/search?${query}`, signal);
  },
  suggest: (q: string, signal?: AbortSignal) =>
    request<SuggestResponse>(`/api/suggest?q=${encodeURIComponent(q)}`, signal),
  recipe: (id: string, signal?: AbortSignal) =>
    request<Recipe>(`/api/recipe/${encodeURIComponent(id)}`, signal),
  random: (signal?: AbortSignal) => request<Recipe>('/api/random', signal),
  facets: (signal?: AbortSignal) =>
    request<{ category: { key: string; doc_count: number }[]; area: { key: string; doc_count: number }[] }>(
      '/api/facets',
      signal,
    ),
};
