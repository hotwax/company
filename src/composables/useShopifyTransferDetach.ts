import { api, commonUtil } from "@common";
import { getResponseErrorMessage } from "@/utils";

const BASE = "sob/shopify/transferSync";
const PAGE_SIZE = 100;
/** Locale key for a detach that failed with no reason from the server. */
export const DETACH_FAILED = "The transfer could not be detached.";

export interface TransferOwner {
  shopId: string;
  orderId: string;
  shopifyInventoryTransferId?: string;
}

export interface TransferDetachResult {
  deletedLineCount: number;
  replayedEventCount: number;
  createdDetailCount: number;
  existingDetailCount: number;
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

/**
 * Detaches the order in one server call: the connector deletes its transfer lines and owner row and,
 * with publishEvents, records the receipts and reservations native sync suppressed, all in one
 * transaction. It refuses an order that already exists in Shopify, or one now owned by another shop.
 */
async function detach(shopId: string, orderId: string, publishEvents: boolean): Promise<TransferDetachResult> {
  let response: any;
  try {
    response = await api({ url: `${BASE}/detach`, method: "post", data: { orderId, shopId, publishEvents } });
  } catch (err: any) {
    throw new Error(getResponseErrorMessage(err, DETACH_FAILED), { cause: err });
  }
  if(commonUtil.hasError(response)) {throw new Error(getResponseErrorMessage(response, DETACH_FAILED));}

  const data = response?.data ?? response;

  return {
    deletedLineCount: Number(data?.deletedLineCount ?? 0),
    replayedEventCount: Number(data?.replayedEventCount ?? 0),
    createdDetailCount: Number(data?.createdDetailCount ?? 0),
    existingDetailCount: Number(data?.existingDetailCount ?? 0),
  };
}

/** Detaching a transfer order from native Shopify transfer sync. */
export function useShopifyTransferDetach() {
  return { fetchOwner, detach };
}
