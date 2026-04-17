import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../api/client';
import { endpoints, qk, type ShoppingListResponse } from '../api/endpoints';
import { toast } from '../state/toast';

export function ShoppingListPage() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState('');

  const list = useQuery<ShoppingListResponse>({
    queryKey: qk.shopping,
    queryFn: endpoints.getShoppingList,
    refetchInterval: 30000,
  });

  const invalidateShopping = () => qc.invalidateQueries({ queryKey: qk.shopping });

  const addManual = useMutation({
    mutationFn: (label: string) => endpoints.addShoppingEntry(label),
    onSuccess: () => {
      setDraft('');
      invalidateShopping();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Add failed'),
  });

  const patchManual = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      endpoints.patchShoppingEntry(id, patch),
    onSuccess: invalidateShopping,
  });

  const deleteManual = useMutation({
    mutationFn: (id: string) => endpoints.deleteShoppingEntry(id),
    onSuccess: invalidateShopping,
  });

  const autoCheck = useMutation({
    mutationFn: (vars: { item_id: string; checked: boolean }) =>
      endpoints.setAutoCheck(vars.item_id, vars.checked),
    onSuccess: invalidateShopping,
  });

  const confirmRestock = useMutation({
    mutationFn: (payload: unknown) => endpoints.confirmRestock(payload as Record<string, unknown>),
    onSuccess: () => {
      invalidateShopping();
      qc.invalidateQueries({ queryKey: ['items'] });
      toast.success('Restock confirmed');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Restock failed'),
  });

  const clearChecked = useMutation({
    mutationFn: () => endpoints.clearChecked(),
    onSuccess: invalidateShopping,
  });

  if (list.isLoading) return <div>Loading…</div>;

  const autoEntries = list.data?.auto ?? [];
  const manualEntries = list.data?.manual ?? [];
  const checkedAuto = autoEntries.filter((a) => a.checked);
  const checkedManualIds = manualEntries.filter((m) => m.entry.checked).map((m) => m.entry.id);
  const totalToBuy = autoEntries.length + manualEntries.length;
  const totalChecked = checkedAuto.length + checkedManualIds.length;

  const handleConfirm = () => {
    if (!totalChecked) {
      toast.info('No entries checked.');
      return;
    }
    confirmRestock.mutate({
      items: checkedAuto.map((a) => ({
        item_id: a.item_id,
        action: a.reason === 'expired' ? 'update_expiry' : 'restock',
      })),
      manual_entry_ids: checkedManualIds,
    });
  };

  return (
    <div className="stack">
      <h2 style={{ marginTop: 0 }}>Shopping list</h2>
      <div className="muted">
        {totalToBuy} to buy · {totalChecked} checked
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim()) addManual.mutate(draft.trim());
        }}
      >
        <div className="row">
          <input
            aria-label="Add shopping entry"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add an item to buy…"
            maxLength={120}
          />
          <button className="primary" type="submit" disabled={!draft.trim() || addManual.isPending}>
            Add
          </button>
        </div>
      </form>

      {autoEntries.length ? (
        <section className="card stack">
          <h3 style={{ marginTop: 0 }}>Auto (low-stock + expired)</h3>
          <ul className="list">
            {autoEntries.map((entry) => (
              <li key={entry.item_id} className="row-card">
                <label className="row" style={{ flex: 1, gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    style={{ width: 'auto', minHeight: 'auto' }}
                    checked={entry.checked}
                    onChange={(e) =>
                      autoCheck.mutate({ item_id: entry.item_id, checked: e.target.checked })
                    }
                  />
                  <span>
                    <strong>{entry.item.name}</strong>
                    <br />
                    <small className="muted">{entry.reason_text}</small>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {manualEntries.length ? (
        <section className="card stack">
          <h3 style={{ marginTop: 0 }}>Manual</h3>
          <ul className="list">
            {manualEntries.map((m) => (
              <li key={m.entry.id} className="row-card">
                <label className="row" style={{ flex: 1, gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    style={{ width: 'auto', minHeight: 'auto' }}
                    checked={m.entry.checked}
                    onChange={(e) =>
                      patchManual.mutate({
                        id: m.entry.id,
                        patch: { checked: e.target.checked },
                      })
                    }
                  />
                  <span style={{ textDecoration: m.entry.checked ? 'line-through' : undefined }}>
                    {m.entry.label}
                  </span>
                </label>
                <button
                  aria-label={`Delete ${m.entry.label}`}
                  onClick={() => deleteManual.mutate(m.entry.id)}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!autoEntries.length && !manualEntries.length ? (
        <div className="card muted">Nothing on the list. Low-stock and expired items appear here automatically.</div>
      ) : null}

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button onClick={() => clearChecked.mutate()} disabled={!totalChecked}>
          Clear checked
        </button>
        <button
          className="primary"
          onClick={handleConfirm}
          disabled={!totalChecked || confirmRestock.isPending}
        >
          Confirm restock
        </button>
      </div>
    </div>
  );
}
