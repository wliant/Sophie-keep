import { describe, it, expect } from 'vitest';
import { _internal } from '../src/services/types-service.js';

// Minimal fake Db that serves item_types.parent_id lookups from an in-memory
// map. Only the single query used by assertParentUsable/isDescendantOf is
// supported; unknown ids return an empty row set (which callers treat as
// "item_type not found").
function fakeDb(parents: Record<string, string | null>): Parameters<typeof _internal.assertParentUsable>[0] {
  return {
    async query(_sql: string, params: unknown[]) {
      const id = params[0] as string;
      if (!(id in parents)) return { rows: [] };
      return { rows: [{ parent_id: parents[id] }] };
    },
  } as Parameters<typeof _internal.assertParentUsable>[0];
}

describe('assertParentUsable', () => {
  it('accepts null (no parent)', async () => {
    const db = fakeDb({});
    await expect(_internal.assertParentUsable(db, null, null)).resolves.toBeUndefined();
  });

  it('accepts a valid non-cycling parent chain', async () => {
    // grocery -> null, meat -> grocery
    const db = fakeDb({ grocery: null, meat: 'grocery' });
    await expect(_internal.assertParentUsable(db, 'meat', null)).resolves.toBeUndefined();
  });

  it('rejects self-reference on create', async () => {
    const db = fakeDb({ a: null });
    await expect(_internal.assertParentUsable(db, 'a', 'a')).rejects.toMatchObject({
      code: 'SEMANTIC_ERROR',
    });
  });

  it('rejects setting parent to a descendant (patch cycle)', async () => {
    // a -> null, b -> a. Patching a.parent_id = b would create a->b->a cycle.
    const db = fakeDb({ a: null, b: 'a' });
    await expect(_internal.assertParentUsable(db, 'b', 'a')).rejects.toMatchObject({
      code: 'SEMANTIC_ERROR',
    });
  });

  it('rejects a chain that exceeds the max hierarchy depth', async () => {
    const chain: Record<string, string | null> = { l0: null };
    for (let i = 1; i <= 10; i++) {
      chain[`l${i}`] = `l${i - 1}`;
    }
    const db = fakeDb(chain);
    await expect(_internal.assertParentUsable(db, 'l9', null)).rejects.toMatchObject({
      code: 'SEMANTIC_ERROR',
    });
  });
});

describe('isDescendantOf', () => {
  it('returns true when the candidate is the ancestor itself', async () => {
    const db = fakeDb({ a: null });
    expect(await _internal.isDescendantOf(db, 'a', 'a')).toBe(true);
  });

  it('returns true when the candidate is a direct child', async () => {
    const db = fakeDb({ a: null, b: 'a' });
    expect(await _internal.isDescendantOf(db, 'a', 'b')).toBe(true);
  });

  it('returns true for a multi-level descendant', async () => {
    // a -> b -> c -> d
    const db = fakeDb({ a: null, b: 'a', c: 'b', d: 'c' });
    expect(await _internal.isDescendantOf(db, 'a', 'd')).toBe(true);
  });

  it('returns false when the candidate is unrelated', async () => {
    const db = fakeDb({ a: null, b: null, c: 'b' });
    expect(await _internal.isDescendantOf(db, 'a', 'c')).toBe(false);
  });

  it('returns false when the candidate is an ancestor of the queried id', async () => {
    const db = fakeDb({ a: null, b: 'a' });
    // mergeType: prevents cycle when asked "is target a descendant of source?"
    expect(await _internal.isDescendantOf(db, 'b', 'a')).toBe(false);
  });
});
