/**
 * THE INVENTORY EVENT MODEL — one shape for both Shopify inventory ledgers, Vue-free and i18n-free.
 *
 * The connector keeps two write-ahead ledgers that differ only in how they name their Shopify target:
 *
 *   ShopifyInventoryAdjustmentDetail          aggregate: one row per (event, inventory channel, item),
 *                                             the channel mapping a facility group to one shop location
 *   ShopifyLocationInventoryAdjustmentDetail  physical: one row per (event, shop, location, item)
 *
 * Both read views carry `shopId` and `shopifyLocationId` (the aggregate one aliases them from its
 * channel), so every row normalises to the same target: a Shopify location in a shop. Everything the
 * screens show is derived from that target, the delta, the event identity and the System Message the row
 * was batched into — so the adapters below are the only place the two ledgers differ.
 *
 * DELIVERY STATE IS DERIVED, NEVER READ FROM A STATUS COLUMN. The aggregate ledger still carries a
 * `detailStatusId`, but it is being retired server-side and this model does not read it: an unbatched
 * row with a non-zero delta is waiting, an unbatched zero is a finished no-op, and a batched row is
 * whatever its System Message says. The physical ledger has never had a status, which is why that rule
 * is the one both follow.
 *
 * Labels, colours and translations stay in the composable and the view; this module decides only what a
 * row IS, so the rules are unit-testable without a DOM, a worker or a locale.
 */
import { toMillis } from "./cacheProjection";
import { type InventoryEventSourceRoot, canonicalEventTypeId, isReservationEventType, sourceRootFor } from "./inventoryEventSourceRoots";
import { isSuccess } from "./systemMessage";

export type InventoryEventKind = "channel" | "location";

/**
 * Where a row stands on its way to Shopify. Total over every input: an unknown message status lands in
 * `inFlight`, so a status seeded after this app shipped still renders rather than falling off the page.
 */
export type DeliveryStateId = "waiting" | "noChange" | "inFlight" | "error" | "sent" | "cancelled";

export interface DeliveryState {
  id: DeliveryStateId;
  /** The System Message status behind a batched state; absent for the two unbatched ones. */
  statusId?: string;
}

/** The message fields the model reads, from whichever of the two cached copies was read last. */
export interface InventoryEventMessage {
  statusId?: string;
  processedDate?: unknown;
  initDate?: unknown;
  /** When this copy was written to the cache — the freshness test between the two copies. */
  cachedAt?: number;
}

export interface InventoryEventSource {
  /** The app fetch path that can name the source document, when one can. */
  root?: InventoryEventSourceRoot;
  /** The reference without its lifecycle phase. */
  reference: string;
  /** Trailing effective-date phase on a configuration reference: OLD, NEW, ACTIVATE or EXPIRE. */
  phase: string;
  /** The reservation families' reference, split into the two ids it is made of. */
  reservation?: { inventoryItemId: string; detailSeqId: string };
}

export interface InventoryEvent {
  kind: InventoryEventKind;
  /** Unique across both ledgers: the ledger kind plus that ledger's own cache key. */
  rowKey: string;
  shopId: string;
  /**
   * The Shopify location the delta is applied to. A channel row normally publishes to its channel's
   * location; a retarget drain publishes to the OLD location it was calculated for, and saying the
   * channel's new one there would tell the operator the opposite of what will happen.
   */
  locationId: string;
  retarget: boolean;
  /** Aggregate rows only: the channel that owns the row. Kept for the per-channel monitor figures. */
  channelId?: string;
  eventTypeId: string;
  eventReferenceId: string;
  /** The server's own Enumeration description, with the id standing in only when it is missing. */
  eventTypeLabel: string;
  source: InventoryEventSource;
  inventoryItemId: string;
  delta: number;
  /** The Shopify `reason` the batch publishes under; `correction` when the type maps to none. */
  reason: string;
  reasonMapped: boolean;
  messageId?: string;
  delivery: DeliveryState;
  createdAt: number;
  /** When Shopify accepted the batch. Only ever set on a sent row. */
  sentAt?: number;
  /** When the batch carrying this row was produced, for ordering batches. */
  batchedAt?: number;
  /** Is Shopify still owed this row? False for the three ways a row finishes without a delivery. */
  awaitingDelivery: boolean;
  decisionComment: string;
}

const DELTA_PRECISION = 1e6;

/**
 * Deltas are decimals summed in JavaScript, so `0.1 + 0.2 - 0.3` lands on 5.55e-17 rather than 0.
 * Rounding to six places makes the zero and integer tests agree with the OMS's BigDecimal arithmetic.
 */
export function roundDelta(value: unknown): number {
  const rounded = Math.round(Number(value || 0) * DELTA_PRECISION) / DELTA_PRECISION;

  // `-0` formats as "-0" and reads as a decrease that is not one.
  return rounded === 0 ? 0 : rounded;
}

/** Sum a group's deltas the way the publisher does, rounding once at the end. */
export function sumDelta(values: Array<unknown>): number {
  return roundDelta(values.reduce((total: number, value) => total + Number(value || 0), 0));
}

/**
 * What the publisher does with a summed group delta: exactly zero settles as no change, and a sum that
 * is not a whole number is refused because Shopify takes integer quantities.
 */
export function deltaOutcome(delta: number): "noChange" | "publish" | "quarantine" {
  const rounded = roundDelta(delta);
  if(rounded === 0) {return "noChange";}

  return Number.isInteger(rounded) ? "publish" : "quarantine";
}

/**
 * The rule both ledgers share. Cancelled and rejected messages are the batcher's markers for a group
 * that summed to zero or to a non-whole quantity, and a message nothing will retry; `SmsgError` is a
 * failure the sender retries, so it is not terminal.
 */
export function deliveryStateOf(messageId: string | undefined, delta: number, statusId?: string): DeliveryState {
  if(!messageId) {return { id: roundDelta(delta) === 0 ? "noChange" : "waiting" };}
  const status = String(statusId ?? "");
  if(isSuccess(status)) {return { id: "sent", statusId: status };}
  if(status === "SmsgCancelled" || status === "SmsgRejected") {return { id: "cancelled", statusId: status };}
  if(status === "SmsgError") {return { id: "error", statusId: status };}

  return { id: "inFlight", statusId: status || undefined };
}

/** Shopify is still owed the row: nothing has batched it, or its batch has not settled. */
export function isAwaitingDelivery(state: DeliveryState): boolean {
  return state.id === "waiting" || state.id === "inFlight" || state.id === "error";
}

/**
 * A message the message poller must keep re-reading: batched, and not in a status the pipeline has
 * finished with.
 */
export function isUnsettledMessage(statusId: string | undefined): boolean {
  const state = deliveryStateOf("batched", 1, statusId);

  return state.id === "inFlight" || state.id === "error";
}

/**
 * The message a row's delivery reads, from whichever copy the cache wrote last.
 *
 * Two pollers keep a batch's status current — the ledger view's own message cursor, which rewrites the
 * row with its joined message columns, and the message poller, which re-reads unsettled messages by id.
 * They land at different moments, and the copy written later is the fresher read of the same server row.
 * Reading one of them unconditionally would let an older read win for a whole tick.
 */
export function effectiveMessageOf(
  raw: Record<string, any>,
  rowCachedAt: number | undefined,
  cachedMessage: InventoryEventMessage | undefined,
): InventoryEventMessage | undefined {
  if(!raw?.systemMessageId) {return undefined;}
  const joined: InventoryEventMessage = {
    statusId: raw.systemMessageStatusId,
    processedDate: raw.systemMessageProcessedDate,
    initDate: raw.systemMessageInitDate,
    cachedAt: rowCachedAt,
  };
  if(!cachedMessage) {return joined;}
  if(!joined.statusId) {return cachedMessage;}

  return (cachedMessage.cachedAt ?? 0) > (joined.cachedAt ?? 0) ? cachedMessage : joined;
}

/**
 * Which OMS record an event came from. The reference is the source row's natural key: a receipt id, an
 * item issuance id, a physical inventory id, a reset item id, `inventoryItemId:detailSeqId` for the
 * reservation families, and a composite key with a trailing lifecycle phase for the configuration ones.
 */
export function sourceOf(eventTypeId: string, eventReferenceId: string): InventoryEventSource {
  const raw = String(eventReferenceId ?? "");
  const phaseMatch = raw.match(/:(OLD|NEW|ACTIVATE|EXPIRE)$/);
  const phase = phaseMatch ? phaseMatch[1] : "";
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

/**
 * One ledger row as the model. The only kind-specific facts are the target identity and the retarget
 * column the aggregate ledger has and the physical one does not.
 */
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
    // A failed or retrying attempt stamps a processed date too; only an accepted send is a delivery.
    sentAt: delivery.id === "sent" ? toMillis(message?.processedDate) : undefined,
    batchedAt: messageId ? toMillis(message?.initDate) : undefined,
    awaitingDelivery: isAwaitingDelivery(delivery),
    decisionComment: text(raw?.decisionComment),
  };
}

/** The family both spellings of an event type share, for grouping and filtering across OMS versions. */
export function eventFamilyOf(event: Pick<InventoryEvent, "eventTypeId">): string {
  return canonicalEventTypeId(event.eventTypeId);
}

// -------------------------------------------------------------------------------------------------
// Figures — every one computed here, over whatever rows the caller hands in, so the KPIs describe the
// slice a reader has filtered to rather than the whole window.
// -------------------------------------------------------------------------------------------------

export interface InventoryEventSummary {
  total: number;
  waiting: number;
  /** Batched and not yet accepted, retrying failures included. */
  inFlight: number;
  errors: number;
  /** The oldest row Shopify is still owed: the one that makes Shopify wrong right now. */
  oldestOwedAt?: number;
  oldestWaitingAt?: number;
  /**
   * Time from recording to acceptance, over the rows that have one. MEDIAN, not mean: one row that sat
   * through an outage drags a mean somewhere no row actually was.
   */
  lag?: { median: number; slowest: number; count: number };
}

export function summarizeInventoryEvents(events: readonly InventoryEvent[]): InventoryEventSummary {
  let waiting = 0;
  let inFlight = 0;
  let errors = 0;
  let oldestOwedAt: number | undefined;
  let oldestWaitingAt: number | undefined;
  const lags: number[] = [];
  // A loop, not `Math.min(...rows)`: the spread becomes one argument per row.
  for(const event of events) {
    if(event.delivery.id === "waiting") {
      waiting += 1;
      if(event.createdAt && (oldestWaitingAt === undefined || event.createdAt < oldestWaitingAt)) {oldestWaitingAt = event.createdAt;}
    }
    if(event.delivery.id === "inFlight") {inFlight += 1;}
    if(event.delivery.id === "error") {errors += 1;}
    if(event.awaitingDelivery && event.createdAt && (oldestOwedAt === undefined || event.createdAt < oldestOwedAt)) {
      oldestOwedAt = event.createdAt;
    }
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

// -------------------------------------------------------------------------------------------------
// Batches — one System Message and the rows it carried.
// -------------------------------------------------------------------------------------------------

/**
 * ONE CHANGE ENTRY: what Shopify is actually sent. The batcher groups its rows by (inventory item,
 * location) and sums the deltas, so several ledger rows collapse into one entry of the mutation.
 */
export interface InventoryChangeEntry<T extends InventoryEvent = InventoryEvent> {
  key: string;
  inventoryItemId: string;
  locationId: string;
  retarget: boolean;
  delta: number;
  eventCount: number;
  outcome: "publish" | "noChange" | "quarantine";
  /** The first row behind the entry: one inventory item is one remote target, so they share a product. */
  sample: T;
}

export function changeEntriesOf<T extends InventoryEvent>(events: readonly T[]): InventoryChangeEntry<T>[] {
  const grouped = new Map<string, T[]>();
  for(const event of events) {
    const key = `${event.inventoryItemId}@${event.locationId}`;
    const bucket = grouped.get(key);
    if(bucket) {bucket.push(event);} else {grouped.set(key, [event]);}
  }

  return [...grouped.entries()].map(([key, rows]) => {
    const delta = sumDelta(rows.map((row) => row.delta));

    return {
      key,
      inventoryItemId: rows[0].inventoryItemId,
      locationId: rows[0].locationId,
      retarget: rows[0].retarget,
      delta,
      eventCount: rows.length,
      outcome: deltaOutcome(delta),
      sample: rows[0],
    };
  }).sort((a, b) => a.inventoryItemId.localeCompare(b.inventoryItemId));
}

export interface InventoryEventBatch<T extends InventoryEvent = InventoryEvent> {
  id: string;
  kind: InventoryEventKind;
  delivery: DeliveryState;
  createdAt: number;
  events: T[];
  entries: InventoryChangeEntry<T>[];
  locationIds: string[];
  /**
   * A reason belongs to the whole mutation, so it can only be named when the batch holds one event
   * family; a mixed batch publishes under `correction`, which is what the batcher itself does.
   */
  reason: string;
  reasonMapped: boolean;
  mixedEventTypes: boolean;
}

export function groupInventoryEventBatches<T extends InventoryEvent>(events: readonly T[]): InventoryEventBatch<T>[] {
  const grouped = new Map<string, T[]>();
  for(const event of events) {
    if(!event.messageId) {continue;}
    const bucket = grouped.get(event.messageId);
    if(bucket) {bucket.push(event);} else {grouped.set(event.messageId, [event]);}
  }

  return [...grouped.entries()].map(([id, rows]) => {
    const families = new Set(rows.map(eventFamilyOf));
    const mixed = families.size > 1;
    const createdAt = rows.reduce((earliest, row) => {
      const at = row.batchedAt || row.createdAt;

      return at && (!earliest || at < earliest) ? at : earliest;
    }, 0);

    return {
      id,
      kind: rows[0].kind,
      delivery: rows[0].delivery,
      createdAt,
      events: rows,
      entries: changeEntriesOf(rows),
      locationIds: [...new Set(rows.map((row) => row.locationId).filter(Boolean))],
      reason: mixed ? "correction" : rows[0].reason,
      reasonMapped: !mixed && rows[0].reasonMapped,
      mixedEventTypes: mixed,
    };
  }).sort((a, b) => b.createdAt - a.createdAt);
}

// -------------------------------------------------------------------------------------------------
// Filters — the ones the history view offers, applied in one pass.
// -------------------------------------------------------------------------------------------------

export interface InventoryEventFilters {
  /** Lower-cased free text, matched against `searchText` for each row. */
  query?: string;
  deliveryState?: DeliveryStateId | "";
  /** Matched by family, so a filter chosen on one spelling of a type matches the other. */
  eventTypeId?: string;
  locationId?: string;
  /** Inclusive millisecond bounds on `createdAt`. */
  fromMs?: number;
  toMs?: number;
}

export function filterInventoryEvents<T extends InventoryEvent>(
  events: readonly T[],
  filters: InventoryEventFilters,
  searchText: (event: T) => string,
): T[] {
  const query = String(filters.query ?? "").trim().toLowerCase();
  const family = filters.eventTypeId ? canonicalEventTypeId(filters.eventTypeId) : "";

  return events.filter((event) =>
    (!filters.deliveryState || event.delivery.id === filters.deliveryState) &&
    (!family || eventFamilyOf(event) === family) &&
    (!filters.locationId || event.locationId === filters.locationId) &&
    (filters.fromMs === undefined || event.createdAt >= filters.fromMs) &&
    (filters.toMs === undefined || event.createdAt <= filters.toMs) &&
    (!query || searchText(event).toLowerCase().includes(query)));
}
