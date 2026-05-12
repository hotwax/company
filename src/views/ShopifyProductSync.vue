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
          :is-secondary-loading="isSecondaryLoading"
          :is-refreshing="isRefreshInFlight"
          :is-sync-scheduled="isSyncScheduled"
          :is-sync-paused="isSyncJobPaused"
          :last-sync-label="lastSyncLabel"
          :last-sync-relative-label="lastSyncRelativeLabel"
          :next-sync-label="nextSyncLabel"
          :next-sync-relative-label="nextSyncRelativeLabel"
          :system-message-progress-label="systemMessageProgressLabel"
          :bulk-operation-progress-label="bulkOperationProgressLabel"
          :mdm-log-meta-label="mdmLogMetaLabel"
          :mdm-log-progress-label="mdmLogProgressLabel"
          :current-sync-run="currentSyncRun"
          :system-message-fsm-state="systemMessageFsmState"
          :system-message-action-loading-id="systemMessageActionLoadingId"
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
          :is-error-logs-loading="isErrorLogsLoading"
          :error-record-count="errorRecordCount"
          :update-files-to-process-count="updateFilesToProcessCount"
          :last-sync-total-record-count="lastSyncTotalRecordCount"
          :failed-records="pagedFilteredParsedErrorRecords"
          :total-detailed-errors-count="filteredParsedErrorRecords.length"
          :has-detailed-errors="recentMdmLogs.length > 0"
          :detailed-error-query="detailedErrorSearchQuery"
          @update:detailed-error-query="detailedErrorSearchQuery = $event"
          @show-error-modal="openErrorDetailsModal"
          @refresh-errors="refreshErrorRecords"
          @resync-product="resyncProduct"
          @open-history="openHistory"
          @open-sync-job-details="openSyncJobDetailsModal"
          @schedule-sync="scheduleSyncJob"
          @toggle-pause-sync-job="togglePauseSyncJob"
          @open-unsynced-updates="openUnsyncedUpdatesModal"
          @open-specific-products-sync="openSpecificProductsSyncModal"
          @open-resync-entire-catalog="openResyncEntireCatalogModal"
          @open-replay-sync="openReplaySyncModal"
          @open-step-details="openStepDetails"
          @run-system-message-action="runSystemMessageAction"
          @run-job="runSyncJob"
          @download-file="downloadRawFile"
          :is-webhook-subscribed="isWebhookSubscribed"
          :is-webhook-loading="isWebhookLoading"
          :is-webhook-supported="isWebhookSupported"
          @toggle-webhook="toggleWebhookSubscription"
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
          :progress-badge-color="progressBadgeColor"
          :progress-state="progressState"
          :progress-status="progressStatus"
          :current-sync-run="currentSyncRun"
          :system-message-fsm-state="systemMessageFsmState"
          :system-message-action-loading-id="systemMessageActionLoadingId"
          :is-progress-complete="isProgressComplete"
          :recommended-identifier-enum-id="recommendedIdentifierEnumId"
          :related-shops="relatedShops"
          :review-ready="reviewReady"
          :review-stats="reviewStats"
          :is-completing-setup="isCompletingSetup"
          :setup-completion-action-label="setupCompletionActionLabel"
          :selected-identifier-label="selectedIdentifierLabel"
          :setup-completion-message="setupCompletionMessage"
          :selected-product-store-name="selectedProductStoreName"
          :send-update-request-last-run-label="bulkOperationSendJobLastRunLabel"
          :import-completed-requests-last-run-label="bulkOperationPollJobLastRunLabel"
          :setup-completion-action-disabled="!canCompleteSetup"
          :shopify-access-badge-color="shopifyAccessBadgeColor"
          :shopify-access-blocking-message="shopifyAccessBlockingMessage"
          :shopify-access-detail="shopifyAccessDetail"
          :shopify-access-label="shopifyAccessLabel"
          :shop-id="id"
          :show-mistake-modal="showMistakeModal"
          :show-start-sync-modal="showStartSyncModal"
          :start-sync-disabled="startSyncDisabled"
          :is-sync-job-config-loaded="isSyncJobConfigLoaded"
          :is-sync-job-configuring="isSyncJobConfiguring"
          :sync-job-configured="syncJobConfigured"
          :sync-job-obj="syncJobObj"
          :latest-sync-job-audit-label="latestSyncJobAuditLabel"
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
          :is-preflight-loading="isPreflightLoading"
          @product-store-change="handleProductStoreChange"
          @start-product-sync="startProductSync"
          @complete-setup="completeSetupAndOpenReturningView"
          @toggle-preflight-warning-confirmation="togglePreflightWarningConfirmation"
          @toggle-product-store-verification="toggleProductStoreVerification"
          @toggle-start-confirmation="toggleStartConfirmation"
          @open-step-details="openStepDetails"
          @run-system-message-action="runSystemMessageAction"
        />
      </template>

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

        <ion-modal :is-open="showResyncEntireCatalogModal" :backdrop-dismiss="false" @didDismiss="showResyncEntireCatalogModal = false">
          <ion-header>
            <ion-toolbar>
              <ion-buttons slot="start">
                <ion-button @click="showResyncEntireCatalogModal = false" :aria-label="translate('Close')">
                  <ion-icon slot="icon-only" :icon="closeOutline" />
                </ion-button>
              </ion-buttons>
              <ion-title>{{ translate("Re-sync entire catalog") }}</ion-title>
            </ion-toolbar>
          </ion-header>
          <ion-content>
            <ion-list lines="full">
              <ion-item lines="none">
                <ion-label>
                  <h2>{{ translate("Re-sync entire catalog") }}</h2>
                  <p>{{ translate("This will import every product currently in Shopify again.") }}</p>
                  <p>{{ translate("This process can take time because Shopify has to export the catalog before HotWax imports it. This will not delete products that were deleted in Shopify.") }}</p>
                </ion-label>
              </ion-item>
              <ion-item>
                <ion-label>
                  {{ translate("Products to import") }}
                  <p>{{ translate("Current products in Shopify") }}</p>
                </ion-label>
                <ion-note slot="end">{{ resyncCatalogProductCountLabel }}</ion-note>
              </ion-item>
              <ion-item>
                <ion-label>
                  {{ translate("Variants to import") }}
                  <p>{{ translate("Current product variants in Shopify") }}</p>
                </ion-label>
                <ion-note slot="end">{{ resyncCatalogVariantCountLabel }}</ion-note>
              </ion-item>
            </ion-list>
          </ion-content>
          <ion-footer>
            <ion-toolbar>
              <ion-buttons slot="start">
                <ion-button fill="clear" @click="showResyncEntireCatalogModal = false" :disabled="isResyncEntireCatalogStarting">{{ translate("Cancel") }}</ion-button>
              </ion-buttons>
              <ion-buttons slot="end">
                <ion-button fill="solid" color="primary" @click="startResyncEntireCatalog" :disabled="isResyncEntireCatalogStarting">
                  <ion-spinner v-if="isResyncEntireCatalogStarting" name="crescent" />
                  <span v-else>{{ translate("Start full catalog re-sync") }}</span>
                </ion-button>
              </ion-buttons>
            </ion-toolbar>
          </ion-footer>
        </ion-modal>

        <ion-modal :is-open="showReplaySyncModal" :backdrop-dismiss="false" @didDismiss="showReplaySyncModal = false">
          <ion-header>
            <ion-toolbar>
              <ion-buttons slot="start">
                <ion-button @click="showReplaySyncModal = false" :aria-label="translate('Close')">
                  <ion-icon slot="icon-only" :icon="closeOutline" />
                </ion-button>
              </ion-buttons>
              <ion-title>{{ translate("Replay sync") }}</ion-title>
            </ion-toolbar>
          </ion-header>
          <ion-content>
            <ion-list lines="full">
              <ion-item lines="none">
                <ion-label>
                  <h2>{{ translate("Replay sync from a certain time") }}</h2>
                  <p>{{ translate("Select a date to rewind the product sync to. All updates from that date onwards will be re-imported.") }}</p>
                </ion-label>
              </ion-item>
              <ion-item>
                <ion-label>{{ translate("Sync updates from") }}</ion-label>
                <ion-datetime-button slot="end" datetime="replay-sync-datetime"></ion-datetime-button>
                <ion-popover :keep-contents-on-did-dismiss="true">
                  <ion-datetime id="replay-sync-datetime" presentation="date-time" v-model="replaySyncFromDate"></ion-datetime>
                </ion-popover>
              </ion-item>
            </ion-list>
          </ion-content>
          <ion-footer>
            <ion-toolbar>
              <ion-buttons slot="start">
                <ion-button fill="clear" @click="showReplaySyncModal = false" :disabled="isReplaySyncStarting">{{ translate("Cancel") }}</ion-button>
              </ion-buttons>
              <ion-buttons slot="end">
                <ion-button fill="solid" color="primary" @click="startReplaySync" :disabled="isReplaySyncStarting">
                  <ion-spinner v-if="isReplaySyncStarting" name="crescent" />
                  <span v-else>{{ translate("Start replay sync") }}</span>
                </ion-button>
              </ion-buttons>
            </ion-toolbar>
          </ion-footer>
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
                    <ion-label>
                      {{ translate("Run now") }}
                      <p>{{ translate("Create an immediate execution of this service job without changing its schedule.") }}</p>
                    </ion-label>
                    <ion-button slot="end" fill="outline" color="primary" :disabled="isSyncJobDetailsSaving || isSyncJobRunNowLoading(selectedSyncJobDetailsJob)" @click="runSyncJob(selectedSyncJobDetailsJob)">
                      <ion-spinner v-if="isSyncJobRunNowLoading(selectedSyncJobDetailsJob)" name="crescent" />
                      <span v-else>{{ translate("Run now") }}</span>
                    </ion-button>
                  </ion-item>
                  <ion-item>
                    <ion-label>{{ translate("Active") }}</ion-label>
                    <ion-toggle
                      slot="end"
                      :checked="syncJobDraftActive"
                      :disabled="isSyncJobDetailsSaving"
                      @ionChange="handleSyncJobActiveChange($event.detail.checked)"
                    />
                  </ion-item>
                  <ion-item>
                    <ion-label>{{ translate("Last run") }}</ion-label>
                    <ion-label slot="end">{{ syncJobDetailsLastRunLabel }}</ion-label>
                  </ion-item>
                  <ion-item>
                    <ion-label>{{ translate("Instance of product") }}</ion-label>
                    <ion-label slot="end">{{ syncJobProductLabel }}</ion-label>
                  </ion-item>
                </ion-list>

                <ion-accordion-group>
                  <ion-accordion value="schedule">
                    <ion-item slot="header">
                      <ion-label>
                        {{ translate("Schedule") }}
                        <p>{{ syncJobDraftScheduleDescription || translate("Not scheduled") }}</p>
                      </ion-label>
                      <ion-note slot="end">{{ syncJobDraftNextRunRelativeLabel }}</ion-note>
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
                          <p class="overline" >{{ translate("Schedule preview") }}</p>
                          {{ isSyncJobDraftScheduleValid ? syncJobDraftScheduleDescription : translate("Provide a valid cron expression") }}
                        </ion-label>
                        <ion-note slot="end">{{ syncJobDraftNextRunTimeLabel }}</ion-note>
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
                          <p v-if="run.startTime || run.endTime || run.elapsedTime || run.runtime">{{ translate("Duration") }} <AnimatedDuration :start-time="getSyncJobRunStartedAt(run)" :end-time="getSyncJobRunCompletedAt(run)" :runtime="run.runtime" :elapsed-time="run.elapsedTime" /></p>
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
                  <ion-accordion value="edit-history">
                    <ion-item slot="header">
                      <ion-label>
                        {{ translate("Edit history") }}
                        <p>{{ translate("User changes recorded in EntityAuditLog.") }}</p>
                      </ion-label>
                      <ion-note slot="end">{{ syncJobAuditHistoryError ? translate("Unavailable") : syncJobAuditHistory.length }}</ion-note>
                    </ion-item>
                    <ion-list slot="content" lines="full">
                      <ion-item v-if="isSyncJobAuditHistoryLoading">
                        <ion-spinner name="crescent" />
                      </ion-item>
                      <ion-item v-else-if="syncJobAuditHistoryError">
                        <ion-label>
                          {{ translate("Edit history unavailable") }}
                          <p>{{ syncJobAuditHistoryError }}</p>
                        </ion-label>
                      </ion-item>
                      <ion-item v-else-if="!syncJobAuditHistory.length">
                        <ion-label>{{ translate("No edit history found") }}</ion-label>
                      </ion-item>
                      <template v-else>
                        <ion-item v-for="auditLog in syncJobAuditHistory" :key="getSyncJobAuditHistoryKey(auditLog)">
                          <ion-label>
                            {{ getSyncJobAuditFieldLabel(auditLog) }}
                            <p v-if="getSyncJobAuditChangedBy(auditLog)">{{ translate("Changed by") }}: {{ getSyncJobAuditChangedByLabel(auditLog) }}</p>
                            <p>{{ getSyncJobAuditChangeLabel(auditLog) }}</p>
                          </ion-label>
                          <ion-note slot="end">{{ formatDateTime(getSyncJobAuditChangedAt(auditLog)) }}</ion-note>
                        </ion-item>
                      </template>
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
              <ion-fab-button
                v-if="!isSyncJobDetailsSaving"
                @click="saveSyncJobDetails"
                :disabled="!syncJobDetailsDirty || !isSyncJobDraftScheduleValid"
                :aria-label="translate('Save')"
              >
                <ion-icon :icon="saveOutline" />
              </ion-fab-button>
              <ion-fab-button v-else disabled :aria-label="translate('Saving')">
                <ion-spinner name="crescent" />
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
                    <ion-label slot="end">{{ currentSyncRun?.systemMessage?.statusLabel || getStatusDescription(latestSystemMessage?.statusId) }}</ion-label>
                  </ion-item>
                  <ion-item>
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
                        @click="runSystemMessageAction(systemMessageFsmState.primaryAction.id)"
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
                        @click="runSystemMessageAction(action.id)"
                      >
                        <ion-spinner v-if="systemMessageActionLoadingId === action.id" slot="start" name="crescent" />
                        <span v-else>{{ action.label }}</span>
                      </ion-button>
                    </ion-buttons>
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
                  <ion-accordion v-if="currentSyncRun?.systemMessage?.messageText" value="system-message-text">
                    <ion-item slot="header">
                      <ion-label>{{ translate("Message Text") }}</ion-label>
                    </ion-item>
                    <ion-list slot="content" lines="full">
                      <ion-item>
                        <ion-label>
                          <p>{{ currentSyncRun.systemMessage.messageText }}</p>
                        </ion-label>
                      </ion-item>
                    </ion-list>
                  </ion-accordion>
                  <ion-accordion v-if="currentSyncRun?.systemMessage?.errorText" value="system-message-error-text">
                    <ion-item slot="header">
                      <ion-label>{{ translate("Error Text") }}</ion-label>
                    </ion-item>
                    <ion-list slot="content" lines="full">
                      <ion-item>
                        <ion-label>
                          <p>{{ currentSyncRun.systemMessage.errorText }}</p>
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
                      {{ translate("Status") }}
                      <p>{{ translate("The system message controls when Shopify polling is relevant.") }}</p>
                    </ion-label>
                    <ion-label slot="end">{{ currentSyncRun?.bulkOperation?.statusLabel || translate("Pending") }}</ion-label>
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

        <ion-modal :is-open="showErrorDetailsModal" @didDismiss="showErrorDetailsModal = false">
          <ion-header>
            <ion-toolbar>
              <ion-buttons slot="start">
                <ion-button @click="showErrorDetailsModal = false">
                  <ion-icon slot="icon-only" :icon="closeOutline" />
                </ion-button>
              </ion-buttons>
              <ion-title>{{ translate("Error details") }}</ion-title>
              <ion-buttons slot="end">
                <ion-button color="primary" @click="resyncProduct(selectedErrorRecord)">
                  {{ translate("Resync") }}
                </ion-button>
              </ion-buttons>
            </ion-toolbar>
          </ion-header>
          <ion-content>
            <div class="ion-padding">
              <pre>{{ JSON.stringify(selectedErrorRecord, null, 2) }}</pre>
            </div>
          </ion-content>
        </ion-modal>

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
  IonFooter,
  IonFab,
  IonFabButton,
  IonHeader,
  IonDatetime,
  IonDatetimeButton,
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
  IonTitle,
  IonToggle,
  IonToolbar,
  alertController,
  modalController
} from "@ionic/vue";
import { closeOutline, refreshOutline, saveOutline } from "ionicons/icons";
import cronstrue from "cronstrue";

import { translate } from "@/i18n";
import { computed, defineProps, onBeforeUnmount, ref, watch } from "vue";
import { useStore } from "vuex";
import { useRoute, useRouter } from "vue-router";
import ShopifyProductSyncReturningView from "@/components/ShopifyProductSyncReturningView.vue";
import ShopifyProductSyncProductsModal from "@/components/ShopifyProductSyncProductsModal.vue";
import ShopifyProductSyncWizardView from "@/components/ShopifyProductSyncWizardView.vue";
import AnimatedDuration from "@/components/AnimatedDuration.vue";
import { ProductStoreService } from "@/services/ProductStoreService";
import { ShopifyService } from "@/services/ShopifyService";
import { ShopifyProductSyncService, type ShopifyProductSyncDashboardSummary } from "@/services/ShopifyProductSyncService";
import { UserService } from "@/services/UserService";
import {
  canAdvanceProductSyncStep,

  canStartProductSync,
  createProductSyncWizardDraft,
  getReviewImportAction,
  getRawShopifyFileName,
  nextProductSyncStep,
  normalizeProductSyncStatus,
  previousProductSyncStep,
  ProductSyncExperienceMode,
  ProductSyncWizardStep,
  requiresPreflightConfirmation,
  resolveProductSyncExperienceMode,
  selectProductStore
} from "@/utils/shopifyProductSyncWizard";
import { downloadTextFile, formatDateTime, getDownloadFileContent, hasError, parseDateTimeValue, showToast } from "@/utils";
import logger from "@/logger";
import useServiceJob from "@/composables/useServiceJob";
import { useDataManagerLog } from "@/composables/useDataManagerLog";
import { useLiveDashboard } from "@/composables/useLiveDashboard";
import { useProductUpdateHistory } from "@/composables/useProductUpdateHistory";
import { useShopifyProductSyncRun } from "@/composables/useShopifyProductSyncRun";
import { getSystemMessageBulkOperationId } from "@/utils/shopifyBulkOperation";
import { getProductSyncFsmState, type ProductSyncFsmActionId } from "@/utils/shopifyProductSyncFsm";

const props = defineProps(["id"]);
const store = useStore();
const router = useRouter();
const route = useRoute();
const {
  jobs,
  products,
  fetchJobs,
  fetchJobDetail,
  fetchJobRuns,
  fetchJobAuditHistory,
  updateJob,
  runNow
} = useServiceJob();
const { downloadDataManagerFile, fetchLogDetails, fetchRecentLogsByConfigId, currentMdmLog, recentMdmLogs, errorLogs, fetchAllRecentFailedRecords, clearStorage, loading: isErrorLogsLoading } = useDataManagerLog();
const { productUpdateHistories, fetchProductUpdateHistory, setProductUpdateHistory } = useProductUpdateHistory();
const { currentSyncRun, fetchSyncRun } = useShopifyProductSyncRun();
const PRODUCT_UPDATE_SYNC_SERVICE_NAME = "sync_ShopifyProductUpdates";
const BULK_OPERATION_SEND_JOB_NAME = "send_ProducedBulkOperationSystemMessage_ShopifyBulkQuery";
const BULK_OPERATION_POLL_JOB_NAME = "poll_ShopifyBulkOperationResult";
const PRODUCT_SYNC_MDM_CONFIG_ID = "SYNC_SHOPIFY_PRODUCT";
const PRODUCT_SYNC_ERROR_LOG_LIMIT = 10;
const latestSystemMessage = ref<any>(null);
const latestConfirmedSystemMessage = ref<any>(null);
const latestConsumedSystemMessage = ref<any>(null);
const lastProductUpdateSyncedAt = ref("");
const isLoading = ref(true);
const isSecondaryLoading = ref(false);
const hasEverLoadedSecondary = ref(false);
const loadErrorMessage = ref("");
const isSaving = ref(false);
const isReviewLoading = ref(false);
const isPreflightLoading = ref(false);
const showModeModal = ref(false);
const showMistakeModal = ref(false);
const showStartSyncModal = ref(false);
const showResyncEntireCatalogModal = ref(false);
const showReplaySyncModal = ref(false);
const replaySyncFromDate = ref("");
const isReplaySyncStarting = ref(false);
const showSyncJobDetailsModal = ref(false);
const showStepDetailsModal = ref(false);
const isSyncJobDetailsLoading = ref(false);
const isSyncJobDetailsSaving = ref(false);
const isStepDetailsLoading = ref(false);
const isSyncJobConfigLoaded = ref(false);
const isSyncJobConfiguring = ref(false);
const isResyncEntireCatalogStarting = ref(false);
const isCompletingSetup = ref(false);
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
const updateFilesToProcessCount = ref(0);
const pendingUpdateRequestsLastCreatedAt = ref("");
const errorRecordCount = computed(() => {
  return recentMdmLogs.value.reduce((acc: number, log: any) => acc + Number(log.failedRecordCount || 0), 0);
});
const syncJobDetails = ref<any>({});
const syncJobDraftCronExpression = ref("");
const syncJobDraftActive = ref(true);
const syncJobDetailsRecentRuns = ref<any[]>([]);
const syncJobAuditHistory = ref<any[]>([]);
const syncJobAuditUsers = ref<Record<string, any>>({});
const latestPauseAuditByJobName = ref<Record<string, any>>({});
const isSyncJobAuditHistoryLoading = ref(false);
const syncJobAuditHistoryError = ref("");
const syncJobRunNowJobName = ref("");
const selectedSyncJobDetailsJob = ref<any>(null);
const syncJobId = ref("");
const selectedShopSystemMessageRemoteId = ref("");
const setupState = ref<any>({
  hasLinkedOmsProducts: false,
  productStoreLocked: false,
  identifierLocked: false,
  shopifyAccessState: {
    systemMessageRemoteId: "",
    accessScopeEnumId: "",
    hasWriteAccess: false,
    status: "unavailable",
    label: "Unavailable"
  },
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

const syncJobRecentRuns = ref<any[]>([]);
const detailedErrorSearchQuery = ref("");
const selectedErrorRecord = ref<any>(null);
const showErrorDetailsModal = ref(false);
const systemMessageActionLoadingId = ref("");
const webhookSubscriptions = ref<any[]>([]);
const isWebhookLoading = ref(false);
const isWebhookSupported = ref(false);
let progressPoll: number | undefined;
let scheduledJobRefreshAtMs: number | null = null;
let scheduledJobRefreshGraceUntilMs: number | null = null;
let lastKnownJobRunStartTime = 0;
let lastKnownJobRunEndTime = 0;

const liveDashboard = useLiveDashboard({
  tickIntervalMs: 15000,
  onTick: () => evaluateScheduledRefresh(),
  onVisible: () => evaluateScheduledRefresh({ forceProbe: true })
});
const { currentTimeMs, isRefreshInFlight } = liveDashboard;

const shop = computed(() => store.getters["shopify/getShopById"](props.id) || {});
const userProfile = computed(() => store.getters["user/getUserProfile"] || {});
const statusItems = computed(() => store.state.util.statusItems || {});
const latestBulkOperationId = computed(() => getSystemMessageBulkOperationId(latestSystemMessage.value));

function getStatusDescription(statusId: string) {
  return statusItems.value[statusId]?.description || statusId;
}
const productStores = computed(() => store.getters["productStore/getProductStores"] || []);
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
  { enumId: "SHOPIFY_PRODUCT_SKU", description: translate("SKU") },
  { enumId: "SHOPIFY_BARCODE", description: translate("UPCA / Barcode") },
  { enumId: "SHOPIFY_PRODUCT_ID", description: translate("Shopify internal id") }
]);
const syncJobScheduleOptions = [
  { label: translate("Every 15 minutes"), expression: "0 */15 * ? * *" },
  { label: translate("Every 30 minutes"), expression: "0 */30 * ? * *" },
  { label: translate("Every hour"), expression: "0 0 * ? * *" },
  { label: translate("Every day at midnight"), expression: "0 0 0 ? * *" }
];
const setupCompletionScheduleOption = syncJobScheduleOptions[0];

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

const productStoreHasLinkedProducts = computed(() => {
  return relatedShops.value.some((relatedShop: any) => relatedShop.shopId !== props.id);
});
const shopifyAccessState = computed(() => {
  return setupState.value.shopifyAccessState || {
    systemMessageRemoteId: "",
    accessScopeEnumId: "",
    hasWriteAccess: false,
    status: "unavailable",
    label: "Unavailable"
  };
});
const hasShopifyWriteAccess = computed(() => {
  return !!shopifyAccessState.value.hasWriteAccess;
});
const shopifyAccessLabel = computed(() => {
  return shopifyAccessState.value.label || translate("Unavailable");
});
const shopifyAccessBadgeColor = computed(() => {
  if (shopifyAccessState.value.status === "write") return "success";
  if (shopifyAccessState.value.status === "update-required") return "warning";
  if (shopifyAccessState.value.status === "read-only") return "warning";
  return "medium";
});
const shopifyAccessDetail = computed(() => {
  if (shopifyAccessState.value.status === "write") {
    return translate("This Shopify connection can create the bulk query required for product sync.");
  }

  if (shopifyAccessState.value.status === "update-required") {
    return translate("This Shopify connection uses a deprecated access scope enum. Update the remote configuration to SHOP_READ_WRITE_ACCESS before starting product sync.");
  }

  if (shopifyAccessState.value.status === "read-only") {
    return translate("This Shopify connection has read-only access. Starting product sync requires write access to create a bulk query.");
  }

  return translate("Shopify access scope could not be verified for this connection.");
});
const shopifyAccessBlockingMessage = computed(() => {
  const syncMessageText = String(currentSyncRun.value?.systemMessage?.messageText || latestSystemMessage.value?.messageText || "").trim();

  if (isShopifyWriteAccessError(syncMessageText)) {
    return translate("Product sync could not start. Shopify write access is required for bulk query creation.");
  }

  if (shopifyAccessState.value.status === "update-required") {
    return translate("This Shopify connection uses deprecated access scope SHOP_RW_ACCESS. Update it to SHOP_READ_WRITE_ACCESS before starting product sync.");
  }

  if (!hasShopifyWriteAccess.value) {
    return translate("This Shopify connection has read-only access. Starting product sync requires write access to create a bulk query.");
  }

  return "";
});
const productStoreLocked = computed(() => !!setupState.value.productStoreLocked || !!setupState.value.hasLinkedOmsProducts);
const identifierLocked = computed(() => !!setupState.value.identifierLocked || productStoreHasLinkedProducts.value);
const hasRelatedShops = computed(() => {
  return relatedShops.value.some((relatedShop: any) => relatedShop.shopId !== props.id);
});
const activeExperienceMode = computed(() => {
  return resolveProductSyncExperienceMode(experienceMode.value, !!setupState.value.hasLinkedOmsProducts);
});
const isWebhookSubscribed = computed(() => {
  return webhookSubscriptions.value.some((subscription: any) => 
    subscription.node.topic === "BULK_OPERATIONS_FINISH"
  );
});
const activeExperienceModeLabel = computed(() => {
  return activeExperienceMode.value === "returning" ? translate("Returning user") : translate("First-time setup");
});
const lastSyncLabel = computed(() => {
  const lastSyncedAt = lastProductUpdateSyncedAt.value || latestConsumedSystemMessage.value?.initDate;
  return lastSyncedAt
    ? formatDateTime(lastSyncedAt)
    : translate("No completed sync recorded");
});
const lastSyncRelativeLabel = computed(() => {
  const lastSyncedAt = lastProductUpdateSyncedAt.value || latestConsumedSystemMessage.value?.initDate;
  if (!lastSyncedAt) return translate("Not synced yet");

  const dateTime = parseDateTimeValue(lastSyncedAt);
  if (!dateTime || !dateTime.isValid) return translate("Not synced yet");

  return dateTime.toRelative({ base: DateTime.fromMillis(currentTimeMs.value) });
});
const syncJobObj = computed(() => {
  if (syncJobId.value) {
    const job = jobs.value.find((j: any) => j.jobName === syncJobId.value);
    if (job && isSelectedShopProductSyncJob(job)) return job;
  }

  const matchedJobs = jobs.value.filter(isSelectedShopProductSyncJob);
  // Prioritize more specific jobs (e.g. sync_ShopifyProductUpdates_10000)
  return matchedJobs.find((job: any) => job.jobName.includes(props.id)) || matchedJobs[0];
});
const isSyncScheduled = computed(() => {
  return !!(syncJobObj.value?.cronExpression || syncJobObj.value?.cronString);
});
const isSyncJobPaused = computed(() => {
  return isJobPaused(syncJobObj.value);
});
const hasActiveSyncJob = computed(() => {
  return !!syncJobObj.value?.jobName && isSyncScheduled.value && !isSyncJobPaused.value;
});
const nextSyncLabel = computed(() => {
  return syncJobObj.value?.cronString || translate("Not scheduled");
});
const nextSyncRelativeLabel = computed(() => {
  return getRelativeNextRunLabel(syncJobObj.value);
});
const setupCompletionScheduleLabel = computed(() => {
  return setupCompletionScheduleOption?.label || translate("Every 15 minutes");
});
const canCompleteSetup = computed(() => {
  return !!(syncJobObj.value?.jobName || scheduledJobName.value) && !isCompletingSetup.value;
});
const setupCompletionActionLabel = computed(() => {
  return hasActiveSyncJob.value ? translate("Open sync page") : translate("Finish setup");
});
const setupCompletionMessage = computed(() => {
  if (hasActiveSyncJob.value) {
    return `${translate("Setup is complete.")} ${translate("Background sync is already scheduled to run")} ${nextSyncLabel.value}. ${translate("Continue to the regular sync page.")}`;
  }

  return `${translate("Setup is complete.")} ${translate("Schedule the recurring sync job to run")} ${setupCompletionScheduleLabel.value}, ${translate("then continue to the regular sync page.")}`;
});
const systemMessageSendJobNextRunLabel = computed(() => {
  return getJobNextRunLabel(bulkOperationSendJob.value);
});
const systemMessageSendJobRelativeNextRunLabel = computed(() => {
  return getRelativeNextRunLabel(bulkOperationSendJob.value);
});
const systemMessageSendJobNextRunAtMs = computed(() => {
  return getNextRunMillis(bulkOperationSendJob.value);
});
const systemMessageSendJobPreviousRunAtMs = computed(() => {
  return getJobLatestRunMillis(bulkOperationSendJobRecentRuns.value);
});
const bulkOperationPollJobNextRunLabel = computed(() => {
  return getJobNextRunLabel(bulkOperationPollJob.value);
});
const bulkOperationPollJobRelativeNextRunLabel = computed(() => {
  return getRelativeNextRunLabel(bulkOperationPollJob.value);
});
const bulkOperationPollJobNextRunAtMs = computed(() => {
  return getNextRunMillis(bulkOperationPollJob.value);
});
const bulkOperationPollJobPreviousRunAtMs = computed(() => {
  return getJobLatestRunMillis(bulkOperationPollJobRecentRuns.value);
});
const systemMessageFsmState = computed(() => {
  return getProductSyncFsmState({
    statusId: currentSyncRun.value?.systemMessage?.statusId || progressState.value?.systemMessageState,
    statusLabel: currentSyncRun.value?.systemMessage?.statusLabel || getStatusDescription(progressState.value?.systemMessageState),
    sendJob: bulkOperationSendJob.value,
    pollJob: bulkOperationPollJob.value,
    sendJobNextRunLabel: systemMessageSendJobNextRunLabel.value,
    sendJobRelativeNextRunLabel: systemMessageSendJobRelativeNextRunLabel.value,
    sendJobNextRunAtMs: systemMessageSendJobNextRunAtMs.value,
    sendJobPreviousRunAtMs: systemMessageSendJobPreviousRunAtMs.value,
    pollJobNextRunLabel: bulkOperationPollJobNextRunLabel.value,
    pollJobRelativeNextRunLabel: bulkOperationPollJobRelativeNextRunLabel.value,
    pollJobNextRunAtMs: bulkOperationPollJobNextRunAtMs.value,
    pollJobPreviousRunAtMs: bulkOperationPollJobPreviousRunAtMs.value,
    isSendJobPaused: isBulkOperationSendJobPaused.value,
    isPollJobPaused: isBulkOperationPollJobPaused.value
  });
});
const systemMessageProgressLabel = computed(() => {
  const statusLabel = currentSyncRun.value?.systemMessage?.statusLabel || translate("Pending");
  const statusTimeLabel = getRelativeOrAbsoluteLabel(getSystemMessageStatusAt(currentSyncRun.value?.systemMessage));

  if (statusTimeLabel) {
    return `${statusLabel} ${statusTimeLabel}`;
  }

  return statusLabel;
});
const bulkOperationProgressLabel = computed(() => {
  const bulkOperationId = currentSyncRun.value?.bulkOperation?.id;
  if (!bulkOperationId) {
    return translate("Waiting for Shopify bulk operation request.");
  }

  const bulkOperationStatus = normalizeSyncStepStatus(currentSyncRun.value?.bulkOperation?.status);
  if (bulkOperationStatus === "unavailable") {
    return translate("Status unavailable");
  }

  const statusTimeLabel = getRelativeOrAbsoluteLabel(getBulkOperationStatusAt(currentSyncRun.value?.bulkOperation));
  if (statusTimeLabel) {
    return `${currentSyncRun.value?.bulkOperation?.statusLabel || ""} ${statusTimeLabel}`.trim() || translate("Pending");
  }

  return currentSyncRun.value?.bulkOperation?.statusLabel || translate("Pending");
});
const mdmLogMetaLabel = computed(() => {
  const mdmLogId = currentSyncRun.value?.mdmLog?.id || "";
  const startedAtLabel = getRelativeOrAbsoluteLabel(getMdmLogStartedAt(currentSyncRun.value?.mdmLog));

  if (mdmLogId && startedAtLabel) {
    return `${mdmLogId} · ${translate("Started")} ${startedAtLabel}`;
  }
  if (mdmLogId) return mdmLogId;
  if (startedAtLabel) return `${translate("Started")} ${startedAtLabel}`;
  if (normalizeSyncStepStatus(currentSyncRun.value?.mdmLog?.statusId) === 'skipped') {
    return translate("No updates received from Shopify");
  }
  return translate("No import log details available");
});
const mdmLogProgressLabel = computed(() => {
  const statusLabel = currentSyncRun.value?.mdmLog?.statusLabel || translate("Pending");
  const completedAtLabel = getRelativeOrAbsoluteLabel(getMdmLogCompletedAt(currentSyncRun.value?.mdmLog));

  if (completedAtLabel) {
    return `${statusLabel} ${completedAtLabel}`;
  }

  const startedAtLabel = getRelativeOrAbsoluteLabel(getMdmLogStartedAt(currentSyncRun.value?.mdmLog));
  if (startedAtLabel) {
    return `${statusLabel} ${startedAtLabel}`;
  }

  if (normalizeSyncStepStatus(currentSyncRun.value?.mdmLog?.statusId) === 'skipped') {
    return translate("Import skipped");
  }

  return statusLabel;
});
const lastSyncTotalRecordCount = computed(() => {
  return latestConsumedSystemMessage.value?.totalRecordCount || 0;
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
const resyncCatalogProductCountLabel = computed(() => formatCount(reviewStats.value.shopifyProductCount));
const resyncCatalogVariantCountLabel = computed(() => formatCount(reviewStats.value.shopifyVariantCount));
const latestSyncJobAuditLabel = computed(() => {
  if (!syncJobAuditHistory.value.length) return translate("No audit history found");
  const latest = syncJobAuditHistory.value[0];
  return `${getSyncJobAuditFieldLabel(latest)}: ${getSyncJobAuditChangeLabel(latest)}`;
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
  if (isSyncJobPaused.value) {
    return getPausedJobSummaryLabel(syncJobObj.value);
  }
  if (syncJobRecentRuns.value.length) {
    const latestRun = syncJobRecentRuns.value[0];
    return `${translate("Last run")}: ${formatJobDateTimeLabel(getSyncJobRunStartedAt(latestRun), { sameDayTimeOnly: true })} · ${getSyncJobRunStatus(latestRun)}`;
  }
  return translate("No recent runs");
});
const syncJobDetailsLastRunLabel = computed(() => {
  if (syncJobDetailsRecentRuns.value.length) {
    const latestRun = syncJobDetailsRecentRuns.value[0];
    return `${formatJobDateTimeLabel(getSyncJobRunStartedAt(latestRun), { sameDayTimeOnly: true })} · ${getSyncJobRunStatus(latestRun)}`;
  }
  return translate("No recent runs");
});
const syncJobDetailsDirty = computed(() => {
  return syncJobDraftCronExpression.value !== getSyncJobOriginalCronExpression() ||
    syncJobDraftActive.value !== getSyncJobOriginalActive();
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
const syncJobDraftNextRunRelativeLabel = computed(() => {
  if (!isSyncJobDraftScheduleValid.value) return translate("Invalid");
  const nextRun = getNextRunDateTime({ cronExpression: syncJobDraftCronExpression.value });
  if (!nextRun) return translate("Not scheduled");
  return `${translate("next run in")} ${nextRun.toRelative({ base: DateTime.fromMillis(currentTimeMs.value), style: "long" }).replace("in ", "")}`;
});
const syncJobDraftNextRunTimeLabel = computed(() => {
  if (!isSyncJobDraftScheduleValid.value) return translate("Invalid");
  const nextRun = getNextRunDateTime({ cronExpression: syncJobDraftCronExpression.value });
  if (!nextRun) return translate("Not scheduled");
  return `${translate("next run at")} ${nextRun.toLocaleString(DateTime.DATETIME_SHORT)}`;
});
const isBulkOperationSendJobPaused = computed(() => {
  return isJobPaused(bulkOperationSendJob.value);
});
const isBulkOperationPollJobPaused = computed(() => {
  return isJobPaused(bulkOperationPollJob.value);
});
const bulkOperationSendJobLastRunLabel = computed(() => {
  if (isBulkOperationSendJobPaused.value) {
    return getPausedJobSummaryLabel(bulkOperationSendJob.value);
  }
  if (bulkOperationSendJobRecentRuns.value.length) {
    const latestRun = bulkOperationSendJobRecentRuns.value[0];
    return `${translate("Last run")}: ${formatJobDateTimeLabel(getSyncJobRunStartedAt(latestRun), { sameDayTimeOnly: true })} · ${getSyncJobRunStatus(latestRun)}`;
  }
  return translate("No recent runs");
});
const bulkOperationPollJobLastRunLabel = computed(() => {
  if (isBulkOperationPollJobPaused.value) {
    return getPausedJobSummaryLabel(bulkOperationPollJob.value);
  }
  if (bulkOperationPollJobRecentRuns.value.length) {
    const latestRun = bulkOperationPollJobRecentRuns.value[0];
    return `${translate("Last run")}: ${formatJobDateTimeLabel(getSyncJobRunStartedAt(latestRun), { sameDayTimeOnly: true })} · ${getSyncJobRunStatus(latestRun)}`;
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
    progressComplete: isProgressComplete.value
  });
});
const startSyncDisabled = computed(() => !canStartProductSync(draft.value.startConfirmed) || !hasShopifyWriteAccess.value);
const progressStatus = computed(() => normalizeProductSyncStatus(progressState.value));
const isProgressComplete = computed(() => normalizeProductSyncStatus(progressState.value) === "completed");
const importStatusLabel = computed(() => {
  if (currentStep.value === "progress") return progressStatus.value;
  return translate("Not started");
});
const importStatusBadgeColor = computed(() => {
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
    internalName: getRecentSyncUpdateTitle(history),
    parentTitle: getRecentSyncParentTitle(history),
    variantTitle: getRecentSyncVariantTitle(history),
    sku: getRecentSyncSku(history),
    shopifyId: getShopifyProductReference(history),
    shopifyIdLabel: getRecentSyncShopifyIdLabel(history),
    shopifyAdminUrl: getRecentSyncShopifyAdminUrl(history),
    updatedTime: formatDateTime(history.lastUpdatedStamp) || translate("Recent"),
    details: history.details || []
  }));
});

function findNonEmptyString(...values: any[]) {
  return values.find((value) => String(value || "").trim()) || "";
}

function getRecentSyncUpdateTitle(history: any) {
  return getRecentSyncVariantTitle(history) || getRecentSyncParentTitle(history) || history.productId;
}

function getRecentSyncParentTitle(history: any) {
  return findNonEmptyString(
    history.parentTitle,
    history.parentProductName,
    history.productTitle,
    history.diffs?.productTitle,
    history.diffs?.parentTitle,
    history.diffs?.productName
  );
}

function getRecentSyncVariantTitle(history: any) {
  return findNonEmptyString(
    history.variantTitle,
    history.internalName,
    history.diffs?.variantTitle,
    history.diffs?.title,
    history.diffs?.name,
    history.diffs?.handle
  );
}

function getRecentSyncSku(history: any) {
  const identifications = getRecentSyncIdentifications(history);
  return findNonEmptyString(
    history.sku,
    history.diffs?.sku,
    identifications.sku,
    identifications.SKU
  );
}

function getRecentSyncShopifyIdLabel(history: any) {
  const productId = getRecentSyncShopifyProductId(history);
  const variantId = getRecentSyncShopifyVariantId(history);

  if (variantId && productId && variantId !== productId) {
    return `${translate("Shopify variant ID")}: ${variantId}`;
  }

  if (productId) {
    return `${translate("Shopify ID")}: ${productId}`;
  }

  return getShopifyProductReference(history);
}

function getRecentSyncShopifyAdminUrl(history: any) {
  const myshopifyDomain = String(shop.value?.myshopifyDomain || "").trim();
  const productId = getRecentSyncShopifyProductId(history);
  if (!myshopifyDomain || !productId) return "";

  const variantId = getRecentSyncShopifyVariantId(history);
  const baseUrl = `https://${myshopifyDomain}/admin/products/${productId}`;
  if (variantId && variantId !== productId) {
    return `${baseUrl}/variants/${variantId}`;
  }

  return baseUrl;
}

function getRecentSyncIdentifications(history: any) {
  return {
    ...(history.diffs?.identifications || {}),
    ...(history.identifications || {})
  };
}

function getRecentSyncShopifyProductId(history: any) {
  const identifications = getRecentSyncIdentifications(history);
  return getShopifyNumericId(findNonEmptyString(
    history.parentProductId,
    history.diffs?.parentProductId,
    identifications.shopifyParentProductId,
    identifications.shopifyProductId,
    identifications.SHOPIFY_PRODUCT_ID,
    String(history.diffs?.id || "").startsWith("gid://shopify/Product/") ? history.diffs?.id : "",
    history.productId
  ));
}

function getRecentSyncShopifyVariantId(history: any) {
  const identifications = getRecentSyncIdentifications(history);
  return getShopifyNumericId(findNonEmptyString(
    identifications.shopifyVariantId,
    identifications.SHOPIFY_VARIANT_ID,
    String(history.diffs?.id || "").startsWith("gid://shopify/ProductVariant/") ? history.diffs?.id : "",
    history.productId
  ));
}

function getShopifyNumericId(value: any) {
  const rawValue = String(value || "").trim();
  if (!rawValue) return "";
  if (/^\d+$/.test(rawValue)) return rawValue;
  if (rawValue.startsWith("gid://shopify/")) return rawValue.split("/").pop() || "";
  return "";
}

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
  const selectedShopIds = [
    shop.value.shopId,
    props.id
  ].filter(Boolean).map(String);

  return selectedShopIds.length > 0 &&
    isProductUpdateSyncServiceJob(job) &&
    (selectedShopIds.includes(String(getServiceJobParameterValue(job, "shopId"))) || selectedShopIds.includes(String(getServiceJobParameterValue(job, "shopifyShopId"))));
}



const filteredParsedErrorRecords = computed(() => {
  const query = detailedErrorSearchQuery.value.trim().toLowerCase();
  const records = errorLogs.value.map((err: any) => {
    const product = err.virtualProduct || {};
    const numericId = product.id ? product.id.split('/').pop() : '';
    
    // Robust extraction of SKU and Barcode (handles variants array, GraphQL edges, or top-level properties)
    const variantsData = product.variants?.edges || (Array.isArray(product.variants) ? product.variants : []);
    const firstVariant = variantsData[0]?.node || variantsData[0] || {};
    const sku = firstVariant.sku || product.sku || err.sku || '';
    const barcode = firstVariant.barcode || product.barcode || err.barcode || '';

    const error = err.error || err._ERROR_MESSAGE_ || err.message || (typeof err === 'string' ? err : '');

    return {
      id: product.id || err.id,
      numericId,
      logId: err.logId || currentMdmLog.value?.logId,
      title: product.title || err.title || translate("Unknown product"),
      vendor: product.vendor || err.vendor,
      handle: product.handle,
      productType: product.productType,
      sku,
      barcode,
      error: error || translate("Unknown error"),
      raw: err
    }
  });

  if (!query) return records;

  return records.filter((record: any) => 
    record.numericId?.toLowerCase().includes(query) ||
    record.title?.toLowerCase().includes(query) ||
    record.handle?.toLowerCase().includes(query)
  );
});

const pagedFilteredParsedErrorRecords = computed(() => {
  return filteredParsedErrorRecords.value.slice(0, 100);
});

const preflightTitle = computed(() => {
  if (!hasShopifyWriteAccess.value) {
    return translate("Shopify write access required");
  }

  return requiresPreflightConfirmation(preflightResult.value)
    ? translate("Review possible catalog mismatch")
    : translate("Preflight sample looks matched");
});
const preflightRequiresConfirmation = computed(() => {
  return preflightLoaded.value && requiresPreflightConfirmation(preflightResult.value);
});
const preflightSubtitle = computed(() => {
  if (!hasShopifyWriteAccess.value) {
    return translate("This Shopify connection has read-only access. Starting product sync requires write access to create a bulk query.");
  }

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

    await store.dispatch("productStore/fetchProductStores");

    if (shop.value.productStoreId) {
      await store.dispatch("productStore/fetchProductStoreDetails", shop.value.productStoreId);
    }
    await loadSelectedShopSystemMessageRemoteId();

    setupState.value = await ShopifyProductSyncService.fetchSetupState({
      shopId: props.id,
      shop: shop.value,
      productStore: selectedProductStore.value
    });
    assertBackendDataAvailable(setupState.value, translate("Product sync setup is unavailable."));
    setProductUpdateHistory([]);

    draft.value = createProductSyncWizardDraft({
      selectedProductStoreId: setupState.value.selectedProductStoreId || shop.value.productStoreId || "",
      selectedIdentifierEnumId: setupState.value.selectedIdentifierEnumId || selectedProductStore.value.productIdentifierEnumId || recommendedIdentifierEnumId.value,
      productStoreVerified: !!setupState.value.productStoreLocked,
      syncStarted: !!setupState.value.syncJobId,
      startConfirmed: false
    });

    syncJobId.value = setupState.value.syncJobId || "";
    if (setupState.value.completed) {
      currentStep.value = "progress";
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

    await loadWebhookSubscriptions();

    // Dev override to land on a specific step
    if (route.query.step) {
      currentStep.value = route.query.step as ProductSyncWizardStep;
      if (currentStep.value === "progress") {
        const loadedProgress = await loadProgress();
        if (loadedProgress) startProgressPolling();
      }
    }

    // Now kick off secondary data in background without blocking if not in first-time mode
    if (activeExperienceMode.value !== "first-time") {
      loadSecondaryData().catch((e) => logger.error("Failed to load secondary data", e));
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

async function loadSecondaryData(opts: { silent?: boolean } = {}) {
  // On cold start we surface skeletons via isSecondaryLoading. Every subsequent
  // refresh keeps the last-known-good data visible — the subtle indicator driven
  // by liveDashboard.isRefreshInFlight is the only loading affordance.
  const isColdStart = !hasEverLoadedSecondary.value;
  if (isColdStart && !opts.silent) {
    isSecondaryLoading.value = true;
  }
  latestPauseAuditByJobName.value = {};
  try {
    const summary = await ShopifyProductSyncService.fetchDashboardSummary({
      shopId: props.id,
      systemMessageRemoteId: selectedShopSystemMessageRemoteId.value,
      shop: shop.value
    });
    applyDashboardSummary(summary);

    try {
      if (latestSystemMessage.value?.systemMessageId) {
        await fetchSyncRun(latestSystemMessage.value.systemMessageId, latestSystemMessage.value);
      } else {
        currentSyncRun.value = {} as any;
      }
    } catch (e) {
      logger.error("Failed to fetch sync run monitoring data", e);
    }

    try {
      await fetchJobs({});
      const syncJobs = jobs.value.filter((job: any) => isProductUpdateSyncServiceJob(job) || (syncJobId.value && job.jobName === syncJobId.value));
      await Promise.all(syncJobs.map(async (job: any) => {
        try {
          const details = await fetchJobDetail(job.jobName);
          Object.assign(job, details);
        } catch (e) {
          logger.error(`Failed to fetch details for job ${job.jobName}`, e);
        }
      }));
    } catch (e) {
      logger.error("Failed to fetch service jobs", e);
    }

    try {
      await loadBulkOperationMonitoringJobs();
    } catch (e) {
      logger.error("Failed to load bulk operation monitoring jobs", e);
    }

    try {
      await loadPausedJobAuditSummaries();
    } catch (e) {
      logger.error("Failed to load paused job audit summaries", e);
    }

    await Promise.all([
      loadSyncJobLatestRun().catch(e => logger.error("Failed to load sync job latest run", e)),
      loadBulkOperationSendJobLatestRun().catch(e => logger.error("Failed to load bulk operation send job latest run", e)),
      loadBulkOperationPollJobLatestRun().catch(e => logger.error("Failed to load bulk operation poll job latest run", e)),
      fetchProductUpdateHistory({ shopId: props.id, pageSize: 10 }).catch(e => logger.error("Failed to fetch product update history", e)),
      fetchRecentLogsByConfigId(PRODUCT_SYNC_MDM_CONFIG_ID, PRODUCT_SYNC_ERROR_LOG_LIMIT).catch(e => logger.error("Failed to fetch recent MDM logs", e))
    ]);

    if (recentMdmLogs.value.length) {
      try {
        await fetchAllRecentFailedRecords(PRODUCT_SYNC_MDM_CONFIG_ID, recentMdmLogs.value);
      } catch (e) {
        logger.error("Failed to fetch failed records for MDM logs", e);
      }
    }

    await loadWebhookSubscriptions();
  } catch (error) {
    logger.error("Error loading secondary data", error);
  } finally {
    isSecondaryLoading.value = false;
    hasEverLoadedSecondary.value = true;
    updateScheduledJobRefreshAt();
  }
}

function applyDashboardSummary(summary: ShopifyProductSyncDashboardSummary) {
  latestSystemMessage.value = summary.syncRunState.latestSystemMessage || null;
  latestConfirmedSystemMessage.value = summary.syncRunState.latestConfirmedSystemMessage || null;
  latestConsumedSystemMessage.value = summary.syncRunState.latestConsumedSystemMessage || null;
  lastProductUpdateSyncedAt.value = summary.syncRunState.lastSyncedAt || "";
  pendingUpdateRequestsCount.value = Number(summary.pendingRequests.count || 0);
  pendingUpdateRequestsLastCreatedAt.value = summary.pendingRequests.latestSystemMessage?.initDate ||
    summary.pendingRequests.latestSystemMessage?.createdDate ||
    summary.pendingRequests.latestSystemMessage?.lastUpdatedStamp ||
    "";
  runningShopifyBulkOperation.value = summary.runningOperation;
  shopifyShopProductCount.value = Number(summary.unsyncedUpdates?.count || 0);
  updateFilesToProcessCount.value = Number(summary.updateFilesToProcess || 0);
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

async function openUnsyncedUpdatesModal() {
  if (!selectedShopSystemMessageRemoteId.value) {
    showToast(translate("Shopify product search is unavailable for this shop."));
    return;
  }

  const productsModal = await modalController.create({
    component: ShopifyProductSyncProductsModal,
    componentProps: {
      mode: "unsynced",
      systemMessageRemoteId: selectedShopSystemMessageRemoteId.value,
      shopId: props.id,
      lastSyncedAt: lastProductUpdateSyncedAt.value,
      shopifyShopProductCount: shopifyShopProductCount.value
    },
    showBackdrop: true,
    swipeToClose: true
  });

  await productsModal.present();
  const { data } = await productsModal.onDidDismiss();
  handleSelectedProductsForSync(data);
}

async function openSpecificProductsSyncModal() {
  if (!selectedShopSystemMessageRemoteId.value) {
    showToast(translate("Shopify product search is unavailable for this shop."));
    return;
  }

  const productsModal = await modalController.create({
    component: ShopifyProductSyncProductsModal,
    componentProps: {
      mode: "search",
      systemMessageRemoteId: selectedShopSystemMessageRemoteId.value
    },
    showBackdrop: true,
    swipeToClose: true
  });

  await productsModal.present();
  const { data } = await productsModal.onDidDismiss();
  handleSelectedProductsForSync(data);
}

async function openResyncEntireCatalogModal() {
  if (!selectedShopSystemMessageRemoteId.value) {
    showToast(translate("Shopify product sync is unavailable for this shop."));
    return;
  }

  showResyncEntireCatalogModal.value = true;
  if (!reviewStats.value.loaded && !isReviewLoading.value) {
    await loadReviewStats();
  }
}

async function handleSelectedProductsForSync(data: any) {
  const shopifyProductIds = getSelectedShopifyProductIds(data);
  if (!shopifyProductIds.length) return;

  isSaving.value = true;
  try {
    const result = await ShopifyProductSyncService.syncShopifyProductsOnDemand({
      shopId: props.id,
      shopifyProductId: shopifyProductIds
    });

    showToast(getSelectedProductSyncResultMessage(result, shopifyProductIds.length));
    await loadLatestSystemMessage();
  } catch (error: any) {
    logger.error(error);
    showToast(getErrorMessage(error, translate("Failed to sync selected products.")));
  } finally {
    isSaving.value = false;
  }
}

function getSelectedShopifyProductIds(data: any) {
  const legacyResourceIds = Array.isArray(data?.legacyResourceIds) ? data.legacyResourceIds : [];
  const productIds = legacyResourceIds.length ? legacyResourceIds : (data?.productIds || []).map(getShopifyProductLegacyId);

  return productIds
    .map((productId: any) => String(productId || "").trim())
    .filter((productId: string, index: number, list: string[]) => /^\d+$/.test(productId) && list.indexOf(productId) === index);
}

function getShopifyProductLegacyId(productId: string) {
  return String(productId || "").split("/").pop() || "";
}

function getSelectedProductSyncResultMessage(result: any, requestedCount: number) {
  return translate("Selected product sync completed: {synced} synced, {failed} failed, {rejected} rejected.", {
    synced: Number(result?.syncedCount || 0),
    failed: Number(result?.failedCount || 0),
    rejected: Number(result?.rejectedCount || 0),
    requested: requestedCount
  });
}

async function loadLatestSystemMessage() {
  const summary = await ShopifyProductSyncService.fetchDashboardSummary({
    shopId: props.id,
    systemMessageRemoteId: selectedShopSystemMessageRemoteId.value,
    shop: shop.value
  });
  applyDashboardSummary(summary);

  if (latestSystemMessage.value?.systemMessageId) {
    await fetchSyncRun(latestSystemMessage.value.systemMessageId, latestSystemMessage.value);
  } else {
    currentSyncRun.value = {} as any;
  }

  await Promise.all([
    fetchProductUpdateHistory({ shopId: props.id, pageSize: 10 }),
    fetchRecentLogsByConfigId(PRODUCT_SYNC_MDM_CONFIG_ID, PRODUCT_SYNC_ERROR_LOG_LIMIT)
  ]);
  
  if (recentMdmLogs.value.length) {
    await fetchAllRecentFailedRecords(PRODUCT_SYNC_MDM_CONFIG_ID, recentMdmLogs.value);
  }
}

async function downloadRawFile(item: any) {
  try {
    const configId = item.configId || PRODUCT_SYNC_MDM_CONFIG_ID;
    const logContentId = item.logContentId;

    if (!configId || !logContentId) {
      showToast(translate("Raw file is not available"));
      return;
    }

    const response = await downloadDataManagerFile(configId, logContentId);
    const fileContent = getDownloadFileContent(response?.data);

    if (!fileContent) {
      throw new Error("No file content returned");
    }

    downloadTextFile(fileContent, getRawShopifyFileName(item));
    showToast(translate("File downloaded successfully"));
  } catch (error) {
    logger.error(`Failed to download raw file for ${item.id}`, error);
    showToast(translate("Failed to download raw file"));
  }
}

function openErrorDetailsModal(record: any) {
  selectedErrorRecord.value = record;
  showErrorDetailsModal.value = true;
}

async function refreshErrorRecords() {
  await clearStorage();
  errorLogs.value = [];
  detailedErrorSearchQuery.value = "";
  
  // Re-fetch everything fresh
  await fetchRecentLogsByConfigId(PRODUCT_SYNC_MDM_CONFIG_ID, PRODUCT_SYNC_ERROR_LOG_LIMIT);
  if (recentMdmLogs.value.length) {
    await fetchAllRecentFailedRecords(PRODUCT_SYNC_MDM_CONFIG_ID, recentMdmLogs.value);
  }
}

async function resyncProduct(record: any) {
  const shopifyProductId = record.numericId;
  if (!shopifyProductId) {
    showToast(translate("Shopify product ID not available for resync."));
    return;
  }

  isSaving.value = true;
  try {
    const result = await ShopifyProductSyncService.syncShopifyProductsOnDemand({
      shopId: props.id,
      shopifyProductId: [shopifyProductId]
    });

    showToast(getSelectedProductSyncResultMessage(result, 1));
    await loadLatestSystemMessage();
  } catch (error: any) {
    logger.error(error);
    showToast(getErrorMessage(error, translate("Failed to resync product.")));
  } finally {
    isSaving.value = false;
  }
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

function getSystemMessageStatusAt(systemMessage: any) {
  return systemMessage?.processedDate || systemMessage?.lastUpdatedStamp || systemMessage?.initDate || "";
}

function getBulkOperationStatusAt(bulkOperation: any) {
  return bulkOperation?.completedAt || bulkOperation?.createdAt || "";
}

function getMdmLogStartedAt(mdmLog: any) {
  return findNonEmptyString(
    mdmLog?.startDate,
    mdmLog?.startTime,
    mdmLog?.startedDate,
    mdmLog?.startedAt,
    mdmLog?.createdDate,
    mdmLog?.createdStamp
  );
}

function getMdmLogCompletedAt(mdmLog: any) {
  return findNonEmptyString(
    mdmLog?.endDate,
    mdmLog?.endTime,
    mdmLog?.finishDateTime,
    mdmLog?.finishedAt,
    mdmLog?.completedDate,
    mdmLog?.completedAt,
    mdmLog?.lastUpdatedStamp
  );
}

function getRelativeOrAbsoluteLabel(value: string) {
  const dateTime = parseDateTimeValue(value);
  if (!dateTime || !dateTime.isValid) return "";
  return dateTime.toRelative({ base: DateTime.fromMillis(currentTimeMs.value) }) || formatDateTime(value);
}

function formatJobDateTimeLabel(value: any, { sameDayTimeOnly = false } = {}) {
  const dateTime = parseDateTimeValue(value);
  if (!dateTime || !dateTime.isValid) return translate("Unavailable");

  const baseDateTime = DateTime.fromMillis(currentTimeMs.value);
  if (sameDayTimeOnly && dateTime.hasSame(baseDateTime, "day")) {
    return dateTime.toLocaleString(DateTime.TIME_SIMPLE);
  }

  return formatDateTime(value);
}

async function loadPausedJobAuditSummaries() {
  const pausedJobs = [syncJobObj.value, bulkOperationSendJob.value, bulkOperationPollJob.value]
    .filter((job: any) => job?.jobName && isJobPaused(job));

  if (!pausedJobs.length) {
    latestPauseAuditByJobName.value = {};
    return;
  }

  const auditEntries = await Promise.all(pausedJobs.map(async (job: any) => {
    const auditHistory = await fetchJobAuditHistory(job.jobName, { pageSize: 25, pageIndex: 0 });
    return {
      jobName: job.jobName,
      auditLog: auditHistory.find((auditLog: any) => isPauseActivatedAudit(auditLog)) || null
    };
  }));

  await loadSyncJobAuditUsers(auditEntries.map((entry) => entry.auditLog).filter(Boolean));

  latestPauseAuditByJobName.value = auditEntries.reduce((acc: Record<string, any>, entry) => {
    if (entry.auditLog) {
      acc[entry.jobName] = entry.auditLog;
    }
    return acc;
  }, {});
}

function isPauseActivatedAudit(auditLog: any) {
  const changedFieldName = String(auditLog?.changedFieldName || "").toLowerCase();
  const newValue = String(auditLog?.newValueText ?? auditLog?.newValue ?? "").toUpperCase();
  return changedFieldName === "paused" && (newValue === "Y" || newValue === "TRUE");
}

function getPausedJobSummaryLabel(job: any) {
  const auditLog = latestPauseAuditByJobName.value[job?.jobName];
  if (!auditLog) return translate("Paused");

  const changedByLabel = getSyncJobAuditChangedByLabel(auditLog);
  const changedAtLabel = getRelativeOrAbsoluteLabel(getSyncJobAuditChangedAt(auditLog));

  if (changedByLabel && changedAtLabel) {
    return `${translate("Paused by")} ${changedByLabel} ${changedAtLabel}`;
  }

  return translate("Paused");
}

function normalizeSyncStepStatus(statusId: string) {
  return String(statusId || "").toLowerCase().replace(/[_\-\s]/g, "");
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
  if (syncJobRunNowJobName.value === job.jobName) return;

  const jobAlert = await alertController.create({
    header: translate("Run now"),
    message: translate("Once this job starts running, it cannot be stopped."),
    buttons: [
      {
        text: translate("Cancel"),
        role: "cancel",
      },
      {
        text: translate("Run now"),
        handler: () => {
          syncJobRunNowJobName.value = job.jobName;
          void executeRunSyncJob(job);
          return true;
        }
      }
    ]
  });

  await jobAlert.present();
}

async function executeRunSyncJob(job: any) {
  try {
    await runNow(job.jobName);
    showToast(translate("Job has been scheduled to run now"));
    await refreshAfterRunNow(job);
  } catch (err) {
    logger.error("Failed to run job now", err);
    showToast(translate("Failed to run job"));
  } finally {
    if (syncJobRunNowJobName.value === job.jobName) {
      syncJobRunNowJobName.value = "";
    }
  }
}

function isSyncJobRunNowLoading(job: any) {
  return !!job?.jobName && syncJobRunNowJobName.value === job.jobName;
}

async function refreshAfterRunNow(job: any) {
  const refreshTasks = [loadSyncJobLatestRun()];

  if (activeExperienceMode.value === "returning") {
    refreshTasks.push(loadSecondaryData({ silent: true }));
  }

  if (!syncJobDetailsDirty.value && selectedSyncJobDetailsJob.value?.jobName === job?.jobName) {
    refreshTasks.push(refreshSyncJobDetails({ silent: true }));
  }

  await Promise.all(refreshTasks);
}



async function scheduleSyncJob(cronExpression: string) {
  if (!syncJobObj.value?.jobName || !cronExpression) return;

  await updateSyncJob({
    jobName: syncJobObj.value.jobName,
    cronExpression,
    paused: isSyncJobPaused.value ? "Y" : "N"
  }, translate("Sync job updated successfully."));
}

async function completeSetupAndOpenReturningView() {
  if (isCompletingSetup.value) return;

  const jobName = syncJobObj.value?.jobName || scheduledJobName.value;
  if (!jobName) {
    showToast(translate("Product sync job not found for this shop."));
    return;
  }

  isCompletingSetup.value = true;
  try {
    if (!hasActiveSyncJob.value) {
      const updated = await updateSyncJob({
        jobName,
        cronExpression: setupCompletionScheduleOption?.expression || "0 */15 * ? * *",
        paused: "N"
      }, translate("Recurring product sync scheduled every 15 minutes."));

      if (!updated) return;
    }

    await Promise.all([
      loadSecondaryData(),
      loadSyncJobLatestRun()
    ]);

    experienceMode.value = "returning";
  } finally {
    isCompletingSetup.value = false;
  }
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

    if (activeExperienceMode.value === "returning") {
      await loadPausedJobAuditSummaries();
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
  syncJobAuditHistory.value = [];
  syncJobAuditHistoryError.value = "";
  isSyncJobAuditHistoryLoading.value = false;
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
    const updated = await updateSyncJob({
      jobName: selectedSyncJobDetailsJob.value.jobName,
      cronExpression: syncJobDraftCronExpression.value,
      paused: syncJobDraftActive.value ? "N" : "Y"
    }, translate("Sync job updated successfully."));

    if (updated) {
      showSyncJobDetailsModal.value = false;
    }
  } finally {
    isSyncJobDetailsSaving.value = false;
  }
}

async function refreshSyncJobDetails(opts: { silent?: boolean } = {}) {
  if (!selectedSyncJobDetailsJob.value?.jobName) return;

  if (!opts.silent) {
    isSyncJobDetailsLoading.value = true;
    syncJobAuditHistory.value = [];
    syncJobAuditHistoryError.value = "";
  }
  try {
    const [jobDetails, jobRuns] = await Promise.all([
      fetchJobDetail(selectedSyncJobDetailsJob.value.jobName),
      fetchJobRuns(selectedSyncJobDetailsJob.value.jobName, { pageSize: 5, pageIndex: 0 })
    ]);

    syncJobDetails.value = jobDetails || {};
    syncJobDetailsRecentRuns.value = Array.isArray(jobRuns) ? jobRuns : [];
    setSyncJobDetailsDraft(syncJobDetails.value);


    void loadSyncJobAuditHistory(jobDetails.jobName);
  } catch (error: any) {
    logger.error(error);
    if (!opts.silent) {
      syncJobDetails.value = {};
      syncJobDetailsRecentRuns.value = [];
      syncJobAuditHistory.value = [];
      syncJobAuditHistoryError.value = "";
      resetSyncJobDetailsDraft();
      showToast(translate("Failed to load sync job details."));
    }
  } finally {
    if (!opts.silent) {
      isSyncJobDetailsLoading.value = false;
    }
    updateScheduledJobRefreshAt();
  }
}

async function loadSyncJobAuditHistory(jobName: string) {
  if (!jobName) return;

  isSyncJobAuditHistoryLoading.value = true;
  syncJobAuditHistoryError.value = "";
  try {
    syncJobAuditHistory.value = await fetchJobAuditHistory(jobName, { pageSize: 10, pageIndex: 0 });
    await loadSyncJobAuditUsers(syncJobAuditHistory.value);
  } catch (error: any) {
    logger.warn("Failed to load service job audit history", error);
    syncJobAuditHistory.value = [];
    syncJobAuditHistoryError.value = translate("EntityAuditLog is not exposed through an API yet.");
  } finally {
    isSyncJobAuditHistoryLoading.value = false;
  }
}

function getSyncJobOriginalCronExpression() {
  return syncJobDetails.value?.cronExpression || selectedSyncJobDetailsJob.value?.cronExpression || "";
}

function getSyncJobOriginalActive() {
  const job = syncJobDetails.value?.jobName ? syncJobDetails.value : selectedSyncJobDetailsJob.value;
  return !isJobPaused(job);
}

function setSyncJobDetailsDraft(jobDetails: any = {}) {
  syncJobDraftCronExpression.value = jobDetails?.cronExpression || selectedSyncJobDetailsJob.value?.cronExpression || "";
  syncJobDraftActive.value = !isJobPaused(jobDetails?.jobName ? jobDetails : selectedSyncJobDetailsJob.value);
}

function resetSyncJobDetailsDraft() {
  syncJobDraftCronExpression.value = getSyncJobOriginalCronExpression();
  syncJobDraftActive.value = getSyncJobOriginalActive();
}

function handleSyncJobActiveChange(isActive: boolean) {
  syncJobDraftActive.value = isActive;
}

async function confirmDiscardSyncJobDetailsChanges() {
  if (!syncJobDetailsDirty.value) return true;

  return new Promise<boolean>((resolve) => {
    alertController.create({
      header: translate("Unsaved changes"),
      message: translate("You have unsaved job changes. Discard them?"),
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
    showToast(getErrorMessage(error, translate("Failed to link product store")));
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
      detail: item.omsValue || translate("Not found in HotWax"),
      status: item.isMatched ? "Matched" : (item.omsValue ? "Conflict" : "Not found in HotWax")
    })),
    matched: rawItems.filter((i: any) => i.isMatched).length,
    sampled: rawItems.length
  };

  preflightLoaded.value = true;
  preflightWarningConfirmed.value = false;
}

async function openMistakeModal() {
  showMistakeModal.value = true;
  if (preflightLoaded.value) return;

  isPreflightLoading.value = true;
  try {
    await loadPreflight();
  } catch (error: any) {
    logger.error(error);
    showToast(translate("Failed to load preflight review."));
  } finally {
    isPreflightLoading.value = false;
  }
}

async function openStartSyncModal() {
  try {
    if (!hasShopifyWriteAccess.value) {
      showToast(shopifyAccessBlockingMessage.value);
      return;
    }

    if (!preflightLoaded.value) {
      isPreflightLoading.value = true;
      try {
        await loadPreflight();
      } finally {
        isPreflightLoading.value = false;
      }
    }


    const action = getReviewImportAction();
    if (action.opensStartConfirmation) {
      draft.value.startConfirmed = false;
      showStartSyncModal.value = true;
      
      const jobName = syncJobObj.value?.jobName;
      const promises: Promise<any>[] = [checkSyncJobConfig()];
      if (jobName) {
        promises.push(loadSyncJobAuditHistory(jobName));
      }
      await Promise.all(promises);
    }
  } catch (error: any) {
    logger.error(error);
    showToast(translate("Failed to prepare product sync."));
  }
}

async function checkSyncJobConfig() {
  isSyncJobConfigLoaded.value = false;
  try {
    const shopId = props.id; 
    const result = await ShopifyProductSyncService.fetchSyncJobConfig({ shopId });
    
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
    const shopId = shop.value?.shopId;
    if (!shopId) throw new Error("Shop ID not available");

    await ShopifyProductSyncService.configureSyncJob({
      shopId,
      productStoreId: draft.value.selectedProductStoreId,
      productIdentifierEnumId: draft.value.selectedIdentifierEnumId
    });
    
    syncJobConfigured.value = true;
    showToast(translate("Product sync job scheduled successfully."));
    await fetchJobs(); // Refresh job list
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
  if (!canStartProductSync(draft.value.startConfirmed) || !hasShopifyWriteAccess.value) {
    showToast(shopifyAccessBlockingMessage.value);
    return;
  }
  isSaving.value = true;
  try {
    if (!selectedShopSystemMessageRemoteId.value) {
      await loadSelectedShopSystemMessageRemoteId();
    }

    const resp: any = await ShopifyProductSyncService.syncShopifyProducts({ 
      shopId: props.id,
      includeAll: true 
    });
    if (resp._ERROR_MESSAGE_ || resp._ERROR_MESSAGE_LIST_) {
      throw resp;
    }

    draft.value.syncStarted = true;
    showStartSyncModal.value = false;
    showToast(translate("Product sync started."));

    // Keep the selected shop remote id stable. The sync endpoint returns a system message id,
    // which is useful for progress state but cannot replace the shop-level remote id used by
    // subsequent run-state and GraphQL lookups.
    if (resp.systemMessageId) {
      currentSyncRun.value = {} as any;
      progressState.value = {
        ...progressState.value,
        systemMessageId: resp.systemMessageId,
        systemMessageState: "SmsgProduced",
        status: "queued",
        completed: false
      };
      currentStep.value = "progress";
      await loadProgress();
      startProgressPolling();
    } else {
      // Fallback if no ID is returned
      currentStep.value = "progress";
      const loadedProgress = await loadProgress();
      if (loadedProgress) startProgressPolling();
    }
  } catch (err) {
    showToast(getErrorMessage(err, translate("Failed to start product sync.")));
    logger.error(err);
  } finally {
    isSaving.value = false;
  }
}

async function confirmCancelSystemMessage() {
  return new Promise<boolean>((resolve) => {
    alertController.create({
      header: translate("Cancel this run?"),
      message: translate("Canceling discards this system message so the current Shopify product sync run will not continue."),
      buttons: [
        {
          text: translate("Keep run"),
          role: "cancel",
          handler: () => resolve(false)
        },
        {
          text: translate("Cancel run"),
          role: "destructive",
          handler: () => resolve(true)
        }
      ]
    }).then((alert) => alert.present());
  });
}

async function refreshAfterSystemMessageAction() {
  const refreshTasks: Promise<any>[] = [loadProgress()];

  if (activeExperienceMode.value === "returning") {
    refreshTasks.push(loadSecondaryData({ silent: true }));
  }

  await Promise.all(refreshTasks);
}

async function runSystemMessageAction(actionId: ProductSyncFsmActionId) {
  if (systemMessageActionLoadingId.value) return;

  // Send / Poll route through the same run-now flow as the job modal so the
  // backend cron job is what produces or polls — not a direct service call.
  if (actionId === "send") {
    await runSyncJob(bulkOperationSendJob.value);
    return;
  }
  if (actionId === "poll") {
    await runSyncJob(bulkOperationPollJob.value);
    return;
  }

  // Cancel is a system-message-level discard with no corresponding job.
  const systemMessageId = currentSyncRun.value?.systemMessageId || progressState.value?.systemMessageId;
  if (!systemMessageId) {
    showToast(translate("System message is not available."));
    return;
  }

  const confirmed = await confirmCancelSystemMessage();
  if (!confirmed) return;

  systemMessageActionLoadingId.value = actionId;
  try {
    await ShopifyProductSyncService.cancelSystemMessage(systemMessageId);
    showToast(translate("Product sync run cancelled."));
    await refreshAfterSystemMessageAction();
  } catch (err) {
    showToast(getErrorMessage(err, translate("Failed to {actionLabel}.", { actionLabel: translate("cancel the product sync run") })));
    logger.error(err);
  } finally {
    systemMessageActionLoadingId.value = "";
  }
}

async function performSync(params: any, successMsg: string, modalRef: any, loadingRef: any) {
  loadingRef.value = true;
  try {
    currentSyncRun.value = {} as any;
    const job = syncJobObj.value;
    const resp: any = await ShopifyProductSyncService.syncShopifyProducts({
      shopId: props.id,
      ...params
    });

    if (resp._ERROR_MESSAGE_ || resp._ERROR_MESSAGE_LIST_) throw resp;

    currentSyncRun.value = {} as any;
    progressState.value = {
      ...progressState.value,
      syncJobId: job?.jobName || "",
      systemMessageId: resp.systemMessageId || "",
      systemMessageState: "SmsgProduced",
      status: "queued",
      completed: false
    };
    currentStep.value = "progress";
    const loadedProgress = await loadProgress();
    if (loadedProgress) startProgressPolling();

    modalRef.value = false;
    showToast(translate(successMsg));
  } catch (error: any) {
    logger.error(error);
    showToast(translate("Failed to start product sync"));
  } finally {
    loadingRef.value = false;
  }
}

async function startResyncEntireCatalog() {
  if (!selectedShopSystemMessageRemoteId.value) {
    showToast(translate("Shopify product sync is unavailable for this shop."));
    return;
  }
  await performSync({ includeAll: true }, "Full catalog re-sync started.", showResyncEntireCatalogModal, isResyncEntireCatalogStarting);
}

function openReplaySyncModal() {
  replaySyncFromDate.value = new Date().toISOString();
  showReplaySyncModal.value = true;
}

async function startReplaySync() {
  if (!replaySyncFromDate.value) {
    showToast(translate("Please select a date to start the sync from."));
    return;
  }
  await performSync({ fromDate: formatDateTime(replaySyncFromDate.value, "yyyy-MM-dd HH:mm:ss") }, "Product sync replay started.", showReplaySyncModal, isReplaySyncStarting);
}

async function loadProgress() {

  if (!selectedShopSystemMessageRemoteId.value) return false;
  let loadedRunState = false;
  try {
    const [syncRunStateResult, sendJobResult, pollJobResult, sendJobRunsResult, pollJobRunsResult] = await Promise.allSettled([
      ShopifyProductSyncService.fetchProductUpdateSyncRunState({
        systemMessageRemoteId: selectedShopSystemMessageRemoteId.value,
        shopId: props.id,
        systemMessageId: progressState.value?.systemMessageId
      }),
      fetchJobDetail(BULK_OPERATION_SEND_JOB_NAME),
      fetchJobDetail(BULK_OPERATION_POLL_JOB_NAME),
      fetchJobRuns(BULK_OPERATION_SEND_JOB_NAME, { pageSize: 1, pageIndex: 0 }),
      fetchJobRuns(BULK_OPERATION_POLL_JOB_NAME, { pageSize: 1, pageIndex: 0 })
    ]);

    if (sendJobResult.status === "fulfilled") {
      bulkOperationSendJob.value = sendJobResult.value;
    } else {
      logger.error("Failed to fetch bulk operation send job details", sendJobResult.reason);
      bulkOperationSendJob.value = {};
    }

    if (pollJobResult.status === "fulfilled") {
      bulkOperationPollJob.value = pollJobResult.value;
    } else {
      logger.error("Failed to fetch bulk operation poll job details", pollJobResult.reason);
      bulkOperationPollJob.value = {};
    }

    bulkOperationSendJobRecentRuns.value = sendJobRunsResult.status === "fulfilled" && Array.isArray(sendJobRunsResult.value)
      ? sendJobRunsResult.value
      : [];
    bulkOperationPollJobRecentRuns.value = pollJobRunsResult.status === "fulfilled" && Array.isArray(pollJobRunsResult.value)
      ? pollJobRunsResult.value
      : [];

    if (syncRunStateResult.status !== "fulfilled") {
      throw syncRunStateResult.reason;
    }

    const syncRunState = syncRunStateResult.value;
    assertBackendDataAvailable(syncRunState, translate("Product sync run state is unavailable."));
    loadedRunState = true;

    // Prioritize the system message ID we already have in state if it's still active
    const currentMessageId = progressState.value?.systemMessageId;
    let latestMessage = syncRunState.latestSystemMessage;

    if (currentMessageId && syncRunState.systemMessages) {
      const currentMessage = syncRunState.systemMessages.find((m: any) => m.systemMessageId === currentMessageId);
      if (currentMessage) {
        latestMessage = currentMessage;
      } else if (!progressState.value?.completed) {
        // If the message we are tracking is NOT in the list yet and it's not completed,
        // it means there's a backend lag for a newly started sync.
        // We should NOT overwrite the progressState with an older message.
        latestMessage = null;
      }
    }

    if (latestMessage) {
      const status = normalizeProductSyncStatus({ 
        systemMessageState: latestMessage.statusId,
        logStatusId: latestMessage.logStatusId,
        logId: latestMessage.logId
      });

      progressState.value = {
        syncJobId: syncJobId.value || "",
        status,
        systemMessageState: latestMessage.statusId,
        logStatusId: latestMessage.logStatusId,
        logId: latestMessage.logId,
        systemMessageId: latestMessage.systemMessageId,
        completed: ["completed", "error", "cancelled"].includes(status)
      } as any;

      if (latestMessage.systemMessageId) {
        await fetchSyncRun(latestMessage.systemMessageId);
      }
    }

    if (isProgressComplete.value) {
      stopProgressPolling();
    }
    return true;
  } catch (error: any) {
    logger.error(error);
    if (!loadedRunState) {
      progressState.value = {
        ...progressState.value,
        status: "error",
        completed: true
      } as any;
      stopProgressPolling();
    }
    return !!bulkOperationSendJob.value?.jobName || !!bulkOperationPollJob.value?.jobName;
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
  updateScheduledJobRefreshAt();
  liveDashboard.start();
}

function stopNextSyncRefreshPolling() {
  liveDashboard.stop();
  scheduledJobRefreshAtMs = null;
  scheduledJobRefreshGraceUntilMs = null;
}

function getTrackedRefreshJobs() {
  const trackedJobs = [
    syncJobObj.value,
    bulkOperationSendJob.value,
    bulkOperationPollJob.value,
    syncJobDetails.value?.jobName ? syncJobDetails.value : selectedSyncJobDetailsJob.value
  ].filter((job: any) => job?.jobName && !isJobPaused(job));

  return trackedJobs.filter((job: any, index: number, jobs: any[]) => {
    return jobs.findIndex((candidate: any) => candidate?.jobName === job?.jobName) === index;
  });
}

function updateScheduledJobRefreshAt() {
  const nextRunTimes = getTrackedRefreshJobs()
    .map((job: any) => getNextRunDateTime(job)?.toMillis() || 0)
    .filter((time: number) => time > currentTimeMs.value);

  scheduledJobRefreshAtMs = nextRunTimes.length ? Math.min(...nextRunTimes) : null;
  if (scheduledJobRefreshAtMs && currentTimeMs.value < scheduledJobRefreshAtMs) {
    scheduledJobRefreshGraceUntilMs = null;
  }
}

async function evaluateScheduledRefresh(opts: { forceProbe?: boolean } = {}) {
  if (isRefreshInFlight.value) return;

  const shouldRefreshForScheduledRun = !!scheduledJobRefreshAtMs && currentTimeMs.value >= scheduledJobRefreshAtMs;
  const shouldRefreshDuringGraceWindow = !!scheduledJobRefreshGraceUntilMs && currentTimeMs.value <= scheduledJobRefreshGraceUntilMs;

  let needsRefresh = false;

  if (shouldRefreshForScheduledRun || shouldRefreshDuringGraceWindow) {
    const isCompleted = currentSyncRun.value?.completed;
    const hasPendingUpdates = pendingUpdateRequestsCount.value > 0;
    const hasRunningShopifyOperation = hasRunningShopifyBulkOperation.value;

    if (!isCompleted || hasPendingUpdates || hasRunningShopifyOperation) {
      needsRefresh = true;
    }
  }

  if (!needsRefresh && syncJobObj.value?.jobName) {
    try {
      const recentRuns = await fetchJobRuns(syncJobObj.value.jobName, { pageSize: 1 });
      if (recentRuns && recentRuns.length > 0) {
        const latestRun = recentRuns[0];
        const runStartTime = latestRun.startTime ? new Date(latestRun.startTime).getTime() : 0;
        const runEndTime = latestRun.endTime ? new Date(latestRun.endTime).getTime() : 0;

        let hasNewActivity = false;

        if (lastKnownJobRunStartTime === 0) {
          lastKnownJobRunStartTime = runStartTime;
          lastKnownJobRunEndTime = runEndTime;
        } else {
          if (runStartTime > lastKnownJobRunStartTime) {
            lastKnownJobRunStartTime = runStartTime;
            hasNewActivity = true;
          }
          if (runEndTime > lastKnownJobRunEndTime) {
            lastKnownJobRunEndTime = runEndTime;
            hasNewActivity = true;
          }
        }

        if (hasNewActivity) {
          const infoMessage = latestRun.infoMessage || latestRun.errorMessages || latestRun.messages || "";
          const hasNoActivity = infoMessage.includes("No bulk operation currently in progress") ||
                                infoMessage.includes("Aborting, no ShopifyBulkQuery Operation System Messages found to process");

          if (!hasNoActivity || !runEndTime) {
            needsRefresh = true;
          }
        }
      }
    } catch (err) {
      logger.error("Failed to check background job runs for auto-refresh", err);
    }
  }

  // Tab-focus refresh: once we've loaded once in this session, returning to the tab kicks a refresh
  // so the user sees fresh state without waiting for the next tick.
  if (!needsRefresh && opts.forceProbe && hasEverLoadedSecondary.value) {
    needsRefresh = true;
  }

  if (!needsRefresh) return;

  if (shouldRefreshForScheduledRun && scheduledJobRefreshAtMs) {
    scheduledJobRefreshGraceUntilMs = scheduledJobRefreshAtMs + 2 * 60 * 1000;
  }
  scheduledJobRefreshAtMs = null;

  await liveDashboard.runRefresh(async () => {
    if (activeExperienceMode.value === "returning" && !isLoading.value) {
      await loadSecondaryData({ silent: true });
    }
    if (showSyncJobDetailsModal.value && selectedSyncJobDetailsJob.value?.jobName && !syncJobDetailsDirty.value) {
      await refreshSyncJobDetails({ silent: true });
    }
  });

  updateScheduledJobRefreshAt();
  if (!scheduledJobRefreshAtMs && scheduledJobRefreshGraceUntilMs && currentTimeMs.value > scheduledJobRefreshGraceUntilMs) {
    scheduledJobRefreshGraceUntilMs = null;
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

function getNextRunMillis(job: any): number | null {
  if (!job?.jobName || !job?.cronExpression || isJobPaused(job)) return null;
  const nextRun = getNextRunDateTime(job);
  return nextRun?.toMillis() ?? null;
}

function getJobLatestRunMillis(runs: any[]): number | null {
  if (!runs?.length) return null;
  const started = getSyncJobRunStartedAt(runs[0]);
  if (!started) return null;
  const parsed = parseDateTimeValue(started);
  return parsed?.isValid ? parsed.toMillis() : null;
}

function getNextRunDateTime(job: any) {
  const nextExecutionDateTime = job?.nextExecutionDateTime || job?.nextRunTime || job?.nextRunDate || job?.nextRuntime;
  if (nextExecutionDateTime) {
    const parsed = parseDateTimeValue(nextExecutionDateTime);
    if (parsed?.isValid) return parsed;
  }

  if (!job?.cronExpression) return null;

  try {
    const interval = CronExpressionParser.parse(job.cronExpression, {
      tz: userProfile.value?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      currentDate: parseDateTimeValue(currentTimeMs.value)?.toJSDate()
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

  return `${formatJobDateTimeLabel(nextRun.toISO(), { sameDayTimeOnly: true })} (${getRelativeNextRunLabel(job)})`;
}

// Moved formatDateTime to @/utils

function formatCount(value: unknown) {
  if (value === undefined || value === null || value === "") return translate("Unavailable");
  const count = Number(value);
  if (Number.isNaN(count)) return translate("Unavailable");
  return count.toLocaleString();
}

function formatParameterValue(value: unknown) {
  if (value === undefined || value === null || value === "") return translate("Unavailable");
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function getSyncJobAuditHistoryKey(auditLog: any) {
  return auditLog.auditHistorySeqId ||
    [auditLog.changedEntityName, auditLog.pkPrimaryValue, auditLog.changedFieldName, auditLog.changedDate].filter(Boolean).join("-");
}

function getSyncJobAuditFieldLabel(auditLog: any) {
  return formatAuditFieldName(auditLog.changedFieldName || translate("Field"));
}

function getSyncJobAuditChangedAt(auditLog: any) {
  return auditLog.changedDate || auditLog.lastUpdatedStamp || auditLog.createdStamp || "";
}

function getSyncJobAuditChangedBy(auditLog: any) {
  return auditLog.changedByUserId || auditLog.userId || auditLog.lastUpdatedByUserId || "";
}

async function loadSyncJobAuditUsers(auditLogs: any[]) {
  const userIds = Array.from(new Set(auditLogs.map(getSyncJobAuditChangedBy).filter(Boolean)));
  const missingUserIds = userIds.filter((userId) => !syncJobAuditUsers.value[userId]);

  if (!missingUserIds.length) return;

  const responses = await Promise.allSettled(missingUserIds.map(async (userId) => {
    const resp = await UserService.getUserAccount(userId);
    return { userId, data: resp?.data || {} };
  }));

  const auditUsers = { ...syncJobAuditUsers.value };
  responses.forEach((response) => {
    if (response.status === "fulfilled") {
      auditUsers[response.value.userId] = response.value.data;
      return;
    }

    const rejectedUserId = missingUserIds[responses.indexOf(response)];
    auditUsers[rejectedUserId] = { userId: rejectedUserId };
    logger.warn("Failed to load audit user details", response.reason);
  });
  syncJobAuditUsers.value = auditUsers;
}

function getSyncJobAuditChangedByLabel(auditLog: any) {
  const userId = getSyncJobAuditChangedBy(auditLog);
  if (!userId) return "";

  const userDetails = syncJobAuditUsers.value[userId];
  if (!userDetails) return userId;

  const primaryLabel = userDetails.userFullName?.trim() || userDetails.externalUserId || userDetails.username || userId;

  return primaryLabel === userId ? userId : `${primaryLabel} (${userId})`;
}

function getSyncJobAuditChangeLabel(auditLog: any) {
  const oldValue = auditLog.oldValueText ?? auditLog.oldValue ?? "";
  const newValue = auditLog.newValueText ?? auditLog.newValue ?? "";

  if (oldValue !== "" && newValue !== "") {
    return `${translate("Previous value")}: ${formatParameterValue(oldValue)} · ${translate("New value")}: ${formatParameterValue(newValue)}`;
  }
  if (newValue !== "") {
    return `${translate("New value")}: ${formatParameterValue(newValue)}`;
  }
  if (oldValue !== "") {
    return `${translate("Previous value")}: ${formatParameterValue(oldValue)}`;
  }
  return translate("Value unavailable");
}

function formatAuditFieldName(fieldName: string) {
  if (!fieldName) return translate("Field");
  const spaced = String(fieldName)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
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

// Moved parseDateTimeValue to @/utils

function getErrorMessage(error: any, defaultMessage: string) {
  const message = error?.response?.data?.error ||
    error?.response?.data?.errors ||
    error?.data?.error ||
    error?.message ||
    defaultMessage;
  return typeof message === "string" ? message : JSON.stringify(message);
}

function isShopifyWriteAccessError(message: string) {
  const normalizedMessage = String(message || "").toLowerCase();
  return normalizedMessage.includes("cannot post graphql mutation") ||
    normalizedMessage.includes("only read access is enabled") ||
    normalizedMessage.includes("write access is required");
}

function assertBackendDataAvailable(payload: any, message: string) {
  if (payload?.backendAvailable === false) {
    throw new Error(message);
  }
}

async function loadWebhookSubscriptions() {
  if (!selectedShopSystemMessageRemoteId.value) return;
  isWebhookLoading.value = true;
  try {
    webhookSubscriptions.value = await ShopifyProductSyncService.fetchWebhookSubscriptions({
      systemMessageRemoteId: selectedShopSystemMessageRemoteId.value,
      topic: "BULK_OPERATIONS_FINISH"
    });
    isWebhookSupported.value = true;
  } catch (error) {
    logger.error("Failed to load webhook subscriptions", error);
    isWebhookSupported.value = false;
  } finally {
    isWebhookLoading.value = false;
  }
}

async function toggleWebhookSubscription(subscribe: boolean) {
  if (!selectedShopSystemMessageRemoteId.value) {
    showToast(translate("Shop connection details not fully loaded."));
    return;
  }
  isWebhookLoading.value = true;
  try {
    if (subscribe) {
      await ShopifyProductSyncService.subscribeWebhook({
        systemMessageRemoteId: selectedShopSystemMessageRemoteId.value,
        topic: "BULK_OPERATIONS_FINISH",
        endPoint: "shopify/webhook/payload"
      });
      showToast(translate("Subscribed to bulk operations finish webhook."));
    } else {
      const subscription = webhookSubscriptions.value.find((s: any) => s.node.topic === "BULK_OPERATIONS_FINISH");
      if (subscription) {
        await ShopifyProductSyncService.unsubscribeWebhook({
          systemMessageRemoteId: selectedShopSystemMessageRemoteId.value,
          webhookSubscriptionId: subscription.node.id
        });
        showToast(translate("Unsubscribed from bulk operations finish webhook."));
      }
    }
    await loadWebhookSubscriptions();
  } catch (error) {
    logger.error("Failed to toggle webhook subscription", error);
    showToast(translate("Failed to update webhook subscription."));
  } finally {
    isWebhookLoading.value = false;
  }
}
</script>
