<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-back-button slot="start" default-href="/shopify"/>
        <ion-title v-if="isLoading"><ion-skeleton-text animated style="width: 100px" /></ion-title>
        <ion-title v-else>{{ shop.name || id }}</ion-title>
        <ion-buttons slot="end" v-if="!isLoading">
          <ion-button @click="openCloneSettingsModal()">
            <ion-icon slot="start" :icon="copyOutline" />
            {{ translate("Clone settings") }}
          </ion-button>
        </ion-buttons>
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
            <ion-item detail class="item-box" lines="none" button @click="openCredentialsModal()">
              <ion-label>
                {{ translate("API credentials") }}
                <p>{{ translate("Access token and secrets") }}</p>
              </ion-label>
            </ion-item>
            <ion-item detail class="item-box" lines="none" button @click="openAccessScopesModal()">
              <ion-label>
                {{ translate("Access scopes") }}
                <p>{{ translate("Shopify API scopes granted to this shop") }}</p>
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
            <ion-item detail class="item-box" lines="none" button @click="openInventorySync()">
              <ion-label>
                {{ translate("Inventory sync") }}
                <p>{{ translate("Monitor inventory reset jobs, aggregate events, batches, and errors") }}</p>
              </ion-label>
            </ion-item>
            <ion-item detail class="item-box" lines="none" button @click="openTransferSync()">
              <ion-label>
                {{ translate("Transfer sync") }}
                <p>{{ translate("Monitor inventory transfer orders synced to Shopify and resolve blocked syncs") }}</p>
              </ion-label>
            </ion-item>
            <ion-item detail class="item-box" lines="none" button @click="openProductTypes()">
              <ion-label>{{ translate("Product types") }}</ion-label>
            </ion-item>

          </section>
        </div>

        <div class="ion-margin-top">
          <h1>{{ translate("Orders and fulfillment") }}</h1>
          <ion-skeleton-text
            v-if="orderSyncCardSnapshot.loading"
            animated
            class="product-sync-skeleton"
          />
          <ShopifyOrderSyncCard
            v-else
            :snapshot="orderSyncCardSnapshot"
            @open="openOrderSyncEntry()"
          />
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

      <ion-modal :is-open="showProductStore" @didDismiss="onProductStoreDismiss">
        <ion-header>
          <ion-toolbar>
            <ion-buttons slot="start">
              <ion-button @click="closeProductStore()">
                <ion-icon slot="icon-only" :icon="closeOutline" />
              </ion-button>
            </ion-buttons>
            <ion-title>{{ translate("Product Store") }}</ion-title>
          </ion-toolbar>
        </ion-header>

        <ion-content>
          <ion-item class="ion-margin-top">
            <ion-icon slot="start" :icon="informationCircleOutline" />
            <ion-label>
              {{ translate("Link this Shopify connection to a Hotwax Product Store.") }}
            </ion-label>
          </ion-item>

          <ion-item lines="full" class="ion-margin-top">
            <ion-select v-model="selectedProductStoreId" interface="popover" :label="translate('Product Store')" :placeholder="translate('Select')">
              <ion-select-option v-for="store in productStores" :key="store.productStoreId" :value="store.productStoreId">
                {{ store.storeName ? store.storeName : store.productStoreId }}
              </ion-select-option>
            </ion-select>
          </ion-item>

          <ion-button
            class="ion-margin"
            expand="block"
            @click="updateProductStoreMapping"
            :disabled="!selectedProductStoreId || selectedProductStoreId === currentProductStoreId"
          >
            {{ translate("Save Product Store link") }}
          </ion-button>
        </ion-content>
      </ion-modal>

      <ion-modal :is-open="showCredentials" @didDismiss="closeCredentials">
        <ion-header>
          <ion-toolbar>
            <ion-buttons slot="start">
              <ion-button @click="closeCredentials()">
                <ion-icon slot="icon-only" :icon="closeOutline" />
              </ion-button>
            </ion-buttons>
            <ion-title>{{ translate("API credentials") }}</ion-title>
          </ion-toolbar>
        </ion-header>

        <ion-content>
          <ion-item class="ion-margin-top" lines="none">
            <ion-icon slot="start" :icon="storefrontOutline" />
            <ion-label>
              <b>{{ shop.myshopifyDomain || shop.domain }}</b>
              <p>{{ shop.shopId }}</p>
            </ion-label>
          </ion-item>

          <ion-list>
            <ion-item>
              <ion-input
                v-model="form.shopifyShopId"
                :label="translate('Shopify shop ID') + ' *'"
                label-placement="stacked"
                inputmode="numeric"
              />
            </ion-item>
            <ion-item>
              <ion-input
                v-model="form.clientId"
                :label="translate('Client ID') + ' *'"
                label-placement="stacked"
                autocomplete="off"
              />
            </ion-item>
            <ion-item>
              <ion-input
                v-model="form.shopAccessToken"
                :label="translate('Access token') + ' *'"
                label-placement="stacked"
                type="password"
                placeholder="shpat_..."
                autocomplete="off"
              />
            </ion-item>
            <ion-item>
              <ion-input
                v-model="form.clientSecret"
                :label="translate('Client secret') + ' *'"
                label-placement="stacked"
                type="password"
                autocomplete="off"
              />
            </ion-item>
            <ion-item>
              <ion-input
                v-model="form.oldClientSecret"
                :label="translate('Old client secret')"
                label-placement="stacked"
                type="password"
                helper-text="Only required when rotating the client secret"
                autocomplete="off"
              />
            </ion-item>
          </ion-list>

          <ion-button
            class="ion-margin"
            expand="block"
            :disabled="!isFormValid"
            @click="updateCredentials()"
          >
            {{ translate("Rotate credentials") }}
          </ion-button>
        </ion-content>
      </ion-modal>

      <ion-modal :is-open="showAccessScopes" @didDismiss="closeAccessScopes">
        <ion-header>
          <ion-toolbar>
            <ion-buttons slot="start">
              <ion-button @click="closeAccessScopes()">
                <ion-icon slot="icon-only" :icon="closeOutline" />
              </ion-button>
            </ion-buttons>
            <ion-title>{{ translate("Access scopes") }}</ion-title>
          </ion-toolbar>
        </ion-header>

        <ion-content>
          <ion-item class="ion-margin-top" lines="none">
            <ion-icon slot="start" :icon="storefrontOutline" />
            <ion-label>
              {{ shop.myshopifyDomain || shop.domain }}
              <p>{{ shop.shopId }}</p>
            </ion-label>
          </ion-item>

          <ion-list-header>{{ translate("Connection access") }}</ion-list-header>
          <ion-item lines="none">
            <ion-label class="ion-text-wrap">
              <p>{{ translate("Whether this OMS may write back to Shopify. Inventory pushes are refused unless this is read and write.") }}</p>
            </ion-label>
          </ion-item>
          <ion-item>
            <ion-select
              :label="translate('Access')"
              label-placement="stacked"
              interface="popover"
              :value="connectionAccessScopeId"
              :disabled="!accessScopesRemoteId || isSavingAccessScope"
              :placeholder="translate('Not set')"
              @ionChange="onConnectionAccessScopeChange($event.detail.value)"
            >
              <!-- The id is shown, not just the description: SHOP_READ_WRITE_ACCESS and
                   SHOP_RW_ACCESS are both described "Shopify Shop Read and Write Access", and only
                   SHOP_RW_ACCESS is the one services gate on. On description alone the two are
                   indistinguishable and picking the wrong one silently disables every write. -->
              <ion-select-option v-for="option in connectionAccessScopeOptions" :key="option.enumId" :value="option.enumId">
                {{ option.description || option.enumId }} ({{ option.enumId }})
              </ion-select-option>
            </ion-select>
            <ion-spinner v-if="isSavingAccessScope" slot="end" name="crescent" />
          </ion-item>
          <ion-item v-if="!connectionAccessScopeId" lines="none">
            <ion-label class="ion-text-wrap">
              <ion-note color="warning">{{ translate("No access level is set, so this connection cannot write to Shopify.") }}</ion-note>
            </ion-label>
          </ion-item>

          <ion-list-header>{{ translate("Granted OAuth scopes") }}</ion-list-header>
          <ion-item lines="none">
            <ion-label class="ion-text-wrap">
              <p>{{ translate("Shopify OAuth scopes granted to this shop's app. Order sync fails if the query asks for data outside these scopes, so refresh after changing the app's granted scopes in Shopify.") }}</p>
            </ion-label>
          </ion-item>

          <div v-if="scopes.length" class="ion-margin-horizontal">
            <ion-chip v-for="scope in scopes" :key="scope" outline>
              <ion-icon :icon="checkmarkCircleOutline" />
              <ion-label>{{ scope }}</ion-label>
            </ion-chip>
          </div>
          <ion-item v-else lines="none">
            <ion-label class="ion-text-wrap ion-text-center">
              <p>{{ translate("No scopes loaded yet. Refresh to fetch the scopes granted to this shop's Shopify app.") }}</p>
            </ion-label>
          </ion-item>

          <ion-item v-if="lastRefreshedLabel" lines="none">
            <ion-note slot="end">{{ translate("Last refreshed") }}: {{ lastRefreshedLabel }}</ion-note>
          </ion-item>

          <ion-button
            class="ion-margin"
            expand="block"
            :disabled="!accessScopesRemoteId"
            @click="refresh()"
          >
            <ion-icon slot="start" :icon="refreshOutline" />
            {{ translate("Refresh scopes") }}
          </ion-button>
        </ion-content>
      </ion-modal>

      <ion-modal :is-open="showCloneSettings" @didDismiss="onCloneSettingsDismiss">
        <ion-header>
          <ion-toolbar>
            <ion-buttons slot="start">
              <ion-button @click="closeCloneSettings()">
                <ion-icon slot="icon-only" :icon="closeOutline" />
              </ion-button>
            </ion-buttons>
            <ion-title>{{ translate("Clone Settings") }}</ion-title>
          </ion-toolbar>
        </ion-header>

        <ion-content class="ion-padding">
          <main>
            <ion-card class="clone-card ion-no-margin">
              <ion-card-content>
                <ion-list>
                  <!-- Source Shopify Shop Dropdown -->
                  <ion-item>
                    <ion-select interface="popover" :label="translate('Source Shopify Shop')" :placeholder="translate('Select shop')" v-model="sourceShopId">
                      <ion-select-option v-for="sourceShop in sourceShopsList" :key="sourceShop.shopId" :value="sourceShop.shopId">
                        {{ sourceShop.name || sourceShop.shopId }}
                      </ion-select-option>
                    </ion-select>
                  </ion-item>
                </ion-list>
              </ion-card-content>
            </ion-card>

            <ion-list class="categories-list ion-margin-top">
              <ion-list-header>
                <ion-label>{{ translate("Select settings to clone") }}</ion-label>
              </ion-list-header>
              <ion-item v-for="(cat, key) in categories" :key="key">
                <ion-checkbox slot="start" v-model="cat.selected" />
                <ion-label>{{ cat.label }}</ion-label>
              </ion-item>
            </ion-list>

            <ion-card color="warning" class="warning-card" v-if="sourceShopId">
              <ion-card-content class="ion-text-center warning-content">
                <ion-icon :icon="alertCircleOutline" class="warning-icon" />
                <p>{{ translate("Warning: Existing mappings in the target shop will be overwritten.") }}</p>
              </ion-card-content>
            </ion-card>

            <div class="action-container ion-margin-top">
              <ion-button expand="block" :disabled="!sourceShopId || !hasSelectedCategories" @click="executeClone()">
                {{ translate("Clone") }}
              </ion-button>
            </div>
          </main>
        </ion-content>
      </ion-modal>
    </ion-content>
  </ion-page>
</template>


<script setup lang="ts">
import { IonBackButton, IonBadge, IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCheckbox, IonChip, IonContent, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonList, IonListHeader, IonModal, IonNote, IonPage, IonSelect, IonSelectOption, IonSkeletonText, IonSpinner, IonTitle, IonToolbar, onIonViewWillEnter } from "@ionic/vue";
import { alertCircleOutline, checkmarkCircleOutline, closeOutline, copyOutline, informationCircleOutline, refreshOutline, storefrontOutline } from "ionicons/icons";
import { api, commonUtil, emitter, logger, translate } from '@common'
import { formatDateTime, parseDateTimeValue } from '@/utils';
import { DateTime } from "luxon";
import { computed, defineProps, reactive, ref, watch } from "vue";
import router from "@/router";
import ShopifyOrderSyncCard from "@/components/shopify-order-sync/ShopifyOrderSyncCard.vue";
import {
  fetchEligibility,
  fetchLegacyTeardownState,
} from "@/composables/useShopifyProductSyncMigration";
import {
  fetchUnsyncedProductUpdateCount,
  useShopifyConnectionSyncSession,
  useShopifyOrderSyncCard,
  useShopifyProductSyncRun,
  useShopifyProductSyncRunState,
  useShopifyShop,
  useShopifyShopMutations,
  useShopifyShops,
  fetchShopifyAccessState,
  updateShopifyRemote,
  useShopifyAccessScopes,
} from "@/composables/useShopify";
import { refreshAfterMutation } from "@/services/appCacheBootstrap";
import { useProductStores } from "@/composables/useProductStores";
import { useTypedEnums } from "@/composables/useSeed";

/** Enum type behind SystemMessageRemote.accessScopeEnumId: SHOP_NO / SHOP_READ / SHOP_RW access. */
const SHOPIFY_SHOP_ACCESS_SCOPE_ENUM_TYPE = "ShopifyShopAccessScope";

const props = defineProps(['id']);
const isLoading = ref(true);
const isSyncSummaryLoading = ref(true);
const selectedShopLoadError = ref<string | null>(null);
const PRODUCT_SYNC_ACTIVITY_HOUR_COUNT = 24;
const PRODUCT_SYNC_ACTIVITY_GRAPH_WIDTH = 320;
const PRODUCT_SYNC_ACTIVITY_GRAPH_HEIGHT = 96;
const PRODUCT_SYNC_ACTIVITY_GRAPH_PADDING_X = 12;
const PRODUCT_SYNC_ACTIVITY_GRAPH_PADDING_Y = 12;
type DebugPageState = "live" | "setup-required" | "incompatible" | "upgrade-ready" | "teardown-needed" | "upgraded";
const { currentSyncRun, fetchSyncRun, clearSyncRun } = useShopifyProductSyncRun();
const debugPageState = ref<DebugPageState>("live");
/**
 * Product sync state, LIVE from the cache.
 *
 * This page used to call `fetchDashboardSummary`, which fanned out to five requests (three of them
 * `oms/dataDocumentView` reproductions of a SystemMessage ⋈ DataManagerLog join) and then read two of
 * the five results. Both of those two are cached: the join is `useShopifyProductSyncRunState`, and
 * only the Shopify-side "unsynced updates" count remains a real request.
 */
const {
  runState: productSyncRunState,
  remoteId: productSyncRemoteId,
  // The remote ROW, not just its id — the credentials modal pre-fills `remoteId` (the Shopify shop id)
  // off it. Both were previously a 250-row fetch through the store.
  remote: shopRemote,
} = useShopifyProductSyncRunState(() => props.id);

const productSyncSummary = computed(() => ({ syncRunState: productSyncRunState.value }));
const productSyncRecordsProcessed = computed(() =>
  Number(productSyncRunState.value.latestConsumedSystemMessage?.totalRecordCount || 0));
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

const { shops: cachedShops } = useShopifyShops();
const { record: shopRecord } = useShopifyShop(props.id);
const shop = computed<any>(() => shopRecord.value ?? {});
const selectedShopId = computed(() => String(shop.value.shopId || "").trim());
/**
 * Order sync state, LIVE from the cache — the same shape the deleted `shopifyOrderSync` store fed
 * this card, now derived from cached batches ⋈ imports ⋈ the shop's ServiceJob.
 *
 * Shop-scoped and stateless, so it does not touch the module-level session the three order-sync
 * screens share. `selectedShopLoadError` is threaded in because a shop that fails to resolve must
 * show as an error on the card rather than as a confident "Setup required".
 */
const {
  snapshot: orderSyncCardSnapshot,
  batchActive: orderSyncBatchActive,
} = useShopifyOrderSyncCard(() => props.id, { error: () => selectedShopLoadError.value });
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
      detail: translate("This Shopify connection still uses the deprecated SHOP_READ_WRITE_ACCESS scope. Update the remote configuration to SHOP_RW_ACCESS before starting the new product sync."),
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

/**
 * Activate the class-A domains BOTH cards on this page read.
 *
 * Required, not optional: the product-sync run state and the order-sync card are projections over
 * cached messages and imports, and without the worker filling those tables they are legitimately
 * empty — each card would report "never synced" for a shop with a long history.
 *
 * One session, not two, because every `useCacheSync()` owns its own worker. Product sync stays on
 * its idle cadence (this page only summarises it; the product sync screen asks for the fast one)
 * while order sync escalates to 10s on its own whenever a batch is moving.
 */
useShopifyConnectionSyncSession({
  orderSyncActive: () => orderSyncBatchActive.value,
});

/**
 * Load the summaries once the shop is known.
 *
 * The shop comes from the cache, and a cached read arrives ASYNCHRONOUSLY — on a cold subscription
 * `shop.value` is still undefined during `onIonViewWillEnter`. Reading it there treated "not emitted
 * yet" as "shop does not exist" and failed the page with "could not be resolved". Watching instead
 * covers both the first emit and any later cache write, and `immediate` keeps a warm cache instant.
 */
watch(selectedShopId, async (shopId: string) => {
  if (!shopId) return;
  isLoading.value = true;
  selectedShopLoadError.value = null;
  try {
    isLoading.value = false;
    await loadConnectionSummaries(shopId);
  } catch (error) {
    logger.error("Failed to load the selected Shopify connection", error);
    selectedShopLoadError.value = translate("The selected Shopify connection could not be loaded.");
    isSyncSummaryLoading.value = false;
    isLoading.value = false;
  }
}, { immediate: true });

async function loadConnectionSummaries(shopId = selectedShopId.value) {
  if (!shopId) {
    selectedShopLoadError.value = translate("The selected Shopify connection could not be loaded.");
    return;
  }

  // Only product sync loads here now; order sync is disabled (see orderSyncCardSnapshot).
  const [productSyncResult] = await Promise.allSettled([
    loadProductsInventorySummary(),
  ]);

  if (productSyncResult.status === "rejected") {
    logger.error("Failed to load Product Sync summary");
    hasProductSyncSummaryError.value = true;
    isSyncSummaryLoading.value = false;
  }
}

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
  // Nothing to reset for the run state or the record count — both are cached projections that
  // re-derive from whichever shop is selected.
  productSyncUnsyncedCount.value = 0;
  clearSyncRun();

  if (!props.id) {
    isSyncSummaryLoading.value = false;
    return;
  }

  const [eligibilityResult, accessStateResult, legacyTeardownStateResult] = await Promise.allSettled([
    fetchEligibility(),
    fetchShopifyAccessState({ shopId: props.id, shop: shop.value }),
    fetchLegacyTeardownState({ shopId: props.id, shop: shop.value })
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

  /**
   * The remote is resolved from the CACHE — it is a join of two cached tables, never a request.
   * `fetchShopSystemMessageRemoteId` used to be the fourth leg of the batch above.
   */
  const systemMessageRemoteId = productSyncRemoteId.value || null;

  try {
    /**
     * `unsyncedUpdates` is the only part of the old dashboard summary this page still asks for: it
     * counts products changed in Shopify since the last sync, which only Shopify knows.
     *
     * Everything else the summary returned — the run state, the pending-request count — is now the
     * reactive `productSyncRunState` above, derived from cached messages and imports. The old call
     * fetched five things and this page read two of them.
     */
    productSyncUnsyncedCount.value = await loadUnsyncedProductUpdateCount(systemMessageRemoteId);
  } catch (error) {
    logger.warn("Failed to count unsynced product updates (Shopify is the only source)", error);
    productSyncUnsyncedCount.value = 0;
  }

  isSyncSummaryLoading.value = false;
}

/** Shopify-only: how many products changed since the last completed sync. */
async function loadUnsyncedProductUpdateCount(systemMessageRemoteId: string | null): Promise<number> {
  if (!systemMessageRemoteId) return 0;
  return fetchUnsyncedProductUpdateCount(
    systemMessageRemoteId,
    productSyncRunState.value.lastSyncedAt || undefined,
  );
}

/**
 * Keep the progress column (system message → bulk operation → HotWax import) pointed at the newest run.
 *
 * REACTIVE, not a one-shot call inside the loader. It used to be `loadTrackProgressDetails()` awaited
 * at the end of the dashboard fetch; when that fetch was replaced by cached reads the call went with
 * it, `currentSyncRun` was never populated, and the whole three-row column silently vanished behind its
 * `v-if`. Watching the newest run instead means it also follows a shop switch and a new run arriving,
 * which the imperative version never did.
 *
 * `fetchSyncRun` is cache-first — it only reaches Shopify for a bulk operation that is not cached and
 * not yet terminal — so re-pointing it costs nothing for a run already seen.
 */
watch(
  () => productSyncRunState.value.latestSystemMessage?.systemMessageId,
  (systemMessageId) => {
    if (!systemMessageId) {
      clearSyncRun();
      return;
    }
    void fetchSyncRun(systemMessageId, productSyncRunState.value.latestSystemMessage)
      .catch((error) => logger.warn("Failed to load sync progress detail", error));
  },
  { immediate: true },
);

// ----- Clone settings modal -----
const showCloneSettings = ref(false);
const sourceShopId = ref("");
const categories = ref({
  productTypes: { label: translate("Product types"), selected: true },
  shippingMethods: { label: translate("Shipping methods"), selected: true },
  salesChannels: { label: translate("Sales channels"), selected: true },
  paymentMethods: { label: translate("Payment methods"), selected: true }
}) as any;

const sourceShopsList = computed(() => {
  return cachedShops.value.filter((s: any) => s.shopId !== shop.value.shopId);
});

const hasSelectedCategories = computed(() => {
  return Object.values(categories.value).some((cat: any) => cat.selected);
});

function resetCloneSettingsForm() {
  sourceShopId.value = "";
  categories.value = {
    productTypes: { label: translate("Product types"), selected: true },
    shippingMethods: { label: translate("Shipping methods"), selected: true },
    salesChannels: { label: translate("Sales channels"), selected: true },
    paymentMethods: { label: translate("Payment methods"), selected: true }
  };
}

async function openCloneSettingsModal() {
  resetCloneSettingsForm();
  showCloneSettings.value = true;
  emitter.emit("presentLoader");
  emitter.emit("dismissLoader");
}

function closeCloneSettings() {
  showCloneSettings.value = false;
}

async function onCloneSettingsDismiss() {
  showCloneSettings.value = false;
  await loadConnectionSummaries();
}

const fetchTypeMappingsForShop = async (shopId: string, mappedTypeId: string) => {
  let mappings: any[] = [];
  let pageIndex = 0;
  let resp: any;
  do {
    resp = await api({
      url: "oms/shopifyShops/typeMappings",
      method: "get",
      params: { shopId, mappedTypeId, pageSize: 100, pageIndex }
    });
    if (!commonUtil.hasError(resp) && resp.data) {
      mappings = [...mappings, ...resp.data];
    } else {
      break;
    }
    pageIndex++;
  } while (resp.data && resp.data.length >= 100);
  return mappings;
};

const fetchCarrierShipmentsForShop = async (shopId: string) => {
  let shipments: any[] = [];
  let pageIndex = 0;
  let resp: any;
  do {
    resp = await api({
      url: "oms/shopifyShops/carrierShipments",
      method: "get",
      params: { shopId, pageSize: 100, pageIndex }
    });
    if (!commonUtil.hasError(resp) && resp.data) {
      shipments = [...shipments, ...resp.data];
    } else {
      break;
    }
    pageIndex++;
  } while (resp.data && resp.data.length >= 100);
  return shipments;
};

async function cloneTypeMappings(mappedTypeId: string) {
  const targetShopId = shop.value.shopId;
  // 1. Fetch source and target mappings
  const [sourceMappings, targetMappings] = await Promise.all([
    fetchTypeMappingsForShop(sourceShopId.value, mappedTypeId),
    fetchTypeMappingsForShop(targetShopId, mappedTypeId)
  ]);

  // 2. Delete existing mappings in target
  if (targetMappings.length > 0) {
    const deletePromises = targetMappings.map((mapping: any) =>
      useShopifyShopMutations(targetShopId).retireTypeMapping({
        mappedTypeId,
        mappedKey: mapping.mappedKey
      }, { refresh: false })
    );
    await Promise.allSettled(deletePromises);
  }

  // 3. Create cloned mappings in target
  if (sourceMappings.length > 0) {
    const createPromises = sourceMappings.map((mapping: any) =>
      useShopifyShopMutations(targetShopId).saveTypeMapping({
        mappedTypeId,
        mappedKey: mapping.mappedKey,
        mappedValue: mapping.mappedValue
      }, { refresh: false })
    );
    await Promise.allSettled(createPromises);
  }
}

async function cloneShippingMethods() {
  const targetShopId = shop.value.shopId;
  // 1. Fetch source shipments
  const sourceShipments = await fetchCarrierShipmentsForShop(sourceShopId.value);

  // 2. Create cloned shipments in target (upsert handles overwrite)
  if (sourceShipments.length > 0) {
    const createPromises = sourceShipments.map((shipment: any) =>
      useShopifyShopMutations(targetShopId).saveCarrierShipment({
        shipmentMethodTypeId: shipment.shipmentMethodTypeId,
        shopifyShippingMethod: shipment.shopifyShippingMethod,
        carrierPartyId: shipment.carrierPartyId
      }, { refresh: false })
    );
    await Promise.allSettled(createPromises);
  }
}

async function executeClone() {
  emitter.emit("presentLoader");
  try {
    const promises: Promise<any>[] = [];
    // Which cached slices this clone touches, so each is refreshed exactly ONCE at the end. The
    // clone fans out one write per mapping row and each of those defers its refresh; without this
    // the target shop's mapping pages would keep rendering pre-clone data from the cache.
    const clonedTypeIds: string[] = [];

    // Clone Product Types
    if (categories.value.productTypes.selected) {
      promises.push(cloneTypeMappings("SHOPIFY_PRODUCT_TYPE"));
      clonedTypeIds.push("SHOPIFY_PRODUCT_TYPE");
    }

    // Clone Sales Channels
    if (categories.value.salesChannels.selected) {
      promises.push(cloneTypeMappings("SHOPIFY_ORDER_SOURCE"));
      clonedTypeIds.push("SHOPIFY_ORDER_SOURCE");
    }

    // Clone Payment Methods
    if (categories.value.paymentMethods.selected) {
      promises.push(cloneTypeMappings("SHOPIFY_PAYMENT_TYPE"));
      clonedTypeIds.push("SHOPIFY_PAYMENT_TYPE");
    }

    // Clone Shipping Methods
    if (categories.value.shippingMethods.selected) {
      promises.push(cloneShippingMethods());
    }

    await Promise.all(promises);

    const targetMutations = useShopifyShopMutations(shop.value.shopId);
    await Promise.all([
      ...(clonedTypeIds.length ? [targetMutations.refreshTypeMappings()] : []),
      ...(categories.value.shippingMethods.selected ? [targetMutations.refreshCarrierShipments()] : []),
    ]);

    commonUtil.showToast(translate("Settings cloned successfully"));
    closeCloneSettings();
  } catch (error) {
    logger.error("Cloning failed", error);
    commonUtil.showToast(translate("Failed to clone settings"));
  } finally {
    emitter.emit("dismissLoader");
  }
}

// ----- API credentials modal -----
const showCredentials = ref(false);
const form = reactive({
  shopifyShopId: '',
  clientId: '',
  shopAccessToken: '',
  clientSecret: '',
  oldClientSecret: ''
});

const isFormValid = computed(() =>
  form.shopifyShopId.trim() &&
  form.clientId.trim() &&
  form.shopAccessToken.trim() &&
  form.clientSecret.trim()
);

async function openCredentialsModal() {
  form.shopifyShopId = '';
  form.clientId = '';
  form.shopAccessToken = '';
  form.clientSecret = '';
  form.oldClientSecret = '';
  showCredentials.value = true;
  /**
   * Pre-fill from the shop's SystemMessageRemote, read from the CACHE.
   *
   * `shopifyStore.fetchSystemMessageRemote(shopId)` fetched `oms/systemMessageRemotes?pageSize=250` and
   * scanned for `internalId === shopId && internalIdType === 'HOTWAX_SHOP_ID'` — 250 rows to find one
   * that `systemMessageRemoteCache` already holds, and `useShopifySyncContext` already resolves by the
   * same rule. No request, and no failure path to handle.
   */
  // Remote FIRST, shop row second. The remote resolves by the OMS-side key (`internalId` +
  // `internalIdType`), so it can supply the Shopify id even when the cached shop row lacks it — which is
  // the connection this modal is usually opened to repair.
  form.shopifyShopId = shopRemote.value?.remoteId || shop.value.shopifyShopId || '';
}

function closeCredentials() {
  showCredentials.value = false;
}

async function updateCredentials() {
  if (!isFormValid.value) {
    commonUtil.showToast(translate('Please fill in all required fields'));
    return;
  }

  emitter.emit('presentLoader');
  try {
    const updated = await updateShopifyRemote({
      myshopifyDomain: shop.value.myshopifyDomain || shop.value.domain,
      shopifyShopId: form.shopifyShopId.trim(),
      shopAccessToken: form.shopAccessToken.trim(),
      clientId: form.clientId.trim(),
      clientSecret: form.clientSecret.trim(),
      oldClientSecret: form.oldClientSecret.trim() || undefined,
      name: shop.value.name
    });
    commonUtil.showToast(translate('Credentials updated successfully'));
    /**
     * Write-through: pull the mutated remote back into the cache.
     *
     * Every reader of this remote — the credentials pre-fill, the access-scope modal, and the sync
     * context that decides which messages belong to this shop — now reads it from IndexedDB, so
     * without this the UI keeps showing pre-edit values until the next login snapshot.
     */
    /**
     * Refresh BOTH sides of the shop↔remote link, and only with a real id.
     *
     * An empty `systemMessageRemoteId` would issue `GET oms/systemMessageRemotes/` and the worker
     * swallows the failure, so a blank id fails completely silently. And the modal edits the remote's
     * `remoteId` — the field the client match is built on — so refreshing the remote without the shop
     * leaves the two unmatchable until the next login, which blanks both cards on this page.
     */
    // `updateShopifyRemote` returns `resp.data`, and `POST sob/shop/remote` answers with the remote id —
    // authoritative for a brand-new connection, where the cached id is still empty.
    const editedRemoteId = updated?.systemMessageRemoteId || productSyncRemoteId.value;
    if (editedRemoteId) {
      await refreshAfterMutation("systemMessageRemote", { systemMessageRemoteId: editedRemoteId });
    }
    await refreshAfterMutation("shopifyShop", { shopId: shop.value.shopId });
    showCredentials.value = false;
  } catch (error: any) {
    logger.error('updateShopifyCredentials', error);
    commonUtil.showToast(translate('Failed to update credentials'));
  }
  emitter.emit('dismissLoader');
}

// ----- Access scopes modal -----
const showAccessScopes = ref(false);
const accessScopesRemoteId = ref<string>('');

const scopeInfo = computed(() =>
  accessScopesRemoteId.value ? scopesFor(accessScopesRemoteId.value) : null
);
const scopes = computed<string[]>(() => scopeInfo.value?.scopes ?? []);
const lastRefreshedLabel = computed(() =>
  scopeInfo.value ? new Date(scopeInfo.value.lastRefreshed).toLocaleString() : ''
);

async function openAccessScopesModal() {
  accessScopesRemoteId.value = '';
  showAccessScopes.value = true;
  // Keyed by the shop's SystemMessageRemote, which the sync context resolves from cache — see
  // `openCredentialsModal` for why this is no longer a 250-row fetch.
  accessScopesRemoteId.value = productSyncRemoteId.value;
  if (!accessScopesRemoteId.value) {
    commonUtil.showToast(translate('No Shopify shop remote found for this connection'));
  }
}

function closeAccessScopes() {
  showAccessScopes.value = false;
}

// ----- Connection access scope (the OMS-side read/write shutoff) -----
// Distinct from the granted OAuth scopes in the same modal: this is
// SystemMessageRemote.accessScopeEnumId, which services read directly to decide whether this OMS may
// write to the shop at all.
const { values: connectionAccessScopeOptions } = useTypedEnums(SHOPIFY_SHOP_ACCESS_SCOPE_ENUM_TYPE);
const isSavingAccessScope = ref(false);
const connectionAccessScopeId = computed(() => shopRemote.value?.accessScopeEnumId || '');

async function onConnectionAccessScopeChange(accessScopeEnumId: string) {
  const remoteId = accessScopesRemoteId.value;
  // ion-select fires on programmatic value changes too, so ignore anything that is already stored.
  if (!remoteId || !accessScopeEnumId || accessScopeEnumId === connectionAccessScopeId.value) return;

  isSavingAccessScope.value = true;
  try {
    await setConnectionAccessScope(remoteId, accessScopeEnumId);
    commonUtil.showToast(translate('Connection access updated'));
  } catch (error: any) {
    logger.error('setConnectionAccessScope', error);
    commonUtil.showToast(translate('Failed to update connection access'));
  }
  isSavingAccessScope.value = false;
}

async function refresh() {
  if (!accessScopesRemoteId.value) return;

  emitter.emit('presentLoader');
  try {
    const granted = await refreshAccessScopes(accessScopesRemoteId.value);
    commonUtil.showToast(translate('Fetched {count} access scope(s) from Shopify', { count: granted.length }));
  } catch (error: any) {
    logger.error('refreshAccessScopes', error);
    commonUtil.showToast(translate('Failed to refresh access scopes'));
  }
  emitter.emit('dismissLoader');
}

// ----- Product store modal -----
const showProductStore = ref(false);
const { productStores } = useProductStores();
// Access scopes: persisted display cache + the live Shopify refresh (was Pinia `persist: true`).
const { scopesFor, refreshAccessScopes, setConnectionAccessScope } = useShopifyAccessScopes();
const selectedProductStoreId = ref("");
const currentProductStoreId = computed(() => shop.value?.productStoreId || "");

async function openProductStoreModal() {
  selectedProductStoreId.value = "";
  showProductStore.value = true;
  selectedProductStoreId.value = currentProductStoreId.value;
}

function closeProductStore() {
  showProductStore.value = false;
}

async function onProductStoreDismiss() {
  showProductStore.value = false;
}

async function updateProductStoreMapping() {
  emitter.emit("presentLoader");
  try {
    const resp = await useShopifyShopMutations(shop.value.shopId).updateShop({
      productStoreId: selectedProductStoreId.value
    });

    if (!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate("Product store linked successfully"));
      showProductStore.value = false;
    } else {
      throw resp.data;
    }
  } catch (error: any) {
    logger.error(error);
    commonUtil.showToast(translate("Failed to link product store"));
  }
  emitter.emit("dismissLoader");
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

/**
 * Open the right order-sync destination for the card's current state.
 *
 * An unconfigured shop has nothing to monitor, so it goes to the configure screen; everything else —
 * including a shop whose status could not be read — goes to monitoring, which is where the real
 * diagnosis lives.
 */
function openOrderSyncEntry() {
  const snapshot = orderSyncCardSnapshot.value;
  // Gate on the SAME id the snapshot's `actionable` was computed from. Reading `selectedShopId`
  // (the cached row) while the card was enabled on the route id made a card for an unknown shop
  // render as a button whose handler silently returned.
  if (!snapshot.actionable || snapshot.loading || !snapshot.shopId) return;

  const destination = !snapshot.error && snapshot.configurationState === "missing"
    ? `/shopify-connection-details/${snapshot.shopId}/order-sync/configure`
    : `/shopify-connection-details/${snapshot.shopId}/order-sync`;

  router.push(destination);
}

function openShopDetails() {
  router.push(`/shopify-connection-details/${props.id}/instance-details`);
}

function openShopifyLocations() {
  router.push(`/shopify-connection-details/${props.id}/locations`);
}

function openInventorySync() {
  router.push(`/shopify-connection-details/${props.id}/inventory-sync`);
}

function openTransferSync() {
  router.push(`/shopify-connection-details/${props.id}/transfer-sync`);
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

main {
  max-width: 600px;
  margin: 0 auto;
}

.categories-list {
  background: transparent;
}

.warning-card {
  margin-top: var(--spacer-md);
}

.warning-icon {
  font-size: 2rem;
  color: var(--ion-color-warning);
  margin-bottom: var(--spacer-xs);
}

.warning-content p {
  margin: 0;
}
</style>
