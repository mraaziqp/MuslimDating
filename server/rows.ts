/** Normalises raw `db.execute` results across the Neon, node-postgres and PGlite drivers. */
export function rowsOf(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) {
    return result.rows as Record<string, unknown>[];
  }
  return [];
}

export function asString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export function asNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}
