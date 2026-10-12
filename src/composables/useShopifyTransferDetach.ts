import { api, commonUtil } from "@common";

const BASE = "sob/shopify/transferSync";
const PAGE_SIZE = 100;

export interface TransferOwner {
  shopId: string;
  orderId: string;
  shopifyInventoryTransferId?: string;
}

/** One event source for the location inventory pipeline: a receipt or a transfer reservation detail. */
export type TransferEventSelector = { receiptId: string } |
  { reservationInventoryItemId: string; reservationInventoryItemDetailSeqId: string };

export interface TransferDetachResult {
  attempted: number;
  createdDetailCount: number;
  existingDetailCount: number;
  failed: { selector: TransferEventSelector; message: string }[];
}

function readable(response: any, message: string): any {
  if(commonUtil.hasError(response)) {throw new Error(message);}

  return response?.data ?? response;
}

async function listAll(url: string, params: Record<string, any>, message: string): Promise<any[]> {
  const rows: any[] = [];
  for(let pageIndex = 0; ; pageIndex++) {
    const page = readable(await api({ url, method: "GET", params: { ...params, pageIndex, pageSize: PAGE_SIZE } }), message);
    const pageRows = Array.isArray(page) ? page : [];
    rows.push(...pageRows);
    if(pageRows.length < PAGE_SIZE) {return rows;}
  }
}

/** The native sync owner row for this order, if any. */
async function fetchOwner(shopId: string, orderId: string): Promise<TransferOwner | undefined> {
  const rows = await listAll(`${BASE}/owners`, { shopId, orderId }, "Native sync ownership could not be loaded.");

  return rows.find(row => String(row.shopId) === shopId && String(row.orderId) === orderId);
}

const RESERVATION_REASONS = ["INV_RES_CREATE", "INV_RES_RELEASE"];

function inventoryDetailUrl(productId: string, facilityId: string) {
  return `oms/products/${encodeURIComponent(productId)}/facilities/${encodeURIComponent(facilityId)}/inventoryDetail`;
}

/**
 * Receipts (at the destination) and transfer reservations (at the origin) that the location pipeline
 * turns into events, read from the OMS inventory history one product and facility at a time.
 */
async function fetchEventSelectors(orderId: string): Promise<TransferEventSelector[]> {
  const order = readable(
    await api({ url: `oms/transferOrders/${encodeURIComponent(orderId)}`, method: "GET" }),
    "The transfer could not be loaded."
  )?.order;
  if(!order?.facilityId || !order?.orderFacilityId) {throw new Error("The transfer's facilities could not be resolved.");}

  const productIds = [...new Set<string>((order.items || []).map((item: any) => String(item.productId || "")).filter(Boolean))];
  const receiptIds = new Set<string>();
  const reservations = new Map<string, TransferEventSelector>();
  for(const productId of productIds) {
    const [receiptRows, reservationRows] = await Promise.all([
      listAll(inventoryDetailUrl(productId, order.orderFacilityId), { orderId }, "Transfer receipts could not be loaded."),
      listAll(
        inventoryDetailUrl(productId, order.facilityId), { orderId, reasonEnumId: RESERVATION_REASONS.join(","), reasonEnumId_op: "in" },
        "Transfer reservations could not be loaded."
      ),
    ]);
    receiptRows.filter(row => String(row.orderId) === orderId && row.receiptId).forEach(row => receiptIds.add(String(row.receiptId)));
    reservationRows.filter(row => String(row.orderId) === orderId && RESERVATION_REASONS.includes(row.reasonEnumId) && row.inventoryItemId && row.inventoryItemDetailSeqId)
      .forEach(row => reservations.set(
        `${row.inventoryItemId}:${row.inventoryItemDetailSeqId}`,
        { reservationInventoryItemId: String(row.inventoryItemId), reservationInventoryItemDetailSeqId: String(row.inventoryItemDetailSeqId) }
      ));
  }

  return [...[...receiptIds].map(receiptId => ({ receiptId })), ...reservations.values()];
}

/**
 * Deletes the owner row, then optionally posts each event source so the movements the native sync
 * suppressed are recorded as location inventory events. Selectors are read before the delete.
 */
async function detach(shopId: string, orderId: string, publishEvents: boolean): Promise<TransferDetachResult> {
  const selectors = publishEvents ? await fetchEventSelectors(orderId) : [];
  readable(await api({ url: `${BASE}/owners`, method: "delete", data: { shopId, orderId } }), "Native sync ownership could not be removed.");

  const result: TransferDetachResult = { attempted: selectors.length, createdDetailCount: 0, existingDetailCount: 0, failed: [] };
  for(const selector of selectors) {
    try {
      const posted = readable(await api({ url: `${BASE}/inventoryEvents`, method: "post", data: selector }), "The inventory event could not be recorded.");
      result.createdDetailCount += Number(posted?.createdDetailCount ?? 0);
      result.existingDetailCount += Number(posted?.existingDetailCount ?? 0);
    } catch (err: any) {
      result.failed.push({ selector, message: err?.message || String(err) });
    }
  }

  return result;
}

/** Detaching a transfer order from native Shopify transfer sync. */
export function useShopifyTransferDetach() {
  return { fetchOwner, fetchEventSelectors, detach };
}
