import { computed, ref } from "vue";
import { api, commonUtil, translate, useSolrSearch } from "@common";
import { getResponseErrorMessage } from "@/utils";
import type { SampleLabel } from "@/utils/fedexLabel";
import { createCarrier, useCarriers } from "./useCarriers";
import { onSessionCleared } from "./sessionScope";
import { useProductStoreShippingMethodsLive } from "./useProductStores";
import {
  createShippingGatewayAuth,
  deleteShippingCarrierConfig,
  fetchUnigateRemoteConfig,
  saveShippingCarrierConfig,
  updateShippingGatewayAuth,
  useUnigate,
  type ShippingCarrierConfig,
  type ShippingGatewayAuth,
} from "./useUnigate";

import { FEDEX_SETUP_SETUP_STEP_IDS, type FedexSetupStepId, type FedexSetupStepStatus } from "@/config/fedexSetup";

export const FEDEX_CARRIER_PARTY_ID = "FEDEX";
export const FEDEX_GATEWAY_CONFIG_ID = "FEDEX";
export const FEDEX_BASE_URL = "https://apis.fedex.com";
// FedEx has no API for creating an account, so registration happens on their site.
export const FEDEX_REGISTRATION_URL = "https://developer.fedex.com/api/en-us/home.html";

export interface FedexFacilityAccount {
  facilityId: string;
  accountNumber: string;
}

export interface FedexSetupForm {
  productStoreId: string;
  /** The account used for the whole store unless a facility below has its own. */
  accountNumber: string;
  /** Left blank to keep the saved credentials. */
  apiKey: string;
  secretKey: string;
  facilityAccounts: FedexFacilityAccount[];
}

export interface SampleLabelOrder {
  shipmentId: string;
  orderId: string;
  orderName?: string;
  facilityId?: string;
  shipmentMethodTypeId?: string;
  customerName?: string;
  itemCount: number;
  statusId?: string;
  /** Empty when the order is approved but no shipment has been created for it yet. */
  shipGroupSeqId?: string;
  hasShipment?: boolean;
  /** The gateway's message from an earlier failed label attempt (route segment `gatewayMessage`). */
  labelError?: string;
  /** The search returned only part of the ship group's items, so picking it would be partial. */
  hasPartialItems?: boolean;
  /** Order items of the ship group, needed to pick an order that has no shipment yet. */
  items?: { orderId: string; orderItemSeqId: string; shipGroupSeqId: string; productId: string; quantity: number }[];
}

const failure = (response: any, fallback: string) =>
  new Error(getResponseErrorMessage(response, fallback));

/** Auth id for credentials created from this page. */
export const FEDEX_AUTH_ID = "FEDEX";

/** Rebuilds the account fields from the store's saved configs. */
export function fedexFormFromConfigs(configs: ShippingCarrierConfig[], productStoreId: string) {
  const rows = configs.filter((config) =>
    config.carrierPartyId === FEDEX_CARRIER_PARTY_ID && config.productStoreId === productStoreId);

  return {
    accountNumber: rows.find((row) => !row.facilityId)?.carrierAccountId || "",
    facilityAccounts: rows
      .filter((row) => row.facilityId)
      .map((row) => ({ facilityId: String(row.facilityId), accountNumber: row.carrierAccountId || "" })),
  };
}

/** The auth a store's FedEx config already points at, if it still exists. */
export function mappedFedexAuthId(
  configs: ShippingCarrierConfig[],
  productStoreId: string,
  auths: ShippingGatewayAuth[],
): string | undefined {
  const id = configs.find((config) =>
    config.carrierPartyId === FEDEX_CARRIER_PARTY_ID && config.productStoreId === productStoreId && config.gatewayAuthId)?.gatewayAuthId;
  // A link to credentials that no longer exist doesn't count, so the store can pick again.
  return auths.some((row) => row.shippingGatewayAuthId === id) ? id : undefined;
}

/**
 * The credentials a store uses: the ones it is already mapped to, else the one chosen on the page,
 * else the only FedEx auth there is. With several and no choice there is none, so nothing is guessed.
 */
export function resolveFedexAuth(
  auths: ShippingGatewayAuth[],
  configs: ShippingCarrierConfig[],
  productStoreId: string,
  chosenAuthId?: string,
): ShippingGatewayAuth | undefined {
  const mapped = mappedFedexAuthId(configs, productStoreId, auths);
  if(mapped) {return auths.find((row) => row.shippingGatewayAuthId === mapped);}

  const fedex = auths.filter((row) => row.shippingGatewayConfigId === FEDEX_GATEWAY_CONFIG_ID);
  if(chosenAuthId) {return fedex.find((row) => row.shippingGatewayAuthId === chosenAuthId);}
  return fedex.length === 1 ? fedex[0] : undefined;
}

/**
 * Creates or updates the carrier, the Unigate auth (API key as `username`, secret as `publicKey`)
 * and the store's carrier config plus one per facility account. Removed facility accounts are deleted.
 */
export async function saveFedexSetup(
  form: FedexSetupForm,
  current: { authId?: string; configs: ShippingCarrierConfig[]; carrierExists: boolean },
): Promise<string> {
  const apiKey = form.apiKey.trim();
  const secretKey = form.secretKey.trim();
  const facilityAccounts = form.facilityAccounts
    .map((row) => ({ facilityId: row.facilityId, accountNumber: row.accountNumber.trim() }))
    .filter((row) => row.facilityId || row.accountNumber);

  if(!form.productStoreId || !form.accountNumber.trim()) {
    throw new Error(translate("Product store and account number are required."));
  }
  if(!current.authId && (!apiKey || !secretKey)) {
    throw new Error(translate("API key and secret are required."));
  }
  if(Boolean(apiKey) !== Boolean(secretKey)) {
    throw new Error(translate("Enter both the API key and the secret, or leave both blank to keep the saved ones."));
  }
  if(facilityAccounts.some((row) => !row.facilityId || !row.accountNumber)) {
    throw new Error(translate("Each facility needs both a facility and an account number."));
  }
  if(new Set(facilityAccounts.map((row) => row.facilityId)).size !== facilityAccounts.length) {
    throw new Error(translate("A facility can only have one FedEx account."));
  }

  const tenant = await fetchUnigateRemoteConfig(true);
  if(!tenant?.internalId || !tenant?.sendUrl) {
    throw new Error(translate("Configure the Unigate connection before setting up FedEx."));
  }

  if(!current.carrierExists) {
    await createCarrier({ partyId: FEDEX_CARRIER_PARTY_ID, groupName: "FedEx" });
  }

  const authFields = {
    shippingGatewayConfigId: FEDEX_GATEWAY_CONFIG_ID,
    description: "FedEx",
    baseUrl: FEDEX_BASE_URL,
    authHeaderName: "Authorization",
    username: apiKey,
    publicKey: secretKey,
  };
  let gatewayAuthId = current.authId || FEDEX_AUTH_ID;
  if(!current.authId) {
    gatewayAuthId = await createShippingGatewayAuth({ ...authFields, shippingGatewayAuthId: FEDEX_AUTH_ID }) || FEDEX_AUTH_ID;
  } else if(apiKey) {
    await updateShippingGatewayAuth(current.authId, authFields);
  }

  const saved = current.configs.filter((config) =>
    config.carrierPartyId === FEDEX_CARRIER_PARTY_ID && config.productStoreId === form.productStoreId);
  const wanted = [
    { facilityId: "", accountNumber: form.accountNumber.trim() },
    ...facilityAccounts,
  ];
  for(const row of wanted) {
    const existing = saved.find((config) => (config.facilityId || "") === row.facilityId);
    await saveShippingCarrierConfig({
      ...(existing?.carrierConfigId ? { carrierConfigId: existing.carrierConfigId } : {}),
      carrierPartyId: FEDEX_CARRIER_PARTY_ID,
      productStoreId: form.productStoreId,
      facilityId: row.facilityId || undefined,
      gatewayAuthId,
      carrierAccountId: row.accountNumber,
      packagingType: existing?.packagingType || "YOUR_PACKAGING",
      dropoffType: existing?.dropoffType || "REGULAR_PICKUP",
      labelImageType: existing?.labelImageType || "PDF",
    });
  }
  for(const config of saved) {
    const kept = wanted.some((row) => row.facilityId === (config.facilityId || ""));
    if(!kept && config.carrierConfigId) {await deleteShippingCarrierConfig(config.carrierConfigId);}
  }

  return gatewayAuthId;
}

const liveSegments = (shipment: any): any[] =>
  (shipment.shipmentPackageRouteSegDetails ?? []).filter((seg: any) => seg.carrierServiceStatusId !== "SHRSCS_VOIDED");

/** Only recent orders are listed. */
const RECENT_MONTHS = 1;
const isRecent = (date: unknown): boolean => {
  if(!date) {return true;}
  const time = typeof date === "number" ? date : Date.parse(String(date));
  if(Number.isNaN(time)) {return true;}
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - RECENT_MONTHS);
  return time >= cutoff.getTime();
};

/** A label is missing when the shipment has no route segment, or one of them has no tracking URL. */
const isMissingLabel = (shipment: any): boolean => {
  const segments = liveSegments(shipment);
  return !segments.length || segments.some((seg: any) => !seg.trackingUrl);
};

/**
 * Approved or packed shipments from the last month with no label. The OMS can't filter on that,
 * so each page is filtered after loading and `hasMore` follows the unfiltered count.
 */
export async function fetchSampleLabelOrders(params: {
  productStoreId: string;
  queryString?: string;
  pageIndex?: number;
  pageSize?: number;
}): Promise<{ orders: SampleLabelOrder[]; hasMore: boolean }> {
  const query: Record<string, unknown> = {
    pageSize: params.pageSize ?? 20,
    pageIndex: params.pageIndex ?? 0,
    orderBy: "orderDate",
    shipmentTypeId: "SALES_SHIPMENT",
    statusId: ["SHIPMENT_APPROVED", "SHIPMENT_PACKED"],
    statusId_op: "in",
    productStoreId: params.productStoreId,
  };
  if(params.queryString?.trim()) {query.keyword = params.queryString.trim();}

  const response: any = await api({ url: "/poorti/shipments", method: "GET", params: query });
  if(commonUtil.hasError(response)) {throw failure(response, translate("Failed to load orders."));}

  const loaded: any[] = response.data?.shipments ?? [];
  const total = Number(response.data?.shipmentCount ?? loaded.length);
  const shipments: any[] = loaded
    .filter((shipment: any) => isRecent(shipment.orderDate) && isMissingLabel(shipment));
  return {
    hasMore: Number(query.pageIndex) * Number(query.pageSize) + loaded.length < total,
    orders: shipments.map((shipment) => ({
      shipmentId: shipment.shipmentId,
      orderId: shipment.orderId,
      orderName: shipment.orderName,
      facilityId: shipment.originFacilityId,
      shipmentMethodTypeId: shipment.shipmentMethodTypeId,
      customerName: [shipment.customerFirstName, shipment.customerLastName].filter(Boolean).join(" ") || shipment.customerName,
      itemCount: Array.isArray(shipment.items) ? shipment.items.length : Number(shipment.itemCount ?? 0),
      statusId: shipment.statusId,
      hasShipment: true,
      labelError: liveSegments(shipment).map((seg: any) => seg.gatewayMessage).find(Boolean),
    })),
  };
}

/** Approved orders of the store with no shipment yet (not picked). */
export async function fetchOrdersWithoutShipment(params: {
  productStoreId: string;
  queryString?: string;
  pageSize?: number;
}): Promise<SampleLabelOrder[]> {
  const solr = useSolrSearch();
  const payload = solr.prepareSolrQuery({
    docType: "ORDER",
    queryString: params.queryString?.trim() || "",
    queryFields: "orderId orderName customerEmailId customerPartyName",
    viewSize: params.pageSize ?? 20,
    sort: "orderDate asc",
    filters: {
      "-shipmentMethodTypeId": { value: ["STOREPICKUP", "POS_COMPLETED"] },
      orderStatusId: { value: "ORDER_APPROVED" },
      orderTypeId: { value: "SALES_ORDER" },
      productStoreId: { value: params.productStoreId },
    },
    solrFilters: [
      "((*:* -fulfillmentStatus: [* TO *]) OR fulfillmentStatus:Created)",
      `orderDate:[NOW-${RECENT_MONTHS}MONTH TO *]`,
    ],
    isGroupingRequired: true,
    groupBy: "orderItemShipGroupIdentifier",
  } as any);

  const response: any = await solr.runSolrQuery(payload);
  if(commonUtil.hasError(response)) {throw failure(response, translate("Failed to load orders."));}

  const groups: any[] = response.data?.grouped?.orderItemShipGroupIdentifier?.groups ?? [];
  return groups.map((group) => {
    const doc = group.doclist?.docs?.[0] ?? {};
    return {
      shipmentId: "",
      orderId: doc.orderId,
      orderName: doc.orderName,
      facilityId: doc.facilityId,
      shipmentMethodTypeId: doc.shipmentMethodTypeId,
      customerName: doc.customerPartyName,
      itemCount: Number(group.doclist?.numFound ?? group.doclist?.docs?.length ?? 0),
      hasPartialItems: Number(group.doclist?.numFound ?? 0) > (group.doclist?.docs?.length ?? 0),
      shipGroupSeqId: doc.shipGroupSeqId,
      items: (group.doclist?.docs ?? []).map((item: any) => ({
        orderId: item.orderId,
        orderItemSeqId: item.orderItemSeqId,
        shipGroupSeqId: item.shipGroupSeqId,
        productId: item.productId,
        quantity: item.quantity,
      })),
      hasShipment: false,
    };
  });
}

async function readSegments(shipmentId: string): Promise<any[]> {
  const response: any = await api({
    url: "/poorti/shipmentPackageRouteSegDetails",
    method: "GET",
    params: { shipmentId, pageSize: 10 },
  });
  if(commonUtil.hasError(response)) {throw failure(response, translate("Failed to read the shipping label."));}

  const body = response.data?.shipmentPackageRouteSegDetails ?? response.data;
  const rows: any[] = Array.isArray(body) ? body : [];
  return rows.filter((row) => row.carrierServiceStatusId !== "SHRSCS_VOIDED");
}

function labelFromSegments(live: any[]): SampleLabel | null {
  if(!live.length) {return null;}

  const withLabel = live.find((row) => row.labelImageUrl || row.labelImage) ?? live[0];
  return {
    labelImageUrl: withLabel.labelImageUrl,
    labelImage: withLabel.labelImage,
    labelImageType: withLabel.labelImageType,
    trackingCode: withLabel.trackingCode,
    carrierPartyId: withLabel.carrierPartyId,
    gatewayMessage: live.map((row) => row.gatewayMessage).find(Boolean),
  };
}

const readLabel = async (shipmentId: string) => labelFromSegments(await readSegments(shipmentId));

/**
 * Packing asks the shipment's carrier for the label, so the shipment is moved to FedEx first.
 * It keeps its method unless the store has FedEx methods to swap to.
 */
async function ensureFedexCarrier(order: SampleLabelOrder, fedexMethods: any[]): Promise<void> {
  const methods = fedexMethods.filter((method) =>
    method.partyId === FEDEX_CARRIER_PARTY_ID &&
    (order.shipmentMethodTypeId === "SHIP_TO_STORE" || method.shipmentMethodTypeId !== "SHIP_TO_STORE"));

  const segments = await readSegments(order.shipmentId);
  const segment = segments[0];
  if(!segment?.shipmentRouteSegmentId) {
    throw new Error(translate("This shipment has no route segment to update, so its carrier can't be set to FedEx."));
  }

  const current = methods.find((method) => method.shipmentMethodTypeId === segment.shipmentMethodTypeId);
  if(segment.carrierPartyId === FEDEX_CARRIER_PARTY_ID && (current || !methods.length)) {return;}

  const method = current ?? methods[0];
  const updated: any = await api({
    url: "/poorti/updateShipmentCarrierAndMethod",
    method: "PUT",
    data: {
      shipmentId: order.shipmentId,
      shipmentRouteSegmentId: segment.shipmentRouteSegmentId,
      shipmentMethodTypeId: method?.shipmentMethodTypeId ?? segment.shipmentMethodTypeId,
      carrierPartyId: FEDEX_CARRIER_PARTY_ID,
      isTrackingRequired: method?.isTrackingRequired || segment.isTrackingRequired || "Y",
    },
  });
  if(commonUtil.hasError(updated)) {throw failure(updated, translate("Failed to set the order's carrier to FedEx."));}
}

/** True or false when the shipment reports its ship group (directly or through its items); null when it doesn't. */
function belongsToShipGroup(shipment: any, order: SampleLabelOrder): boolean | null {
  if(shipment.shipGroupSeqId) {return shipment.shipGroupSeqId === order.shipGroupSeqId;}

  const seqIds = (Array.isArray(shipment.items) ? shipment.items : []).map((item: any) => item.orderItemSeqId).filter(Boolean);
  if(!seqIds.length) {return null;}

  const orderSeqIds = new Set((order.items ?? []).map((item) => item.orderItemSeqId));
  return seqIds.every((seqId: string) => orderSeqIds.has(seqId));
}

/** The search index lags, so an order may already be picked; use its shipment and pick only if none exists. */
async function withShipment(order: SampleLabelOrder): Promise<SampleLabelOrder> {
  const response: any = await api({
    url: "/poorti/shipments",
    method: "GET",
    params: { orderId: order.orderId, shipmentTypeId: "SALES_SHIPMENT", pageSize: 20 },
  });
  if(commonUtil.hasError(response)) {throw failure(response, translate("Failed to check the order's shipments."));}

  const active: any[] = (response.data?.shipments ?? []).filter((shipment: any) => shipment.statusId !== "SHIPMENT_CANCELLED");
  const matches = active.filter((shipment) => belongsToShipGroup(shipment, order) === true);
  // A shipment that can't be tied to a ship group may belong to another one, so it is never reused.
  if(!matches.length && active.some((shipment) => belongsToShipGroup(shipment, order) === null)) {
    throw new Error(translate("This order already has a shipment, but it can't be matched to this ship group. Continue it in Fulfillment."));
  }

  const found = matches.find((shipment) => shipment.statusId === "SHIPMENT_APPROVED") ?? matches[0];
  if(found) {return { ...order, shipmentId: found.shipmentId, statusId: found.statusId, hasShipment: true };}

  return { ...order, shipmentId: await pickOrder(order) };
}

/** Picks the order as Fulfillment does when creating a picklist, and returns the new shipment id. */
async function pickOrder(order: SampleLabelOrder): Promise<string> {
  if(!order.items?.length) {throw new Error(translate("This order has no items to pick."));}
  if(order.hasPartialItems) {throw new Error(translate("This order has too many items to pick here. Pick it in Fulfillment."));}

  const response: any = await api({
    url: "/poorti/createOrderFulfillmentWave",
    method: "POST",
    data: {
      packageName: "A",
      facilityId: order.facilityId,
      shipmentMethodTypeId: order.shipmentMethodTypeId,
      statusId: "PICKLIST_ASSIGNED",
      pickers: [],
      orderItems: order.items,
    },
  });
  if(commonUtil.hasError(response)) {throw failure(response, translate("Failed to pick the order."));}

  const shipmentId = response.data?.shipmentIds?.[0];
  if(!shipmentId) {throw new Error(translate("The order was picked but no shipment came back."));}
  return shipmentId;
}

const hasLabel = (label: SampleLabel | null): boolean =>
  Boolean(label && (label.labelImageUrl || label.labelImage) && label.trackingCode);

/** Picks if needed, sets the carrier to FedEx, packs, and reads the label back (one retry if missing). */
export async function generateSampleLabel(source: SampleLabelOrder, fedexMethods: any[]): Promise<SampleLabel> {
  const order = source.shipmentId ? source : await withShipment(source);
  await ensureFedexCarrier(order, fedexMethods);

  // An already packed shipment only needs its label retried.
  const alreadyPacked = order.statusId === "SHIPMENT_PACKED" || order.statusId === "SHIPMENT_SHIPPED";
  const packed: any = alreadyPacked ? {} : await api({
    url: `/poorti/shipments/${encodeURIComponent(order.shipmentId)}/pack`,
    method: "POST",
    data: {
      shipmentId: order.shipmentId,
      orderId: order.orderId,
      facilityId: order.facilityId,
      rejectedOrderItems: [],
      shipmentPackageContents: [],
    },
  });
  if(commonUtil.hasError(packed)) {
    // Prefer the gateway message stored on the segment over the generic pack error.
    const stored = (await readLabel(order.shipmentId).catch(() => null))?.gatewayMessage;
    throw stored ? new Error(stored) : failure(packed, translate("Failed to pack the order."));
  }

  let label = await readLabel(order.shipmentId);
  if(!hasLabel(label)) {
    await api({
      url: "/poorti/shipments/retryShippingLabel",
      method: "POST",
      data: { shipmentIds: [order.shipmentId] },
    });
    label = await readLabel(order.shipmentId);
  }

  if(!label || !hasLabel(label)) {
    throw new Error(label?.gatewayMessage || translate("FedEx did not return a label for this order. Check the credentials and account number."));
  }

  if(label.carrierPartyId && label.carrierPartyId !== FEDEX_CARRIER_PARTY_ID) {
    throw new Error(translate("The label came from {carrier}, not FedEx.", { carrier: label.carrierPartyId }));
  }

  return label;
}

// Progress

const VERIFIED_KEY = "company.fedexSetup.labelVerified";

function readVerified(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(VERIFIED_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch { return []; }
}

/** Stores where a FedEx label came back; kept per browser since the server doesn't record it. */
const verifiedStoreIds = ref<string[]>(readVerified());

function markLabelVerified(productStoreId: string) {
  if(verifiedStoreIds.value.includes(productStoreId)) {return;}

  verifiedStoreIds.value = [...verifiedStoreIds.value, productStoreId];
  try { localStorage.setItem(VERIFIED_KEY, JSON.stringify(verifiedStoreIds.value)); } catch { /* storage unavailable */ }
}

onSessionCleared(() => {
  verifiedStoreIds.value = [];
  try { localStorage.removeItem(VERIFIED_KEY); } catch { /* storage unavailable */ }
});

export function useFedexSetup() {
  const { carriers, hydrated } = useCarriers();
  const { isConfigured, shippingGatewayAuths, shippingCarrierConfigs } = useUnigate();
  const { fetchShippingMethodsFor } = useProductStoreShippingMethodsLive();

  const carrier = computed(() => carriers.value.find((row: any) => row.partyId === FEDEX_CARRIER_PARTY_ID));
  const fedexAuths = computed(() =>
    shippingGatewayAuths.value.filter((row) => row.shippingGatewayConfigId === FEDEX_GATEWAY_CONFIG_ID));
  const fedexConfigs = computed(() =>
    shippingCarrierConfigs.value.filter((config) => config.carrierPartyId === FEDEX_CARRIER_PARTY_ID));
  const mappedStoreIds = computed(() => [...new Set(fedexConfigs.value.map((config) => config.productStoreId))]);
  // A mapping that points at a credential which no longer exists cannot produce a label.
  const brokenMapping = computed(() =>
    fedexConfigs.value.some((config) => !shippingGatewayAuths.value.some((row) => row.shippingGatewayAuthId === config.gatewayAuthId)));

  /** Every status is derived from live data, except the label, which is remembered per browser. */
  const stepStatuses = computed<Record<FedexSetupStepId, FedexSetupStepStatus>>(() => {
    const verified = verifiedStoreIds.value.some((id) => mappedStoreIds.value.includes(id));
    const account: FedexSetupStepStatus = !fedexAuths.value.length
      ? "not-started"
      : !fedexConfigs.value.length ? "in-progress" : brokenMapping.value ? "attention" : "complete";
    const unigate: FedexSetupStepStatus = isConfigured.value ? "complete" : "not-started";

    return {
      unigate,
      credentials: account,
      label: verified ? "complete" : "not-started",
      readiness: unigate === "complete" && account === "complete" ? "complete" : "not-started",
    };
  });
  const completedCount = computed(() =>
    FEDEX_SETUP_SETUP_STEP_IDS.filter((id) => stepStatuses.value[id] === "complete").length);

  return {
    isUnigateConfigured: isConfigured,
    fedexAuths,
    resolveAuth: (productStoreId: string, chosenAuthId?: string) =>
      resolveFedexAuth(shippingGatewayAuths.value, shippingCarrierConfigs.value, productStoreId, chosenAuthId),
    mappedAuthId: (productStoreId: string) =>
      mappedFedexAuthId(shippingCarrierConfigs.value, productStoreId, shippingGatewayAuths.value),
    /** Other stores that use the same credentials, which a change to them affects. */
    storesSharingAuth: (authId: string | undefined, productStoreId: string) => authId
      ? [...new Set(fedexConfigs.value.filter((config) => config.gatewayAuthId === authId && config.productStoreId !== productStoreId)
        .map((config) => config.productStoreId))]
      : [],
    fedexConfigs,
    mappedStoreIds,
    stepStatuses,
    completedCount,
    totalStepCount: FEDEX_SETUP_SETUP_STEP_IDS.length,
    saveSetup: (form: FedexSetupForm, chosenAuthId?: string) => {
      // Before hydration the carrier looks missing and would be created again.
      if(!hydrated.value) {return Promise.reject(new Error(translate("Carriers are still loading. Try again in a moment.")));}
      const auth = resolveFedexAuth(shippingGatewayAuths.value, shippingCarrierConfigs.value, form.productStoreId, chosenAuthId);
      if(!auth && fedexAuths.value.length > 1) {
        return Promise.reject(new Error(translate("Choose which FedEx credentials this store uses.")));
      }
      return saveFedexSetup(form, {
        authId: auth?.shippingGatewayAuthId,
        configs: shippingCarrierConfigs.value,
        carrierExists: Boolean(carrier.value),
      });
    },
    shippingCarrierConfigs,
    fetchSampleLabelOrders,
    fetchOrdersWithoutShipment,
    generateLabel: async (order: SampleLabelOrder, productStoreId: string) => {
      const label = await generateSampleLabel(order, await fetchShippingMethodsFor(productStoreId));
      markLabelVerified(productStoreId);
      return label;
    },
  };
}
