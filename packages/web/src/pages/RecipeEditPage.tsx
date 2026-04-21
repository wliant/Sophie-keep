import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ItemType, RecipeDetail } from '@sophie/shared';
import { ApiError } from '../api/client';
import { endpoints, qk } from '../api/endpoints';
import { flattenTypes } from '../api/itemTypeHierarchy';
import { toast } from '../state/toast';

interface IngredientDraft {
  item_type_id: string;
  required_quantity: string;
  required_unit: string;
  optional: boolean;
  note: string;
}

function emptyIngredient(unit = ''): IngredientDraft {
  return {
    item_type_id: '',
    required_quantity: '',
    required_unit: unit,
    optional: false,
    note: '',
  };
}

export function RecipeEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isNew = !id;

  const existing = useQuery<RecipeDetail>({
    queryKey: qk.recipe(id ?? ''),
    queryFn: () => endpoints.getRecipe(id ?? ''),
    enabled: !isNew,
  });

  const types = useQuery<{ items: ItemType[] }>({
    queryKey: qk.itemTypes,
    queryFn: endpoints.listTypes,
  });

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [servings, setServings] = useState('');
  const [prepMinutes, setPrepMinutes] = useState('');
  const [cookMinutes, setCookMinutes] = useState('');
  const [stepsText, setStepsText] = useState('');
  const [notes, setNotes] = useState('');
  const [ingredients, setIngredients] = useState<IngredientDraft[]>([emptyIngredient()]);
  const [baseUpdatedAt, setBaseUpdatedAt] = useState<string | undefined>();
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (isNew || !existing.data) return;
    const r = existing.data;
    setName(r.name);
    setDescription(r.description ?? '');
    setTagsText(r.tags.join(', '));
    setServings(r.servings != null ? String(r.servings) : '');
    setPrepMinutes(r.prep_minutes != null ? String(r.prep_minutes) : '');
    setCookMinutes(r.cook_minutes != null ? String(r.cook_minutes) : '');
    setStepsText(r.steps.join('\n'));
    setNotes(r.notes ?? '');
    setIngredients(
      r.ingredients.length > 0
        ? r.ingredients.map((i) => ({
            item_type_id: i.item_type_id,
            required_quantity: String(i.required_quantity),
            required_unit: i.required_unit,
            optional: i.optional,
            note: i.note ?? '',
          }))
        : [emptyIngredient()],
    );
    setBaseUpdatedAt(r.updated_at);
  }, [existing.data, isNew]);

  const typeById = new Map((types.data?.items ?? []).map((t) => [t.id, t]));
  const typeOptions = flattenTypes(types.data?.items ?? []);

  const save = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim() || null,
        tags: tagsText
          .split(',')
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean),
        servings: servings === '' ? null : Number(servings),
        prep_minutes: prepMinutes === '' ? null : Number(prepMinutes),
        cook_minutes: cookMinutes === '' ? null : Number(cookMinutes),
        steps: stepsText
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
        notes: notes.trim() || null,
        ingredients: ingredients
          .filter((i) => i.item_type_id && i.required_quantity && i.required_unit)
          .map((i) => ({
            item_type_id: i.item_type_id,
            required_quantity: Number(i.required_quantity),
            required_unit: i.required_unit.trim(),
            optional: i.optional,
            note: i.note.trim() || null,
          })),
      };
      if (isNew) return endpoints.createRecipe(body);
      return endpoints.patchRecipe(id!, {
        ...body,
        base_updated_at: baseUpdatedAt,
      });
    },
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ['recipes'] });
      qc.invalidateQueries({ queryKey: qk.recipeTags });
      toast.success(isNew ? 'Recipe created' : 'Recipe saved');
      navigate(`/recipes/${saved.id}`);
    },
    onError: (e) => {
      if (e instanceof ApiError) {
        setErrors(e.fields ?? {});
        toast.error(e.message);
      } else {
        toast.error('Save failed');
      }
    },
  });

  const updateIngredient = (idx: number, patch: Partial<IngredientDraft>) => {
    setIngredients((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)),
    );
  };

  const errorEntries = Object.entries(errors);

  function ingredientError(idx: number): string | null {
    const messages: string[] = [];
    for (const [key, msgs] of errorEntries) {
      if (key === `ingredients.${idx}` || key.startsWith(`ingredients.${idx}.`)) {
        messages.push(...msgs);
      }
    }
    return messages.length ? messages.join(' · ') : null;
  }

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>{isNew ? 'New recipe' : 'Edit recipe'}</h2>
        <Link to={isNew ? '/recipes' : `/recipes/${id}`}>Cancel</Link>
      </div>

      {errorEntries.length > 0 ? (
        <div className="card" role="alert" style={{ borderColor: 'var(--danger)' }}>
          <strong>Please fix the following:</strong>
          <ul style={{ margin: '0.5rem 0 0 1.25rem' }}>
            {errorEntries.map(([key, msgs]) => (
              <li key={key}>
                <code style={{ fontSize: '0.85rem' }}>{key}</code>: {msgs.join(' · ')}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <section className="card stack">
        <div className="form-field">
          <label htmlFor="r-name">Name</label>
          <input
            id="r-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
          />
          {errors.name ? <small className="error">{errors.name.join(' ')}</small> : null}
        </div>

        <div className="form-field">
          <label htmlFor="r-desc">Description</label>
          <textarea
            id="r-desc"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
          />
        </div>

        <div className="row" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
          <div className="form-field" style={{ flex: '1 1 140px' }}>
            <label htmlFor="r-serv">Servings</label>
            <input
              id="r-serv"
              type="number"
              min="0"
              step="0.5"
              value={servings}
              onChange={(e) => setServings(e.target.value)}
            />
          </div>
          <div className="form-field" style={{ flex: '1 1 140px' }}>
            <label htmlFor="r-prep">Prep (min)</label>
            <input
              id="r-prep"
              type="number"
              min="0"
              value={prepMinutes}
              onChange={(e) => setPrepMinutes(e.target.value)}
            />
          </div>
          <div className="form-field" style={{ flex: '1 1 140px' }}>
            <label htmlFor="r-cook">Cook (min)</label>
            <input
              id="r-cook"
              type="number"
              min="0"
              value={cookMinutes}
              onChange={(e) => setCookMinutes(e.target.value)}
            />
          </div>
        </div>

        <div className="form-field">
          <label htmlFor="r-tags">Tags</label>
          <input
            id="r-tags"
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            placeholder="quick, breakfast, vegetarian"
          />
          <small className="muted">Comma-separated. Lowercased automatically.</small>
        </div>
      </section>

      <section className="card stack">
        <h3 style={{ margin: 0 }}>Ingredients</h3>
        {ingredients.map((ing, idx) => {
          const type = typeById.get(ing.item_type_id);
          return (
            <div key={idx} className="row" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
              <div className="form-field" style={{ flex: '2 1 180px' }}>
                <label htmlFor={`ing-${idx}-type`}>Item type</label>
                <select
                  id={`ing-${idx}-type`}
                  value={ing.item_type_id}
                  onChange={(e) => {
                    const nextType = typeById.get(e.target.value);
                    updateIngredient(idx, {
                      item_type_id: e.target.value,
                      required_unit: ing.required_unit || nextType?.default_unit || '',
                    });
                  }}
                >
                  <option value="">Select…</option>
                  {typeOptions.map((o) => (
                    <option key={o.type.id} value={o.type.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field" style={{ flex: '1 1 90px' }}>
                <label htmlFor={`ing-${idx}-qty`}>Qty</label>
                <input
                  id={`ing-${idx}-qty`}
                  type="number"
                  min="0"
                  step="any"
                  value={ing.required_quantity}
                  onChange={(e) => updateIngredient(idx, { required_quantity: e.target.value })}
                />
              </div>
              <div className="form-field" style={{ flex: '1 1 90px' }}>
                <label htmlFor={`ing-${idx}-unit`}>Unit</label>
                <input
                  id={`ing-${idx}-unit`}
                  value={ing.required_unit}
                  placeholder={type?.default_unit ?? 'g'}
                  onChange={(e) => updateIngredient(idx, { required_unit: e.target.value })}
                  maxLength={16}
                />
              </div>
              <div className="form-field" style={{ flex: '2 1 160px' }}>
                <label htmlFor={`ing-${idx}-note`}>Note</label>
                <input
                  id={`ing-${idx}-note`}
                  value={ing.note}
                  onChange={(e) => updateIngredient(idx, { note: e.target.value })}
                  placeholder="finely chopped"
                  maxLength={200}
                />
              </div>
              <label
                className="row"
                style={{ gap: '0.25rem', alignItems: 'center', marginBottom: '0.5rem' }}
              >
                <input
                  type="checkbox"
                  style={{ width: 'auto', minHeight: 'auto' }}
                  checked={ing.optional}
                  onChange={(e) => updateIngredient(idx, { optional: e.target.checked })}
                />
                <span>Optional</span>
              </label>
              <button
                type="button"
                onClick={() => setIngredients((prev) => prev.filter((_, i) => i !== idx))}
                disabled={ingredients.length === 1}
                aria-label={`Remove ingredient ${idx + 1}`}
              >
                Remove
              </button>
              {ingredientError(idx) ? (
                <small className="error" style={{ flexBasis: '100%' }}>
                  {ingredientError(idx)}
                </small>
              ) : null}
            </div>
          );
        })}
        <button type="button" onClick={() => setIngredients((prev) => [...prev, emptyIngredient()])}>
          + Add ingredient
        </button>
        {errors.ingredients ? (
          <small className="error">{errors.ingredients.join(' ')}</small>
        ) : null}
      </section>

      <section className="card stack">
        <h3 style={{ margin: 0 }}>Steps</h3>
        <div className="form-field">
          <label htmlFor="r-steps">One step per line</label>
          <textarea
            id="r-steps"
            rows={8}
            value={stepsText}
            onChange={(e) => setStepsText(e.target.value)}
            placeholder={'Whisk eggs and milk.\nAdd flour.\nCook on a hot pan.'}
          />
        </div>

        <div className="form-field">
          <label htmlFor="r-notes">Notes</label>
          <textarea
            id="r-notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={2000}
          />
        </div>
      </section>

      <div className="row" style={{ gap: '0.5rem' }}>
        <button className="primary" onClick={() => save.mutate()} disabled={save.isPending}>
          {isNew ? 'Create recipe' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}
