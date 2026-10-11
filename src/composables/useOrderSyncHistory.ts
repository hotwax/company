import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { shopifyOrderSyncHistoryCache } from "@/utils/cacheEntities";
import { useCachedList } from "./useCachedList";
import { parseFulfillmentMessageText, QUEUED_FULFILLMENT_STATUS_IDS } from "@/utils/shopifyFulfillment";
import { toMillis } from "@/utils/cacheProjection";

export function useOrderSyncHistory(shop: MaybeRefOrGetter<string>, ids: MaybeRefOrGetter<string[]>) {
  const { records } = useCachedList<any>(shopifyOrderSyncHistoryCache);
  const histories = computed(() => toValue(ids).map(orderId => records.value.find(row => row.shopId === toValue(shop) && row.orderId === orderId)));
  const ready = computed(() => histories.value.length > 0 && histories.value.every(row => row?.state === "ready"));
  const error = computed(() => histories.value.some(row => row?.state === "error"));
  const collection = (key: string) => histories.value.flatMap(row => row?.state === "ready" ? row[key] || [] : []);
  return {
    ready, error, histories,
    pending: computed(() => collection("pending").map(row => ({ ...row, pendingKey: `${toValue(shop)}:${row.shipmentId}`, statusDate: toMillis(row.statusDate), orderDate: toMillis(row.orderDate) }))),
    queued: computed(() => collection("messages").filter(row => (QUEUED_FULFILLMENT_STATUS_IDS as readonly string[]).includes(row.statusId)).map(row => ({ ...row, failCount: Number(row.failCount || 0), initDate: toMillis(row.initDate), lastAttemptDate: toMillis(row.lastAttemptDate), parsed: parseFulfillmentMessageText(row.messageText) }))),
    synced: computed(() => collection("synced").map(row => ({ ...row, fulfillmentKey: `${toValue(shop)}:${row.fulfillmentId}`, processedDate: toMillis(row.processedDate), lastUpdatedStamp: toMillis(row.lastUpdatedStamp), orderDate: toMillis(row.orderDate) }))),
  };
}
