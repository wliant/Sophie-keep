export const clock = {
  nowIso: (): string => new Date().toISOString(),
  todayIso: (): string => new Date().toISOString().slice(0, 10),
  nowMs: (): number => Date.now(),
};
