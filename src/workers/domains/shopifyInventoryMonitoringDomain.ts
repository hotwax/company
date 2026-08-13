import {
  dataFeedCache,
  inventoryChannelCache,
  shopifyInventoryAdjustmentDetailCache,
  shopifyInventoryAdjustmentDetailProjection,
  systemMessageCache,
} from "@/utils/cacheEntities";
import { hasSyncedThisLogin, markSyncedThisLogin } from "@/utils/appCacheDb";
import { registerSyncDomain, type SyncContext } from "../syncRegistry";
import { pageAll, pageNewestFirst, unwrapCollection, workerGet, workerPost } from "./workerFetch";

const ENDPOINT = "oms/dataDocumentView";
const CHANNEL_DOCUMENT = "SHOPIFY_INVENTORY_CHANNEL";
/**
 * Dedicated read resource over ShopifyInventoryAdjustmentDetailView, NOT a DataDocument. The
 * document this replaced kept its definition in DATA_DOCUMENT_FIELD rows, so a server-side re-key
 * left stale fields behind that no redeploy could clear and broke every query against it.
 */
const DETAIL_ENDPOINT = "sob/shopify/inventoryAdjustmentDetails";
/** Moqui entity-list responses are a bare array; unwrapCollection handles both shapes. */
const DETAIL_COLLECTION = null;
const SHOPIFY_INVENTORY_EVENT_FEED_ID = "ShopifyInventoryChannelEventFeed";

async function fetchInventoryEventFeed(ctx: SyncContext): Promise<any | null> {
  const response = await workerGet(
    ctx,
    `admin/dataFeeds/${SHOPIFY_INVENTORY_EVENT_FEED_ID}`,
    {},
  );
  return response?.dataFeedId ? response : null;
}

registerSyncDomain({
  name: "shopifyInventoryEventFeed",
  async sync(ctx, _args, options) {
    if (!options?.force && await hasSyncedThisLogin("shopifyInventoryEventFeed")) return 0;
    const feed = await fetchInventoryEventFeed(ctx);
    const result = await dataFeedCache.snapshotReplace(feed ? [feed] : []);
    await markSyncedThisLogin("shopifyInventoryEventFeed");
    return result.written;
  },
  async refetchOne(ctx, pk) {
    if (String(pk?.dataFeedId ?? "") !== SHOPIFY_INVENTORY_EVENT_FEED_ID) return 0;
    const feed = await fetchInventoryEventFeed(ctx);
    if (!feed) {
      await dataFeedCache.remove(SHOPIFY_INVENTORY_EVENT_FEED_ID);
      return 0;
    }
    return dataFeedCache.upsertMany([feed]);
  },
});

interface DetailSyncArgs {
  /**
   * The channels to read. Detail rows carry no shopId -- the channel is the target identity -- so
   * a shop-scoped screen resolves its channels first and passes them here.
   */
  inventoryChannelIds?: string[];
  /** Recent event rows retained for history. Pending and unresolved rows are always included. */
  total?: number;
  batchSize?: number;
  /** Exact System Messages enriched per tick for payload/status visibility. */
  enrichMax?: number;
}

/** Comma-joined `in` filter, the shape the DataDocument endpoint expects for a multi-value match. */
function channelFilter(inventoryChannelIds: string[]): Record<string, unknown> {
  return { inventoryChannelId: inventoryChannelIds.join(","), inventoryChannelId_op: "in" };
}

function detailKey(row: Record<string, unknown>): string | undefined {
  return shopifyInventoryAdjustmentDetailProjection.buildKey(row);
}

async function fetchDocumentPage(
  ctx: SyncContext,
  dataDocumentId: string,
  customParametersMap: Record<string, unknown>,
  pageIndex: number,
  pageSize: number,
): Promise<any[]> {
  const response = await workerPost(ctx, ENDPOINT, {
    dataDocumentId,
    customParametersMap,
    pageIndex,
    pageSize,
  });
  return unwrapCollection(response, "entityValueList");
}

/** Complete DataDocument walk with the same no-progress/backstop protections as pageAll(). */
async function fetchAllDocumentRows(
  ctx: SyncContext,
  dataDocumentId: string,
  customParametersMap: Record<string, unknown>,
  keyOf: (row: any) => string | undefined,
  batchSize = 250,
): Promise<any[]> {
  const rows: any[] = [];
  const seen = new Set<string>();
  const maxPages = 200;

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    const page = await fetchDocumentPage(
      ctx,
      dataDocumentId,
      customParametersMap,
      pageIndex,
      batchSize,
    );
    if (!page.length) break;

    let added = 0;
    for (const row of page) {
      const key = keyOf(row);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
      added += 1;
    }
    if (page.length < batchSize) break;
    if (!added) {
      console.warn(`[sync] ${dataDocumentId}: paging made no progress at page ${pageIndex}; stopping.`);
      break;
    }
    if (pageIndex === maxPages - 1) {
      console.warn(`[sync] ${dataDocumentId}: reached the ${maxPages}-page safety backstop.`);
    }
  }
  return rows;
}

registerSyncDomain({
  name: "inventoryChannel",
  async sync(ctx, _args, options) {
    if (!options?.force && await hasSyncedThisLogin("inventoryChannel")) return 0;
    const rows = await fetchAllDocumentRows(
      ctx,
      CHANNEL_DOCUMENT,
      { orderByField: "inventoryChannelId" },
      (row) => row?.inventoryChannelId ? String(row.inventoryChannelId) : undefined,
    );
    const result = await inventoryChannelCache.snapshotReplace(rows);
    await markSyncedThisLogin("inventoryChannel");
    return result.written;
  },
  async refetchOne(ctx, pk) {
    const inventoryChannelId = String(pk?.inventoryChannelId ?? "");
    if (!inventoryChannelId) return 0;
    const rows = await fetchDocumentPage(
      ctx,
      CHANNEL_DOCUMENT,
      { inventoryChannelId },
      0,
      1,
    );
    return rows.length ? inventoryChannelCache.upsertMany(rows) : 0;
  },
});

async function fetchRecentDetails(
  ctx: SyncContext,
  inventoryChannelIds: string[],
  wanted: number,
  batchSize: number,
): Promise<any[]> {
  return pageNewestFirst({
    ctx,
    url: DETAIL_ENDPOINT,
    collectionKey: DETAIL_COLLECTION,
    params: { ...channelFilter(inventoryChannelIds), orderByField: "-lastUpdatedStamp" },
    total: wanted,
    batchSize,
  });
}

async function enrichBatchMessages(
  ctx: SyncContext,
  inventoryChannelIds: string[],
  max: number,
): Promise<number> {
  const [details, messages] = await Promise.all([
    shopifyInventoryAdjustmentDetailCache.all(),
    systemMessageCache.all(),
  ]);
  const wanted = new Set(inventoryChannelIds.map(String));
  const messageById = new Map(messages.map((message: any) => [String(message.systemMessageId), message]));
  const candidates = [...new Set(details
    .filter((detail: any) => wanted.has(String(detail.inventoryChannelId)))
    .map((detail: any) => String(detail.systemMessageId ?? ""))
    .filter(Boolean))]
    .filter((id) => messageById.get(id)?.statusId !== "SmsgSent")
    .slice(0, max);

  let written = 0;
  for (const systemMessageId of candidates) {
    try {
      const response = await workerGet(ctx, "admin/systemMessages", {
        systemMessageId,
        systemMessageId_op: "equals",
        pageSize: 1,
      });
      const message = response?.systemMessages?.[0];
      if (message) written += await systemMessageCache.upsertMany([message]);
    } catch {
      // One message must not sink the ledger pass; a later tick retries it.
    }
  }
  return written;
}

registerSyncDomain({
  name: "shopifyInventoryAdjustmentDetail",
  intervalMs: 10_000,
  async sync(ctx, args: DetailSyncArgs = {}) {
    const inventoryChannelIds = (args.inventoryChannelIds ?? []).map(String).filter(Boolean);
    // No channels means nothing to read, NOT "read everything": an unscoped document query would
    // pull every shop's ledger into this shop's cache.
    if (!inventoryChannelIds.length) return 0;

    const batchSize = args.batchSize ?? 50;
    const target = args.total ?? 500;
    const counts = await Promise.all(inventoryChannelIds.map((inventoryChannelId) =>
      shopifyInventoryAdjustmentDetailCache.count({ field: "inventoryChannelId", value: inventoryChannelId })));
    const cached = counts.reduce((sum, count) => sum + count, 0);
    const wanted = cached < target ? target : batchSize;

    const [recent, pending, unresolved] = await Promise.all([
      fetchRecentDetails(ctx, inventoryChannelIds, wanted, batchSize),
      pageAll({
        ctx,
        url: DETAIL_ENDPOINT,
        collectionKey: DETAIL_COLLECTION,
        params: { ...channelFilter(inventoryChannelIds), detailStatusId: "DETAIL_PENDING", orderByField: "createdDate" },
        keyOf: detailKey,
        label: "inventoryAdjustmentDetails:pending",
      }),
      pageAll({
        ctx,
        url: DETAIL_ENDPOINT,
        collectionKey: DETAIL_COLLECTION,
        params: {
          ...channelFilter(inventoryChannelIds),
          systemMessageStatusId: "SmsgProduced,SmsgSending,SmsgError",
          systemMessageStatusId_op: "in",
          orderByField: "-systemMessageInitDate",
        },
        keyOf: detailKey,
        label: "inventoryAdjustmentDetails:unresolved",
      }),
    ]);

    const merged = new Map<string, any>();
    for (const row of [...recent, ...pending, ...unresolved]) {
      const key = detailKey(row);
      if (key) merged.set(key, row);
    }
    let written = merged.size
      ? await shopifyInventoryAdjustmentDetailCache.upsertMany([...merged.values()])
      : 0;
    written += await enrichBatchMessages(ctx, inventoryChannelIds, args.enrichMax ?? 40);
    return written;
  },
  async refetchOne(ctx, pk) {
    const eventKey = String(pk?.eventKey ?? "");
    const inventoryChannelId = String(pk?.inventoryChannelId ?? "");
    if (!eventKey || !inventoryChannelId) return 0;
    // shopifyInventoryItemId completes the PK but is left off on purpose: one event fans out across
    // items within a channel, and re-reading the whole fan-out keeps the group consistent.
    const rows = await pageAll({
      ctx,
      url: DETAIL_ENDPOINT,
      collectionKey: DETAIL_COLLECTION,
      params: { eventKey, inventoryChannelId },
      keyOf: detailKey,
      batchSize: 100,
      label: "inventoryAdjustmentDetails:refetchOne",
    });
    return rows.length ? shopifyInventoryAdjustmentDetailCache.upsertMany(rows) : 0;
  },
});
