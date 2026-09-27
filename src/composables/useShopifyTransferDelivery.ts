import { computed } from "vue";
import { dataManagerLogCache } from "@/utils/cacheEntities";
import { type TRANSFER_DELIVERY_CONFIGS, transferDeliveryLogs } from "@/utils/shopifyTransferDelivery";
import { useCachedList } from "./useCachedList";

export function useShopifyTransferDelivery(shopId: () => string) {
  const { records } = useCachedList<any>(dataManagerLogCache);
  const logs = computed(() => records.value.filter(log => log.transferShopId === shopId()));

  return {
    logs,
    logsFor: (stage: keyof typeof TRANSFER_DELIVERY_CONFIGS, orderId?: string) => transferDeliveryLogs(logs.value, shopId(), stage, orderId),
  };
}
