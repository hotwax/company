import { appCacheDb, type CacheTableName, defineCachedEntity, hasSyncedThisLogin, markSyncedThisLogin } from "@/utils/appCacheDb";
import { isUnkeyableFetch, type EntityProjection } from "@/utils/cacheProjection";
import { registerSyncDomain, type SyncContext } from "../syncRegistry";
import { pageAll, unwrapCollection, workerGet } from "./workerFetch";

/**
 * Factory for class-B (reference/config) sync domains.
 *
 * Class B is small, bounded, and changes only when a human edits it, so there is no cursor and
 * no cadence:
 *   - **bootstrap** once when activated (app load) — fetch the whole set and snapshot-replace it,
 *     which upserts the fresh rows AND prunes cached rows the server no longer returns;
 *   - **refetch by PK** after a mutation, because Moqui's auto-entity endpoints return only the
 *     PK on create and effectively nothing on update — the record must be re-read to refresh the
 *     cache (see docs/cache-sync-rollout-plan.md F1).
 *
 * Registering a domain is pure configuration; the behavior lives here once.
 */
export interface SnapshotDomainConfig {
  /** Registry name used to activate the domain (e.g. "productStore"). */
  name: string;
  table: CacheTableName;
  projection: EntityProjection;
  /** List endpoint returning the full set. */
  listUrl: string;
  /**
   * Envelope key holding the array; omit/null for endpoints that return a bare array.
   * Verified per endpoint — see `unwrapCollection`.
   */
  collectionKey?: string | null;
  /**
   * Reject any response that does not match `collectionKey` exactly.
   *
   * Use for mutation-sensitive snapshots where an error object or unsupported envelope must not
   * be interpreted as an authoritative empty set.
   */
  strictCollection?: boolean;
  /** Extra filter/order params for the full-set fetch. Paging params are supplied by `pageAll`. */
  listParams?: Record<string, unknown>;
  /** Page size for the full-set walk (default 250). */
  batchSize?: number;
  /**
   * Restrict the snapshot's prune to one partition. Required when several domains share a table
   * (e.g. enums cached per `enumTypeId`) — without it, one domain's snapshot would delete every
   * other partition's rows.
   */
  scopeOnSync?: { field: string; value: unknown };
  /**
   * Build the set by fanning out over an already-cached parent table, because no global endpoint
   * exists (e.g. facility↔product-store is only exposed as `productStores/{id}/facilities`).
   * Every parent's rows are unioned into ONE snapshot, so the usual prune still removes anything
   * the server dropped.
   */
  fanOut?: {
    parentTable: CacheTableName;
    parentKeyField: string;
    /** URL for one parent. */
    urlFor: (parentId: string) => string;
  };
  /**
   * Read route for one record after a mutation. Omit when the endpoint has no by-PK route
   * (e.g. group members, permissions) — then `refetchScope` is used instead.
   */
  byPk?: (pk: Record<string, unknown>) => { url: string; params?: Record<string, unknown> };
  /**
   * Property holding the record when the by-PK route wraps it in a SINGLE-RECORD envelope, e.g.
   * `admin/serviceJobs/{jobName}` answers `{ jobDetail: { … } }` while its list route answers
   * `{ serviceJobList: [ … ] }`. Explicit per domain for the same reason as `collectionKey`: the
   * envelope convention differs per endpoint, and guessing it wrong fails silently — the unwrapped
   * envelope has no PK, so the projection cannot key it and the row is dropped without an error.
   */
  byPkRecordKey?: string;
  /**
   * Fallback for domains with no by-PK route: re-list a narrow scope (e.g. all members of one
   * facility group) and snapshot-replace just that scope, so deletions inside it are pruned too.
   */
  refetchScope?: (pk: Record<string, unknown>) => {
    params: Record<string, unknown>;
    /** Omit to snapshot the whole set (fine for small sets with no natural scope). */
    scope?: { field: string; value: unknown };
  };
}

/** The record's cache key, used for the paging no-progress guard and for delete handling. */
function keyOfRecord(record: any, config: SnapshotDomainConfig): string | undefined {
  const key = config.projection.buildKey
    ? config.projection.buildKey(record)
    : record?.[config.projection.keyField];
  return key === undefined || key === null || key === "" ? undefined : String(key);
}


/**
 * A snapshot that fetched records but wrote NONE means the projection could not build a key for
 * any row — a silent data-loss bug (it happened for real: `geoAssocs` used `geoIdTo` where the
 * server sends `toGeoId`, so 1225 rows were fetched and all dropped).
 *
 * Do NOT mark such a domain synced: marking it would skip it for the rest of the login session,
 * turning a fixable typo into "this table is permanently empty". Warn loudly and let it retry.
 */
function assertWrote(name: string, fetched: number, written: number): boolean {
  if (fetched > 0 && written === 0) {
    console.warn(
      `[sync] ${name}: fetched ${fetched} records but wrote 0 — the projection likely cannot build ` +
      `a key (check the keyField / buildKey field names against the API response). Not marking synced.`,
    );
    return false;
  }
  return true;
}

/**
 * Would this snapshot empty a table that currently holds rows, on the strength of a fetch that
 * returned NOTHING?
 *
 * `snapshotReplace` prunes whatever the fetch did not return, so a zero-row fetch prunes the entire
 * scope — and a zero-row fetch is exactly what a soft failure looks like. Verified end to end: a
 * response that is not JSON (a gateway HTML page) was read as "no records", `snapshotReplace([])`
 * reported `{ written: 0, pruned: 3 }`, and `assertWrote(0, 0)` returned true so the domain was
 * MARKED SYNCED — leaving the table empty for the rest of the login with nothing retrying it.
 *
 * `workerGet` no longer misreports those failures, but this is the layer that makes the data loss
 * impossible rather than merely unlikely: an automatic sync will not prune a populated table down to
 * zero. A genuinely emptied reference set is rare, self-corrects on the next login, and can be
 * cleared immediately with a manual resync (`force`), which bypasses this guard.
 */
function wouldWipePopulatedTable(fetchedRows: number, cachedRows: number, force: boolean): boolean {
  return !force && fetchedRows === 0 && cachedRows > 0;
}

/**
 * Rows the projection can actually key. A snapshot prunes by comparing cached keys against fetched
 * keys, so a fetch that yields NO keyable rows would delete the whole scope — that is how a wrong
 * refetch URL once wiped every `productStoreFacilities` row (17 → 0) after unlinking one facility.
 * Returning null means "refuse to snapshot": leave the cache untouched and warn.
 */
function keyableRows(name: string, rows: any[], config: SnapshotDomainConfig): any[] | null {
  if (!isUnkeyableFetch(rows, config.projection)) return rows;
  console.warn(
    `[sync] ${name}: refetch returned ${rows.length} records but none could be keyed — refusing to ` +
    `snapshot, because pruning against zero keys would delete the entire scope. Check that the ` +
    `refetch URL returns ${config.table} rows and not some other collection.`,
  );
  return null;
}

export function registerSnapshotDomain(config: SnapshotDomainConfig) {
  const cache = defineCachedEntity(config.table, config.projection);

  registerSyncDomain({
    name: config.name,
    // No intervalMs: the harness runs this once on activation, never on cadence.
    async sync(ctx: SyncContext, _args, options) {
      // Once per LOGIN, not once per page load. A browser refresh keeps the session, so re-fetching
      // every reference set on every reload was pure waste; the marker lives in the cache and is
      // wiped by logout (and by an identity change), so a new login re-snapshots from scratch.
      if (!options?.force && (await hasSyncedThisLogin(config.name))) return 0;

      // Fan-out: one request per cached parent, unioned into a single snapshot.
      if (config.fanOut) {
        const { parentTable, parentKeyField, urlFor } = config.fanOut;
        const parents = await appCacheDb.table(parentTable).toCollection().toArray();
        const parentIds = [...new Set(parents.map((row: any) => row?.[parentKeyField]).filter(Boolean))];
        const all: any[] = [];
        for (const parentId of parentIds) {
          const page = await pageAll({
            ctx,
            url: urlFor(String(parentId)),
            collectionKey: config.collectionKey,
            strictCollection: config.strictCollection,
            params: config.listParams,
            batchSize: config.batchSize,
            keyOf: (record) =>
              keyOfRecord({ ...record, [parentKeyField]: parentId }, config),
            label: `${config.name}:${parentId}`,
          });
          // The request scope is authoritative: child rows may omit or incorrectly echo the parent.
          all.push(...page.map((row: any) => ({ ...row, [parentKeyField]: parentId })));
        }
        if (wouldWipePopulatedTable(all.length, await appCacheDb.table(config.table).count(), !!options?.force)) {
          console.warn(
            `[sync] ${config.name}: fan-out returned 0 records while the cache holds rows — refusing ` +
            `to snapshot, because pruning against zero keys would empty the table. Not marking synced; ` +
            `the next pass retries. Use a manual resync to clear it deliberately.`,
          );
          return 0;
        }
        const fanned = await cache.snapshotReplace(all, config.scopeOnSync);
        if (assertWrote(config.name, all.length, fanned.written)) await markSyncedThisLogin(config.name);
        return fanned.written;
      }

      // Page until the whole set is loaded — no cap. `pageAll` guards an endpoint ignoring paging.
      const rows = await pageAll({
        ctx,
        url: config.listUrl,
        collectionKey: config.collectionKey,
        strictCollection: config.strictCollection,
        params: config.listParams,
        batchSize: config.batchSize,
        keyOf: (record) => keyOfRecord(record, config),
        label: config.name,
      });
      if (wouldWipePopulatedTable(rows.length, await appCacheDb.table(config.table).count(), !!options?.force)) {
        console.warn(
          `[sync] ${config.name}: ${config.listUrl} returned 0 records while the cache holds rows — ` +
          `refusing to snapshot, because pruning against zero keys would empty the table. Not marking ` +
          `synced; the next pass retries. Use a manual resync to clear it deliberately.`,
        );
        return 0;
      }
      const { written } = await cache.snapshotReplace(rows, config.scopeOnSync);
      if (assertWrote(config.name, rows.length, written)) await markSyncedThisLogin(config.name);
      return written;
    },

    async refetchOne(ctx: SyncContext, pk) {
      // Fan-out domains have NO global list endpoint — `listUrl` is a placeholder pointing at the
      // PARENT collection, so the generic scoped re-list below would fetch the wrong entity. Re-list
      // just the affected parent and prune only that parent's slice.
      if (!config.byPk && config.fanOut) {
        const { parentKeyField, urlFor } = config.fanOut;
        const parentId = pk[parentKeyField];
        if (!parentId) {
          console.warn(
            `[sync] ${config.name}: refetch needs \`${parentKeyField}\` to scope the prune but the ` +
            `mutation supplied ${JSON.stringify(pk)} — skipping rather than re-snapshotting blindly.`,
          );
          return 0;
        }
        const fetched = await pageAll({
          ctx,
          url: urlFor(String(parentId)),
          collectionKey: config.collectionKey,
          strictCollection: config.strictCollection,
          params: config.listParams,
          batchSize: config.batchSize,
          keyOf: (record) =>
            keyOfRecord({ ...record, [parentKeyField]: parentId }, config),
          label: `${config.name}:refetch:${parentId}`,
        });
        // The request scope is authoritative: child rows may omit or incorrectly echo the parent.
        const stamped = fetched.map((row: any) => ({ ...row, [parentKeyField]: parentId }));
        const rows = keyableRows(config.name, stamped, config);
        if (rows === null) return 0;
        const { written } = await cache.snapshotReplace(rows, { field: parentKeyField, value: parentId });
        return written;
      }

      // Scoped re-list for domains with no by-PK route.
      if (!config.byPk && config.refetchScope) {
        const { params, scope } = config.refetchScope(pk);
        // A scope whose value is undefined would prune on `where(field).equals(undefined)`; refuse
        // rather than risk emptying the table.
        if (scope && (scope.value === undefined || scope.value === null)) {
          console.warn(
            `[sync] ${config.name}: refetch scope \`${scope.field}\` resolved to ${String(scope.value)} ` +
            `from ${JSON.stringify(pk)} — skipping, an unscoped prune would clear the table.`,
          );
          return 0;
        }
        const fetched = await pageAll({
          ctx,
          url: config.listUrl,
          collectionKey: config.collectionKey,
          strictCollection: config.strictCollection,
          params: { ...config.listParams, ...params },
          batchSize: config.batchSize,
          keyOf: (record) => keyOfRecord(record, config),
          label: `${config.name}:refetch`,
        });
        const rows = keyableRows(config.name, fetched, config);
        if (rows === null) return 0;
        const { written } = await cache.snapshotReplace(rows, scope);
        return written;
      }
      if (!config.byPk) return 0;

      const { url, params } = config.byPk(pk);
      const resp = await workerGet(ctx, url, params ?? {});
      const envelope = config.byPkRecordKey && resp && typeof resp === "object"
        ? (resp as any)[config.byPkRecordKey]
        : resp;
      const rows = unwrapCollection(envelope, config.collectionKey);
      // A single-record GET may return the object itself rather than a one-item array.
      const record = rows.length
        ? rows[0]
        : (envelope && typeof envelope === "object" && !Array.isArray(envelope) ? envelope : null);
      if (!record) {
        // The record is gone (deleted server-side) — drop it so the cache doesn't keep a ghost.
        const key = config.projection.buildKey
          ? config.projection.buildKey(pk)
          : pk[config.projection.keyField];
        if (key) await cache.remove(String(key));
        return 0;
      }
      return cache.upsertMany([record]);
    },
  });

  return cache;
}
