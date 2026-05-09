// STEP 5a — TheMealDB upstream client.
//
// TheMealDB is a free, no-auth recipe API (https://www.themealdb.com/api.php).
// We hit three endpoints:
//   list.php?c=list           → list of category names
//   filter.php?c=<category>   → meal stubs (id, name, thumb) for a category
//   lookup.php?i=<id>         → full meal record (28 ingredients, 28 measures,
//                                instructions, area, tags, youtube, source, ...)
//
// The API returns a single object `{ meals: [...] | null }`. `null` means
// "no results" — the API authors chose null over an empty array, so callers
// have to handle both. We normalise that here.
import { config } from './config.js';

interface MealStub {
  idMeal: string;
  strMeal: string;
  strMealThumb: string;
}

// The full record from lookup.php has 50+ fields. We only type the ones
// we actually consume — TS will let `data.strSomething` through as any
// at the index boundary, which is fine for unused fields.
export interface MealFull extends MealStub {
  strCategory: string;
  strArea: string;
  strInstructions: string;
  strTags: string | null;
  strYoutube: string | null;
  strSource: string | null;
  // Ingredients live in 20 PARALLEL string fields (strIngredient1..20)
  // alongside 20 measure fields (strMeasure1..20). Why? Historical SQL
  // schema — they never normalised to a join table. We collapse them
  // into a single ingredients[] array below.
  [key: string]: string | null;
}

const fetchJson = async <T>(url: string): Promise<T> => {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`themealdb ${res.status} ${res.statusText} ${url}`);
  return (await res.json()) as T;
};

export const listCategories = async (): Promise<string[]> => {
  const data = await fetchJson<{ meals: { strCategory: string }[] }>(
    `${config.themealdbBase}/list.php?c=list`,
  );
  return (data.meals ?? []).map((m) => m.strCategory);
};

export const listMealsByCategory = async (category: string): Promise<MealStub[]> => {
  const data = await fetchJson<{ meals: MealStub[] | null }>(
    `${config.themealdbBase}/filter.php?c=${encodeURIComponent(category)}`,
  );
  return data.meals ?? [];
};

export const getMeal = async (id: string): Promise<MealFull | null> => {
  const data = await fetchJson<{ meals: MealFull[] | null }>(
    `${config.themealdbBase}/lookup.php?i=${encodeURIComponent(id)}`,
  );
  return data.meals?.[0] ?? null;
};

// Collapse the 20 parallel ingredient/measure fields into "[measure] ingredient".
// Empty strings AND empty whitespace AND nulls all mean "slot unused" — we
// trim and filter to drop them.
export const collapseIngredients = (meal: MealFull): string[] => {
  const out: string[] = [];
  for (let i = 1; i <= 20; i++) {
    const ing = (meal[`strIngredient${i}`] ?? '').trim();
    if (!ing) continue;
    const measure = (meal[`strMeasure${i}`] ?? '').trim();
    out.push(measure ? `${measure} ${ing}` : ing);
  }
  return out;
};
