import { toMillis } from "./cacheProjection";

/** The seeded configs. A shop's stager can run under another; its own `configId` parameter wins. */
export const TRANSFER_DELIVERY_CONFIGS = {
  create: "POST_SHOPIFY_TRANSFER_ORDER",
  update: "UPDATE_SHOPIFY_INVENTORY_TRANSFER",
} as const;

export type TransferDeliveryStage = keyof typeof TRANSFER_DELIVERY_CONFIGS;
export type TransferDeliveryConfigIds = Partial<Record<TransferDeliveryStage, string>>;

/** Each stage's config: the stager's own where it has one, else the seeded default. */
export function transferDeliveryConfigIds(overrides: TransferDeliveryConfigIds = {}): Record<TransferDeliveryStage, string> {
  return {
    create: overrides.create || TRANSFER_DELIVERY_CONFIGS.create,
    update: overrides.update || TRANSFER_DELIVERY_CONFIGS.update,
  };
}

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

/** Each stager card's config, keyed by delivery stage; cards for other jobs are ignored. */
export function deliveryConfigIdsOf(cards: Array<{ definition: { key: string }; configId?: string }>): TransferDeliveryConfigIds {
  return Object.fromEntries(cards
    .filter((card) => (card.definition.key === "create" || card.definition.key === "update") && card.configId)
    .map((card) => [card.definition.key, card.configId]));
}

/** Membership is taken from the retained source file, never inferred from a successful shop run. */
export function transferOrdersInFile(value: unknown, shopId: string): string[] {
  const rows = typeof value === "string" ? JSON.parse(value) : value;
  if(!Array.isArray(rows) || rows.some(row => String(row?.shopId) !== shopId || !row?.orderId)) {
    throw new Error("Transfer file membership could not be verified.");
  }

  return [...new Set(rows.map(row => String(row.orderId)))];
}

export function transferDeliveryLogs(logs: any[], shopId: string, stage: TransferDeliveryStage, orderId?: string, configIds: TransferDeliveryConfigIds = {}) {
  const configId = transferDeliveryConfigIds(configIds)[stage];

  return logs.filter(log => log.transferShopId === shopId && log.configId === configId &&
    (!orderId || log.transferOrderIds?.includes(orderId)))
    .sort((left, right) => (toMillis(right.createdDate) ?? 0) - (toMillis(left.createdDate) ?? 0));
}
