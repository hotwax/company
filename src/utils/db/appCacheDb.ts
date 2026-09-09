import Dexie, { type Table, liveQuery, type Observable } from "dexie";
import { ensureDbReady } from "@common/db/baseDb";
import { dbClient } from "@common/db/dbClient";
import { companyDb } from "@/db/companyDb";
import type { Entity } from "@common/db/defineEntity";
import type { DbKey, QueryOptions } from "@common/db/types";
import { entityKeyOf } from "@common/db/projection";
import {
  type CachedRow,
  diffStaleKeys,
  newestValue,
  projectRows,
} from "./cacheProjection";

/**
 * The entity layer over Company's local read cache (IndexedDB via Dexie).
 *
 * The database itself — one Dexie instance per OMS instance, schema composed from seed entities
 * plus Company's own tables — is declared in `@/db/companyDb` and opened lazily through
 * `companyDb.raw()`. This file only builds the per-table operations every sync domain needs on
 * top of that handle.
 *
 * The worker writes; the main thread reads through `live()` (Dexie broadcasts every commit over
 * a BroadcastChannel, so main-thread liveQuery subscriptions re-emit without any postMessage).
 * The cache is durable: it survives view exit and full reloads, so returning to a view renders
 * instantly from IndexedDB and revalidates in the background. It is cleared on logout only.
 */

/** Table names that exist in the cache. */
export const CACHE_TABLES = [...companyDb.tableNames, "syncMeta"] as const;
export type CacheTableName = string;


/**
 * How a view narrows a cached table.
 *
 * `scope` + `dateField` are resolved through a COMPOUND index when one is declared for that exact
 * pair — `[scopeField+dateField]` — so the newest-N query is an index range read rather than a
 * fetch-everything-then-sort. `equals` adds a second equality (e.g. remote + message type) and uses
 * `[a+b+date]` when available. Anything not expressible as an index (a status set, an arbitrary
 * predicate) goes in `filter`, which runs inside the same `liveQuery` and stays reactive.
 */
export interface LiveQueryOptions {
  /** Sort descending by this date field. */
  dateField?: string;
  /** Primary partition, e.g. `{ field: "systemMessageRemoteId", value: remoteId }`. */
  scope?: { field: string; value: unknown };
  /** Additional equality narrowing, e.g. `{ systemMessageTypeId: "BulkQueryShopifyProductUpdates" }`. */
  equals?: Record<string, unknown>;
  /** Anything an index cannot express. Applied after the index read, before sort/limit. */
  filter?: (row: CachedRow) => boolean;
  /** Keep only the first N rows after sorting — the "newest 10" case. */
  limit?: number;
}

export interface CachedEntity {
  readonly table: CacheTableName;
  /** Upsert raw server records (insert-or-replace by primary key). Returns rows written. */
  upsertMany(rawRows: Array<Record<string, unknown>>): Promise<number>;
  /**
   * Class-B snapshot: replace the whole (optionally scoped) set — upsert the fresh rows and
   * delete cached rows the server no longer returns, in one transaction.
   */
  snapshotReplace(
    rawRows: Array<Record<string, unknown>>,
    scope?: { field: string; value: unknown },
  ): Promise<{ written: number; pruned: number }>;
  /**
   * Newest cached value of `dateField`, optionally scoped — the incremental-poll cursor.
   *
   * `equals` narrows further (e.g. one message type within one remote) and resolves through the
   * `[scope+equals+date]` compound index when one is declared, so a per-(scope, type) cursor is an
   * index seek rather than a scan of the whole table.
   */
  newestCursor(
    dateField: string,
    scope?: { field: string; value: unknown },
    equals?: Record<string, unknown>,
  ): Promise<number | undefined>;
  /**
   * Cached rows where `dateField` is absent (e.g. logs with no finish time) — refresh targets.
   *
   * `since` bounds the candidate set by AGE, which is what keeps this from growing without limit:
   * a row that will never gain `dateField` (an errored message never gets a `processedDate`) would
   * otherwise stay a refresh target forever, and each target costs one request on every tick.
   */
  rowsMissing(
    dateField: string,
    options?: { limit?: number; since?: { field: string; afterMs: number } },
  ): Promise<CachedRow[]>;
  /**
   * How many rows a scope currently holds — the backfill test.
   *
   * A cursor-driven domain only ever asks for page 0 once it has a cursor, so a window that was first
   * synced shallow stays shallow forever and raising its configured depth does nothing. Comparing this
   * against the target is what tells a domain to page deeper.
   */
  count(scope?: { field: string; value: unknown }, equals?: Record<string, unknown>): Promise<number>;
  /** Remove one row by primary key (used after a delete mutation). */
  remove(key: DbKey): Promise<void>;
  /** Live, reactive view of the table, newest `dateField` first when given. */
  live(options?: LiveQueryOptions): Observable<CachedRow[]>;
  /** All rows, one shot. */
  all(): Promise<CachedRow[]>;
  clear(): Promise<void>;
}

/** Dexie names a compound index `[a+b]`; normalize before comparing against a declared key path. */
function normalizeIndexName(name: string): string {
  return name.replace(/\s+/g, "");
}

// NO `versionchange` / `blocked` handlers here — deliberately. Dexie's own defaults are correct and
// adding ours on top was actively harmful.
//
// `db.close()` called with NO ARGUMENTS defaults to `{ disableAutoOpen: true }`, which sets
// `autoOpen = false` and parks a permanent `DatabaseClosedError` on the connection. Dexie's built-in
// handler already closes with `{ disableAutoOpen: false }` (so the handle recovers), and these events
// are additive — ours ran *after* Dexie's and downgraded a recoverable close into a permanent one.
//
// Measured on real Dexie 4.4.3 + real IndexedDB, two connections (main thread + worker), where the
// second connection declares one extra store — i.e. ANY edit to `CACHE_SCHEMA`:
//
//   with our handlers : read/write -> DatabaseClosedError forever; autoOpen=false;
//                       the liveQuery went SILENT (its `error` callback never even fired, so the
//                       page froze on stale rows with nothing logged anywhere)
//   Dexie defaults    : read OK, write OK, liveQuery kept emitting through the version bump
//
// That is the whole mechanism behind "every write failed while fetches kept succeeding": the schema
// edit was never the problem, closing our own handle in response to it was.
//
// Closing on `blocked` was wrong on its own terms too: `blocked` fires on the connection that is
// itself being blocked by someone else, so closing yourself cannot unblock anything — it only
// disables auto-open.

/**
 * Bind a projection to a cache table, yielding the operations every sync domain needs. This is
 * the seam that keeps domain code free of Dexie: a domain declares its fields and gets storage.
 */
export function cachedEntity(table: CacheTableName): CachedEntity {
  const entity = (companyDb.entities as any)[table];
  if (!entity) {
    throw new Error(`[db] No entity definition found in companyDb for table "${table}".`);
  }
  return defineCachedEntity(table, entity);
}

export function defineCachedEntity(table: CacheTableName, entity: Entity): CachedEntity {
  const dexieTable = () => (companyDb.raw() as any)[table] as Table<CachedRow, DbKey>;
  const client = () => dbClient(companyDb.raw());

  return {
    table,

    async upsertMany(rawRows) {
      const rows = projectRows(rawRows, entity, Date.now());
      if (rows.length) await client().bulkPut(table, rows);
      return rows.length;
    },

    async snapshotReplace(rawRows, scope) {
      const rows = projectRows(rawRows, entity, Date.now());
      let pruned = 0;
      await client().transaction("rw", [table], async () => {
        const existingKeys = (scope
          ? await dexieTable().where(scope.field).equals(scope.value as any).primaryKeys()
          : await dexieTable().toCollection().primaryKeys()) as DbKey[];

        const freshKeys: DbKey[] = [];
        for (const row of rows) {
          const key = entityKeyOf(row, entity);
          if (key !== undefined) freshKeys.push(key);
        }

        const stale = diffStaleKeys(existingKeys, freshKeys);
        if (stale.length) {
          await client().bulkRemove(table, stale);
          pruned = stale.length;
        }
        if (rows.length) await client().bulkPut(table, rows);
      });
      return { written: rows.length, pruned };
    },

    async newestCursor(dateField, scope, equals) {
      const tableRef = dexieTable();
      const equalityFields = equals ? Object.keys(equals) : [];

      if (scope && equalityFields.length) {
        // Prefer `[scope+...equals+date]` — one index seek for the newest row of this partition.
        const path = `[${[scope.field, ...equalityFields, dateField].join("+")}]`;
        const indexed = (tableRef.schema.indexes ?? []).some(
          (index: any) => normalizeIndexName(index?.name ?? "") === path,
        );
        const prefix = [scope.value, ...equalityFields.map((field) => equals![field])];
        if (indexed) {
          const newest = await tableRef
            .where(path)
            .between([...prefix, -Infinity], [...prefix, Infinity])
            .last();
          return newest?.[dateField] as number | undefined;
        }
        const rows = (await tableRef.where(scope.field).equals(scope.value as any).toArray())
          .filter((row) => equalityFields.every((field) => row[field] === equals![field]));
        return newestValue(rows, dateField);
      }

      if (scope) {
        // Scoped: walk the scoped rows (small by construction) and take the max.
        const rows = await tableRef.where(scope.field).equals(scope.value as any).toArray();
        return newestValue(rows, dateField);
      }

      if (equalityFields.length) {
        // No partition, but still narrowed (e.g. one message type across all remotes). Seek on the
        // first equality field when it is indexed, then apply the rest in memory.
        const [first, ...rest] = equalityFields;
        const firstIndexed = (tableRef.schema.indexes ?? []).some(
          (index: any) => normalizeIndexName(index?.name ?? "") === first,
        );
        const rows = firstIndexed
          ? await tableRef.where(first).equals(equals![first] as any).toArray()
          : await client().all(table);
        const narrowed = rows.filter((row) =>
          (firstIndexed ? rest : equalityFields).every((field) => row[field] === equals![field]));
        return newestValue(narrowed, dateField);
      }

      const newest = await tableRef.orderBy(dateField).last();
      return newest?.[dateField] as number | undefined;
    },

    async rowsMissing(dateField, options = {}) {
      const { limit = 50, since } = options;
      const tableRef = dexieTable();

      // Bound by age through the index when we can, so this is a range read rather than a scan of
      // every cached row. Rows with no `since` value at all are excluded: without one there is no
      // way to tell a still-in-flight record from an abandoned one.
      const indexed = since
        ? (tableRef.schema.indexes ?? []).some(
            (index: any) => normalizeIndexName(index?.name ?? "") === since.field,
          )
        : false;

      const collection = since && indexed
        ? tableRef.where(since.field).above(since.afterMs)
        : tableRef.toCollection();

      const rows = await collection
        .filter((row) => {
          if (row[dateField] !== undefined) return false;
          if (!since || indexed) return true;
          const stamp = row[since.field];
          return typeof stamp === "number" && stamp > since.afterMs;
        })
        .limit(limit)
        .toArray();

      return rows;
    },

    async count(scope, equals) {
      const rows = await client().all(table);
      return rows.filter((row: any) => {
        if (scope && String(row?.[scope.field]) !== String(scope.value)) return false;
        for (const [field, value] of Object.entries(equals ?? {})) {
          if (String(row?.[field]) !== String(value)) return false;
        }
        return true;
      }).length;
    },

    async remove(key) {
      await client().remove(table, key);
    },

    live(options: LiveQueryOptions = {}) {
      const { dateField, scope, equals, filter, limit } = options;

      return liveQuery(async () => {
        const tableRef = dexieTable();
        const equalityFields = equals ? Object.keys(equals) : [];

        /** An index exists for this exact key path, so the read can be a range scan. */
        const hasIndex = (path: string) =>
          (tableRef.schema.indexes ?? []).some((index: any) => normalizeIndexName(index?.name ?? "") === path);

        let rows: CachedRow[];

        if (scope) {
          // Prefer the widest compound index that covers scope + equalities (+ the date, which
          // gives sorted output for free).
          const compoundWithDate = `[${[scope.field, ...equalityFields, dateField].filter(Boolean).join("+")}]`;
          const compound = `[${[scope.field, ...equalityFields].join("+")}]`;

          if (dateField && equalityFields.length && hasIndex(compoundWithDate)) {
            // Range over [scope, ...equals, *] — every row of this partition, index-ordered by date.
            const prefix = [scope.value, ...equalityFields.map((field) => equals![field])];
            rows = await tableRef
              .where(compoundWithDate)
              .between([...prefix, -Infinity], [...prefix, Infinity])
              .reverse()
              .toArray();
          } else if (equalityFields.length && hasIndex(compound)) {
            rows = await tableRef
              .where(compound)
              .equals([scope.value, ...equalityFields.map((field) => equals![field])] as any)
              .toArray();
          } else if (dateField && !equalityFields.length && hasIndex(`[${scope.field}+${dateField}]`)) {
            rows = await tableRef
              .where(`[${scope.field}+${dateField}]`)
              .between([scope.value, -Infinity], [scope.value, Infinity])
              .reverse()
              .toArray();
          } else {
            rows = await tableRef.where(scope.field).equals(scope.value as any).toArray();
            // Equalities the index could not absorb still have to hold.
            if (equalityFields.length) {
              rows = rows.filter((row) =>
                equalityFields.every((field) => row[field] === equals![field]));
            }
          }
        } else if (dateField) {
          rows = await tableRef.orderBy(dateField).reverse().toArray();
          if (equalityFields.length) {
            rows = rows.filter((row) => equalityFields.every((field) => row[field] === equals![field]));
          }
        } else {
          rows = await client().all(table);
          if (equalityFields.length) {
            rows = rows.filter((row) => equalityFields.every((field) => row[field] === equals![field]));
          }
        }

        if (filter) rows = rows.filter(filter);

        // Re-sort only when the index did not already deliver date order.
        const indexOrdered = Boolean(
          scope && dateField && (
            hasIndex(`[${[scope.field, ...equalityFields, dateField].filter(Boolean).join("+")}]`) ||
            (!equalityFields.length && hasIndex(`[${scope.field}+${dateField}]`))
          ),
        );
        if (dateField && !indexOrdered) {
          rows = [...rows].sort((a, b) => ((b[dateField] as number) ?? 0) - ((a[dateField] as number) ?? 0));
        }

        return typeof limit === "number" ? rows.slice(0, limit) : rows;
      });
    },

    all() {
      return client().all(table);
    },

    async clear() {
      await client().clear(table);
    },
  };
}

/**
 * Wipe every cached table. Called on logout — the cache is not persisted across sessions yet
 * (cross-session / cross-tab caches are later-stage work), so one user's data never surfaces
 * in another's session.
 */
export async function clearAllCaches(): Promise<void> {
  const client = dbClient(companyDb.raw());
  await Promise.all(client.tableNames().map((table) => client.clear(table)));
}

/** Drop the superseded fixed-name cache databases, if present. */
export async function deleteLegacyCaches(): Promise<void> {
  // Best-effort cleanup; a failure here must never block app start, and one database's
  // failure must never prevent the other from being attempted.
  await Promise.allSettled([
    Dexie.delete("DataManagerLogCacheDB"),
    Dexie.delete("CompanyCacheDB"),
  ]);
}


// ---------------------------------------------------------------------------------------------
// Sync bookkeeping: "already synced for this login" markers + the cache identity stamp.
//
// Reference data syncs once per LOGIN, not per page load. A browser refresh keeps the session but
// wipes all JS state, so the marker has to live in the cache itself. Logout clears every table
// (including these markers), so the next login re-syncs from scratch with no timers involved.
// ---------------------------------------------------------------------------------------------

const DOMAIN_MARKER_PREFIX = "domain:";
const IDENTITY_KEY = "identity";

/** Has this domain already synced for the current login? */
export async function hasSyncedThisLogin(domain: string): Promise<boolean> {
  await ensureDbReady(companyDb.raw());
  const row = await dbClient(companyDb.raw()).get("syncMeta", DOMAIN_MARKER_PREFIX + domain);
  return !!row;
}

export async function markSyncedThisLogin(domain: string): Promise<void> {
  await dbClient(companyDb.raw()).put("syncMeta", { key: DOMAIN_MARKER_PREFIX + domain, syncedAt: Date.now() });
}

/** Drop every domain marker so the next pass re-snapshots (used by a manual resync). */
export async function clearSyncMarkers(): Promise<void> {
  await ensureDbReady(companyDb.raw());
  const client = dbClient(companyDb.raw());
  const keys = await companyDb.raw().syncMeta.toCollection().primaryKeys();
  const domainKeys = (keys as string[]).filter((key) => key.startsWith(DOMAIN_MARKER_PREFIX));
  if (domainKeys.length) await client.bulkRemove("syncMeta", domainKeys);
}

/**
 * Bind the cache to one identity (user + backend instance) and WIPE it when that changes.
 *
 * Required because a stale cache can outlive a login: if the browser closes or the session expires
 * without a logout, `postLogout()` never runs and the cache survives. Without this check the next
 * login — possibly a different user or a different OMS instance — would skip syncing and read the
 * previous session's reference data. Returns true when the cache was wiped.
 */
export async function ensureCacheIdentity(identity: string): Promise<boolean> {
  await ensureDbReady(companyDb.raw());
  const client = dbClient(companyDb.raw());
  const stored = await client.get<{ key: string; identity: string; at: number }>("syncMeta", IDENTITY_KEY);
  if (stored?.identity === identity) return false;
  await clearAllCaches();
  await client.put("syncMeta", { key: IDENTITY_KEY, identity, at: Date.now() });
  return true;
}

