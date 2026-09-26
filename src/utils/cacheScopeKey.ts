/**
 * Build the canonical cache-refetch scope shared by the main-thread bootstrap and sync worker.
 *
 * Object keys are sorted recursively so equivalent primary keys produce the same scope even when
 * their insertion order differs between a mutation caller and a worker status message.
 */
export function cacheScopeKey(value: unknown): string {
  if(value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "";
  }
  if(Array.isArray(value)) {
    return `[${value.map(cacheScopeKey).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));

  return `{${entries.map(([key, entry]) =>
    `${JSON.stringify(key)}:${cacheScopeKey(entry)}`,).join(",")}}`;
}
