// Clock is a mutable module-level object so tests can swap individual methods
// (e.g. `clock.todayIso = () => '2026-04-17'`) without threading a dependency
// through every caller. Production callers should treat it as frozen.

export interface Clock {
  nowIso(): string;
  todayIso(): string;
  nowMs(): number;
}

const realClock: Clock = {
  nowIso: () => new Date().toISOString(),
  todayIso: () => new Date().toISOString().slice(0, 10),
  nowMs: () => Date.now(),
};

export const clock: Clock = { ...realClock };

export function resetClock(): void {
  clock.nowIso = realClock.nowIso;
  clock.todayIso = realClock.todayIso;
  clock.nowMs = realClock.nowMs;
}
