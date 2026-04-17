import { describe, it, expect } from 'vitest';
import { isShapeInBounds, isShapeInShape, validateShape } from '@sophie/shared';

describe('shape validation', () => {
  it('rejects rect with non-positive size', () => {
    const r = validateShape({ type: 'rect', x: 0, y: 0, w: 0, h: 10 });
    expect(r.ok).toBe(false);
  });
  it('accepts valid rect', () => {
    const r = validateShape({ type: 'rect', x: 0, y: 0, w: 10, h: 10 });
    expect(r.ok).toBe(true);
  });
  it('rejects polygon with <3 points', () => {
    const r = validateShape({ type: 'polygon', points: [[0, 0], [1, 1]] });
    expect(r.ok).toBe(false);
  });
});

describe('shape containment', () => {
  it('rect fits within larger rect', () => {
    expect(
      isShapeInShape({ type: 'rect', x: 10, y: 10, w: 50, h: 50 }, { type: 'rect', x: 0, y: 0, w: 100, h: 100 }),
    ).toBe(true);
  });
  it('rect partially outside larger rect is rejected', () => {
    expect(
      isShapeInShape({ type: 'rect', x: 80, y: 10, w: 50, h: 50 }, { type: 'rect', x: 0, y: 0, w: 100, h: 100 }),
    ).toBe(false);
  });
  it('isShapeInBounds respects plan dimensions', () => {
    expect(isShapeInBounds({ type: 'rect', x: 0, y: 0, w: 100, h: 100 }, 100, 100)).toBe(true);
    expect(isShapeInBounds({ type: 'rect', x: 0, y: 0, w: 101, h: 100 }, 100, 100)).toBe(false);
  });
});
