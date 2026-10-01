import { toMillis } from "./cacheProjection";

export const TRANSFER_DELIVERY_CONFIGS = {
  create: "POST_SHOPIFY_TRANSFER_ORDER",
  update: "UPDATE_SHOPIFY_INVENTORY_TRANSFER",
} as const;

export function transferDeliveryState(log: any): { label: string; explanation: string; color: string } {
  if(Number(log.failedRecordCount) > 0 || ["DmlsFailed", "DmlsCrashed", "DmlsError"].includes(log.statusId)) {
    return { label: "Delivery needs attention", explanation: "The Shopify processor reported failures. Review the delivery log before retrying.", color: "warning" };
  }
  if(log.cancelDateTime || log.statusId === "DmlsCancelled") {
    return { label: "Delivery cancelled", explanation: "This file will not be sent to Shopify. Review the delivery log before staging again.", color: "warning" };
  }
  if(log.statusId === "DmlsFinished" && toMillis(log.finishDateTime) !== undefined && log.failedRecordCount !== null && log.failedRecordCount !== undefined && Number(log.failedRecordCount) === 0) {
    return { label: "Delivered to Shopify", explanation: "The Shopify processor completed this file with no failed records.", color: "success" };
  }
  if(log.statusId === "DmlsRunning" && toMillis(log.startDateTime) !== undefined && toMillis(log.finishDateTime) === undefined) {
    return { label: "Processing in Shopify", explanation: "The Shopify processor has started. Keep this page open for confirmation; another staging run is not needed while it processes.", color: "primary" };
  }
  if(["DmlsPending", "DmlsQueued"].includes(log.statusId)) {
    return { label: "Queued for Shopify", explanation: "Staging succeeded. The file is waiting for the separate Shopify processor; the transfer stays outstanding until delivery is confirmed.", color: "medium" };
  }

  return { label: "Delivery not confirmed", explanation: "The available log does not confirm Shopify delivery. Review the delivery log.", color: "medium" };
}

/** Membership is taken from the retained source file, never inferred from a successful shop run. */
export function transferOrdersInFile(value: unknown, shopId: string): string[] {
  const rows = typeof value === "string" ? JSON.parse(value) : value;
  if(!Array.isArray(rows) || rows.some(row => String(row?.shopId) !== shopId || !row?.orderId)) {
    throw new Error("Transfer file membership could not be verified.");
  }

  return [...new Set(rows.map(row => String(row.orderId)))];
}

export function transferDeliveryLogs(logs: any[], shopId: string, stage: keyof typeof TRANSFER_DELIVERY_CONFIGS, orderId?: string) {
  return logs.filter(log => log.transferShopId === shopId && log.configId === TRANSFER_DELIVERY_CONFIGS[stage] &&
    (!orderId || log.transferOrderIds?.includes(orderId)))
    .sort((left, right) => (toMillis(right.createdDate) ?? 0) - (toMillis(left.createdDate) ?? 0));
}
