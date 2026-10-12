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

/** Receipts and transfer reservation details that the location pipeline turns into events. */
async function fetchEventSelectors(orderId: string): Promise<TransferEventSelector[]> {
  const reservationParams = { orderId, reasonEnumId: "INV_RES_CREATE,INV_RES_RELEASE", reasonEnumId_op: "in" };
  const [receipts, reservations] = await Promise.all([
    listAll(`${BASE}/receipts`, { orderId }, "Transfer receipts could not be loaded."),
    listAll(`${BASE}/reservationDetails`, reservationParams, "Transfer reservations could not be loaded."),
  ]);

  return [
    ...receipts.filter(row => String(row.orderId) === orderId && row.receiptId).map(row => ({ receiptId: String(row.receiptId) })),
    ...reservations.filter(row => String(row.orderId) === orderId && row.inventoryItemId && row.inventoryItemDetailSeqId)
      .map(row => ({ reservationInventoryItemId: String(row.inventoryItemId), reservationInventoryItemDetailSeqId: String(row.inventoryItemDetailSeqId) })),
  ];
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
