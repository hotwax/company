import type { ActiveDomain } from "@/workers/syncRegistry";

/**
 * Shopify fulfillment sync — domain model + behaviors (pure, Vue-free).
 *
 * The reusable logic for the fulfillment sync screen: what a CreateShopifyFulfillment payload
 * holds, how Shopify's fulfillment record maps onto the screen's shape, and which worker domains
 * the screen activates. Kept as plain functions so tests need no reactive harness — the reactive
 * readers live in `@/composables/useShopifyFulfillment` and import these. Aside from the
 * `ActiveDomain` TYPE (erased at compile time), this module imports nothing from the app.
 */

/** The message type queue#SystemMessage produces for a shipped, eligible shipment. */
export const QUEUED_FULFILLMENT_MESSAGE_TYPE_ID = "CreateShopifyFulfillment";

/**
 * "Not landed yet", as statuses. SmsgSent means delivered and leaves the queue; a failed send does
 * NOT land on SmsgError — send#ProducedSystemMessage puts the status back and increments
 * `failCount`, so a retrying row reads SmsgProduced with a count above zero, and SmsgError is the
 * sweep giving up once the count reaches its limit.
 */
export const QUEUED_FULFILLMENT_STATUS_IDS: readonly string[] = ["SmsgProduced", "SmsgSending", "SmsgError"];

export interface ParsedFulfillmentItem {
  orderItemSeqId: string;
  productId: string;
  quantity?: number;
  shopifyLineItemId: string;
}

/** What `parseFulfillmentMessageText` recovers from a message body. Every field may be absent. */
export interface ParsedFulfillmentMessage {
  shipmentId: string;
  orderId: string;
  shopifyOrderId: string;
  trackingNumber: string;
  items: ParsedFulfillmentItem[];
}

/**
 * Parse a CreateShopifyFulfillment `messageText` — the JSON shipment detail the send service turns
 * into the Shopify body.
 *
 * Defensive on every level, because the payload is produced by a connector service whose aliases
 * can drift ahead of this app: not JSON, not an object, or missing any field must degrade to empty
 * values, NEVER throw — a malformed stored payload is precisely the row an operator most needs to
 * see on the queue.
 */
export function parseFulfillmentMessageText(messageText: unknown): ParsedFulfillmentMessage {
  const empty = (): ParsedFulfillmentMessage =>
    ({ shipmentId: "", orderId: "", shopifyOrderId: "", trackingNumber: "", items: [] });

  if(typeof messageText !== "string" || !messageText.trim()) {return empty();}

  let payload: any;
  try {
    payload = JSON.parse(messageText);
  } catch {
    return empty();
  }
  if(!payload || typeof payload !== "object" || Array.isArray(payload)) {return empty();}

  const items: ParsedFulfillmentItem[] = (Array.isArray(payload.shipmentItems) ? payload.shipmentItems : [])
    .filter((item: any) => item && typeof item === "object")
    .map((item: any) => {
      const quantity = Number(item.quantity);

      return {
        orderItemSeqId: String(item.orderItemSeqId ?? ""),
        productId: String(item.productId ?? ""),
        ...(Number.isFinite(quantity) ? { quantity } : {}),
        shopifyLineItemId: String(item.shopifyLineItemId ?? ""),
      };
    });

  return {
    shipmentId: String(payload.shipmentId ?? ""),
    orderId: String(payload.orderId ?? ""),
    shopifyOrderId: String(payload.shopifyOrderId ?? ""),
    trackingNumber: String(payload.trackingNumber ?? ""),
    items,
  };
}

/**
 * The worker domains the fulfillment sync screen activates — its message type and its history feed.
 *
 * Exists because the message domain syncs ONLY declared types (the app config deliberately lists
 * none for this screen: every configured type costs one request per remote on every tick of every
 * page that falls back to the config). Passing this list to `useCacheSync().start()` is what makes
 * CreateShopifyFulfillment messages as fresh as every other monitored type — the same
 * declare-your-own-types rule `syncFeatureDomains` applies for product and order sync.
 */
export function fulfillmentSyncDomains(options: {
  shopId: string;
  /**
   * The shop's exact remotes, when the screen has resolved them (`useShopifySyncContext`). Without
   * them the domain falls back to the config scope — every cached shop's remotes — which is correct
   * but pays one request per remote for shops this screen is not showing.
   */
  systemMessageRemoteIds?: string[];
  intervalMs?: number;
  /** Window depth per (remote, type) for queued messages. */
  messageTotal?: number;
  /** Window depth for the synced-fulfillment feed. */
  historyTotal?: number;
}): ActiveDomain[] {
  const shopId = String(options.shopId ?? "").trim();
  // Unresolved shop → no domains, never an unscoped pull (the same rule useShopifySyncSession
  // applies when its exact remotes are supplied but empty).
  if(!shopId) {return [];}

  const remoteIds = options.systemMessageRemoteIds?.map(String).filter(Boolean);
  const intervalMs = options.intervalMs ? { intervalMs: options.intervalMs } : {};

  return [
    {
      name: "systemMessage",
      ...intervalMs,
      args: {
        types: [{
          systemMessageTypeId: QUEUED_FULFILLMENT_MESSAGE_TYPE_ID,
          total: options.messageTotal ?? 50,
        }],
        ...(remoteIds?.length ? { systemMessageRemoteIds: remoteIds } : {}),
      },
    },
    {
      name: "shopifyFulfillmentHistory",
      ...intervalMs,
      args: {
        shopId,
        ...(options.historyTotal ? { total: options.historyTotal } : {}),
      },
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// Shopify's own record of a fulfillment — the shape the expand-time GraphQL read maps onto.
// ---------------------------------------------------------------------------------------------

export interface ShopifyFulfillmentEventDetail {
  happenedAt: string;
  status: string;
  message: string;
}

export interface ShopifyFulfillmentOrderDetail {
  status: string;
  requestStatus: string;
  /** Hold reasons, verbatim. Empty when nothing blocks the order. */
  holds: string[];
  /** `deliveryMethod.methodType`, e.g. SHIPPING. */
  deliveryMethod: string;
  /** "city, province, countryCode" with absent parts dropped. */
  destination: string;
  fulfillBy: string;
}

/** A Shopify fulfillment as the synced card's expansion renders it. Absent values arrive as "". */
export interface ShopifyFulfillmentDetails {
  unavailable?: false;
  name: string;
  /** FulfillmentStatus — whether the fulfillment still counts (SUCCESS/CANCELLED/ERROR/FAILURE). */
  status: string;
  /** FulfillmentDisplayStatus — where it got to, in Shopify's own vocabulary. */
  displayStatus: string;
  totalQuantity: number;
  locationName: string;
  inTransitAt: string;
  estimatedDeliveryAt: string;
  deliveredAt: string;
  trackingInfo: Array<{ company: string; number: string }>;
  lineItems: Array<{ quantity: number; name: string; sku: string }>;
  /** Newest first by `happenedAt`, capped at 5 (sorted client-side — no sortKey on the wire). */
  events: ShopifyFulfillmentEventDetail[];
  fulfillmentOrders: ShopifyFulfillmentOrderDetail[];
}

/** "Shopify unreachable" — the screen renders this state, never fabricated detail values. */
export type ShopifyFulfillmentDetailsResult = ShopifyFulfillmentDetails | { unavailable: true };

/** GraphQL connection → its nodes, tolerating a missing/foreign shape. */
function edgeNodes(connection: any): any[] {
  const edges = connection?.edges;
  if(!Array.isArray(edges)) {return [];}

  return edges.map((edge: any) => edge?.node).filter(Boolean);
}

/**
 * Map the GraphQL `fulfillment` node onto the screen's shape.
 *
 * Events are sorted newest-first HERE and capped at 5: no `sortKey` argument goes on the wire
 * (unverified against the pinned API version), so the wire order is never trusted.
 */
export function mapFulfillmentDetails(fulfillment: any): ShopifyFulfillmentDetails {
  const events = edgeNodes(fulfillment?.events)
    .map((node: any) => ({
      happenedAt: String(node?.happenedAt ?? ""),
      status: String(node?.status ?? ""),
      message: String(node?.message ?? ""),
    }))
    .sort((a, b) => (Date.parse(b.happenedAt) || 0) - (Date.parse(a.happenedAt) || 0))
    .slice(0, 5);

  const lineItems = edgeNodes(fulfillment?.fulfillmentLineItems).map((node: any) => ({
    quantity: Number(node?.quantity ?? 0) || 0,
    name: String(node?.lineItem?.name ?? ""),
    sku: String(node?.lineItem?.sku ?? ""),
  }));

  const trackingInfo = (Array.isArray(fulfillment?.trackingInfo) ? fulfillment.trackingInfo : [])
    .map((tracking: any) => ({
      company: String(tracking?.company ?? ""),
      number: String(tracking?.number ?? ""),
    }));

  const fulfillmentOrders = edgeNodes(fulfillment?.fulfillmentOrders).map((node: any) => ({
    status: String(node?.status ?? ""),
    requestStatus: String(node?.requestStatus ?? ""),
    holds: (Array.isArray(node?.fulfillmentHolds) ? node.fulfillmentHolds : [])
      .map((hold: any) => String(hold?.reason ?? ""))
      .filter(Boolean),
    deliveryMethod: String(node?.deliveryMethod?.methodType ?? ""),
    destination: [node?.destination?.city, node?.destination?.province, node?.destination?.countryCode]
      .map((part) => String(part ?? "").trim())
      .filter(Boolean)
      .join(", "),
    fulfillBy: String(node?.fulfillBy ?? ""),
  }));

  return {
    name: String(fulfillment?.name ?? ""),
    status: String(fulfillment?.status ?? ""),
    displayStatus: String(fulfillment?.displayStatus ?? ""),
    totalQuantity: Number(fulfillment?.totalQuantity ?? 0) || 0,
    locationName: String(fulfillment?.location?.name ?? ""),
    inTransitAt: String(fulfillment?.inTransitAt ?? ""),
    estimatedDeliveryAt: String(fulfillment?.estimatedDeliveryAt ?? ""),
    deliveredAt: String(fulfillment?.deliveredAt ?? ""),
    trackingInfo,
    lineItems,
    events,
    fulfillmentOrders,
  };
}
