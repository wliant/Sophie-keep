import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type {
  PaginatedResponse,
  RecipeMatchStatus,
  RecipeWithDerived,
} from '@sophie/shared';
import { endpoints, qk } from '../api/endpoints';

const SORT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'updated_desc', label: 'Recently updated' },
  { value: 'name_asc', label: 'Name (A-Z)' },
  { value: 'name_desc', label: 'Name (Z-A)' },
  { value: 'match', label: 'Most makeable first' },
];

const MATCH_LABEL: Record<RecipeMatchStatus, string> = {
  makeable: 'Makeable',
  partial: 'Partial',
  missing: 'Missing',
};

const MATCH_COLOR: Record<RecipeMatchStatus, string> = {
  makeable: 'var(--accent)',
  partial: 'var(--warn)',
  missing: 'var(--danger)',
};

export function RecipesPage() {
  const [params, setParams] = useSearchParams();

  const queryObj = useMemo(() => {
    const obj: Record<string, unknown> = {};
    params.forEach((v, k) => {
      obj[k] = v;
    });
    if (!obj.sort) obj.sort = 'updated_desc';
    if (!obj.page_size) obj.page_size = '50';
    return obj;
  }, [params]);

  const list = useQuery<PaginatedResponse<RecipeWithDerived>>({
    queryKey: qk.recipes(queryObj),
    queryFn: () => endpoints.listRecipes(queryObj),
  });

  const tags = useQuery<{ items: string[] }>({
    queryKey: qk.recipeTags,
    queryFn: endpoints.listRecipeTags,
  });

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    next.delete(key);
    if (value) next.set(key, value);
    next.delete('page');
    setParams(next);
  };

  const activeTag = params.get('tag');
  const makeableOnly = params.get('makeable') === 'true';

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Recipes</h2>
        <Link to="/recipes/new" className="button">
          + New recipe
        </Link>
      </div>

      <section className="card row" style={{ alignItems: 'end', flexWrap: 'wrap' }}>
        <div className="form-field" style={{ flex: '2 1 240px' }}>
          <label htmlFor="f-q">Search</label>
          <input
            id="f-q"
            type="search"
            placeholder="Name, description, tag…"
            defaultValue={params.get('q') ?? ''}
            onBlur={(e) => setParam('q', e.target.value || null)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setParam('q', (e.target as HTMLInputElement).value || null);
            }}
          />
        </div>
        <div className="form-field" style={{ flex: '1 1 160px' }}>
          <label htmlFor="f-sort">Sort</label>
          <select
            id="f-sort"
            value={(params.get('sort') as string) ?? 'updated_desc'}
            onChange={(e) => setParam('sort', e.target.value)}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <label
          className="row"
          style={{ gap: '0.25rem', alignItems: 'center', marginBottom: '0.5rem' }}
        >
          <input
            type="checkbox"
            style={{ width: 'auto', minHeight: 'auto' }}
            checked={makeableOnly}
            onChange={(e) => setParam('makeable', e.target.checked ? 'true' : null)}
          />
          <span>Can make now</span>
        </label>
      </section>

      {tags.data && tags.data.items.length > 0 ? (
        <div className="row" style={{ flexWrap: 'wrap', gap: '0.25rem' }}>
          <button
            onClick={() => setParam('tag', null)}
            className={activeTag ? undefined : 'active'}
            style={{ fontSize: '0.85rem' }}
          >
            All tags
          </button>
          {tags.data.items.map((t) => (
            <button
              key={t}
              onClick={() => setParam('tag', activeTag === t ? null : t)}
              className={activeTag === t ? 'active' : undefined}
              style={{ fontSize: '0.85rem' }}
            >
              #{t}
            </button>
          ))}
        </div>
      ) : null}

      {list.isLoading ? (
        <div>Loading…</div>
      ) : list.data?.items.length ? (
        <ul className="list">
          {list.data.items.map((r) => (
            <RecipeCard key={r.id} recipe={r} />
          ))}
        </ul>
      ) : (
        <div className="card muted">
          No recipes match.{' '}
          <button onClick={() => setParams(new URLSearchParams())}>Clear filters</button>
        </div>
      )}
    </div>
  );
}

function RecipeCard({ recipe }: { recipe: RecipeWithDerived }) {
  const statusLabel = MATCH_LABEL[recipe.match_status];
  const statusColor = MATCH_COLOR[recipe.match_status];
  const subtitle: string[] = [];
  if (recipe.servings) subtitle.push(`${recipe.servings} servings`);
  const totalMinutes = (recipe.prep_minutes ?? 0) + (recipe.cook_minutes ?? 0);
  if (totalMinutes > 0) subtitle.push(`${totalMinutes} min`);
  subtitle.push(`${recipe.ingredient_count} ingredients`);

  const missingHint =
    recipe.match_status === 'missing' && recipe.missing_count + recipe.unit_mismatch_count > 0
      ? `${recipe.missing_count + recipe.unit_mismatch_count} missing`
      : recipe.match_status === 'partial'
        ? `${recipe.short_count} short`
        : null;

  return (
    <li className="list-item">
      <Link to={`/recipes/${recipe.id}`} className="list-row">
        <div style={{ flex: 1 }}>
          <div className="row" style={{ gap: '0.5rem', alignItems: 'baseline' }}>
            <strong>{recipe.name}</strong>
            <span
              className="badge"
              style={{
                background: statusColor,
                color: 'white',
                padding: '0.1rem 0.5rem',
                borderRadius: 'var(--radius)',
                fontSize: '0.75rem',
              }}
            >
              {statusLabel}
              {missingHint ? ` · ${missingHint}` : ''}
            </span>
          </div>
          <div className="muted" style={{ fontSize: '0.85rem' }}>
            {subtitle.join(' · ')}
          </div>
          {recipe.tags.length > 0 ? (
            <div className="muted" style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
              {recipe.tags.map((t) => `#${t}`).join(' ')}
            </div>
          ) : null}
        </div>
      </Link>
    </li>
  );
}
