import { useLiveEntity } from "@common";
import { companyDb } from "@/db/companyDb";
import { type TRANSFER_DELIVERY_CONFIGS, transferDeliveryLogs } from "@/utils/shopifyTransferDelivery";

export function useShopifyTransferDelivery(shopId: () => string) {
  const { records: logs } = useLiveEntity<any>(companyDb.tables.dataManagerLogs, () => ({ scope: { field: "transferShopId", value: shopId() } }));

  return {
    logsFor: (stage: keyof typeof TRANSFER_DELIVERY_CONFIGS, orderId?: string) => transferDeliveryLogs(logs.value, shopId(), stage, orderId),
  };
}
