import {
  FULFILLMENT_HISTORY_ENDPOINT_MISSING,
  shopifyFulfillmentHistoryCache,
  shopifyFulfillmentHistorySupportCache,
} from "@/utils/cacheEntities";
import { keepNewerThan } from "@/utils/cacheProjection";
import { type SyncContext, registerSyncDomain } from "../syncRegistry";
import { pageNewestFirst, unwrapCollection, workerGet } from "./workerFetch";

/**
 * ShopifyFulfillmentHistory — class A (live, append-mostly), the "Synced" feed of the fulfillment
 * sync screen.
 *
 * Reads `sob/shopify/fulfillmentHistories`, a Moqui entity-list endpoint with the same conventions
 * as `sob/shopify/inventoryAdjustmentDetails` (bare-array body; pageIndex/pageSize/orderByField;
 * every alias filterable with `_op` companions). Scoped by `shopId`, cursored on
 * `lastUpdatedStamp` — the one stamp that moves on both OMS-pushed and Shopify-ingested rows,
 * while `processedDate` stays null on the pushed ones by design.
 *
 * ⚠️ THE ENDPOINT MAY NOT EXIST YET. It ships in a connector release that deploys independently of
 * this app, and an instance without it answers 404. That is a "cannot know", not a failure to
 * retry: the first 404 of a worker session raises ONE recognizable error
 * (`FULFILLMENT_HISTORY_ENDPOINT_MISSING`, surfaced by `useCacheSync().error` as
 * `shopifyFulfillmentHistory: <message>`), records the verdict on the shop's
 * `shopifyFulfillmentHistorySupport` row — the durable state `useSyncedFulfillments` renders — and
 * every later scheduled tick returns without touching the network. A FORCED pass (manual refresh)
 * deliberately re-probes: it costs one request, it is user-initiated, and it is how the screen
 * heals in place once the connector lands mid-session. A fresh worker (view re-entry) re-probes
 * once for the same reason.
 */
const ENDPOINT = "sob/shopify/fulfillmentHistories";
/** Moqui entity-list responses are a bare array; unwrapCollection handles both shapes. */
const COLLECTION = null;

export interface ShopifyFulfillmentHistoryArgs {
  /** The shop whose fulfillment history to read. Nothing syncs without it — see the guard. */
  shopId?: string;
  /** Rows to keep per shop. Deepened when the cached window is shallower (see the window note). */
  total?: number;
  batchSize?: number;
}

/**
 * The 404 verdict for THIS worker's lifetime — what keeps a scheduled tick from re-probing a
 * missing endpoint every 10 seconds. Module-level on purpose: the worker is terminated on view
 * exit, so re-entering the screen re-probes exactly once. The cross-realm, login-lifetime copy of
 * the verdict lives on the `shopifyFulfillmentHistorySupport` cache row.
 */
let endpointMissingThisSession = false;

/**
 * Is this error the endpoint not existing, as opposed to it failing?
 *
 * `workerRemoteApi` throws the PARSED ERROR BODY, not a Response — there is no reliable `.status`.
 * A Moqui instance without the connector release answers 404 with a JSON body carrying
 * `errorCode: 404`, so that is the primary test; the message sniff covers proxies that phrase it
 * instead. A body that was not JSON at all (a gateway's HTML error page) surfaces as a
 * SyntaxError and deliberately does NOT match: disabling the domain for the session on a transient
 * 502 would hide real data until re-entry.
 */
function isEndpointMissing(err: any): boolean {
  const status = Number(err?.status ?? err?.statusCode ?? err?.errorCode ?? err?.response?.status ?? NaN);
  if(status === 404) {return true;}
  const text = [err?.message, err?.errors, err?.error]
    .map((part) => (typeof part === "string" ? part : ""))
    .join(" ");

  return /\b404\b/.test(text) || /resource not found/i.test(text);
}

/**
 * Record the endpoint verdict on the shop's support row — but only when it CHANGES, so a settled
 * answer costs no write (and no liveQuery re-emit) per tick.
 */
async function markEndpointSupport(shopId: string, isSupported: "Y" | "N"): Promise<number> {
  const existing = (await shopifyFulfillmentHistorySupportCache.all())
    .find((row: any) => String(row?.shopId ?? "") === shopId);
  if(existing?.isSupported === isSupported) {return 0;}

  return shopifyFulfillmentHistorySupportCache.upsertMany([
    { shopId, isSupported, checkedAt: Date.now() },
  ]);
}

registerSyncDomain({
  name: "shopifyFulfillmentHistory",
  intervalMs: 10_000,
  async sync(ctx: SyncContext, args: ShopifyFulfillmentHistoryArgs = {}, options) {
    const shopId = String(args.shopId ?? "").trim();
    // No shop, no scope. An unscoped read would pull every shop's history into a cache the screen
    // reads as "this shop's" — the same class of bug the inventory domain's channel guard blocks.
    if(!shopId) {return 0;}
    // After a 404, scheduled ticks are free: no request, no error spam, no toast churn. Only a
    // forced pass (manual refresh) re-asks the question.
    if(endpointMissingThisSession && !options?.force) {return 0;}

    const batchSize = args.batchSize ?? 50;
    const target = args.total ?? 200;
    const scope = { field: "shopId", value: shopId };

    // A shallow window is DEEPENED, not just topped up — same rule as the message domain: with a
    // cursor, paging stops at the first cached row, so a window first synced shallow would stay
    // shallow forever and raising `total` later would do nothing.
    const cached = await shopifyFulfillmentHistoryCache.count(scope);
    const isShallow = cached < target;
    const cursor = isShallow
      ? undefined
      : await shopifyFulfillmentHistoryCache.newestCursor("lastUpdatedStamp", scope);

    let rows: any[];
    try {
      rows = await pageNewestFirst({
        ctx,
        url: ENDPOINT,
        collectionKey: COLLECTION,
        total: isShallow ? target : batchSize,
        batchSize,
        params: { shopId, orderByField: "-lastUpdatedStamp" },
        keep: cursor === undefined ? undefined : (page) => keepNewerThan(page, "lastUpdatedStamp", cursor),
      });
    } catch (err) {
      if(isEndpointMissing(err)) {
        endpointMissingThisSession = true;
        await markEndpointSupport(shopId, "N");
        // One recognizable throw — the sync-error channel carries it to `useCacheSync().error`.
        throw new Error(FULFILLMENT_HISTORY_ENDPOINT_MISSING, { cause: err });
      }
      throw err;
    }

    // The endpoint answered — it exists, including on the re-probe after a 404 verdict.
    endpointMissingThisSession = false;
    let written = await markEndpointSupport(shopId, "Y");
    // `shopId` IS an alias on the view, so this fill is normally a no-op — but the synthetic key
    // (`${shopId}:${fulfillmentId}`) silently drops any row without one, so it costs nothing and
    // keeps a trimmed future master from emptying the feed.
    const stamped = rows.map((row: any) => ({ ...row, shopId: row?.shopId ?? shopId }));
    written += await shopifyFulfillmentHistoryCache.upsertMany(stamped);

    return written;
  },
  async refetchOne(ctx, pk) {
    const shopId = String(pk?.shopId ?? "").trim();
    const fulfillmentId = String(pk?.fulfillmentId ?? "").trim();
    if(!shopId || !fulfillmentId) {return 0;}
    if(endpointMissingThisSession) {return 0;}
    const response = await workerGet(ctx, ENDPOINT, {
      shopId,
      fulfillmentId,
      pageIndex: 0,
      pageSize: 1,
    });
    const rows = unwrapCollection(response, COLLECTION);
    if(!rows.length) {return 0;}
    const stamped = rows.map((row: any) => ({ ...row, shopId: row?.shopId ?? shopId }));

    return shopifyFulfillmentHistoryCache.upsertMany(stamped);
  },
});
