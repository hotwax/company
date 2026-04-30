<template>
  <main class="setup-wizard">

    <div class="setup-tracker">
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ translate("Sync product catalog") }}</ion-card-title>
        </ion-card-header>

        <ion-card-content>
          <p v-if="currentStep === 'home'">
            {{ translate("Looks like you’re syncing products from this Shopify account to HotWax for the first time.")
            }}
          </p>
          <p v-if="currentStep === 'home'">
            {{ translate("Before you start the import process, lets make sure everything is configured correctly.") }}
          </p>
        </ion-card-content>

        <ion-list lines="full">
          <ion-item>
            <ion-label>{{ translate("Product store") }}</ion-label>
            <ion-note slot="end">{{ selectedProductStoreName }}</ion-note>
          </ion-item>
          <ion-item>
            <ion-label>{{ translate("Internal name mapping") }}</ion-label>
            <ion-note slot="end">{{ selectedIdentifierLabel }}</ion-note>
          </ion-item>
          <ion-item>
            <ion-label>{{ translate("Product types") }}</ion-label>
            <ion-note slot="end">{{ productTypeMappingsLabel }}</ion-note>
          </ion-item>
          <ion-item>
            <ion-label>{{ translate("Start product import") }}</ion-label>
            <ion-badge slot="end" :color="importStatusBadgeColor">{{ importStatusLabel }}</ion-badge>
          </ion-item>
        </ion-list>
      </ion-card>

      <ion-button v-if="currentStep === 'home'" expand="block" @click="$emit('go-next')"
        data-testid="review-configurations">
        {{ translate("Review configurations") }}
      </ion-button>

    </div>
    <ion-card class="step" v-if="currentStep === 'product-store'">
      <ion-card-header>
        <ion-card-title>{{ translate("Confirm product store") }}</ion-card-title>
        <ion-card-subtitle>{{ translate("Only Shopify stores with the same catalog should share a Product Store.")
          }}</ion-card-subtitle>
      </ion-card-header>
      <ion-list v-if="productStoreLocked" lines="full">
        <ion-item>
          <ion-label>
            {{ translate("Selected Product Store") }}
            <p>{{ selectedProductStore ? selectedProductStore.productStoreId : draft.selectedProductStoreId }}</p>
            <p>{{ getConnectedShopLabel(draft.selectedProductStoreId) }}</p>
          </ion-label>
          <ion-note slot="end">{{ selectedProductStoreName }}</ion-note>
        </ion-item>
        <ion-item>
          <ion-label>
            {{ translate("Product Store cannot be changed") }}
            <p>{{ translate("This shop already has synced products, so the existing Product Store must stay selected.") }}</p>
          </ion-label>
        </ion-item>
      </ion-list>
      <ion-list v-else lines="full">
        <ion-radio-group :value="draft.selectedProductStoreId"
          @ionChange="$emit('product-store-change', $event.detail.value)">
          <ion-item v-for="productStore in productStores" :key="productStore.productStoreId">
            <ion-radio slot="start" :value="productStore.productStoreId" />
            <ion-label>
              {{ getProductStoreName(productStore) }}
              <p>{{ productStore.productStoreId }}</p>
              <p>{{ getConnectedShopLabel(productStore.productStoreId) }}</p>
            </ion-label>
          </ion-item>
        </ion-radio-group>
      </ion-list>
      <ion-list v-if="hasRelatedShops && !productStoreLocked" lines="full">
        <ion-item>
          <ion-label>
            {{ translate("Verify related Shopify stores") }}
            <p>{{ translate("Make sure these Shopify stores use the same catalog before continuing.") }}</p>
          </ion-label>
        </ion-item>
        <ion-item v-for="relatedShop in relatedShops" :key="relatedShop.shopId">
          <ion-label>
            {{ relatedShop.name || relatedShop.shopId }}
            <p>{{ relatedShop.shopId === shopId ? translate("New shop") : translate("Connected shop") }}</p>
          </ion-label>
          <ion-note slot="end">{{ relatedShop.createdDate || relatedShop.createdStamp || translate("Created date unavailable") }}</ion-note>
        </ion-item>
      </ion-list>
      <ion-item v-if="!productStoreLocked" lines="full" button :disabled="!draft.selectedProductStoreId"
        @click="$emit('toggle-product-store-verification')">
        <ion-checkbox :checked="draft.productStoreVerified"
          :disabled="!draft.selectedProductStoreId" data-testid="product-store-verification">
          {{ translate("I have verified that these Shopify stores are part of the selected Product Store.") }}
        </ion-checkbox>
      </ion-item>
      <ion-card-content>
        <ion-button expand="block" fill="clear" @click="$emit('go-back')">{{ translate("Back") }}</ion-button>
        <ion-button expand="block" :disabled="nextDisabled || isSaving" @click="$emit('go-next')"
          data-testid="product-store-next">
          {{ translate("Next") }}
        </ion-button>
      </ion-card-content>
    </ion-card>

    <ion-card class="step" v-if="currentStep === 'identifier'">
      <ion-card-header>
        <ion-card-title>{{ translate("Confirm internal name mapping") }}</ion-card-title>
        <ion-card-subtitle>{{ translate("The identifier controls how Shopify products match HotWax products.")
          }}</ion-card-subtitle>
      </ion-card-header>
      <ion-list v-if="identifierLocked" lines="full">
        <ion-item>
          <ion-label>
            {{ translate("Selected identifier") }}
            <p>{{ selectedIdentifier ? selectedIdentifier.enumId : draft.selectedIdentifierEnumId }}</p>
            <p v-if="selectedIdentifier?.enumId === recommendedIdentifierEnumId">{{ translate("Recommended") }}</p>
          </ion-label>
          <ion-note slot="end">{{ selectedIdentifierLabel }}</ion-note>
        </ion-item>
        <ion-item>
          <ion-label>
            {{ translate("Identifier cannot be changed") }}
            <p>{{ translate("This Product Store is already linked to other Shopify shops, so the existing identifier must stay selected.") }}</p>
          </ion-label>
        </ion-item>
      </ion-list>
      <ion-list v-else lines="full">
        <ion-radio-group :value="draft.selectedIdentifierEnumId"
          @ionChange="$emit('identifier-change', $event.detail.value)">
          <ion-item v-for="identifier in identifierOptions" :key="identifier.enumId">
            <ion-radio slot="start" :value="identifier.enumId" />
            <ion-label>
              {{ identifier.description || identifier.enumId }}
              <p v-if="identifier.enumId === recommendedIdentifierEnumId">{{ translate("Recommended") }}</p>
            </ion-label>
          </ion-item>
        </ion-radio-group>
      </ion-list>
      <ion-list v-if="hasRelatedShops && !identifierLocked" lines="full">
        <ion-item v-for="relatedShop in relatedShops" :key="relatedShop.shopId">
          <ion-label>
            {{ relatedShop.name || relatedShop.shopId }}
            <p>{{ relatedShop.shopId === shopId ? translate("New shop") : translate("Connected shop") }}</p>
          </ion-label>
        </ion-item>
      </ion-list>
      <ion-card-content>
        <ion-button fill="clear" @click="$emit('go-back')">{{ translate("Back") }}</ion-button>
        <ion-button expand="block" :disabled="nextDisabled || isSaving" @click="$emit('go-next')"
          data-testid="identifier-next">
          {{ translate("Next") }}
        </ion-button>
      </ion-card-content>
    </ion-card>

    <ion-card class="step" v-if="currentStep === 'product-types'">
      <ion-card-header>
        <ion-card-title>{{ translate("Map product types") }}</ion-card-title>
        <ion-card-subtitle>{{ translate("Review the Shopify product type mappings before import.")
          }}</ion-card-subtitle>
      </ion-card-header>
      <ion-list lines="full">
        <ion-item v-if="!productTypeMappings.length">
          <ion-label>
            {{ translate("No product type mappings found") }}
            <p>{{ translate("Product type mapping is informational for this first version.") }}</p>
          </ion-label>
        </ion-item>
        <ion-item v-for="mapping in productTypeMappings" :key="`${mapping.mappedKey}-${mapping.mappedValue}`">
          <ion-label>
            {{ mapping.mappedKey }}
            <p>{{ mapping.mappedValue }}</p>
          </ion-label>
        </ion-item>
      </ion-list>
      <ion-card-content>
        <ion-button fill="clear" @click="$emit('go-back')">{{ translate("Back") }}</ion-button>
        <ion-button expand="block" :disabled="nextDisabled" @click="$emit('go-next')" data-testid="finish-configuration">
          {{ translate("Finish configuration") }}
        </ion-button>
      </ion-card-content>
    </ion-card>

    <ion-card class="step" v-if="currentStep === 'review'">
      <ion-card-header>
        <ion-card-title>{{ translate("Review product import") }}</ion-card-title>
        <ion-card-subtitle>{{ translate("Compare Shopify and HotWax catalog state before starting the first import.")
          }}</ion-card-subtitle>
      </ion-card-header>
      <ion-card-content v-if="isReviewLoading">
        <ion-spinner name="crescent" />
      </ion-card-content>
      <ion-list v-else lines="full">
        <ion-item>
          <ion-label>{{ translate("Shopify products") }}</ion-label>
          <ion-note slot="end">{{ reviewStats.shopifyProductCount }}</ion-note>
        </ion-item>
        <ion-item>
          <ion-label>{{ translate("Shopify variants") }}</ion-label>
          <ion-note slot="end">{{ reviewStats.shopifyVariantCount }}</ion-note>
        </ion-item>
        <ion-item>
          <ion-label>{{ translate("HotWax products") }}</ion-label>
          <ion-note slot="end">{{ reviewStats.omsProductCount }}</ion-note>
        </ion-item>
        <ion-item>
          <ion-label>{{ translate("HotWax variants") }}</ion-label>
          <ion-note slot="end">{{ reviewStats.omsVariantCount }}</ion-note>
        </ion-item>
        <ion-item>
          <ion-label>{{ translate("Linked Shopify stores") }}</ion-label>
          <ion-note slot="end">{{ reviewStats.linkedShopCount }}</ion-note>
        </ion-item>
      </ion-list>
      <ion-card-content>
        <ion-button fill="clear" @click="$emit('go-back')">{{ translate("Back") }}</ion-button>
        <ion-button expand="block" fill="outline" :disabled="!reviewReady" @click="$emit('open-mistake-modal')"
          data-testid="mistake-check">
          {{ translate("Am I making a mistake?") }}
        </ion-button>
        <ion-button expand="block" :disabled="!reviewReady" @click="$emit('open-start-sync-modal')"
          data-testid="run-product-import">
          {{ translate("Run product import") }}
        </ion-button>
      </ion-card-content>
    </ion-card>

    <template v-if="currentStep === 'progress'">
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ translate("Track sync progress") }}</ion-card-title>
          <ion-card-subtitle>{{ translate("Monitor each step as products get imported from Shopify")
            }}</ion-card-subtitle>
        </ion-card-header>
        <ion-list lines="full">
          <template v-if="currentSyncRun && currentSyncRun.systemMessageId">
            <ion-item button detail
              @click="$emit('open-step-details', { type: 'systemMessage', id: currentSyncRun.systemMessageId })">
              <ion-label>
                {{ translate("System message") }}
                <p>{{ currentSyncRun.systemMessageId }}</p>
                <p>{{ translate("Next send attempt") }}: {{ systemMessageSendJobNextRunLabel }}</p>
              </ion-label>
              <ion-badge slot="end" :color="currentSyncRun.statusColor">{{ currentSyncRun.status }}</ion-badge>
            </ion-item>
            <ion-item button detail
              @click="$emit('open-step-details', { type: 'bulkOperation', id: currentSyncRun.bulkOperation.id })"
              :disabled="!currentSyncRun.bulkOperation?.id">
              <ion-label>
                {{ translate("Shopify bulk operation") }}
                <p>{{ currentSyncRun.bulkOperation?.id || translate("Not started") }}</p>
                <p>{{ translate("Next poll attempt") }}: {{ bulkOperationPollJobNextRunLabel }}</p>
              </ion-label>
              <ion-note slot="end" v-if="currentSyncRun.bulkOperation?.objectCount">
                {{ currentSyncRun.bulkOperation.objectCount }} {{ translate("objects") }}
              </ion-note>
              <ion-badge slot="end" :color="currentSyncRun.bulkOperation?.statusColor || 'medium'">{{
                currentSyncRun.bulkOperation?.statusLabel || translate("Pending") }}</ion-badge>
            </ion-item>
            <ion-item button detail @click="$emit('open-step-details', { type: 'mdmLog', id: currentSyncRun.mdmLog.id })"
              :disabled="!currentSyncRun.mdmLog?.id">
              <ion-label>
                {{ translate("HotWax bulk import") }}
                <p>{{ currentSyncRun.mdmLog?.id || translate("Not started") }}</p>
              </ion-label>
              <ion-note slot="end" v-if="currentSyncRun.mdmLog?.totalRecordCount">
                {{ currentSyncRun.mdmLog.totalRecordCount }} {{ translate("records") }}
              </ion-note>
              <ion-badge slot="end" :color="currentSyncRun.mdmLog?.statusColor || 'medium'">{{
                currentSyncRun.mdmLog?.statusLabel || translate("Pending") }}</ion-badge>
            </ion-item>
          </template>
          <ion-item v-else>
            <ion-label>{{ translate("Syncing...") }}</ion-label>
          </ion-item>
        </ion-list>
      </ion-card>

      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ translate("Product export request payload") }}</ion-card-title>
          <ion-card-subtitle>{{ translate("Using Shopify's bulk query API to export all products in the catalog.") }}</ion-card-subtitle>
        </ion-card-header>
        <ion-list lines="full">
          <ion-item button detail
            @click="emit('open-step-details', { type: 'systemMessage', id: systemMessageId })"
            :disabled="!systemMessageId">
            <ion-icon slot="start" :icon="documentTextOutline" />
            <ion-label>
              {{ translate("System message") }}
              <p>{{ systemMessageId || translate("Not available") }}</p>
            </ion-label>
            <ion-badge slot="end" :color="systemMessageStatusColor">{{ systemMessageStatusLabel }}</ion-badge>
          </ion-item>
          <ion-item button detail
            @click="emit('open-step-details', { type: 'bulkOperation', id: bulkOperationId })"
            :disabled="!bulkOperationId">
            <ion-icon slot="start" :icon="pulseOutline" />
            <ion-label>
              {{ translate("Shopify bulk operation") }}
              <p>{{ translate("Shopify might take some time to process bulk operation requests.") }}</p>
              <p>{{ bulkOperationProgressLabel }}</p>
              <p>{{ translate("Next poll attempt") }}: {{ bulkOperationPollJobNextRunLabel }}</p>
            </ion-label>
            <ion-badge slot="end" :color="bulkOperationStatusColor">{{ bulkOperationStatusLabel }}</ion-badge>
          </ion-item>
          <ion-progress-bar v-if="hasBulkOperationProgress" :value="bulkOperationProgressValue" />
          <ion-item>
            <ion-label>{{ translate("Products and variants processed / Total product count") }}</ion-label>
            <ion-note slot="end">{{ bulkOperationProgressLabel }}</ion-note>
          </ion-item>
        </ion-list>
      </ion-card>

      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ translate("Pending bulk operations") }}</ion-card-title>
          <ion-card-subtitle>{{ translate("Shopify might take some time to process bulk operation requests.") }}</ion-card-subtitle>
        </ion-card-header>
        <ion-list lines="full">
          <ion-item v-if="queuedJobsAhead">
            <ion-label>{{ translate("Queued jobs ahead") }}</ion-label>
            <ion-note slot="end">{{ queuedJobsAhead }}</ion-note>
          </ion-item>
          <ion-item>
            <ion-icon slot="start" :icon="sendOutline" />
            <ion-label>
              {{ translate("Your request") }}
              <p>{{ bulkOperationId || systemMessageId || translate("Not available") }}</p>
            </ion-label>
            <ion-badge slot="end" :color="bulkOperationStatusColor">{{ bulkOperationStatusLabel }}</ion-badge>
          </ion-item>
        </ion-list>
      </ion-card>

      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ translate("Bulk file process") }}</ion-card-title>
          <ion-card-subtitle>{{ bulkFileProcessDescription }}</ion-card-subtitle>
        </ion-card-header>
        <ion-list lines="full">
          <ion-item button detail @click="emit('open-step-details', { type: 'mdmLog', id: mdmLogId })"
            :disabled="!mdmLogId">
            <ion-icon slot="start" :icon="serverOutline" />
            <ion-label>
              {{ translate("HotWax bulk import") }}
              <p>{{ mdmLogId || translate("Not started") }}</p>
            </ion-label>
            <ion-note slot="end" v-if="mdmRecordCount">
              {{ mdmRecordCount }} {{ translate("records") }}
            </ion-note>
            <ion-badge slot="end" :color="mdmLogStatusColor">{{ mdmLogStatusLabel }}</ion-badge>
          </ion-item>
        </ion-list>
        <ion-card-content>
          <ion-button expand="block" fill="outline" @click="$emit('load-progress')">{{ translate("Refresh status")
            }}</ion-button>
          <ion-button expand="block" :disabled="!reconcileAvailable" @click="$emit('go-next')"
            data-testid="reconcile-sync">
            {{ translate("Reconcile product sync") }}
          </ion-button>
        </ion-card-content>
      </ion-card>
    </template>

    <ion-card class="step" v-if="currentStep === 'reconcile'">
      <ion-card-header>
        <ion-card-title>{{ translate("Product sync setup complete") }}</ion-card-title>
        <ion-card-subtitle>{{ translate("Shopify product sync now runs automatically every 15 minutes.")
          }}</ion-card-subtitle>
      </ion-card-header>
      <ion-list lines="full">
        <ion-item>
          <ion-label>{{ translate("Shopify products") }}</ion-label>
          <ion-note slot="end">{{ reviewStats.shopifyProductCount }}</ion-note>
        </ion-item>
        <ion-item>
          <ion-label>{{ translate("HotWax products") }}</ion-label>
          <ion-note slot="end">{{ reviewStats.omsProductCount }}</ion-note>
        </ion-item>
        <ion-item>
          <ion-label>{{ translate("Completion status") }}</ion-label>
          <ion-badge slot="end" color="success">{{ translate("Complete") }}</ion-badge>
        </ion-item>
      </ion-list>
    </ion-card>

    <ion-modal :is-open="showMistakeModal" :backdrop-dismiss="false" @didDismiss="emit('close-mistake-modal')">
      <ion-header>
        <ion-toolbar>
          <ion-buttons slot="start">
            <ion-button @click="$emit('close-mistake-modal')" :aria-label="translate('Close')">
              <ion-icon slot="icon-only" :icon="closeOutline" />
            </ion-button>
          </ion-buttons>
          <ion-title>{{ translate("Am I making a mistake?") }}</ion-title>
        </ion-toolbar>
      </ion-header>
      <ion-content>
        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ preflightTitle }}</ion-card-title>
            <ion-card-subtitle>{{ preflightSubtitle }}</ion-card-subtitle>
          </ion-card-header>
          <ion-list lines="full">
            <ion-item v-for="item in preflightResult.items" :key="item.label || item.id">
              <ion-label>
                {{ item.label }}
                <p>{{ item.detail }}</p>
              </ion-label>
              <ion-badge slot="end" :color="getPreflightBadgeColor(item.status)">{{ item.status }}</ion-badge>
            </ion-item>
          </ion-list>
          <ion-item v-if="preflightRequiresConfirmation" lines="full" button
            @click="$emit('toggle-preflight-warning-confirmation')">
            <ion-checkbox :checked="preflightWarningConfirmed" label-placement="end"
              data-testid="preflight-warning-confirmation">
              {{ translate("I reviewed the warning and want to continue.") }}
            </ion-checkbox>
          </ion-item>
          <ion-card-content v-if="preflightRequiresConfirmation">
            <ion-button expand="block" :disabled="!preflightWarningConfirmed"
              @click="$emit('accept-preflight-and-open-start-sync')" data-testid="accept-preflight-warning">
              {{ translate("Continue to import") }}
            </ion-button>
          </ion-card-content>
        </ion-card>
      </ion-content>
    </ion-modal>

    <ion-modal :is-open="showStartSyncModal" :backdrop-dismiss="false" @didDismiss="emit('close-start-sync-modal')">
      <ion-header>
        <ion-toolbar>
          <ion-buttons slot="start">
            <ion-button @click="$emit('close-start-sync-modal')" :aria-label="translate('Close')">
              <ion-icon slot="icon-only" :icon="closeOutline" />
            </ion-button>
          </ion-buttons>
          <ion-title>{{ translate("Start product sync") }}</ion-title>
        </ion-toolbar>
      </ion-header>
      <ion-content>
        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ translate("Background sync") }}</ion-card-title>
            <ion-card-subtitle>{{ translate("Manage background synchronization for this shop.") }}</ion-card-subtitle>
          </ion-card-header>
          <ion-card-content>
            <ion-list v-if="!isSyncJobConfigLoaded">
              <ion-item lines="none">
                <ion-spinner name="crescent" slot="start" />
                <ion-label>{{ translate("Checking job status...") }}</ion-label>
              </ion-item>
            </ion-list>
            <div v-else-if="syncJobConfigured">
              <ion-item lines="none">
                <ion-icon color="success" slot="start" :icon="checkmarkCircleOutline" />
                <ion-label color="success" class="ion-text-wrap">{{ translate("Product sync job is scheduled.") }}</ion-label>
              </ion-item>
            </div>
            <div v-else>
              <ion-item lines="none">
                <ion-label color="warning" class="ion-text-wrap">{{ translate("Product sync job not configured for this shop.") }}</ion-label>
              </ion-item>
              <ion-button fill="outline" expand="block" :disabled="isSyncJobConfiguring" @click="emit('configure-sync-job')">
                <ion-spinner v-if="isSyncJobConfiguring" slot="start" name="crescent" />
                {{ translate("Schedule Job") }}
              </ion-button>
            </div>
          </ion-card-content>
        </ion-card>

        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ translate("First product sync cannot be cancelled") }}</ion-card-title>
            <ion-card-subtitle>{{ translate("Incorrect Shopify store to Product Store mapping can corrupt catalog state.") }}</ion-card-subtitle>
          </ion-card-header>
          <ion-item lines="full" button @click="$emit('toggle-start-confirmation')">
            <ion-checkbox :checked="draft.startConfirmed" label-placement="end" data-testid="start-sync-confirmation">
              {{ translate("I understand and want to start the first product sync.") }}
            </ion-checkbox>
          </ion-item>
          <ion-card-content>
            <ion-button expand="block" :disabled="startSyncDisabled || isSaving" @click="$emit('start-product-sync')"
              data-testid="start-product-sync">
              {{ translate("Start product sync") }}
            </ion-button>
          </ion-card-content>
        </ion-card>
      </ion-content>
    </ion-modal>
  </main>
</template>

<script setup lang="ts">
import type { ShopifyProductSyncRun } from "@/services/ShopifyProductSyncService";
import {
  IonBadge,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonCheckbox,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonNote,
  IonProgressBar,
  IonRadio,
  IonRadioGroup,
  IonSpinner,
  IonTitle,
  IonToolbar
} from "@ionic/vue";
import {
  closeOutline,
  documentTextOutline,
  pulseOutline,
  sendOutline,
  serverOutline,
  syncCircleOutline,
  checkmarkCircleOutline
} from "ionicons/icons";
import { translate } from "@/i18n";
import { computed, defineEmits, defineProps } from "vue";
import { getProductSyncBulkOperationProgress } from "@/utils/shopifyProductSyncWizard";


const props = defineProps<{
  currentStep: string
  draft: any
  getConnectedShopLabel: (productStoreId: string) => string
  getProductStoreName: (productStore: any) => string
  hasRelatedShops: boolean
  identifierLocked: boolean
  identifierOptions: any[]
  importStatusBadgeColor: string
  importStatusLabel: string
  isReviewLoading: boolean
  isSaving: boolean
  nextDisabled: boolean
  preflightRequiresConfirmation: boolean
  preflightResult: any
  preflightSubtitle: string
  preflightTitle: string
  preflightWarningConfirmed: boolean
  productStoreLocked: boolean
  productStores: any[]
  productTypeMappings: any[]
  productTypeMappingsLabel: string
  progressBadgeColor: string
  progressState: any
  progressStatus: string
  systemMessageSendJobNextRunLabel: string
  bulkOperationPollJobNextRunLabel: string
  currentSyncRun?: ShopifyProductSyncRun
  reconcileAvailable: boolean
  recommendedIdentifierEnumId: string
  relatedShops: any[]
  reviewReady: boolean
  reviewStats: any
  selectedIdentifierLabel: string
  selectedProductStoreName: string
  shopId: string
  showMistakeModal: boolean
  showStartSyncModal: boolean
  startSyncDisabled: boolean
  isSyncJobConfigLoaded: boolean
  isSyncJobConfiguring: boolean
  syncJobConfigured: boolean
}>();

const emit = defineEmits([
  "accept-preflight-and-open-start-sync",
  "close-mistake-modal",
  "close-start-sync-modal",
  "configure-sync-job",
  "go-back",
  "go-next",
  "identifier-change",
  "load-progress",
  "open-mistake-modal",
  "open-start-sync-modal",
  "open-step-details",
  "product-store-change",
  "start-product-sync",
  "toggle-preflight-warning-confirmation",
  "toggle-product-store-verification",
  "toggle-start-confirmation"
]);

function getPreflightBadgeColor(status: string) {
  switch (status) {
    case "Matched": return "success";
    case "Conflict": return "danger";
    case "Not found": return "warning";
    default: return "medium";
  }
}

const selectedProductStore = computed(() => {
  return props.productStores.find((productStore: any) => productStore.productStoreId === props.draft.selectedProductStoreId);
});

const selectedIdentifier = computed(() => {
  return props.identifierOptions.find((identifier: any) => identifier.enumId === props.draft.selectedIdentifierEnumId);
});

const systemMessageId = computed(() => {
  return props.currentSyncRun?.systemMessageId || props.progressState?.systemMessageId || "";
});

const systemMessageStatusLabel = computed(() => {
  return props.currentSyncRun?.systemMessage?.statusLabel || props.progressState?.systemMessageState || translate("Pending");
});

const systemMessageStatusColor = computed(() => {
  return props.currentSyncRun?.systemMessage?.statusColor || props.progressBadgeColor || "medium";
});

const bulkOperationId = computed(() => {
  return props.currentSyncRun?.bulkOperation?.id || props.progressState?.bulkOperationId || "";
});

const bulkOperationStatusLabel = computed(() => {
  return props.currentSyncRun?.bulkOperation?.statusLabel || props.progressState?.bulkOperationStatus || translate("Pending");
});

const bulkOperationStatusColor = computed(() => {
  return props.currentSyncRun?.bulkOperation?.statusColor || props.progressBadgeColor || "medium";
});

const bulkOperationObjectCount = computed(() => {
  return Number(props.currentSyncRun?.bulkOperation?.objectCount ?? props.progressState?.objectCount ?? 0);
});

const bulkOperationProgress = computed(() => {
  return getProductSyncBulkOperationProgress(bulkOperationObjectCount.value, props.reviewStats?.shopifyProductCount);
});

const hasBulkOperationProgress = computed(() => {
  return bulkOperationProgress.value.hasTotalCount;
});

const bulkOperationProgressValue = computed(() => {
  return bulkOperationProgress.value.value;
});

const bulkOperationProgressLabel = computed(() => {
  if (!bulkOperationProgress.value.hasTotalCount) {
    return translate("{count} objects processed", { count: formatCount(bulkOperationProgress.value.processedCount) });
  }

  return translate("{processed} objects processed / {total} products requested", {
    processed: formatCount(bulkOperationProgress.value.processedCount),
    total: formatCount(bulkOperationProgress.value.totalCount)
  });
});

const queuedJobsAhead = computed(() => {
  return Math.max(Number(props.progressState?.queuedJobsAhead || 0), 0);
});

const mdmLogId = computed(() => {
  return props.currentSyncRun?.mdmLog?.id || "";
});

const mdmLogStatusLabel = computed(() => {
  return props.currentSyncRun?.mdmLog?.statusLabel || translate("Pending");
});

const mdmLogStatusColor = computed(() => {
  return props.currentSyncRun?.mdmLog?.statusColor || "medium";
});

const mdmRecordCount = computed(() => {
  return Number(props.currentSyncRun?.mdmLog?.totalRecordCount || 0);
});

const bulkFileProcessDescription = computed(() => {
  if (!bulkOperationId.value) return translate("Waiting for Shopify to accept the product export request.");
  if (!isCompleteStatus(props.currentSyncRun?.bulkOperation?.status || props.progressState?.bulkOperationStatus)) {
    return translate("Waiting for Shopify to generate product export");
  }
  if (!mdmLogId.value) return translate("Waiting for HotWax to import the Shopify export file.");
  if (props.reconcileAvailable || props.currentSyncRun?.completed) return translate("Product sync request completed.");
  return translate("HotWax is processing the exported Shopify product file.");
});

function formatCount(value: number) {
  return new Intl.NumberFormat().format(value);
}

function isCompleteStatus(status = "") {
  return ["completed", "finished", "success", "complete"].includes(String(status).toLowerCase());
}
</script>

<style scoped>

.setup-wizard {
  display: grid;
  grid-template-areas: "tracker step";
}

.setup-tracker {
  grid-area: tracker;
  max-width: 60ch;
}

.step {
  grid-area: step;
  max-width: 75ch;
  justify-self: center;
}

</style>
