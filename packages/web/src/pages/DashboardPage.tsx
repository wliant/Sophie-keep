import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { ItemWithDerived, PaginatedResponse } from '@sophie/shared';
import { endpoints, qk } from '../api/endpoints';
import { ItemRow } from '../components/ItemRow';

function useItems(query: Record<string, unknown>) {
  return useQuery<PaginatedResponse<ItemWithDerived>>({
    queryKey: qk.items(query),
    queryFn: () => endpoints.listItems(query),
  });
}

export function DashboardPage() {
  const expired = useItems({ expires_within_days: 0, sort: 'expiration_asc', page_size: 10 });
  const expiringSoon = useItems({ expires_within_days: 7, sort: 'expiration_asc', page_size: 20 });
  const lowStock = useItems({ low_stock_only: true, sort: 'quantity_asc', page_size: 20 });
  const recent = useItems({ sort: 'updated_desc', page_size: 10 });

  const filterOutExpired = (list?: ItemWithDerived[]) =>
    (list ?? []).filter((i) => i.is_expiring_soon && !i.is_expired);

  return (
    <div className="stack">
      <h2 style={{ marginTop: 0 }}>Dashboard</h2>

      <Widget
        title="Expired"
        link="/inventory?expires_within_days=0"
        items={(expired.data?.items ?? []).filter((i) => i.is_expired)}
        emptyMessage="Nothing expired."
      />
      <Widget
        title="Expiring soon"
        link="/inventory?expires_within_days=7"
        items={filterOutExpired(expiringSoon.data?.items)}
        emptyMessage="Nothing expiring in the next 7 days."
      />
      <Widget
        title="Low stock"
        link="/inventory?low_stock_only=true"
        items={(lowStock.data?.items ?? []).filter((i) => i.is_low_stock)}
        emptyMessage="No low-stock items."
      />

      <section className="card">
        <h3 style={{ marginTop: 0 }}>Recent additions</h3>
        <ul className="list">
          {(recent.data?.items ?? []).map((i) => (
            <ItemRow key={i.id} item={i} />
          ))}
          {!recent.data?.items?.length ? (
            <li className="muted">No items yet. Try Quick-add (press q).</li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}

function Widget({
  title,
  link,
  items,
  emptyMessage,
}: {
  title: string;
  link: string;
  items: ItemWithDerived[];
  emptyMessage: string;
}) {
  if (!items.length) {
    return (
      <section className="card">
        <h3 style={{ marginTop: 0 }}>{title}</h3>
        <div className="muted">{emptyMessage}</div>
      </section>
    );
  }
  return (
    <section className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0 }}>{title} ({items.length})</h3>
        <Link to={link}>View all</Link>
      </div>
      <ul className="list" style={{ marginTop: '0.75rem' }}>
        {items.slice(0, 5).map((i) => (
          <ItemRow key={i.id} item={i} />
        ))}
      </ul>
    </section>
  );
}
