import { api, commonUtil } from "@common";
import { useTransferMappingResolution } from "./useShopify";
import { fetchCurrentShopifyTransfer } from "./useShopifyTransferSync";

async function read(url: string, params: Record<string, unknown>) {
  const response: any = await api({ url, method: "GET", params });
  if(commonUtil.hasError(response)) {throw new Error("Transfer comparison could not be read.");}

  return response?.data ?? response;
}

/** Exact shipment item identity, not the coincidentally equal OMS order item sequence. */
export function useShopifyTransferUpdateCheck() {
  return { check: async function checkTransferUpdateItem(shopId: string, orderId: string, shipmentId: string, shipmentItemSeqId: string) {
    const [creation, shipments] = await Promise.all([
      read("sob/shopify/transferSync/syncedCreate", { shopId, orderId, pageSize: 100 }),
      read("poorti/shipments", { shipmentId, orderId, orderTypeId: "TRANSFER_ORDER", pageSize: 1 }),
    ]);
    if(!Array.isArray(creation) || creation.some(row => String(row.shopId) !== shopId || String(row.orderId) !== orderId)) {
      throw new Error("Transfer ownership could not be verified.");
    }
    const ids = [...new Set(creation.map(row => String(row.shopifyInventoryTransferId || "")).filter(Boolean))];
    if(ids.length !== 1) {throw new Error("The Shopify transfer identity could not be verified.");}
    const shipment = shipments?.shipments?.find((row: any) => String(row.shipmentId) === shipmentId);
    const item = shipment?.items?.find((row: any) => String(row.shipmentItemSeqId) === shipmentItemSeqId && String(row.orderId) === orderId);
    if(!item?.productId) {throw new Error("The affected shipment item could not be verified.");}
    const [choices, snapshot] = await Promise.all([
      useTransferMappingResolution().fetchChoices(shopId, String(item.productId)),
      fetchCurrentShopifyTransfer(shopId, ids[0]),
    ]);
    const matches = choices.length === 1 && choices[0].available
      ? snapshot.lines.filter((line: any) => line.inventoryItem?.id === `gid://shopify/InventoryItem/${choices[0].inventoryItemId}`) : [];

    return { item, choices, snapshot, transferId: ids[0], matches, checkedAt: new Date().toISOString() };
  } };
}

export type TransferUpdateCheck = Awaited<ReturnType<ReturnType<typeof useShopifyTransferUpdateCheck>["check"]>>;
