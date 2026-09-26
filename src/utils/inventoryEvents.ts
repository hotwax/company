/**
 * One row model for both Shopify inventory ledgers (aggregate channel and physical location). Both read
 * views carry `shopId` and `shopifyLocationId`, so every row normalises to a Shopify location in a shop.
 *
 * Delivery state is derived, never read from `detailStatusId` (the aggregate ledger's column, being
 * retired): unbatched with a non-zero delta is waiting, unbatched zero is a no-op, batched is whatever
 * its System Message says. Vue- and i18n-free so the rules test without a DOM or a locale.
 */
import { toMillis } from "./cacheProjection";
import { type InventoryEventSourceRoot, canonicalEventTypeId, isReservationEventType, sourceRootFor } from "./inventoryEventSourceRoots";
import { isSuccess } from "./systemMessage";

export type InventoryEventKind = "channel" | "location";

/** Total over every input: an unknown message status is `inFlight`, never dropped. */
export type DeliveryStateId = "waiting" | "noChange" | "inFlight" | "error" | "sent" | "cancelled";

export interface DeliveryState {
  id: DeliveryStateId;
  statusId?: string;
}

export interface InventoryEventMessage {
  statusId?: string;
  processedDate?: unknown;
  initDate?: unknown;
  /** When this copy was cached: the freshness test between the row's joined copy and the message's. */
  cachedAt?: number;
}

export interface InventoryEventSource {
  root?: InventoryEventSourceRoot;
  reference: string;
  /** Trailing effective-date phase: OLD, NEW, ACTIVATE or EXPIRE. */
  phase: string;
  reservation?: { inventoryItemId: string; detailSeqId: string };
}

export interface InventoryEvent {
  kind: InventoryEventKind;
  rowKey: string;
  shopId: string;
  /** Where the delta lands: a retarget drain publishes to the OLD location, not the channel's current one. */
  locationId: string;
  retarget: boolean;
  channelId?: string;
  eventTypeId: string;
  eventReferenceId: string;
  eventTypeLabel: string;
  source: InventoryEventSource;
  inventoryItemId: string;
  delta: number;
  /** `correction` when the type maps to no Shopify reason, which is what the batcher sends. */
  reason: string;
  reasonMapped: boolean;
  messageId?: string;
  delivery: DeliveryState;
  createdAt: number;
  /** Only on a sent row: a failed attempt stamps a processed date too. */
  sentAt?: number;
  batchedAt?: number;
  awaitingDelivery: boolean;
  decisionComment: string;
}

/** Six places, so float noise (`0.1 + 0.2 - 0.3`) settles the way the OMS's BigDecimal does; never `-0`. */
export function roundDelta(value: unknown): number {
  const rounded = Math.round(Number(value || 0) * 1e6) / 1e6;

  return rounded === 0 ? 0 : rounded;
}

export function sumDelta(values: Array<unknown>): number {
  return roundDelta(values.reduce((total: number, value) => total + Number(value || 0), 0));
}

/** What the publisher does with a summed group: zero settles, a non-whole sum is refused. */
export function deltaOutcome(delta: number): "noChange" | "publish" | "quarantine" {
  const rounded = roundDelta(delta);
  if(rounded === 0) {return "noChange";}

  return Number.isInteger(rounded) ? "publish" : "quarantine";
}

/** Cancelled/rejected are the batcher's markers and nothing retries them; `SmsgError` is retried. */
export function deliveryStateOf(messageId: string | undefined, delta: number, statusId?: string): DeliveryState {
  if(!messageId) {return { id: roundDelta(delta) === 0 ? "noChange" : "waiting" };}
  const status = String(statusId ?? "");
  if(isSuccess(status)) {return { id: "sent", statusId: status };}
  if(status === "SmsgCancelled" || status === "SmsgRejected") {return { id: "cancelled", statusId: status };}
  if(status === "SmsgError") {return { id: "error", statusId: status };}

  return { id: "inFlight", statusId: status || undefined };
}

/** A batched message the pipeline has not finished with. */
export function isUnsettledMessage(statusId: string | undefined): boolean {
  return ["inFlight", "error"].includes(deliveryStateOf("batched", 1, statusId).id);
}

/**
 * The fresher of a row's two cached message reads: its joined columns (rewritten by the message-cursor
 * poller) or the message itself (re-read by id while unsettled).
 */
export function effectiveMessageOf(
  raw: Record<string, any>,
  rowCachedAt: number | undefined,
  cachedMessage: InventoryEventMessage | undefined,
): InventoryEventMessage | undefined {
  if(!raw?.systemMessageId) {return undefined;}
  const joined = {
    statusId: raw.systemMessageStatusId, processedDate: raw.systemMessageProcessedDate,
    initDate: raw.systemMessageInitDate, cachedAt: rowCachedAt,
  };
  if(!cachedMessage) {return joined;}
  if(!joined.statusId) {return cachedMessage;}

  return (cachedMessage.cachedAt ?? 0) > (joined.cachedAt ?? 0) ? cachedMessage : joined;
}

/** The reference is the source row's natural key; reservations are `inventoryItemId:detailSeqId`. */
export function sourceOf(eventTypeId: string, eventReferenceId: string): InventoryEventSource {
  const raw = String(eventReferenceId ?? "");
  const phase = raw.match(/:(OLD|NEW|ACTIVATE|EXPIRE)$/)?.[1] ?? "";
  const reference = phase ? raw.slice(0, -(phase.length + 1)) : raw;
  const root = sourceRootFor(eventTypeId);
  if(isReservationEventType(eventTypeId) && reference.includes(":")) {
    const [inventoryItemId, detailSeqId] = reference.split(":");

    return { root, reference, phase, reservation: { inventoryItemId, detailSeqId } };
  }

  return { root, reference, phase };
}

function text(value: unknown): string {
  return value === undefined || value === null ? "" : String(value).trim();
}

export function toInventoryEvent(
  kind: InventoryEventKind,
  cacheKey: string,
  raw: Record<string, any>,
  message: InventoryEventMessage | undefined,
): InventoryEvent {
  const delta = roundDelta(raw?.computedInventoryChange);
  const messageId = text(raw?.systemMessageId) || undefined;
  const delivery = deliveryStateOf(messageId, delta, message?.statusId);
  const retargetLocationId = kind === "channel" ? text(raw?.publishShopifyLocationId) : "";
  const reason = text(raw?.shopifyReason);
  const eventTypeId = text(raw?.eventTypeId);

  return {
    kind,
    rowKey: `${kind}:${cacheKey}`,
    shopId: text(raw?.shopId),
    locationId: retargetLocationId || text(raw?.shopifyLocationId),
    retarget: !!retargetLocationId,
    ...(kind === "channel" ? { channelId: text(raw?.inventoryChannelId) } : {}),
    eventTypeId,
    eventReferenceId: text(raw?.eventReferenceId),
    eventTypeLabel: text(raw?.eventTypeDescription) || eventTypeId,
    source: sourceOf(eventTypeId, text(raw?.eventReferenceId)),
    inventoryItemId: text(raw?.shopifyInventoryItemId),
    delta,
    reason: reason || "correction",
    reasonMapped: !!reason,
    messageId,
    delivery,
    createdAt: toMillis(raw?.createdDate) ?? 0,
    sentAt: delivery.id === "sent" ? toMillis(message?.processedDate) : undefined,
    batchedAt: messageId ? toMillis(message?.initDate) : undefined,
    awaitingDelivery: ["waiting", "inFlight", "error"].includes(delivery.id),
    decisionComment: text(raw?.decisionComment),
  };
}

/** Median, not mean: one row stuck through an outage would drag a mean where no row actually was. */
export function summarizeInventoryEvents(events: readonly InventoryEvent[]) {
  let waiting = 0;
  let inFlight = 0;
  let errors = 0;
  let oldestOwedAt: number | undefined;
  let oldestWaitingAt: number | undefined;
  const lags: number[] = [];
  const earlier = (current: number | undefined, at: number) => (at && (current === undefined || at < current) ? at : current);
  for(const event of events) {
    if(event.delivery.id === "waiting") {
      waiting += 1;
      oldestWaitingAt = earlier(oldestWaitingAt, event.createdAt);
    }
    if(event.delivery.id === "inFlight") {inFlight += 1;}
    if(event.delivery.id === "error") {errors += 1;}
    if(event.awaitingDelivery) {oldestOwedAt = earlier(oldestOwedAt, event.createdAt);}
    if(event.sentAt && event.createdAt && event.sentAt >= event.createdAt) {lags.push(event.sentAt - event.createdAt);}
  }
  lags.sort((a, b) => a - b);

  return {
    total: events.length,
    waiting,
    inFlight,
    errors,
    oldestOwedAt,
    oldestWaitingAt,
    lag: lags.length ? { median: lags[Math.floor(lags.length / 2)], slowest: lags[lags.length - 1], count: lags.length } : undefined,
  };
}

function groupBy<T>(rows: readonly T[], keyOf: (row: T) => string | undefined): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for(const row of rows) {
    const key = keyOf(row);
    const bucket = key ? grouped.get(key) : undefined;
    if(bucket) {bucket.push(row);} else if(key) {grouped.set(key, [row]);}
  }

  return grouped;
}

/** What Shopify receives: the batcher sums a batch's rows per (inventory item, location). */
export function changeEntriesOf<T extends InventoryEvent>(events: readonly T[]) {
  return [...groupBy(events, (event) => `${event.inventoryItemId}@${event.locationId}`)].map(([key, rows]) => {
    const delta = sumDelta(rows.map((row) => row.delta));

    return {
      key, inventoryItemId: rows[0].inventoryItemId, delta,
      eventCount: rows.length, outcome: deltaOutcome(delta), sample: rows[0],
    };
  }).sort((a, b) => a.inventoryItemId.localeCompare(b.inventoryItemId));
}

export interface InventoryEventBatch<T extends InventoryEvent = InventoryEvent> {
  id: string;
  delivery: DeliveryState;
  createdAt: number;
  events: T[];
  entries: ReturnType<typeof changeEntriesOf<T>>;
  /** A mixed batch publishes under `correction`, as the batcher does. */
  reason: string;
  reasonMapped: boolean;
  mixedEventTypes: boolean;
}

export function groupInventoryEventBatches<T extends InventoryEvent>(events: readonly T[]): InventoryEventBatch<T>[] {
  return [...groupBy(events, (event) => event.messageId)].map(([id, rows]) => {
    const mixed = new Set(rows.map((row) => canonicalEventTypeId(row.eventTypeId))).size > 1;

    return {
      id,
      delivery: rows[0].delivery,
      createdAt: rows.reduce((earliest, row) => {
        const at = row.batchedAt || row.createdAt;

        return at && (!earliest || at < earliest) ? at : earliest;
      }, 0),
      events: rows,
      entries: changeEntriesOf(rows),
      reason: mixed ? "correction" : rows[0].reason,
      reasonMapped: !mixed && rows[0].reasonMapped,
      mixedEventTypes: mixed,
    };
  }).sort((a, b) => b.createdAt - a.createdAt);
}

/** The event type matches by family, so a filter chosen on one spelling of a type matches the other. */
export function filterInventoryEvents<T extends InventoryEvent>(
  events: readonly T[],
  filters: { query?: string; deliveryState?: DeliveryStateId | ""; eventTypeId?: string; locationId?: string; fromMs?: number; toMs?: number },
  searchText: (event: T) => string,
): T[] {
  const query = String(filters.query ?? "").trim().toLowerCase();
  const family = filters.eventTypeId ? canonicalEventTypeId(filters.eventTypeId) : "";

  return events.filter((event) =>
    (!filters.deliveryState || event.delivery.id === filters.deliveryState) &&
    (!family || canonicalEventTypeId(event.eventTypeId) === family) &&
    (!filters.locationId || event.locationId === filters.locationId) &&
    (filters.fromMs === undefined || event.createdAt >= filters.fromMs) &&
    (filters.toMs === undefined || event.createdAt <= filters.toMs) &&
    (!query || searchText(event).toLowerCase().includes(query)));
}
