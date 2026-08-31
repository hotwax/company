import { shopifyTransferPendingCache } from "@/utils/cacheEntities";
import { registerSyncDomain } from "../syncRegistry";
import { pageAll } from "./workerFetch";

/**
 * Shopify transfer sync — what has not reached Shopify yet.
 *
 * Per tick: five outstanding-work resources under `sob/shopify/transferSync`, each scoped by
 * shopId. Every one is a plain entity resource over a view whose join already means "no provenance
 * row, therefore not sent" — so a row existing IS the outstanding state. Nothing is derived here
 * and nothing is ranked here; the page renders exactly what the server returned.
 *
 * This replaced a single `sob/shopify/transferSync` list that returned every transfer the shop had
 * ever synced, each row carrying a server-derived stage badge that cost eight queries to produce.
 * Filtering, sorting and paging all ran after that work, so page size bought nothing.
 *
 * Webhook subscription health is deliberately NOT synced here. It used to call
 * `sob/shopify/transferWebhookSubscriptionHealth` every tick, and that endpoint ran a live verifier
 * — one Shopify GraphQL call per topic, fourteen per shop, every 15 seconds while the page was
 * open. That endpoint no longer exists; the page derives the same answer on demand from the
 * subscription list it already reads.
 */

/** Segment id -> its resource. Segment ids are the cache discriminator and the tab keys. */
export const PENDING_SEGMENT_ENDPOINTS = {
  create: "sob/shopify/transferSync/pendingCreate",
  shipment: "sob/shopify/transferSync/pendingShipment",
  receipt: "sob/shopify/transferSync/pendingReceipt",
  cancellation: "sob/shopify/transferSync/pendingCancellation",
  itemChange: "sob/shopify/transferSync/pendingItemChange",
} as const;

export type PendingSegment = keyof typeof PENDING_SEGMENT_ENDPOINTS;

export const PENDING_SEGMENTS = Object.keys(PENDING_SEGMENT_ENDPOINTS) as PendingSegment[];

/**
 * The artifact timestamp each segment sorts and displays by, normalised to `occurredAt` so one
 * ordering works for every tab. The create segment has none: an item that was never pushed has no
 * artifact of its own, which is exactly why it is listed by order instead of by time.
 */
const SEGMENT_DATE_FIELD: Record<PendingSegment, string | undefined> = {
  create: undefined,
  shipment: "statusDate",
  receipt: "datetimeReceived",
  cancellation: "orderStatusDatetime",
  itemChange: "changeDatetime",
};

export interface ShopifyTransferSyncArgs {
  shopId?: string;
  batchSize?: number;
}

/**
 * `segment` and `occurredAt` are added here, not returned by the server: they are how this one
 * cache table holds five differently-shaped resources without the page having to know which
 * timestamp field belongs to which segment.
 */
function tagRows(rows: any[], segment: PendingSegment): any[] {
  const dateField = SEGMENT_DATE_FIELD[segment];

  return rows.map((row: any) => ({
    ...row,
    segment,
    occurredAt: dateField ? row?.[dateField] : undefined,
  }));
}

registerSyncDomain({
  name: "shopifyTransferSync",
  intervalMs: 15_000,
  async sync(ctx, args: ShopifyTransferSyncArgs = {}) {
    const shopId = String(args.shopId ?? "").trim();
    // No shop, no scope — an unscoped read would cache another shop's outstanding work as this
    // shop's, and the snapshot below would then prune this shop's rows in favour of it.
    if(!shopId) {return 0;}

    const batchSize = args.batchSize ?? 100;

    const perSegment = await Promise.all(PENDING_SEGMENTS.map(async (segment) => {
      // Entity resources return a bare array, so no collectionKey. pageAll stops on the first
      // empty page and has its own page backstop.
      const rows = await pageAll({
        ctx,
        url: PENDING_SEGMENT_ENDPOINTS[segment],
        params: { shopId },
        batchSize,
        label: `transferSync:${segment}`,
      });

      return tagRows(rows, segment);
    }));

    // Snapshot, scoped to this shop: a segment that has drained to empty must lose its cached
    // rows, or resolved work keeps rendering as outstanding and the tab count stays wrong.
    // Scoping by shopId leaves every other shop's rows alone.
    const { written } = await shopifyTransferPendingCache.snapshotReplace(
      perSegment.flat(),
      { field: "shopId", value: shopId },
    );

    return written;
  },
});
