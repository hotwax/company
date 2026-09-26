import { shopifyShopCache, systemMessageCache, systemMessageRemoteCache } from "@/utils/cacheEntities";
import { liveScopeFor } from "@/config/appSyncConfig";
import { keepNewerThan } from "@/utils/cacheProjection";
import { resolveShopRemoteIds } from "@/utils/systemMessage";
import { registerSyncDomain, type SyncContext } from "../syncRegistry";
import { pageNewestFirst, workerGet } from "./workerFetch";

/**
 * SystemMessage — class A (live, append-mostly).
 *
 * Cursor field is `initDate` (incoming: received date; outgoing: produced date — see
 * `src/utils/systemMessage.ts:26`), which is the closest thing this entity has to a creation
 * stamp.
 *
 * ⚠️ VERIFIED (2026-07-26, live): this endpoint supports NO server-side date cursor. Both Moqui
 * conventions were probed and both are silently ignored — `initDate_from` (ISO) and
 * `initDate_op=greaterThan` (millis) each returned a payload byte-identical to the unfiltered
 * one (2386 B, 25 rows, max `initDate` exactly equal to the cursor, zero rows newer).
 *
 * Note the contrast with `admin/dataManager/details`, which honors `_from` but ignores `_op`:
 * filter support is per-endpoint and must be probed, never generalized. This endpoint also returned
 * zero rows for a multi-value `systemMessageRemoteId_op=in` probe, so callers issue one scalar
 * remote-id request at a time.
 *
 * Consequence: incremental scoping is CLIENT-side, bounded to one page per (remote, type) per tick
 * (page 0 always contains the boundary record, so `keep` stops paging immediately) and writes zero
 * rows.
 *
 * ⚠️ COST OF A TICK. An earlier note here claimed "a quiet tick costs one 25-row page". That was
 * wrong by more than an order of magnitude, because it counted neither multiplier:
 *   - `syncRecent` issues one page per (remote × configured type) — 12 requests for the six types
 *     in `appSyncConfig` across two remotes;
 *   - `refreshUnprocessed` issues one request PER cached row awaiting a status.
 * Measured at 37 fetch operations for a single tick on a cache with stuck messages. Both are now
 * bounded (per-type windows are small, and the refresh pass is age-limited), but treat this domain
 * as tens of requests per tick, not one, before adding another type or shortening `intervalMs`.
 */
const ENDPOINT = "admin/systemMessages";
const COLLECTION = "systemMessages";

/** Age cut-off for the per-row status re-check. See `refreshUnprocessed`. */
const DEFAULT_REFRESH_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours

export interface SystemMessageArgs {
  /** Scope to one remote (a Shopify shop's connection); also scopes the incremental cursor. */
  systemMessageRemoteId?: string;
  /** Explicit remote ids to scope to; overrides the app config's shop-derived scope. */
  systemMessageRemoteIds?: string[];
  /** Extra server-side query params (statusId, systemMessageTypeId, Moqui `_op` forms, …). */
  filters?: Record<string, unknown>;
  total?: number;
  batchSize?: number;
  /** Re-check messages that have not reached a processed date yet. One request per row. */
  refreshMax?: number;
  /**
   * How far back to look for those re-checks. A message older than this is treated as settled even
   * without a `processedDate`, because an errored message never gets one and would otherwise be
   * re-requested on every tick for the rest of the session.
   */
  refreshMaxAgeMs?: number;
  /**
   * The message types to sync, overriding the app config.
   *
   * A screen should pass ONLY the types it renders. The app config lists every type any screen might
   * need, and syncing all of them on every tick multiplies requests by remote count — six types
   * across two remotes is twelve requests per tick, most of them for a screen that is not open.
   */
  types?: Array<{ systemMessageTypeId: string; total?: number; batchSize?: number }>;
}

/**
 * The remotes worth polling: whatever the app config says.
 *
 * With `scopeToShopifyShopRemotes` the ids are derived by joining the cached Shopify shops to the
 * cached SystemMessageRemotes, so the scope tracks shops being added or removed with no code
 * change. Returning an empty list means "poll nothing" — deliberately, so a missing scope never
 * silently degrades into an unscoped pull of arbitrary recent traffic.
 *
 * ⚠️ This used to read `shop.systemMessageRemoteId`, a field that does not exist: neither the
 * projection nor `oms/shopifyShops/shops` returns one. It therefore resolved to `[]` on every tick
 * and `syncRecent` bailed at its guard — so this domain fetched NOTHING from the day it was written
 * (found 2026-07-27, `systemMessages` table empty with the poller apparently healthy). The link
 * lives on the REMOTE (`remoteId` / `internalId`), which is why the join is required; see
 * `resolveShopRemoteIds`.
 */
async function resolveRemoteIds(args: SystemMessageArgs): Promise<string[] | undefined> {
  if (args.systemMessageRemoteIds?.length) return args.systemMessageRemoteIds;
  if (args.systemMessageRemoteId) return [args.systemMessageRemoteId];

  const scope = liveScopeFor("systemMessage");
  if (!scope.scopeToShopifyShopRemotes) return undefined; // unscoped only if explicitly configured

  const [shops, remotes] = await Promise.all([
    shopifyShopCache.all(),
    systemMessageRemoteCache.all(),
  ]);
  return resolveShopRemoteIds(shops as any[], remotes as any[]);
}

/**
 * Newest `initDate` cached for one (remote, type) pair.
 *
 * Read through the `[systemMessageRemoteId+systemMessageTypeId+initDate]` compound index — added for
 * exactly this — so it is an index seek rather than a scan of the message table.
 *
 * This used to call `systemMessageCache.all()` and filter in JS, which meant a full read of every
 * cached message (each carrying ~1KB of `messageText`) once per (remote, type) — twelve full table
 * reads per tick on the configured six types across two remotes, while the index it documents sat
 * unused.
 */
async function newestCursorForType(
  remoteId: string | undefined,
  systemMessageTypeId: string,
): Promise<number | undefined> {
  if (!remoteId) {
    // Unscoped: no partition to seek within, so narrow by type only.
    return systemMessageCache.newestCursor("initDate", undefined, { systemMessageTypeId });
  }
  return systemMessageCache.newestCursor(
    "initDate",
    { field: "systemMessageRemoteId", value: remoteId },
    { systemMessageTypeId },
  );
}

/**
 * Fetch the recent window for ONE remote.
 *
 * ⚠️ One request PER REMOTE, never a single multi-value `in`. A multi-value
 * `systemMessageRemoteId_op=in` returns `systemMessagesCount: 0` on this endpoint — verified live
 * 2026-07-27 in both serializations (comma-joined `A%2CB` and repeated `id=A&id=B`), while the exact
 * same query with a SINGLE remote returns rows. `in` with one value degenerates to equality, which
 * is why the single-remote path always looked fine. Per-remote requests also give each remote its
 * own cursor, so a quiet remote does not force re-paging of a busy one.
 */
async function syncRemote(
  ctx: SyncContext,
  args: SystemMessageArgs,
  remoteId: string | undefined,
  messageType?: { systemMessageTypeId: string; total?: number; batchSize?: number },
): Promise<any[]> {
  const appScope = liveScopeFor("systemMessage");
  const scope = remoteId ? { field: "systemMessageRemoteId", value: remoteId } : undefined;

  /**
   * The cursor is per (remote, TYPE) when syncing by type — a shared cursor would let a busy type
   * advance past a quiet one, permanently hiding the quiet type's older messages.
   */
  const target = messageType?.total ?? args.total ?? appScope.total ?? 100;
  const batchSize = messageType?.batchSize ?? args.batchSize ?? appScope.batchSize ?? 25;

  /**
   * ⚠️ A SHALLOW WINDOW IS DEEPENED, NOT JUST TOPPED UP.
   *
   * With a cursor, `keep` stops paging at the first already-cached row — page 0, every tick. So a
   * window first synced shallow stays shallow forever and raising `total` later does nothing.
   * Measured live: this window held 25 rows while configured for 100, and the import window's newest
   * row predated its oldest, so the message⋈log join had ZERO overlap and a shop that synced the day
   * before reported as never synced.
   *
   * So: short of target → page from 0 with NO cursor, walking past cached rows until the scope holds
   * `target` (upserts are idempotent). At target → the normal one-page incremental read. Either way
   * this is exactly ONE `pageNewestFirst` per (remote, type) per tick, so the tick budget is unchanged
   * for a settled window and the deep pass stops happening once it is full.
   */
  const equals = messageType ? { systemMessageTypeId: messageType.systemMessageTypeId } : undefined;
  const cached = await systemMessageCache.count(scope, equals);
  const isShallow = cached < target;

  const cursor = isShallow
    ? undefined
    : messageType
      ? await newestCursorForType(remoteId, messageType.systemMessageTypeId)
      : await systemMessageCache.newestCursor("initDate", scope);

  return pageNewestFirst({
    ctx,
    url: ENDPOINT,
    collectionKey: COLLECTION,
    total: isShallow ? target : batchSize,
    batchSize,
    params: {
      ...(remoteId ? { systemMessageRemoteId: remoteId, systemMessageRemoteId_op: "equals" } : {}),
      ...(messageType ? { systemMessageTypeId: messageType.systemMessageTypeId } : {}),
      ...(appScope.filters ?? {}),
      ...(args.filters ?? {}),
      // NO server-side date cursor is sent, deliberately. Both Moqui conventions were probed
      // live against this endpoint and BOTH are ignored (see the header note): the response was
      // byte-identical (2386 B, 25 rows, max initDate == the cursor) with `initDate_from`, with
      // `initDate_op=greaterThan`, and with no date param at all. Sending a no-op param would
      // only mislead the next reader. Scoping is therefore client-side via `keep` below, which
      // bounds the cost to one page per tick: page 0 always contains the boundary record, so
      // paging stops immediately and a quiet tick writes zero rows.
      orderByField: "-initDate",
    },
    keep: cursor === undefined ? undefined : (page) => keepNewerThan(page, "initDate", cursor),
  });
}

async function syncRecent(ctx: SyncContext, args: SystemMessageArgs): Promise<number> {
  const remoteIds = await resolveRemoteIds(args);

  // Configured to scope but nothing to scope to → fetch nothing. Better than caching a window of
  // messages for remotes this app does not manage.
  if (remoteIds && remoteIds.length === 0) return 0;

  // `undefined` means the app explicitly opted out of scoping — one unscoped pass.
  const targets: Array<string | undefined> = remoteIds?.length ? remoteIds : [undefined];

  const appScope = liveScopeFor("systemMessage");
  // Screen-declared types win; the app config is the fallback for a caller that does not care.
  const configuredTypes = args.types?.length ? args.types : appScope.types;
  const messageTypes = configuredTypes?.length ? configuredTypes : [undefined];

  let written = 0;
  for (const remoteId of targets) {
    for (const messageType of messageTypes) {
      const messages = await syncRemote(ctx, args, remoteId, messageType);
      written += await systemMessageCache.upsertMany(messages);
    }
  }
  return written;
}

/**
 * Re-fetch messages still in flight (no processedDate) so their status converges.
 *
 * ⚠️ This costs ONE REQUEST PER ROW, so the candidate set must stay bounded by AGE and not just by
 * count. "No processedDate" is not the same as "still in flight": a message that errors never gets
 * one, so an unbounded selection re-requests the same stuck rows on every tick forever — measured at
 * a steady 25 requests per 10s tick on a cache holding stuck messages, with no progress and no
 * backoff. Past `refreshMaxAgeMs` a message is treated as settled and left alone; the per-login
 * snapshot and an explicit resync still pick up any late change.
 */
async function refreshUnprocessed(ctx: SyncContext, args: SystemMessageArgs): Promise<number> {
  const maxAgeMs = args.refreshMaxAgeMs ?? DEFAULT_REFRESH_MAX_AGE_MS;
  const targets = await systemMessageCache.rowsMissing("processedDate", {
    limit: args.refreshMax ?? 25,
    since: { field: "initDate", afterMs: Date.now() - maxAgeMs },
  });
  const refreshed: any[] = [];
  for (const cached of targets) {
    try {
      const resp = await workerGet(ctx, ENDPOINT, {
        systemMessageId: cached.systemMessageId,
        systemMessageId_op: "equals",
        pageSize: 1,
      });
      const latest = resp?.[COLLECTION]?.[0];
      if (latest) refreshed.push(latest);
    } catch {
      // skip this message this tick; the next tick retries it
    }
  }
  return systemMessageCache.upsertMany(refreshed);
}

registerSyncDomain({
  name: "systemMessage",
  intervalMs: 10_000,
  async sync(ctx, args: SystemMessageArgs = {}) {
    const recent = await syncRecent(ctx, args);
    const refreshed = await refreshUnprocessed(ctx, args);
    return recent + refreshed;
  },
  async refetchOne(ctx, pk) {
    const systemMessageId = pk?.systemMessageId;
    if (!systemMessageId) return 0;
    const resp = await workerGet(ctx, ENDPOINT, {
      systemMessageId,
      systemMessageId_op: "equals",
      pageSize: 1,
    });
    const latest = resp?.[COLLECTION]?.[0];
    return latest ? systemMessageCache.upsertMany([latest]) : 0;
  },
});
