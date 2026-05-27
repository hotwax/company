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
            <ion-label slot="end">{{ selectedProductStoreName }}</ion-label>
          </ion-item>
          <ion-item>
            <ion-label>{{ translate("Internal name mapping") }}</ion-label>
            <ion-label slot="end">{{ selectedIdentifierLabel }}</ion-label>
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
          <ion-label slot="end">{{ selectedProductStoreName }}</ion-label>
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
            <ion-radio label-placement="end" justify="start" slot="start" :value="productStore.productStoreId"> 
              <ion-label>
                {{ getProductStoreName(productStore) }}
                <p>{{ productStore.productStoreId }}</p>
                <p>{{ getConnectedShopLabel(productStore.productStoreId) }}</p>
              </ion-label>
            </ion-radio>
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
          <ion-label slot="end">{{ selectedIdentifierLabel }}</ion-label>
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
        <ion-button expand="block" fill="clear" @click="$emit('go-back')">{{ translate("Back") }}</ion-button>
        <ion-button expand="block" :disabled="nextDisabled || isSaving" @click="$emit('go-next')"
          data-testid="identifier-next">
          {{ translate("Next") }}
        </ion-button>
      </ion-card-content>
    </ion-card>


    <ion-item lines="none" class="circuit" button :disabled="!reviewReady" @click="$emit('open-mistake-modal')" v-if="currentStep === 'review'"
      data-testid="mistake-check">
      <ion-label>
        <ion-icon slot="start" :icon="chipOutline" />
        {{ translate("Am I making a mistake?") }}
      </ion-label>
    </ion-item>

    <div class="step review" v-if="currentStep === 'review'">
      <ion-item lines="none" class="section-header">
        <ion-icon slot="start" :icon="pulseOutline" />
        <ion-label>
          {{ translate("Live Shopify stats") }}
          <p>{{ translate("Connected to your Shopify store to fetch statistics") }}</p>
        </ion-label>
      </ion-item>

      <ion-card>
        <ion-card-content>
          <p class="big-number">
            <AnimatedNumber v-if="reviewStats.shopifyProductCount !== undefined && reviewStats.shopifyProductCount !== null" :value="Number(reviewStats.shopifyProductCount)" />
            <template v-else>{{ formatCount(reviewStats.shopifyProductCount) }}</template>
          </p>
        </ion-card-content>
        <ion-item lines="none">
          <ion-label>
            {{ translate("Products") }}
          </ion-label>
        </ion-item>
      </ion-card>
      <ion-card>
        <ion-card-content>
          <p class="big-number">
            <AnimatedNumber v-if="reviewStats.shopifyVariantCount !== undefined && reviewStats.shopifyVariantCount !== null" :value="Number(reviewStats.shopifyVariantCount)" />
            <template v-else>{{ formatCount(reviewStats.shopifyVariantCount) }}</template>
          </p>
        </ion-card-content>
        <ion-item lines="none">
          <ion-label>
            {{ translate("Variants") }}
          </ion-label>
        </ion-item>
      </ion-card>
      
      <ion-item lines="none" class="section-header">
        <ion-icon slot="start" :icon="shirtOutline" />
        <ion-label>
          {{ selectedProductStoreName }}
          <p>{{ translate("Products already in HotWax and connected to this product store") }}</p>
        </ion-label>
      </ion-item>

      <ion-card>
        <ion-card-content>
          <p class="big-number">
            <AnimatedNumber v-if="reviewStats.omsProductCount !== undefined && reviewStats.omsProductCount !== null" :value="Number(reviewStats.omsProductCount)" />
            <template v-else>{{ formatCount(reviewStats.omsProductCount) }}</template>
          </p>
        </ion-card-content>
        <ion-item lines="none">
          <ion-label>
            {{ translate("Products") }}
          </ion-label>
        </ion-item>
      </ion-card>
      <ion-card>
        <ion-card-content>
          <p class="big-number">
            <AnimatedNumber v-if="reviewStats.omsVariantCount !== undefined && reviewStats.omsVariantCount !== null" :value="Number(reviewStats.omsVariantCount)" />
            <template v-else>{{ formatCount(reviewStats.omsVariantCount) }}</template>
          </p>
        </ion-card-content>
        <ion-item lines="none">
          <ion-label>
            {{ translate("Variants") }}
          </ion-label>
        </ion-item>
      </ion-card>
      <ion-card>
        <ion-card-content>
          <p class="big-number">
            <AnimatedNumber v-if="reviewStats.linkedShopCount !== undefined && reviewStats.linkedShopCount !== null" :value="Number(reviewStats.linkedShopCount)" />
            <template v-else>{{ formatCount(reviewStats.linkedShopCount) }}</template>
          </p>
        </ion-card-content>
        <ion-item lines="none">
          <ion-label>
            {{ translate("Linked Shopify stores") }}
          </ion-label>
        </ion-item>
      </ion-card>

      <ion-card class="review-details">
        <ion-card-header>
          <ion-card-title>{{ translate("Review product import") }}</ion-card-title>
          <ion-card-subtitle>{{ translate("Compare Shopify and HotWax catalog state before starting the first import.")
            }}</ion-card-subtitle>
        </ion-card-header>
        <ion-list lines="full">
          <ion-item>
            <ion-label>
              {{ translate("Shopify API access") }}
              <p>{{ shopifyAccessDetail }}</p>
            </ion-label>
            <ion-badge slot="end" :color="shopifyAccessBadgeColor">{{ shopifyAccessLabel }}</ion-badge>
          </ion-item>
        </ion-list>
        <ion-card-content v-if="isReviewLoading">
          <ion-spinner name="crescent" />
        </ion-card-content>
        <div v-else></div>
        <ion-card-content>
          <ion-item v-if="shopifyAccessBlockingMessage" lines="none">
            <ion-label>
              <p>{{ shopifyAccessBlockingMessage }}</p>
            </ion-label>
          </ion-item>
          <ion-button expand="block" fill="clear" @click="$emit('go-back')">{{ translate("Back") }}</ion-button>
          <ion-button expand="block" :disabled="!reviewReady || !!shopifyAccessBlockingMessage" @click="$emit('open-start-sync-modal')"
            data-testid="run-product-import">
            {{ translate("Run product import") }}
          </ion-button>
        </ion-card-content>
      </ion-card>
    </div>

    <template v-if="currentStep === 'progress'">
      <ion-card v-if="shopifyAccessBlockingMessage">
        <ion-card-header>
          <ion-card-title>{{ translate("Product sync could not start") }}</ion-card-title>
          <ion-card-subtitle>{{ translate("Shopify write access is required for bulk query creation.") }}</ion-card-subtitle>
        </ion-card-header>
        <ion-list lines="full">
          <ion-item v-if="systemMessageErrorMessage">
            <ion-label>
              {{ translate("System message error") }}
              <p>{{ systemMessageErrorMessage }}</p>
            </ion-label>
          </ion-item>
          <ion-item>
            <ion-label>
              {{ translate("Shopify API access") }}
              <p>{{ shopifyAccessDetail }}</p>
            </ion-label>
            <ion-badge slot="end" :color="shopifyAccessBadgeColor">{{ shopifyAccessLabel }}</ion-badge>
          </ion-item>
          <ion-item lines="none">
            <ion-label>
              {{ translate("Next action") }}
              <p>{{ translate("Reconnect Shopify with write access, then restart the first product sync.") }}</p>
            </ion-label>
          </ion-item>
        </ion-list>
      </ion-card>

      <div v-else class="bulk-steps">
        <!-- Export message -->
        <ion-card class="message">
          <ion-item lines="none">
            <ion-icon slot="start" :icon="systemMessageStatusIcon" />
            <ion-label>
              {{ translate("Product export request payload") }}
              <p>{{ translate("Using Shopify’s bulk query API to export all products in the catalog.") }}</p>
              <p>{{ translate("System message id") }}: {{ systemMessageId }}</p>
              <p v-if="systemMessageCreatedTime">{{ translate("Created") }}: {{ systemMessageCreatedTime }}</p>
            </ion-label>
            <ion-badge slot="end" :color="systemMessageStatusColor">{{ systemMessageStatusLabel }}</ion-badge>
          </ion-item>
          <ion-item lines="none" v-if="systemMessageFsmState.nextJob || systemMessageFsmState.primaryAction || systemMessageFsmState.secondaryActions.length">
            <ion-label>
              <p>{{ translate("Next step") }}</p>
              <p>{{ systemMessageFsmState.nextJobReason }}</p>
              <p v-if="systemMessageFsmState.nextJob">
                {{ systemMessageFsmState.nextJob.label }} · {{ systemMessageFsmState.nextJob.nextRunLabel }}
              </p>
            </ion-label>
            <ion-buttons slot="end">
              <ion-button
                v-if="systemMessageFsmState.primaryAction"
                fill="clear"
                :disabled="!!systemMessageActionLoadingId"
                @click="$emit('run-system-message-action', systemMessageFsmState.primaryAction.id)"
              >
                <ion-spinner v-if="systemMessageActionLoadingId === systemMessageFsmState.primaryAction.id" slot="start" name="crescent" />
                <span v-else>{{ systemMessageFsmState.primaryAction.label }}</span>
              </ion-button>
              <ion-button
                v-for="action in systemMessageFsmState.secondaryActions"
                :key="action.id"
                fill="clear"
                color="medium"
                :disabled="!!systemMessageActionLoadingId"
                @click="$emit('run-system-message-action', action.id)"
              >
                <ion-spinner v-if="systemMessageActionLoadingId === action.id" slot="start" name="crescent" />
                <span v-else>{{ action.label }}</span>
              </ion-button>
            </ion-buttons>
          </ion-item>
          <ion-item lines="none" v-if="systemMessageErrorMessage">
            <ion-label>
              <p>{{ translate("System message error") }}</p>
              <p>{{ systemMessageErrorMessage }}</p>
            </ion-label>
          </ion-item>
        </ion-card>

        <!-- Shopify bulk operation -->
        <ion-card class="export">
          <ion-item lines="none">
            <ion-icon slot="start" :icon="bulkOperationStatusIcon" />
            <ion-label>
              {{ translate("Pending bulk operations") }}
              <p>{{ translate("Shopify might take some time to process bulk operation requests.") }}</p>
              <p v-if="currentSyncRun?.bulkOperation?.createdAt">
                {{ translate("Duration") }}: 
                <AnimatedDuration 
                  :start-time="currentSyncRun.bulkOperation.createdAt" 
                  :end-time="currentSyncRun.bulkOperation.completedAt" 
                />
              </p>
              <p v-if="!bulkOperationProgress.hasTotalCount">
                {{ translate("{count} objects processed", { count: "" }) }}
                <AnimatedNumber :value="bulkOperationProgress.processedCount" />
              </p>
              <p v-else>
                {{ translate("{processed} objects processed / {total} products requested", { processed: "", total: "" }) }}
                <AnimatedNumber :value="bulkOperationProgress.processedCount" /> / <AnimatedNumber :value="bulkOperationProgress.totalCount" />
              </p>
              <p v-if="bulkOperationId">{{ translate("Bulk operation id") }}: {{ bulkOperationId }}</p>
            </ion-label>
            <ion-badge :color="bulkOperationStatusColor" slot="end">{{ bulkOperationStatusLabel }}</ion-badge>
          </ion-item>
          <ion-progress-bar :value="bulkOperationProgressValue"></ion-progress-bar>

          <!-- GraphQL Query Debugging -->
          <ion-accordion-group v-if="currentSyncRun?.bulkOperation?.query">
            <ion-accordion value="query">
              <ion-item slot="header">
                <ion-label>{{ translate("View GraphQL query") }}</ion-label>
              </ion-item>
              <ion-item slot="content" lines="none">
                <ion-textarea :value="currentSyncRun.bulkOperation.query" readonly auto-grow />
              </ion-item>
            </ion-accordion>
          </ion-accordion-group>
        </ion-card>

        <!-- HotWax bulk import -->
        <ion-card class="import">
          <ion-item lines="none">
            <ion-icon slot="start" :icon="mdmLogStatusIcon" />
            <ion-label>
              {{ translate("Bulk file process") }}
              <p>{{ bulkFileProcessDescription }}</p>
              <p v-if="mdmLogHasFailedRecords" class="ion-color-danger">{{ mdmLogFailedRecordsLabel }}</p>
              <p v-else-if="mdmLogProgressLabel">{{ mdmLogProgressLabel }}</p>
              <p v-if="mdmLogId">{{ translate("Data manager log id") }}: {{ mdmLogId }}</p>
            </ion-label>
            <ion-badge slot="end" :color="mdmLogBadgeColor">{{ mdmLogBadgeLabel }}</ion-badge>
          </ion-item>
        </ion-card>

        <ion-item v-if="isProgressComplete" lines="none">
          <ion-label>
            {{ translate("Next step") }}
            <p>{{ setupCompletionMessage }}</p>
          </ion-label>
          <ion-button slot="end" :disabled="setupCompletionActionDisabled || isCompletingSetup" @click="$emit('complete-setup')">
            <ion-spinner v-if="isCompletingSetup" slot="start" name="crescent" />
            <span v-else>{{ setupCompletionActionLabel }}</span>
            <ion-icon slot="end" :icon="arrowForwardOutline"></ion-icon>
          </ion-button>
        </ion-item>
      </div>
    </template>

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
        <ion-card v-if="isPreflightLoading">
          <ion-card-header>
            <ion-card-title>{{ translate("Reviewing Shopify catalog") }}</ion-card-title>
            <ion-card-subtitle>{{ translate("Checking for potential data conflicts and mismatches.") }}</ion-card-subtitle>
          </ion-card-header>
          <ion-card-content class="ion-text-center">
            <ion-spinner name="crescent" />
            <p>{{ translate("This might take a moment...") }}</p>
          </ion-card-content>
        </ion-card>

        <ion-item lines="none" v-else>
          <ion-label>
            <h1>{{ preflightTitle }}</h1>
            <p>{{ preflightSubtitle }}</p>
          </ion-label>
        </ion-item>
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
          <ion-checkbox :checked="preflightWarningConfirmed" label-placement="start"
            data-testid="preflight-warning-confirmation">
            {{ translate("I reviewed the warning and want to continue.") }}
          </ion-checkbox>
        </ion-item>
        <div class="ion-padding" v-if="preflightRequiresConfirmation">
          <ion-button expand="block" :disabled="!preflightWarningConfirmed"
            @click="$emit('accept-preflight-and-open-start-sync')" data-testid="accept-preflight-warning">
            {{ translate("Continue to import") }}
          </ion-button>
        </div>
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
          <ion-list v-if="!isSyncJobConfigLoaded">
            <ion-item lines="none">
              <ion-spinner name="crescent" slot="start" />
              <ion-label>{{ translate("Checking job status...") }}</ion-label>
            </ion-item>
          </ion-list>
          <ion-list v-else-if="syncJobObj">
            <ion-item lines="none">
              <ion-label>
                <p>{{ translate("Job name") }}</p>
                {{ syncJobObj.jobName }}
              </ion-label>
            </ion-item>
            <ion-item v-if="shopIdParameter" lines="none">
              <ion-label>
                <p>{{ translate("Shop ID") }}</p>
                {{ shopIdParameter.parameterValue }}
              </ion-label>
            </ion-item>
            <ion-item lines="none">
              <ion-label>
                <p>{{ translate("Most recent change") }}</p>
                {{ latestSyncJobAuditLabel }}
              </ion-label>
            </ion-item>
          </ion-list>
          <div v-else>
            <ion-item lines="none">
              <ion-label color="warning" class="ion-text-wrap">{{ translate("Product sync job not found for this shop.") }}</ion-label>
            </ion-item>
            <ion-button fill="outline" expand="block" :disabled="isSyncJobConfiguring" @click="emit('configure-sync-job')">
              <ion-spinner v-if="isSyncJobConfiguring" slot="start" name="crescent" />
              {{ translate("Setup Job") }}
            </ion-button>
          </div>
        </ion-card>

        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ translate("First product sync cannot be cancelled") }}</ion-card-title>
            <ion-card-subtitle>{{ translate("Incorrect Shopify store to Product Store mapping can corrupt catalog state.") }}</ion-card-subtitle>
          </ion-card-header>
          <ion-list lines="full">
            <ion-item>
              <ion-label>
                {{ translate("Shopify API access") }}
                <p>{{ shopifyAccessDetail }}</p>
              </ion-label>
              <ion-badge slot="end" :color="shopifyAccessBadgeColor">{{ shopifyAccessLabel }}</ion-badge>
            </ion-item>
          </ion-list>
          <ion-item lines="full" button @click="$emit('toggle-start-confirmation')">
            <ion-checkbox :checked="draft.startConfirmed" label-placement="start" data-testid="start-sync-confirmation">
              {{ translate("I understand and want to start the first product sync.") }}
            </ion-checkbox>
          </ion-item>
          <ion-card-content>
            <ion-item v-if="shopifyAccessBlockingMessage" lines="none">
              <ion-label>
                <p>{{ shopifyAccessBlockingMessage }}</p>
              </ion-label>
            </ion-item>
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
import AnimatedNumber from "@/components/AnimatedNumber.vue";
import AnimatedDuration from "@/components/AnimatedDuration.vue";
import type { ShopifyProductSyncRun } from "@/services/ShopifyProductSyncService";
import type { ProductSyncFsmState } from "@/utils/shopifyProductSyncFsm";
import {
  IonAccordion,
  IonAccordionGroup,
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
  IonTextarea,
  IonTitle,
  IonToolbar
} from "@ionic/vue";
import {
  arrowForwardOutline,
  closeOutline,
  pulseOutline,
  checkmarkCircleOutline,
  shirtOutline,
  timeOutline,
  alertCircleOutline
} from "ionicons/icons";
import { translate } from "@/i18n";
import { computed, defineEmits, defineProps } from "vue";
import { formatDateTime } from "@/utils";
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
  isPreflightLoading: boolean
  isReviewLoading: boolean
  isSaving: boolean
  isCompletingSetup: boolean
  nextDisabled: boolean
  preflightRequiresConfirmation: boolean
  preflightResult: any
  preflightSubtitle: string
  preflightTitle: string
  preflightWarningConfirmed: boolean
  productStoreLocked: boolean
  productStores: any[]
  progressBadgeColor: string
  progressState: any
  progressStatus: string
  currentSyncRun?: ShopifyProductSyncRun
  systemMessageFsmState: ProductSyncFsmState
  systemMessageActionLoadingId?: string
  isProgressComplete: boolean
  recommendedIdentifierEnumId: string
  relatedShops: any[]
  reviewReady: boolean
  reviewStats: any
  setupCompletionActionDisabled: boolean
  setupCompletionActionLabel: string
  setupCompletionMessage: string
  selectedIdentifierLabel: string
  selectedProductStoreName: string
  sendUpdateRequestLastRunLabel: string
  importCompletedRequestsLastRunLabel: string
  shopifyAccessBadgeColor: string
  shopifyAccessBlockingMessage: string
  shopifyAccessDetail: string
  shopifyAccessLabel: string
  shopId: string
  showMistakeModal: boolean
  showStartSyncModal: boolean
  startSyncDisabled: boolean
  isSyncJobConfigLoaded: boolean
  isSyncJobConfiguring: boolean
  syncJobConfigured: boolean
  syncJobObj: any
  latestSyncJobAuditLabel: string
}>();

const emit = defineEmits([
  "accept-preflight-and-open-start-sync",
  "close-mistake-modal",
  "close-start-sync-modal",
  "complete-setup",
  "configure-sync-job",
  "go-back",
  "go-next",
  "identifier-change",
  "load-progress",
  "open-mistake-modal",
  "open-start-sync-modal",
  "open-step-details",
  "product-store-change",
  "run-system-message-action",
  "start-product-sync",
  "toggle-preflight-warning-confirmation",
  "toggle-product-store-verification",
  "toggle-start-confirmation",
]);

function getPreflightBadgeColor(status: string) {
  switch (status) {
    case "Matched": return "success";
    case "Conflict": return "danger";
    case "Not found":
    case "Not found in HotWax":
    case "Not found in Shopify":
      return "warning";
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

const systemMessageCreatedTime = computed(() => {
  const systemMessage = props.currentSyncRun?.systemMessage || {};
  const date = systemMessage.initDate || systemMessage.createdDate || systemMessage.lastUpdatedStamp;
  return formatDateTime(date);
});

const shopIdParameter = computed(() => {
  return (props.syncJobObj?.serviceJobParameters || []).find((param: any) => param.parameterName === "shopId");
});

const systemMessageStatusLabel = computed(() => {
  return props.currentSyncRun?.systemMessage?.statusLabel || props.progressState?.systemMessageState || translate("Pending");
});

const systemMessageStatusColor = computed(() => {
  return props.currentSyncRun?.systemMessage?.statusColor || props.progressBadgeColor || "medium";
});
const systemMessageErrorMessage = computed(() => {
  const systemMessage = props.currentSyncRun?.systemMessage || {};
  return String(systemMessage.errorText || "").trim();
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

const bulkOperationProgressValue = computed(() => {
  const status = (props.currentSyncRun?.bulkOperation?.status || props.progressState?.bulkOperationStatus || "").toLowerCase();
  if (status === "complete" || status === "completed") return 1;
  return bulkOperationProgress.value.value;
});

const mdmLogId = computed(() => {
  return props.currentSyncRun?.mdmLog?.id || "";
});

const mdmLogFailedRecordCount = computed(() => {
  return Number(props.currentSyncRun?.mdmLog?.failedRecordCount || 0);
});

const mdmLogTotalRecordCount = computed(() => {
  return Number(props.currentSyncRun?.mdmLog?.totalRecordCount || 0);
});

const mdmLogHasFailedRecords = computed(() => {
  return mdmLogFailedRecordCount.value > 0;
});

const mdmLogFailedRecordsLabel = computed(() => {
  if (!mdmLogHasFailedRecords.value) return "";

  if (mdmLogTotalRecordCount.value > 0) {
    return `${formatCount(mdmLogFailedRecordCount.value)} ${translate("failed of")} ${formatCount(mdmLogTotalRecordCount.value)} ${translate("records processed")}`;
  }

  return `${formatCount(mdmLogFailedRecordCount.value)} ${translate("failed records")}`;
});

const mdmLogProgressLabel = computed(() => {
  if (mdmLogTotalRecordCount.value > 0) {
    return `${formatCount(mdmLogTotalRecordCount.value)} ${translate("records processed")}`;
  }
  return "";
});

const mdmLogBadgeColor = computed(() => {
  if (mdmLogHasFailedRecords.value) return "danger";
  return props.currentSyncRun?.mdmLog?.statusColor || "medium";
});

const mdmLogBadgeLabel = computed(() => {
  if (mdmLogHasFailedRecords.value) return translate("Errors");
  return props.currentSyncRun?.mdmLog?.statusLabel || translate("Pending");
});

const bulkFileProcessDescription = computed(() => {
  if (!bulkOperationId.value) return translate("Waiting for Shopify to accept the product export request.");
  if (!isCompleteStatus(props.currentSyncRun?.bulkOperation?.status || props.progressState?.bulkOperationStatus)) {
    return translate("Waiting for Shopify to generate product export");
  }
  if (!mdmLogId.value) return translate("Waiting for HotWax to import the Shopify export file.");
  if (props.isProgressComplete || props.currentSyncRun?.completed) return translate("Product sync request completed.");
  return translate("HotWax is processing the exported Shopify product file.");
});

function formatCount(value: number) {
  return new Intl.NumberFormat().format(value);
}

function isCompleteStatus(status = "") {
  return ["completed", "finished", "success", "complete"].includes(String(status).toLowerCase());
}

function getStatusIcon(color: string) {
  switch (color) {
    case 'success': return checkmarkCircleOutline;
    case 'primary': return pulseOutline;
    case 'danger': return alertCircleOutline;
    default: return timeOutline;
  }
}

const systemMessageStatusIcon = computed(() => getStatusIcon(systemMessageStatusColor.value));
const bulkOperationStatusIcon = computed(() => getStatusIcon(bulkOperationStatusColor.value));
const mdmLogStatusIcon = computed(() => getStatusIcon(mdmLogBadgeColor.value));
</script>

<style scoped>

.setup-wizard {
  display: grid;
  grid-template-areas: "tracker step";
  grid-template-columns: 1fr 2fr;
  grid-template-rows: min-content 1fr;
  grid-column-gap: var(--spacer-base);
  align-items: start;
}

.setup-tracker {
  grid-area: tracker;
  max-width: 60ch;
}

.step {
  grid-area: step;
  max-width: 75ch;
  justify-self: center;
  width: 100%;
}

.bulk-steps {
  grid-column: 2;
}

.bulk-steps ion-card {
  border: 1px solid var(--ion-color-medium);
  --background: transparent;
  border-radius: 8px;
  box-shadow: none;
}

.bulk-steps ion-item {
  --background: transparent;
}

.big-number {
  font-size: clamp(32px, 25cqw, 78px);
  line-height: 1.2;
  margin: 0;
  color: rgba(var(--ion-text-color));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: clip;
}

.step.review {
  grid-area: step;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-row: span 2;
  gap: var(--spacer-base);
  align-items: start;
  justify-self: stretch;
  max-width: none;
  width: 100%;
}

.section-header {
  grid-column: 1 / -1;
  --padding-start: 0;
  margin-top: var(--spacer-base);
}

.step.review ion-card {
  container-type: inline-size;
  margin: 0;
  height: 100%;
}

.review-details {
  grid-column: 1 / -1;
  margin: 0;
}

.circuit {
  grid-column: 1;
  grid-row: 2;
  border: 1px solid var(--ion-color-medium);
  --background: transparent;
  border-radius: 8px;
}

.query-debug {
  background: var(--ion-color-light);
  padding: 10px;
  border-radius: 4px;
  overflow-x: auto;
  font-size: 12px;
  color: var(--ion-color-dark);
}
</style>
