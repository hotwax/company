import { computed } from "vue";
import { dataManagerLogCache } from "@/utils/cacheEntities";
import { type TransferDeliveryConfigIds, type TransferDeliveryStage, transferDeliveryLogs } from "@/utils/shopifyTransferDelivery";
import { useCachedList } from "./useCachedList";

/** `configIds` are the shop's stagers' own configs; a stage without one reads the seeded default. */
export function useShopifyTransferDelivery(shopId: () => string, configIds: () => TransferDeliveryConfigIds = () => ({})) {
  const { records } = useCachedList<any>(dataManagerLogCache);
  const logs = computed(() => records.value.filter(log => log.transferShopId === shopId()));

  return {
    logsFor: (stage: TransferDeliveryStage, orderId?: string) => transferDeliveryLogs(logs.value, shopId(), stage, orderId, configIds()),
  };
}
