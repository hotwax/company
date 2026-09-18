/**
 * THE SHOPIFY INVENTORY EVENT VOCABULARY — the closed set of `eventTypeId` values both inventory
 * ledgers carry, written once.
 *
 * The connector moved this vocabulary off its own `SHOPIFY_INVENTORY_EVENT_TYPE` table onto
 * `moqui.basic.Enumeration` under `enumTypeId="ShopifyInventoryEventType"`. `Enumeration.enumId` is
 * globally unique and `CYCLE_COUNT` already belongs to `IID_REASON`, so every id in this family
 * carries an `SIE_` prefix. THE PREFIX IS PART OF THE ID: the view entities join
 * `eventTypeId = Enumeration.enumId` and alias the ledger column through untouched, so
 * `ShopifyInventoryAdjustmentDetailView.eventTypeId` and its location-level twin return the
 * prefixed id. Nothing strips it on the way out.
 *
 * ⚠️ THIS IS A RELEASE CONTRACT WITH mantle-shopify-connector, not a local display choice. It moves
 * only in lockstep with the connector release that changes the seeded enumeration. The app must NOT
 * grow a second spelling of any id: this module is the only place these strings are written, and
 * `useShopify` and `ShopifyInventorySync` both read them from here.
 *
 * What the ids are NOT used for: rendering. `eventTypeDescription` is joined from
 * `Enumeration.description`, so the server owns every label an operator reads. These constants only
 * answer BEHAVIOURAL questions — which source resolver a row needs, and how its reference reads.
 */

/**
 * The family prefix, exported for the one job it has: undoing it when an id must be prettified for
 * display because the server sent no description. Never use it to build an id by concatenation.
 */
export const SHOPIFY_INVENTORY_EVENT_TYPE_PREFIX = "SIE_";

/** All 17 seeded ids. Keyed by the bare event name so a reader can see the prefix is uniform. */
export const SHOPIFY_INVENTORY_EVENT_TYPE = {
  RECEIPT: "SIE_RECEIPT",
  TRANSFER_RECEIPT: "SIE_TRANSFER_RECEIPT",
  RETURN_RESTOCK: "SIE_RETURN_RESTOCK",
  PHYSICAL_INVENTORY: "SIE_PHYSICAL_INVENTORY",
  CYCLE_COUNT: "SIE_CYCLE_COUNT",
  POS_ISSUANCE: "SIE_POS_ISSUANCE",
  EXTERNAL_RESET: "SIE_EXTERNAL_RESET",
  RESERVATION_CREATE: "SIE_RESERVATION_CREATE",
  RESERVATION_RELEASE: "SIE_RESERVATION_RELEASE",
  TRANSFER_RESERVATION_CREATE: "SIE_TRANSFER_RESERVATION_CREATE",
  TRANSFER_RESERVATION_RELEASE: "SIE_TRANSFER_RESERVATION_RELEASE",
  // The configuration families. They name no OMS document — their references decode locally to ids
  // the app already holds, and the audit-keyed ones cannot be looked up at all — so no resolver and
  // no source label claims them. They are listed anyway because a closed vocabulary that omits a
  // third of itself is the thing that drifts.
  PRODUCT_FACILITY_CONFIG: "SIE_PRODUCT_FACILITY_CONFIG",
  PRODUCT_STORE_FACILITY: "SIE_PRODUCT_STORE_FACILITY",
  PRODUCT_STORE_FACILITY_AUDIT: "SIE_PRODUCT_STORE_FACILITY_AUDIT",
  FACILITY_GROUP_MEMBER: "SIE_FACILITY_GROUP_MEMBER",
  INVENTORY_CHANNEL: "SIE_INVENTORY_CHANNEL",
  INVENTORY_CHANNEL_AUDIT: "SIE_INVENTORY_CHANNEL_AUDIT",
} as const;

/** The families that resolve through a ShipmentReceipt scan. */
export const RECEIPT_EVENT_TYPES: string[] = [
  SHOPIFY_INVENTORY_EVENT_TYPE.RECEIPT,
  SHOPIFY_INVENTORY_EVENT_TYPE.TRANSFER_RECEIPT,
  SHOPIFY_INVENTORY_EVENT_TYPE.RETURN_RESTOCK,
];

/** The families that resolve through a cycle-count variance decision. */
export const PHYSICAL_EVENT_TYPES: string[] = [
  SHOPIFY_INVENTORY_EVENT_TYPE.PHYSICAL_INVENTORY,
  SHOPIFY_INVENTORY_EVENT_TYPE.CYCLE_COUNT,
];

/**
 * The four reservation families — all of them.
 *
 * ⚠️ A PREFIX TEST DOES NOT WORK HERE and the `SIE_` rename is what broke it. The transfer pair is
 * `SIE_TRANSFER_RESERVATION_*`, so `startsWith("SIE_RESERVATION_")` silently drops exactly the two
 * ids this release adds — the row would fall through to "no resolver" and render its reference as
 * one opaque colon-joined token. Membership, not shape, is the test.
 *
 * The transfer pair is new in this release: transfer-order reservations previously recorded under
 * the generic ids. They carry the SAME `inventoryItemId:inventoryItemDetailSeqId` reference from the
 * same producer branch, so they need the same resolver and the same two-part reference rendering.
 */
export const RESERVATION_EVENT_TYPES: string[] = [
  SHOPIFY_INVENTORY_EVENT_TYPE.RESERVATION_CREATE,
  SHOPIFY_INVENTORY_EVENT_TYPE.RESERVATION_RELEASE,
  SHOPIFY_INVENTORY_EVENT_TYPE.TRANSFER_RESERVATION_CREATE,
  SHOPIFY_INVENTORY_EVENT_TYPE.TRANSFER_RESERVATION_RELEASE,
];

/** Is this one of the four reservation families? Use this instead of testing the id's shape. */
export function isReservationEventType(eventTypeId: string): boolean {
  return RESERVATION_EVENT_TYPES.includes(eventTypeId);
}
