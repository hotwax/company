/**
 * Pure projection + diff helpers for the local cache.
 *
 * Deliberately free of Dexie and Vue so every rule here is unit-testable without IndexedDB.
 * `appCacheDb.ts` is the only place that touches the database; this file decides *what* is
 * written and *which* rows are stale.
 */

import type { Entity } from "@common/db/defineEntity";
import type { DbKey, FieldKind } from "@common/db/types";
import { canonicalKey, toCount, toMillis, toText } from "@common/db/projection";

export type { FieldKind };
export { toCount, toMillis, toText };

/** A cached row: the indexed/normalized fields, plus the untouched server object. */
export interface CachedRow {
  [field: string]: unknown;
  raw: Record<string, unknown>;
  cachedAt: number;
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
const COERCE: Record<FieldKind, (value: unknown) => unknown> = {
  text: toText,
  count: toCount,
  date: toMillis,
  // Pass-through: arrays/objects survive intact. Empty arrays are dropped so the row stays sparse.
  structured: (value) => (Array.isArray(value) && value.length === 0 ? undefined : value ?? undefined),
};

/**
 * Project one raw server record into a cached row. Returns null when the record cannot be keyed —
 * for a compound key that means ANY member failed to project.
 *
 * Unlike the framework's `projectRow`, this keeps `raw` (the untouched server object) and stamps
 * `cachedAt`. 56 read sites across the app reach into `row.raw`, so that field is load-bearing.
 */
export function projectRow(
  raw: Record<string, unknown>,
  entity: Entity,
  now: number,
): CachedRow | null {
  const row: Record<string, unknown> = {};
  for (const [field, kind] of Object.entries(entity.fields)) {
    const source = raw?.[field] !== undefined ? field : entity.rename?.[field] ?? field;
    const value = COERCE[kind](raw?.[source]);
    if (value !== undefined) row[field] = value;
  }

  for (const field of entity.primaryKeyFields) {
    if (row[field] === undefined) return null;
  }

  return { ...row, raw, cachedAt: now } as CachedRow;
}

/** Project many records, dropping any without a usable key. */
export function projectRows(
  rawRows: Array<Record<string, unknown>>,
  entity: Entity,
  now: number,
): CachedRow[] {
  const rows: CachedRow[] = [];
  for (const raw of rawRows) {
    const row = projectRow(raw, entity, now);
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
  entity: Entity,
): boolean {
  return rawRows.length > 0 && projectRows(rawRows, entity, 0).length === 0;
}

/**
 * Keys to delete after a class-B snapshot sync: everything cached that the fresh full set no
 * longer contains. Without this, server-side deletions linger in the cache forever.
 */
export function diffStaleKeys(existingKeys: readonly DbKey[], freshKeys: readonly DbKey[]): DbKey[] {
  const fresh = new Set(freshKeys.map(canonicalKey));
  return existingKeys.filter((key) => !fresh.has(canonicalKey(key)));
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
