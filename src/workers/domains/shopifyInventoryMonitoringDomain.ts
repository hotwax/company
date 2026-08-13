import {
  inventoryChannelCache,
  shopifyInventoryAdjustmentDetailCache,
  shopifyInventoryAdjustmentDetailProjection,
  systemMessageCache,
} from "@/utils/cacheEntities";
import { hasSyncedThisLogin, markSyncedThisLogin } from "@/utils/appCacheDb";
import { registerSyncDomain, type SyncContext } from "../syncRegistry";
import { unwrapCollection, workerGet, workerPost } from "./workerFetch";

const ENDPOINT = "oms/dataDocumentView";
const CHANNEL_DOCUMENT = "SHOPIFY_INVENTORY_CHANNEL";
const DETAIL_DOCUMENT = "SHOPIFY_INVENTORY_ADJUSTMENT_DETAIL";

interface DetailSyncArgs {
  shopId?: string;
  /** Recent event rows retained for history. Pending and unresolved rows are always included. */
  total?: number;
  batchSize?: number;
  /** Exact System Messages enriched per tick for payload/status visibility. */
  enrichMax?: number;
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
  shopId: string,
  wanted: number,
  batchSize: number,
): Promise<any[]> {
  const rows: any[] = [];
  for (let pageIndex = 0; rows.length < wanted; pageIndex += 1) {
    const page = await fetchDocumentPage(
      ctx,
      DETAIL_DOCUMENT,
      { shopId, orderByField: "-lastUpdatedStamp" },
      pageIndex,
      Math.min(batchSize, wanted - rows.length),
    );
    if (!page.length) break;
    rows.push(...page);
    if (page.length < Math.min(batchSize, wanted - rows.length + page.length)) break;
  }
  return rows.slice(0, wanted);
}

async function enrichBatchMessages(
  ctx: SyncContext,
  shopId: string,
  max: number,
): Promise<number> {
  const [details, messages] = await Promise.all([
    shopifyInventoryAdjustmentDetailCache.all(),
    systemMessageCache.all(),
  ]);
  const messageById = new Map(messages.map((message: any) => [String(message.systemMessageId), message]));
  const candidates = [...new Set(details
    .filter((detail: any) => String(detail.shopId) === shopId)
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
    const shopId = String(args.shopId ?? "");
    if (!shopId) return 0;

    const batchSize = args.batchSize ?? 50;
    const target = args.total ?? 500;
    const cached = await shopifyInventoryAdjustmentDetailCache.count({ field: "shopId", value: shopId });
    const wanted = cached < target ? target : batchSize;

    const [recent, pending, unresolved] = await Promise.all([
      fetchRecentDetails(ctx, shopId, wanted, batchSize),
      fetchAllDocumentRows(
        ctx,
        DETAIL_DOCUMENT,
        { shopId, detailStatusId: "DETAIL_PENDING", orderByField: "createdDate" },
        detailKey,
      ),
      fetchAllDocumentRows(
        ctx,
        DETAIL_DOCUMENT,
        {
          shopId,
          systemMessageStatusId: "SmsgProduced,SmsgSending,SmsgError",
          systemMessageStatusId_op: "in",
          orderByField: "-systemMessageInitDate",
        },
        detailKey,
      ),
    ]);

    const merged = new Map<string, any>();
    for (const row of [...recent, ...pending, ...unresolved]) {
      const key = detailKey(row);
      if (key) merged.set(key, row);
    }
    let written = merged.size
      ? await shopifyInventoryAdjustmentDetailCache.upsertMany([...merged.values()])
      : 0;
    written += await enrichBatchMessages(ctx, shopId, args.enrichMax ?? 40);
    return written;
  },
  async refetchOne(ctx, pk) {
    const eventKey = String(pk?.eventKey ?? "");
    const shopId = String(pk?.shopId ?? "");
    if (!eventKey || !shopId) return 0;
    const rows = await fetchAllDocumentRows(
      ctx,
      DETAIL_DOCUMENT,
      { eventKey, shopId },
      detailKey,
      100,
    );
    return rows.length ? shopifyInventoryAdjustmentDetailCache.upsertMany(rows) : 0;
  },
});
