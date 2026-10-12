/**
 * Pure projection + diff helpers for the local cache.
 *
 * Deliberately free of Dexie and Vue so every rule here is unit-testable without IndexedDB.
 * `appCacheDb.ts` is the only place that touches the database; this file decides *what* is
 * written and *which* rows are stale.
 */

/** A cached row: the indexed/normalized fields, plus the untouched server object. */
export interface CachedRow {
  [field: string]: unknown;
  raw: Record<string, unknown>;
  cachedAt: number;
}

/** Coerce a server date field (epoch-millis number, numeric string, or ISO string) to millis. */
export function toMillis(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? undefined : parsed;
}

/** Coerce a server count field to a number, or undefined when absent/unparseable. */
export function toCount(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** Coerce to a trimmed string, or undefined when absent. */
export function toText(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  return text === "" ? undefined : text;
}

/** Coerce a server Boolean without turning it into the truthy strings `"true"` / `"false"`. */
export function toBoolean(value: unknown): boolean | undefined {
  if (value === true || value === false) { return value; }

  if (value === "true") { return true; }

  if (value === "false") { return false; }

  return undefined;
}

/**
 * Field kinds a cached entity can declare. The projector uses these to normalize server values
 * so the Dexie indexes are consistently typed (dates always millis, counts always numbers).
 *
 * `structured` passes arrays and objects through UNCHANGED. Needed because `text` runs `String()`,
 * which turns a nested payload like `serviceJobParameters` into `"[object Object],[object Object]"` —
 * silently destroying it. Only ever use `structured` for a field that is NOT indexed; Dexie stores it
 * fine via structured clone, but it cannot be a key path.
 */
export type FieldKind = "text" | "count" | "date" | "boolean" | "structured";

export interface EntityProjection {
  /** Primary-key field name on the cached row (must project to a non-empty string). */
  keyField: string;
  /** field name → how to coerce it. Every listed field is hoisted to the row's top level. */
  fields: Record<string, FieldKind>;
  /**
   * Optional synthetic key builder, for entities whose natural key is composite (e.g. a
   * date-effective association). Returns the value stored in `keyField`.
   */
  buildKey?: (raw: Record<string, unknown>) => string | undefined;
  /**
   * Cached-field name → the source field to read it from.
   *
   * For feeds that name a field differently from the entity the cache is modelling. The
   * `SYSTEM_MESSAGE_DATA_MANAGER_LOG` document calls the shop `remoteInternalId`; storing it as
   * `shopId` keeps the index name and every read site honest about what it is. The rename is applied
   * only when the cached name is absent from the raw row, so a feed that already uses the cached name
   * keeps working.
   */
  rename?: Record<string, string>;
}

const COERCE: Record<FieldKind, (value: unknown) => unknown> = {
  text: toText,
  count: toCount,
  date: toMillis,
  boolean: toBoolean,
  // Pass-through: arrays/objects survive intact. Empty arrays are dropped so the row stays sparse.
  structured: (value) => (Array.isArray(value) && value.length === 0 ? undefined : value ?? undefined),
};

/**
 * Project one raw server record into a cached row. Returns null when the record has no usable
 * primary key — callers skip those rather than writing an unaddressable row.
 */
export function projectRow(
  raw: Record<string, unknown>,
  projection: EntityProjection,
  now: number,
): CachedRow | null {
  const row: Record<string, unknown> = {};
  for (const [field, kind] of Object.entries(projection.fields)) {
    const source = raw?.[field] !== undefined ? field : projection.rename?.[field] ?? field;
    const value = COERCE[kind](raw?.[source]);
    if (value !== undefined) row[field] = value;
  }

  const key = projection.buildKey ? projection.buildKey(raw) : toText(raw?.[projection.keyField]);
  if (!key) return null;
  row[projection.keyField] = key;

  return { ...row, raw, cachedAt: now } as CachedRow;
}

/** Project many records, dropping any without a usable key. */
export function projectRows(
  rawRows: Array<Record<string, unknown>>,
  projection: EntityProjection,
  now: number,
): CachedRow[] {
  const rows: CachedRow[] = [];
  for (const raw of rawRows) {
    const row = projectRow(raw, projection, now);
    if (row) rows.push(row);
  }
  return rows;
}

/**
 * Is this date-effective row in force at `now`?
 *
 * Moqui models association lifetimes as `fromDate`/`thruDate` rather than deleting rows, and
 * whether an endpoint filters expired ones is per-endpoint, NOT a platform guarantee:
 * `oms/facilityGroups/{id}/facilities` filters them out, while `oms/facilities/identifications`
 * returns them. Verified live — closing an identification left it in the response, so the detail
 * page kept rendering a "removed" record and Remove looked like a no-op.
 *
 * Treat a `thruDate` exactly equal to `now` as expired: the close mutations stamp
 * `thruDate = DateTime.now().toMillis()`, and the row should disappear immediately.
 */
export function isEffectiveNow(row: Record<string, unknown> | undefined, now: number): boolean {
  const from = toMillis(row?.fromDate);
  const thru = toMillis(row?.thruDate);
  if (from !== undefined && from > now) return false;
  if (thru !== undefined && thru <= now) return false;
  return true;
}

/**
 * True when a fetch returned records but the projection can key NONE of them.
 *
 * A snapshot prunes by diffing cached keys against fetched keys, so this case is indistinguishable
 * from "the server has nothing here" and would delete the entire scope. It means the response held
 * the wrong entity (or the projection's field names drifted), never that the data is genuinely
 * gone — a real wipe traced to exactly this: a fan-out domain's refetch hit the PARENT list URL,
 * returned product stores instead of store↔facility links, and pruned all 17 rows.
 *
 * Callers should refuse to snapshot and warn rather than trust it.
 */
export function isUnkeyableFetch(
  rawRows: Array<Record<string, unknown>>,
  projection: EntityProjection,
): boolean {
  return rawRows.length > 0 && projectRows(rawRows, projection, 0).length === 0;
}

/**
 * Keys to delete after a class-B snapshot sync: everything cached that the fresh full set no
 * longer contains. Without this, server-side deletions linger in the cache forever.
 */
export function diffStaleKeys(existingKeys: readonly string[], freshKeys: readonly string[]): string[] {
  const fresh = new Set(freshKeys);
  return existingKeys.filter((key) => !fresh.has(key));
}

/**
 * The incremental-poll cursor: the newest value of `dateField` across the given rows, or
 * undefined when there is nothing cached for the scope yet.
 */
export function newestValue(rows: ReadonlyArray<Record<string, unknown>>, dateField: string): number | undefined {
  let newest: number | undefined;
  for (const row of rows) {
    const value = row?.[dateField];
    if (typeof value === "number" && (newest === undefined || value > newest)) newest = value;
  }
  return newest;
}

/**
 * Keep only records strictly newer than the cursor. Server-side date-range params are inclusive
 * of the boundary (verified for Moqui `_from`), so the boundary record comes back on every quiet
 * poll; this drops it so a quiet tick writes nothing.
 */
export function keepNewerThan(
  rawRows: Array<Record<string, unknown>>,
  dateField: string,
  cursor: number,
): Array<Record<string, unknown>> {
  return rawRows.filter((raw) => (toMillis(raw?.[dateField]) ?? 0) > cursor);
}
