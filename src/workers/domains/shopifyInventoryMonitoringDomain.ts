import { companyDb } from "@/db/companyDb";
import { defineSyncDomain } from "@common/db/sync/defineSyncDomain";
import type { SyncContext } from "@common/db/types";
import { pageAll, unwrapCollection, workerGet } from "@common/core/workerRemoteApi";

const companyClient = companyDb.client();
const dataFeedEntity = companyDb.entity(companyDb.tables.dataFeeds);
const inventoryChannelEntity = companyDb.entity(companyDb.tables.inventoryChannels);

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
/** Records pre-order and back-order supply changes; seeded by connector releases with future channels. */
const SHOPIFY_FUTURE_INVENTORY_EVENT_FEED_ID = "ShopifyFutureInventoryEventFeed";
const INVENTORY_EVENT_FEED_IDS = [
  SHOPIFY_INVENTORY_EVENT_FEED_ID,
  SHOPIFY_LOCATION_INVENTORY_EVENT_FEED_ID,
  SHOPIFY_FUTURE_INVENTORY_EVENT_FEED_ID,
];

async function fetchInventoryEventFeed(ctx: SyncContext, feedId: string = SHOPIFY_INVENTORY_EVENT_FEED_ID): Promise<any | null> {
  const response = await workerGet(
    ctx,
    `admin/dataFeeds/${feedId}`,
    {},
  );
  return response?.dataFeedId ? response : null;
}

/** Only a missing feed reads as "not configured"; an auth, network or server failure must fail the pass. */
function isNotFound(error: any): boolean {
  return Number(error?.status ?? error?.statusCode ?? error?.errorCode ?? error?.response?.status) === 404;
}

export const shopifyInventoryEventFeedDomain = defineSyncDomain({
  name: "shopifyInventoryEventFeed",
  table: "dataFeeds",
  label: "Shopify inventory event feed",
  syncClass: "B",
  async sync(ctx, _args, options) {
    if (!options?.force && await companyClient.syncedThisLogin("shopifyInventoryEventFeed")) return 0;
    // A connector without future channels has no future feed: that is "not configured", not a failed sync.
    const feeds = (await Promise.all(INVENTORY_EVENT_FEED_IDS.map((feedId) => feedId === SHOPIFY_FUTURE_INVENTORY_EVENT_FEED_ID
      ? fetchInventoryEventFeed(ctx, feedId).catch((error) => { if(isNotFound(error)) return null; throw error; })
      : fetchInventoryEventFeed(ctx, feedId))))
      .filter(Boolean);
    const result = await dataFeedEntity.snapshotReplace(feeds);
    await companyClient.markSyncedThisLogin("shopifyInventoryEventFeed");
    return result.written;
  },
  async refetchOne(ctx, pk) {
    const feedId = String(pk?.dataFeedId ?? "");
    if (!INVENTORY_EVENT_FEED_IDS.includes(feedId)) return 0;
    const feed = await fetchInventoryEventFeed(ctx, feedId);
    if (!feed) {
      await dataFeedEntity.remove(feedId);
      return 0;
    }
    return dataFeedEntity.upsertMany([feed]);
  },
});

export const inventoryChannelDomain = defineSyncDomain({
  name: "inventoryChannel",
  table: "inventoryChannels",
  label: "Shopify inventory channels",
  syncClass: "B",
  async sync(ctx, _args, options) {
    if (!options?.force && await companyClient.syncedThisLogin("inventoryChannel")) return 0;
    const rows = await pageAll({
      ctx,
      url: CHANNEL_ENDPOINT,
      collectionKey: DETAIL_COLLECTION,
      params: { orderByField: "inventoryChannelId" },
      keyOf: (row: any) => row?.inventoryChannelId ? String(row.inventoryChannelId) : undefined,
      label: CHANNEL_ENDPOINT,
    });
    const result = await inventoryChannelEntity.snapshotReplace(rows);
    await companyClient.markSyncedThisLogin("inventoryChannel");
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
