import { describe, it, expect } from 'vitest';
import {
  isExpiredJS,
  isExpiringSoonJS,
  isLowStockJS,
} from '../src/services/alerts-service.js';

describe('alerts', () => {
  it('is_low_stock respects item override over type default', () => {
    expect(isLowStockJS(5, 10, 2)).toBe(true);
    expect(isLowStockJS(15, 10, 2)).toBe(false);
  });

  it('is_low_stock falls back to type default when item threshold null', () => {
    expect(isLowStockJS(2, null, 5)).toBe(true);
    expect(isLowStockJS(10, null, 5)).toBe(false);
  });

  it('is_low_stock returns false when no threshold defined', () => {
    expect(isLowStockJS(0, null, null)).toBe(false);
  });

  it('is_low_stock is true when quantity equals threshold', () => {
    expect(isLowStockJS(5, 5, null)).toBe(true);
  });

  it('is_expired requires strict past date', () => {
    expect(isExpiredJS('2025-01-01', '2026-04-17')).toBe(true);
    expect(isExpiredJS('2026-04-17', '2026-04-17')).toBe(false);
    expect(isExpiredJS(null, '2026-04-17')).toBe(false);
  });

  it('is_expiring_soon window inclusive, past excluded', () => {
    expect(isExpiringSoonJS('2026-04-20', '2026-04-17', 7)).toBe(true);
    expect(isExpiringSoonJS('2026-04-24', '2026-04-17', 7)).toBe(true);
    expect(isExpiringSoonJS('2026-04-25', '2026-04-17', 7)).toBe(false);
    expect(isExpiringSoonJS('2026-04-16', '2026-04-17', 7)).toBe(false);
  });
});
