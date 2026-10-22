/** Parses a number from an API field that may be a string, a number, empty or missing. */
export function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function round(value: number | null, digits = 2): number | null {
  if (value === null) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Percentage change from `previous` to `current`, or null when it cannot be computed. */
export function pctChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

export function isoFromMs(ms: unknown): string | null {
  const n = num(ms);
  return n && n > 0 ? new Date(n).toISOString() : null;
}

/** Settled-result helper: keeps the value, or records "<label>: <reason>" and returns null. */
export function settle<T>(label: string, result: PromiseSettledResult<T>, errors: string[]): T | null {
  if (result.status === "fulfilled") return result.value;
  const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
  errors.push(`${label}: ${reason}`);
  return null;
}
