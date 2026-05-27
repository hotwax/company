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
          <ion-skeleton-text 
            v-if="isSyncSummaryLoading" 
            animated 
            class="product-sync-skeleton"
          />
          <ion-card
            v-else-if="shouldShowProductSyncWidget"
            class="widget product-sync"
            role="button"
            button
            tabindex="0"
            @pointerup.capture="openProductSyncEntry()"
            @keydown.enter="openProductSyncEntry()"
            @keydown.space.prevent="openProductSyncEntry()"
          >
            <div>
            <ion-card-header>
              <ion-card-title @click.capture="openProductSyncEntry()">{{ translate("Product sync") }}</ion-card-title>
              <ion-card-subtitle @click.capture="openProductSyncEntry()">{{ productSyncCardSubtitle }}</ion-card-subtitle>
            </ion-card-header>
            <div class="product-sync-activity-graph">
              <div class="product-sync-activity-canvas" @click.capture="openProductSyncEntry()">
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
            <div class="history" @click.capture="openProductSyncEntry()">
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
            <div class="current" v-if="currentSyncRun && currentSyncRun.systemMessageId" @click.capture="openProductSyncEntry()">
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
            </div>
          </ion-card>
          <section>
            <ion-item
              v-if="!isSyncSummaryLoading && productSyncMigrationNotice"
              :data-sync-state="productSyncMigrationNotice.state"
              detail
              class="item-box"
              lines="none"
              button
              @click="openProductSyncMigrationNotice()"
            >
              <ion-label>
                {{ productSyncMigrationNotice.label }}
                <p>{{ productSyncMigrationNotice.detail }}</p>
              </ion-label>
              <ion-badge slot="end" :color="productSyncMigrationNotice.color">{{ productSyncMigrationNotice.badge }}</ion-badge>
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

        <div class="ion-margin-top">
          <h1>{{ translate("Debug") }}</h1>
          <section>
            <ion-item class="item-box" lines="none">
              <ion-label>
                {{ translate("Connection detail state") }}
                <p>{{ translate("Choose a simulated product sync state for this page while developing.") }}</p>
              </ion-label>
              <ion-select slot="end" interface="popover" v-model="debugPageState">
                <ion-select-option value="live">{{ translate("Live data") }}</ion-select-option>
                <ion-select-option value="setup-required">{{ translate("First time setup") }}</ion-select-option>
                <ion-select-option value="incompatible">{{ translate("Upgrade required") }}</ion-select-option>
                <ion-select-option value="upgrade-ready">{{ translate("Upgrade to new sync") }}</ion-select-option>
                <ion-select-option value="teardown-needed">{{ translate("Disable old sync") }}</ion-select-option>
                <ion-select-option value="upgraded">{{ translate("Already upgraded") }}</ion-select-option>
              </ion-select>
            </ion-item>
          </section>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>


<script setup lang="ts">
import { IonBackButton, IonBadge, IonCard, IonCardHeader, IonCardSubtitle, IonCardTitle, IonContent, IonHeader, IonItem, IonLabel, IonList, IonPage, IonSelect, IonSelectOption, IonSkeletonText, IonTitle, IonToolbar, modalController, onIonViewWillEnter } from "@ionic/vue";
import { translate } from "@/i18n";
import { formatDateTime, parseDateTimeValue } from "@/utils";
import { DateTime } from "luxon";
import { computed, defineProps, ref } from "vue";
import { useStore } from "vuex";
import { useRouter } from "vue-router";
import ShopifyProductStoreModal from "@/components/ShopifyProductStoreModal.vue";
import { ShopifyProductSyncService } from "@/services/ShopifyProductSyncService";
import { ShopifyProductSyncMigrationService } from "@/services/ShopifyProductSyncMigrationService";
import { useShopifyProductSyncRun } from "@/composables/useShopifyProductSyncRun";
import logger from "@/logger";

const props = defineProps(['id']);
const store = useStore();
const router = useRouter();
const isLoading = ref(true);
const isSyncSummaryLoading = ref(true);
const PRODUCT_SYNC_ACTIVITY_HOUR_COUNT = 24;
const PRODUCT_SYNC_ACTIVITY_GRAPH_WIDTH = 320;
const PRODUCT_SYNC_ACTIVITY_GRAPH_HEIGHT = 96;
const PRODUCT_SYNC_ACTIVITY_GRAPH_PADDING_X = 12;
const PRODUCT_SYNC_ACTIVITY_GRAPH_PADDING_Y = 12;
type DebugPageState = "live" | "setup-required" | "incompatible" | "upgrade-ready" | "teardown-needed" | "upgraded";
const { currentSyncRun, fetchSyncRun } = useShopifyProductSyncRun();
const debugPageState = ref<DebugPageState>("live");
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
const hasProductSyncSummaryError = ref(false);
const productSyncMigrationEligibility = ref({
  componentRelease: "",
  minimumComponentRelease: "",
  isEligible: false
});
const shopifyAccessState = ref({
  systemMessageRemoteId: "",
  accessScopeEnumId: "",
  hasWriteAccess: false,
  status: "unavailable",
  label: "Unavailable"
});
const legacyProductSyncState = ref({
  legacySystemMessageTypes: [] as any[],
  legacyServiceJobs: [] as any[],
  legacySystemMessages: [] as any[]
});

const shop = computed(() => store.getters["shopify/getShopById"](props.id) || {});
const effectiveProductSyncMigrationEligibility = computed(() => {
  if (debugPageState.value === "incompatible") {
    return {
      ...productSyncMigrationEligibility.value,
      isEligible: false
    };
  }

  if (debugPageState.value !== "live") {
    return {
      ...productSyncMigrationEligibility.value,
      isEligible: true
    };
  }

  return productSyncMigrationEligibility.value;
});
const hasCurrentProductSyncMessages = computed(() => {
  if (debugPageState.value === "setup-required" || debugPageState.value === "upgrade-ready" || debugPageState.value === "incompatible") return false;
  if (debugPageState.value === "teardown-needed" || debugPageState.value === "upgraded") return true;
  return !!productSyncSummary.value.syncRunState?.latestSystemMessage || !!productSyncSummary.value.syncRunState?.systemMessages?.length;
});
const hasShopifyWriteAccess = computed(() => {
  if (debugPageState.value === "setup-required" || debugPageState.value === "upgrade-ready" || debugPageState.value === "teardown-needed" || debugPageState.value === "upgraded") return true;
  return !!shopifyAccessState.value.hasWriteAccess;
});
const shouldShowProductSyncWidget = computed(() => {
  return hasCurrentProductSyncMessages.value;
});
const hasActiveLegacyProductSync = computed(() => {
  if (debugPageState.value === "setup-required") return false;
  if (debugPageState.value === "upgrade-ready" || debugPageState.value === "teardown-needed") return true;
  if (debugPageState.value === "upgraded") return false;
  return [
    ...legacyProductSyncState.value.legacySystemMessageTypes,
    ...legacyProductSyncState.value.legacyServiceJobs,
    ...legacyProductSyncState.value.legacySystemMessages
  ].some((item: any) => item?.status === "active");
});

const productSyncMigrationNoticeAction = computed(() => {
  if (productSyncMigrationNotice.value?.action === "setup") {
    return "setup";
  }

  return "upgrade-assistant";
});
const productSyncMigrationNotice = computed(() => {
  if (!effectiveProductSyncMigrationEligibility.value.isEligible) {
    const currentRelease = effectiveProductSyncMigrationEligibility.value.componentRelease;
    const minimumRelease = effectiveProductSyncMigrationEligibility.value.minimumComponentRelease || translate("the required release");

    return {
      state: "upgrade-required",
      label: translate("Upgrade required for new product sync"),
      detail: currentRelease
        ? translate("Current backend release: {currentRelease}. Upgrade this instance to {minimumRelease} or newer before moving to the new product sync.", {
          currentRelease,
          minimumRelease
        })
        : translate("Upgrade this instance to {minimumRelease} or newer before moving to the new product sync.", {
          minimumRelease
        }),
      badge: translate("Upgrade required"),
      color: "warning",
      action: "upgrade-assistant"
    };
  }

  if (!hasCurrentProductSyncMessages.value && shopifyAccessState.value.status === "update-required") {
    return {
      state: "access-scope-update-required",
      label: translate("Update Shopify access scope"),
      detail: translate("This Shopify connection still uses SHOP_RW_ACCESS. Update the remote configuration to SHOP_READ_WRITE_ACCESS before starting the new product sync."),
      badge: translate("Update required"),
      color: "warning",
      action: "setup"
    };
  }

  if (!hasCurrentProductSyncMessages.value && !hasShopifyWriteAccess.value) {
    return {
      state: "write-access-required",
      label: translate("Shopify write access required"),
      detail: translate("This Shopify connection is read-only. Reconnect Shopify with write access before starting the new product sync."),
      badge: translate("Read only"),
      color: "warning",
      action: "setup"
    };
  }

  if (!hasActiveLegacyProductSync.value) {
    if (!hasCurrentProductSyncMessages.value) {
      return {
        state: "setup-required",
        label: translate("Setup new product sync"),
        detail: translate("This shop is compatible and has not started product sync yet. Complete the first-time setup to begin syncing products."),
        badge: translate("Setup required"),
        color: "primary",
        action: "setup"
      };
    }

    return null;
  }

  if (!hasCurrentProductSyncMessages.value) {
    return {
      state: "upgrade-ready",
      label: translate("Upgrade to new product sync"),
      detail: translate("This instance is compatible. Move this shop from the old product sync to the new product sync."),
      badge: translate("Ready"),
      color: "success",
      action: "upgrade-assistant"
    };
  }

  return {
    state: "teardown-needed",
    label: translate("Disable old product sync"),
    detail: translate("The new product sync is already in use, but the legacy product sync still has active artifacts that must be disabled."),
    badge: translate("Teardown needed"),
    color: "danger",
    action: "upgrade-assistant"
  };
});
const productSyncCardSubtitle = computed(() => {
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
  if (productSyncSummary.value.syncRunState?.latestConsumedSystemMessage) {
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
const productSyncActivityRuns = computed(() => {
  const windowStart = DateTime.now().minus({ hours: PRODUCT_SYNC_ACTIVITY_HOUR_COUNT }).toMillis();
  const systemMessages = productSyncSummary.value.syncRunState?.systemMessages || [];

  return systemMessages.filter((message: any) => getSystemMessageTime(message) >= windowStart);
});
const productSyncActivityHours = computed(() => {
  const countsByHour = productSyncActivityRuns.value.reduce((counts: Record<string, number>, message: any) => {
    const hourKey = getHourKey(getSystemMessageTimeValue(message));
    if (!hourKey) return counts;
    counts[hourKey] = (counts[hourKey] || 0) + 1;
    return counts;
  }, {});

  const hours = [] as Array<{ key: string; label: string; count: number }>;
  const endHour = DateTime.now().startOf("hour");

  for (let index = PRODUCT_SYNC_ACTIVITY_HOUR_COUNT - 1; index >= 0; index--) {
    const hour = endHour.minus({ hours: index });
    const key = getHourKey(hour);
    hours.push({
      key,
      label: hour.toLocaleString({ month: "short", day: "numeric", hour: "numeric" }),
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
    return `${translate("No sync activity recorded in the last")} ${PRODUCT_SYNC_ACTIVITY_HOUR_COUNT} ${translate("hours")}.`;
  }

  return `${activityGraphTotalCount.value} ${translate("sync runs")} · ${activityGraphActiveHourCount.value} ${translate("active hours")}`;
});
const activityGraphAriaLabel = computed(() => {
  return `${translate("Product sync activity over the last")} ${PRODUCT_SYNC_ACTIVITY_HOUR_COUNT} ${translate("hours")}. ${activityGraphCaption.value}. ${translate("Peak")} ${activityGraphPeakCount.value}/${translate("hour")}.`;
});

onIonViewWillEnter(async () => {
  isLoading.value = true;
  if (!shop.value.shopId) {
    await store.dispatch("shopify/fetchShopifyShops")
  }
  isLoading.value = false;
  await loadProductsInventorySummary();
});

async function loadProductsInventorySummary() {
  hasProductSyncSummaryError.value = false;
  isSyncSummaryLoading.value = true;
  productSyncMigrationEligibility.value = {
    componentRelease: "",
    minimumComponentRelease: "",
    isEligible: false
  };
  shopifyAccessState.value = {
    systemMessageRemoteId: "",
    accessScopeEnumId: "",
    hasWriteAccess: false,
    status: "unavailable",
    label: "Unavailable"
  };
  legacyProductSyncState.value = {
    legacySystemMessageTypes: [],
    legacyServiceJobs: [],
    legacySystemMessages: []
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
  currentSyncRun.value = {} as any;

  if (!props.id) {
    isSyncSummaryLoading.value = false;
    return;
  }

  const [eligibilityResult, accessStateResult, legacyTeardownStateResult, systemMessageRemoteIdResult] = await Promise.allSettled([
    ShopifyProductSyncMigrationService.fetchEligibility(),
    ShopifyProductSyncService.fetchShopifyAccessState({ shopId: props.id, shop: shop.value }),
    ShopifyProductSyncMigrationService.fetchLegacyTeardownState({ shopId: props.id, shop: shop.value }),
    ShopifyProductSyncService.fetchShopSystemMessageRemoteId({ shopId: props.id, shop: shop.value })
  ]);

  if (eligibilityResult.status === "fulfilled") {
    productSyncMigrationEligibility.value = eligibilityResult.value;
  } else {
    logger.warn("Failed to load product sync migration eligibility", eligibilityResult.reason);
  }

  if (accessStateResult.status === "fulfilled") {
    shopifyAccessState.value = accessStateResult.value;
  } else {
    logger.warn("Failed to resolve Shopify access scope", accessStateResult.reason);
  }

  if (legacyTeardownStateResult.status === "fulfilled") {
    legacyProductSyncState.value = {
      legacySystemMessageTypes: legacyTeardownStateResult.value.legacySystemMessageTypes || [],
      legacyServiceJobs: legacyTeardownStateResult.value.legacyServiceJobs || [],
      legacySystemMessages: legacyTeardownStateResult.value.legacySystemMessages || []
    };
  } else {
    logger.warn("Failed to inspect legacy product sync state", legacyTeardownStateResult.reason);
  }

  let systemMessageRemoteId = null;
  if (systemMessageRemoteIdResult.status === "fulfilled") {
    systemMessageRemoteId = systemMessageRemoteIdResult.value;
  }

  try {
    productSyncSummary.value = await ShopifyProductSyncService.fetchDashboardSummary({
      shopId: props.id,
      systemMessageRemoteId,
      shop: shop.value
    });

    productSyncRecordsProcessed.value = Number(productSyncSummary.value.syncRunState?.latestConsumedSystemMessage?.totalRecordCount || 0);
    productSyncUnsyncedCount.value = Number(productSyncSummary.value.unsyncedUpdates?.count || 0);

    await loadTrackProgressDetails();
  } catch (error) {
    logger.error(error);
    hasProductSyncSummaryError.value = true;
  }
  
  isSyncSummaryLoading.value = false;
}

async function loadTrackProgressDetails() {
  try {
    const trackProgressMessage = productSyncSummary.value.syncRunState.latestSystemMessage;
    if (trackProgressMessage?.systemMessageId) {
      await fetchSyncRun(trackProgressMessage.systemMessageId, trackProgressMessage);
    }
  } catch (error) {
    logger.warn("Failed to load track progress details in background", error);
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
  if (productSyncMigrationNotice.value?.action === "upgrade-assistant") {
    router.push(`/shopify-connection-details/${props.id}/product-sync/upgrade-assistant`);
  } else {
    router.push(`/shopify-connection-details/${props.id}/product-sync`);
  }
}

function openProductSyncMigrationNotice() {
  if (productSyncMigrationNoticeAction.value === "setup") {
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

// Moved formatDateTime to @/utils

function getSystemMessageTime(systemMessage: any) {
  return parseDateTimeValue(getSystemMessageTimeValue(systemMessage))?.toMillis() || 0;
}

function getSystemMessageTimeValue(systemMessage: any) {
  return systemMessage?.initDate || systemMessage?.lastUpdatedStamp || systemMessage?.processedDate || "";
}

function getHourKey(value: any) {
  const dt = parseDateTimeValue(value);
  return dt?.toFormat("yyyy-MM-dd'T'HH") || "";
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

ion-card.widget {
  border-radius: 16px;
  margin-block: var(--spacer-lg);
  margin-inline: 0;
  will-change: box-shadow, height;
  transition: box-shadow 0.7s ease;
}

ion-card.widget:hover {
  box-shadow: 3px 8px 18px -2px rgba(0,0,0, .2), -2px -2px 13px -6px rgba(0,0,0, .2);
}

.widget.product-sync>div{
  display: grid;
  grid-template-columns: 1fr 1fr;
}

.widget ion-card-header {
  grid-column: 1;
  grid-row: 1;
}

.product-sync-grid .history {
  grid-column: 1;
}

.product-sync-grid .current {
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

@keyframes drawLine {
  from { stroke-dashoffset: 1000; }
  to { stroke-dashoffset: 0; }
}

@keyframes fadeArea {
  from { opacity: 0; }
  to { opacity: 1; }
}

.product-sync-activity-svg polyline {
  stroke-dasharray: 1000;
  stroke-dashoffset: 1000;
  animation: drawLine 2s ease-out forwards;
}

.product-sync-activity-svg path:nth-of-type(2) {
  opacity: 0;
  animation: fadeArea 1s ease-out 0.3s forwards;
}

.product-sync-activity-svg circle {
  opacity: 0;
  animation: fadeArea 0.5s ease-out 0.8s forwards;
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

ion-item[data-sync-state="upgrade-required"]::part(native) {
  border-color: var(--ion-color-warning);
}

ion-item[data-sync-state="setup-required"]::part(native) {
  border-color: var(--ion-color-primary);
}

ion-item[data-sync-state="upgrade-ready"]::part(native) {
  border-color: var(--ion-color-success);
}

ion-item[data-sync-state="teardown-needed"]::part(native) {
  border-color: var(--ion-color-danger);
}

.product-sync-skeleton {
  height: 180px;
  width: 100%;
  border-radius: 16px;
  margin-block: var(--spacer-lg);
}

@media screen and (min-width: 700px) {
  ion-content {
    --padding-start: var(--spacer-lg);
    --padding-end: var(--spacer-lg);
  }
}
</style>
