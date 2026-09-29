import { INVENTORY_EVENT_DOMAINS, INVENTORY_SYNC_DOMAIN_LABELS } from "@/config/appSyncConfig";
import { companyDb } from "@/db/companyDb";
import type { EntityClient } from "@common/db/dbClient";
import { canonicalKey, entityKeyOf, toMillis } from "@common/db/projection";
import { defineSyncDomain } from "@common/db/sync/defineSyncDomain";
import type { DbKey, SyncContext, SyncDomain } from "@common/db/types";
import { pageAll, workerGet, workerPost } from "@common/core/workerRemoteApi";
import { type InventoryEventKind, effectiveMessageOf, isUnsettledMessage } from "@/utils/inventoryEvents";

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
/** A backfill's backstop: 40 pages of 250, past any ledger the five-day purge leaves. */
const BACKFILL_MAX_PAGES = 40;
const MESSAGE_REFRESH_MAX = 25;
/** Two requests of 100 items per tick, so a cold page does not burst the quota the OMS's own jobs share. */
const INVENTORY_ITEM_BATCH_SIZE = 100;
const INVENTORY_ITEM_REQUESTS_PER_TICK = 2;

interface LedgerDefinition {
  kind: InventoryEventKind;
  rowsDomain: string;
  messageDomain: string;
  endpoint: string;
  table: string;
  entity: EntityClient<Record<string, any>>;
}

const systemMessageEntity = companyDb.entity("systemMessages");
const inventoryItemEntity = companyDb.entity("shopifyInventoryItems");
const ledgerBoundEntity = companyDb.entity("inventoryLedgerBounds");

function ledger(kind: InventoryEventKind, table: string, endpoint: string, domains: { rows: string; messages: string }): LedgerDefinition {
  return { kind, rowsDomain: domains.rows, messageDomain: domains.messages, endpoint, table, entity: companyDb.entity(table) };
}

export const INVENTORY_LEDGERS: Record<InventoryEventKind, LedgerDefinition> = {
  channel: ledger("channel", "shopifyInventoryAdjustmentDetails", "sob/shopify/inventoryAdjustmentDetails", {
    rows: INVENTORY_EVENT_DOMAINS.channelRows,
    messages: INVENTORY_EVENT_DOMAINS.channelMessages,
  }),
  location: ledger("location", "shopifyLocationInventoryAdjustmentDetails", "sob/shopify/locationInventoryAdjustmentDetails", {
    rows: INVENTORY_EVENT_DOMAINS.locationRows,
    messages: INVENTORY_EVENT_DOMAINS.locationMessages,
  }),
};

/**
 * A ledger row's primary key, from a server record or a stored row alike: the key members are
 * stored verbatim. A missing member drops the row, so if rows ever stop storing while the request
 * returns 200, the identity has drifted from the server — the connector once split a packed
 * `eventKey` into two columns, and the table silently stayed empty.
 */
function ledgerKeyOf(ledger: LedgerDefinition, row: Record<string, unknown>): DbKey | undefined {
  return entityKeyOf(row, companyDb.entities[ledger.table]);
}

function ledgerPageKey(ledger: LedgerDefinition) {
  return (row: Record<string, unknown>) => {
    const key = ledgerKeyOf(ledger, row);

    return key === undefined ? undefined : canonicalKey(key);
  };
}

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
  const keyed = rows.map((row) => ({ row, key: ledgerKeyOf(ledger, row) })).filter((entry): entry is { row: Record<string, any>; key: DbKey } => entry.key !== undefined);
  // `getMany` skips absent keys, so match stored rows back by key rather than by position.
  const cached = new Map((await ledger.entity.getMany(keyed.map((entry) => entry.key)))
    .map((row) => [canonicalKey(ledgerKeyOf(ledger, row)!), row]));

  return keyed.filter((entry) => {
    const before = cached.get(canonicalKey(entry.key));
    if(!before) {return true;}

    return toMillis(before.detailLastUpdatedStamp) !== toMillis(entry.row.detailLastUpdatedStamp) ||
      toMillis(before.systemMessageLastUpdatedStamp) !== toMillis(entry.row.systemMessageLastUpdatedStamp) ||
      String(before.systemMessageId ?? "") !== String(entry.row.systemMessageId ?? "") ||
      String(before.systemMessageStatusId ?? "") !== String(entry.row.systemMessageStatusId ?? "");
  }).map((entry) => entry.row);
}

function scopedRows(ledger: LedgerDefinition, shopId: string): Promise<Array<Record<string, any>>> {
  return ledger.entity.query({ scope: { field: "shopId", value: shopId } });
}

function oldestCachedAt(rows: Array<Record<string, any>>): number | undefined {
  const oldest = rows.reduce((min, row) => Math.min(min, toMillis(row.createdDate) ?? Infinity), Infinity);

  return Number.isFinite(oldest) ? oldest : undefined;
}

/** The ledger's oldest row on the server: one row from the entity list, or count then last page from the older service. */
async function serverOldestAt(ctx: SyncContext, ledger: LedgerDefinition, shopId: string): Promise<number | undefined> {
  const first = await workerGet(ctx, ledger.endpoint, { shopId, orderByField: "createdDate", pageSize: 1, pageIndex: 0 });
  if(Array.isArray(first)) {return toMillis(first[0]?.createdDate);}
  // The older service ignores the sort and returns newest first, with a count of the whole set.
  const count = Number(first?.detailCount);
  if(!Array.isArray(first?.details) || !Number.isInteger(count)) {throw new Error(`[sync] ${ledger.endpoint}: unexpected response shape.`);}
  if(!count) {return undefined;}
  const last = ledgerRowsOf(await workerGet(ctx, ledger.endpoint, { shopId, pageSize: 1, pageIndex: count - 1 }), ledger.endpoint);

  return toMillis(last[0]?.createdDate);
}

/**
 * The shop's events from `fromMs` up to `beforeMs`, newest first. The entity list takes the range; the
 * older service has none, so it is paged newest first until a page reaches back past `fromMs`.
 */
async function rowsSince(ctx: SyncContext, ledger: LedgerDefinition, shopId: string, fromMs: number, beforeMs?: number) {
  const range = { shopId, createdDate_from: fromMs, ...(beforeMs === undefined ? {} : { createdDate_thru: beforeMs }), orderByField: "-createdDate" };
  const rows: Array<Record<string, any>> = [];
  for(let pageIndex = 0; pageIndex < BACKFILL_MAX_PAGES; pageIndex++) {
    const page = await workerGet(ctx, ledger.endpoint, { ...range, pageSize: PAGE_SIZE, pageIndex });
    const pageRows = ledgerRowsOf(page, ledger.endpoint);
    rows.push(...pageRows);
    const more = Array.isArray(page)
      ? pageRows.length === PAGE_SIZE
      : page.hasMore && (toMillis(pageRows[pageRows.length - 1]?.createdDate) ?? 0) >= fromMs;
    if(!more) {break;}
  }

  return rows.filter((row) => (toMillis(row.createdDate) ?? 0) >= fromMs);
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
    keyOf: ledgerPageKey(ledger),
    label: `${ledger.endpoint}:${cursorField}`,
    params: { shopId, [`${cursorField}_from`]: Math.max(0, cursor - CURSOR_OVERLAP_MS), orderByField: cursorField },
  });
}

function ledgerDomains(ledger: LedgerDefinition): SyncDomain[] {
  const rowsDomain = defineSyncDomain({
    name: ledger.rowsDomain,
    table: ledger.table,
    label: INVENTORY_SYNC_DOMAIN_LABELS[ledger.rowsDomain],
    syncClass: "A",
    intervalMs: POLL_INTERVAL_MS,
    async sync(ctx, args: ShopArgs = {}, options) {
      const shopId = shopOf(args);
      // An unscoped list would pull every shop's ledger into this shop's cache.
      if(!shopId) {return 0;}
      const windowKey = `${ledger.kind}|${shopId}`;
      if(windowOnlyLedgers.has(windowKey) && !options?.force) {return 0;}
      const cursor = windowOnlyLedgers.has(windowKey)
        ? undefined
        : await ledger.entity.newestCursor("detailLastUpdatedStamp", { field: "shopId", value: shopId });
      let changed: Array<Record<string, any>>;
      if(cursor === undefined) {
        const rows = ledgerRowsOf(await workerGet(ctx, ledger.endpoint, {
          shopId, orderByField: "-createdDate", pageSize: RECENT_WINDOW, pageIndex: 0,
        }), ledger.endpoint);
        const stamped = rows.some((row) => toMillis(row?.detailLastUpdatedStamp) !== undefined);
        if(rows.length && !stamped) {windowOnlyLedgers.add(windowKey);} else {windowOnlyLedgers.delete(windowKey);}
        changed = rows;
      } else {
        changed = await changedRows(ledger, await cursorRead(ctx, ledger, shopId, "detailLastUpdatedStamp", cursor));
      }

      return changed.length ? ledger.entity.upsertMany(changed) : 0;
    },
    /** The history's date filter reaching past the cache: load the shop's events back to `pk.fromMs`. */
    async refetchOne(ctx, pk, args: ShopArgs = {}) {
      const shopId = shopOf(args);
      const fromMs = Number(pk?.fromMs);
      if(!shopId || !Number.isFinite(fromMs)) {return 0;}
      const cachedOldest = oldestCachedAt(await scopedRows(ledger, shopId));
      if(cachedOldest !== undefined && fromMs >= cachedOldest) {return 0;}
      const rows = await rowsSince(ctx, ledger, shopId, fromMs, cachedOldest);

      return rows.length ? ledger.entity.upsertMany(rows) : 0;
    },
  });

  const messageDomain = defineSyncDomain({
    name: ledger.messageDomain,
    table: ledger.table,
    label: INVENTORY_SYNC_DOMAIN_LABELS[ledger.messageDomain],
    syncClass: "A",
    intervalMs: POLL_INTERVAL_MS,
    async sync(ctx, args: ShopArgs = {}) {
      const shopId = shopOf(args);
      if(!shopId) {return 0;}
      const cursor = await ledger.entity.newestCursor("systemMessageLastUpdatedStamp", { field: "shopId", value: shopId });
      // Nothing is batched yet; the rows poller brings the first message stamp in.
      if(cursor === undefined) {return 0;}
      const changed = await changedRows(ledger, await cursorRead(ctx, ledger, shopId, "systemMessageLastUpdatedStamp", cursor));

      return changed.length ? ledger.entity.upsertMany(changed) : 0;
    },
  });

  return [rowsDomain, messageDomain];
}

/**
 * Where a ledger starts on the server, for the history's calendars: asked once when a history page
 * loads, never polled. The server purges old rows, so a cached row older than the server's oldest is
 * gone there and leaves the cache too: the cache mirrors the purge instead of guessing at it.
 */
const inventoryEventBoundsDomain = defineSyncDomain({
  name: INVENTORY_EVENT_DOMAINS.bounds,
  table: "inventoryLedgerBounds",
  label: INVENTORY_SYNC_DOMAIN_LABELS[INVENTORY_EVENT_DOMAINS.bounds],
  syncClass: "A",
  sync: () => Promise.resolve(0),
  async refetchOne(ctx, pk) {
    const shopId = shopOf(pk);
    const ledger = INVENTORY_LEDGERS[pk?.kind as InventoryEventKind];
    if(!shopId || !ledger) {return 0;}
    const oldest = await serverOldestAt(ctx, ledger, shopId);
    const written = await ledgerBoundEntity.upsertMany([{ kind: ledger.kind, shopId, oldestCreatedDate: oldest ?? null }]);
    // An empty ledger on the server means nothing cached for this shop is still there.
    const stale = (await scopedRows(ledger, shopId)).filter((row) => (toMillis(row.createdDate) ?? Infinity) < (oldest ?? Infinity));
    await ledger.entity.bulkRemove(stale.map((row) => ledgerKeyOf(ledger, row)).filter((key): key is DbKey => key !== undefined));

    return written;
  },
});

/** Unsettled batches' messages, one request each: `admin/systemMessages` ignores `_op=in` (verified live). */
const inventoryEventSystemMessageDomain = defineSyncDomain({
  name: INVENTORY_EVENT_DOMAINS.systemMessages,
  table: "systemMessages",
  label: INVENTORY_SYNC_DOMAIN_LABELS[INVENTORY_EVENT_DOMAINS.systemMessages],
  syncClass: "A",
  intervalMs: POLL_INTERVAL_MS,
  async sync(ctx, args: ShopArgs = {}) {
    const shopId = shopOf(args);
    if(!shopId) {return 0;}
    const rows = (await Promise.all(Object.values(INVENTORY_LEDGERS).map((ledger) => scopedRows(ledger, shopId)))).flat()
      .filter((row) => row.systemMessageId);
    const newestRowByMessage = new Map<string, any>();
    for(const row of rows) {
      const id = String(row.systemMessageId);
      if((row.syncedAt ?? 0) >= (newestRowByMessage.get(id)?.syncedAt ?? -1)) {newestRowByMessage.set(id, row);}
    }
    const ids = [...newestRowByMessage.keys()];
    const cachedMessages = new Map((await systemMessageEntity.getMany(ids)).map((message: any) => [String(message.systemMessageId), message]));
    const unsettled = ids.filter((id) => {
      const row = newestRowByMessage.get(id);
      const cached = cachedMessages.get(id);
      const message = effectiveMessageOf(row, row.syncedAt, cached ? { statusId: String(cached.statusId ?? ""), syncedAt: cached.syncedAt } : undefined);

      return isUnsettledMessage(message?.statusId);
    }).sort((a, b) => b.localeCompare(a, undefined, { numeric: true })).slice(0, MESSAGE_REFRESH_MAX);

    let written = 0;
    for(const systemMessageId of unsettled) {
      try {
        const response = await workerGet(ctx, "admin/systemMessages", { systemMessageId, pageSize: 1 });
        const message = response?.systemMessages?.find((entry: any) => String(entry?.systemMessageId) === systemMessageId);
        if(message) {written += await systemMessageEntity.upsertMany([message]);}
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
/** Items known to be gone, keyed per shop: Shopify's inventory item id is only unique per shop. */
function inventoryItemKey(shopId: string, shopifyInventoryItemId: string): string {
  return `${shopId}|${shopifyInventoryItemId}`;
}

async function unresolvedInventoryItems(shopId: string): Promise<string[]> {
  const rows = (await Promise.all(Object.values(INVENTORY_LEDGERS).map((ledger) => scopedRows(ledger, shopId)))).flat()
    .sort((a, b) => (toMillis(b.createdDate) ?? 0) - (toMillis(a.createdDate) ?? 0));
  const items = new Set<string>();
  for(const row of rows) {
    const item = String(row.shopifyInventoryItemId ?? "");
    if(!item || unknownInventoryItems.has(inventoryItemKey(shopId, item))) {continue;}
    // Only a numeric id can be a Shopify global id; one malformed id would fail its whole batch forever.
    if(!/^\d+$/.test(item)) {unknownInventoryItems.add(inventoryItemKey(shopId, item)); continue;}
    items.add(item);
  }
  const candidates = [...items];
  const cached = new Set((await inventoryItemEntity.getMany(candidates.map((item) => [shopId, item])))
    .map((row: any) => String(row.shopifyInventoryItemId)));

  return candidates.filter((item) => !cached.has(item));
}

/** The ledgers name an inventory item, not a product, so Shopify's `nodes` query names it. */
const inventoryEventProductDomain = defineSyncDomain({
  name: INVENTORY_EVENT_DOMAINS.products,
  table: "shopifyInventoryItems",
  label: INVENTORY_SYNC_DOMAIN_LABELS[INVENTORY_EVENT_DOMAINS.products],
  syncClass: "A",
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
        if(node?.variant) {rows.push(inventoryItemRowOf(shopId, id, node));} else {unknownInventoryItems.add(inventoryItemKey(shopId, id));}
      }
      if(rows.length) {written += await inventoryItemEntity.upsertMany(rows);}
      if(budgetRunningLow(envelope)) {break;}
    }

    return written;
  },
});

/** Every inventory sync area domain, for `appSync.worker.ts` to register. */
export const inventoryEventDomains: SyncDomain[] = [
  ...Object.values(INVENTORY_LEDGERS).flatMap(ledgerDomains),
  inventoryEventBoundsDomain,
  inventoryEventSystemMessageDomain,
  inventoryEventProductDomain,
];
