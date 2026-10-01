import { dataFeedCache, inventoryChannelCache } from "@/utils/cacheEntities";
import { hasSyncedThisLogin, markSyncedThisLogin } from "@/utils/appCacheDb";
import { registerSyncDomain, type SyncContext } from "../syncRegistry";
import { pageAll, unwrapCollection, workerGet } from "./workerFetch";

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

registerSyncDomain({
  name: "shopifyInventoryEventFeed",
  async sync(ctx, _args, options) {
    if (!options?.force && await hasSyncedThisLogin("shopifyInventoryEventFeed")) return 0;
    const [channelFeed, locationFeed] = await Promise.all([
      fetchInventoryEventFeed(ctx, SHOPIFY_INVENTORY_EVENT_FEED_ID),
      fetchInventoryEventFeed(ctx, SHOPIFY_LOCATION_INVENTORY_EVENT_FEED_ID),
    ]);
    const feeds = [channelFeed, locationFeed].filter(Boolean);
    const result = await dataFeedCache.snapshotReplace(feeds);
    await markSyncedThisLogin("shopifyInventoryEventFeed");
    return result.written;
  },
  async refetchOne(ctx, pk) {
    const feedId = String(pk?.dataFeedId ?? "");
    if (feedId !== SHOPIFY_INVENTORY_EVENT_FEED_ID && feedId !== SHOPIFY_LOCATION_INVENTORY_EVENT_FEED_ID) return 0;
    const feed = await fetchInventoryEventFeed(ctx, feedId);
    if (!feed) {
      await dataFeedCache.remove(feedId);
      return 0;
    }
    return dataFeedCache.upsertMany([feed]);
  },
});

registerSyncDomain({
  name: "inventoryChannel",
  async sync(ctx, _args, options) {
    if (!options?.force && await hasSyncedThisLogin("inventoryChannel")) return 0;
    const rows = await pageAll({
      ctx,
      url: CHANNEL_ENDPOINT,
      collectionKey: DETAIL_COLLECTION,
      params: { orderByField: "inventoryChannelId" },
      keyOf: (row: any) => row?.inventoryChannelId ? String(row.inventoryChannelId) : undefined,
      label: CHANNEL_ENDPOINT,
    });
    const result = await inventoryChannelCache.snapshotReplace(rows);
    await markSyncedThisLogin("inventoryChannel");
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
    return rows.length ? inventoryChannelCache.upsertMany(rows) : 0;
  },
});
