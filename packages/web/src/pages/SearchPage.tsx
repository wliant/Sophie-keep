import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ItemWithDerived, PaginatedResponse } from '@sophie/shared';
import { api } from '../api/client';
import { ItemRow } from '../components/ItemRow';

export function SearchPage() {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 120);
    return () => clearTimeout(t);
  }, [q]);

  const items = useQuery<PaginatedResponse<ItemWithDerived>>({
    queryKey: ['items', { q: debounced }],
    queryFn: () => api.get('/api/v1/items', debounced ? { q: debounced, sort: 'relevance' } : { sort: 'updated_desc' }),
  });

  return (
    <div className="stack">
      <h2 style={{ marginTop: 0 }}>Search</h2>
      <div className="form-field">
        <label htmlFor="search-q">Search items</label>
        <input
          ref={inputRef}
          id="search-q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name or notes…"
          autoComplete="off"
        />
      </div>
      {items.isLoading ? (
        <div>Loading…</div>
      ) : items.data?.items?.length ? (
        <ul className="list">
          {items.data.items.map((i) => (
            <ItemRow key={i.id} item={i} />
          ))}
        </ul>
      ) : (
        <div className="card muted">
          No results. {q.trim() ? 'Try a different query.' : 'Start typing to search.'}
        </div>
      )}
    </div>
  );
}
