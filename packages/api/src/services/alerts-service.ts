// Shared SQL fragments / JS predicates for derived flags (low-stock, expired, expiring-soon).
// Source of truth for is_* semantics used in search, dashboard, shopping.

export const EFFECTIVE_THRESHOLD_SQL = `COALESCE(items.low_stock_threshold, item_types.default_low_stock_threshold)`;

export const IS_LOW_STOCK_SQL = `
  CASE
    WHEN ${EFFECTIVE_THRESHOLD_SQL} IS NULL THEN 0
    WHEN items.quantity <= ${EFFECTIVE_THRESHOLD_SQL} THEN 1
    ELSE 0
  END
`;

export const IS_EXPIRED_SQL = `
  CASE
    WHEN items.expiration_date IS NULL THEN 0
    WHEN items.expiration_date < CURRENT_DATE::TEXT THEN 1
    ELSE 0
  END
`;

export function isExpiringSoonSQL(windowDays: number): string {
  return `
    CASE
      WHEN items.expiration_date IS NULL THEN 0
      WHEN items.expiration_date < CURRENT_DATE::TEXT THEN 0
      WHEN items.expiration_date <= (CURRENT_DATE + INTERVAL '${windowDays} days')::TEXT THEN 1
      ELSE 0
    END
  `;
}

export function isLowStockJS(
  quantity: number,
  itemThreshold: number | null,
  typeDefault: number | null,
): boolean {
  const t = itemThreshold ?? typeDefault;
  if (t == null) return false;
  return quantity <= t;
}

export function isExpiredJS(expirationDate: string | null, today: string): boolean {
  if (!expirationDate) return false;
  return expirationDate < today;
}

export function isExpiringSoonJS(
  expirationDate: string | null,
  today: string,
  windowDays: number,
): boolean {
  if (!expirationDate) return false;
  if (expirationDate < today) return false;
  const t = new Date(today + 'T00:00:00Z');
  t.setUTCDate(t.getUTCDate() + windowDays);
  const windowEnd = t.toISOString().slice(0, 10);
  return expirationDate <= windowEnd;
}
