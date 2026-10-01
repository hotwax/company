import { dataManagerLogCache } from "@/utils/cacheEntities";
import { keepNewerThan } from "@/utils/cacheProjection";
import { registerSyncDomain, type SyncContext } from "../syncRegistry";
import { pageNewestFirst, workerGet } from "./workerFetch";

/**
 * DataManagerLog — class A (live, append-mostly).
 *
 * Two passes per tick:
 *   1. incremental: fetch logs created since the newest one cached for this scope, server-scoped
 *      with Moqui's `createdDate_from` (VERIFIED honored and inclusive on this endpoint);
 *   2. refresh: re-fetch cached logs that have no finish time, so in-flight runs converge.
 */
const ENDPOINT = "admin/dataManager/details";
const COLLECTION = "dataManagerLogs";

export interface DataManagerLogArgs {
  /** Partition filter; also scopes the incremental cursor so configs don't share a cursor. */
  configId?: string;
  /** Extra server-side query params (statusId, systemMessageId, any Moqui find operator). */
  filters?: Record<string, unknown>;
  total?: number;
  batchSize?: number;
  /** Logs to re-check per tick for a finish time. One request per row. */
  refreshMax?: number;
  /**
   * How far back to look for those re-checks. A log older than this is treated as settled even
   * without a `finishDateTime`, because a run that died never stamps one.
   */
  refreshMaxAgeMs?: number;
}

/** Age cut-off for the per-row finish-time re-check. See `refreshUnfinished`. */
const DEFAULT_REFRESH_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours

async function syncCreated(ctx: SyncContext, args: DataManagerLogArgs): Promise<number> {
  const scope = args.configId ? { field: "configId", value: args.configId } : undefined;
  const target = args.total ?? 100;

  /**
   * ⚠️ A SHALLOW WINDOW IS DEEPENED, NOT JUST TOPPED UP.
   *
   * `createdDate_from` plus `keep` stops paging at the first already-cached row — page 0, every tick,
   * once anything is cached. So `total` only ever applied to an EMPTY scope, and raising it later did
   * nothing. Measured live: this window's newest row was a day older than the oldest message in the
   * message window, so the message⋈log join had zero overlap.
   *
   * Short of target → page from 0 with no cursor until the scope holds `target`. At target → the
   * normal one-page incremental read. One `pageNewestFirst` per tick either way.
   *
   * NOTE this window is per `configId` and SHARED ACROSS SHOPS. No endpoint keys logs to a shop:
   * `admin/dataManager/details` ignores shop filters entirely (a nonexistent shop id returns the full
   * set) and `DATA_MANAGER_LOG_AND_PARAMETER`, which does scope by shop, omits `systemMessageId` and so
   * cannot be joined to a message. Depth is the only lever — see `importTotal`.
   */
  const cached = await dataManagerLogCache.count(scope);
  const isShallow = cached < target;

  const cursor = isShallow
    ? undefined
    : await dataManagerLogCache.newestCursor("createdDate", scope);

  const logs = await pageNewestFirst({
    ctx,
    url: ENDPOINT,
    collectionKey: COLLECTION,
    total: isShallow ? target : (args.batchSize ?? 25),
    batchSize: args.batchSize ?? 25,
    params: {
      ...(args.configId ? { configId: args.configId } : {}),
      ...(args.filters ?? {}),
      // Server-side lower bound. Moqui's `_from` IS honored here (verified live: 1 boundary row
      // vs a full 25-row page); `createdDate_op=greaterThan` is silently ignored by this
      // endpoint. `_from` is inclusive, so the boundary record returns on every quiet poll and
      // the client-side cutoff below drops it — a quiet tick writes nothing.
      ...(cursor !== undefined ? { createdDate_from: new Date(cursor).toISOString() } : {}),
      orderByField: "-createdDate",
    },
    keep: cursor === undefined ? undefined : (page) => keepNewerThan(page, "createdDate", cursor),
  });

  return dataManagerLogCache.upsertMany(logs);
}

/**
 * Re-fetch logs with no finish time so in-flight runs converge.
 *
 * ⚠️ ONE REQUEST PER ROW, so the candidate set is bounded by AGE as well as count. A run that dies
 * without stamping `finishDateTime` never gains one, so a count-only bound re-requests the same dead
 * logs on every 10s tick for the rest of the session. Past `refreshMaxAgeMs` a log is treated as
 * settled.
 */
async function refreshUnfinished(ctx: SyncContext, args: DataManagerLogArgs): Promise<number> {
  const maxAgeMs = args.refreshMaxAgeMs ?? DEFAULT_REFRESH_MAX_AGE_MS;
  const targets = await dataManagerLogCache.rowsMissing("finishDateTime", {
    limit: args.refreshMax ?? 25,
    since: { field: "createdDate", afterMs: Date.now() - maxAgeMs },
  });
  const refreshed: any[] = [];
  for (const cached of targets) {
    try {
      const resp = await workerGet(ctx, ENDPOINT, { logId: cached.logId });
      const latest = resp?.[COLLECTION]?.[0];
      if (latest) refreshed.push(latest);
    } catch {
      // one bad logId must not sink the pass; the next tick retries it
    }
  }
  return dataManagerLogCache.upsertMany(refreshed);
}

registerSyncDomain({
  name: "dataManagerLog",
  intervalMs: 10_000,
  async sync(ctx, args: DataManagerLogArgs = {}) {
    const created = await syncCreated(ctx, args);
    const refreshed = await refreshUnfinished(ctx, args);
    return created + refreshed;
  },
  async refetchOne(ctx, pk) {
    const logId = pk?.logId;
    if (!logId) return 0;
    const resp = await workerGet(ctx, ENDPOINT, { logId });
    const latest = resp?.[COLLECTION]?.[0];
    return latest ? dataManagerLogCache.upsertMany([latest]) : 0;
  },
});
