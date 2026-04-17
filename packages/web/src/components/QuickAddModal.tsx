import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../api/client';
import type { ItemType, Settings, StorageLocation } from '@sophie/shared';
import { toast } from '../state/toast';

interface AutoMatch {
  id: string;
  name: string;
  type_name: string | null;
  location_name: string | null;
  quantity: number;
  unit: string;
}

export function QuickAddModal({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [amount, setAmount] = useState(1);
  const [defaultsShown, setDefaultsShown] = useState(false);
  const [typeId, setTypeId] = useState<string | null>(null);
  const [locId, setLocId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const settings = useQuery<Settings>({
    queryKey: ['settings'],
    queryFn: () => api.get<Settings>('/api/v1/settings'),
  });
  const types = useQuery<{ items: ItemType[] }>({
    queryKey: ['item-types'],
    queryFn: () => api.get('/api/v1/item-types'),
  });
  const locations = useQuery<{ items: StorageLocation[] }>({
    queryKey: ['storage-locations'],
    queryFn: () => api.get('/api/v1/storage-locations'),
  });

  useEffect(() => {
    if (settings.data) {
      setTypeId((prev) => prev ?? settings.data.quick_add_default_type_id);
      setLocId((prev) => prev ?? settings.data.quick_add_default_location_id);
    }
  }, [settings.data]);

  const [debouncedQ, setDebouncedQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(query), 120);
    return () => clearTimeout(t);
  }, [query]);

  const autocomplete = useQuery<{ items: AutoMatch[] }>({
    queryKey: ['autocomplete', debouncedQ],
    queryFn: () =>
      debouncedQ
        ? api.get('/api/v1/items/autocomplete', { q: debouncedQ, limit: 5 })
        : Promise.resolve({ items: [] }),
    enabled: debouncedQ.length > 0,
  });

  const saveMut = useMutation({
    mutationFn: async (payload: {
      existing_item_id?: string;
      name?: string;
      item_type_id?: string;
      storage_location_id?: string;
      amount?: number;
    }) => api.post('/api/v1/quick-add', payload),
    onSuccess: (res) => {
      const created = (res as { created: boolean }).created;
      toast.success(created ? 'Item created' : 'Quantity incremented');
      qc.invalidateQueries({ queryKey: ['items'] });
      qc.invalidateQueries({ queryKey: ['autocomplete'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['settings'] });
      onClose();
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError) toast.error(err.message);
      else toast.error('Save failed');
    },
  });

  const handlePickMatch = (match: AutoMatch) => {
    saveMut.mutate({ existing_item_id: match.id, amount });
  };

  const handleSaveNew = () => {
    const needsDefaults =
      !typeId || !locId;
    if (needsDefaults) {
      setDefaultsShown(true);
      return;
    }
    saveMut.mutate({
      name: query.trim(),
      item_type_id: typeId!,
      storage_location_id: locId!,
      amount,
    });
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Quick add item"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal stack">
        <h2 style={{ margin: 0 }}>Quick add</h2>
        <div className="form-field">
          <label htmlFor="qa-name">Item name</label>
          <input
            ref={inputRef}
            id="qa-name"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g., paprika"
            autoComplete="off"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const first = autocomplete.data?.items?.[0];
                if (first) handlePickMatch(first);
                else if (query.trim()) handleSaveNew();
              }
            }}
          />
        </div>
        {autocomplete.data?.items?.length ? (
          <ul className="list" role="listbox" aria-label="Matching items">
            {autocomplete.data.items.map((m) => (
              <li key={m.id} className="row-card">
                <span>
                  <strong>{m.name}</strong>{' '}
                  <span className="muted">
                    {m.type_name ?? ''} · {m.location_name ?? ''} · {m.quantity} {m.unit}
                  </span>
                </span>
                <button className="primary" onClick={() => handlePickMatch(m)}>
                  +{amount}
                </button>
              </li>
            ))}
          </ul>
        ) : query.trim() ? (
          <div className="muted">No match — will create new.</div>
        ) : null}

        <div className="form-field">
          <label htmlFor="qa-amount">Count</label>
          <input
            id="qa-amount"
            type="number"
            min={0}
            step="any"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value) || 0)}
          />
        </div>

        {defaultsShown || !typeId || !locId ? (
          <>
            <div className="form-field">
              <label htmlFor="qa-type">Item type</label>
              <select
                id="qa-type"
                value={typeId ?? ''}
                onChange={(e) => setTypeId(e.target.value || null)}
              >
                <option value="">Select a type…</option>
                {types.data?.items.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="qa-loc">Storage location</label>
              <select
                id="qa-loc"
                value={locId ?? ''}
                onChange={(e) => setLocId(e.target.value || null)}
              >
                <option value="">Select a location…</option>
                {locations.data?.items.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
          </>
        ) : (
          <div className="muted" style={{ fontSize: '0.9rem' }}>
            Defaults: {types.data?.items.find((t) => t.id === typeId)?.name ?? '—'} ·{' '}
            {locations.data?.items.find((l) => l.id === locId)?.name ?? '—'}{' '}
            <button
              type="button"
              onClick={() => setDefaultsShown(true)}
              style={{
                border: 'none',
                background: 'transparent',
                color: 'var(--accent)',
                minHeight: 'auto',
                padding: 0,
              }}
            >
              change
            </button>
          </div>
        )}

        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={handleSaveNew} disabled={!query.trim() || saveMut.isPending}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
