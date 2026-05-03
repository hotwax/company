<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-back-button slot="start" default-href="/shopify"/>
        <ion-title v-if="isLoading"><ion-skeleton-text animated style="width: 100px" /></ion-title>
        <ion-title v-else>{{ shop.name || id }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding-horizontal">
      <div v-if="isLoading">
        <section class="ion-margin-top" v-for="i in 3" :key="i">
          <ion-skeleton-text animated style="width: 150px; height: 32px;" class="ion-margin-bottom" />
          <div class="grid-container">
            <ion-item v-for="j in (i === 1 ? 2 : (i === 2 ? 2 : 4))" :key="j" class="item-box" lines="none">
              <ion-label>
                <ion-skeleton-text animated style="width: 70%" />
                <p><ion-skeleton-text animated style="width: 50%" /></p>
              </ion-label>
            </ion-item>
          </div>
        </section>
      </div>

      <div v-else>
        <div class="ion-margin-top">
          <h1>{{ translate("Configuration") }}</h1>
          <section>
            <ion-item detail class="item-box" lines="none" button @click="openShopDetails()">
              <ion-label>
                {{ shop.name || id }}
                <p>{{ translate("Instance details and timezone") }}</p>
              </ion-label>
            </ion-item>
            <ion-item detail class="item-box" lines="none" button @click="openProductStoreModal()">
              <ion-label>
                {{ shop.productStoreId || translate("Not linked") }}
                <p>{{ translate("Product Store") }}</p>
              </ion-label>
            </ion-item>
          </section>
        </div>

        <div class="ion-margin-top">
          <h1>{{ translate("Products and Inventory") }}</h1>
          <ion-card class="widget product-sync" button @click="openProductSyncEntry()">
            <ion-card-header>
              <ion-card-title>{{ translate("Product sync") }}</ion-card-title>
              <ion-card-subtitle>{{ productSyncCardSubtitle }}</ion-card-subtitle>
            </ion-card-header>
            <div class="product-sync-activity-graph">
              <div class="product-sync-activity-canvas">
                <svg
                  class="product-sync-activity-svg"
                  viewBox="0 0 320 96"
                  width="100%"
                  preserveAspectRatio="xMidYMid meet"
                  role="img"
                  :aria-label="activityGraphAriaLabel"
                >
                  <title>{{ activityGraphAriaLabel }}</title>
                  <path
                    d="M 12 84 H 308"
                    fill="none"
                    stroke="#d7dce4"
                    stroke-width="1"
                  />
                  <path
                    :d="activityGraphAreaPath"
                    fill="rgba(45, 211, 111, 0.14)"
                  />
                  <polyline
                    :points="activityGraphPolylinePoints"
                    fill="none"
                    stroke="#2dd36f"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                  <circle
                    v-if="activityGraphLatestPoint"
                    :cx="activityGraphLatestPoint.x"
                    :cy="activityGraphLatestPoint.y"
                    r="3"
                    fill="#2dd36f"
                  />
                </svg>
              </div>
            </div>
            <div class="history">
              <ion-list lines="full">
                <ion-item lines="full">
                  <ion-label>
                    {{ translate("Records processed in last sync") }}
                    <p>{{ recordsProcessedDetail }}</p>
                  </ion-label>
                  <ion-label slot="end">{{ recordsProcessedLabel }}</ion-label>
                </ion-item>
                <ion-item lines="full">
                  <ion-label>
                    {{ translate("Unsynced events") }}
                    <p>{{ unsyncedEventsDetail }}</p>
                  </ion-label>
                  <ion-badge slot="end" color="medium">{{ unsyncedEventsLabel }}</ion-badge>
                </ion-item>
              </ion-list>
            </div>
            <div class="current" v-if="currentSyncRun && currentSyncRun.systemMessageId">
             <ion-list>
              <ion-item lines="full">
                <ion-label>
                  {{ translate("System message") }}
                  <p>{{ systemMessageDetail }}</p>
                </ion-label>
                <ion-badge slot="end" :color="systemMessageStatusColor">{{ systemMessageStatusLabel }}</ion-badge>
              </ion-item>
              <ion-item lines="full">
                <ion-label>
                  {{ translate("Shopify bulk operation") }}
                  <p>{{ bulkOperationDetail }}</p>
                </ion-label>
                <ion-badge slot="end" :color="bulkOperationStatusColor">{{ bulkOperationStatusLabel }}</ion-badge>
              </ion-item>
              <ion-item lines="none">
                <ion-label>
                  {{ translate("HotWax bulk import") }}
                  <p>{{ hotwaxImportDetail }}</p>
                </ion-label>
                <ion-badge slot="end" :color="hotwaxImportStatusColor">{{ hotwaxImportStatusLabel }}</ion-badge>
              </ion-item>
             </ion-list>
            </div>
          </ion-card>
          <section>
            <ion-item detail class="item-box" lines="none" button @click="openProductSyncEntry()">
              <ion-label>{{ productSyncEntryLabel }}</ion-label>
            </ion-item>
            <ion-item detail class="item-box" lines="none" button @click="openShopifyLocations()">
              <ion-label>{{ translate("Inventory locations") }}</ion-label>
            </ion-item>
            <ion-item detail class="item-box" lines="none" button @click="openProductTypes()">
              <ion-label>{{ translate("Product types") }}</ion-label>
            </ion-item>

          </section>
        </div>

        <div class="ion-margin-top">
          <h1>{{ translate("Orders and fulfillment") }}</h1>
          <section>
            <ion-item detail class="item-box" lines="none" button @click="openShipmentMethods()">
              <ion-label>{{ translate("Shipping methods") }}</ion-label>
            </ion-item>
            <ion-item detail class="item-box" lines="none" button @click="openPaymentMethods()">
              <ion-label>{{ translate("Payment methods") }}</ion-label>
            </ion-item>
            <ion-item detail class="item-box" lines="none" button @click="openSalesChannels()">
              <ion-label>{{ translate("Sales channels") }}</ion-label>
            </ion-item>
          </section>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>


<script setup lang="ts">
import { IonBackButton, IonBadge, IonCard, IonCardHeader, IonCardSubtitle, IonCardTitle, IonContent, IonHeader, IonItem, IonLabel, IonList, IonPage, IonSkeletonText, IonTitle, IonToolbar, modalController, onIonViewWillEnter } from "@ionic/vue";
import api from "@/api";
import { translate } from "@/i18n";
import { computed, defineProps, ref } from "vue";
import { useStore } from "vuex";
import { useRouter } from "vue-router";
import ShopifyProductStoreModal from "@/components/ShopifyProductStoreModal.vue";
import { ShopifyProductSyncService } from "@/services/ShopifyProductSyncService";
import { ShopifyProductSyncMigrationService } from "@/services/ShopifyProductSyncMigrationService";
import { useDataManagerLog } from "@/composables/useDataManagerLog";
import { useShopifyProductSyncRun } from "@/composables/useShopifyProductSyncRun";
import logger from "@/logger";

const props = defineProps(['id']);
const store = useStore();
const router = useRouter();
const isLoading = ref(true);
const PRODUCT_SYNC_ACTIVITY_HOUR_COUNT = 24;
const PRODUCT_SYNC_ACTIVITY_GRAPH_WIDTH = 320;
const PRODUCT_SYNC_ACTIVITY_GRAPH_HEIGHT = 96;
const PRODUCT_SYNC_ACTIVITY_GRAPH_PADDING_X = 12;
const PRODUCT_SYNC_ACTIVITY_GRAPH_PADDING_Y = 12;
const { fetchMdmLogBySystemMessageId } = useDataManagerLog();
const { currentSyncRun, fetchSyncRun } = useShopifyProductSyncRun();
const productSyncSummary = ref<any>({
  syncRunState: {
    lastSyncedAt: "",
    latestSystemMessage: null,
    latestConsumedSystemMessage: null
  },
  pendingRequests: {
    count: 0
  },
  runningOperation: null
});
const productSyncRecordsProcessed = ref(0);
const productSyncUnsyncedCount = ref(0);
const productSyncActivityHistory = ref<any[]>([]);
const hasProductSyncSummaryError = ref(false);
const productSyncMigrationEligibility = ref({
  componentRelease: "",
  minimumComponentRelease: "",
  isEligible: false
});

const shop = computed(() => store.getters["shopify/getShopById"](props.id) || {});
const hasCurrentProductSyncMessages = computed(() => {
  return !!productSyncSummary.value.syncRunState?.latestSystemMessage || !!productSyncSummary.value.syncRunState?.systemMessages?.length;
});
const productSyncEntryAction = computed(() => {
  return ShopifyProductSyncMigrationService.resolveEntryAction({
    hasNewProductSyncMessages: hasCurrentProductSyncMessages.value,
    isEligible: productSyncMigrationEligibility.value.isEligible
  });
});
const productSyncEntryLabel = computed(() => {
  if (productSyncEntryAction.value === "current") {
    return translate("Download products");
  }

  if (productSyncEntryAction.value === "setup") {
    return translate("Setup new product sync");
  }

  return translate("Request upgrade to new product sync");
});
const productSyncCardSubtitle = computed(() => {
  if (!hasCurrentProductSyncMessages.value) {
    if (productSyncEntryAction.value === "setup") {
      return translate("This shop is eligible to move to the new product sync.");
    }

    if (productSyncEntryAction.value === "request-upgrade") {
      return translate("A backend upgrade is required before the new product sync can be set up.");
    }
  }

  if (hasProductSyncSummaryError.value) {
    return translate("Open product sync to inspect the latest sync status.");
  }

  if (productSyncSummary.value.syncRunState.lastSyncedAt) {
    return `${translate("Last synced on")} ${formatDateTime(productSyncSummary.value.syncRunState.lastSyncedAt)}`;
  }

  return translate("No completed sync recorded yet.");
});
const recordsProcessedLabel = computed(() => {
  return String(productSyncRecordsProcessed.value || 0);
});
const recordsProcessedDetail = computed(() => {
  if (currentSyncRun.value?.mdmLog?.id) {
    return translate("From the most recent completed import run.");
  }

  return translate("No completed import records are available yet.");
});
const unsyncedEventsLabel = computed(() => {
  return productSyncUnsyncedCount.value > 100 ? "100+" : String(productSyncUnsyncedCount.value || 0);
});
const unsyncedEventsDetail = computed(() => {
  if (!productSyncSummary.value.syncRunState.lastSyncedAt) {
    return translate("Counts will appear after the first completed sync.");
  }

  return translate("Shopify product updates waiting to be imported since the last sync.");
});
const systemMessageStatusLabel = computed(() => {
  return currentSyncRun.value?.systemMessage?.statusLabel || translate("Pending");
});
const systemMessageStatusColor = computed(() => {
  return currentSyncRun.value?.systemMessage?.statusColor || "medium";
});
const systemMessageDetail = computed(() => {
  return currentSyncRun.value?.systemMessageId || translate("No sync request has been produced yet.");
});
const bulkOperationStatusLabel = computed(() => {
  return currentSyncRun.value?.bulkOperation?.statusLabel || translate("Pending");
});
const bulkOperationStatusColor = computed(() => {
  return currentSyncRun.value?.bulkOperation?.statusColor || "medium";
});
const bulkOperationDetail = computed(() => {
  return currentSyncRun.value?.bulkOperation?.id || translate("Not started");
});
const hotwaxImportStatusLabel = computed(() => {
  return currentSyncRun.value?.mdmLog?.statusLabel || translate("Pending");
});
const hotwaxImportStatusColor = computed(() => {
  return currentSyncRun.value?.mdmLog?.statusColor || "medium";
});
const hotwaxImportDetail = computed(() => {
  if (currentSyncRun.value?.mdmLog?.id) {
    return currentSyncRun.value.mdmLog.id;
  }

  return translate("Not started");
});
const productSyncActivityHours = computed(() => {
  const countsByHour = productSyncActivityHistory.value.reduce((counts: Record<string, number>, history: any) => {
    const hourKey = getHourKey(history?.lastUpdatedStamp);
    if (!hourKey) return counts;
    counts[hourKey] = (counts[hourKey] || 0) + 1;
    return counts;
  }, {});

  const hours = [] as Array<{ key: string; label: string; count: number }>;
  const endHour = new Date();
  endHour.setMinutes(0, 0, 0);

  for (let index = PRODUCT_SYNC_ACTIVITY_HOUR_COUNT - 1; index >= 0; index--) {
    const hour = new Date(endHour);
    hour.setHours(endHour.getHours() - index);
    const key = getHourKey(hour);
    hours.push({
      key,
      label: hour.toLocaleString([], { month: "short", day: "numeric", hour: "numeric" }),
      count: countsByHour[key] || 0
    });
  }

  return hours;
});
const activityGraphPeakCount = computed(() => {
  return productSyncActivityHours.value.reduce((peak, hour) => Math.max(peak, hour.count), 0);
});
const activityGraphTotalCount = computed(() => {
  return productSyncActivityHours.value.reduce((total, hour) => total + hour.count, 0);
});
const activityGraphActiveHourCount = computed(() => {
  return productSyncActivityHours.value.filter((hour) => hour.count > 0).length;
});
const activityGraphPoints = computed(() => {
  const usableWidth = PRODUCT_SYNC_ACTIVITY_GRAPH_WIDTH - (PRODUCT_SYNC_ACTIVITY_GRAPH_PADDING_X * 2);
  const usableHeight = PRODUCT_SYNC_ACTIVITY_GRAPH_HEIGHT - (PRODUCT_SYNC_ACTIVITY_GRAPH_PADDING_Y * 2);
  const maxCount = activityGraphPeakCount.value;

  return productSyncActivityHours.value.map((hour, index, hours) => {
    const x = PRODUCT_SYNC_ACTIVITY_GRAPH_PADDING_X + (hours.length === 1 ? 0 : (usableWidth * index) / (hours.length - 1));
    const y = maxCount
      ? PRODUCT_SYNC_ACTIVITY_GRAPH_PADDING_Y + ((maxCount - hour.count) / maxCount) * usableHeight
      : PRODUCT_SYNC_ACTIVITY_GRAPH_HEIGHT - PRODUCT_SYNC_ACTIVITY_GRAPH_PADDING_Y;

    return {
      ...hour,
      x: Number(x.toFixed(2)),
      y: Number(y.toFixed(2))
    };
  });
});
const activityGraphPolylinePoints = computed(() => {
  return activityGraphPoints.value.map((point) => `${point.x},${point.y}`).join(" ");
});
const activityGraphAreaPath = computed(() => {
  const points = activityGraphPoints.value;
  if (!points.length) return "";

  const baselineY = PRODUCT_SYNC_ACTIVITY_GRAPH_HEIGHT - PRODUCT_SYNC_ACTIVITY_GRAPH_PADDING_Y;
  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  return `${linePath} L ${points[points.length - 1].x} ${baselineY} L ${points[0].x} ${baselineY} Z`;
});
const activityGraphLatestPoint = computed(() => {
  return activityGraphPoints.value[activityGraphPoints.value.length - 1] || null;
});
const activityGraphCaption = computed(() => {
  if (!activityGraphTotalCount.value) {
    return `${translate("No product update activity recorded in the last")} ${PRODUCT_SYNC_ACTIVITY_HOUR_COUNT} ${translate("hours")}.`;
  }

  return `${activityGraphTotalCount.value} ${translate("updates")} · ${activityGraphActiveHourCount.value} ${translate("active hours")}`;
});
const activityGraphAriaLabel = computed(() => {
  return `${translate("Product update activity over the last")} ${PRODUCT_SYNC_ACTIVITY_HOUR_COUNT} ${translate("hours")}. ${activityGraphCaption.value}. ${translate("Peak")} ${activityGraphPeakCount.value}/${translate("hour")}.`;
});

onIonViewWillEnter(async () => {
  isLoading.value = true;
  if (!shop.value.shopId) {
    await store.dispatch("shopify/fetchShopifyShops")
  }
  await loadProductsInventorySummary();
  isLoading.value = false;
});

async function loadProductsInventorySummary() {
  hasProductSyncSummaryError.value = false;
  productSyncMigrationEligibility.value = {
    componentRelease: "",
    minimumComponentRelease: "",
    isEligible: false
  };
  productSyncSummary.value = {
    syncRunState: {
      lastSyncedAt: "",
      latestSystemMessage: null,
      latestConsumedSystemMessage: null
    },
    pendingRequests: {
      count: 0
    },
    runningOperation: null
  };
  productSyncRecordsProcessed.value = 0;
  productSyncUnsyncedCount.value = 0;
  productSyncActivityHistory.value = [];
  currentSyncRun.value = {} as any;

  if (!props.id) return;

  try {
    productSyncMigrationEligibility.value = await ShopifyProductSyncMigrationService.fetchEligibility();
  } catch (error) {
    logger.warn("Failed to load product sync migration eligibility", error);
  }

  try {
    const systemMessageRemoteId = await ShopifyProductSyncService.fetchShopSystemMessageRemoteId({
      shopId: props.id,
      shop: shop.value
    });

    productSyncSummary.value = await ShopifyProductSyncService.fetchDashboardSummary({
      shopId: props.id,
      systemMessageRemoteId,
      shop: shop.value
    });

    await loadProductSyncActivityHistory();

    const trackProgressMessage = await selectTrackProgressSystemMessage(productSyncSummary.value.syncRunState?.systemMessages || []);
    if (trackProgressMessage?.systemMessageId) {
      await fetchSyncRun(trackProgressMessage.systemMessageId, trackProgressMessage);
    }

    productSyncRecordsProcessed.value = Number(currentSyncRun.value?.mdmLog?.totalRecordCount || 0);
    productSyncUnsyncedCount.value = Number(productSyncSummary.value.unsyncedUpdates?.count || 0);
  } catch (error) {
    logger.error(error);
    hasProductSyncSummaryError.value = true;
  }
}

async function loadProductSyncActivityHistory() {
  try {
    const pageSize = 1000;
    const hourWindowStart = new Date(Date.now() - (PRODUCT_SYNC_ACTIVITY_HOUR_COUNT * 60 * 60 * 1000));
    const histories = [] as any[];
    let pageIndex = 0;
    let keepLoading = true;

    while (keepLoading) {
      const response = await api({
        url: "oms/productUpdateHistory",
        method: "GET",
        params: {
          shopId: props.id,
          pageSize,
          pageIndex,
          orderByField: "-lastUpdatedStamp"
        }
      }) as any;

      const page = getProductUpdateHistoryPayload(response?.data);
      if (!page.length) {
        break;
      }

      const inWindowRecords = page.filter((history: any) => {
        const timestamp = new Date(history?.lastUpdatedStamp || 0).getTime();
        return timestamp >= hourWindowStart.getTime();
      });
      histories.push(...inWindowRecords);

      const oldestTimestamp = new Date(page[page.length - 1]?.lastUpdatedStamp || 0).getTime();
      if (page.length < pageSize || !oldestTimestamp || oldestTimestamp < hourWindowStart.getTime()) {
        keepLoading = false;
      } else {
        pageIndex += 1;
      }
    }

    productSyncActivityHistory.value = histories;
  } catch (error) {
    logger.error("Failed to load product sync activity history", error);
    productSyncActivityHistory.value = [];
  }
}

async function openProductStoreModal() {
  const modal = await modalController.create({
    component: ShopifyProductStoreModal,
    componentProps: { shop: shop.value }
  });
  modal.onDidDismiss().then(async () => {
    await store.dispatch("shopify/fetchShopifyShops");
  });
  modal.present();
}

function openProductSyncEntry() {
  if (productSyncEntryAction.value === "current") {
    router.push(`/shopify-connection-details/${props.id}/product-sync`);
    return;
  }

  router.push(`/shopify-connection-details/${props.id}/product-sync/upgrade-assistant`);
}

function openShopDetails() {
  router.push(`/shopify-connection-details/${props.id}/instance-details`);
}

function openShopifyLocations() {
  router.push(`/shopify-connection-details/${props.id}/locations`);
}

function openShipmentMethods() {
  router.push(`/shopify-connection-details/${props.id}/shipment-methods`);
}

function openPaymentMethods() {
  router.push(`/shopify-connection-details/${props.id}/payment-methods`);
}

function openSalesChannels() {
  router.push(`/shopify-connection-details/${props.id}/sales-channels`);
}

function openProductTypes() {
  router.push(`/shopify-connection-details/${props.id}/product-types`);
}

function formatDateTime(value: string) {
  return value ? new Date(value).toLocaleString() : translate("Unavailable");
}

async function selectTrackProgressSystemMessage(systemMessages: any[]) {
  if (!systemMessages.length) return null;

  const consumedMessages = systemMessages.filter((message) => hasSystemMessageStatus(message, ["smsgconsumed", "consumed", "smsgconfirmed", "confirmed"]));
  const oldestConsumedMessages = sortSystemMessagesOldestFirst(consumedMessages);

  for (const message of oldestConsumedMessages) {
    const mdmLog = await fetchMdmLogBySystemMessageId(message.systemMessageId);
    if (mdmLog?.logId && !isTerminalMdmLogStatus(mdmLog.statusId)) {
      return message;
    }
  }

  return getOldestSystemMessageByStatus(systemMessages, ["smsgreceived", "received"]) ||
    getOldestSystemMessageByStatus(systemMessages, ["smsgsent", "sent"]) ||
    getOldestSystemMessageByStatus(systemMessages, ["smsgproduced", "produced"]) ||
    sortSystemMessagesNewestFirst(consumedMessages)[0] ||
    null;
}

function getOldestSystemMessageByStatus(systemMessages: any[], statuses: string[]) {
  return sortSystemMessagesOldestFirst(systemMessages.filter((message) => hasSystemMessageStatus(message, statuses)))[0];
}

function hasSystemMessageStatus(systemMessage: any, statuses: string[]) {
  return statuses.includes(normalizeStatusValue(systemMessage?.statusId));
}

function isTerminalMdmLogStatus(statusId: string) {
  return ["dmlsuccess", "dmlerror", "dmlcancelled", "dmlcanceled"].includes(normalizeStatusValue(statusId));
}

function sortSystemMessagesOldestFirst(systemMessages: any[]) {
  return [...systemMessages].sort((firstMessage, secondMessage) => getSystemMessageTime(firstMessage) - getSystemMessageTime(secondMessage));
}

function sortSystemMessagesNewestFirst(systemMessages: any[]) {
  return [...systemMessages].sort((firstMessage, secondMessage) => getSystemMessageTime(secondMessage) - getSystemMessageTime(firstMessage));
}

function getSystemMessageTime(systemMessage: any) {
  const value = systemMessage?.initDate || systemMessage?.lastUpdatedStamp || systemMessage?.processedDate;
  return value ? new Date(value).getTime() : 0;
}

function normalizeStatusValue(statusId: string) {
  return String(statusId || "").toLowerCase().replace(/[_\-\s]/g, "");
}

function getHourKey(value: string | Date) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hour = `${date.getHours()}`.padStart(2, "0");
  return `${year}-${month}-${day}T${hour}`;
}

function getProductUpdateHistoryPayload(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.productUpdateHistory)) return data.productUpdateHistory;
  if (Array.isArray(data?.productUpdateHistories)) return data.productUpdateHistories;
  return [];
}
</script>

<style scoped>
.item-box::part(native) {
  --border-radius: var(--spacer-xs);
  border: var(--border-medium);
}

section {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: var(--spacer-sm);
}

.widget.product-sync::part(native) {
  display: grid;
  grid-template-columns: 1fr 1fr;
}

.widget ion-card-header {
  grid-column: 1;
  grid-row: 1;
}

.widget .history {
  grid-column: 1;
}

.widget .current {
  grid-column: 2;
}

.product-sync-activity-graph {
  grid-column: 2;
  grid-row: 1;
  align-self: stretch;
  min-height: 0;
  overflow: hidden;
  position: relative;
}

.product-sync-activity-canvas {
  height: 100%;
  min-height: 0;
  position: relative;
}

.product-sync-activity-svg {
  display: block;
  position: absolute;
  inset: 0;
  justify-self: end;
  width: fit-content;
  height: 100%;
}

@media screen and (min-width: 700px) {
  ion-content {
    --padding-start: var(--spacer-lg);
    --padding-end: var(--spacer-lg);
  }
}
</style>
