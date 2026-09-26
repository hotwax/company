/**
 * WHICH APP-SIDE ROOT RESOLVES WHICH INVENTORY EVENT.
 *
 * ⚠️ This is NOT the Shopify inventory event vocabulary and must never grow back into one. The server
 * owns that: both ledger view entities INNER-join `moqui.basic.Enumeration` on `eventTypeId = enumId`
 * and alias `eventTypeDescription` from it, so every row the app can see carries its own label and
 * stays in step with the types the connector seeds. Nothing here describes, orders or labels an event,
 * and nothing here reads `enumCode` or `optionValue` — those are the connector's Shopify-facing values,
 * and dispatching on them would put OMS behaviour at the mercy of a Shopify display rename.
 *
 * What this holds is the one thing the server cannot know: which of THIS app's fetch paths can name the
 * document behind an event. Ids absent from the table are not unknown — they are the six configuration
 * families, whose references decode locally to ids the app already holds and whose audit-keyed members
 * cannot be looked up at all, so no fetch path claims them.
 */

/**
 * The app's fetch paths. `shipmentReceipts` and `itemIssuances` are OMS GraphQL roots answered in bulk,
 * one query per page of rows; the rest are REST reads answered one row at a time —
 * `oms/inventoryItem/{id}/detail`, `inventory-cycle-count/varianceDecisions`, and
 * `poorti/externalInventoryResets/{id}`.
 */
export type InventoryEventSourceRoot = "shipmentReceipts" | "itemIssuances" |
  "inventoryItemDetails" | "varianceDecisions" | "externalInventoryResets";

const INVENTORY_EVENT_SOURCE_ROOTS: Record<string, InventoryEventSourceRoot> = {
  SIE_RECEIPT: "shipmentReceipts",
  SIE_TRANSFER_RECEIPT: "shipmentReceipts",
  SIE_RETURN_RESTOCK: "shipmentReceipts",
  SIE_POS_ISSUANCE: "itemIssuances",
  SIE_PHYSICAL_INVENTORY: "varianceDecisions",
  SIE_CYCLE_COUNT: "varianceDecisions",
  SIE_EXTERNAL_RESET: "externalInventoryResets",
  SIE_RESERVATION_CREATE: "inventoryItemDetails",
  SIE_RESERVATION_RELEASE: "inventoryItemDetails",
  SIE_TRANSFER_RESERVATION_CREATE: "inventoryItemDetails",
  SIE_TRANSFER_RESERVATION_RELEASE: "inventoryItemDetails",
};

/**
 * The `SIE_` form of an event type id.
 *
 * The event types became Moqui Enumerations, and the rows an OMS writes carry whichever spelling its
 * connector seeded: the enumeration release names them `SIE_POS_ISSUANCE`, while an OMS still on the
 * earlier seed writes `POS_ISSUANCE` for the same family (verified on rails-oms, where every ledger row
 * is unprefixed and the view still resolves its description). Keyed on the raw id, this table matched
 * nothing there, so every row lost its source record and a reservation reference rendered as one
 * opaque `inventoryItemId:detailSeqId` token. Both spellings name one family, so both resolve here.
 */
export function canonicalEventTypeId(eventTypeId: string): string {
  const id = String(eventTypeId ?? "").trim();

  return !id || id.startsWith("SIE_") ? id : `SIE_${id}`;
}

/** Undefined when no app fetch path can name this event's document. */
export function sourceRootFor(eventTypeId: string): InventoryEventSourceRoot | undefined {
  return INVENTORY_EVENT_SOURCE_ROOTS[canonicalEventTypeId(eventTypeId)];
}

/**
 * All four reservation families, by MEMBERSHIP rather than by the id's shape. A prefix test does not
 * work here: the transfer pair is `SIE_TRANSFER_RESERVATION_*`, so `startsWith("SIE_RESERVATION_")`
 * silently drops exactly the two ids this release adds and leaves those rows rendering their
 * `inventoryItemId:inventoryItemDetailSeqId` reference as one opaque token.
 */
export function isReservationEventType(eventTypeId: string): boolean {
  return sourceRootFor(eventTypeId) === "inventoryItemDetails";
}
