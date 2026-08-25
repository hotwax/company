import { api, logger } from "@common";
import { computed, toValue } from "vue";
import {
  FULFILLMENT_HISTORY_ENDPOINT_MISSING,
  shopifyFulfillmentHistoryCache,
  shopifyFulfillmentHistorySupportCache,
} from "@/utils/cacheEntities";
import { toMillis } from "@/utils/cacheProjection";
import {
  type ParsedFulfillmentMessage,
  QUEUED_FULFILLMENT_MESSAGE_TYPE_ID,
  QUEUED_FULFILLMENT_STATUS_IDS,
  type ShopifyFulfillmentDetails,
  type ShopifyFulfillmentDetailsResult,
  mapFulfillmentDetails,
  parseFulfillmentMessageText,
} from "@/utils/shopifyFulfillment";
import { onSessionCleared } from "./sessionScope";
import { useCachedList } from "./useCachedList";
import { type ShopIdSource, useShopifySyncContext } from "./useShopify";
import { useSystemMessages } from "./useSystemMessage";

/**
 * SHOPIFY FULFILLMENT SYNC — the reactive readers behind the fulfillment sync screen.
 *
 * The screen answers one operational question three ways: did this shipment's fulfillment reach
 * Shopify?
 *   - "Queued"  = the OMS side of the wire: CreateShopifyFulfillment SystemMessages on the shop's
 *                 remotes that have not reached SmsgSent (`useQueuedFulfillments`).
 *   - "Synced"  = the record of arrival: `sob/shopify/fulfillmentHistories` rows the
 *                 `shopifyFulfillmentHistory` worker domain caches (`useSyncedFulfillments`).
 *   - expansion = Shopify's own account of a fulfillment, fetched through `shopify/graphql` when a
 *                 synced row is opened (`useShopifyFulfillmentDetails`) — never polled, cached for
 *                 the session because a fulfillment's record only grows.
 *
 * Everything list-shaped reads from IndexedDB through `useCachedList`; the worker owns all
 * cadence (activate `fulfillmentSyncDomains(...)` from `@/utils/shopifyFulfillment` to run it).
 * The one live read is the expand-time GraphQL call, which has no OMS-side cache to serve it. The
 * pure halves — payload parsing, detail mapping, the domain factory — live in
 * `@/utils/shopifyFulfillment`; the constants a page matches on are re-exported here so the screen
 * has one import point.
 */

export {
  FULFILLMENT_HISTORY_ENDPOINT_MISSING,
  QUEUED_FULFILLMENT_MESSAGE_TYPE_ID,
  QUEUED_FULFILLMENT_STATUS_IDS,
};

export interface QueuedFulfillmentRow {
  systemMessageId: string;
  statusId: string;
  /** Attempts so far. 0 for a message the sweep has not touched. */
  failCount: number;
  initDate?: number;
  lastAttemptDate?: number;
  systemMessageTypeId: string;
  /** The stored payload, verbatim — what the message-text accordion renders. */
  messageText: string;
  /** From the SystemMessage row itself (entity-extended with orderId in this runtime). */
  orderId: string;
  parsed: ParsedFulfillmentMessage;
}

/**
 * The shop's CreateShopifyFulfillment queue, newest first — messages on ANY of the shop's remotes
 * that have not reached SmsgSent.
 *
 * Scoping is by the shop's full remote set (a shop can hold several remotes and its traffic is
 * spread across them), resolved through the same rule the worker uses, so this list and the sync
 * domain can never disagree about whose messages these are.
 */
export function useQueuedFulfillments(shopIdSource: ShopIdSource) {
  const context = useShopifySyncContext(shopIdSource);
  const { records, hydrated: messagesHydrated } = useSystemMessages(undefined, {
    systemMessageTypeId: QUEUED_FULFILLMENT_MESSAGE_TYPE_ID,
    statusIds: [...QUEUED_FULFILLMENT_STATUS_IDS],
  });

  const hydrated = computed(() => context.hydrated.value && messagesHydrated.value);

  const rows = computed<QueuedFulfillmentRow[]>(() => {
    const remoteIds = new Set(context.remoteIds.value.map(String));
    if(!remoteIds.size) {return [];}

    return records.value
      .filter((message: any) => remoteIds.has(String(message?.systemMessageRemoteId ?? "")))
      .map((message: any) => ({
        systemMessageId: String(message?.systemMessageId ?? ""),
        statusId: String(message?.statusId ?? ""),
        failCount: Number(message?.failCount ?? 0) || 0,
        initDate: toMillis(message?.initDate),
        lastAttemptDate: toMillis(message?.lastAttemptDate),
        systemMessageTypeId: String(message?.systemMessageTypeId ?? ""),
        messageText: String(message?.messageText ?? ""),
        orderId: String(message?.orderId ?? ""),
        parsed: parseFulfillmentMessageText(message?.messageText),
      }));
  });

  return { rows, hydrated };
}

/** One cached ShopifyFulfillmentHistory row, in the endpoint's own aliases (dates as millis). */
export interface SyncedFulfillmentRow {
  /** `${shopId}:${fulfillmentId}` — the same key the details session cache uses. */
  fulfillmentKey: string;
  shopId: string;
  /** Shopify's legacy numeric id — the query side needs `gid://shopify/Fulfillment/{this}`. */
  fulfillmentId: string;
  shopifyOrderId: string;
  omsOrderId: string;
  shipmentId: string;
  originFacilityId: string;
  orderDate?: number;
  shippedDate?: number;
  /** Absent on rows the OMS itself pushed — a meaning, not a gap. */
  processedDate?: number;
  lastUpdatedStamp?: number;
}

/**
 * The shop's synced fulfillments, newest `lastUpdatedStamp` first — one row per
 * (shopId, fulfillmentId), which is the cache's own primary key so duplicates cannot exist.
 *
 * `endpointMissing` is the reactive form of the domain's 404 verdict: `sob/shopify/
 * fulfillmentHistories` ships in a connector release deployed independently of this app, and "the
 * OMS cannot tell me" must render differently from "nothing has synced". It flips off by itself
 * when a later probe succeeds (manual refresh, or re-entering the screen after the connector
 * lands).
 */
export function useSyncedFulfillments(shopIdSource: ShopIdSource) {
  const shopId = computed(() => String(toValue(shopIdSource) ?? ""));
  const { rows: cachedRows, hydrated: historyHydrated } =
    useCachedList<any>(shopifyFulfillmentHistoryCache);
  const { records: supportRecords, hydrated: supportHydrated } =
    useCachedList<any>(shopifyFulfillmentHistorySupportCache);

  const hydrated = computed(() => historyHydrated.value && supportHydrated.value);

  const rows = computed<SyncedFulfillmentRow[]>(() => {
    if(!shopId.value) {return [];}

    return cachedRows.value
      .filter((row: any) => String(row?.shopId ?? "") === shopId.value)
      // Sorted here rather than by index order so a row missing the stamp sinks to the bottom
      // instead of silently vanishing from an index-ordered read.
      .sort((a: any, b: any) => (Number(b?.lastUpdatedStamp) || 0) - (Number(a?.lastUpdatedStamp) || 0))
      .map((row: any) => ({
        fulfillmentKey: String(row?.fulfillmentKey ?? ""),
        shopId: String(row?.shopId ?? ""),
        fulfillmentId: String(row?.fulfillmentId ?? ""),
        shopifyOrderId: String(row?.shopifyOrderId ?? ""),
        omsOrderId: String(row?.omsOrderId ?? ""),
        shipmentId: String(row?.shipmentId ?? ""),
        originFacilityId: String(row?.originFacilityId ?? ""),
        orderDate: toMillis(row?.orderDate),
        shippedDate: toMillis(row?.shippedDate),
        processedDate: toMillis(row?.processedDate),
        lastUpdatedStamp: toMillis(row?.lastUpdatedStamp),
      }));
  });

  const endpointMissing = computed<boolean>(() => {
    if(!shopId.value) {return false;}
    const support = supportRecords.value
      .find((row: any) => String(row?.shopId ?? "") === shopId.value);

    return support?.isSupported === "N";
  });

  return { rows, hydrated, endpointMissing };
}

// ---------------------------------------------------------------------------------------------
// Expand-time enrichment — Shopify's own record of a fulfillment.
// ---------------------------------------------------------------------------------------------

/**
 * The fulfillment-by-id read. NO `sortKey` on any connection — unverified against this API
 * version — so events are sorted client-side instead (`mapFulfillmentDetails`). `first: 10` on
 * events feeds the client-side newest-5 cap.
 */
const FULFILLMENT_DETAILS_QUERY = `
  query Fulfillment($id: ID!) {
    fulfillment(id: $id) {
      name
      status
      displayStatus
      totalQuantity
      location { name }
      inTransitAt
      estimatedDeliveryAt
      deliveredAt
      trackingInfo { company number }
      fulfillmentLineItems(first: 10) {
        edges { node { quantity lineItem { name sku } } }
      }
      events(first: 10) {
        edges { node { happenedAt status message } }
      }
      fulfillmentOrders(first: 5) {
        edges {
          node {
            status
            requestStatus
            fulfillmentHolds { reason }
            deliveryMethod { methodType }
            destination { city province countryCode }
            fulfillBy
          }
        }
      }
    }
  }
`;

export interface ShopifyFulfillmentDetailsRequest {
  /** Either scope works; `shopId` wins when both are supplied. */
  shopId?: string;
  systemMessageRemoteId?: string;
  /** Shopify's legacy numeric id, as `fulfillmentHistories` stores it. */
  fulfillmentId: string;
}

/**
 * Successful reads for this session, keyed `${shopId}:${fulfillmentId}` (remote id standing in for
 * a caller that only has one). A fulfillment's record only ever grows — new events, a delivery
 * stamp — so a session-stale success beats a fresh request per expand; `unavailable` results are
 * deliberately NOT remembered, so a Shopify blip heals on the next expand instead of pinning the
 * card to "unreachable" all session.
 */
const fulfillmentDetailsSessionCache = new Map<string, ShopifyFulfillmentDetails>();

onSessionCleared(() => fulfillmentDetailsSessionCache.clear());

export function useShopifyFulfillmentDetails() {
  const getFulfillmentDetails = async (request: ShopifyFulfillmentDetailsRequest): Promise<ShopifyFulfillmentDetailsResult> => {
    const fulfillmentId = String(request?.fulfillmentId ?? "").trim();
    const shopId = String(request?.shopId ?? "").trim();
    const systemMessageRemoteId = String(request?.systemMessageRemoteId ?? "").trim();
    const scopeId = shopId || systemMessageRemoteId;
    if(!fulfillmentId || !scopeId) {return { unavailable: true };}

    const cacheKey = `${scopeId}:${fulfillmentId}`;
    const cached = fulfillmentDetailsSessionCache.get(cacheKey);
    if(cached) {return cached;}

    try {
      const response = await api({
        url: "shopify/graphql",
        method: "post",
        data: {
          ...(shopId ? { shopId } : { systemMessageRemoteId }),
          queryText: FULFILLMENT_DETAILS_QUERY,
          variables: { id: `gid://shopify/Fulfillment/${fulfillmentId}` },
        },
      }) as any;

      // The passthrough nests Shopify's body under `response` next to its own `statusCode` — the
      // envelope that has silently broken order-sync reads before, so both are checked explicitly.
      const body = response?.data;
      if(Number(body?.statusCode) !== 200) {return { unavailable: true };}
      const graphql = body?.response;
      if(graphql?.errors?.length || !graphql?.data?.fulfillment) {return { unavailable: true };}

      const details = mapFulfillmentDetails(graphql.data.fulfillment);
      fulfillmentDetailsSessionCache.set(cacheKey, details);

      return details;
    } catch (err) {
      logger.error(`Failed to fetch Shopify fulfillment ${fulfillmentId}`, err);

      return { unavailable: true };
    }
  };

  return { getFulfillmentDetails };
}

/**
 * One OMS shipment, the fields the queued card needs for full order context.
 *
 * `GET poorti/shipments` reads ShipmentDetailView (poorti/entity/FulfillmentViewEntities.xml),
 * which joins the shipment to its OrderHeader and to its SHIPMENT_SHIPPED status row — the shipped
 * date the fulfillment-history view deliberately could not alias without fanning rows out. The
 * card shows orderDate, shippedDate, and the facility name; tracking and carrier ride along.
 */
export interface OmsShipmentContext {
  orderId: string;
  /** The human-facing name, when this runtime's OrderHeader carries one. */
  orderName: string;
  orderDate?: number;
  shippedDate?: number;
  originFacilityId: string;
  facilityName?: string;
  carrierPartyId?: string;
  trackingNumber?: string;
}

const shipmentContextSessionCache = new Map<string, OmsShipmentContext>();

onSessionCleared(() => shipmentContextSessionCache.clear());

export interface OmsShipmentContextQuery {
  shipmentId?: string;
  /** Used only when the payload names no shipment; poorti/shipments filters on either. */
  orderId?: string;
}

export function useOmsShipmentContext() {
  const getShipmentContext = async (query: OmsShipmentContextQuery): Promise<OmsShipmentContext | undefined> => {
    const shipmentId = String(query?.shipmentId ?? "").trim();
    const orderId = String(query?.orderId ?? "").trim();
    // Whichever identifier the payload actually carries, sent under its own parameter name.
    const params: Record<string, string> = shipmentId ? { shipmentId } : orderId ? { orderId } : {};
    const cacheKey = shipmentId ? `shipment:${shipmentId}` : orderId ? `order:${orderId}` : "";
    if(!cacheKey) {return undefined;}

    const cached = shipmentContextSessionCache.get(cacheKey);
    if(cached) {return cached;}

    try {
      const response = await api({
        url: "poorti/shipments",
        method: "get",
        params,
      }) as any;
      // The service returns { shipments: [...], shipmentCount } — one row for a PK query. An empty
      // list is a meaning too: the payload names no live shipment, so render nothing rather than
      // pinning the card to a loading skeleton forever.
      const shipment = response?.data?.shipments?.[0];
      if(!shipment) {return undefined;}

      const context: OmsShipmentContext = {
        orderId: String(shipment.orderId ?? ""),
        orderName: String(shipment.orderName ?? ""),
        orderDate: toMillis(shipment.orderDate),
        shippedDate: toMillis(shipment.shippedDate),
        originFacilityId: String(shipment.originFacilityId ?? ""),
        facilityName: String(shipment.facilityName ?? "") || undefined,
        carrierPartyId: String(shipment.carrierPartyId ?? "") || undefined,
        trackingNumber: String(shipment.trackingIdNumber ?? "") || undefined,
      };
      shipmentContextSessionCache.set(cacheKey, context);

      return context;
    } catch (err) {
      logger.error(`Failed to fetch OMS shipment context for ${cacheKey}`, err);

      return undefined;
    }
  };

  return { getShipmentContext };
}
