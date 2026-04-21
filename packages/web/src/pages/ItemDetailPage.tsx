import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import type { ItemType, StorageLocation } from '@sophie/shared';
import { ApiError } from '../api/client';
import { endpoints, qk, type ItemDetailResponse } from '../api/endpoints';
import { flattenTypes } from '../api/itemTypeHierarchy';
import { toast } from '../state/toast';
import { ItemBadges } from '../components/Badge';

export function ItemDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);

  const item = useQuery<ItemDetailResponse>({
    queryKey: qk.item(id),
    queryFn: () => endpoints.getItem(id),
  });
  const types = useQuery<{ items: ItemType[] }>({
    queryKey: qk.itemTypes,
    queryFn: endpoints.listTypes,
  });
  const locations = useQuery<{ items: StorageLocation[] }>({
    queryKey: qk.locations,
    queryFn: () => endpoints.listLocations(),
  });

  const invalidateItems = () => {
    qc.invalidateQueries({ queryKey: ['items'] });
  };

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) => endpoints.patchItem(id, body),
    onSuccess: () => {
      invalidateItems();
      toast.success('Saved');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Save failed'),
  });

  const setQty = useMutation({
    mutationFn: (amount: number) =>
      endpoints.adjustQuantity(id, { op: 'set', amount, reason: 'manual' }),
    onSuccess: invalidateItems,
  });

  const adjustQty = useMutation({
    mutationFn: (op: 'increment' | 'decrement') =>
      endpoints.adjustQuantity(id, { op, amount: 1, reason: 'manual' }),
    onSuccess: invalidateItems,
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Update failed'),
  });

  const deleteItem = useMutation({
    mutationFn: () => endpoints.deleteItem(id),
    onSuccess: () => {
      invalidateItems();
      toast.success('Deleted');
      navigate('/inventory');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Delete failed'),
  });

  const upload = useMutation({
    mutationFn: (files: File[]) => endpoints.uploadPhotos('item', id, files),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.item(id) });
      invalidateItems();
      toast.success('Photo uploaded');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Upload failed'),
  });

  const deletePhoto = useMutation({
    mutationFn: (photoId: string) => endpoints.deletePhoto(photoId),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.item(id) }),
  });

  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState<string | null>(null);

  if (item.isLoading) return <div>Loading…</div>;
  if (item.isError || !item.data) {
    return (
      <div className="card">
        <h2>Item not found</h2>
        <button onClick={() => navigate('/inventory')}>Back to Inventory</button>
      </div>
    );
  }

  const d = item.data;

  return (
    <div className="stack">
      <div className="row">
        <button onClick={() => navigate(-1)} aria-label="Back">
          ← Back
        </button>
        <h2 style={{ margin: 0 }}>{d.name}</h2>
        <ItemBadges item={d} />
      </div>

      <section className="card stack">
        <div className="form-field">
          <label htmlFor="name">Name</label>
          <input
            id="name"
            value={nameDraft ?? d.name}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={() => {
              if (nameDraft !== null && nameDraft !== d.name) {
                patch.mutate({ name: nameDraft, base_updated_at: d.updated_at });
              }
              setNameDraft(null);
            }}
          />
        </div>

        <div className="row">
          <div className="form-field" style={{ flex: 1 }}>
            <label htmlFor="type">Type</label>
            <select
              id="type"
              value={d.item_type_id}
              onChange={(e) =>
                patch.mutate({ item_type_id: e.target.value, base_updated_at: d.updated_at })
              }
            >
              {flattenTypes(types.data?.items ?? []).map((o) => (
                <option key={o.type.id} value={o.type.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field" style={{ flex: 1 }}>
            <label htmlFor="loc">Location</label>
            <select
              id="loc"
              value={d.storage_location_id}
              onChange={(e) =>
                patch.mutate({
                  storage_location_id: e.target.value,
                  base_updated_at: d.updated_at,
                })
              }
            >
              {locations.data?.items.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="row">
          <button onClick={() => adjustQty.mutate('decrement')} disabled={d.quantity <= 0}>
            −
          </button>
          <input
            aria-label="Quantity"
            type="number"
            min={0}
            step="any"
            value={d.quantity}
            onChange={(e) => setQty.mutate(Number(e.target.value) || 0)}
            style={{ width: '6rem' }}
          />
          <span>{d.unit}</span>
          <button onClick={() => adjustQty.mutate('increment')}>+</button>
        </div>

        <div className="row">
          <div className="form-field" style={{ flex: 1 }}>
            <label htmlFor="exp">Expiration date</label>
            <input
              id="exp"
              type="date"
              value={d.expiration_date ?? ''}
              onChange={(e) =>
                patch.mutate({
                  expiration_date: e.target.value || null,
                  base_updated_at: d.updated_at,
                })
              }
            />
          </div>
          <div className="form-field" style={{ flex: 1 }}>
            <label htmlFor="threshold">Low-stock threshold</label>
            <input
              id="threshold"
              type="number"
              min={0}
              step="any"
              placeholder={
                d.effective_low_stock_threshold != null
                  ? `${d.effective_low_stock_threshold} (type default)`
                  : '(none)'
              }
              value={d.low_stock_threshold ?? ''}
              onChange={(e) =>
                patch.mutate({
                  low_stock_threshold: e.target.value === '' ? null : Number(e.target.value),
                  base_updated_at: d.updated_at,
                })
              }
            />
            <small className="muted">
              {d.low_stock_threshold != null
                ? 'Set on this item'
                : d.effective_low_stock_threshold != null
                  ? `Inherited from type ${d.type_name}`
                  : 'No threshold set'}
            </small>
          </div>
        </div>

        <div className="form-field">
          <label htmlFor="notes">Notes</label>
          <textarea
            id="notes"
            rows={3}
            maxLength={2000}
            value={notesDraft ?? d.notes ?? ''}
            onChange={(e) => setNotesDraft(e.target.value)}
            onBlur={() => {
              if (notesDraft !== null && notesDraft !== (d.notes ?? '')) {
                patch.mutate({ notes: notesDraft || null, base_updated_at: d.updated_at });
              }
              setNotesDraft(null);
            }}
          />
        </div>
      </section>

      <section className="card stack">
        <h3 style={{ marginTop: 0 }}>Photos</h3>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {d.photo_ids.map((pid) => (
            <div key={pid} style={{ position: 'relative', width: 100, height: 100 }}>
              <img
                src={`/api/v1/photos/${pid}?variant=thumb`}
                alt="Photo"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  borderRadius: 'var(--radius-sm)',
                }}
              />
              <button
                aria-label="Delete photo"
                onClick={() => deletePhoto.mutate(pid)}
                style={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  minHeight: 28,
                  minWidth: 28,
                  padding: 0,
                }}
              >
                ×
              </button>
            </div>
          ))}
          <button onClick={() => fileInput.current?.click()} aria-label="Add photo">
            + Photo
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              if (e.target.files && e.target.files.length) {
                upload.mutate(Array.from(e.target.files));
              }
              e.target.value = '';
            }}
          />
        </div>
      </section>

      <section className="card">
        <h3 style={{ marginTop: 0 }}>Recent changes</h3>
        {d.quantity_changes.length ? (
          <table className="data">
            <thead>
              <tr>
                <th>When</th>
                <th>Delta</th>
                <th>Quantity</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {d.quantity_changes.map((c) => (
                <tr key={c.id}>
                  <td>{new Date(c.created_at).toLocaleString()}</td>
                  <td>{c.delta > 0 ? `+${c.delta}` : c.delta}</td>
                  <td>{c.new_quantity}</td>
                  <td>{c.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="muted">No changes yet.</div>
        )}
      </section>

      <section className="card row" style={{ justifyContent: 'flex-end' }}>
        <button
          className="danger"
          onClick={() => {
            if (confirm(`Delete "${d.name}"? This cannot be undone.`)) deleteItem.mutate();
          }}
        >
          Delete item
        </button>
      </section>
    </div>
  );
}
