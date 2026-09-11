import { companyDb } from "@/db/companyDb";
import { hasSyncedThisLogin, markSyncedThisLogin } from "@common/db";
import { canonicalKey, entityKeyOf } from "@common/db/projection";
import { defineSyncDomain } from "@common/db/sync/defineSyncDomain";
import type { SyncContext } from "@common/db/types";
import { pageAll, pageNewestFirst, unwrapCollection, workerGet } from "@common/core/workerRemoteApi";

const dataFeedEntity = companyDb.entity("dataFeeds");
const inventoryChannelEntity = companyDb.entity("inventoryChannels");
const shopifyInventoryAdjustmentDetailEntity = companyDb.entity("shopifyInventoryAdjustmentDetails");
const systemMessageEntity = companyDb.entity("systemMessages");

/**
 * Dedicated read resource over ShopifyInventoryChannelView, NOT a DataDocument.
 *
 * This used to be POST oms/dataDocumentView with dataDocumentId SHOPIFY_INVENTORY_CHANNEL. That
 * document is retired by the connector release that adds the aggregate event ledger, and its rows
 * are deleted by UpgradeSQL.sql - so the old call returns
 * 400 "No DataDocument found with ID SHOPIFY_INVENTORY_CHANNEL" and this page rendered
 * "No inventory channels are mapped for this connection" for channels that plainly existed,
 * including one the page had just created. It also starved every panel downstream that scopes by
 * channel, which showed configured jobs as "Not configured".
 *
 * The view carries facilityGroupName exactly as the document did, so channel labels are unchanged.
 */
const CHANNEL_ENDPOINT = "sob/shopify/inventoryChannels";
/**
 * Dedicated read resource over ShopifyInventoryAdjustmentDetailView, NOT a DataDocument. The
 * document this replaced kept its definition in DATA_DOCUMENT_FIELD rows, so a server-side re-key
 * left stale fields behind that no redeploy could clear and broke every query against it.
 */
const DETAIL_ENDPOINT = "sob/shopify/inventoryAdjustmentDetails";
/** Moqui entity-list responses are a bare array; unwrapCollection handles both shapes. */
const DETAIL_COLLECTION = null;
const SHOPIFY_INVENTORY_EVENT_FEED_ID = "ShopifyInventoryChannelEventFeed";
const SHOPIFY_LOCATION_INVENTORY_EVENT_FEED_ID = "ShopifyShopLocationInventoryEventFeed";

async function fetchInventoryEventFeed(ctx: SyncContext, feedId: string = SHOPIFY_INVENTORY_EVENT_FEED_ID): Promise<any | null> {
  const response = await workerGet(
    ctx,
    `admin/dataFeeds/${feedId}`,
    {},
  );
  return response?.dataFeedId ? response : null;
}

export const shopifyInventoryEventFeedDomain = defineSyncDomain({
  name: "shopifyInventoryEventFeed",
  table: "dataFeeds",
  label: "Shopify inventory event feed",
  syncClass: "B",
  async sync(ctx, _args, options) {
    if (!options?.force && await hasSyncedThisLogin(companyDb.raw(), "shopifyInventoryEventFeed")) return 0;
    const [channelFeed, locationFeed] = await Promise.all([
      fetchInventoryEventFeed(ctx, SHOPIFY_INVENTORY_EVENT_FEED_ID),
      fetchInventoryEventFeed(ctx, SHOPIFY_LOCATION_INVENTORY_EVENT_FEED_ID),
    ]);
    const feeds = [channelFeed, locationFeed].filter(Boolean);
    const result = await dataFeedEntity.snapshotReplace(feeds);
    await markSyncedThisLogin(companyDb.raw(), "shopifyInventoryEventFeed");
    return result.written;
  },
  async refetchOne(ctx, pk) {
    const feedId = String(pk?.dataFeedId ?? "");
    if (feedId !== SHOPIFY_INVENTORY_EVENT_FEED_ID && feedId !== SHOPIFY_LOCATION_INVENTORY_EVENT_FEED_ID) return 0;
    const feed = await fetchInventoryEventFeed(ctx, feedId);
    if (!feed) {
      await dataFeedEntity.remove(feedId);
      return 0;
    }
    return dataFeedEntity.upsertMany([feed]);
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
  const key = entityKeyOf(row, companyDb.entities.shopifyInventoryAdjustmentDetail);
  return key ? canonicalKey(key) : undefined;
}

export const inventoryChannelDomain = defineSyncDomain({
  name: "inventoryChannel",
  table: "inventoryChannels",
  label: "Shopify inventory channels",
  syncClass: "B",
  async sync(ctx, _args, options) {
    if (!options?.force && await hasSyncedThisLogin(companyDb.raw(), "inventoryChannel")) return 0;
    const rows = await pageAll({
      ctx,
      url: CHANNEL_ENDPOINT,
      collectionKey: DETAIL_COLLECTION,
      params: { orderByField: "inventoryChannelId" },
      keyOf: (row: any) => row?.inventoryChannelId ? String(row.inventoryChannelId) : undefined,
      label: CHANNEL_ENDPOINT,
    });
    const result = await inventoryChannelEntity.snapshotReplace(rows);
    await markSyncedThisLogin(companyDb.raw(), "inventoryChannel");
    return result.written;
  },
  async refetchOne(ctx, pk) {
    const inventoryChannelId = String(pk?.inventoryChannelId ?? "");
    if (!inventoryChannelId) return 0;
    const response = await workerGet(ctx, CHANNEL_ENDPOINT, {
      inventoryChannelId,
      pageIndex: 0,
      pageSize: 1,
    });
    const rows = unwrapCollection(response, DETAIL_COLLECTION);
    return rows.length ? inventoryChannelEntity.upsertMany(rows) : 0;
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
    shopifyInventoryAdjustmentDetailEntity.all(),
    systemMessageEntity.all(),
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
      if (message) written += await systemMessageEntity.upsertMany([message]);
    } catch {
      // One message must not sink the ledger pass; a later tick retries it.
    }
  }
  return written;
}

export const shopifyInventoryAdjustmentDetailDomain = defineSyncDomain({
  name: "shopifyInventoryAdjustmentDetail",
  table: "shopifyInventoryAdjustmentDetails",
  label: "Shopify aggregate inventory events",
  syncClass: "A",
  intervalMs: 10_000,
  async sync(ctx, args: DetailSyncArgs = {}) {
    const inventoryChannelIds = (args.inventoryChannelIds ?? []).map(String).filter(Boolean);
    // No channels means nothing to read, NOT "read everything": an unscoped document query would
    // pull every shop's ledger into this shop's cache.
    if (!inventoryChannelIds.length) return 0;

    const batchSize = args.batchSize ?? 50;
    const target = args.total ?? 500;
    const counts = await Promise.all(inventoryChannelIds.map((inventoryChannelId) =>
      shopifyInventoryAdjustmentDetailEntity.count({ field: "inventoryChannelId", value: inventoryChannelId })));
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
      ? await shopifyInventoryAdjustmentDetailEntity.upsertMany([...merged.values()])
      : 0;
    written += await enrichBatchMessages(ctx, inventoryChannelIds, args.enrichMax ?? 40);
    return written;
  },
  async refetchOne(ctx, pk) {
    // The event identity is two columns now, not one packed eventKey: the type says what kind of
    // source event this was, the reference says which occurrence of it.
    const eventTypeId = String(pk?.eventTypeId ?? "");
    const eventReferenceId = String(pk?.eventReferenceId ?? "");
    const inventoryChannelId = String(pk?.inventoryChannelId ?? "");
    if (!eventTypeId || !eventReferenceId || !inventoryChannelId) return 0;
    // shopifyInventoryItemId completes the PK but is left off on purpose: one event fans out across
    // items within a channel, and re-reading the whole fan-out keeps the group consistent.
    const rows = await pageAll({
      ctx,
      url: DETAIL_ENDPOINT,
      collectionKey: DETAIL_COLLECTION,
      params: { eventTypeId, eventReferenceId, inventoryChannelId },
      keyOf: detailKey,
      batchSize: 100,
      label: "inventoryAdjustmentDetails:refetchOne",
    });
    return rows.length ? shopifyInventoryAdjustmentDetailEntity.upsertMany(rows) : 0;
  },
});
