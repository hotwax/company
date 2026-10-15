import { workerGet } from "@common/core/workerRemoteApi";
import { defineSyncDomain } from "@common/db/sync/defineSyncDomain";
import { TRANSFER_ORDER_PAGE } from "@/config/appSyncConfig";
import { companyDb } from "@/db/companyDb";

const shopifyTransferPendingEntity = companyDb.entity(companyDb.tables.shopifyTransferPending);

/**
 * Shopify transfer sync — what has not reached Shopify yet.
 *
 * Per tick: the five OUTSTANDING resources under `sob/shopify/transferSync`, each scoped by
 * shopId and each read only as far as its first `orderLimits` transfer orders. Their synced counterparts (`synced*`) are read on demand when an operator asks for that
 * direction - it is history to browse, not a backlog to monitor, and polling it would double every
 * tick for rows nobody is waiting on. Every one is a plain entity resource over a view whose join already means "no provenance
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

/** The same five segments, read the other way. Own views, own resources - not a direction flag. */
export const SYNCED_SEGMENT_ENDPOINTS = {
  create: "sob/shopify/transferSync/syncedCreate",
  shipment: "sob/shopify/transferSync/syncedShipment",
  receipt: "sob/shopify/transferSync/syncedReceipt",
  cancellation: "sob/shopify/transferSync/syncedCancellation",
  itemChange: "sob/shopify/transferSync/syncedItemChange",
} as const;

export type PendingSegment = keyof typeof PENDING_SEGMENT_ENDPOINTS;
export type SyncDirection = "pending" | "synced";

export function segmentEndpoint(segment: PendingSegment, direction: SyncDirection): string {
  return direction === "pending"
    ? PENDING_SEGMENT_ENDPOINTS[segment]
    : SYNCED_SEGMENT_ENDPOINTS[segment];
}

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

/** A list's own backstop. Reached only inside one very large order, so it costs that order, not the list. */
const MAX_PAGES = 40;

/**
 * A total order per segment, so offset pages never repeat or skip a row. Entry date then order id
 * keeps each order's rows together, oldest first like the page lists them.
 */
const SEGMENT_ORDER_BY: Record<PendingSegment, string> = {
  create: "orderEntryDate,orderId,orderItemSeqId",
  shipment: "orderEntryDate,orderId,shipmentStatusId",
  receipt: "orderEntryDate,orderId,receiptId",
  cancellation: "orderEntryDate,orderId,orderStatusId",
  itemChange: "orderEntryDate,orderId,orderItemChangeId",
};

export interface ShopifyTransferSyncArgs {
  shopId?: string;
  batchSize?: number;
  /** How many transfer orders each list holds; `TRANSFER_ORDER_PAGE` when absent. */
  orderLimits?: Partial<Record<PendingSegment, number>>;
}

/**
 * How long one segment may take before this pass stops waiting for it.
 *
 * Under the OMS's 60-second transaction timeout and the ~50-second load balancer cutoff, both
 * observed on gorjana (2026-10-06). Without a bound, a request the server never answered kept the
 * pass pending forever: no sync-end and no sync-error reached the page, so it rendered skeletons
 * indefinitely, and the worker's sequential tick held every other domain behind it.
 * `workerRemoteApi` takes no abort signal, so a request already sent still runs to completion; the
 * timeout aborts the page walk so no further page of that segment is requested.
 */
export const SEGMENT_TIMEOUT_MS = 45_000;

/**
 * Backoff for a segment whose last read failed. A timed-out read still costs the server its full
 * query, so retrying it every 15-second tick stacks heavy queries on the OMS for as long as the
 * page is open. The first retry waits a minute and each further failure doubles it, capped.
 */
export const SEGMENT_BACKOFF_BASE_MS = 60_000;
export const SEGMENT_BACKOFF_MAX_MS = 15 * 60_000;

export interface SegmentFailure {
  message: string;
  /** When the segment is next read; a forced (manual) sync reads it immediately. */
  retryAt: number;
}

/**
 * What a partial pass reports. Carried on the thrown error as `details`, which the harness forwards
 * with the sync-error, so the page can tell a segment that is empty from one that never loaded.
 */
export interface TransferSyncFailureDetails {
  failedSegments: Partial<Record<PendingSegment, SegmentFailure>>;
  loadedSegments: PendingSegment[];
}

/** Per shop and segment: consecutive failures and the last one. Worker-lifetime state. */
const segmentFailures = new Map<string, SegmentFailure & { count: number }>();

function failureKey(shopId: string, segment: PendingSegment): string {
  return `${shopId}|${segment}`;
}

function withTimeout<T>(work: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const reason = new Error(`The OMS did not answer within ${Math.round(ms / 1000)} seconds.`);
      controller.abort(reason);
      reject(reason);
    }, ms);
  });

  return Promise.race([work(controller.signal), timeout]).finally(() => clearTimeout(timer));
}

/** A 401 is an expired session the harness re-authenticates; it must not be retried as a slow segment. */
function isAuthFailure(err: any): boolean {
  const status = err?.status ?? err?.statusCode ?? err?.errorCode ?? err?.response?.status;
  const message = String(err?.message ?? err?.errors ?? "");

  return Number(status) === 401 || /unauthor|not authorized|invalid.*token|login key not valid/i.test(message);
}

/** `workerRemoteApi` throws Moqui's parsed error body (`{ errorCode, errors }`), not an Error. */
function describeFailure(err: any): string {
  const text = String(err?.errors ?? err?.message ?? (typeof err === "string" ? err : "") ?? "").trim();
  const status = err?.errorCode ?? err?.status;
  const message = text || (status ? `Request failed with status ${status}.` : "Request failed.");

  return message.length > 300 ? `${message.slice(0, 300)}…` : message;
}

function backoffMs(failureCount: number): number {
  return Math.min(SEGMENT_BACKOFF_BASE_MS * 2 ** Math.max(0, failureCount - 1), SEGMENT_BACKOFF_MAX_MS);
}

/**
 * `segment` and `occurredAt` are added here, not returned by the server: they are how this one
 * cache table holds five differently-shaped resources without the page having to know which
 * timestamp field belongs to which segment.
 */
/** The artifact's own PK; the create segment has no artifact, so its identity is the unpushed order item. */
function artifactIdOf(row: any): unknown {
  return row?.shipmentStatusId ?? row?.receiptId ?? row?.orderStatusId ?? row?.orderItemChangeId ?? row?.orderItemSeqId;
}

function tagRows(rows: any[], segment: PendingSegment): any[] {
  const dateField = SEGMENT_DATE_FIELD[segment];

  return rows.map((row: any) => ({
    ...row,
    segment,
    artifactId: artifactIdOf(row),
    occurredAt: dateField ? row?.[dateField] : undefined,
  }));
}

/**
 * A segment's first `orderLimit` transfer orders, every row of each. Rows arrive grouped by order, so
 * the first row of the next order proves the earlier ones are complete and the read stops there.
 */
async function readFirstOrders(
  ctx: any,
  segment: PendingSegment,
  shopId: string,
  orderLimit: number,
  batchSize: number,
  signal: AbortSignal,
): Promise<any[]> {
  const label = `transferSync:${segment}`;
  const rows: any[] = [];
  const seenRows = new Set<string>();
  const orderIds = new Set<string>();
  for(let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex++) {
    if(signal.aborted) {throw signal.reason ?? new Error(`[sync] ${label}: aborted`);}
    const page = await workerGet(ctx, PENDING_SEGMENT_ENDPOINTS[segment], {
      shopId, orderByField: SEGMENT_ORDER_BY[segment], pageIndex, pageSize: batchSize,
    });
    // The snapshot prunes what the read did not return, so an error envelope must not read as empty.
    if(!Array.isArray(page)) {throw new Error(`[db] ${label}: response must be a bare array.`);}
    let fresh = 0;
    for(const row of page) {
      const orderId = String(row?.orderId ?? "");
      const rowKey = `${orderId}|${String(artifactIdOf(row) ?? "")}`;
      if(seenRows.has(rowKey)) {continue;}
      seenRows.add(rowKey);
      fresh++;
      if(!orderIds.has(orderId)) {
        if(orderIds.size === orderLimit) {return rows;}
        orderIds.add(orderId);
      }
      rows.push(row);
    }
    if(page.length < batchSize) {return rows;}
    if(!fresh) {
      throw new Error(`[db] ${label}: page ${pageIndex} returned no new records — the endpoint appears to ignore pageIndex; stopping with ${rows.length}.`);
    }
  }
  // The backstop cut through the last order read; keep only the orders it finished.
  const lastOrderId = [...orderIds].pop();

  return rows.filter((row) => String(row?.orderId ?? "") !== lastOrderId);
}

export const shopifyTransferSyncDomain = defineSyncDomain({
  name: "shopifyTransferSync",
  table: "shopifyTransferPending",
  label: "Shopify transfer sync",
  syncClass: "A",
  intervalMs: 15_000,
  async sync(ctx, args: ShopifyTransferSyncArgs = {}, options: { force?: boolean } = {}) {
    const shopId = String(args.shopId ?? "").trim();
    // No shop, no scope — an unscoped read would cache another shop's outstanding work as this
    // shop's, and the snapshot below would then prune this shop's rows in favour of it.
    if(!shopId) {return 0;}

    // Each request evaluates the whole view, so a page costs about the same at any size (gorjana
    // receipts, 2026-10-12: 4.3s for 1 row or 500); fewer, larger pages finish inside the timeout.
    const batchSize = args.batchSize ?? 500;
    const now = Date.now();
    const failedSegments: TransferSyncFailureDetails["failedSegments"] = {};
    const loadedSegments: PendingSegment[] = [];
    let written = 0;
    let authFailure: unknown;

    // Segments are independent resources, so each one settles, and is written, on its own. One slow
    // segment no longer holds back the four that answered, and a failed one keeps its cached rows.
    await Promise.all(PENDING_SEGMENTS.map(async (segment) => {
      const key = failureKey(shopId, segment);
      const previous = segmentFailures.get(key);
      if(previous && !options.force && previous.retryAt > now) {
        failedSegments[segment] = { message: previous.message, retryAt: previous.retryAt };

        return;
      }

      try {
        const orderLimit = Math.max(1, Number(args.orderLimits?.[segment]) || TRANSFER_ORDER_PAGE);
        const read = (signal: AbortSignal) => readFirstOrders(ctx, segment, shopId, orderLimit, batchSize, signal);
        const rows = await withTimeout(read, SEGMENT_TIMEOUT_MS);

        // Snapshot, scoped to this shop AND segment: a segment that has drained to empty must lose
        // its cached rows, or resolved work keeps rendering as outstanding and the tab count stays
        // wrong. The read covers the list's first orders, which is exactly what the page holds.
        const result = await shopifyTransferPendingEntity.snapshotReplace(
          tagRows(rows, segment),
          { field: "[shopId+segment]", value: [shopId, segment] },
        );
        written += result.written;
        segmentFailures.delete(key);
        loadedSegments.push(segment);
      } catch (err) {
        if(isAuthFailure(err)) {
          authFailure = err;

          return;
        }
        const count = (previous?.count ?? 0) + 1;
        const failure = { message: describeFailure(err), retryAt: Date.now() + backoffMs(count) };
        segmentFailures.set(key, { ...failure, count });
        failedSegments[segment] = failure;
      }
    }));

    if(authFailure) {throw authFailure;}

    const failed = Object.keys(failedSegments) as PendingSegment[];
    if(failed.length) {
      const summary = `${failed.length} of ${PENDING_SEGMENTS.length} transfer sync lists could not be loaded`;
      const error = new Error(`${summary} (${failed.join(", ")}): ${failedSegments[failed[0]]!.message}`) as Error & {
        details: TransferSyncFailureDetails;
      };
      error.details = { failedSegments, loadedSegments };
      throw error;
    }

    return written;
  },
});
