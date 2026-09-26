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
 * THE INVENTORY EVENT AREA — class A, activated for as long as the user is anywhere in a shop's
 * inventory sync pages (see `src/services/inventorySyncArea.ts`), not per view.
 *
 * Both Shopify inventory ledgers are read by the SAME pollers, because their read views are the same
 * shape: scoped by `shopId`, entity-list resources with SQL offset/limit, and two update cursors.
 *
 *   rows poller     first visit: the shop's newest 500 by createdDate. After that: every row whose own
 *                   `detailLastUpdatedStamp` moved since the newest one cached — new rows, and rows the
 *                   publisher has since claimed into a batch.
 *   message poller  every row whose joined `systemMessageLastUpdatedStamp` moved since the newest one
 *                   cached — the batch it is in reached Shopify, failed, or was retried. Neither poller
 *                   sees the other's change, which is why there are two.
 *
 * Plus two helpers over what the pollers cached: `inventoryEventSystemMessage` re-reads the System
 * Messages that are not yet settled (for their payload and the freshest status), and
 * `inventoryEventProduct` asks Shopify which variant and product each inventory item the ledgers carry
 * belongs to.
 *
 * AN OMS WITHOUT THE CURSORS STILL GETS ITS DATA, just not live. A connector older than the cursor
 * aliases returns rows with no `detailLastUpdatedStamp`: the rows poller stores that window as usual and
 * then stops re-polling the ledger for the rest of this worker's life, because without a cursor every
 * further read could only be the same window again. A manual refresh re-reads it. The page tells the
 * reader live updates are off (it can see the stamps are missing on the rows), rather than this being
 * a sync error. The same connector serves the location ledger through a service that wraps its rows in
 * `details`, which is read the same way.
 */

const RECENT_WINDOW = 500;
const PAGE_SIZE = 250;
const POLL_INTERVAL_MS = 10_000;
/**
 * The cursor is re-read with this much overlap. A row committed just after a read, by a transaction
 * that started before it, carries a stamp older than rows the read already returned; without the
 * overlap it would fall behind the cursor and never be seen.
 */
const CURSOR_OVERLAP_MS = 60_000;
/** Settled rows older than the connector's own purge window leave the cache too. */
const RETENTION_MS = 5 * 24 * 60 * 60 * 1000;
const PRUNE_EVERY_MS = 10 * 60 * 1000;
/** Unsettled messages re-read per tick. The set is normally the handful of batches in flight. */
const MESSAGE_REFRESH_MAX = 25;
/** Inventory items per Shopify `nodes` request. Shopify accepts 250; this keeps each query's cost modest. */
const INVENTORY_ITEM_BATCH_SIZE = 100;
/**
 * Shopify requests per tick. A cold page for a shop with a thousand items converges over a few ticks
 * instead of bursting the shop's Shopify API quota, which the OMS's own sync jobs draw on too.
 */
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

/**
 * A ledger read's rows: the entity-list resource answers with a bare array, the older location service
 * with `{ details: [...] }`. Anything else is a real failure and must not be read as "no rows".
 */
function ledgerRowsOf(response: any, label: string): Array<Record<string, any>> {
  if(Array.isArray(response)) {return response;}
  if(Array.isArray(response?.details)) {return response.details;}
  throw new Error(`[sync] ${label}: unexpected response shape.`);
}

/** `lastUpdatedStamp` is set on every create, so a window with no stamp at all is an OMS without the cursors. */
function carriesUpdateCursor(rows: Array<Record<string, any>>): boolean {
  return rows.some((row) => toMillis(row?.detailLastUpdatedStamp) !== undefined);
}

/**
 * `kind|shopId` pairs whose OMS returned a window with no update cursor. Their window is already stored,
 * and re-reading it every tick would be polling in all but name, so the rows poller rests until a manual
 * refresh or a new worker (leaving and re-entering the inventory pages).
 */
const windowOnlyLedgers = new Set<string>();

/**
 * Only rows that differ from the cached copy are written. The cursor read is inclusive and overlapped,
 * so every quiet tick returns rows already cached; rewriting them would re-render every open list for
 * nothing.
 */
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

/**
 * Drop settled rows past the connector's retention window. Upserts never remove anything, so without
 * this the cache would keep every row it ever saw while the server purges them after five days.
 */
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
      // No shop means nothing to read, NOT "read everything": an unscoped list would pull every
      // shop's ledger into this shop's cache.
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
        if(rows.length && !carriesUpdateCursor(rows)) {windowOnlyLedgers.add(windowKey);} else {windowOnlyLedgers.delete(windowKey);}
        // A window read is rare (first visit, manual refresh) and is written whole. Skipping rows whose
        // server fields are unchanged would also skip rows the cache holds in an older projection -- a
        // row written by a previous build keeps its old shape forever, invisible to this build's indexes.
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
      // Nothing cached is batched yet. The rows poller is what brings the first message stamp in, when
      // the publisher claims a row.
      if(cursor === undefined) {return 0;}
      const changed = await changedRows(ledger, await cursorRead(ctx, ledger, shopId, "systemMessageLastUpdatedStamp", cursor));

      return changed.length ? ledger.cache.upsertMany(changed) : 0;
    },
  });
}

/**
 * Re-read the System Messages behind this shop's batched rows that are not settled yet, one by id.
 *
 * One request per message because `admin/systemMessages` honours no `_op` (verified live: five known
 * ids with `systemMessageId_op=in` returned zero rows). The set is the batches currently in flight, so
 * it is small, and it is capped per tick.
 */
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

/**
 * Verified live against a production OMS: 250 inventory items resolved in one request of about 600ms.
 * A node is `null` for an item Shopify no longer has, and a node's `variant` can be `null` too.
 */
const INVENTORY_ITEMS_QUERY = "query($ids: [ID!]!) { nodes(ids: $ids) { ... on InventoryItem { id sku variant { id title displayName image { url } product { id title featuredMedia { preview { image { url } } } } } } } }";

/** `shopId|inventoryItemId`s Shopify has no variant for, so a gap costs one request, not one per tick. */
const unknownInventoryItems = new Set<string>();
/**
 * Shops whose Shopify lookup cannot work this session: an OMS without the `shopify/graphql` resource
 * (404), an OMS user not permitted to call it (403), or a shop whose Shopify access token Shopify
 * refuses. Products then stay unnamed on screen — the rows still show their inventory item — rather than
 * the page reporting a sync failure every tick for access that will not appear mid-session.
 */
const shopifyLookupUnavailable = new Set<string>();

/** `gid://shopify/ProductVariant/123` → `123`. */
function gidTail(gid: unknown): string {
  const text = String(gid ?? "");

  return text.slice(text.lastIndexOf("/") + 1);
}

/**
 * A refusal from the OMS itself that this session will not outgrow. A 401 is NOT one: that is an expired
 * OMS session, which the harness answers by re-authenticating, so it is rethrown untouched.
 */
function isUnavailableOnOms(error: any): boolean {
  const status = Number(error?.errorCode ?? error?.status ?? error?.statusCode);

  return status === 404 || status === 403;
}

/** Access errors are matched on wording as well as code, because Shopify spells them several ways. */
const SHOPIFY_ACCESS_ERROR = /access denied|unauthori[sz]ed|not authorized|invalid api key|access token/i;

type InventoryItemLookup = { nodes: any[] } | "unavailable" | "throttled";

/**
 * Read `shopify/graphql`'s envelope, `{ cost, response, statusCode }`, where `response` is Shopify's
 * GraphQL payload and `statusCode` Shopify's HTTP status. Errors are checked on both levels. Anything not
 * recognisably a refusal or a throttle throws, so the sync status shows it and the batch is retried.
 */
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

/**
 * Whether the shop's Shopify query budget is below half after this request. The budget is shared with the
 * OMS's own Shopify jobs, so the rest of this pass waits for the next tick rather than draining it.
 */
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
    variantDisplayName: String(variant.displayName ?? ""),
    shopifyProductId: gidTail(product.id),
    productTitle: String(product.title ?? ""),
    imageUrl: String(variant.image?.url || product.featuredMedia?.preview?.image?.url || ""),
  };
}

/**
 * The inventory items this shop's cached rows carry that have no cached Shopify item yet, newest row
 * first so the top of the history names its products before the tail does.
 */
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

/**
 * Name the products behind the inventory items this shop's cached rows carry, from Shopify itself.
 *
 * The ledgers identify a Shopify inventory item and no product, so each item is looked up with Shopify's
 * `nodes` query (through the OMS's `shopify/graphql`, by `shopId`) and its SKU, variant, product and image
 * are cached under `shopId|shopifyInventoryItemId`, which is how a view finds a row's product without
 * asking anything. At most `INVENTORY_ITEM_REQUESTS_PER_TICK` requests of `INVENTORY_ITEM_BATCH_SIZE`
 * items go out per tick, fewer when Shopify reports the shop's budget running low or throttles.
 */
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
      } catch (error) {
        if(!isUnavailableOnOms(error)) {throw error;}
        shopifyLookupUnavailable.add(shopId);

        return written;
      }
      const lookup = readInventoryItemLookup(envelope);
      if(lookup === "unavailable") {
        shopifyLookupUnavailable.add(shopId);

        return written;
      }
      // Throttled is Shopify asking for patience, not a failure: the next tick asks again.
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
