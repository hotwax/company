<template>
  <section class="sync-summary">
    <ion-card class="summary">
      <ion-card-header>
        <ion-card-title>{{ translate("Summary") }}</ion-card-title>
        <ion-card-subtitle>{{ summarySubtitle }}</ion-card-subtitle>
        <ion-buttons>
          <ion-button fill="clear" :disabled="!syncJobObj" @click="emit('run-job', syncJobObj)">

            <ion-icon slot="icon-only" :icon="flashOutline" />
          </ion-button>


          <ion-button fill="clear" @click="openActionsPopover($event)">
            <ion-icon slot="icon-only" :icon="ellipsisVerticalOutline" />
          </ion-button>

        </ion-buttons>
      </ion-card-header>
      <ion-list lines="full">
        <ion-item>
          <ion-label>
            {{ translate("Last sync") }}
            <p>{{ lastSyncLabel }}</p>
          </ion-label>
          <ion-label slot="end">{{ lastSyncRelativeLabel }}</ion-label>
        </ion-item>
        <ion-item>
          <ion-label>{{ translate("Updates synced") }}</ion-label>
          <ion-label slot="end"><AnimatedNumber :value="Number(lastSyncTotalRecordCount) || 0" /></ion-label>
        </ion-item>
        <ion-item :button="!isSecondaryLoading && isSyncScheduled" :detail="!isSecondaryLoading && isSyncScheduled" @click="!isSecondaryLoading && isSyncScheduled ? emit('open-sync-job-details') : undefined">
          <ion-label>{{ translate("Next sync time") }}
            <p v-if="isSecondaryLoading"><ion-skeleton-text animated style="width: 60%" /></p>
            <p v-else-if="isSyncScheduled">{{ nextSyncLabel }}</p>
          </ion-label>
          <ion-spinner slot="end" v-if="isSecondaryLoading" name="crescent" />
          <ion-badge slot="end" color="warning" v-else-if="isSyncPaused">{{ translate("Paused") }}</ion-badge>
          <ion-label slot="end" v-else-if="isSyncScheduled">{{ nextSyncRelativeLabel }}</ion-label>
          <ion-button slot="end" fill="outline" color="primary" v-else @click.stop="emit('open-sync-job-details', syncJobObj)">{{ translate("Schedule") }}</ion-button>
        </ion-item>
        <ion-item button detail @click="emit('open-unsynced-updates')">
          <ion-label>{{ translate("Un-synced updates") }}</ion-label>
          <ion-badge slot="end" color="medium"><AnimatedNumber :value="Number(unsyncedUpdatesCount) || 0" /></ion-badge>
        </ion-item>
        <ion-item lines="none">
          <ion-label>{{ translate("Product store") }}</ion-label>
          <ion-label slot="end">{{ selectedProductStoreName }}</ion-label>
        </ion-item>
      </ion-list>
    </ion-card>

    <ion-card class="progress">
      <ion-card-header>
        <ion-card-title>{{ translate("Track sync progress") }}</ion-card-title>
        <ion-card-subtitle>{{ translate("Monitor each step as products get imported from Shopify") }}</ion-card-subtitle>
        <ion-buttons>
          <ion-button fill="clear" @click="emit('open-history')">
            <ion-icon slot="icon-only" :icon="timeOutline" />
          </ion-button>
        </ion-buttons>
      </ion-card-header>
      <ion-list lines="full">
        <template v-if="isSecondaryLoading">
          <ion-item v-for="i in 3" :key="i">
            <ion-label>
              <ion-skeleton-text animated style="width: 30%" />
              <p><ion-skeleton-text animated style="width: 70%" /></p>
              <p><ion-skeleton-text animated style="width: 50%" /></p>
            </ion-label>
          </ion-item>
        </template>
        <template v-else-if="currentSyncRun && currentSyncRun.systemMessageId">
          <ion-item button detail @click="emit('open-step-details', { type: 'systemMessage', id: currentSyncRun.systemMessageId })">
            <ion-label>
              {{ translate("System message") }}
              <p>
                {{ currentSyncRun.systemMessageId }} · {{ translate("Created") }} 
                <AnimatedDuration :start-time="currentSyncRun.systemMessage?.initDate || currentSyncRun.systemMessage?.createdDate" />
              </p>
              <p>{{ systemMessageProgressLabel }}</p>
              <p v-if="systemMessageErrorText">{{ systemMessageErrorText }}</p>
            </ion-label>
            <ion-badge slot="end" :color="currentSyncRun.systemMessage?.statusColor || 'medium'">{{ currentSyncRun.systemMessage?.statusLabel || translate("Pending") }}</ion-badge>
          </ion-item>
          <ion-item v-if="hasNextStepBar" lines="none">
            <ion-progress-bar :value="nextStepProgressValue" />
            <ion-buttons slot="end">
              <ion-button
                v-if="systemMessageFsmState.primaryAction"
                :disabled="!!systemMessageActionLoadingId"
                @click="emit('run-system-message-action', systemMessageFsmState.primaryAction.id)"
              >
                <ion-spinner v-if="systemMessageActionLoadingId === systemMessageFsmState.primaryAction.id" name="crescent" />
                <template v-else>{{ systemMessageFsmState.primaryAction.label }}</template>
              </ion-button>
              <ion-button
                v-for="action in systemMessageFsmState.secondaryActions"
                :key="action.id"
                fill="clear"
                color="medium"
                :disabled="!!systemMessageActionLoadingId"
                @click="emit('run-system-message-action', action.id)"
              >
                <ion-spinner v-if="systemMessageActionLoadingId === action.id" name="crescent" />
                <span v-else>{{ action.label }}</span>
              </ion-button>
            </ion-buttons>
          </ion-item>
          <ion-item v-else-if="systemMessageFsmState.nextJob || systemMessageFsmState.primaryAction || systemMessageFsmState.secondaryActions.length" lines="none">
            <ion-label>
              {{ translate("Next step") }}
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
                @click="emit('run-system-message-action', systemMessageFsmState.primaryAction.id)"
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
                @click="emit('run-system-message-action', action.id)"
              >
                <ion-spinner v-if="systemMessageActionLoadingId === action.id" slot="start" name="crescent" />
                <span v-else>{{ action.label }}</span>
              </ion-button>
            </ion-buttons>
          </ion-item>
          <ion-item button detail @click="emit('open-step-details', { type: 'bulkOperation', id: currentSyncRun.bulkOperation?.id })" :disabled="!currentSyncRun.bulkOperation?.id">
            <ion-label>
              {{ translate("Shopify bulk operation") }}
              <p>{{ currentSyncRun.bulkOperation?.id || translate("Not started") }}</p>
              <p v-if="currentSyncRun.bulkOperation?.createdAt">
                {{ translate("Duration") }}: 
                <AnimatedDuration 
                  :start-time="currentSyncRun.bulkOperation.createdAt" 
                  :end-time="currentSyncRun.bulkOperation.completedAt" 
                />
              </p>
              <p v-else>{{ bulkOperationProgressLabel }}</p>
            </ion-label>
            <ion-note slot="end" v-if="currentSyncRun.bulkOperation?.objectCount">
              {{ currentSyncRun.bulkOperation.objectCount }} {{ translate("objects") }}
            </ion-note>
            <ion-badge slot="end" :color="currentSyncRun.bulkOperation?.isStatusUnavailable ? 'medium' : (currentSyncRun.bulkOperation?.statusColor || 'medium')">
              {{ currentSyncRun.bulkOperation?.isStatusUnavailable ? translate("Unavailable") : (currentSyncRun.bulkOperation?.statusLabel || translate("Pending")) }}
            </ion-badge>
          </ion-item>
          <ion-item button detail @click="emit('open-step-details', { type: 'mdmLog', id: currentSyncRun.mdmLog?.id })" :disabled="!currentSyncRun.mdmLog?.id && normalizeSyncStepStatus(currentSyncRun.mdmLog?.statusId) !== 'skipped'">
            <ion-label>
              {{ translate("HotWax bulk import") }}
              <p v-if="currentSyncRun.mdmLog?.id">
                {{ currentSyncRun.mdmLog.id }} · {{ translate("Started") }} 
                <AnimatedDuration 
                  :start-time="currentSyncRun.mdmLog.startDate" 
                />
              </p>
              <p v-else>{{ mdmLogMetaLabel }}</p>
              <p v-if="currentSyncRun.mdmLog?.startDate">
                {{ currentSyncRun.mdmLog?.statusLabel || translate("Pending") }} 
                <AnimatedDuration 
                  :start-time="currentSyncRun.mdmLog.startDate" 
                  :end-time="currentSyncRun.mdmLog.finishDateTime || currentSyncRun.mdmLog.completedDate" 
                />
              </p>
              <p v-if="mdmLogHasFailedRecords">{{ mdmLogFailedRecordsLabel }}</p>
              <p v-else>{{ mdmLogProgressLabel }}</p>
            </ion-label>
            <ion-note slot="end" v-if="currentSyncRun.mdmLog?.totalRecordCount && !mdmLogHasFailedRecords">
              {{ currentSyncRun.mdmLog.totalRecordCount }} {{ translate("records") }}
            </ion-note>
            <ion-badge slot="end" :color="mdmLogBadgeColor">{{ mdmLogBadgeLabel }}</ion-badge>
          </ion-item>
        </template>
        <ion-item v-else>
          <ion-label>{{ translate("No recent sync history, run your sync now to fetch latest updates") }}</ion-label>
        </ion-item>
      </ion-list>
    </ion-card>
  </section>

  <section class="sync-monitor">
    <ion-item lines="none">
      <ion-label>
        {{ translate("Sync monitor") }}
        <p>{{ translate("Review sync jobs that make the sync operations work") }}</p>
      </ion-label>
    </ion-item>
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ translate("Product sync jobs") }}</ion-card-title>
        <ion-card-subtitle>{{ translate("Review the jobs that move product updates through the sync pipeline") }}</ion-card-subtitle>
      </ion-card-header>
      <ion-list>
        <ion-item button detail :disabled="!syncJobObj" @click="emit('open-sync-job-details', syncJobObj)">
          <ion-label>
            {{ translate("Queue update requests") }}
            <p>{{ queueUpdateRequestsLastRunLabel }}</p>
          </ion-label>
          <ion-icon slot="end" :icon="isSyncPaused ? pauseCircleOutline : checkmarkCircleOutline"></ion-icon>
        </ion-item>
        <ion-item button detail :disabled="!sendUpdateRequestJobObj?.jobName" @click="emit('open-sync-job-details', sendUpdateRequestJobObj)">
          <ion-label>
            {{ translate("Send update request") }}
            <p>{{ sendUpdateRequestLastRunLabel }}</p>
          </ion-label>
          <ion-icon slot="end" :icon="sendUpdateRequestPaused ? pauseCircleOutline : checkmarkCircleOutline"></ion-icon>
        </ion-item>
        <ion-item button detail :disabled="!importCompletedRequestsJobObj?.jobName" @click="emit('open-sync-job-details', importCompletedRequestsJobObj)">
          <ion-label>
            {{ translate("Import completed requests") }}
            <p>{{ importCompletedRequestsLastRunLabel }}</p>
          </ion-label>
          <ion-icon slot="end" :icon="importCompletedRequestsPaused ? pauseCircleOutline : checkmarkCircleOutline"></ion-icon>
        </ion-item>
        <ion-item v-if="isWebhookSupported" button detail @click="emit('toggle-webhook', !isWebhookSubscribed)">
          <ion-label>
            {{ translate("Bulk operations finish webhook") }}
            <p v-if="isWebhookSubscribed">{{ translate("Active") }}</p>
            <p v-else>{{ translate("Inactive") }}</p>
          </ion-label>
          <ion-spinner v-if="isWebhookLoading" slot="end" name="crescent" />
          <ion-icon v-else slot="end" :icon="isWebhookSubscribed ? checkmarkCircleOutline : pauseCircleOutline"></ion-icon>
        </ion-item>
      </ion-list>
    </ion-card>
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ translate("Pipeline") }}</ion-card-title>
        <ion-card-subtitle>{{ translate("Monitor how the sync pipeline is performing") }}</ion-card-subtitle>
      </ion-card-header>
      <ion-list>
        <ion-item>
          <ion-label>
            {{ translate("Pending update requests")}}
            <p>{{ pendingUpdateRequestsSubtitle }}</p>
          </ion-label>
          <ion-label slot="end"><AnimatedNumber :value="Number(pendingUpdateRequestsCount) || 0" /></ion-label>
        </ion-item>
        <ion-item>
          <ion-label>
            {{ translate("Current Shopify request status")}}
            <p>{{ currentShopifyRequestSubtitle }}</p>
          </ion-label>
          <ion-badge slot="end" :color="hasCurrentShopifyRequest ? currentShopifyRequestStatusColor : 'medium'">{{ hasCurrentShopifyRequest ? currentShopifyRequestStatusLabel : translate("Idle") }}</ion-badge>
        </ion-item>
        <ion-item>
          <ion-label>
            {{ translate("Update files to process")}}
          </ion-label>
          <ion-label slot="end"><AnimatedNumber :value="Number(updateFilesToProcessCount) || 0" /></ion-label>
        </ion-item>
        <ion-item>
          <ion-label>
            {{ translate("Error records")}}
            <p>{{ translate("In the last 24 hours") }}</p>
          </ion-label>
          <ion-label slot="end"><AnimatedNumber :value="Number(errorRecordCount) || 0" /></ion-label>
        </ion-item>
      </ion-list>
    </ion-card>

    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ translate("Custom request") }}</ion-card-title>
        <ion-card-subtitle>{{ translate("Override the scheduled sync with a custom request") }}</ion-card-subtitle>
      </ion-card-header>
      <ion-list>
        <ion-item button detail @click="emit('open-specific-products-sync')">
          <ion-label>
            {{ translate("Sync specific products") }}
            <p>{{ translate("Select products to run the product sync for on demand") }}</p>
          </ion-label>
        </ion-item>
        <ion-item button detail @click="emit('open-replay-sync')">
          <ion-label>
            {{ translate("Replay sync from a certain time") }}
            <p>{{ translate("Rewind the last sync time to reimport updates") }}</p>
          </ion-label>
        </ion-item>
        <ion-item button detail @click="emit('open-resync-entire-catalog')">
          <ion-label>
            {{ translate("Re-sync entire catalog") }}
            <p>{{ translate("Download the entire product catalog from Shopify again. Use with caution") }}</p>
          </ion-label>
        </ion-item>
      </ion-list>
    </ion-card>
  </section>

  <section class="sync-stat">
    <ion-progress-bar v-if="isRefreshing" type="indeterminate" />
    <div class="stat-header">
      <ion-item class="stat-title" lines="none">
        <ion-label>
          <h2>{{ translate("Recently synced product updates") }}</h2>
          <p>{{ translate("Audit what products were recently updated and what exactly changed in them") }}</p>
        </ion-label>
      </ion-item>
      <ion-searchbar v-model="updatesQuery" :placeholder="translate('Search by internal name')" />
    </div>
    <div class="stat-data">
        <transition-group name="list" tag="div" class="list-transition-group">
          <template v-if="isSecondaryLoading">
            <ion-card v-for="i in 4" :key="i">
              <ion-list lines="full">
                <ion-item>
                  <ion-label>
                    <ion-skeleton-text animated style="width: 60%" />
                    <p><ion-skeleton-text animated style="width: 40%" /></p>
                    <p><ion-skeleton-text animated style="width: 30%" /></p>
                  </ion-label>
                  <ion-note slot="end"><ion-skeleton-text animated style="width: 50px" /></ion-note>
                </ion-item>
                <ion-card-content>
                  <ion-chip v-for="j in 2" :key="j">
                    <ion-label><ion-skeleton-text animated style="width: 40px" /></ion-label>
                  </ion-chip>
                </ion-card-content>
                <ion-item>
                  <ion-label>
                    <ion-skeleton-text animated style="width: 20%" />
                  </ion-label>
                </ion-item>
              </ion-list>
            </ion-card>
          </template>
          <template v-else-if="filteredUpdates.length">
            <ion-card v-for="item in filteredUpdates" :key="item.id">
              <ion-list lines="full">
                <ion-item>
                  <ion-label class="ion-text-wrap">
                    {{ item.parentTitle || item.internalName }}
                    <p v-if="item.variantTitle && item.variantTitle !== item.parentTitle">{{ item.variantTitle }}</p>
                    <p v-if="item.sku">{{ translate("SKU") }}: {{ item.sku }}</p>
                  </ion-label>
                  <ion-note slot="end">{{ item.updatedTime }}</ion-note>
                </ion-item>
                <ion-item>
                  <ion-label>
                    <p>{{ item.shopifyIdLabel || item.shopifyId }}</p>
                  </ion-label>
                  <ion-button
                    slot="end"
                    v-if="item.shopifyAdminUrl"
                    fill="clear"
                    color="medium"
                    :href="item.shopifyAdminUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                    @click.stop
                  >
                    <ion-icon slot="icon-only" :icon="openOutline" />
                  </ion-button>
                </ion-item>
                <ion-card-content v-if="item.details.length">
                  <ion-chip v-for="label in getChangeSummary(item.details)" :key="label">
                    <ion-label>{{ label }}</ion-label>
                  </ion-chip>
                </ion-card-content>

                <ion-accordion-group>
                  <ion-accordion :value="item.id">
                    <ion-item slot="header">
                      <ion-label>
                        {{ translate("Changes") }}
                        <p>{{ translate("Review field-level updates") }}</p>
                      </ion-label>
                      <ion-badge slot="end" color="medium">{{ item.details.length }}</ion-badge>
                    </ion-item>
                    <ion-list slot="content" lines="full">
                      <ion-item v-for="(detail, index) in item.details" :key="index">
                        <ion-label class="ion-text-wrap">
                          <h3>{{ detail.label }}</h3>
                          <p :class="detail.type === 'added' ? 'ion-text-success' : 'ion-text-danger'">
                            {{ getDetailActionLabel(detail.type) }}
                          </p>
                          <template v-if="detail.items?.length">
                            <p v-for="(detailItem, detailItemIndex) in detail.items" :key="detailItemIndex">
                              <template v-if="detailItem.label">{{ detailItem.label }}: </template>{{ detailItem.value }}
                            </p>
                          </template>
                          <p v-else>{{ detail.value }}</p>
                        </ion-label>
                      </ion-item>
                    </ion-list>
                  </ion-accordion>
                </ion-accordion-group>

                <ion-item v-if="!item.details.length">
                  <ion-label>{{ translate("No details found for this update") }}</ion-label>
                </ion-item>
              </ion-list>
            </ion-card>
          </template>
          <ion-card v-else key="no-updates-card">
            <ion-list lines="full">
              <ion-item>
                <ion-label>{{ translate("No recently synced product updates") }}</ion-label>
              </ion-item>
            </ion-list>
          </ion-card>
        </transition-group>
    </div>
  </section>


  <section class="sync-stat">
    <ion-progress-bar v-if="isRefreshing || isErrorLogsLoading" type="indeterminate" />
    <div class="stat-header">
        <ion-item class="stat-title" lines="none">
          <ion-label>
            <h2>{{ translate("Parsed error details") }}</h2>
            <p>{{ failedRecords.length }} {{ translate("of") }} {{ totalDetailedErrorsCount }} {{ translate("failed objects") }}</p>
          </ion-label>
        </ion-item>
      <ion-buttons slot="end" v-if="hasDetailedErrors">
        <ion-button color="medium" @click="emit('refresh-errors')">
          <ion-icon slot="icon-only" :icon="refreshOutline" />
        </ion-button>
      </ion-buttons>
      <ion-searchbar :value="detailedErrorQuery" @ionInput="emit('update:detailed-error-query', $event.detail.value)" :placeholder="translate('Search by ID, Name or Handle')" />
    </div>
    <div class="stat-data">
      <transition-group name="list" tag="div" class="list-transition-group">
        <ion-card v-for="record in failedRecords" :key="record.id">
          <ion-item lines="full">
            <ion-label class="ion-text-wrap">
              <h3>{{ record.title }}</h3>
              <p v-if="record.handle">{{ record.handle }}</p>
            </ion-label>
          </ion-item>
          <ion-card-content>
            <p class="ion-no-margin">
              <strong>{{ translate("Product ID") }}:</strong> {{ record.numericId || 'N/A' }}
            </p>
            <p class="ion-no-margin ion-margin-top">
              {{ record.error }}
            </p>
            <div class="ion-margin-top">
              <ion-button fill="clear" size="small" class="ion-no-padding" @click="emit('show-error-modal', record)">
                {{ translate("View details") }}
              </ion-button>
              <ion-button fill="clear" size="small" color="primary" @click="emit('resync-product', record)">
                {{ translate("Retry") }}
              </ion-button>
            </div>
          </ion-card-content>
        </ion-card>
        <ion-card v-if="!failedRecords.length" key="no-failed-records-card">
          <ion-item lines="none">
            <ion-label class="ion-text-center">
              <p v-if="detailedErrorQuery">{{ translate("No records match your search.") }}</p>
              <p v-else>{{ translate("All caught up! No recent errors found.") }}</p>
            </ion-label>
          </ion-item>
        </ion-card>
      </transition-group>
    </div>
  </section>


</template>

<script setup lang="ts">
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
  IonIcon,
  IonItem,
  IonChip,
  IonLabel,
  IonList,
  IonNote,
  IonSearchbar,
  IonSkeletonText,
  IonSpinner
} from "@ionic/vue";
import { translate } from "@/i18n";
import { computed, defineEmits, defineProps, onBeforeUnmount, onMounted, ref } from "vue";
import { checkmarkCircleOutline, ellipsisVerticalOutline, flashOutline, openOutline, pauseCircleOutline, refreshOutline, timeOutline } from "ionicons/icons";
import { popoverController } from "@ionic/vue";
import AnimatedNumber from "@/components/AnimatedNumber.vue";
import AnimatedDuration from "@/components/AnimatedDuration.vue";

import ShopifyProductSyncActionsPopover from "./ShopifyProductSyncActionsPopover.vue";
import type { ShopifyProductSyncRun } from "@/services/ShopifyProductSyncService";
import type { ProductSyncFsmState } from "@/utils/shopifyProductSyncFsm";

const props = defineProps<{

  isSyncScheduled?: boolean
  isSyncPaused?: boolean
  lastSyncLabel: string
  lastSyncRelativeLabel: string
  lastSyncTotalRecordCount: number | string
  nextSyncLabel: string
  nextSyncRelativeLabel: string
  systemMessageProgressLabel: string
  bulkOperationProgressLabel: string
  mdmLogMetaLabel: string
  mdmLogProgressLabel: string
  summarySubtitle: string
  errorLookbackCount: number
  currentSyncRun?: ShopifyProductSyncRun
  systemMessageFsmState: ProductSyncFsmState
  systemMessageActionLoadingId?: string
  recentSyncUpdates: Array<{
    id: string,
    internalName: string,
    parentTitle?: string,
    variantTitle?: string,
    sku?: string,
    shopifyId: string,
    shopifyIdLabel?: string,
    shopifyAdminUrl?: string,
    updatedTime: string,
    details: Array<{ type: string, label: string, value: string, items?: Array<{ label?: string, value: string }> }>
  }>
  selectedProductStoreName: string
  unsyncedUpdatesCount: number | string
  pendingUpdateRequestsCount: number | string
  pendingUpdateRequestsSubtitle: string
  queueUpdateRequestsLastRunLabel: string
  sendUpdateRequestLastRunLabel: string
  sendUpdateRequestPaused?: boolean
  sendUpdateRequestJobObj?: any
  importCompletedRequestsLastRunLabel: string
  importCompletedRequestsPaused?: boolean
  importCompletedRequestsJobObj?: any
  currentShopifyRequestSubtitle: string
  currentShopifyRequestStatusLabel: string
  currentShopifyRequestStatusColor: string
  hasCurrentShopifyRequest?: boolean
  syncJobObj?: any
  isSecondaryLoading?: boolean
  isRefreshing?: boolean
  isErrorLogsLoading?: boolean
  errorRecordCount: number | string
  failedRecords: Array<{ id: string, numericId?: string, logId?: string, title: string, vendor?: string, handle?: string, productType?: string, sku?: string, barcode?: string, error: string }>
  detailedErrorQuery: string
  hasDetailedErrors: boolean
  totalDetailedErrorsCount: number
  updateFilesToProcessCount: number | string
  isWebhookSubscribed?: boolean
  isWebhookLoading?: boolean
  isWebhookSupported?: boolean
}>();
const emit = defineEmits(["open-history", "schedule-sync", "run-job", "run-system-message-action", "open-unsynced-updates", "open-specific-products-sync", "open-replay-sync", "open-resync-entire-catalog", "open-sync-job-details", "open-step-details", "toggle-pause-sync-job", "download-file", "view-error-details", "update:detailed-error-query", "show-error-modal", "refresh-errors", "resync-product", "toggle-webhook"]);





async function openActionsPopover(event: Event) {
  const popover = await popoverController.create({
    component: ShopifyProductSyncActionsPopover,
    componentProps: {
      isPaused: props.isSyncPaused
    },
    event,
    showBackdrop: false
  });
  await popover.present();

  const { data } = await popover.onDidDismiss();
  if (data?.action === 'reschedule') {
    emit('open-sync-job-details', props.syncJobObj);
  } else if (data?.action === 'pause') {
    emit("toggle-pause-sync-job", true);
  } else if (data?.action === 'resume') {
    emit("toggle-pause-sync-job", false);
  }
}



const updatesQuery = ref("");
const visibleChangeSummaryCount = 4;

// Bar between now and the next scheduled run of the next-step job.
// Driven by `nextStepNowMs` which ticks every 500ms while the component is mounted.
const nextStepNowMs = ref(Date.now());
let nextStepTickHandle: number | undefined;
onMounted(() => {
  nextStepTickHandle = window.setInterval(() => { nextStepNowMs.value = Date.now(); }, 500);
});
onBeforeUnmount(() => {
  if (nextStepTickHandle) window.clearInterval(nextStepTickHandle);
});

const hasNextStepBar = computed(() => {
  const job = props.systemMessageFsmState?.nextJob;
  if (!job || job.paused) return false;
  if (!job.nextRunAtMs || !job.previousRunAtMs) return false;
  return job.nextRunAtMs > job.previousRunAtMs;
});

const nextStepProgressValue = computed(() => {
  const job = props.systemMessageFsmState?.nextJob;
  if (!job?.nextRunAtMs || !job?.previousRunAtMs) return 0;
  const total = job.nextRunAtMs - job.previousRunAtMs;
  if (total <= 0) return 0;
  const remaining = job.nextRunAtMs - nextStepNowMs.value;
  if (remaining <= 0) return 0;
  return Math.min(1, Math.max(0, remaining / total));
});

function getDetailActionLabel(type: string) {
  return type === "added" ? translate("Added") : translate("Removed");
}

function getChangeSummary(details: Array<{ label: string }>) {
  const labels = [...new Set(details.map((detail) => detail.label).filter(Boolean))];
  if (labels.length <= visibleChangeSummaryCount) return labels;
  return [
    ...labels.slice(0, visibleChangeSummaryCount),
    `+${labels.length - visibleChangeSummaryCount} more`
  ];
}

const filteredUpdates = computed(() => {
  const query = updatesQuery.value.trim().toLowerCase();
  if (!query) return props.recentSyncUpdates;

  return props.recentSyncUpdates.filter((item) => {
    return item.internalName.toLowerCase().includes(query) ||
      String(item.parentTitle || "").toLowerCase().includes(query) ||
      String(item.variantTitle || "").toLowerCase().includes(query) ||
      String(item.sku || "").toLowerCase().includes(query) ||
      item.shopifyId.toLowerCase().includes(query);
  });
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
    return `${mdmLogFailedRecordCount.value} ${translate("failed of")} ${mdmLogTotalRecordCount.value} ${translate("records processed")}`;
  }

  return `${mdmLogFailedRecordCount.value} ${translate("failed records")}`;
});
const mdmLogBadgeColor = computed(() => {
  if (mdmLogHasFailedRecords.value) return "danger";
  return props.currentSyncRun?.mdmLog?.statusColor || "medium";
});
const mdmLogBadgeLabel = computed(() => {
  if (mdmLogHasFailedRecords.value) return translate("Errors");
  return props.currentSyncRun?.mdmLog?.statusLabel || translate("Pending");
});
const systemMessageErrorText = computed(() => {
  return String(props.currentSyncRun?.systemMessage?.errorText || "").trim();
});
function normalizeSyncStepStatus(statusId: string) {
  return String(statusId || "").toLowerCase().replace(/[_\-\s]/g, "");
}

</script>

<style>
ion-card-header {
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-areas: "title actions" "subtitle actions";
}

ion-card-title {
  grid-area: title;
}

ion-card-subtitle {
  grid-area: subtitle;
}

ion-buttons {
  grid-area: actions;
}

.sync-summary {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
  align-items: flex-start;
}

.summary{
  grid-column: 1 / 2;
}

.progress{
  grid-column: -1 / -2;
}

.sync-monitor {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
  align-items: flex-start;
}

.sync-monitor ion-item {
  grid-column: 1 / -1;
}

.sync-monitor ion-card {
  flex: 1 0 375px;
}

.stat-header{
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  align-items: center;
}

.stat-title {
  flex: 1 2 375px;
}

.sync-stat ion-searchbar {
  flex: 0 1 375px;
}

.stat-data {
  display: flex;
  flex-wrap: nowrap;
  overflow-x: scroll;
  align-items: flex-start;
}

.stat-data ion-card {
  flex: 0 0 375px;
}

.list-transition-group {
  display: flex;
  flex-wrap: nowrap;
  align-items: flex-start;
}

.list-enter-active,
.list-leave-active {
  transition: all 0.5s ease;
}
.list-leave-active {
  position: absolute;
}
.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: translateX(-30px);
}
.list-move {
  transition: transform 0.5s ease;
}

</style>
