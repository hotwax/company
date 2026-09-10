/**
 * Read a sync-run identifier from a route query without accepting arrays, control characters, or
 * unexpectedly large values. The identifier is only used for exact cached-record selection.
 */
export function getSafeSyncRunQueryId(value: unknown): string {
  const candidate = Array.isArray(value) ? value[0] : value
  if(typeof candidate !== "string" && typeof candidate !== "number") {return ""}

  const identifier = String(candidate).trim()
  if(!identifier || identifier.length > 255 || [...identifier].some((character) => {
    const codePoint = character.codePointAt(0) || 0

    return codePoint < 32 || codePoint === 127
  })) {return ""}

  return identifier
}
