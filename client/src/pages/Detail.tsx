// STEP 9c — Recipe detail page. Routed at /recipe/:id.
//
// We split instructions on double-newlines because TheMealDB stores
// recipes as one long string with `\r\n\r\n` between steps. Splitting
// to <ol><li> turns it into something readable.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import type { Recipe } from '../types';

const splitInstructions = (raw: string): string[] =>
  raw
    .split(/\r?\n\r?\n+|\r?\n(?=\d+[.)])/)
    .map((s) => s.replace(/^\s*\d+[.)]\s*/, '').trim())
    .filter(Boolean);

const youtubeEmbed = (url: string | null): string | null => {
  if (!url) return null;
  const match = url.match(/[?&]v=([^&#]+)/) ?? url.match(/youtu\.be\/([^?&#]+)/);
  return match ? `https://www.youtube.com/embed/${match[1]}` : null;
};

export const Detail = () => {
  const { id } = useParams<{ id: string }>();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    setRecipe(null);
    setError(null);
    api
      .recipe(id, controller.signal)
      .then(setRecipe)
      .catch((err: unknown) => {
        if ((err as Error).name === 'AbortError') return;
        setError(err instanceof ApiError ? err.message : 'Failed to load recipe');
      });
    return () => controller.abort();
  }, [id]);

  if (error) return <div className="error">{error}</div>;
  if (!recipe) return <div className="muted detail-loading">Loading recipe…</div>;

  const steps = splitInstructions(recipe.instructions);
  const embed = youtubeEmbed(recipe.youtube);

  return (
    <article className="detail">
      <Link to="/" className="detail-back">
        ← Back to search
      </Link>
      <div className="detail-header">
        <img src={recipe.thumbnail} alt={recipe.name} className="detail-thumb" />
        <div>
          <h1>{recipe.name}</h1>
          <div className="detail-meta">
            <span className="pill">{recipe.category}</span>
            <span className="pill pill-area">{recipe.area}</span>
            {recipe.tags.map((t) => (
              <span key={t} className="pill pill-tag">
                {t}
              </span>
            ))}
          </div>
          {recipe.source && (
            <a
              href={recipe.source}
              target="_blank"
              rel="noreferrer noopener"
              className="detail-source"
            >
              Original source ↗
            </a>
          )}
        </div>
      </div>

      <div className="detail-grid">
        <section>
          <h2>Ingredients</h2>
          <ul className="ingredients-list">
            {recipe.ingredients.map((ing, i) => (
              <li key={i}>{ing}</li>
            ))}
          </ul>
        </section>

        <section>
          <h2>Instructions</h2>
          <ol className="instructions-list">
            {steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </section>
      </div>

      {embed && (
        <section className="detail-video">
          <h2>Video</h2>
          <div className="video-wrap">
            <iframe
              src={embed}
              title={recipe.name}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </section>
      )}
    </article>
  );
};
