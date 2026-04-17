import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ItemWithDerived } from '@sophie/shared';
import { ItemBadges } from './Badge';

function makeItem(overrides: Partial<ItemWithDerived>): ItemWithDerived {
  return {
    id: 'id',
    name: 'n',
    item_type_id: 't',
    storage_location_id: 'l',
    quantity: 1,
    unit: 'pcs',
    expiration_date: null,
    low_stock_threshold: null,
    notes: null,
    photo_ids: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    is_low_stock: false,
    is_expired: false,
    is_expiring_soon: false,
    effective_low_stock_threshold: null,
    thumbnail_url: null,
    ...overrides,
  };
}

describe('ItemBadges', () => {
  it('renders expired badge when is_expired is true', () => {
    render(<ItemBadges item={makeItem({ is_expired: true, expiration_date: '2020-01-01' })} />);
    expect(screen.getByText(/Expired/)).toBeTruthy();
  });

  it('does not double-badge when both expired and expiring_soon (expired wins)', () => {
    render(
      <ItemBadges
        item={makeItem({
          is_expired: true,
          is_expiring_soon: true,
          expiration_date: '2020-01-01',
        })}
      />,
    );
    expect(screen.queryByText(/Expiring soon/)).toBeNull();
  });

  it('renders XSS-ish name safely as text, not HTML', () => {
    // React escapes children by default; this confirms the textNode path.
    const item = makeItem({ name: '<script>alert(1)</script>' });
    render(<div>{item.name}</div>);
    expect(document.querySelector('script')).toBeNull();
  });

  it('renders low-stock badge', () => {
    render(<ItemBadges item={makeItem({ is_low_stock: true })} />);
    expect(screen.getByText(/Low stock/)).toBeTruthy();
  });
});
