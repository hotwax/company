import { INVENTORY_EVENT_DOMAINS } from "@/config/appSyncConfig";
import type { CachedEntity } from "@/utils/appCacheDb";
import {
  locationInventoryAdjustmentKey,
  shopifyInventoryAdjustmentDetailCache,
  shopifyInventoryAdjustmentDetailProjection,
  shopifyInventoryItemCache,
  shopifyInventoryItemKey,
  shopifyLocationInventoryAdjustmentDetailCache,
  systemMessageCache,
} from "@/utils/cacheEntities";
import { toMillis } from "@/utils/cacheProjection";
import { type InventoryEventKind, deliveryStateOf, effectiveMessageOf, isUnsettledMessage } from "@/utils/inventoryEvents";
import { type SyncContext, registerSyncDomain } from "../syncRegistry";
import { pageAll, workerGet, workerPost } from "./workerFetch";

/**
 * Class A for as long as the user is in a shop's inventory sync pages (`src/services/inventorySyncArea.ts`).
 * Both ledgers share the pollers: the rows poller reads the newest 500, then rows whose
 * `detailLastUpdatedStamp` moved; the message poller reads rows whose joined
 * `systemMessageLastUpdatedStamp` moved. An OMS without the cursor aliases still gets its window stored,
 * just not re-polled until a manual refresh; the page says live updates are off.
 */

const RECENT_WINDOW = 500;
const PAGE_SIZE = 250;
const POLL_INTERVAL_MS = 10_000;
/** A row committed late by a transaction that started early carries a stamp older than the cursor. */
const CURSOR_OVERLAP_MS = 60_000;
/** The connector's own purge window. */
const RETENTION_MS = 5 * 24 * 60 * 60 * 1000;
const PRUNE_EVERY_MS = 10 * 60 * 1000;
const MESSAGE_REFRESH_MAX = 25;
/** Two requests of 100 items per tick, so a cold page does not burst the quota the OMS's own jobs share. */
const INVENTORY_ITEM_BATCH_SIZE = 100;
const INVENTORY_ITEM_REQUESTS_PER_TICK = 2;

interface LedgerDefinition {
  kind: InventoryEventKind;
  rowsDomain: string;
  messageDomain: string;
  endpoint: string;
  cache: CachedEntity;
  keyOf: (raw: Record<string, unknown>) => string | undefined;
}

export const INVENTORY_LEDGERS: Record<InventoryEventKind, LedgerDefinition> = {
  channel: {
    kind: "channel",
    rowsDomain: INVENTORY_EVENT_DOMAINS.channelRows,
    messageDomain: INVENTORY_EVENT_DOMAINS.channelMessages,
    endpoint: "sob/shopify/inventoryAdjustmentDetails",
    cache: shopifyInventoryAdjustmentDetailCache,
    keyOf: (raw) => shopifyInventoryAdjustmentDetailProjection.buildKey(raw),
  },
  location: {
    kind: "location",
    rowsDomain: INVENTORY_EVENT_DOMAINS.locationRows,
    messageDomain: INVENTORY_EVENT_DOMAINS.locationMessages,
    endpoint: "sob/shopify/locationInventoryAdjustmentDetails",
    cache: shopifyLocationInventoryAdjustmentDetailCache,
    keyOf: locationInventoryAdjustmentKey,
  },
};

interface ShopArgs { shopId?: string }

function shopOf(args: ShopArgs | undefined): string {
  return String(args?.shopId ?? "").trim();
}

/** The entity list answers with an array, the older location service with `{ details }`. */
function ledgerRowsOf(response: any, label: string): Array<Record<string, any>> {
  if(Array.isArray(response)) {return response;}
  if(Array.isArray(response?.details)) {return response.details;}
  throw new Error(`[sync] ${label}: unexpected response shape.`);
}

/** `kind|shopId` whose window came back with no update stamps: re-read only on a manual refresh. */
const windowOnlyLedgers = new Set<string>();

/** An overlapped cursor read returns cached rows every quiet tick; rewriting them re-renders every list. */
async function changedRows(ledger: LedgerDefinition, rows: Array<Record<string, any>>): Promise<Array<Record<string, any>>> {
  const keyed = rows.map((row) => ({ row, key: ledger.keyOf(row) })).filter((entry): entry is { row: Record<string, any>; key: string } => !!entry.key);
  const cached = await ledger.cache.getMany(keyed.map((entry) => entry.key));

  return keyed.filter((entry, index) => {
    const before = cached[index]?.raw as Record<string, any> | undefined;
    if(!before) {return true;}

    return toMillis(before.detailLastUpdatedStamp) !== toMillis(entry.row.detailLastUpdatedStamp) ||
      toMillis(before.systemMessageLastUpdatedStamp) !== toMillis(entry.row.systemMessageLastUpdatedStamp) ||
      String(before.systemMessageId ?? "") !== String(entry.row.systemMessageId ?? "") ||
      String(before.systemMessageStatusId ?? "") !== String(entry.row.systemMessageStatusId ?? "");
  }).map((entry) => entry.row);
}

async function scopedRows(cache: CachedEntity, shopId: string) {
  return (await cache.all()).filter((row) => String(row.shopId ?? "") === shopId);
}

const lastPruneAt = new Map<string, number>();

/** Upserts never remove, so settled rows past the server's purge window are dropped here. */
async function pruneSettled(ledger: LedgerDefinition, shopId: string, now: number): Promise<void> {
  const pruneKey = `${ledger.kind}|${shopId}`;
  if(now - (lastPruneAt.get(pruneKey) ?? 0) < PRUNE_EVERY_MS) {return;}
  lastPruneAt.set(pruneKey, now);
  const cutoff = now - RETENTION_MS;
  const stale = (await scopedRows(ledger.cache, shopId)).filter((row) => {
    const raw = row.raw as Record<string, any>;
    if((toMillis(raw.createdDate) ?? now) >= cutoff) {return false;}
    const state = deliveryStateOf(raw.systemMessageId || undefined, Number(raw.computedInventoryChange ?? 0), raw.systemMessageStatusId);

    return state.id === "noChange" || state.id === "sent" || state.id === "cancelled";
  });
  await ledger.cache.removeMany(stale.map((row) => ledger.keyOf(row.raw) ?? "").filter(Boolean));
}

function cursorRead(
  ctx: SyncContext,
  ledger: LedgerDefinition,
  shopId: string,
  cursorField: "detailLastUpdatedStamp" | "systemMessageLastUpdatedStamp",
  cursor: number,
): Promise<Array<Record<string, any>>> {
  return pageAll({
    ctx,
    url: ledger.endpoint,
    collectionKey: null,
    strictCollection: true,
    batchSize: PAGE_SIZE,
    keyOf: ledger.keyOf,
    label: `${ledger.endpoint}:${cursorField}`,
    params: { shopId, [`${cursorField}_from`]: Math.max(0, cursor - CURSOR_OVERLAP_MS), orderByField: cursorField },
  });
}

for(const ledger of Object.values(INVENTORY_LEDGERS)) {
  registerSyncDomain({
    name: ledger.rowsDomain,
    intervalMs: POLL_INTERVAL_MS,
    async sync(ctx, args: ShopArgs = {}, options) {
      const shopId = shopOf(args);
      // An unscoped list would pull every shop's ledger into this shop's cache.
      if(!shopId) {return 0;}
      const windowKey = `${ledger.kind}|${shopId}`;
      if(windowOnlyLedgers.has(windowKey) && !options?.force) {return 0;}
      const cursor = windowOnlyLedgers.has(windowKey)
        ? undefined
        : await ledger.cache.newestCursor("detailLastUpdatedStamp", { field: "shopId", value: shopId });
      let changed: Array<Record<string, any>>;
      if(cursor === undefined) {
        const rows = ledgerRowsOf(await workerGet(ctx, ledger.endpoint, {
          shopId, orderByField: "-createdDate", pageSize: RECENT_WINDOW, pageIndex: 0,
        }), ledger.endpoint);
        const stamped = rows.some((row) => toMillis(row?.detailLastUpdatedStamp) !== undefined);
        if(rows.length && !stamped) {windowOnlyLedgers.add(windowKey);} else {windowOnlyLedgers.delete(windowKey);}
        // Written whole, so a row cached by an older build's projection is rewritten in this one's shape.
        changed = rows;
      } else {
        changed = await changedRows(ledger, await cursorRead(ctx, ledger, shopId, "detailLastUpdatedStamp", cursor));
      }
      const written = changed.length ? await ledger.cache.upsertMany(changed) : 0;
      await pruneSettled(ledger, shopId, Date.now());

      return written;
    },
  });

  registerSyncDomain({
    name: ledger.messageDomain,
    intervalMs: POLL_INTERVAL_MS,
    async sync(ctx, args: ShopArgs = {}) {
      const shopId = shopOf(args);
      if(!shopId) {return 0;}
      const cursor = await ledger.cache.newestCursor("systemMessageLastUpdatedStamp", { field: "shopId", value: shopId });
      // Nothing is batched yet; the rows poller brings the first message stamp in.
      if(cursor === undefined) {return 0;}
      const changed = await changedRows(ledger, await cursorRead(ctx, ledger, shopId, "systemMessageLastUpdatedStamp", cursor));

      return changed.length ? ledger.cache.upsertMany(changed) : 0;
    },
  });
}

/** Unsettled batches' messages, one request each: `admin/systemMessages` ignores `_op=in` (verified live). */
registerSyncDomain({
  name: INVENTORY_EVENT_DOMAINS.systemMessages,
  intervalMs: POLL_INTERVAL_MS,
  async sync(ctx, args: ShopArgs = {}) {
    const shopId = shopOf(args);
    if(!shopId) {return 0;}
    const rows = (await Promise.all(Object.values(INVENTORY_LEDGERS).map((ledger) => scopedRows(ledger.cache, shopId)))).flat()
      .filter((row) => row.raw?.systemMessageId);
    const newestRowByMessage = new Map<string, any>();
    for(const row of rows) {
      const id = String(row.raw.systemMessageId);
      if((row.cachedAt ?? 0) >= (newestRowByMessage.get(id)?.cachedAt ?? -1)) {newestRowByMessage.set(id, row);}
    }
    const ids = [...newestRowByMessage.keys()];
    const cachedMessages = await systemMessageCache.getMany(ids);
    const unsettled = ids.filter((id, index) => {
      const row = newestRowByMessage.get(id);
      const cached = cachedMessages[index];
      const message = effectiveMessageOf(row.raw, row.cachedAt, cached ? { statusId: String(cached.raw?.statusId ?? ""), cachedAt: cached.cachedAt } : undefined);

      return isUnsettledMessage(message?.statusId);
    }).sort((a, b) => b.localeCompare(a, undefined, { numeric: true })).slice(0, MESSAGE_REFRESH_MAX);

    let written = 0;
    for(const systemMessageId of unsettled) {
      try {
        const response = await workerGet(ctx, "admin/systemMessages", { systemMessageId, pageSize: 1 });
        const message = response?.systemMessages?.find((entry: any) => String(entry?.systemMessageId) === systemMessageId);
        if(message) {written += await systemMessageCache.upsertMany([message]);}
      } catch {
        // One message must not sink the pass; the next tick retries it.
      }
    }

    return written;
  },
});

/** A node is `null` for an item Shopify no longer has, and its `variant` can be `null` too. */
const INVENTORY_ITEMS_QUERY = "query($ids: [ID!]!) { nodes(ids: $ids) { ... on InventoryItem { id sku variant { id title image { url } product { id title featuredMedia { preview { image { url } } } } } } } }";

/** Items Shopify has no variant for: one request per gap, not one per tick. */
const unknownInventoryItems = new Set<string>();
/** Shops the lookup cannot work for this session (no resource, no permission, refused token): left unnamed. */
const shopifyLookupUnavailable = new Set<string>();

/** `gid://shopify/ProductVariant/123` → `123`. */
function gidTail(gid: unknown): string {
  const text = String(gid ?? "");

  return text.slice(text.lastIndexOf("/") + 1);
}

/** Shopify spells access errors several ways. */
const SHOPIFY_ACCESS_ERROR = /access denied|unauthori[sz]ed|not authorized|invalid api key|access token/i;

type InventoryItemLookup = { nodes: any[] } | "unavailable" | "throttled";

/** `shopify/graphql` answers `{ cost, response, statusCode }`; anything not a refusal or throttle throws. */
function readInventoryItemLookup(envelope: any): InventoryItemLookup {
  const payload = envelope?.response ?? envelope?.data ?? envelope;
  const errors = [...new Set([envelope?.errors, payload?.errors])].flatMap((entry) => (entry ? [entry].flat() : []));
  const statusCode = Number(envelope?.statusCode ?? 200);
  const codes = errors.map((error) => String(error?.extensions?.code ?? ""));
  const text = errors.map((error) => (typeof error === "string" ? error : String(error?.message ?? JSON.stringify(error)))).join("; ");
  if([401, 403, 404].includes(statusCode) || codes.includes("ACCESS_DENIED") || SHOPIFY_ACCESS_ERROR.test(text)) {return "unavailable";}
  if(statusCode === 429 || codes.includes("THROTTLED")) {return "throttled";}
  if(statusCode >= 300 || errors.length) {
    throw new Error(`[sync] shopify/graphql: inventory item lookup failed (${statusCode})${text ? `: ${text}` : ""}`);
  }
  const nodes = payload?.nodes ?? payload?.data?.nodes;
  if(!Array.isArray(nodes)) {throw new Error("[sync] shopify/graphql: unexpected response shape.");}

  return { nodes };
}

/** Below half the shop's Shopify budget, the rest of the pass waits for the next tick. */
function budgetRunningLow(envelope: any): boolean {
  const throttle = envelope?.cost?.throttleStatus ?? envelope?.response?.extensions?.cost?.throttleStatus;
  const available = Number(throttle?.currentlyAvailable);
  const maximum = Number(throttle?.maximumAvailable);

  return Number.isFinite(available) && Number.isFinite(maximum) && maximum > 0 && available < maximum / 2;
}

function inventoryItemRowOf(shopId: string, shopifyInventoryItemId: string, node: any): Record<string, string> {
  const variant = node.variant;
  const product = variant.product ?? {};

  return {
    shopId,
    shopifyInventoryItemId,
    sku: String(node.sku ?? ""),
    shopifyVariantId: gidTail(variant.id),
    variantTitle: String(variant.title ?? ""),
    shopifyProductId: gidTail(product.id),
    productTitle: String(product.title ?? ""),
    imageUrl: String(variant.image?.url || product.featuredMedia?.preview?.image?.url || ""),
  };
}

/** Uncached inventory items, newest row first so the top of the history is named before the tail. */
async function unresolvedInventoryItems(shopId: string): Promise<string[]> {
  const rows = (await Promise.all(Object.values(INVENTORY_LEDGERS).map((ledger) => scopedRows(ledger.cache, shopId)))).flat()
    .sort((a, b) => (toMillis(b.raw?.createdDate) ?? 0) - (toMillis(a.raw?.createdDate) ?? 0));
  const items = new Set<string>();
  for(const row of rows) {
    const item = String(row.raw?.shopifyInventoryItemId ?? "");
    if(!item || unknownInventoryItems.has(shopifyInventoryItemKey(shopId, item))) {continue;}
    // Only a numeric id can be a Shopify global id; one malformed id would fail its whole batch forever.
    if(!/^\d+$/.test(item)) {unknownInventoryItems.add(shopifyInventoryItemKey(shopId, item)); continue;}
    items.add(item);
  }
  const candidates = [...items];
  const cached = await shopifyInventoryItemCache.getMany(candidates.map((item) => shopifyInventoryItemKey(shopId, item)));

  return candidates.filter((_, index) => !cached[index]);
}

/** The ledgers name an inventory item, not a product, so Shopify's `nodes` query names it. */
registerSyncDomain({
  name: INVENTORY_EVENT_DOMAINS.products,
  intervalMs: POLL_INTERVAL_MS,
  async sync(ctx, args: ShopArgs = {}) {
    const shopId = shopOf(args);
    if(!shopId || shopifyLookupUnavailable.has(shopId)) {return 0;}
    const missing = await unresolvedInventoryItems(shopId);

    let written = 0;
    for(let request = 0; request < INVENTORY_ITEM_REQUESTS_PER_TICK; request++) {
      const ids = missing.slice(request * INVENTORY_ITEM_BATCH_SIZE, (request + 1) * INVENTORY_ITEM_BATCH_SIZE);
      if(!ids.length) {break;}
      let envelope: any;
      try {
        envelope = await workerPost(ctx, "shopify/graphql", {
          shopId,
          queryText: INVENTORY_ITEMS_QUERY,
          variables: { ids: ids.map((id) => `gid://shopify/InventoryItem/${id}`) },
        });
      } catch (error: any) {
        // A 401 is an expired OMS session, which the harness answers by re-authenticating.
        if(![403, 404].includes(Number(error?.errorCode ?? error?.status ?? error?.statusCode))) {throw error;}
        envelope = { statusCode: 404 };
      }
      const lookup = readInventoryItemLookup(envelope);
      if(lookup === "unavailable") {
        shopifyLookupUnavailable.add(shopId);

        return written;
      }
      if(lookup === "throttled") {break;}

      const nodesById = new Map<string, any>();
      for(const node of lookup.nodes) {if(node?.id) {nodesById.set(gidTail(node.id), node);}}
      const rows: Array<Record<string, string>> = [];
      for(const id of ids) {
        const node = nodesById.get(id);
        if(node?.variant) {rows.push(inventoryItemRowOf(shopId, id, node));} else {unknownInventoryItems.add(shopifyInventoryItemKey(shopId, id));}
      }
      if(rows.length) {written += await shopifyInventoryItemCache.upsertMany(rows);}
      if(budgetRunningLow(envelope)) {break;}
    }

    return written;
  },
});
