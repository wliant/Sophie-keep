import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ItemWithDerived } from '@sophie/shared';
import { api } from '../api/client';
import { ItemBadges } from './Badge';

export function ItemRow({ item }: { item: ItemWithDerived }) {
  const qc = useQueryClient();
  const quantity = useMutation({
    mutationFn: (op: 'increment' | 'decrement') =>
      api.post(`/api/v1/items/${item.id}/quantity`, { op, amount: 1, reason: 'manual' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['items'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  return (
    <li className="row-card">
      <span className="row" style={{ flex: 1, minWidth: 0 }}>
        {item.thumbnail_url ? (
          <img src={item.thumbnail_url} alt="" className="photo-thumb" />
        ) : (
          <div className="photo-thumb" aria-hidden="true" />
        )}
        <span className="stack" style={{ gap: '0.15rem', minWidth: 0 }}>
          <Link to={`/inventory/${item.id}`} style={{ fontWeight: 500 }}>
            {item.name}
          </Link>
          <span className="muted" style={{ fontSize: '0.85rem' }}>
            {item.type_name ?? '—'} · {item.room_name ?? ''} {item.location_name ? `→ ${item.location_name}` : ''}
          </span>
          <ItemBadges item={item} />
        </span>
      </span>
      <span className="row" style={{ gap: '0.25rem' }}>
        <button
          aria-label={`Decrement ${item.name}`}
          onClick={() => quantity.mutate('decrement')}
          disabled={item.quantity <= 0 || quantity.isPending}
        >
          −
        </button>
        <span style={{ minWidth: '4rem', textAlign: 'center' }}>
          {item.quantity} {item.unit}
        </span>
        <button
          aria-label={`Increment ${item.name}`}
          onClick={() => quantity.mutate('increment')}
          disabled={quantity.isPending}
        >
          +
        </button>
      </span>
    </li>
  );
}
