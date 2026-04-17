import { describe, it, expect, afterEach } from 'vitest';
import { clock, resetClock } from '../src/util/clock.js';

describe('clock injection', () => {
  afterEach(() => resetClock());

  it('can be stubbed for deterministic tests', () => {
    clock.todayIso = () => '2030-01-15';
    clock.nowIso = () => '2030-01-15T12:00:00.000Z';
    expect(clock.todayIso()).toBe('2030-01-15');
    expect(clock.nowIso()).toBe('2030-01-15T12:00:00.000Z');
  });

  it('resetClock restores real behavior', () => {
    clock.todayIso = () => '2030-01-15';
    resetClock();
    const today = clock.todayIso();
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(today).not.toBe('2030-01-15');
  });
});
