import { api, commonUtil } from "@common";
import { ref } from "vue";
import {
  emptyTransferSyncEnrichment,
  enrichTransferSyncRows,
  type TransferSyncEnrichmentClient,
} from "@/utils/shopifyTransferSyncEnrichment";
import type {
  TransferSyncEnrichment,
  TransferSyncOrder,
  TransferSyncReceipt,
} from "@/utils/shopifyTransferSyncPresentation";

// Poorti caps this resource at 50 rows even when a larger page is requested. Matching the real
// server limit is what lets a full 50-row response mean "there may be another page" instead of
// being mistaken for the final page on large transfer receipts.
const RECEIPT_PAGE_SIZE = 50;
const SHIPMENT_MAPPING_PAGE_SIZE = 100;

function responseData(response: any): any {
  return response?.data ?? response;
}

function assertReadable(response: any, message: string): any {
  if(commonUtil.hasError(response)) {throw new Error(message);}
  return responseData(response);
}

/** Dates and the confirmed Shopify identity for the explicitly opened TO. */
export function useTransferSyncSummary() {
  const summary = ref<any>(undefined);
  const summaryError = ref("");
  let summaryVersion = 0;

  async function loadSummary(shopId: string, orderId: string) {
    const version = ++summaryVersion;
    summary.value = undefined;
    summaryError.value = "";
    try {
      const [datesResponse, mappingsResponse]: any[] = await Promise.all([
        api({ url: "oms/transferOrders", method: "GET", params: { orderId, fieldsToSelect: "orderId,orderDate,entryDate", limit: 1 } }),
        api({ url: "sob/shopify/transferSync/syncedCreate", method: "GET", params: { shopId, orderId, pageSize: 100 } }),
      ]);
      const dates = assertReadable(datesResponse, "Transfer dates could not be loaded.")?.orders?.[0];
      const mappings = assertReadable(mappingsResponse, "The Shopify transfer identity could not be loaded.");
      if(!Array.isArray(mappings) || mappings.some(row => String(row.shopId) !== shopId || String(row.orderId) !== orderId)) {
        throw new Error("Transfer ownership could not be verified.");
      }
      const ids = [...new Set<string>(mappings.map(row => String(row.shopifyInventoryTransferId || "")).filter(Boolean))];
      if(ids.length > 1) {throw new Error("The Shopify transfer identity could not be verified.");}

      if (version === summaryVersion) {
        summary.value = { orderDate: dates?.orderDate, entryDate: dates?.entryDate, transferId: ids[0] };
      }
    } catch (err: any) {
      if (version === summaryVersion) {
        summaryError.value = err.message;
      }
    }
  }

  return { summary, summaryError, loadSummary };
}

/** Adapter over the existing OMS/Poorti endpoints; no transfer-sync API payload is widened. */
export function createTransferSyncEnrichmentClient(): TransferSyncEnrichmentClient {
  return {
    async fetchOrder(orderId: string): Promise<TransferSyncOrder | undefined> {
      const response: any = await api({
        url: `oms/transferOrders/${encodeURIComponent(orderId)}`,
        method: "GET",
      });
      return assertReadable(response, "The OMS could not load this transfer's detail.")?.order;
    },
    async fetchCreationTime(orderId: string): Promise<string | undefined> {
      const response: any = await api({
        url: "oms/transferOrders",
        method: "GET",
        params: {
          orderId,
          fieldsToSelect: "orderId,entryDate",
          limit: 1,
        },
      });
      const orders = assertReadable(response, "The OMS could not load this transfer's creation time.")?.orders;
      const entryDate = Array.isArray(orders) ? orders[0]?.entryDate : undefined;
      if(entryDate === undefined || entryDate === null || entryDate === "") {return undefined;}
      const entryDateMillis = Number(entryDate);
      return Number.isFinite(entryDateMillis) ? new Date(entryDateMillis).toISOString() : String(entryDate);
    },
    async fetchReceipts(orderId: string): Promise<TransferSyncReceipt[]> {
      const receipts: TransferSyncReceipt[] = [];
      for(let pageIndex = 0; ; pageIndex++) {
        const response: any = await api({
          url: `poorti/transferOrders/${encodeURIComponent(orderId)}/receipts`,
          method: "GET",
          params: { pageIndex, pageSize: RECEIPT_PAGE_SIZE },
        });
        const page = assertReadable(response, "The OMS could not load this transfer's receipts.");
        const rows: TransferSyncReceipt[] = Array.isArray(page) ? page : [];
        receipts.push(...rows);
        if(rows.length < RECEIPT_PAGE_SIZE) {return receipts;}
      }
    },
    async fetchReceiverNames(userLoginIds: string[]): Promise<Record<string, string>> {
      if(!userLoginIds.length) {return {};}
      const response: any = await api({
        url: "oms/users",
        method: "GET",
        params: {
          userLoginId: userLoginIds,
          userLoginId_op: "in",
          fieldsToSelect: ["userLoginId", "firstName", "middleName", "lastName", "groupName"],
          pageSize: userLoginIds.length,
        },
      });
      const users = assertReadable(response, "The OMS could not load receiver names.");
      return (Array.isArray(users) ? users : []).reduce((names, user) => {
        const userLoginId = String(user?.userLoginId ?? "");
        const name = [user?.firstName, user?.middleName, user?.lastName, user?.groupName]
          .map((part) => String(part ?? "").trim()).filter(Boolean).join(" ");
        if(userLoginId && name) {names[userLoginId] = name;}
        return names;
      }, {} as Record<string, string>);
    },
    async fetchShopifyShipmentIds(shopId: string, shipmentIds: string[]): Promise<Record<string, string[]>> {
      if(!shopId || !shipmentIds.length) {return {};}
      const idsByShipment: Record<string, string[]> = {};
      for(let pageIndex = 0; ; pageIndex++) {
        const response: any = await api({
          url: "sob/shopify/transferShipmentMappings",
          method: "GET",
          params: {
            shopId,
            shipmentId: shipmentIds,
            shipmentId_op: "in",
            pageIndex,
            pageSize: SHIPMENT_MAPPING_PAGE_SIZE,
          },
        });
        const page = assertReadable(response, "The OMS could not load Shopify shipment identifiers.");
        const mappings = Array.isArray(page) ? page : [];
        for(const mapping of mappings) {
          const shipmentId = String(mapping?.shipmentId ?? "");
          const shopifyShipmentId = String(mapping?.shopifyInventoryShipmentId ?? "");
          if(!shipmentId || !shopifyShipmentId) {continue;}
          const existing = idsByShipment[shipmentId] ?? [];
          if(!existing.includes(shopifyShipmentId)) {existing.push(shopifyShipmentId);}
          idsByShipment[shipmentId] = existing;
        }
        if(mappings.length < SHIPMENT_MAPPING_PAGE_SIZE) {return idsByShipment;}
      }
    },
  };
}

/**
 * Screen-local enrichment. It is intentionally separate from the 15-second worker snapshot so
 * opening this page never causes per-transfer detail reads in the background.
 */
export function useShopifyTransferSyncEnrichment() {
  const enrichment = ref<TransferSyncEnrichment>(emptyTransferSyncEnrichment());
  const loading = ref(false);
  const error = ref("");
  const client = createTransferSyncEnrichmentClient();
  let latestRequest = 0;

  async function load(rows: Record<string, unknown>[], options: { refresh?: boolean } = {}) {
    const request = ++latestRequest;
    if(!rows.length) {return;}
    loading.value = true;
    error.value = "";
    try {
      const loaded = await enrichTransferSyncRows(rows, options.refresh ? emptyTransferSyncEnrichment() : enrichment.value, client);
      if(request === latestRequest) {enrichment.value = loaded;}
    } catch (err: any) {
      if(request === latestRequest) {error.value = err?.message || "Transfer details could not be loaded.";}
    } finally {
      if(request === latestRequest) {loading.value = false;}
    }
  }

  return { enrichment, loading, error, load };
}
