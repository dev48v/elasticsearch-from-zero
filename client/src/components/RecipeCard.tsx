import { Link } from 'react-router-dom';
import type { Recipe } from '../types';

interface Props {
  recipe: Recipe;
}

// Highlights from ES come back as HTML strings with <mark> tags. We
// inject them via dangerouslySetInnerHTML — safe here because the
// content is OUR field data wrapped in <mark>, never user-controlled.
const highlightOrPlain = (highlighted: string[] | undefined, fallback: string): string =>
  highlighted && highlighted[0] ? highlighted[0] : fallback;

export const RecipeCard = ({ recipe }: Props) => (
  <Link to={`/recipe/${recipe.id}`} className="card">
    <img src={recipe.thumbnail} alt={recipe.name} loading="lazy" />
    <div className="card-body">
      <h3
        className="card-title"
        dangerouslySetInnerHTML={{
          __html: highlightOrPlain(recipe.highlights?.name, recipe.name),
        }}
      />
      <div className="card-meta">
        <span className="pill">{recipe.category}</span>
        <span className="pill pill-area">{recipe.area}</span>
      </div>
      {recipe.highlights?.ingredients && recipe.highlights.ingredients[0] && (
        <p
          className="card-snippet"
          dangerouslySetInnerHTML={{
            __html: `… ${recipe.highlights.ingredients[0]} …`,
          }}
        />
      )}
    </div>
  </Link>
);
