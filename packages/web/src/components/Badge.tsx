import type { ItemWithDerived } from '@sophie/shared';

export function ItemBadges({ item }: { item: ItemWithDerived }) {
  return (
    <span className="row" style={{ gap: '0.25rem' }}>
      {item.is_expired ? (
        <span className="badge danger" aria-label={`Expired on ${item.expiration_date}`}>
          ⚠ Expired
        </span>
      ) : null}
      {item.is_expiring_soon && !item.is_expired ? (
        <span className="badge warn" aria-label={`Expiring on ${item.expiration_date}`}>
          ⏰ Expiring soon
        </span>
      ) : null}
      {item.is_low_stock ? (
        <span className="badge low" aria-label="Low stock">
          ↓ Low stock
        </span>
      ) : null}
    </span>
  );
}
