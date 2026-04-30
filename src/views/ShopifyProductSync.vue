<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button :default-href="'/shopify-connection-details/' + id" />
        </ion-buttons>
        <ion-title>{{ translate("Product sync") }}</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="showModeModal = true" data-testid="product-sync-mode-button">{{ translate("Mode") }}</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-card v-if="isLoading">
        <ion-card-header>
          <ion-card-title>{{ translate("Loading product sync") }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-spinner name="crescent" />
        </ion-card-content>
      </ion-card>

      <ion-card v-else-if="loadErrorMessage">
        <ion-card-header>
          <ion-card-title>{{ translate("Product sync could not load") }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <p>{{ loadErrorMessage }}</p>
          <ion-button fill="outline" @click="loadWizard">{{ translate("Retry") }}</ion-button>
        </ion-card-content>
      </ion-card>

      <template v-else>
        <shopify-product-sync-returning-view
          v-if="activeExperienceMode === 'returning'"
          :is-sync-scheduled="isSyncScheduled"
          :is-sync-paused="isSyncJobPaused"
          :last-sync-label="lastSyncLabel"
          :last-sync-relative-label="lastSyncRelativeLabel"
          :next-sync-label="nextSyncLabel"
          :next-sync-relative-label="nextSyncRelativeLabel"
          :system-message-send-job-next-run-label="systemMessageSendJobNextRunLabel"
          :bulk-operation-poll-job-next-run-label="bulkOperationPollJobNextRunLabel"
          :current-sync-run="currentSyncRun"
          :recent-sync-errors="recentSyncErrors"
          :recent-sync-updates="recentSyncUpdates"
          :selected-product-store-name="selectedProductStoreName"
          :summary-subtitle="syncSummarySubtitle"
          :error-lookback-count="PRODUCT_SYNC_ERROR_LOG_LIMIT"
          :unsynced-updates-count="unsyncedUpdatesCountLabel"
          :pending-update-requests-count="pendingUpdateRequestsCount"
          :pending-update-requests-subtitle="pendingUpdateRequestsSubtitle"
          :queue-update-requests-last-run-label="syncJobLastRunLabel"
          :send-update-request-last-run-label="bulkOperationSendJobLastRunLabel"
          :send-update-request-paused="isBulkOperationSendJobPaused"
          :send-update-request-job-obj="bulkOperationSendJob"
          :import-completed-requests-last-run-label="bulkOperationPollJobLastRunLabel"
          :import-completed-requests-paused="isBulkOperationPollJobPaused"
          :import-completed-requests-job-obj="bulkOperationPollJob"
          :current-shopify-request-subtitle="currentShopifyRequestSubtitle"
          :current-shopify-request-status-label="currentShopifyRequestStatusLabel"
          :current-shopify-request-status-color="currentShopifyRequestStatusColor"
          :has-current-shopify-request="hasRunningShopifyBulkOperation"
          :sync-job-obj="syncJobObj"
          @open-history="openHistory"
          @open-sync-job-details="openSyncJobDetailsModal"
          @schedule-sync="scheduleSyncJob"
          @toggle-pause-sync-job="togglePauseSyncJob"
          @open-unsynced-updates="openUnsyncedUpdatesModal"
          @open-step-details="openStepDetails"
          @run-job="runSyncJob"
        />

        <shopify-product-sync-wizard-view
          v-else
          :current-step="currentStep"
          :draft="draft"
          :get-connected-shop-label="getConnectedShopLabel"
          :get-product-store-name="getProductStoreName"
          :has-related-shops="hasRelatedShops"
          :identifier-locked="identifierLocked"
          :identifier-options="identifierOptions"
          :import-status-badge-color="importStatusBadgeColor"
          :import-status-label="importStatusLabel"
          :is-review-loading="isReviewLoading"
          :is-saving="isSaving"
          :next-disabled="nextDisabled"
          :preflight-requires-confirmation="preflightRequiresConfirmation"
          :preflight-result="preflightResult"
          :preflight-subtitle="preflightSubtitle"
          :preflight-title="preflightTitle"
          :preflight-warning-confirmed="preflightWarningConfirmed"
          :product-store-locked="productStoreLocked"
          :product-stores="productStores"
          :product-type-mappings="productTypeMappings"
          :product-type-mappings-label="productTypeMappingsLabel"
          :progress-badge-color="progressBadgeColor"
          :progress-state="progressState"
          :progress-status="progressStatus"
          :system-message-send-job-next-run-label="systemMessageSendJobNextRunLabel"
          :bulk-operation-poll-job-next-run-label="bulkOperationPollJobNextRunLabel"
          :current-sync-run="currentSyncRun"
          :reconcile-available="reconcileAvailable"
          :recommended-identifier-enum-id="recommendedIdentifierEnumId"
          :related-shops="relatedShops"
          :review-ready="reviewReady"
          :review-stats="reviewStats"
          :selected-identifier-label="selectedIdentifierLabel"
          :selected-product-store-name="selectedProductStoreName"
          :shop-id="id"
          :show-mistake-modal="showMistakeModal"
          :show-start-sync-modal="showStartSyncModal"
          :start-sync-disabled="startSyncDisabled"
          :is-sync-job-config-loaded="isSyncJobConfigLoaded"
          :is-sync-job-configuring="isSyncJobConfiguring"
          :sync-job-configured="syncJobConfigured"
          @accept-preflight-and-open-start-sync="acceptPreflightAndOpenStartSync"
          @close-mistake-modal="showMistakeModal = false"
          @close-start-sync-modal="showStartSyncModal = false"
          @configure-sync-job="configureSyncJob"
          @go-back="goBack"
          @go-next="goNext"
          @identifier-change="handleIdentifierChange"
          @load-progress="loadProgress"
          @open-mistake-modal="openMistakeModal"
          @open-start-sync-modal="openStartSyncModal"
          @product-store-change="handleProductStoreChange"
          @start-product-sync="startProductSync"
          @toggle-preflight-warning-confirmation="togglePreflightWarningConfirmation"
          @toggle-product-store-verification="toggleProductStoreVerification"
          @toggle-start-confirmation="toggleStartConfirmation"
          @open-step-details="openStepDetails"
        />

        <ion-modal :is-open="showModeModal" :backdrop-dismiss="false" @didDismiss="showModeModal = false">
          <ion-header>
            <ion-toolbar>
              <ion-buttons slot="start">
                <ion-button @click="showModeModal = false" :aria-label="translate('Close')">
                  <ion-icon slot="icon-only" :icon="closeOutline" />
                </ion-button>
              </ion-buttons>
              <ion-title>{{ translate("Product sync mode") }}</ion-title>
            </ion-toolbar>
          </ion-header>
          <ion-content>
            <ion-card>
              <ion-card-header>
                <ion-card-title>{{ translate("Product sync mode") }}</ion-card-title>
              </ion-card-header>
              <ion-list lines="full">
                <ion-item>
                  <ion-segment :value="experienceMode" @ionChange="handleExperienceModeChange($event.detail.value)" data-testid="product-sync-mode">
                    <ion-segment-button value="first-time">
                      <ion-label>{{ translate("First-time setup") }}</ion-label>
                    </ion-segment-button>
                    <ion-segment-button value="returning">
                      <ion-label>{{ translate("Returning user") }}</ion-label>
                    </ion-segment-button>
                    <ion-segment-button value="auto">
                      <ion-label>{{ translate("Auto") }}</ion-label>
                    </ion-segment-button>
                  </ion-segment>
                </ion-item>
                <ion-item>
                  <ion-label>{{ translate("Shopify shop products") }}</ion-label>
                  <ion-note slot="end">{{ shopifyShopProductCount }}</ion-note>
                </ion-item>
                <ion-item>
                  <ion-label>{{ translate("Active view") }}</ion-label>
                  <ion-badge slot="end" :color="activeExperienceMode === 'returning' ? 'primary' : 'medium'">{{ activeExperienceModeLabel }}</ion-badge>
                </ion-item>
              </ion-list>
            </ion-card>
          </ion-content>
        </ion-modal>

        <ion-modal :is-open="showUnsyncedUpdatesModal" :backdrop-dismiss="false" @didDismiss="showUnsyncedUpdatesModal = false">
          <ion-header>
            <ion-toolbar>
              <ion-buttons slot="start">
                <ion-button @click="showUnsyncedUpdatesModal = false" :aria-label="translate('Close')">
                  <ion-icon slot="icon-only" :icon="closeOutline" />
                </ion-button>
              </ion-buttons>
              <ion-title>{{ translate("Un-synced Shopify updates") }}</ion-title>
              <ion-buttons slot="end">
                <ion-button @click="loadUnsyncedProductUpdates" :disabled="isUnsyncedUpdatesLoading" :aria-label="translate('Refresh')">
                  <ion-icon slot="icon-only" :icon="refreshOutline" />
                </ion-button>
              </ion-buttons>
            </ion-toolbar>
          </ion-header>
          <ion-content>
            <ion-card v-if="isUnsyncedUpdatesLoading">
              <ion-card-content>
                <ion-spinner name="crescent" />
              </ion-card-content>
            </ion-card>
              <ion-list v-else lines="full">
              <ion-item v-if="shopifyShopProductCount > 100">
                <ion-label>{{ translate("Showing the first 100 updated products.") }}</ion-label>
                <ion-note slot="end">{{ translate("100+") }}</ion-note>
              </ion-item>
              <ion-item v-for="product in unsyncedProductUpdates" :key="product.id">
                <ion-thumbnail v-if="product.imageUrl" slot="start">
                  <ion-img :src="product.imageUrl" :alt="product.imageAltText || product.title" />
                </ion-thumbnail>
                <ion-label>
                  {{ product.title }}
                  <p>{{ product.handle }}</p>
                  <p>{{ product.vendor || translate("No vendor") }} · {{ product.productType || translate("No type") }}</p>
                  <p>{{ translate("Updated") }} {{ formatShopifyDate(product.updatedAt) }}</p>
                </ion-label>
                <ion-note slot="end">
                  {{ product.variantsCount }} {{ translate("variants") }}
                  <p>{{ product.status }}</p>
                  <p>{{ translate("Inventory") }} {{ product.totalInventory ?? 0 }}</p>
                </ion-note>
              </ion-item>
              <ion-item v-if="!unsyncedProductUpdates.length">
                <ion-label>{{ translate("No un-synced product updates") }}</ion-label>
              </ion-item>
            </ion-list>
          </ion-content>
        </ion-modal>

        <ion-modal :is-open="showSyncJobDetailsModal" :backdrop-dismiss="false" :can-dismiss="canDismissSyncJobDetailsModal" @didDismiss="handleSyncJobDetailsDidDismiss">
          <ion-header>
            <ion-toolbar>
              <ion-buttons slot="start">
                <ion-button @click="requestCloseSyncJobDetailsModal" :aria-label="translate('Close')">
                  <ion-icon slot="icon-only" :icon="closeOutline" />
                </ion-button>
              </ion-buttons>
              <ion-title>{{ syncJobDetailsTitle }}</ion-title>
              <ion-buttons slot="end">
                <ion-button @click="requestRefreshSyncJobDetails" :disabled="isSyncJobDetailsLoading || isSyncJobDetailsSaving || !selectedSyncJobDetailsJob?.jobName" :aria-label="translate('Refresh')">
                  <ion-icon slot="icon-only" :icon="refreshOutline" />
                </ion-button>
              </ion-buttons>
            </ion-toolbar>
          </ion-header>
          <ion-content>
            <ion-list v-if="isSyncJobDetailsLoading" lines="none">
              <ion-item>
                <ion-spinner name="crescent" />
              </ion-item>
            </ion-list>

            <template v-else>
              <template v-if="syncJobDetails.jobName">
                <ion-list lines="full">
                  <ion-item>
                    <ion-label>
                      {{ syncJobDetailsTitle }}
                      <p>{{ syncJobDetails.jobName }}</p>
                      <p>{{ syncJobDetails.serviceName || translate("Unavailable") }}</p>
                    </ion-label>
                  </ion-item>
                  <ion-item>
                    <ion-label>{{ translate("Status") }}</ion-label>
                    <ion-label slot="end">{{ getSyncJobStatusLabel(syncJobDetails) }}</ion-label>
                  </ion-item>
                  <ion-item>
                    <ion-label>{{ translate("Last run") }}</ion-label>
                    <ion-label slot="end">{{ syncJobDetailsLastRunLabel }}</ion-label>
                  </ion-item>
                  <ion-item>
                    <ion-label>{{ translate("Instance of product") }}</ion-label>
                    <ion-label slot="end">{{ syncJobProductLabel }}</ion-label>
                  </ion-item>
                  <ion-item>
                    <ion-label>{{ translate("Created") }}</ion-label>
                    <ion-label slot="end">{{ formatDateTime(syncJobDetails.createdDate || syncJobDetails.createdStamp) }}</ion-label>
                  </ion-item>
                  <ion-item>
                    <ion-label>{{ translate("Updated") }}</ion-label>
                    <ion-label slot="end">{{ formatDateTime(syncJobDetails.lastUpdatedStamp || syncJobDetails.lastModifiedDate) }}</ion-label>
                  </ion-item>
                </ion-list>

                <ion-accordion-group>
                  <ion-accordion value="schedule">
                    <ion-item slot="header">
                      <ion-label>
                        {{ translate("Schedule") }}
                        <p>{{ syncJobDraftScheduleDescription || translate("Not scheduled") }}</p>
                      </ion-label>
                      <ion-note slot="end">{{ syncJobDraftNextRunLabel }}</ion-note>
                    </ion-item>
                    <ion-list slot="content" lines="full">
                      <ion-item>
                        <ion-input
                          label-placement="stacked"
                          :label="translate('Quartz cron expression')"
                          v-model="syncJobDraftCronExpression"
                        />
                      </ion-item>
                      <ion-item>
                        <ion-label>
                          {{ translate("Schedule preview") }}
                          <p>{{ isSyncJobDraftScheduleValid ? syncJobDraftScheduleDescription : translate("Provide a valid cron expression") }}</p>
                        </ion-label>
                        <ion-note slot="end">{{ isSyncJobDraftScheduleValid ? syncJobDraftNextRunLabel : translate("Invalid") }}</ion-note>
                      </ion-item>
                      <ion-list-header>{{ translate("Schedule Options") }}</ion-list-header>
                      <ion-radio-group v-model="syncJobDraftCronExpression">
                        <ion-item v-for="option in syncJobScheduleOptions" :key="option.expression">
                          <ion-radio label-placement="end" justify="start" :value="option.expression">{{ translate(option.label) }}</ion-radio>
                        </ion-item>
                      </ion-radio-group>
                    </ion-list>
                  </ion-accordion>
                  <ion-accordion value="parameters">
                    <ion-item slot="header">
                      <ion-label>
                        {{ translate("Parameters") }}
                        <p>{{ translate("Job and service parameters used for this Shopify product sync.") }}</p>
                      </ion-label>
                      <ion-note slot="end">{{ syncJobParameters.length }}</ion-note>
                    </ion-item>
                    <ion-list slot="content" lines="full">
                      <ion-item v-for="parameter in syncJobParameters" :key="parameter.key">
                        <ion-label>
                          {{ parameter.label }}
                          <p>{{ parameter.source }}</p>
                        </ion-label>
                        <ion-label slot="end">{{ parameter.value }}</ion-label>
                      </ion-item>
                      <ion-item v-if="!syncJobParameters.length">
                        <ion-label>{{ translate("No parameters found") }}</ion-label>
                      </ion-item>
                    </ion-list>
                  </ion-accordion>
                  <ion-accordion value="recent-runs">
                    <ion-item slot="header">
                      <ion-label>
                        {{ translate("Recent runs") }}
                        <p>{{ translate("Last 5 executions for this service job.") }}</p>
                      </ion-label>
                      <ion-note slot="end">{{ syncJobDetailsRecentRuns.length }}</ion-note>
                    </ion-item>
                    <ion-list slot="content" lines="full">
                      <ion-item v-for="run in syncJobDetailsRecentRuns" :key="getSyncJobRunKey(run)">
                        <ion-label>
                          {{ getSyncJobRunTitle(run) }}
                          <p>{{ formatDateTime(getSyncJobRunStartedAt(run)) }}</p>
                          <p v-if="getSyncJobRunCompletedAt(run)">{{ translate("Completed") }} {{ formatDateTime(getSyncJobRunCompletedAt(run)) }}</p>
                          <p v-if="getSyncJobRunDuration(run)">{{ translate("Duration") }} {{ getSyncJobRunDuration(run) }}</p>
                          <p v-if="getSyncJobRunUser(run)">{{ translate("User") }} {{ getSyncJobRunUser(run) }}</p>
                          <p v-if="getSyncJobRunCount(run)">{{ getSyncJobRunCount(run) }}</p>
                          <p>{{ translate("Output") }}: {{ getSyncJobRunMessage(run) || translate("No output message") }}</p>
                        </ion-label>
                        <ion-badge slot="end" :color="getSyncJobRunStatusColor(run)">{{ getSyncJobRunStatus(run) }}</ion-badge>
                      </ion-item>
                      <ion-item v-if="!syncJobDetailsRecentRuns.length">
                        <ion-label>{{ translate("No recent runs found") }}</ion-label>
                      </ion-item>
                    </ion-list>
                  </ion-accordion>
                </ion-accordion-group>
              </template>

              <ion-list v-else lines="full">
                <ion-item>
                  <ion-label>
                    {{ translate("Sync job details unavailable") }}
                    <p>{{ translate("Failed to load sync job details.") }}</p>
                  </ion-label>
                </ion-item>
              </ion-list>
            </template>
            <ion-fab vertical="bottom" horizontal="end" slot="fixed">
              <ion-fab-button @click="saveSyncJobDetails" :disabled="!syncJobDetailsDirty || !isSyncJobDraftScheduleValid || isSyncJobDetailsSaving" :aria-label="translate('Save')">
                <ion-icon :icon="saveOutline" />
              </ion-fab-button>
            </ion-fab>
          </ion-content>
        </ion-modal>
        <ion-modal :is-open="showStepDetailsModal" :backdrop-dismiss="false" @didDismiss="showStepDetailsModal = false">
          <ion-header>
            <ion-toolbar>
              <ion-buttons slot="start">
                <ion-button @click="showStepDetailsModal = false" :aria-label="translate('Close')">
                  <ion-icon slot="icon-only" :icon="closeOutline" />
                </ion-button>
              </ion-buttons>
              <ion-title>{{ stepDetailsTitle }}</ion-title>
            </ion-toolbar>
          </ion-header>
          <ion-content>
            <ion-card v-if="isStepDetailsLoading">
              <ion-card-content>
                <ion-spinner name="crescent" />
              </ion-card-content>
            </ion-card>
            
            <template v-else-if="currentStepDetail">
              <!-- System Message Details -->
              <template v-if="currentStepDetail.type === 'systemMessage'">
                <ion-list lines="full">
                  <ion-item>
                    <ion-label>
                      {{ translate("Status") }}
                      <p>{{ translate("Message ID") }}: {{ currentStepDetail.id }}</p>
                    </ion-label>
                    <ion-label slot="end">{{ getStatusDescription(latestSystemMessage?.statusId) }}</ion-label>
                  </ion-item>
                  <ion-item>
                    <ion-label>
                      {{ translate("Next send time") }}
                      <p>{{ translate("The send job posts produced messages to Shopify.") }}</p>
                      <p>{{ BULK_OPERATION_SEND_JOB_NAME }}</p>
                    </ion-label>
                    <ion-label slot="end">{{ systemMessageSendJobNextRunLabel }}</ion-label>
                  </ion-item>
                  <ion-item>
                    <ion-label>
                      {{ translate("Bulk operation ID") }}
                      <p>{{ translate("Shopify returns this after it accepts the bulk operation.") }}</p>
                    </ion-label>
                    <ion-label slot="end">
                      {{ latestBulkOperationId || translate("Pending") }}
                    </ion-label>
                  </ion-item>
                </ion-list>
                <ion-accordion-group>
                  <ion-accordion v-if="latestSystemMessage?.messageText" value="system-message-text">
                    <ion-item slot="header">
                      <ion-label>{{ translate("Message Text") }}</ion-label>
                    </ion-item>
                    <ion-list slot="content" lines="full">
                      <ion-item>
                        <ion-label>
                          <p>{{ latestSystemMessage.messageText }}</p>
                        </ion-label>
                      </ion-item>
                    </ion-list>
                  </ion-accordion>
                </ion-accordion-group>
              </template>

              <!-- Bulk Operation Details -->
              <template v-if="currentStepDetail.type === 'bulkOperation'">
                <ion-list lines="full">
                  <ion-item>
                    <ion-label>
                      {{ translate("Status") }}
                      <p>{{ translate("Bulk Operation ID") }}: {{ currentStepDetail.id }}</p>
                    </ion-label>
                    <ion-label slot="end">{{ progressState.bulkOperationStatus || getStatusDescription(latestSystemMessage?.statusId) }}</ion-label>
                  </ion-item>
                  <ion-item>
                    <ion-label>
                      {{ translate("Next poll time") }}
                      <p>{{ translate("The poll job checks whether Shopify finished the bulk operation.") }}</p>
                      <p>{{ BULK_OPERATION_POLL_JOB_NAME }}</p>
                    </ion-label>
                    <ion-label slot="end">{{ bulkOperationPollJobNextRunLabel }}</ion-label>
                  </ion-item>
                </ion-list>
              </template>

              <!-- MDM Log Details -->
              <template v-if="currentStepDetail.type === 'mdmLog'">
                <ion-list lines="full">
                  <ion-item>
                    <ion-label>{{ translate("Log ID") }}</ion-label>
                    <ion-label slot="end">{{ currentMdmLog?.logId }}</ion-label>
                  </ion-item>
                  <ion-item>
                    <ion-label>{{ translate("Status") }}</ion-label>
                    <ion-label slot="end">{{ getStatusDescription(currentMdmLog?.statusId) }}</ion-label>
                  </ion-item>
                  <ion-item v-if="currentMdmLog?.totalRecordCount !== undefined">
                    <ion-label>{{ translate("Total Records") }}</ion-label>
                    <ion-label slot="end">{{ currentMdmLog.totalRecordCount }}</ion-label>
                  </ion-item>
                  <ion-item v-if="currentMdmLog?.successRecordCount !== undefined">
                    <ion-label>{{ translate("Success Records") }}</ion-label>
                    <ion-label slot="end">{{ currentMdmLog.successRecordCount }}</ion-label>
                  </ion-item>
                  <ion-item v-if="currentMdmLog?.failedRecordCount !== undefined">
                    <ion-label>{{ translate("Failed Records") }}</ion-label>
                    <ion-label slot="end">{{ currentMdmLog.failedRecordCount }}</ion-label>
                  </ion-item>
                </ion-list>
              </template>

              <!-- Summary / Complete -->
              <ion-list v-if="currentStepDetail.type === 'summary'" lines="full">
                <ion-item>
                  <ion-label>
                    <p>{{ translate("The Shopify product sync has completed for this run.") }}</p>
                  </ion-label>
                </ion-item>
              </ion-list>
            </template>
          </ion-content>
        </ion-modal>

      </template>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { CronExpressionParser } from "cron-parser";
import { DateTime } from "luxon";
import {
  IonBackButton,
  IonAccordion,
  IonAccordionGroup,
  IonBadge,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonImg,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonModal,
  IonNote,
  onIonViewWillEnter,
  IonPage,
  IonRadio,
  IonRadioGroup,
  IonSegment,
  IonSegmentButton,
  IonSpinner,
  IonThumbnail,
  IonTitle,
  IonToolbar,
  alertController
} from "@ionic/vue";
import { closeOutline, refreshOutline, saveOutline } from "ionicons/icons";
import cronstrue from "cronstrue";

import { translate } from "@/i18n";
import { computed, defineProps, onBeforeUnmount, ref, watch } from "vue";
import { useStore } from "vuex";
import { useRouter } from "vue-router";
import ShopifyProductSyncReturningView from "@/components/ShopifyProductSyncReturningView.vue";
import ShopifyProductSyncWizardView from "@/components/ShopifyProductSyncWizardView.vue";
import { ProductStoreService } from "@/services/ProductStoreService";
import { ShopifyService } from "@/services/ShopifyService";
import { ShopifyProductSyncService } from "@/services/ShopifyProductSyncService";
import {
  canAdvanceProductSyncStep,
  canShowProductSyncReconcile,
  canStartProductSync,
  createProductSyncWizardDraft,
  getReviewImportAction,
  nextProductSyncStep,
  normalizeProductSyncStatus,
  previousProductSyncStep,
  ProductSyncExperienceMode,
  ProductSyncWizardStep,
  requiresPreflightConfirmation,
  resolveProductSyncExperienceMode,
  selectProductStore,
  shouldShowProductSyncProgress
} from "@/utils/shopifyProductSyncWizard";
import { hasError, showToast } from "@/utils";
import logger from "@/logger";
import useServiceJob from "@/composables/useServiceJob";
import { useDataManagerLog } from "@/composables/useDataManagerLog";
import { useProductUpdateHistory } from "@/composables/useProductUpdateHistory";
import { useShopifyProductSyncRun } from "@/composables/useShopifyProductSyncRun";
import { getSystemMessageBulkOperationId } from "@/utils/shopifyBulkOperation";

const props = defineProps(["id"]);
const store = useStore();
const router = useRouter();
const {
  jobs,
  products,
  fetchJobs,
  fetchJobDetail,
  fetchJobRuns,
  fetchProductDetail,
  updateJob,
  runNow
} = useServiceJob();
const { fetchLogDetails, fetchMdmLogBySystemMessageId, fetchRecentLogsByConfigId, currentMdmLog, recentMdmLogs, errorLogs } = useDataManagerLog();
const { productUpdateHistories, fetchProductUpdateHistory } = useProductUpdateHistory();
const { currentSyncRun, fetchSyncRun } = useShopifyProductSyncRun();
const PRODUCT_UPDATE_SYNC_SERVICE_NAME = "sync_ShopifyProductUpdates";
const BULK_OPERATION_SEND_JOB_NAME = "send_ProducedBulkOperationSystemMessage_ShopifyBulkQuery";
const BULK_OPERATION_POLL_JOB_NAME = "poll_ShopifyBulkOperationResult";
const PRODUCT_SYNC_MDM_CONFIG_ID = "SYNC_SHOPIFY_PRODUCT";
const PRODUCT_SYNC_ERROR_LOG_LIMIT = 10;
const SYSTEM_MESSAGE_CONSUMED_STATUSES = ["smsgconsumed", "consumed"];
const SYSTEM_MESSAGE_RECEIVED_STATUSES = ["smsgreceived", "received"];
const SYSTEM_MESSAGE_SENT_STATUSES = ["smsgsent", "sent"];
const SYSTEM_MESSAGE_PRODUCED_STATUSES = ["smsgproduced", "produced"];
const TERMINAL_MDM_LOG_STATUSES = [
  "dmlsuccess",
  "dmlerror",
  "success",
  "succeeded",
  "complete",
  "completed",
  "finished",
  "error",
  "failed",
  "failure",
  "cancelled",
  "canceled"
];

const latestSystemMessage = ref<any>(null);
const latestConfirmedSystemMessage = ref<any>(null);
const latestConsumedSystemMessage = ref<any>(null);
const lastProductUpdateSyncedAt = ref("");
const currentTimeMs = ref(Date.now());
const isLoading = ref(true);
const loadErrorMessage = ref("");
const isSaving = ref(false);
const isReviewLoading = ref(false);
const showModeModal = ref(false);
const showMistakeModal = ref(false);
const showStartSyncModal = ref(false);
const showUnsyncedUpdatesModal = ref(false);
const showSyncJobDetailsModal = ref(false);
const showStepDetailsModal = ref(false);
const isUnsyncedUpdatesLoading = ref(false);
const isSyncJobDetailsLoading = ref(false);
const isSyncJobDetailsSaving = ref(false);
const isStepDetailsLoading = ref(false);
const isSyncJobConfigLoaded = ref(false);
const isSyncJobConfiguring = ref(false);
const syncJobConfigured = ref(false);
const scheduledJobName = ref("");
const currentStepDetail = ref<any>(null);
const bulkOperationSendJob = ref<any>({});
const bulkOperationPollJob = ref<any>({});
const bulkOperationSendJobRecentRuns = ref<any[]>([]);
const bulkOperationPollJobRecentRuns = ref<any[]>([]);
const runningShopifyBulkOperation = ref<any>(null);
const runningShopifyBulkOperationError = ref("");
const preflightLoaded = ref(false);
const preflightAccepted = ref(false);
const preflightWarningConfirmed = ref(false);
const productStoreContextError = ref("");
const experienceMode = ref<ProductSyncExperienceMode>("auto");
const currentStep = ref<ProductSyncWizardStep>("home");
const draft = ref(createProductSyncWizardDraft());
const relatedShops = ref<any[]>([]);
const shopifyShopProductCount = ref(0);
const pendingUpdateRequestsCount = ref(0);
const pendingUpdateRequestsLastCreatedAt = ref("");
const unsyncedProductUpdates = ref<any[]>([]);
const syncJobDetails = ref<any>({});
const syncJobDraftCronExpression = ref("");
const syncJobDetailsRecentRuns = ref<any[]>([]);
const syncJobRecentRuns = ref<any[]>([]);
const selectedSyncJobDetailsJob = ref<any>(null);
const syncJobId = ref("");
const selectedShopSystemMessageRemoteId = ref("");
const setupState = ref<any>({
  hasLinkedOmsProducts: false,
  productStoreLocked: false,
  identifierLocked: false,
  backendAvailable: true
});
const reviewStats = ref<any>({
  shopifyProductCount: 0,
  shopifyVariantCount: 0,
  omsProductCount: 0,
  omsVariantCount: 0,
  linkedShopCount: 0,
  loaded: false
});
const preflightResult = ref<any>({
  matched: 0,
  sampled: 0,
  status: "matched",
  items: []
});
const progressState = ref<any>({
  syncJobId: "",
  status: "queued",
  systemMessageState: "SmsgProduced",
  completed: false,
  queuedJobsAhead: 0
});
const reconcileState = ref<any>({});
let progressPoll: number | undefined;
let nextSyncRefreshPoll: number | undefined;

const shop = computed(() => store.getters["shopify/getShopById"](props.id) || {});
const userProfile = computed(() => store.getters["user/getUserProfile"] || {});
const statusItems = computed(() => store.state.util.statusItems || {});
const latestBulkOperationId = computed(() => getSystemMessageBulkOperationId(latestSystemMessage.value));

function getStatusDescription(statusId: string) {
  return statusItems.value[statusId]?.description || statusId;
}
const productStores = computed(() => store.getters["productStore/getProductStores"] || []);
const productTypeMappings = computed(() => store.getters["shopify/getShopifyTypeMappings"]("SHOPIFY_PRODUCT_TYPE"));
const productTypeMappingsLabel = computed(() => {
  return productTypeMappings.value.length ? `${productTypeMappings.value.length} ${translate("mappings")}` : translate("Setup");
});
const selectedProductStore = computed(() => {
  return productStores.value.find((productStore: any) => productStore.productStoreId === draft.value.selectedProductStoreId) || {};
});
const selectedProductStoreName = computed(() => {
  return getProductStoreName(selectedProductStore.value) || shop.value.productStoreId || translate("Not linked");
});
const unsyncedUpdatesCountLabel = computed(() => {
  return shopifyShopProductCount.value > 100 ? "100+" : shopifyShopProductCount.value;
});
const pendingUpdateRequestsSubtitle = computed(() => {
  if (!pendingUpdateRequestsCount.value) {
    return translate("No pending update requests");
  }

  const dateTime = parseDateTimeValue(pendingUpdateRequestsLastCreatedAt.value);
  if (!dateTime || !dateTime.isValid) {
    return translate("Pending requests are waiting to be sent");
  }

  return translate("Last request created {time}", {
    time: dateTime.toRelative({ base: DateTime.fromMillis(currentTimeMs.value) }) || formatDateTime(pendingUpdateRequestsLastCreatedAt.value)
  });
});
const identifierOptions = ref([
  { enumId: "SHOPIFY_PRODUCT_SKU", description: "SKU" },
  { enumId: "SHOPIFY_BARCODE", description: "UPCA / Barcode" },
  { enumId: "SHOPIFY_PRODUCT_ID", description: "Shopify internal id" }
]);
const syncJobScheduleOptions = [
  { label: "Every 15 minutes", expression: "0 */15 * ? * *" },
  { label: "Every 30 minutes", expression: "0 */30 * ? * *" },
  { label: "Every hour", expression: "0 0 * ? * *" },
  { label: "Every day at midnight", expression: "0 0 0 ? * *" }
];

const recommendedIdentifierEnumId = computed(() => {
  const skuIdentifier = identifierOptions.value.find((identifier: any) => {
    return identifier.enumId.includes("SKU") || (identifier.description || "").toLowerCase() === "sku";
  });
  return skuIdentifier?.enumId || identifierOptions.value[0]?.enumId || "";
});
const selectedIdentifierLabel = computed(() => {
  const identifier = identifierOptions.value.find((option: any) => option.enumId === draft.value.selectedIdentifierEnumId);
  return identifier?.description || identifier?.enumId || translate("Setup");
});
const hasLinkedOmsProducts = computed(() => {
  return !!setupState.value.hasLinkedOmsProducts || productUpdateHistories.value.length > 0;
});
const productStoreHasLinkedProducts = computed(() => {
  return relatedShops.value.some((relatedShop: any) => relatedShop.shopId !== props.id);
});
const productStoreLocked = computed(() => !!setupState.value.productStoreLocked || hasLinkedOmsProducts.value);
const identifierLocked = computed(() => !!setupState.value.identifierLocked || productStoreHasLinkedProducts.value);
const hasRelatedShops = computed(() => {
  return relatedShops.value.some((relatedShop: any) => relatedShop.shopId !== props.id);
});
const activeExperienceMode = computed(() => {
  return resolveProductSyncExperienceMode(experienceMode.value, hasLinkedOmsProducts.value);
});
const activeExperienceModeLabel = computed(() => {
  return activeExperienceMode.value === "returning" ? translate("Returning user") : translate("First-time setup");
});
const lastSyncLabel = computed(() => {
  const lastSyncedAt = lastProductUpdateSyncedAt.value || latestConsumedSystemMessage.value?.initDate;
  return lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleString()
    : translate("Sync time");
});
const lastSyncRelativeLabel = computed(() => {
  const lastSyncedAt = lastProductUpdateSyncedAt.value || latestConsumedSystemMessage.value?.initDate;
  if (!lastSyncedAt) return translate("Sync time");

  const dateTime = parseDateTimeValue(lastSyncedAt);
  if (!dateTime || !dateTime.isValid) return translate("Sync time");

  return dateTime.toRelative({ base: DateTime.fromMillis(currentTimeMs.value) });
});
const syncJobObj = computed(() => {
  if (syncJobId.value) {
    const job = jobs.value.find((j: any) => j.jobName === syncJobId.value);
    if (job && isSelectedShopProductSyncJob(job)) return job;
  }

  return jobs.value.find(isSelectedShopProductSyncJob);
});
const isSyncScheduled = computed(() => {
  return !!(syncJobObj.value?.cronExpression || syncJobObj.value?.cronString);
});
const isSyncJobPaused = computed(() => {
  return isJobPaused(syncJobObj.value);
});
const nextSyncLabel = computed(() => {
  return syncJobObj.value?.cronString || translate("Not scheduled");
});
const nextSyncRelativeLabel = computed(() => {
  return getRelativeNextRunLabel(syncJobObj.value);
});
const systemMessageSendJobNextRunLabel = computed(() => {
  if (!pendingUpdateRequestsCount.value) return translate("No requests queued to send");
  return getJobNextRunLabel(bulkOperationSendJob.value);
});
const bulkOperationPollJobNextRunLabel = computed(() => {
  return getJobNextRunLabel(bulkOperationPollJob.value);
});
const stepDetailsTitle = computed(() => {
  if (currentStepDetail.value?.type === "systemMessage") return translate("System Message");
  if (currentStepDetail.value?.type === "bulkOperation") return translate("Bulk Operation");
  if (currentStepDetail.value?.type === "mdmLog") return translate("Data Manager Log");
  if (currentStepDetail.value?.type === "summary") return translate("Sync Complete");
  return translate("Step Details");
});
const syncSummarySubtitle = computed(() => {
  if (isSyncJobPaused.value) return translate("Paused");
  return nextSyncLabel.value;
});
const syncJobDetailsTitle = computed(() => {
  const job = syncJobDetails.value?.jobName ? syncJobDetails.value : selectedSyncJobDetailsJob.value;
  if (isSelectedShopProductSyncJob(job)) {
    return translate("Queue update requests");
  }
  if (job?.jobName === BULK_OPERATION_SEND_JOB_NAME) {
    return translate("Send update request");
  }
  if (job?.jobName === BULK_OPERATION_POLL_JOB_NAME) {
    return translate("Import completed requests");
  }
  return job?.jobName || translate("Sync job details");
});
const syncJobProductLabel = computed(() => {
  const productId = syncJobDetails.value?.instanceOfProductId;
  if (!productId) return translate("Unavailable");

  const product = products.value?.[productId];
  return product?.productName || product?.internalName || productId;
});
const syncJobLastRunLabel = computed(() => {
  if (syncJobRecentRuns.value.length) {
    const latestRun = syncJobRecentRuns.value[0];
    return `${translate("Last run")}: ${formatDateTime(getSyncJobRunStartedAt(latestRun))} · ${getSyncJobRunStatus(latestRun)}`;
  }
  return translate("No recent runs");
});
const syncJobDetailsLastRunLabel = computed(() => {
  if (syncJobDetailsRecentRuns.value.length) {
    const latestRun = syncJobDetailsRecentRuns.value[0];
    return `${translate("Last run")}: ${formatDateTime(getSyncJobRunStartedAt(latestRun))} · ${getSyncJobRunStatus(latestRun)}`;
  }
  return translate("No recent runs");
});
const syncJobDetailsDirty = computed(() => {
  return syncJobDraftCronExpression.value !== getSyncJobOriginalCronExpression();
});
const isSyncJobDraftScheduleValid = computed(() => {
  if (!syncJobDraftCronExpression.value) return false;

  try {
    CronExpressionParser.parse(syncJobDraftCronExpression.value, {
      tz: userProfile.value?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
    });
    return true;
  } catch (error) {
    return false;
  }
});
const syncJobDraftScheduleDescription = computed(() => {
  return getCronDescription(syncJobDraftCronExpression.value);
});
const syncJobDraftNextRunLabel = computed(() => {
  if (!isSyncJobDraftScheduleValid.value) return translate("Invalid");
  const nextRun = getNextRunDateTime({ cronExpression: syncJobDraftCronExpression.value });
  if (!nextRun) return translate("Not scheduled");
  return nextRun.toLocaleString(DateTime.DATETIME_SHORT);
});
const isBulkOperationSendJobPaused = computed(() => {
  return isJobPaused(bulkOperationSendJob.value);
});
const isBulkOperationPollJobPaused = computed(() => {
  return isJobPaused(bulkOperationPollJob.value);
});
const bulkOperationSendJobLastRunLabel = computed(() => {
  if (bulkOperationSendJobRecentRuns.value.length) {
    const latestRun = bulkOperationSendJobRecentRuns.value[0];
    return `${translate("Last run")}: ${formatDateTime(getSyncJobRunStartedAt(latestRun))} · ${getSyncJobRunStatus(latestRun)}`;
  }
  return translate("No recent runs");
});
const bulkOperationPollJobLastRunLabel = computed(() => {
  if (bulkOperationPollJobRecentRuns.value.length) {
    const latestRun = bulkOperationPollJobRecentRuns.value[0];
    return `${translate("Last run")}: ${formatDateTime(getSyncJobRunStartedAt(latestRun))} · ${getSyncJobRunStatus(latestRun)}`;
  }
  return translate("No recent runs");
});
const hasRunningShopifyBulkOperation = computed(() => {
  return !!runningShopifyBulkOperation.value?.id;
});
const currentShopifyRequestSubtitle = computed(() => {
  if (runningShopifyBulkOperationError.value) return runningShopifyBulkOperationError.value;
  if (!hasRunningShopifyBulkOperation.value) return translate("No running Shopify bulk operation");

  const createdAt = runningShopifyBulkOperation.value.createdAt;
  const createdAtLabel = createdAt ? formatDateTime(createdAt) : translate("Unavailable");
  return translate("Created {time}", { time: createdAtLabel });
});
const currentShopifyRequestStatusLabel = computed(() => {
  return getShopifyBulkOperationStatusLabel(runningShopifyBulkOperation.value?.status);
});
const currentShopifyRequestStatusColor = computed(() => {
  return getShopifyBulkOperationStatusColor(runningShopifyBulkOperation.value?.status);
});
const syncJobParameters = computed(() => {
  const jobParameters = (syncJobDetails.value?.serviceJobParameters || []).map((parameter: any, index: number) => ({
    key: `job-${parameter.parameterName || index}`,
    label: parameter.parameterName || translate("Parameter"),
    value: formatParameterValue(parameter.parameterValue),
    source: translate("Job parameter")
  }));
  const serviceParameters = (syncJobDetails.value?.serviceInParameters || []).map((parameter: any, index: number) => ({
    key: `service-${parameter.parameterName || parameter.name || index}`,
    label: parameter.parameterName || parameter.name || translate("Parameter"),
    value: formatParameterValue(parameter.defaultValue || parameter.parameterValue || parameter.type || parameter.mode),
    source: translate("Service parameter")
  }));
  return [...jobParameters, ...serviceParameters];
});
const reviewReady = computed(() => {
  return !!reviewStats.value.loaded && !isReviewLoading.value;
});
const nextDisabled = computed(() => {
  if (productStoreContextError.value) return true;
  return !canAdvanceProductSyncStep(currentStep.value, {
    draft: draft.value,
    productStoreLocked: productStoreLocked.value,
    identifierLocked: identifierLocked.value,
    reviewReady: reviewReady.value,
    progressComplete: reconcileAvailable.value
  });
});
const startSyncDisabled = computed(() => !canStartProductSync(draft.value.startConfirmed));
const progressStatus = computed(() => normalizeProductSyncStatus(progressState.value));
const reconcileAvailable = computed(() => canShowProductSyncReconcile(progressState.value));
const importStatusLabel = computed(() => {
  if (currentStep.value === "reconcile") return translate("Complete");
  if (currentStep.value === "progress") return progressStatus.value;
  return translate("Not started");
});
const importStatusBadgeColor = computed(() => {
  if (currentStep.value === "reconcile") return "success";
  if (currentStep.value === "progress") return progressBadgeColor.value;
  return "medium";
});
const progressBadgeColor = computed(() => {
  if (progressStatus.value === "completed") return "success";
  if (progressStatus.value === "error" || progressStatus.value === "cancelled") return "danger";
  if (progressStatus.value === "running" || progressStatus.value === "sent") return "primary";
  return "medium";
});
const recentSyncUpdates = computed(() => {
  return productUpdateHistories.value.map((history: any) => ({
    id: [history.shopId, history.productId, history.lastUpdatedStamp].filter(Boolean).join("-"),
    internalName: history.diffs?.title || history.diffs?.handle || history.productId,
    shopifyId: getShopifyProductReference(history),
    updatedTime: history.lastUpdatedStamp ? new Date(history.lastUpdatedStamp).toLocaleString() : translate("Recent"),
    details: history.details || []
  }));
});

function getShopifyProductReference(history: any) {
  const diffId = history.diffs?.id ? String(history.diffs.id) : "";
  const productReference = diffId.startsWith("gid://shopify/Product/")
    ? diffId
    : history.parentProductId || history.diffs?.parentProductId || history.productId || diffId;
  if (!productReference) return "N/A";
  if (String(productReference).startsWith("gid://shopify/")) return formatShopifyReference(productReference);
  if (history.parentProductId || String(history.productId).length >= 10) return `${translate("Shopify ID")}: ${productReference}`;
  return String(productReference);
}

function formatShopifyReference(reference: string) {
  const parts = String(reference).split("/");
  const id = parts.pop();
  const resource = parts.pop();
  if (resource === "Product" && id) return `${translate("Shopify ID")}: ${id}`;
  if (resource && id) return `${resource} ${id}`;
  return reference;
}

function getShopifyBulkOperationStatusLabel(status: string) {
  const normalizedStatus = String(status || "").toLowerCase();
  if (normalizedStatus === "running") return translate("Running");
  if (normalizedStatus === "created") return translate("Created");
  if (normalizedStatus === "completed") return translate("Complete");
  if (normalizedStatus === "failed") return translate("Error");
  if (normalizedStatus === "canceled") return translate("Canceled");
  if (normalizedStatus === "canceling") return translate("Canceling");
  return status || translate("Unavailable");
}

function getShopifyBulkOperationStatusColor(status: string) {
  const normalizedStatus = String(status || "").toLowerCase();
  if (normalizedStatus === "completed") return "success";
  if (normalizedStatus === "failed" || normalizedStatus === "canceled") return "danger";
  if (normalizedStatus === "running" || normalizedStatus === "created" || normalizedStatus === "canceling") return "primary";
  return "medium";
}

function isProductUpdateSyncServiceJob(job: any = {}) {
  const serviceName = String(job.serviceName || "");
  const jobName = String(job.jobName || "");

  return serviceName === PRODUCT_UPDATE_SYNC_SERVICE_NAME ||
    jobName === PRODUCT_UPDATE_SYNC_SERVICE_NAME ||
    jobName.startsWith(`${PRODUCT_UPDATE_SYNC_SERVICE_NAME}_`);
}

function getServiceJobParameterValue(job: any = {}, parameterName: string) {
  const parameter = (job.serviceJobParameters || []).find((param: any) => param.parameterName === parameterName);
  return parameter?.parameterValue || "";
}

function getLoadedServiceJob(jobName: string) {
  return jobs.value.find((job: any) => job.jobName === jobName) || {};
}

function isSelectedShopProductSyncJob(job: any = {}) {
  const selectedShopifyShopIds = [
    shop.value.shopifyShopId,
    props.id
  ].filter(Boolean).map(String);

  return selectedShopifyShopIds.length > 0 &&
    isProductUpdateSyncServiceJob(job) &&
    selectedShopifyShopIds.includes(String(getServiceJobParameterValue(job, "shopifyShopId")));
}


const recentSyncErrors = computed(() => {
  if (errorLogs.value && errorLogs.value.length) {
    return errorLogs.value.map((err: any, index: number) => ({
      id: err.id || err.internalName || err.shopifyId || `sync-error-${index}`,
      internalName: err.internalName || translate("Unknown product"),
      shopifyId: err.shopifyId || err.id || "N/A",
      updatedTime: err.updatedTime || currentMdmLog.value?.createdDate || translate("Recent"),
      errorContent: err.errorString || err.error || err.message || JSON.stringify(err)
    }));
  }
  return recentMdmLogs.value
    .filter((log: any) => {
      return Number(log.failedRecordCount || 0) > 0 || log.errorLogContentId || String(log.statusId || "").toLowerCase().includes("error");
    })
    .map((log: any) => ({
      id: log.logId || [log.configId, log.createdDate].filter(Boolean).join("-"),
      internalName: log.logId || translate("Data Manager log"),
      shopifyId: `${translate("Config ID")}: ${log.configId || PRODUCT_SYNC_MDM_CONFIG_ID}`,
      updatedTime: log.createdDate ? new Date(log.createdDate).toLocaleString() : translate("Recent"),
      errorContent: translate("{failed} failed of {total} records.", {
        failed: Number(log.failedRecordCount || 0),
        total: Number(log.totalRecordCount || 0)
      })
    }));
});
const preflightTitle = computed(() => {
  return requiresPreflightConfirmation(preflightResult.value)
    ? translate("Review possible catalog mismatch")
    : translate("Preflight sample looks matched");
});
const preflightRequiresConfirmation = computed(() => {
  return preflightLoaded.value && requiresPreflightConfirmation(preflightResult.value);
});
const preflightSubtitle = computed(() => {
  return translate("Matched {matched} of {sampled} sampled products.", {
    matched: preflightResult.value.matched,
    sampled: preflightResult.value.sampled
  });
});

onIonViewWillEnter(async () => {
  startNextSyncRefreshPolling();
  await loadWizard();
});

watch(() => draft.value.selectedProductStoreId, async (productStoreId) => {
  if (productStoreId) {
    await loadProductStoreContext(productStoreId);
  } else {
    relatedShops.value = [];
    productStoreContextError.value = "";
  }
});

onBeforeUnmount(() => {
  stopProgressPolling();
  stopNextSyncRefreshPolling();
});

async function loadWizard() {
  isLoading.value = true;
  loadErrorMessage.value = "";
  try {
    await store.dispatch("shopify/fetchShopifyShops");
    assertShopifyShopsLoaded();

    await Promise.all([
      store.dispatch("productStore/fetchProductStores"),
      store.dispatch("shopify/fetchShopifyTypeMappings", "SHOPIFY_PRODUCT_TYPE"),
      fetchJobs({})
    ]);


    // Fetch details for product-update sync jobs to get parameters (needed to find the job for this shop)
    const syncJobs = jobs.value.filter((job: any) => isProductUpdateSyncServiceJob(job) || (syncJobId.value && job.jobName === syncJobId.value));

    await Promise.all(syncJobs.map(async (job: any) => {
      const details = await fetchJobDetail(job.jobName);
      Object.assign(job, details);
    }));

    await loadBulkOperationMonitoringJobs();

    if (shop.value.productStoreId) {
      await store.dispatch("productStore/fetchProductStoreDetails", shop.value.productStoreId);
    }

    await loadSelectedShopSystemMessageRemoteId();
    await loadLatestSystemMessage();
    await loadPendingUpdateRequests();
    await loadShopifyShopProductCount();
    await loadSyncJobLatestRun();
    await loadBulkOperationSendJobLatestRun();
    await loadBulkOperationPollJobLatestRun();
    await loadRunningShopifyBulkOperation();

    setupState.value = await ShopifyProductSyncService.fetchSetupState({
      shopId: props.id,
      shop: shop.value,
      productStore: selectedProductStore.value
    });
    assertBackendDataAvailable(setupState.value, translate("Product sync setup is unavailable."));

    draft.value = createProductSyncWizardDraft({
      selectedProductStoreId: setupState.value.selectedProductStoreId || shop.value.productStoreId || "",
      selectedIdentifierEnumId: setupState.value.selectedIdentifierEnumId || selectedProductStore.value.productIdentifierEnumId || recommendedIdentifierEnumId.value,
      productStoreVerified: !!setupState.value.productStoreLocked,
      syncStarted: !!setupState.value.syncJobId,
      startConfirmed: false
    });

    syncJobId.value = setupState.value.syncJobId || "";
    if (setupState.value.completed) {
      currentStep.value = "reconcile";
    } else if (syncJobId.value) {
      currentStep.value = "progress";
      if (!reviewStats.value.loaded) {
        await loadReviewStats();
      }
      const loadedProgress = await loadProgress();
      if (loadedProgress) startProgressPolling();
    } else {
      currentStep.value = "home";
    }

    if (draft.value.selectedProductStoreId) {
      await loadProductStoreContext(draft.value.selectedProductStoreId);
    }
  } catch (error: any) {
    logger.error(error);
    loadErrorMessage.value = getErrorMessage(error, translate("Failed to load product sync"));
    showToast(translate("Failed to load product sync"));
    stopProgressPolling();
  } finally {
    isLoading.value = false;
  }
}

async function loadBulkOperationMonitoringJobs() {
  bulkOperationSendJob.value = getLoadedServiceJob(BULK_OPERATION_SEND_JOB_NAME);
  bulkOperationPollJob.value = getLoadedServiceJob(BULK_OPERATION_POLL_JOB_NAME);
}

async function loadBulkOperationSendJobLatestRun() {
  if (!bulkOperationSendJob.value?.jobName) {
    bulkOperationSendJobRecentRuns.value = [];
    return;
  }

  try {
    const jobRuns = await fetchJobRuns(bulkOperationSendJob.value.jobName, { pageSize: 1, pageIndex: 0 });
    bulkOperationSendJobRecentRuns.value = Array.isArray(jobRuns) ? jobRuns : [];
  } catch (error: any) {
    logger.error(error);
    bulkOperationSendJobRecentRuns.value = [];
  }
}

async function loadBulkOperationPollJobLatestRun() {
  if (!bulkOperationPollJob.value?.jobName) {
    bulkOperationPollJobRecentRuns.value = [];
    return;
  }

  try {
    const jobRuns = await fetchJobRuns(bulkOperationPollJob.value.jobName, { pageSize: 1, pageIndex: 0 });
    bulkOperationPollJobRecentRuns.value = Array.isArray(jobRuns) ? jobRuns : [];
  } catch (error: any) {
    logger.error(error);
    bulkOperationPollJobRecentRuns.value = [];
  }
}

async function loadRunningShopifyBulkOperation() {
  try {
    runningShopifyBulkOperation.value = await ShopifyProductSyncService.fetchRunningBulkOperation({
      shopId: props.id,
      systemMessageRemoteId: selectedShopSystemMessageRemoteId.value,
      shop: shop.value
    });
    runningShopifyBulkOperationError.value = "";
  } catch (error: any) {
    logger.error(error);
    runningShopifyBulkOperation.value = null;
    runningShopifyBulkOperationError.value = translate("Shopify request status unavailable");
  }
}

async function loadSelectedShopSystemMessageRemoteId() {
  selectedShopSystemMessageRemoteId.value = await ShopifyProductSyncService.fetchShopSystemMessageRemoteId({
    shopId: props.id,
    shop: shop.value
  });
}

async function openStepDetails(step: any) {
  currentStepDetail.value = step;
  showStepDetailsModal.value = true;

  if (step.type === 'mdmLog' && step.id) {
    isStepDetailsLoading.value = true;
    try {
      await fetchLogDetails(step.id);
    } catch (error: any) {
      logger.error(error);
      showToast(translate("Failed to load sync step details."));
    } finally {
      isStepDetailsLoading.value = false;
    }
  }
}

async function loadShopifyShopProductCount() {
  try {
    const countState = await ShopifyProductSyncService.fetchShopifyShopProductCount({
      shopId: props.id,
      systemMessageRemoteId: selectedShopSystemMessageRemoteId.value,
      lastSyncedAt: lastProductUpdateSyncedAt.value,
      shop: shop.value
    });
    shopifyShopProductCount.value = Number(countState.count || 0);
  } catch (error: any) {
    logger.error(error);
    throw error;
  }
}

async function loadPendingUpdateRequests() {
  try {
    const pendingState = await ShopifyProductSyncService.fetchPendingProductUpdateRequests({
      shopId: props.id,
      systemMessageRemoteId: selectedShopSystemMessageRemoteId.value,
      shop: shop.value
    });
    pendingUpdateRequestsCount.value = Number(pendingState.count || 0);
    pendingUpdateRequestsLastCreatedAt.value = pendingState.latestSystemMessage?.initDate ||
      pendingState.latestSystemMessage?.createdDate ||
      pendingState.latestSystemMessage?.lastUpdatedStamp ||
      "";
  } catch (error: any) {
    logger.error(error);
    pendingUpdateRequestsCount.value = 0;
    pendingUpdateRequestsLastCreatedAt.value = "";
  }
}

async function loadUnsyncedProductUpdates() {
  isUnsyncedUpdatesLoading.value = true;
  try {
    unsyncedProductUpdates.value = await ShopifyProductSyncService.fetchUnsyncedProductUpdates({
      shopId: props.id,
      systemMessageRemoteId: selectedShopSystemMessageRemoteId.value,
      lastSyncedAt: lastProductUpdateSyncedAt.value,
      shop: shop.value,
      pageSize: 100
    });
  } catch (error: any) {
    logger.error(error);
    unsyncedProductUpdates.value = [];
    showToast(translate("Failed to load un-synced product updates."));
  }
  isUnsyncedUpdatesLoading.value = false;
}

async function openUnsyncedUpdatesModal() {
  showUnsyncedUpdatesModal.value = true;
  await loadUnsyncedProductUpdates();
}

function formatShopifyDate(value: string) {
  if (!value) return translate("Recent");
  return new Date(value).toLocaleString();
}

async function loadLatestSystemMessage() {
  const syncRunState = await ShopifyProductSyncService.fetchProductUpdateSyncRunState({
    shopId: props.id,
    systemMessageRemoteId: selectedShopSystemMessageRemoteId.value,
    shop: shop.value
  });

  latestSystemMessage.value = await selectTrackProgressSystemMessage(syncRunState.systemMessages || []);
  latestConfirmedSystemMessage.value = syncRunState.latestConfirmedSystemMessage || null;
  latestConsumedSystemMessage.value = syncRunState.latestConsumedSystemMessage || null;
  lastProductUpdateSyncedAt.value = syncRunState.lastSyncedAt || "";

  if (latestSystemMessage.value?.systemMessageId) {
    await fetchSyncRun(latestSystemMessage.value.systemMessageId);
  } else {
    currentSyncRun.value = {} as any;
  }

  await Promise.all([
    fetchProductUpdateHistory({ shopId: props.id, pageSize: 10 }),
    fetchRecentLogsByConfigId(PRODUCT_SYNC_MDM_CONFIG_ID, PRODUCT_SYNC_ERROR_LOG_LIMIT)
  ]);
}

async function selectTrackProgressSystemMessage(systemMessages: any[]) {
  if (!systemMessages.length) return null;

  const consumedMessages = systemMessages.filter((message) => hasSystemMessageStatus(message, SYSTEM_MESSAGE_CONSUMED_STATUSES));
  const oldestConsumedMessages = sortSystemMessagesOldestFirst(consumedMessages);

  for (const message of oldestConsumedMessages) {
    const mdmLog = await fetchMdmLogBySystemMessageId(message.systemMessageId);
    if (mdmLog?.logId && !isTerminalMdmLogStatus(mdmLog.statusId)) {
      return message;
    }
  }

  return getOldestSystemMessageByStatus(systemMessages, SYSTEM_MESSAGE_RECEIVED_STATUSES) ||
    getOldestSystemMessageByStatus(systemMessages, SYSTEM_MESSAGE_SENT_STATUSES) ||
    getOldestSystemMessageByStatus(systemMessages, SYSTEM_MESSAGE_PRODUCED_STATUSES) ||
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
  return TERMINAL_MDM_LOG_STATUSES.includes(normalizeStatusValue(statusId));
}

function sortSystemMessagesOldestFirst(systemMessages: any[]) {
  return [...systemMessages].sort((firstMessage, secondMessage) => {
    return getSystemMessageTime(firstMessage) - getSystemMessageTime(secondMessage);
  });
}

function sortSystemMessagesNewestFirst(systemMessages: any[]) {
  return [...systemMessages].sort((firstMessage, secondMessage) => {
    return getSystemMessageTime(secondMessage) - getSystemMessageTime(firstMessage);
  });
}

function getSystemMessageTime(systemMessage: any) {
  const value = systemMessage?.initDate || systemMessage?.lastUpdatedStamp || systemMessage?.processedDate;
  return parseDateTimeValue(value)?.toMillis() || 0;
}

function normalizeStatusValue(statusId: string) {
  return String(statusId || "").toLowerCase().replace(/[_\-\s]/g, "");
}


async function loadProductStoreContext(productStoreId: string) {
  try {
    assertShopifyShopsLoaded();
    const context = await ShopifyProductSyncService.fetchProductStoreContext({
      shopId: props.id,
      productStoreId,
      shops: store.getters["shopify/getShops"] || []
    });
    assertBackendDataAvailable(context, translate("Product store sync context is unavailable."));
    relatedShops.value = context.relatedShops || [];
    productStoreContextError.value = "";
  } catch (error: any) {
    logger.error(error);
    relatedShops.value = [];
    productStoreContextError.value = getErrorMessage(error, translate("Failed to load product store sync context."));
    showToast(translate("Failed to load product store sync context."));
  }
}

function getProductStoreName(productStore: any) {
  if (!productStore?.productStoreId) return "";
  return productStore.storeName || productStore.productStoreId;
}

function assertShopifyShopsLoaded() {
  const status = store.getters["shopify/getFetchStatus"];
  if (status?.shops !== "success") {
    throw new Error(translate("Shopify shop list is unavailable."));
  }
}

function getConnectedShopLabel(productStoreId: string) {
  const count = (store.getters["shopify/getShops"] || []).filter((shopifyShop: any) => {
    return shopifyShop.productStoreId === productStoreId;
  }).length;
  return translate("{count} Shopify stores connected", { count });
}

function handleProductStoreChange(productStoreId: string) {
  if (productStoreLocked.value) return;
  draft.value = selectProductStore(draft.value, productStoreId);
}

function handleIdentifierChange(identifierEnumId: string) {
  if (identifierLocked.value) return;
  draft.value.selectedIdentifierEnumId = identifierEnumId;
}

function handleExperienceModeChange(mode: ProductSyncExperienceMode) {
  if (!mode) return;
  showModeModal.value = false;
  window.setTimeout(() => {
    experienceMode.value = mode;
  }, 250);
}

async function runSyncJob(job: any) {
  if (!job?.jobName) return;

  const jobAlert = await alertController.create({
    header: translate("Run now"),
    message: translate("Running this job now will not replace this job. A copy of this job will be created and run immediately. You may not be able to reverse this action."),
    buttons: [
      {
        text: translate("Cancel"),
        role: "cancel",
      },
      {
        text: translate("Run now"),
        handler: async () => {
          try {
            await runNow(job.jobName);
            showToast(translate("Job has been scheduled to run now"));
            await loadSyncJobLatestRun();
          } catch (err) {
            logger.error("Failed to run job now", err);
            showToast(translate("Failed to run job"));
          }
        }
      }
    ]
  });

  await jobAlert.present();
}



async function scheduleSyncJob(cronExpression: string) {
  if (!syncJobObj.value?.jobName || !cronExpression) return;

  await updateSyncJob({
    jobName: syncJobObj.value.jobName,
    cronExpression,
    paused: isSyncJobPaused.value ? "Y" : "N"
  }, translate("Sync job updated successfully."));
}

async function togglePauseSyncJob(shouldPause: boolean) {
  if (!syncJobObj.value?.jobName) return;

  await updateSyncJob({
    jobName: syncJobObj.value.jobName,
    paused: shouldPause ? "Y" : "N",
    cronExpression: syncJobObj.value.cronExpression
  }, shouldPause ? translate("Sync job paused.") : translate("Sync job resumed."));
}

async function updateSyncJob(payload: any, successMessage: string) {
  try {
    const response = await updateJob(payload);
    if (hasError(response)) {
      throw response.data;
    }

    const updatedJob = await fetchJobDetail(payload.jobName);
    const loadedJob = jobs.value.find((job: any) => job.jobName === payload.jobName);
    const jobToUpdate = loadedJob || selectedSyncJobDetailsJob.value;
    if (jobToUpdate) {
      Object.assign(jobToUpdate, updatedJob, {
        paused: payload.paused ?? updatedJob.paused,
        cronExpression: payload.cronExpression ?? updatedJob.cronExpression
      });
    }

    if (showSyncJobDetailsModal.value) {
      await refreshSyncJobDetails();
    }

    showToast(successMessage);
    return true;
  } catch (error: any) {
    logger.error(error);
    showToast(translate("Failed to update sync job."));
    return false;
  }
}

async function openSyncJobDetailsModal(job = syncJobObj.value) {
  if (!job?.jobName) return;
  selectedSyncJobDetailsJob.value = job;
  showSyncJobDetailsModal.value = true;
  await refreshSyncJobDetails();
}

async function requestCloseSyncJobDetailsModal() {
  const shouldClose = await confirmDiscardSyncJobDetailsChanges();
  if (!shouldClose) return;

  resetSyncJobDetailsDraft();
  showSyncJobDetailsModal.value = false;
}

function handleSyncJobDetailsDidDismiss() {
  showSyncJobDetailsModal.value = false;
  resetSyncJobDetailsDraft();
  selectedSyncJobDetailsJob.value = null;
  syncJobDetails.value = {};
  syncJobDetailsRecentRuns.value = [];
}

async function canDismissSyncJobDetailsModal() {
  const canDismiss = await confirmDiscardSyncJobDetailsChanges();
  if (canDismiss) resetSyncJobDetailsDraft();
  return canDismiss;
}

async function requestRefreshSyncJobDetails() {
  const shouldRefresh = await confirmDiscardSyncJobDetailsChanges();
  if (!shouldRefresh) return;

  resetSyncJobDetailsDraft();
  await refreshSyncJobDetails();
}

async function saveSyncJobDetails() {
  if (!selectedSyncJobDetailsJob.value?.jobName || !syncJobDetailsDirty.value || !isSyncJobDraftScheduleValid.value) return;

  isSyncJobDetailsSaving.value = true;
  try {
    await updateSyncJob({
      jobName: selectedSyncJobDetailsJob.value.jobName,
      cronExpression: syncJobDraftCronExpression.value,
      paused: isJobPaused(syncJobDetails.value) ? "Y" : "N"
    }, translate("Sync job updated successfully."));
  } finally {
    isSyncJobDetailsSaving.value = false;
  }
}

async function refreshSyncJobDetails() {
  if (!selectedSyncJobDetailsJob.value?.jobName) return;

  isSyncJobDetailsLoading.value = true;
  try {
    const [jobDetails, jobRuns] = await Promise.all([
      fetchJobDetail(selectedSyncJobDetailsJob.value.jobName),
      fetchJobRuns(selectedSyncJobDetailsJob.value.jobName, { pageSize: 5, pageIndex: 0 })
    ]);

    syncJobDetails.value = jobDetails || {};
    syncJobDetailsRecentRuns.value = Array.isArray(jobRuns) ? jobRuns : [];
    setSyncJobDetailsDraft(syncJobDetails.value);

    if (jobDetails?.instanceOfProductId && !products.value?.[jobDetails.instanceOfProductId]) {
      await fetchProductDetail(jobDetails.instanceOfProductId);
    }
  } catch (error: any) {
    logger.error(error);
    syncJobDetails.value = {};
    syncJobDetailsRecentRuns.value = [];
    resetSyncJobDetailsDraft();
    showToast(translate("Failed to load sync job details."));
  } finally {
    isSyncJobDetailsLoading.value = false;
  }
}

function getSyncJobOriginalCronExpression() {
  return syncJobDetails.value?.cronExpression || selectedSyncJobDetailsJob.value?.cronExpression || "";
}

function setSyncJobDetailsDraft(jobDetails: any = {}) {
  syncJobDraftCronExpression.value = jobDetails?.cronExpression || selectedSyncJobDetailsJob.value?.cronExpression || "";
}

function resetSyncJobDetailsDraft() {
  syncJobDraftCronExpression.value = getSyncJobOriginalCronExpression();
}

async function confirmDiscardSyncJobDetailsChanges() {
  if (!syncJobDetailsDirty.value) return true;

  return new Promise<boolean>((resolve) => {
    alertController.create({
      header: translate("Unsaved changes"),
      message: translate("You have unsaved schedule changes. Discard them?"),
      backdropDismiss: false,
      buttons: [
        {
          text: translate("Keep editing"),
          role: "cancel",
          handler: () => resolve(false)
        },
        {
          text: translate("Discard changes"),
          role: "destructive",
          handler: () => resolve(true)
        }
      ]
    }).then((alert) => alert.present());
  });
}

async function loadSyncJobLatestRun() {
  if (!syncJobObj.value?.jobName) {
    syncJobRecentRuns.value = [];
    return;
  }

  try {
    const jobRuns = await fetchJobRuns(syncJobObj.value.jobName, { pageSize: 1, pageIndex: 0 });
    syncJobRecentRuns.value = Array.isArray(jobRuns) ? jobRuns : [];
  } catch (error: any) {
    logger.error(error);
    syncJobRecentRuns.value = [];
  }
}

function openHistory() {

  router.push(`/shopify-connection-details/${props.id}/product-sync/history`);
}

async function goNext() {
  if (nextDisabled.value || isSaving.value) return;

  if (currentStep.value === "product-store") {
    const saved = await persistProductStoreSelection();
    if (!saved) return;
  }

  if (currentStep.value === "identifier") {
    const saved = await persistIdentifierSelection();
    if (!saved) return;
  }

  const nextStep = nextProductSyncStep(currentStep.value);

  if (nextStep === "review") {
    currentStep.value = nextStep;
    await loadReviewStats();
    return;
  }

  if (nextStep === "reconcile") {
    const loaded = await loadReconcile();
    if (loaded) {
      currentStep.value = nextStep;
    }
    return;
  }

  currentStep.value = nextStep;
}

function goBack() {
  currentStep.value = previousProductSyncStep(currentStep.value);
}

async function persistProductStoreSelection() {
  if (productStoreLocked.value) return true;
  if (shop.value.productStoreId === draft.value.selectedProductStoreId) return true;
  isSaving.value = true;
  try {
    const resp = await ShopifyService.updateShopifyShop({
      shopId: props.id,
      productStoreId: draft.value.selectedProductStoreId
    });

    if (!hasError(resp)) {
      await store.dispatch("shopify/fetchShopifyShops");
      isSaving.value = false;
      return true;
    } else {
      throw resp.data;
    }
  } catch (error: any) {
    logger.error(error);
    showToast(translate("Failed to link product store"));
  }
  isSaving.value = false;
  return false;
}

async function persistIdentifierSelection() {
  if (identifierLocked.value || !draft.value.selectedProductStoreId) return true;
  isSaving.value = true;
  try {
    const payload = {
      ...selectedProductStore.value,
      productStoreId: draft.value.selectedProductStoreId,
      productIdentifierEnumId: draft.value.selectedIdentifierEnumId
    };
    const resp = await ProductStoreService.updateProductStore(payload);

    if (!hasError(resp)) {
      store.dispatch("productStore/updateCurrent", payload);
      isSaving.value = false;
      return true;
    } else {
      throw resp.data;
    }
  } catch (error: any) {
    logger.error(error);
    showToast(translate("Failed to update product store settings."));
  }
  isSaving.value = false;
  return false;
}

async function loadReviewStats() {
  isReviewLoading.value = true;
  try {
    reviewStats.value = await ShopifyProductSyncService.fetchReviewStats({
      shopId: props.id,
      productStoreId: draft.value.selectedProductStoreId,
      linkedShopCount: relatedShops.value.length,
      systemMessageRemoteId: selectedShopSystemMessageRemoteId.value,
      shop: shop.value
    });
    return true;
  } catch (error: any) {
    logger.error(error);
    reviewStats.value = {
      shopifyProductCount: undefined,
      shopifyVariantCount: undefined,
      omsProductCount: undefined,
      omsVariantCount: undefined,
      linkedShopCount: relatedShops.value.length,
      loaded: false
    };
    showToast(translate("Failed to load Shopify product counts."));
    return false;
  } finally {
    isReviewLoading.value = false;
  }
}

function toggleProductStoreVerification() {
  if (!draft.value.selectedProductStoreId || productStoreLocked.value) return;
  draft.value.productStoreVerified = !draft.value.productStoreVerified;
}

function togglePreflightWarningConfirmation() {
  preflightWarningConfirmed.value = !preflightWarningConfirmed.value;
}

function toggleStartConfirmation() {
  draft.value.startConfirmed = !draft.value.startConfirmed;
}

async function loadPreflight() {
  const rawItems = await ShopifyProductSyncService.fetchPreflight({
    systemMessageRemoteId: selectedShopSystemMessageRemoteId.value,
    productStoreId: draft.value.selectedProductStoreId,
    productIdentifierEnumId: draft.value.selectedIdentifierEnumId
  });

  preflightResult.value = {
    items: rawItems.map((item: any) => ({
      label: item.shopifyValue,
      detail: item.omsValue || translate("Not found"),
      status: item.isMatched ? "Matched" : (item.omsValue ? "Conflict" : "Not found")
    })),
    matched: rawItems.filter((i: any) => i.isMatched).length,
    sampled: rawItems.length
  };

  preflightLoaded.value = true;
  preflightWarningConfirmed.value = false;
}

async function openMistakeModal() {
  try {
    await loadPreflight();
    showMistakeModal.value = true;
  } catch (error: any) {
    logger.error(error);
    showToast(translate("Failed to load preflight review."));
  }
}

async function openStartSyncModal() {
  try {
    if (!preflightLoaded.value) {
      await loadPreflight();
    }

    if (preflightRequiresConfirmation.value && !preflightAccepted.value) {
      showMistakeModal.value = true;
      return;
    }

    const action = getReviewImportAction();
    if (action.opensStartConfirmation) {
      draft.value.startConfirmed = false;
      showStartSyncModal.value = true;
      await checkSyncJobConfig();
    }
  } catch (error: any) {
    logger.error(error);
    showToast(translate("Failed to prepare product sync."));
  }
}

async function checkSyncJobConfig() {
  isSyncJobConfigLoaded.value = false;
  try {
    const shopifyShopId = props.id; 
    const result = await ShopifyProductSyncService.fetchSyncJobConfig({ shopifyShopId });
    
    syncJobConfigured.value = result.isConfigured;
    if (result.isConfigured) {
      scheduledJobName.value = result.jobName;
    }
  } catch (error) {
    logger.error("Failed to check sync job configuration", error);
    syncJobConfigured.value = false;
  }
  isSyncJobConfigLoaded.value = true;
}

async function configureSyncJob() {
  isSyncJobConfiguring.value = true;
  try {
    const shopifyShopId = props.id; 
    await ShopifyProductSyncService.configureSyncJob({ shopifyShopId });
    
    syncJobConfigured.value = true;
    showToast(translate("Product sync job scheduled successfully."));
    await checkSyncJobConfig(); // Refresh state
  } catch (error) {
    logger.error("Failed to configure sync job", error);
    showToast(translate("Failed to schedule job."));
  }
  isSyncJobConfiguring.value = false;
}

function acceptPreflightAndOpenStartSync() {
  if (!preflightWarningConfirmed.value) return;
  preflightAccepted.value = true;
  showMistakeModal.value = false;
  openStartSyncModal();
}

async function startProductSync() {
  if (!canStartProductSync(draft.value.startConfirmed)) return;
  isSaving.value = true;
  try {
    const result = await ShopifyProductSyncService.startInitialImport({
      shopId: props.id
    });
    assertBackendDataAvailable(result, translate("Product sync import backend is unavailable."));

    if (shouldShowProductSyncProgress(result)) {
      syncJobId.value = result.syncJobId || result.progress?.syncJobId;
      progressState.value = result.progress || progressState.value;
      if (progressState.value.systemMessageId) {
        await fetchSyncRun(progressState.value.systemMessageId);
      }
      draft.value.syncStarted = true;
      showStartSyncModal.value = false;
      currentStep.value = "progress";
      const loadedProgress = await loadProgress();
      if (loadedProgress) startProgressPolling();
    } else {
      showToast(result.error || translate("Product sync could not be started."));
    }
  } catch (error: any) {
    logger.error(error);
    showToast(translate("Failed to start product sync"));
  }
  isSaving.value = false;
}

async function loadProgress() {
  if (!syncJobId.value) return false;
  try {
    const progress = await ShopifyProductSyncService.fetchProgress({
      shopId: props.id,
      syncJobId: syncJobId.value
    });
    assertBackendDataAvailable(progress, translate("Product sync progress is unavailable."));
    progressState.value = progress;

    if (progressState.value.systemMessageId) {
      await fetchSyncRun(progressState.value.systemMessageId);
    }

    if (reconcileAvailable.value) {
      stopProgressPolling();
    }
    return true;
  } catch (error: any) {
    logger.error(error);
    stopProgressPolling();
    progressState.value = {
      ...progressState.value,
      status: "error",
      error: getErrorMessage(error, translate("Failed to load product sync progress"))
    };
    showToast(translate("Failed to load product sync progress"));
    return false;
  }
}

function startProgressPolling() {
  stopProgressPolling();
  progressPoll = window.setInterval(loadProgress, 5000);
}

function stopProgressPolling() {
  if (progressPoll) {
    window.clearInterval(progressPoll);
    progressPoll = undefined;
  }
}

function startNextSyncRefreshPolling() {
  stopNextSyncRefreshPolling();
  currentTimeMs.value = Date.now();
  nextSyncRefreshPoll = window.setInterval(() => {
    currentTimeMs.value = Date.now();
  }, 60000);
}

function stopNextSyncRefreshPolling() {
  if (nextSyncRefreshPoll) {
    window.clearInterval(nextSyncRefreshPoll);
    nextSyncRefreshPoll = undefined;
  }
}

async function loadReconcile() {
  try {
    const reconcile = await ShopifyProductSyncService.fetchReconcile({
      shopId: props.id,
      productStoreId: draft.value.selectedProductStoreId,
      syncJobId: syncJobId.value
    });
    assertBackendDataAvailable(reconcile, translate("Product sync reconciliation is unavailable."));
    reconcileState.value = reconcile;
    if (!reviewStats.value.loaded) {
      const loadedReviewStats = await loadReviewStats();
      if (!loadedReviewStats) return false;
    }
    return true;
  } catch (error: any) {
    logger.error(error);
    showToast(translate("Failed to load product sync reconciliation."));
    return false;
  }
}

function isJobPaused(job: any) {
  const status = String(job?.statusId || job?.status || "").toLowerCase();
  return job?.paused === "Y" || job?.paused === true || job?.isPaused === true || status === "paused";
}

function getRelativeNextRunLabel(job: any) {
  if (!job?.cronExpression) {
    return translate("Not scheduled");
  }
  if (isJobPaused(job)) {
    return translate("Paused");
  }

  const nextRun = getNextRunDateTime(job);
  if (!nextRun) {
    return translate("Scheduled");
  }

  const diffInMinutes = Math.max(0, Math.round(nextRun.diff(DateTime.fromMillis(currentTimeMs.value), "minutes").minutes));
  if (diffInMinutes < 1) {
    return translate("Now");
  }
  if (diffInMinutes === 1) {
    return translate("1 min");
  }
  return translate("{count} mins", { count: diffInMinutes });
}

function getCronDescription(cronExpression: string) {
  if (!cronExpression) return "";

  try {
    return cronstrue.toString(cronExpression);
  } catch (error) {
    return "";
  }
}

function getNextRunDateTime(job: any) {
  const nextExecutionDateTime = job?.nextExecutionDateTime || job?.nextRunTime || job?.nextRunDate || job?.nextRuntime;
  if (nextExecutionDateTime) {
    const parsed = DateTime.fromISO(nextExecutionDateTime);
    if (parsed.isValid) return parsed;
    const parsedJsDate = DateTime.fromJSDate(new Date(nextExecutionDateTime));
    if (parsedJsDate.isValid) return parsedJsDate;
  }

  if (!job?.cronExpression) return null;

  try {
    const interval = CronExpressionParser.parse(job.cronExpression, {
      tz: userProfile.value?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      currentDate: new Date(currentTimeMs.value)
    });
    return DateTime.fromMillis(interval.next().getTime());
  } catch (error) {
    logger.error("Failed to calculate next service job run", error);
    return null;
  }
}

function getJobNextRunLabel(job: any) {
  if (!job?.jobName) {
    return translate("Unavailable");
  }
  if (!job?.cronExpression) {
    return translate("Not scheduled");
  }
  if (isJobPaused(job)) {
    return translate("Paused");
  }

  const nextRun = getNextRunDateTime(job);
  if (!nextRun) {
    return translate("Scheduled");
  }

  return `${nextRun.toLocaleString(DateTime.DATETIME_SHORT)} (${getRelativeNextRunLabel(job)})`;
}

function formatDateTime(value: string) {
  if (!value) return translate("Unavailable");
  return new Date(value).toLocaleString();
}

function formatParameterValue(value: unknown) {
  if (value === undefined || value === null || value === "") return translate("Unavailable");
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function getSyncJobStatusLabel(job: any) {
  return job?.statusId || job?.status || (isJobPaused(job) ? translate("Paused") : translate("Active"));
}

function getSyncJobRunKey(run: any) {
  return run.jobRunId || run.runId || run.serviceJobRunId || run.systemMessageId || run.createdDate || JSON.stringify(run);
}

function getSyncJobRunTitle(run: any) {
  return run.jobRunId || run.runId || run.serviceJobRunId || run.systemMessageId || translate("Run");
}

function getSyncJobRunStartedAt(run: any) {
  return run.runTime ||
    run.runDate ||
    run.startDate ||
    run.startTime ||
    run.startedDate ||
    run.startedAt ||
    run.runStartDate ||
    run.createdDate ||
    run.createdStamp ||
    "";
}

function getSyncJobRunCompletedAt(run: any) {
  return run.endDate ||
    run.endTime ||
    run.finishDateTime ||
    run.finishedAt ||
    run.completedDate ||
    run.completedAt ||
    run.lastUpdatedStamp ||
    "";
}

function getSyncJobRunStatus(run: any) {
  if (run.hasError === "Y") return translate("Failed");
  if (getSyncJobRunCompletedAt(run)) return translate("Success");
  if (getSyncJobRunStartedAt(run)) return translate("Running");
  return translate("Terminated");
}

function getSyncJobRunStatusColor(run: any) {
  if (run.hasError === "Y") return "danger";
  if (getSyncJobRunCompletedAt(run)) return "success";
  if (getSyncJobRunStartedAt(run)) return "primary";
  return "warning";
}

function getSyncJobRunDuration(run: any) {
  if (run.runtime) return `${run.runtime} ms`;
  if (run.elapsedTime) return `${run.elapsedTime} ms`;

  const startTime = parseDateTimeValue(getSyncJobRunStartedAt(run));
  const endTime = parseDateTimeValue(getSyncJobRunCompletedAt(run));
  if (!startTime || !endTime) return "";

  const diff = endTime.diff(startTime, ["minutes", "seconds"]).toObject();
  const minutes = Math.floor(diff.minutes || 0);
  const seconds = Math.floor(diff.seconds || 0);

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function getSyncJobRunCount(run: any) {
  if (run.objectCount) return `${run.objectCount} ${translate("objects")}`;
  if (run.totalRecordCount) return `${run.totalRecordCount} ${translate("records")}`;
  return "";
}

function getSyncJobRunUser(run: any) {
  return run.userId || run.runAsUser || run.createdByUserLogin || "";
}

function getSyncJobRunMessage(run: any) {
  const messageCandidates = [
    run.outputMessage,
    run.output,
    run.responseMessage,
    run.resultMessage,
    run.runMessage,
    run.statusMessage,
    run.successMessage,
    run.returnMessage,
    run.message,
    run.messages,
    run.errorMessage,
    run.error,
    run.errors,
    run.reason,
    run.serviceResult,
    run.result,
    run.response
  ];

  for (const message of messageCandidates) {
    const formattedMessage = formatSyncJobRunMessageValue(message);
    if (formattedMessage) return formattedMessage;
  }

  return "";
}

function formatSyncJobRunMessageValue(value: any): string {
  if (value === undefined || value === null || value === "") return "";

  if (Array.isArray(value)) {
    return value.map(formatSyncJobRunMessageValue).filter(Boolean).join(", ");
  }

  if (typeof value === "object") {
    const nestedMessage = value.outputMessage || value.responseMessage || value.resultMessage || value.message || value.errorMessage || value.reason;
    if (nestedMessage) return formatSyncJobRunMessageValue(nestedMessage);

    try {
      return JSON.stringify(value);
    } catch (error) {
      return "";
    }
  }

  return String(value).trim();
}

function parseDateTimeValue(value: string | number) {
  if (!value) return null;

  if (typeof value === "number") {
    const dateTime = DateTime.fromMillis(value);
    return dateTime.isValid ? dateTime : null;
  }

  const candidates = [
    DateTime.fromFormat(value, "yyyy-MM-dd HH:mm:ss.SSS"),
    DateTime.fromSQL(value),
    DateTime.fromISO(value),
    DateTime.fromJSDate(new Date(value))
  ];

  return candidates.find((candidate) => candidate.isValid) || null;
}

function getErrorMessage(error: any, defaultMessage: string) {
  const message = error?.response?.data?.error ||
    error?.response?.data?.errors ||
    error?.data?.error ||
    error?.message ||
    defaultMessage;
  return typeof message === "string" ? message : JSON.stringify(message);
}

function assertBackendDataAvailable(payload: any, message: string) {
  if (payload?.backendAvailable === false) {
    throw new Error(message);
  }
}

</script>
