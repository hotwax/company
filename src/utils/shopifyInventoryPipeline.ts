/**
 * The Shopify inventory publisher's pipeline — pure classification, Vue-free.
 *
 * A `ShopifyInventoryAdjustmentDetail` row moves through TWO state machines, and the page's four
 * sections are a function of both: the ledger row's own `detailStatusId` (has the batcher claimed it,
 * did it settle as no change, was it refused) and, once a batch exists, the `SystemMessage` status
 * (has Shopify confirmed it). Deriving the sections inline in the view is what let a whole class of
 * rows fall between them: the first cut enumerated only the statuses a healthy instance produces, so a
 * batch that reached `SmsgRejected` or `SmsgCancelled` matched no section and disappeared from the page
 * while still counting toward the "N shown" badge.
 *
 * So the rule lives here instead, stated as a TOTAL function — every (ledger status, message status)
 * pair resolves to exactly one section, with the unsettled case as the catch-all rather than an
 * enumeration that a new backend status can fall out of. `tests/utils/shopifyInventoryPipeline.spec.ts`
 * asserts that totality across every status the app knows.
 *
 * This module is a leaf: it imports only `systemMessage`, which is itself a leaf. No i18n, no Vue —
 * labels and colors stay in the view, so a section can be renamed without touching the rule.
 */

import { isSuccess, messageState } from "./systemMessage";

/** The four sections of the pipeline, in the order the publisher acts on them. */
export type PipelineSectionId = "waiting" | "inFlight" | "quarantined" | "settled";

/** The ledger statuses the connector writes. A row carrying anything else is still classified. */
export const DETAIL_STATUS_IDS = ["DETAIL_PENDING", "DETAIL_ASSIGNED", "DETAIL_NOOP", "DETAIL_ERROR"] as const;

/**
 * A batch that has NOT settled: everything from staged to actively sending to terminally refused.
 *
 * Derived from `messageState` rather than listed, so a status added to the SystemMessage seed lands
 * here automatically instead of vanishing from the page. `SmsgError` belongs here because the sender
 * retries it; `SmsgRejected` / `SmsgCancelled` belong here because they are the operator's problem
 * even though nothing will retry them (see `isDeliveryTerminalFailure`).
 */
export function isDeliveryUnsettled(statusId: string | null | undefined): boolean {
  return !isSuccess(statusId);
}

/**
 * A delivery that failed and will NOT be retried by the sender.
 *
 * `SmsgError` is a retryable failure — the sweep picks it up again — so it is deliberately not here.
 * The page badges these differently: a retrying batch needs patience, a rejected one needs a person.
 */
export function isDeliveryTerminalFailure(statusId: string | null | undefined): boolean {
  return statusId === "SmsgRejected" || statusId === "SmsgCancelled";
}

/**
 * The delivery status for a ledger row: the LIVE message when the message cache has it, else the
 * status denormalized onto the ledger row.
 *
 * The two disagree for a tick. The worker writes ledger rows first and then refreshes the messages of
 * unsent batches, so a batch that has just flipped to `SmsgSent` is current in the message cache while
 * the ledger row still says `SmsgProduced` until it re-enters the recent page. Everything that reads a
 * delivery status must go through here, or the same screen shows a row as settled in one panel and
 * in flight in another.
 */
export function deliveryStatusOf(
  detail: Record<string, any> | null | undefined,
  messageStatusId?: string | null,
): string {
  if (!detail?.systemMessageId) return "";
  return String(messageStatusId || detail.systemMessageStatusId || "");
}

/**
 * The section ONE ledger row belongs to. Total: every input resolves to exactly one section.
 *
 * Order matters. The ledger's terminal states win over the delivery state, because a refused or
 * no-change row is finished regardless of what happened to any batch it was once in.
 */
export function sectionOfEvent(
  detail: Record<string, any> | null | undefined,
  messageStatusId?: string | null,
): PipelineSectionId {
  // Terminal on the ledger: never batched again, and excluded from the absolute reset gate.
  if (detail?.detailStatusId === "DETAIL_ERROR") return "quarantined";
  // Closed as no change: the delta netted to zero, so no mutation was ever owed to Shopify.
  if (detail?.detailStatusId === "DETAIL_NOOP") return "settled";
  // Nothing has claimed it yet. Deliberately not gated on DETAIL_PENDING: a row with no batch is
  // waiting whatever its status says, and a status the app does not know must still be visible.
  if (!detail?.systemMessageId) return "waiting";

  const statusId = deliveryStatusOf(detail, messageStatusId);
  // Shopify confirmed it (Sent / Consumed / Confirmed).
  if (isSuccess(statusId)) return "settled";

  // Everything else has a batch that has not settled — staged, sending, retrying, refused, or a
  // status this app has not seen. The catch-all is the point: no row can fall out of the page.
  return "inFlight";
}

/**
 * The section a whole BATCH belongs to, from its message status alone.
 *
 * A batch is only ever in flight or settled; the ledger's terminal states are row-level facts. Kept
 * beside `sectionOfEvent` so the two cannot drift: a batch shown as in flight must contain rows that
 * `sectionOfEvent` also calls in flight.
 */
export function sectionOfBatch(statusId: string | null | undefined): Extract<PipelineSectionId, "inFlight" | "settled"> {
  return isSuccess(statusId) ? "settled" : "inFlight";
}

/**
 * Is this row waiting to be batched? The monitor's "pending batching" badge and the Waiting section
 * MUST both read this, or the badge counts rows the section it links to does not show.
 */
export function isWaitingDetail(detail: Record<string, any> | null | undefined): boolean {
  return sectionOfEvent(detail) === "waiting";
}

/**
 * Deltas are decimal quantities summed in JavaScript, so `0.1 + 0.2 - 0.3` lands on 5.55e-17 rather
 * than 0. Rounding to six places first is what makes the zero test and the integer test agree with the
 * BigDecimal arithmetic the OMS does on the same rows.
 */
const DELTA_PRECISION = 1e6;

/** One summed delta, rounded to the precision the publisher's own arithmetic settles on. */
export function roundDelta(value: number): number {
  const rounded = Math.round(Number(value || 0) * DELTA_PRECISION) / DELTA_PRECISION;
  // `-0` formats as "-0" and reads as a decrease that is not one.
  return rounded === 0 ? 0 : rounded;
}

/** Sum the change entries of a group the way the publisher will, then round once at the end. */
export function sumDelta(values: Array<number | string | null | undefined>): number {
  return roundDelta(values.reduce((total: number, value) => total + Number(value || 0), 0));
}

/**
 * What the publisher will do with a summed group delta.
 *
 * The rounded value drives BOTH tests. Testing `delta === 0` on the raw sum let float noise escape the
 * no-change branch and then pass the integer test, so a group the OMS settles as `DETAIL_NOOP` was
 * previewed to the operator as "Will publish +5.551115123125783e-17".
 */
export function deltaOutcome(delta: number): "noChange" | "publish" | "quarantine" {
  const rounded = roundDelta(delta);
  if (rounded === 0) return "noChange";

  return Number.isInteger(rounded) ? "publish" : "quarantine";
}
