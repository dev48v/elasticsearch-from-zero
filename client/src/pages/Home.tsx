// STEP 9b — Home page.
//
// URL state is the source of truth: `?q=&category=&area=`. Why?
//   - Shareable links — copy paste the URL and the next person sees the
//     same search.
//   - Browser back/forward Just Work without us reimplementing them.
//   - Reload-safety — refreshing the tab keeps you on the same query.
//
// Trade-off: every state mutation has to round-trip through `setSearchParams`
// rather than `setState`. For a search UI that's exactly what you want.
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { SearchBar } from '../components/SearchBar';
import { RecipeCard } from '../components/RecipeCard';
import type { SearchResponse } from '../types';

export const Home = () => {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const category = params.get('category') ?? '';
  const area = params.get('area') ?? '';

  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    api
      .search({ q, category, area, size: 30 }, controller.signal)
      .then(setData)
      .catch((err: unknown) => {
        if ((err as Error).name === 'AbortError') return;
        setError(err instanceof ApiError ? err.message : 'Search failed');
        setData(null);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [q, category, area]);

  const setParam = (key: string, value: string): void => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: false });
  };

  const onRandom = async (): Promise<void> => {
    try {
      const recipe = await api.random();
      window.location.href = `/recipe/${recipe.id}`;
    } catch {
      setError('Could not fetch a random recipe');
    }
  };

  return (
    <div className="home">
      <div className="hero">
        <h1>Search 300+ recipes — full-text, fuzzy, instant.</h1>
        <p>Type, filter, drill in. Powered by Elasticsearch 8 indexing TheMealDB.</p>
        <SearchBar initialValue={q} onSubmit={(v) => setParam('q', v)} />
        <button className="random-btn" onClick={onRandom} type="button">
          🎲 I'm feeling lucky
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="results-layout">
        <aside className="facets">
          <h2>Filters</h2>
          <FacetGroup
            title="Category"
            buckets={data?.facets.category ?? []}
            selected={category}
            onSelect={(v) => setParam('category', v)}
          />
          <FacetGroup
            title="Cuisine"
            buckets={data?.facets.area ?? []}
            selected={area}
            onSelect={(v) => setParam('area', v)}
          />
        </aside>

        <section className="results">
          {loading ? (
            <div className="muted">Searching…</div>
          ) : data ? (
            <>
              <div className="results-meta">
                <strong>{data.total}</strong> recipes
                <span className="muted"> · {data.took}ms</span>
              </div>
              {data.hits.length === 0 ? (
                <div className="empty">No recipes match. Try fewer filters.</div>
              ) : (
                <div className="grid">
                  {data.hits.map((r) => (
                    <RecipeCard key={r.id} recipe={r} />
                  ))}
                </div>
              )}
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
};

interface FacetGroupProps {
  title: string;
  buckets: { key: string; doc_count: number }[];
  selected: string;
  onSelect: (v: string) => void;
}

const FacetGroup = ({ title, buckets, selected, onSelect }: FacetGroupProps) => (
  <div className="facet-group">
    <h3>{title}</h3>
    {selected && (
      <button className="facet-clear" onClick={() => onSelect('')} type="button">
        × Clear: {selected}
      </button>
    )}
    <ul>
      {buckets.slice(0, 10).map((b) => (
        <li key={b.key}>
          <button
            className={selected === b.key ? 'active' : ''}
            onClick={() => onSelect(selected === b.key ? '' : b.key)}
            type="button"
          >
            <span>{b.key}</span>
            <span className="count">{b.doc_count}</span>
          </button>
        </li>
      ))}
    </ul>
  </div>
);
