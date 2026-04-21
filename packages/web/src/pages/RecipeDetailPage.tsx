import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  IngredientMatchStatus,
  RecipeCookResult,
  RecipeDetail,
  RecipeIngredientWithStatus,
} from '@sophie/shared';
import { ApiError } from '../api/client';
import { endpoints, qk } from '../api/endpoints';
import { toast } from '../state/toast';

const STATUS_COLOR: Record<IngredientMatchStatus, string> = {
  ok: 'var(--accent)',
  short: 'var(--warn)',
  missing: 'var(--danger)',
  unit_mismatch: 'var(--muted, #888)',
};

const STATUS_LABEL: Record<IngredientMatchStatus, string> = {
  ok: 'On hand',
  short: 'Short',
  missing: 'Missing',
  unit_mismatch: 'Unit mismatch',
};

export function RecipeDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [cookPlan, setCookPlan] = useState<RecipeCookResult | null>(null);

  const recipe = useQuery<RecipeDetail>({
    queryKey: qk.recipe(id),
    queryFn: () => endpoints.getRecipe(id),
  });

  const dryRun = useMutation({
    mutationFn: () => endpoints.cookRecipe(id, { dry_run: true }),
    onSuccess: (plan) => setCookPlan(plan),
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Cannot cook'),
  });

  const cook = useMutation({
    mutationFn: () => endpoints.cookRecipe(id, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.recipe(id) });
      qc.invalidateQueries({ queryKey: ['recipes'] });
      qc.invalidateQueries({ queryKey: ['items'] });
      qc.invalidateQueries({ queryKey: qk.shopping });
      setCookPlan(null);
      toast.success('Inventory updated');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Cook failed'),
  });

  const remove = useMutation({
    mutationFn: () => endpoints.deleteRecipe(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recipes'] });
      toast.success('Recipe deleted');
      navigate('/recipes');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Delete failed'),
  });

  if (recipe.isLoading) return <div>Loading…</div>;
  if (recipe.error || !recipe.data) {
    return (
      <div className="card">
        <p>Recipe not found.</p>
        <Link to="/recipes">Back to recipes</Link>
      </div>
    );
  }

  const r = recipe.data;
  const totalMinutes = (r.prep_minutes ?? 0) + (r.cook_minutes ?? 0);

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0 }}>{r.name}</h2>
          <div className="muted" style={{ fontSize: '0.9rem' }}>
            {r.servings ? `${r.servings} servings` : null}
            {r.servings && totalMinutes ? ' · ' : null}
            {totalMinutes ? `${totalMinutes} min` : null}
          </div>
        </div>
        <div className="row" style={{ gap: '0.5rem' }}>
          <Link to={`/recipes/${r.id}/edit`}>Edit</Link>
          <button
            onClick={() => {
              if (confirm('Delete this recipe?')) remove.mutate();
            }}
            disabled={remove.isPending}
          >
            Delete
          </button>
        </div>
      </div>

      {r.tags.length > 0 ? (
        <div className="row" style={{ flexWrap: 'wrap', gap: '0.25rem' }}>
          {r.tags.map((t) => (
            <span key={t} className="badge" style={{ fontSize: '0.8rem' }}>
              #{t}
            </span>
          ))}
        </div>
      ) : null}

      {r.description ? <p>{r.description}</p> : null}

      <section className="card">
        <h3 style={{ marginTop: 0 }}>
          Ingredients{' '}
          <span className="muted" style={{ fontWeight: 'normal', fontSize: '0.9rem' }}>
            ({r.ingredient_count})
          </span>
        </h3>
        <ul className="list">
          {r.ingredients.map((ing) => (
            <IngredientRow key={ing.id} ingredient={ing} />
          ))}
        </ul>
        <div
          className="row"
          style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}
        >
          <MatchSummary recipe={r} />
          <div className="row" style={{ gap: '0.5rem' }}>
            <button
              onClick={() => dryRun.mutate()}
              disabled={dryRun.isPending || r.match_status !== 'makeable'}
              title={
                r.match_status === 'makeable'
                  ? 'Preview what would be consumed'
                  : 'Cannot cook while ingredients are missing or short'
              }
            >
              Preview cook
            </button>
            <button
              className="primary"
              onClick={() => cook.mutate()}
              disabled={cook.isPending || r.match_status !== 'makeable'}
            >
              Cook this
            </button>
          </div>
        </div>
      </section>

      {cookPlan ? (
        <section className="card">
          <h3 style={{ marginTop: 0 }}>Planned decrements</h3>
          <ul className="list">
            {cookPlan.decrements.map((d, idx) => (
              <li key={idx} className="list-row">
                <span>{d.item_name}</span>
                <span className="muted">
                  −{d.decrement} {d.unit}
                </span>
              </li>
            ))}
          </ul>
          <button onClick={() => setCookPlan(null)}>Close preview</button>
        </section>
      ) : null}

      {r.steps.length > 0 ? (
        <section className="card">
          <h3 style={{ marginTop: 0 }}>Steps</h3>
          <ol className="stack">
            {r.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </section>
      ) : null}

      {r.notes ? (
        <section className="card">
          <h3 style={{ marginTop: 0 }}>Notes</h3>
          <p style={{ whiteSpace: 'pre-wrap' }}>{r.notes}</p>
        </section>
      ) : null}
    </div>
  );
}

function IngredientRow({ ingredient }: { ingredient: RecipeIngredientWithStatus }) {
  const color = STATUS_COLOR[ingredient.status];
  const label = STATUS_LABEL[ingredient.status];
  const requiredLine = `${ingredient.required_quantity} ${ingredient.required_unit}`;
  const onHandLine =
    ingredient.status === 'unit_mismatch'
      ? 'On hand in a different unit'
      : `On hand: ${ingredient.on_hand_quantity} ${ingredient.required_unit}`;
  return (
    <li className="list-row" style={{ alignItems: 'flex-start' }}>
      <div style={{ flex: 1 }}>
        <div>
          <strong>{ingredient.type_name ?? ingredient.item_type_id}</strong>
          {ingredient.optional ? <span className="muted"> (optional)</span> : null}
        </div>
        <div className="muted" style={{ fontSize: '0.85rem' }}>
          Needs {requiredLine} · {onHandLine}
          {ingredient.note ? ` · ${ingredient.note}` : ''}
        </div>
        {ingredient.soonest_expiration_date ? (
          <div className="muted" style={{ fontSize: '0.8rem' }}>
            Earliest expiration in stock: {ingredient.soonest_expiration_date}
          </div>
        ) : null}
      </div>
      <span
        className="badge"
        style={{
          background: color,
          color: 'white',
          padding: '0.1rem 0.5rem',
          borderRadius: 'var(--radius)',
          fontSize: '0.75rem',
          alignSelf: 'center',
        }}
      >
        {label}
        {ingredient.status === 'short' && ingredient.shortfall != null
          ? ` −${ingredient.shortfall}`
          : ''}
      </span>
    </li>
  );
}

function MatchSummary({ recipe }: { recipe: RecipeDetail }) {
  if (recipe.match_status === 'makeable') {
    return <span className="muted">All ingredients on hand.</span>;
  }
  const parts: string[] = [];
  if (recipe.missing_count > 0) parts.push(`${recipe.missing_count} missing`);
  if (recipe.short_count > 0) parts.push(`${recipe.short_count} short`);
  if (recipe.unit_mismatch_count > 0) parts.push(`${recipe.unit_mismatch_count} unit mismatch`);
  return <span className="muted">{parts.join(' · ') || 'Not makeable'}</span>;
}
