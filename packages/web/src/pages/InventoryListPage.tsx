import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import type { ItemType, ItemWithDerived, PaginatedResponse, StorageLocation } from '@sophie/shared';
import { endpoints, qk } from '../api/endpoints';
import { flattenTypes } from '../api/itemTypeHierarchy';
import { ItemRow } from '../components/ItemRow';

const SORT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'updated_desc', label: 'Recently updated' },
  { value: 'name_asc', label: 'Name (A-Z)' },
  { value: 'name_desc', label: 'Name (Z-A)' },
  { value: 'expiration_asc', label: 'Expiring soonest' },
  { value: 'quantity_asc', label: 'Lowest quantity' },
];

export function InventoryListPage() {
  const [params, setParams] = useSearchParams();

  const queryObj = useMemo(() => {
    const obj: Record<string, unknown> = {};
    params.forEach((v, k) => {
      if (obj[k] === undefined) obj[k] = v;
      else obj[k] = Array.isArray(obj[k]) ? [...(obj[k] as string[]), v] : [obj[k] as string, v];
    });
    if (!obj.sort) obj.sort = 'updated_desc';
    if (!obj.page_size) obj.page_size = '50';
    return obj;
  }, [params]);

  const items = useQuery<PaginatedResponse<ItemWithDerived>>({
    queryKey: qk.items(queryObj),
    queryFn: () => endpoints.listItems(queryObj),
  });

  const types = useQuery<{ items: ItemType[] }>({
    queryKey: qk.itemTypes,
    queryFn: endpoints.listTypes,
  });
  const locations = useQuery<{ items: StorageLocation[] }>({
    queryKey: qk.locations,
    queryFn: () => endpoints.listLocations(),
  });

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    next.delete(key);
    if (value) next.set(key, value);
    next.delete('page');
    setParams(next);
  };

  const page = Number(params.get('page') ?? '1');
  const total = items.data?.total ?? 0;
  const totalPages = items.data?.total_pages ?? 1;

  return (
    <div className="stack">
      <h2 style={{ marginTop: 0 }}>Inventory</h2>
      <section className="card row" style={{ alignItems: 'end', flexWrap: 'wrap' }}>
        <div className="form-field" style={{ flex: '1 1 200px' }}>
          <label htmlFor="f-type">Type</label>
          <select
            id="f-type"
            value={(params.get('item_type_id') as string) ?? ''}
            onChange={(e) => setParam('item_type_id', e.target.value || null)}
          >
            <option value="">All types</option>
            {flattenTypes(types.data?.items ?? []).map((o) => (
              <option key={o.type.id} value={o.type.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="form-field" style={{ flex: '1 1 200px' }}>
          <label htmlFor="f-loc">Location</label>
          <select
            id="f-loc"
            value={(params.get('storage_location_id') as string) ?? ''}
            onChange={(e) => setParam('storage_location_id', e.target.value || null)}
          >
            <option value="">All locations</option>
            {locations.data?.items.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
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
            checked={params.get('low_stock_only') === 'true'}
            onChange={(e) => setParam('low_stock_only', e.target.checked ? 'true' : null)}
          />
          <span>Low stock only</span>
        </label>
      </section>

      {items.isLoading ? (
        <div>Loading…</div>
      ) : items.data?.items.length ? (
        <ul className="list">
          {items.data.items.map((i) => (
            <ItemRow key={i.id} item={i} />
          ))}
        </ul>
      ) : (
        <div className="card muted">
          No items match. <button onClick={() => setParams(new URLSearchParams())}>Clear filters</button>
        </div>
      )}

      {totalPages > 1 ? (
        <div className="row" role="navigation" aria-label="Pagination">
          <button
            onClick={() => setParam('page', String(Math.max(1, page - 1)))}
            disabled={page <= 1}
          >
            Previous
          </button>
          <span className="muted">
            Page {page} of {totalPages} ({total} items)
          </span>
          <button
            onClick={() => setParam('page', String(Math.min(totalPages, page + 1)))}
            disabled={page >= totalPages}
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}
