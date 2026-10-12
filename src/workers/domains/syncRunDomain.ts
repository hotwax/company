import {
  dataManagerLogCache,
  shopifyShopCache,
  syncRunCache,
  systemMessageCache,
} from "@/utils/cacheEntities";
import { type SyncContext, registerSyncDomain } from "../syncRegistry";
import { unwrapCollection, workerGet, workerPost } from "./workerFetch";

/**
 * SyncRun — class A, and the only SHOP-SCOPED sync cursor.
 *
 * Two passes per tick:
 *   1. CURSOR — read this shop's runs from `SYSTEM_MESSAGE_DATA_MANAGER_LOG`, which is the one feed
 *      that pairs `systemMessageId` with `logId` under a shop scope;
 *   2. ENRICH — make sure the full SystemMessage and DataManagerLog records those runs name actually
 *      exist in their own tables, fetching by id only what is missing.
 *
 * ⚠️ WHY A CURSOR TABLE RATHER THAN JUST WIDER WINDOWS.
 *
 * Messages already partition per shop: `systemMessageRemoteId` → remote → `internalId` = shopId, and a
 * remote belongs to exactly one shop, so each (remote, type) has its own window and cursor.
 *
 * Logs do not, and cannot. Probed live: `admin/dataManager/details` ignores shop filters outright (a
 * nonexistent shop id returns the full unfiltered set) and `DATA_MANAGER_LOG_AND_PARAMETER`, which does
 * scope by shop, omits `systemMessageId` and so cannot be joined to a message. One `configId` window
 * is shared by every shop.
 *
 * Widening that shared window is guesswork — measured live, a shop's newest import sat 85 message-ids
 * outside a 100-row window, and the fix was to guess 200. Enrichment removes the guess: a log is
 * fetched because a run of THIS shop says it exists, not because it happened to land inside a window
 * someone sized correctly.
 */
const ENDPOINT = "oms/dataDocumentView";
const DATA_DOCUMENT_ID = "SYSTEM_MESSAGE_DATA_MANAGER_LOG";
const SHOP_ID_TYPE = "HOTWAX_SHOP_ID";

const MESSAGE_ENDPOINT = "admin/systemMessages";
const LOG_ENDPOINT = "admin/dataManager/details";

export interface SyncRunScope {
  shopId: string;
  systemMessageTypeId: string;
}

export interface SyncRunArgs {
  /** Explicit (shop, type) pairs. Each is an independent window with its own cursor. */
  scopes?: SyncRunScope[];
  /** Types to sync for EVERY cached Shopify shop, so the scope set tracks shops with no code change. */
  systemMessageTypeIds?: string[];
  /** Window depth per scope. */
  total?: number;
  batchSize?: number;
  /**
   * Records to enrich per tick, per kind. Bounded because each is one request — but the bound barely
   * matters in steady state: a terminal message or a finished import never changes, so once cached it
   * is never fetched again and only genuinely new runs cost anything.
   */
  enrichMax?: number;
}

async function resolveScopes(args: SyncRunArgs): Promise<SyncRunScope[]> {
  if(args.scopes?.length) {return args.scopes;}
  if(!args.systemMessageTypeIds?.length) {return [];}

  const shops = await shopifyShopCache.all();
  const shopIds = [...new Set(shops.map((shop: any) => String(shop.shopId ?? "")).filter(Boolean))];

  return shopIds.flatMap((shopId) =>
    args.systemMessageTypeIds!.map((systemMessageTypeId) => ({ shopId, systemMessageTypeId })));
}

async function fetchPage(
  ctx: SyncContext,
  scope: SyncRunScope,
  pageIndex: number,
  pageSize: number,
): Promise<any[]> {
  const resp = await workerPost(ctx, ENDPOINT, {
    dataDocumentId: DATA_DOCUMENT_ID,
    customParametersMap: {
      systemMessageTypeId: scope.systemMessageTypeId,
      remoteInternalId: scope.shopId,
      remoteInternalIdType: SHOP_ID_TYPE,
      // MUST be inside `customParametersMap`. At the top level it is ignored and the document comes
      // back oldest-first (verified: top-level `-initDate` returned a June row, the same request with
      // it here returned the newest July row).
      orderByField: "-initDate",
    },
    pageSize,
    pageIndex,
  });

  return unwrapCollection(resp, "entityValueList");
}

/**
 * Pass 1 — this shop's runs.
 *
 * ⚠️ NO `initDate` cursor, deliberately. `initDate` is stamped when the message is produced and never
 * moves, so a cursor on it would skip a run whose IMPORT attached later — and "consumed, import
 * pending" is exactly the state the summary cards read. Instead the newest page is re-read every tick
 * (one request, bounded) and a scope short of `total` pages deeper until its window is full.
 */
async function syncScope(ctx: SyncContext, scope: SyncRunScope, args: SyncRunArgs): Promise<number> {
  const batchSize = args.batchSize ?? 25;
  const target = args.total ?? 100;

  const cached = await syncRunCache.count(
    { field: "shopId", value: scope.shopId },
    { systemMessageTypeId: scope.systemMessageTypeId },
  );
  const wanted = cached < target ? target : batchSize;

  const rows: any[] = [];
  for(let pageIndex = 0; rows.length < wanted; pageIndex += 1) {
    const page = await fetchPage(ctx, scope, pageIndex, batchSize);
    if(!page.length) {break;}
    rows.push(...page);
    if(page.length < batchSize) {break;}
  }

  return rows.length ? syncRunCache.upsertMany(rows.slice(0, wanted)) : 0;
}

/** Ids named by cached runs that are missing from `table`. */
async function missingIds(
  runs: any[],
  idField: "systemMessageId" | "logId",
  cachedIds: Set<string>,
  limit: number,
): Promise<string[]> {
  const wanted: string[] = [];
  for(const run of runs) {
    const id = String(run?.[idField] ?? "");
    if(!id || cachedIds.has(id) || wanted.includes(id)) {continue;}
    wanted.push(id);
    if(wanted.length >= limit) {break;}
  }

  return wanted;
}

/**
 * Pass 2 — enrich the records the runs name.
 *
 * The cursor document carries identity plus a few rolled-up counts; the screens need the full records
 * (`createdDate`, `startDateTime`, `finishDateTime`, `fileName`, `logContentId`, `lastAttemptDate` …).
 * Those are fetchable BY ID on both endpoints — `admin/systemMessages?systemMessageId=` and
 * `admin/dataManager/details?logId=` — which is the operation that always works, unlike any bulk or
 * shop-filtered form (multi-value `_op=in` returns 0 rows on both; shop filters are ignored on logs).
 *
 * Newest-first, because that is what a screen is looking at. Bounded per tick, and the bound stops
 * mattering almost immediately: terminal records are immutable, so each id is fetched at most once ever.
 */
async function enrich(ctx: SyncContext, args: SyncRunArgs): Promise<number> {
  const limit = args.enrichMax ?? 10;

  const runs = (await syncRunCache.all())
    .slice()
    .sort((a: any, b: any) => Number(b.initDate ?? 0) - Number(a.initDate ?? 0));
  if(!runs.length) {return 0;}

  const [cachedMessages, cachedLogs] = await Promise.all([
    systemMessageCache.all(),
    dataManagerLogCache.all(),
  ]);
  const haveMessages = new Set(cachedMessages.map((row: any) => String(row.systemMessageId)));
  const haveLogs = new Set(cachedLogs.map((row: any) => String(row.logId)));

  let written = 0;

  for(const systemMessageId of await missingIds(runs, "systemMessageId", haveMessages, limit)) {
    try {
      const resp = await workerGet(ctx, MESSAGE_ENDPOINT, {
        systemMessageId,
        systemMessageId_op: "equals",
        pageSize: 1,
      });
      const row = resp?.systemMessages?.[0];
      if(row) {written += await systemMessageCache.upsertMany([row]);}
    } catch {
      // one bad id must not sink the pass; the next tick retries it
    }
  }

  for(const logId of await missingIds(runs, "logId", haveLogs, limit)) {
    try {
      const resp = await workerGet(ctx, LOG_ENDPOINT, { logId });
      const row = resp?.dataManagerLogs?.[0];
      if(row) {written += await dataManagerLogCache.upsertMany([row]);}
    } catch {
      // as above
    }
  }

  return written;
}

registerSyncDomain({
  name: "syncRun",
  intervalMs: 10_000,
  async sync(ctx, args: SyncRunArgs = {}) {
    const scopes = await resolveScopes(args);
    // No scope, no poll — the same rule as messages. Better than pulling other shops' runs.
    if(!scopes.length) {return 0;}

    let written = 0;
    let firstError: unknown = null;
    for(const scope of scopes) {
      try {
        written += await syncScope(ctx, scope, args);
      } catch (error) {
        // one shop's failure must not stop the others
        firstError ||= error;
      }
    }

    // A truth-sensitive caller must be able to distinguish an authoritative empty scope from a
    // failed scope. Finish the other scopes first, then surface that at least one requested scope
    // could not be refreshed so it is never rendered as "Not started".
    if(firstError) {throw firstError;}

    return written + await enrich(ctx, args);
  },
  async refetchOne(ctx, pk) {
    const systemMessageId = pk?.systemMessageId;
    const shopId = pk?.shopId;
    if(!systemMessageId) {return 0;}

    const resp = await workerPost(ctx, ENDPOINT, {
      dataDocumentId: DATA_DOCUMENT_ID,
      customParametersMap: {
        systemMessageId,
        ...(shopId ? { remoteInternalId: shopId, remoteInternalIdType: SHOP_ID_TYPE } : {}),
      },
      pageSize: 1,
      pageIndex: 0,
    });
    const rows = unwrapCollection(resp, "entityValueList");

    return rows.length ? syncRunCache.upsertMany(rows) : 0;
  },
});
