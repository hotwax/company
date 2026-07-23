<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button :default-href="connectionDetailsHref" />
        </ion-buttons>
        <ion-title>{{ translate("Order sync") }}</ion-title>
        <ion-buttons slot="end">
          <ion-button
            :disabled="isRefreshing || isInitialLoading"
            :aria-label="translate('Refresh Order Sync monitoring')"
            @click="handleManualRefresh"
          >
            <ion-spinner v-if="isRefreshing" name="crescent" />
            <ion-icon v-else slot="icon-only" :icon="refreshOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="order-sync-page">
      <ion-progress-bar
        v-if="isRefreshing && hasLoadedMonitoring"
        type="indeterminate"
        :aria-label="translate('Refreshing Order Sync monitoring')"
      />

      <main class="order-sync-content">
        <template v-if="isInitialLoading">
          <section class="dashboard-grid" :aria-label="translate('Loading Order Sync monitoring')">
            <ion-card v-for="card in 2" :key="card">
              <ion-card-header>
                <ion-card-title>
                  <ion-skeleton-text animated style="width: 35%" />
                </ion-card-title>
                <ion-card-subtitle>
                  <ion-skeleton-text animated style="width: 70%" />
                </ion-card-subtitle>
              </ion-card-header>
              <ion-list lines="full">
                <ion-item v-for="row in 4" :key="row">
                  <ion-label>
                    <ion-skeleton-text animated style="width: 45%" />
                    <p><ion-skeleton-text animated style="width: 65%" /></p>
                  </ion-label>
                </ion-item>
              </ion-list>
            </ion-card>

          </section>
        </template>

        <ion-card v-else-if="fatalLoadError" class="state-card" role="alert">
          <ion-card-header>
            <ion-card-title>{{ translate("Order sync could not load") }}</ion-card-title>
            <ion-card-subtitle>{{ translate("Previously loaded data is not available for this shop.") }}</ion-card-subtitle>
          </ion-card-header>
          <ion-card-content>
            <p>{{ fatalLoadError }}</p>
            <ion-button fill="outline" @click="handleManualRefresh">
              {{ translate("Retry") }}
            </ion-button>
          </ion-card-content>
        </ion-card>

        <template v-else>
          <ion-card v-if="!orderSyncStore.job" class="state-card">
            <ion-card-header>
              <ion-card-title>{{ translate("Order Sync needs setup") }}</ion-card-title>
              <ion-card-subtitle>
                {{ translate("Configure a paused shop-specific batch job before monitoring scheduled orders.") }}
              </ion-card-subtitle>
            </ion-card-header>
            <ion-card-content>
              <ion-button :router-link="configurationHref">
                {{ translate("Configure Order Sync") }}
              </ion-button>
            </ion-card-content>
          </ion-card>

          <ion-card v-if="staleRefreshError" class="inline-warning" role="status">
            <ion-card-content>
              <strong>{{ translate("Latest refresh failed") }}</strong>
              <p>{{ staleRefreshError }}</p>
              <p>{{ translate("The last successfully loaded monitoring data remains visible.") }}</p>
            </ion-card-content>
          </ion-card>

          <section class="sync-summary" :aria-label="translate('Order Sync summary and progress')">
            <ion-card class="summary">
              <ion-card-header>
                <ion-card-title>{{ translate("Summary") }}</ion-card-title>
                <ion-card-subtitle>
                  {{ translate("Latest scheduled batch activity for this Shopify instance") }}
                </ion-card-subtitle>
                <ion-buttons>
                  <ion-button
                    fill="clear"
                    :disabled="!canRunForSelectedShop || orderSyncStore.activeMutation === 'run-now'"
                    @click="confirmRunNow"
                  >
                    <ion-spinner v-if="orderSyncStore.activeMutation === 'run-now'" slot="start" name="crescent" />
                    <ion-icon v-else slot="start" :icon="flashOutline" />
                    {{ translate("Run now") }}
                  </ion-button>
                </ion-buttons>
              </ion-card-header>

              <ion-list lines="full">
                <ion-item>
                  <ion-label>
                    {{ translate("Shopify instance") }}
                    <p>{{ translate("Shop ID") }}: {{ id }}</p>
                  </ion-label>
                  <ion-note slot="end">
                    {{ shopName }} · {{ shopifyShopId || translate("Not available") }}
                  </ion-note>
                </ion-item>
                <ion-item>
                  <ion-label>
                    {{ translate("Last completed batch") }}
                    <p>{{ lastCompletedBatchLabel }}</p>
                  </ion-label>
                  <ion-note slot="end">{{ latestCompletedBatchId }}</ion-note>
                </ion-item>
                <ion-item>
                  <ion-label>
                    {{ translate("Next batch sync") }}
                    <p>{{ nextRunLabel }}</p>
                  </ion-label>
                  <ion-badge v-if="orderSyncStore.job?.paused" slot="end" color="warning">
                    {{ translate("Paused") }}
                  </ion-badge>
                </ion-item>
                <ion-item>
                  <ion-label>{{ translate("Orders processed") }}</ion-label>
                  <ion-note slot="end">{{ orderSyncStore.summary.processedOrderCount }}</ion-note>
                </ion-item>
                <ion-item>
                  <ion-label>
                    {{ translate("Latest batch outcome") }}
                    <p>{{ latestBatch?.systemMessageId || translate("Awaiting first run") }}</p>
                  </ion-label>
                  <ion-badge slot="end" :color="progressColor(orderSyncStore.summary.overallStatus)">
                    {{ progressStateLabel(orderSyncStore.summary.overallStatus) }}
                  </ion-badge>
                </ion-item>
                <ion-item>
                  <ion-label>{{ translate("Pending batch requests") }}</ion-label>
                  <ion-badge slot="end" :color="orderSyncStore.summary.pendingBatchRequests ? 'primary' : 'medium'">
                    {{ orderSyncStore.summary.pendingBatchRequests }}
                  </ion-badge>
                </ion-item>
                <ion-item lines="none">
                  <ion-label>
                    {{ translate("Product store") }}
                    <p>{{ productStoreId || translate("Not linked") }}</p>
                  </ion-label>
                  <ion-note slot="end">{{ productStoreName }}</ion-note>
                </ion-item>
              </ion-list>

              <ion-card-content v-if="runNowExplanation || actionMessage || actionError" class="action-feedback">
                <p v-if="runNowExplanation">{{ runNowExplanation }}</p>
                <p v-if="actionMessage" class="ion-text-success" role="status">{{ actionMessage }}</p>
                <p v-if="actionError" class="ion-text-danger" role="alert">{{ actionError }}</p>
                <p v-if="orderSyncStore.lastRunResult?.systemMessageId">
                  {{ translate("Queued SystemMessage") }}:
                  <ion-button fill="clear" size="small" @click="openSystemMessageDetails(orderSyncStore.lastRunResult.systemMessageId)">
                    {{ orderSyncStore.lastRunResult.systemMessageId }}
                  </ion-button>
                </p>
              </ion-card-content>
            </ion-card>

            <ion-card class="progress">
              <ion-card-header>
                <ion-card-title>{{ translate("Track sync progress") }}</ion-card-title>
                <ion-card-subtitle>
                  {{ translate("Follow the Shopify request and the resulting HotWax order imports") }}
                </ion-card-subtitle>
                <ion-buttons>
                  <ion-button
                    fill="clear"
                    :router-link="`${connectionDetailsHref}/order-sync/history`"
                    :aria-label="translate('View import history')"
                  >
                    <ion-icon slot="icon-only" :icon="timeOutline" />
                  </ion-button>
                </ion-buttons>
              </ion-card-header>

              <ion-list lines="full">
                <ion-item
                  v-for="row in progressRows"
                  :key="row.id"
                  class="progress-item"
                  :button="(row.id === 'batch-request' && !!latestBatch?.systemMessageId) || (row.id === 'hotwax-import' && !!progressImports[0]?.logId)"
                  :detail="(row.id === 'batch-request' && !!latestBatch?.systemMessageId) || (row.id === 'hotwax-import' && !!progressImports[0]?.logId)"
                  @click="openProgressDetails(row)"
                >
                  <ion-label>
                    {{ progressRowTitle(row.id) }}
                    <p>{{ progressDetailLabel(row) }}</p>

                    <template v-if="row.id === 'batch-request'">
                      <p v-if="latestBatch?.systemMessageId">
                        {{ translate("SystemMessage") }} · {{ latestBatch.systemMessageId }}
                      </p>
                      <p v-else>{{ translate("SystemMessage not created yet") }}</p>
                      <p>{{ translate("Requested") }} · {{ batchRequestedLabel }}</p>
                      <p>{{ translate("Job run") }} · {{ latestBatch?.createdByJobRunId || translate("Not available") }}</p>
                    </template>

                    <template v-else>
                      <p v-if="!progressImports.length && row.state === 'completed'">
                        {{ translate("Completed with 0 actionable order changes. No DataManager import was required.") }}
                      </p>
                      <p v-else-if="!progressImports.length">
                        {{ translate("Waiting for the Shopify batch request to produce an order import.") }}
                      </p>
                      <template v-else>
                        <p v-for="log in progressImports" :key="log.logId || log.configId">
                          <ion-button class="progress-fact-button" fill="clear" size="small" @click.stop="openMdmLogDetails(log.logId)">
                            {{ importLabel(log.configId) }} · {{ rawStatusLabel(log.statusId, log.failedRecordCount, log.successRecordCount) }} · {{ log.totalRecordCount }} {{ translate("records") }}
                          </ion-button>
                        </p>
                      </template>
                    </template>
                  </ion-label>
                  <ion-badge slot="end" :color="progressColor(row.state)">
                    {{ progressStateLabel(row.state) }}
                  </ion-badge>
                </ion-item>
              </ion-list>
            </ion-card>
          </section>

          <section class="sync-monitor" aria-labelledby="sync-monitor-heading">
            <ion-item lines="none">
              <ion-label>
                <h2 id="sync-monitor-heading">{{ translate("Sync monitor") }}</h2>
                <p>{{ translate("Review the jobs and pipeline that move orders from Shopify into HotWax") }}</p>
              </ion-label>
            </ion-item>

            <ion-card>
              <ion-card-header>
                <ion-card-title>{{ translate("Order sync jobs") }}</ion-card-title>
                <ion-card-subtitle>{{ translate("Review the job that queues scheduled Shopify order requests") }}</ion-card-subtitle>
              </ion-card-header>
              <ion-list>
                <ion-item button detail :disabled="!orderSyncStore.job" @click="showJobDetailsModal = true">
                  <ion-label>
                    {{ translate("Queue order requests") }}
                    <p>{{ formatDate(orderSyncStore.job?.lastRunTime) }}</p>
                  </ion-label>
                  <ion-badge slot="end" :color="jobStateColor">{{ jobStateLabel }}</ion-badge>
                </ion-item>
                <ion-item button detail :router-link="configurationHref">
                  <ion-label>
                    {{ translate("Schedule") }}
                    <p>{{ orderSyncStore.job?.cronExpression || translate("Not scheduled") }}</p>
                  </ion-label>
                  <ion-note slot="end">{{ nextRunLabel }}</ion-note>
                </ion-item>
              </ion-list>
            </ion-card>

            <ion-card>
              <ion-card-header>
                <ion-card-title>{{ translate("Key dates") }}</ion-card-title>
                <ion-card-subtitle>{{ translate("Landmark dates that define how this shop's orders are synced") }}</ion-card-subtitle>
              </ion-card-header>
              <ion-list>
                <ion-item>
                  <ion-label class="ion-text-wrap">
                    {{ translate("New order sync launch date") }}
                    <p>{{ translate("Orders created on or after this go-live date sync as live fulfillment work") }}</p>
                  </ion-label>
                  <ion-label slot="end">{{ landmarkDateLabel(orderSyncStore.landmarkDates.launchDate) }}</ion-label>
                </ion-item>
                <ion-item lines="none">
                  <ion-label class="ion-text-wrap">
                    {{ translate("Order history synced through") }}
                    <p>{{ translate("Orders before the launch date are imported as historical records up to this point") }}</p>
                  </ion-label>
                  <ion-label slot="end">{{ landmarkDateLabel(orderSyncStore.landmarkDates.historyLastSyncDate) }}</ion-label>
                </ion-item>
                <ion-item v-if="orderSyncStore.landmarkDates.status === 'error'" lines="none">
                  <ion-label class="ion-text-wrap ion-text-danger" role="status">
                    <p>{{ translate("Landmark dates could not be loaded.") }}</p>
                  </ion-label>
                </ion-item>
              </ion-list>
            </ion-card>

            <ion-card>
              <ion-card-header>
                <ion-card-title>{{ translate("Pipeline") }}</ion-card-title>
                <ion-card-subtitle>{{ translate("Monitor how the order sync pipeline is performing") }}</ion-card-subtitle>
              </ion-card-header>
              <ion-list>
                <ion-item>
                  <ion-label>
                    {{ translate("Pending batch requests") }}
                    <p>{{ translate("Shopify requests waiting to be processed") }}</p>
                  </ion-label>
                  <ion-label slot="end">{{ orderSyncStore.summary.pendingBatchRequests }}</ion-label>
                </ion-item>
                <ion-item>
                  <ion-label>
                    {{ translate("Current Shopify request status") }}
                    <p>{{ latestBatch?.systemMessageId || translate("No recent request") }}</p>
                  </ion-label>
                  <ion-badge slot="end" :color="progressColor(orderSyncStore.summary.batchStatus)">
                    {{ progressStateLabel(orderSyncStore.summary.batchStatus) }}
                  </ion-badge>
                </ion-item>
                <ion-item>
                  <ion-label>{{ translate("Order history records") }}</ion-label>
                  <ion-label slot="end">{{ orderSyncStore.recentOrders.length }}</ion-label>
                </ion-item>
                <ion-item>
                  <ion-label>
                    {{ translate("Failed DataManager runs") }}
                    <p>{{ translate("Order imports with one or more error records") }}</p>
                  </ion-label>
                  <ion-label slot="end">{{ failedImportLogs.length }}</ion-label>
                </ion-item>
              </ion-list>
            </ion-card>

            <ShopifyOrderSyncCustomRequestCard @open-search="openCustomOrderRequest" @open-replay="openOrdersReplay" />
          </section>

          <section class="sync-stat" aria-labelledby="recent-orders-heading">
            <ion-progress-bar
              v-if="isRefreshing"
              type="indeterminate"
              :aria-label="translate('Refreshing order sync history')"
            />
            <div class="stat-header">
              <ion-item class="stat-title" lines="none">
                <ion-label>
                  <h2 id="recent-orders-heading">{{ translate("Recent order sync history") }}</h2>
                  <p>{{ translate("Latest 100 records stitched from Shopify order history models, newest first") }}</p>
                </ion-label>
                <ion-badge slot="end" color="medium">{{ orderSyncStore.recentOrders.length }}</ion-badge>
              </ion-item>
              <ion-searchbar
                :value="ordersQuery"
                :debounce="0"
                :placeholder="translate('Search the loaded orders by Shopify name or ID')"
                :aria-label="translate('Search order sync history')"
                @ionInput="ordersQuery = String($event.detail.value || '')"
              />
            </div>
            <div class="stat-data" role="list">
              <transition-group name="list" tag="div" class="list-transition-group">
                <ion-card v-for="order in filteredOrders" :key="order.id" role="listitem">
                  <ion-list lines="full">
                    <ion-item>
                      <ion-label class="ion-text-wrap">
                        {{ order.orderName || order.shopifyOrderId }}
                        <p>{{ translate("Shopify order") }} {{ order.shopifyOrderId || translate("Not available") }}</p>
                        <p>{{ translate("Processed") }} · {{ formatDate(order.processedAt) }}</p>
                      </ion-label>
                      <ion-badge slot="end" :color="order.outcome === 'Created' ? 'success' : 'primary'">
                        {{ translate(order.outcome) }}
                      </ion-badge>
                    </ion-item>
                    <ion-item>
                      <ion-label>
                        {{ translate("Shopify order ID") }}
                        <p>{{ order.shopifyOrderId }}</p>
                      </ion-label>
                      <ion-button
                        v-if="shopifyAdminOrderUrl(order)"
                        slot="end"
                        fill="clear"
                        color="medium"
                        :href="shopifyAdminOrderUrl(order)"
                        target="_blank"
                        rel="noopener noreferrer"
                        :aria-label="translate('Open order in Shopify Admin')"
                        @click.stop
                      >
                        <ion-icon slot="icon-only" :icon="openOutline" />
                      </ion-button>
                    </ion-item>
                    <ion-card-content v-if="order.outcome === 'Updated'">
                      <p class="history-object-heading">{{ translate("Updated objects") }}</p>
                      <div v-if="order.updatedObjects.length" class="history-object-list">
                        <ion-chip v-for="object in order.updatedObjects" :key="object.objectType">
                          <ion-label>{{ historyObjectLabel(object.objectType, object.count) }}</ion-label>
                        </ion-chip>
                      </div>
                      <p v-if="order.updatedObjects.length && !order.changeDetailsComplete" class="ion-no-margin">
                        {{ translate("Legacy history may not include every updated object.") }}
                      </p>
                      <p v-else class="ion-no-margin">
                        {{ order.changeDetailsComplete
                          ? translate("No tracked order objects changed.")
                          : translate("Object-level details were not recorded for this legacy update.") }}
                      </p>
                    </ion-card-content>
                  </ion-list>
                </ion-card>
              </transition-group>
              <ion-card v-if="!filteredOrders.length">
                <ion-item lines="none">
                  <ion-label class="ion-text-center">
                    <p v-if="ordersQuery">{{ translate("No loaded orders match this search.") }}</p>
                    <p v-else>{{ recentOrdersEmptyMessage }}</p>
                  </ion-label>
                </ion-item>
              </ion-card>
            </div>
          </section>

          <section class="sync-stat" aria-labelledby="failed-import-logs-heading">
            <div class="stat-header">
              <ion-item class="stat-title" lines="none">
                <ion-label>
                  <h2 id="failed-import-logs-heading">{{ translate("Failed DataManager runs") }}</h2>
                  <p>{{ translate("Latest Order Sync imports with one or more error records, newest first") }}</p>
                </ion-label>
                <ion-badge slot="end" :color="failedImportLogs.length ? 'danger' : 'medium'">
                  {{ failedImportLogs.length }}
                </ion-badge>
              </ion-item>
            </div>

            <div class="stat-data" role="list">
              <transition-group name="list" tag="div" class="list-transition-group">
                <ion-card v-for="log in failedImportLogs" :key="log.logId" role="listitem">
                  <ion-list lines="full">
                    <ion-item>
                      <ion-label>{{ translate("Log ID") }}</ion-label>
                      <ion-note slot="end">{{ log.logId }}</ion-note>
                    </ion-item>
                    <ion-item>
                      <ion-label>{{ translate("Created") }}</ion-label>
                      <ion-note slot="end">{{ formatDate(log.createdDate) }}</ion-note>
                    </ion-item>
                    <ion-item>
                      <ion-label>{{ translate("Start time") }}</ion-label>
                      <ion-note slot="end">{{ formatDate(log.startDateTime) }}</ion-note>
                    </ion-item>
                    <ion-item>
                      <ion-label>{{ translate("End time") }}</ion-label>
                      <ion-note slot="end">{{ formatDate(log.finishDateTime || log.lastUpdatedTxStamp) }}</ion-note>
                    </ion-item>
                    <ion-item>
                      <ion-label>{{ translate("Records") }}</ion-label>
                      <ion-note slot="end">
                        {{ log.totalRecordCount }} {{ translate(log.totalRecordCount === 1 ? "record" : "records") }} ·
                        {{ log.failedRecordCount }} {{ translate(log.failedRecordCount === 1 ? "error record" : "error records") }}
                      </ion-note>
                    </ion-item>
                    <ion-item lines="none">
                      <ion-button
                        slot="end"
                        fill="clear"
                        :href="jobManagerLogUrl(log.logId)"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {{ translate("Open in Job Manager") }}
                        <ion-icon slot="end" :icon="openOutline" />
                      </ion-button>
                    </ion-item>
                  </ion-list>
                </ion-card>
              </transition-group>
              <ion-card v-if="!failedImportLogs.length">
                <ion-item lines="none">
                  <ion-label class="ion-text-center">
                    <p>{{ translate("No DataManager runs with error records were found for this Shopify instance.") }}</p>
                  </ion-label>
                </ion-item>
              </ion-card>
            </div>
          </section>
        </template>
      </main>
    </ion-content>

    <ion-modal :is-open="showReplayOrdersModal" :backdrop-dismiss="false" @didDismiss="showReplayOrdersModal = false">
      <ion-header>
        <ion-toolbar>
          <ion-buttons slot="start">
            <ion-button :aria-label="translate('Close')" @click="showReplayOrdersModal = false">
              <ion-icon slot="icon-only" :icon="closeOutline" />
            </ion-button>
          </ion-buttons>
          <ion-title>{{ translate("Replay orders") }}</ion-title>
        </ion-toolbar>
      </ion-header>
      <ion-content>
        <ion-list lines="full">
          <ion-item lines="none">
            <ion-label class="ion-text-wrap">
              <h2>{{ translate("Replay orders from a certain time") }}</h2>
              <p>{{ translate("Select a time to rewind order sync to. Every order updated from that time onward is re-imported through the standard fresh-fetch path, up to {limit} orders.", { limit: REPLAY_ORDER_LIMIT }) }}</p>
            </ion-label>
          </ion-item>
          <ion-item class="replay-date-range" lines="none">
            <ion-input type="date" :value="replayFromDate" label-placement="stacked" clear-input :aria-label="translate('From date')" @ionInput="replayFromDate = String($event.detail.value || '')">
              <div slot="label">{{ translate("From date") }}</div>
            </ion-input>
            <ion-input type="date" :value="replayThruDate" label-placement="stacked" clear-input :aria-label="translate('Thru date')" @ionInput="replayThruDate = String($event.detail.value || '')">
              <div slot="label">{{ translate("Thru date") }}</div>
            </ion-input>
          </ion-item>
          <ion-note v-if="replayDateRangeError" color="danger" class="replay-date-range-error">{{ replayDateRangeError }}</ion-note>
          <ion-note v-else class="replay-date-range-help">
            {{ translate("Dates are inclusive and use the OMS runtime timezone: {timeZone}.", { timeZone: orderSyncStore.runtimeTimeZone || "UTC" }) }}
          </ion-note>
          <ion-item lines="none" class="replay-actions">
            <ion-button fill="clear" :disabled="isReplayStarting" @click="showReplayOrdersModal = false">{{ translate("Cancel") }}</ion-button>
            <ion-button fill="solid" color="primary" :disabled="isReplayStarting" @click="startOrdersReplay">
              <ion-spinner v-if="isReplayStarting" name="crescent" />
              <span v-else>{{ translate("Start replay") }}</span>
            </ion-button>
          </ion-item>
        </ion-list>
      </ion-content>
    </ion-modal>

    <ServiceJobDetailsModal
      :is-open="showJobDetailsModal"
      :job-name="orderSyncStore.job?.jobName || ''"
      :title="translate('Queue order requests')"
      :allowed-parameter-names="['shopId', 'systemMessageRemoteId', 'systemMessageTypeId', 'runAsBatch']"
      :parameter-description="translate('Job and service parameters used by this Order Sync job.')"
      :can-run-now="canRunForSelectedShop"
      :can-edit="canEditJobFromModal"
      :run-now-disabled-reason="orderSyncStore.runNowDisabledReason"
      :edit-disabled-reason="editJobDisabledReason"
      :run-handler="confirmRunNow"
      :save-handler="saveJobFromModal"
      @updated="refreshAfterJobModalUpdate"
      @close="showJobDetailsModal = false"
    />
    <SystemMessageDetailsModal
      :is-open="showSystemMessageModal"
      :message-id="selectedSystemMessageId"
      :details="selectedSystemMessageDetails"
      @refresh="handleManualRefresh"
      @close="showSystemMessageModal = false"
    />
    <ShopifyOrderSyncMdmLogModal
      :is-open="showMdmLogModal"
      :log-id="selectedMdmLogId"
      :details="selectedMdmLogDetails"
      @close="showMdmLogModal = false"
    />
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonBackButton,
  IonBadge,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonChip,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonNote,
  IonPage,
  IonProgressBar,
  IonRow,
  IonSearchbar,
  IonSkeletonText,
  IonSpinner,
  IonTitle,
  IonToolbar,
  alertController,
  modalController,
} from "@ionic/vue";
import { commonUtil, translate } from "@common";
import { computed, ref, watch } from "vue";
import { DateTime } from "luxon";
import { closeOutline, downloadOutline, flashOutline, openOutline, refreshOutline, timeOutline } from "ionicons/icons";
import { downloadTextFile, formatDateTime, getDownloadFileContent } from "@/utils";
import { useDataManagerLog } from "@/composables/useDataManagerLog";
import { useShopifyOrderSyncPolling } from "@/composables/useShopifyOrderSyncPolling";
import ServiceJobDetailsModal from "@/components/ServiceJobDetailsModal.vue";
import SystemMessageDetailsModal from "@/components/SystemMessageDetailsModal.vue";
import ShopifyOrderSyncMdmLogModal from "@/components/ShopifyOrderSyncMdmLogModal.vue";
import ShopifyOrderSyncCustomRequestCard from "@/components/ShopifyOrderSyncCustomRequestCard.vue";
import ShopifyOrderSyncOrdersModal from "@/components/ShopifyOrderSyncOrdersModal.vue";
import {
  useShopifyOrderSyncStore,
  type ShopifyOrderSyncImport,
  type ShopifyOrderSyncRecentError,
  type ShopifyOrderSyncRecentOrder,
} from "@/store/shopifyOrderSync";
import {
  type OrderSyncProgressRow,
  type OrderSyncProgressState,
  deriveOrderSyncErrorResolution,
  extractOrderErrorRecordDetails,
} from "@/utils/shopifyOrderSync";
import {
  buildShopifyOrderSyncErrorCsv,
  shopifyOrderSyncErrorCsvFileName,
} from "@/utils/shopifyOrderSyncErrorCsv";

const props = defineProps<{ id: string }>();
const orderSyncStore = useShopifyOrderSyncStore();

const ordersQuery = ref("");
const errorsQuery = ref("");
const pollingError = ref("");
const actionMessage = ref("");
const actionError = ref("");
const showJobDetailsModal = ref(false);
const showSystemMessageModal = ref(false);
const showMdmLogModal = ref(false);
const selectedSystemMessageId = ref("");
const selectedMdmLogId = ref("");
const retryActionErrors = ref<Record<string, string>>({});
const errorDownloadState = ref<"idle" | "loading" | "success" | "error">("idle");
const errorDownloadMessage = ref("");

async function refreshStore() {
  const shopId = props.id;
  try {
    await orderSyncStore.loadMonitoring(shopId);
    if (props.id === shopId && orderSyncStore.selectedShopId === shopId) pollingError.value = "";
  } catch (error) {
    if (props.id !== shopId || orderSyncStore.selectedShopId !== shopId) return;
    pollingError.value = errorMessage(error, translate("Order Sync monitoring could not be refreshed."));
    throw error;
  }
}

const polling = useShopifyOrderSyncPolling({
  batchActive: () => orderSyncStore.isBatchActive,
  refresh: refreshStore,
  onError: (error) => {
    pollingError.value = errorMessage(error, translate("Order Sync monitoring could not be refreshed."));
  },
});

watch(() => props.id, (nextId, previousId) => {
  if (!nextId || nextId === previousId) return;
  const refreshWasInFlight = polling.isRefreshing.value;
  ordersQuery.value = "";
  errorsQuery.value = "";
  pollingError.value = "";
  actionMessage.value = "";
  actionError.value = "";
  retryActionErrors.value = {};
  errorDownloadState.value = "idle";
  errorDownloadMessage.value = "";
  orderSyncStore.resetForShop(nextId);

  if (!polling.isPageActive.value) return;
  const routeRefresh = polling.manualRefresh();
  if (refreshWasInFlight) {
    void routeRefresh.then(() => {
      if (
        polling.isPageActive.value
        && props.id === nextId
        && orderSyncStore.selectedShopId === nextId
        && !orderSyncStore.monitoringLoadedAt
      ) {
        void polling.manualRefresh();
      }
    });
  }
}, { immediate: true, flush: "sync" });

const connectionDetailsHref = computed(() => `/shopify-connection-details/${encodeURIComponent(props.id)}`);
const configurationHref = computed(() => `${connectionDetailsHref.value}/order-sync/configure`);
const hasLoadedMonitoring = computed(() => Boolean(orderSyncStore.monitoringLoadedAt));
const isInitialLoading = computed(() => !hasLoadedMonitoring.value && !orderSyncStore.monitoringError);
const isRefreshing = computed(() => orderSyncStore.monitoringRefreshing || polling.isRefreshing.value);
const fatalLoadError = computed(() => hasLoadedMonitoring.value ? "" : (orderSyncStore.monitoringError || pollingError.value));
const staleRefreshError = computed(() => hasLoadedMonitoring.value ? (orderSyncStore.monitoringError || pollingError.value) : "");
const selectedShopMatchesRoute = computed(() => Boolean(props.id) && orderSyncStore.selectedShopId === props.id);
const loadedShopMatchesRoute = computed(() => selectedShopMatchesRoute.value && orderSyncStore.shop?.shopId === props.id);
const canRunForSelectedShop = computed(() => loadedShopMatchesRoute.value && orderSyncStore.canRunNow);
const canEditJobFromModal = computed(() => loadedShopMatchesRoute.value
  && orderSyncStore.capabilities.canEditSchedule
  && orderSyncStore.capabilities.canActivate
  && !orderSyncStore.activeMutation);
const editJobDisabledReason = computed(() => canEditJobFromModal.value
  ? ""
  : translate("COMMON_ADMIN permission is required to edit Order Sync."));
const shopName = computed(() => orderSyncStore.shop?.name || translate("Shopify instance {id}", { id: props.id }));
const shopifyShopId = computed(() => orderSyncStore.shop?.shopifyShopId || "");
const productStoreId = computed(() => orderSyncStore.productStore?.productStoreId || orderSyncStore.shop?.productStoreId || "");
const productStoreName = computed(() => orderSyncStore.productStore?.name || orderSyncStore.shop?.productStoreName || translate("Not linked"));
const latestBatch = computed(() => orderSyncStore.summary.latestBatch);
const latestCompletedBatchId = computed(() => orderSyncStore.summary.latestCompletedBatch?.systemMessageId || translate("None"));
const progressRows = computed<readonly [OrderSyncProgressRow, OrderSyncProgressRow]>(() => orderSyncStore.summary.progressRows);
const progressImports = computed<ShopifyOrderSyncImport[]>(() => {
  const systemMessageId = latestBatch.value?.systemMessageId;
  return systemMessageId ? orderSyncStore.importsBySystemMessageId[systemMessageId] || [] : [];
});
const selectedSystemMessageDetails = computed(() => {
  const message = (orderSyncStore.systemMessages || [])
    .find((row) => row.systemMessageId === selectedSystemMessageId.value);
  const imports = orderSyncStore.importsBySystemMessageId[selectedSystemMessageId.value] || [];
  const successfulAudit = (orderSyncStore.recentAudits || [])
    .find((row) => row.systemMessageId === selectedSystemMessageId.value);
  const requestFailure = (orderSyncStore.recentRequestErrors || [])
    .find((row) => row.systemMessageId === selectedSystemMessageId.value);
  const importFailure = (orderSyncStore.recentErrors || [])
    .find((row) => row.systemMessageId === selectedSystemMessageId.value);
  const totalRecordCount = imports.length
    ? imports.reduce((total, row) => total + row.totalRecordCount, 0)
    : successfulAudit ? 1 : undefined;
  const failedRecordCount = imports.length
    ? imports.reduce((total, row) => total + row.failedRecordCount, 0)
    : undefined;
  const importStatuses = imports.map((row) => String(row.statusId || "").toLocaleLowerCase());
  const importsFailed = imports.length > 0 && ((failedRecordCount ?? 0) > 0
    || importStatuses.some((status) => status.includes("fail") || status.includes("crash") || status.includes("reject")));
  const importsActive = imports.length > 0
    && importStatuses.some((status) => status.includes("pending") || status.includes("run") || status.includes("process"));
  const importsCompleted = imports.length > 0
    && !importsFailed
    && !importsActive
    && importStatuses.every((status) => status.includes("finish") || status.includes("complete") || status.includes("success"));
  return {
    statusId: requestFailure
      ? "Failed"
      : importsFailed
        ? "Failed"
        : importsActive
          ? "In progress"
          : importsCompleted
            ? "Completed"
            : message?.statusId || (importFailure ? "Failed" : successfulAudit ? "Completed" : undefined),
    systemMessageTypeId: message?.systemMessageTypeId || (successfulAudit || requestFailure || importFailure ? "ShopifyOrderSync" : undefined),
    systemMessageRemoteId: message?.systemMessageRemoteId,
    requestedAt: message?.initDate || requestFailure?.occurredAt,
    completedAt: message?.processedDate || message?.lastUpdatedStamp || successfulAudit?.processedAt || requestFailure?.occurredAt || importFailure?.occurredAt,
    totalRecordCount,
    failureCount: failedRecordCount !== undefined ? failedRecordCount : (requestFailure || importFailure ? 1 : successfulAudit ? 0 : undefined),
    requestFailedBeforeImport: !!requestFailure,
    requestFailureText: requestFailure?.errorText,
  };
});
const selectedMdmLogDetails = computed(() => {
  const imports = Object.values(orderSyncStore.importsBySystemMessageId || {}).flat();
  const imported = imports.find((entry) => entry.logId === selectedMdmLogId.value);
  const successfulAudits = (orderSyncStore.recentAudits || [])
    .filter((order) => order.logId === selectedMdmLogId.value);
  const failed = (orderSyncStore.recentErrors || [])
    .find((error) => error.logId === selectedMdmLogId.value);
  const latestAudit = successfulAudits
    .slice()
    .sort((first, second) => second.processedAtMillis - first.processedAtMillis)[0];
  return {
    statusId: imported?.statusId || (successfulAudits.length ? "DmlsFinished" : failed ? "DmlsFailed" : undefined),
    configId: imported?.configId || latestAudit?.configId || failed?.configId,
    systemMessageId: imported?.systemMessageId || latestAudit?.systemMessageId || failed?.systemMessageId,
    startedAt: imported?.createdDate,
    completedAt: imported?.finishDateTime || latestAudit?.processedAt || failed?.occurredAt,
    totalRecordCount: imported?.totalRecordCount ?? (successfulAudits.length || (failed ? 1 : undefined)),
    successRecordCount: imported?.successRecordCount ?? (successfulAudits.length || (failed ? 0 : undefined)),
    failedRecordCount: imported?.failedRecordCount ?? (successfulAudits.length ? 0 : failed ? 1 : undefined),
  };
});
const filteredOrders = computed(() => orderSyncStore.filteredRecentOrders(ordersQuery.value));
const filteredErrors = computed(() => orderSyncStore.filteredRecentErrors(errorsQuery.value));
const failedImportLogs = computed(() => {
  return orderSyncStore.failedDataManagerLogs || [];
});

watch([errorsQuery, () => orderSyncStore.recentErrors], () => {
  if (errorDownloadState.value === "loading") return;
  errorDownloadState.value = "idle";
  errorDownloadMessage.value = "";
});

const jobStateLabel = computed(() => {
  if (!orderSyncStore.job) return translate("Setup required");
  return orderSyncStore.job.paused ? translate("Paused") : translate("Active");
});
const jobStateColor = computed(() => !orderSyncStore.job ? "medium" : orderSyncStore.job.paused ? "warning" : "success");
const lastCompletedBatchLabel = computed(() => orderSyncStore.summary.lastCompletedAt
  ? formatDate(orderSyncStore.summary.lastCompletedAt)
  : translate("No completed batch recorded"));
const nextRunLabel = computed(() => {
  if (!orderSyncStore.job) return translate("Not configured");
  if (orderSyncStore.job.paused) return translate("Paused");
  return orderSyncStore.summary.nextRunTime ? formatDate(orderSyncStore.summary.nextRunTime) : translate("Not scheduled");
});
const batchRequestedLabel = computed(() => latestBatch.value?.initDate
  ? formatDate(latestBatch.value.initDate)
  : translate("Not requested yet"));
const runNowExplanation = computed(() => {
  if (orderSyncStore.canRunNow) {
    return translate("Queues the standard next batch window from the existing job configuration.");
  }
  return orderSyncStore.runNowDisabledReason;
});
const recentOrdersEmptyMessage = computed(() => {
  return translate("No order sync history records were found for this Shopify instance.");
});

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function formatDate(value: unknown): string {
  return formatDateTime(value) || translate("Not available");
}

function jobManagerLogUrl(logId: string): string {
  return `https://job-manager.hotwax.io/file-history/${encodeURIComponent(logId)}`;
}

function landmarkDateLabel(value: string): string {
  if (orderSyncStore.landmarkDates.status === "loading") return translate("Loading");
  if (!value) return translate("Not set");
  return formatDateTime(value) || value;
}

function progressRowTitle(id: OrderSyncProgressRow["id"]): string {
  return id === "batch-request"
    ? translate("Shopify order batch request")
    : translate("HotWax order import");
}

function progressStateLabel(state: OrderSyncProgressState): string {
  if (state === "completed") return translate("Completed");
  if (state === "partial") return translate("Partially completed");
  if (state === "failed") return translate("Failed");
  if (state === "active") return translate("In progress");
  return translate("Waiting");
}

function progressDetailLabel(row: OrderSyncProgressRow): string {
  if (row.id === "batch-request") {
    if (row.state === "completed") return translate("Request completed");
    if (row.state === "failed") return translate("Request failed");
    if (row.state === "active") return translate("Request in progress");
    return translate("Waiting for request");
  }
  if (row.state === "completed") {
    return row.successfulRecords === 1
      ? translate("Completed · {count} order", { count: row.successfulRecords })
      : translate("Completed · {count} orders", { count: row.successfulRecords });
  }
  if (row.state === "partial") {
    return translate("Partially completed · {processed} processed · {failed} failed", {
      processed: row.successfulRecords,
      failed: row.failedRecords,
    });
  }
  if (row.state === "failed" && row.failedRecords) {
    return row.failedRecords === 1
      ? translate("Failed · {count} record", { count: row.failedRecords })
      : translate("Failed · {count} records", { count: row.failedRecords });
  }
  return progressStateLabel(row.state);
}

function progressColor(state: OrderSyncProgressState): string {
  if (state === "completed") return "success";
  if (state === "partial") return "warning";
  if (state === "failed") return "danger";
  if (state === "active") return "primary";
  return "medium";
}

function normalizedStatus(status: unknown): string {
  return String(status || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function rawStatusLabel(status: unknown, failed = 0, successful = 0): string {
  const value = normalizedStatus(status);
  if (failed > 0 && successful > 0) return translate("Partially completed");
  if (failed > 0 || value.includes("error") || value.includes("fail") || value.includes("reject")) return translate("Failed");
  if (value.includes("complete") || value.includes("success") || value.includes("finish") || value.includes("sent") || value.includes("consumed") || value.includes("confirmed")) return translate("Completed");
  if (value.includes("running") || value.includes("active") || value.includes("processing") || value.includes("sending") || value.includes("produced")) return translate("In progress");
  if (value.includes("pause")) return translate("Paused");
  return status ? String(status) : translate("Not available");
}

function rawStatusColor(status: unknown, failed = 0, successful = 0): string {
  const label = rawStatusLabel(status, failed, successful);
  if (label === translate("Partially completed")) return "warning";
  if (label === translate("Failed")) return "danger";
  if (label === translate("Completed")) return "success";
  if (label === translate("In progress")) return "primary";
  if (label === translate("Paused")) return "warning";
  return "medium";
}

function importLabel(configId: string): string {
  return configId === "SYNC_SHOPIFY_ORDER"
    ? translate("New order import")
    : translate("Updated order import");
}

function historyObjectLabel(objectType: string, count: number): string {
  const labels: Record<string, [string, string]> = {
    Order: ["Order", "Orders"],
    OrderItem: ["Order item", "Order items"],
    Transaction: ["Transaction", "Transactions"],
    Refund: ["Refund", "Refunds"],
    Return: ["Return", "Returns"],
    Fulfillment: ["Fulfillment", "Fulfillments"],
    FulfillmentLocation: ["Fulfillment location", "Fulfillment locations"],
  };
  const [singular, plural] = labels[objectType] || [objectType, objectType];
  return `${translate(count === 1 ? singular : plural)} · ${count}`;
}

function openSystemMessageDetails(systemMessageId: unknown) {
  const id = String(systemMessageId || "").trim();
  if (!id) return;
  selectedSystemMessageId.value = id;
  showSystemMessageModal.value = true;
}

function openMdmLogDetails(logId: unknown) {
  const id = String(logId || "").trim();
  if (!id) return;
  const safeLogIds = new Set([
    ...Object.values(orderSyncStore.importsBySystemMessageId || {}).flat().map((entry) => entry.logId),
    ...(orderSyncStore.recentAudits || []).map((order) => order.logId),
    ...(orderSyncStore.recentErrors || []).map((error) => error.logId),
  ].filter(Boolean));
  if (!safeLogIds.has(id)) return;
  selectedMdmLogId.value = id;
  showMdmLogModal.value = true;
}

async function openCustomOrderRequest() {
  if (!orderSyncStore.capabilities.canRetryIndividualOrder) {
    actionError.value = translate("Administrator permission is required to download specific orders.");
    return;
  }
  if (!orderSyncStore.remote?.systemMessageRemoteId) {
    commonUtil.showToast(translate("Shopify order search is unavailable for this shop."));
    return;
  }

  const ordersModal = await modalController.create({
    component: ShopifyOrderSyncOrdersModal,
    showBackdrop: true,
    swipeToClose: true,
  });
  await ordersModal.present();
  const { data } = await ordersModal.onDidDismiss();
  const selectedIds = Array.isArray(data?.legacyResourceIds) ? data.legacyResourceIds : [];
  if (selectedIds.length) {
    const requestedShopId = props.id;
    actionMessage.value = "";
    actionError.value = "";
    try {
      const result = await orderSyncStore.requestSelectedOrders({ shopifyOrderIds: selectedIds, shopId: requestedShopId });
      if (props.id !== requestedShopId || orderSyncStore.selectedShopId !== requestedShopId) return;
      if (result.queued.length === 1 && result.failedOrderIds.length === 0) {
        actionMessage.value = translate("Shopify order {order} was queued as {id}.", {
          order: result.queued[0].shopifyOrderId,
          id: result.queued[0].systemMessageId,
        });
      } else {
        actionMessage.value = translate("Queued {queued} selected Shopify orders; {failed} could not be queued.", {
          queued: result.queued.length,
          failed: result.failedOrderIds.length,
        });
      }
      await polling.manualRefresh();
    } catch (error) {
      if (props.id !== requestedShopId || orderSyncStore.selectedShopId !== requestedShopId) return;
      actionError.value = errorMessage(error, translate("The selected Shopify orders could not be queued."));
    }
  }
}

const REPLAY_ORDER_LIMIT = 50;
const showReplayOrdersModal = ref(false);
const replayFromDate = ref("");
const replayThruDate = ref("");
const isReplayStarting = ref(false);
const replayDateRangeError = computed(() => {
  if (!replayFromDate.value || !replayThruDate.value || replayFromDate.value <= replayThruDate.value) return "";
  return translate("From date must be on or before Thru date.");
});

function openOrdersReplay() {
  if (!orderSyncStore.capabilities.canRetryIndividualOrder) {
    actionError.value = translate("Administrator permission is required to download specific orders.");
    return;
  }
  if (!orderSyncStore.remote?.systemMessageRemoteId) {
    commonUtil.showToast(translate("Shopify order search is unavailable for this shop."));
    return;
  }
  replayFromDate.value = "";
  replayThruDate.value = "";
  showReplayOrdersModal.value = true;
}

async function startOrdersReplay() {
  if (!replayFromDate.value || !replayThruDate.value) {
    commonUtil.showToast(translate("Please select both From and Thru dates."));
    return;
  }
  if (replayDateRangeError.value) {
    return;
  }
  const requestedShopId = props.id;
  isReplayStarting.value = true;
  actionMessage.value = "";
  actionError.value = "";
  try {
    const zone = orderSyncStore.runtimeTimeZone || "UTC";
    const fromDateTime = DateTime.fromISO(replayFromDate.value, { zone }).startOf("day").toUTC().toISO() || "";
    const thruDateTime = DateTime.fromISO(replayThruDate.value, { zone }).endOf("day").toUTC().toISO() || "";
    const search = await orderSyncStore.searchShopifyOrders({
      queryString: `updated_at:>=${fromDateTime} updated_at:<=${thruDateTime}`,
      pageSize: REPLAY_ORDER_LIMIT,
      shopId: requestedShopId,
    });
    if (props.id !== requestedShopId || orderSyncStore.selectedShopId !== requestedShopId) return;

    const shopifyOrderIds = [...new Set(
      search.orders.map((order) => String(order.legacyResourceId || "").trim()).filter(Boolean),
    )];
    if (!shopifyOrderIds.length) {
      actionMessage.value = translate("No Shopify orders were updated in the selected date range.");
      showReplayOrdersModal.value = false;
      return;
    }
    if (search.hasNextPage) {
      actionError.value = translate("More than {limit} orders were updated in the selected date range. Choose a narrower range or use Download specific orders.", { limit: REPLAY_ORDER_LIMIT });
      return;
    }

    const result = await orderSyncStore.requestSelectedOrders({ shopifyOrderIds, shopId: requestedShopId });
    if (props.id !== requestedShopId || orderSyncStore.selectedShopId !== requestedShopId) return;
    actionMessage.value = translate("Queued {queued} selected Shopify orders; {failed} could not be queued.", {
      queued: result.queued.length,
      failed: result.failedOrderIds.length,
    });
    showReplayOrdersModal.value = false;
    await polling.manualRefresh();
  } catch (error) {
    if (props.id !== requestedShopId || orderSyncStore.selectedShopId !== requestedShopId) return;
    actionError.value = errorMessage(error, translate("The selected Shopify orders could not be queued."));
  } finally {
    isReplayStarting.value = false;
  }
}

function openProgressDetails(row: OrderSyncProgressRow) {
  if (row.id === "batch-request" && latestBatch.value?.systemMessageId) {
    openSystemMessageDetails(latestBatch.value.systemMessageId);
    return;
  }
  if (row.id === "hotwax-import" && progressImports.value[0]?.logId) {
    openMdmLogDetails(progressImports.value[0].logId);
  }
}

function shopifyAdminOrderUrl(order: ShopifyOrderSyncRecentOrder): string {
  if (
    order.shopId !== props.id
    || orderSyncStore.shop?.shopId !== props.id
    || order.shopifyFetchVerified !== true
    || !/^(?!0+$)[0-9]{1,30}$/.test(order.shopifyOrderId)
  ) return "";

  const hostname = String(orderSyncStore.shop.myshopifyDomain || "").trim();
  if (
    hostname !== hostname.toLocaleLowerCase()
    || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.myshopify\.com$/.test(hostname)
  ) return "";
  return `https://${hostname}/admin/orders/${order.shopifyOrderId}`;
}

function retryState(errorId: string) {
  return orderSyncStore.retryByErrorId[errorId];
}

function retryError(errorId: string): string {
  return orderSyncStore.retryByErrorId[errorId]?.error || retryActionErrors.value[errorId] || "";
}

function errorNextStep(error: { errorText: string }): string {
  return translate(deriveOrderSyncErrorResolution(error).nextStep);
}

function errorNeedsSetupReview(error: { errorText: string }): boolean {
  return deriveOrderSyncErrorResolution(error).needsSetupReview;
}

interface ErrorLogDetailsState {
  status: "loading" | "ready" | "error";
  log?: Record<string, any>;
  records?: Record<string, any>[];
  error?: string;
}

const dataManagerLog = useDataManagerLog();
const errorLogDetailsByLogId = ref<Record<string, ErrorLogDetailsState>>({});

function errorLogDetails(error: ShopifyOrderSyncRecentError): ErrorLogDetailsState | undefined {
  return error.logId ? errorLogDetailsByLogId.value[error.logId] : undefined;
}

async function loadErrorRecordDetails(error: ShopifyOrderSyncRecentError) {
  const logId = error.logId;
  if (!logId) return;
  const current = errorLogDetailsByLogId.value[logId];
  if (current?.status === "loading" || current?.status === "ready") return;
  errorLogDetailsByLogId.value = { ...errorLogDetailsByLogId.value, [logId]: { status: "loading" } };
  try {
    const log = await dataManagerLog.fetchLogDetails(logId);
    if (!log) throw new Error("missing log");
    errorLogDetailsByLogId.value = {
      ...errorLogDetailsByLogId.value,
      [logId]: { status: "ready", log, records: [...(dataManagerLog.errorLogs.value || [])] },
    };
  } catch (_error) {
    errorLogDetailsByLogId.value = {
      ...errorLogDetailsByLogId.value,
      [logId]: { status: "error", error: translate("The failed records file could not be loaded.") },
    };
  }
}

function errorRecordDetails(error: ShopifyOrderSyncRecentError) {
  const details = errorLogDetails(error);
  if (details?.status !== "ready") return { record: null, message: "" };
  return extractOrderErrorRecordDetails(details.records || [], error);
}

function errorLogCreatedLabel(error: ShopifyOrderSyncRecentError): string {
  const loaded = errorLogDetails(error)?.log;
  const fromStore = Object.values(orderSyncStore.importsBySystemMessageId || {})
    .flat()
    .find((row: any) => row.logId === error.logId);
  const created = loaded?.createdDate || loaded?.createdStamp || fromStore?.createdDate;
  return created ? formatDate(created) : "";
}

function downloadErrorRecordJson(error: ShopifyOrderSyncRecentError) {
  const { record } = errorRecordDetails(error);
  if (!record) return;
  downloadTextFile(
    JSON.stringify(record, null, 2),
    `${error.shopifyOrderId || error.orderName || error.logId}-failed-record.json`,
  );
}

async function downloadErrorImportFile(error: ShopifyOrderSyncRecentError) {
  const log = errorLogDetails(error)?.log;
  const configId = log?.configId || error.configId;
  const contentId = log?.logContentId || log?.logFileContentId || log?.uploadFileContentId || log?.exportFileContentId;
  if (!configId || !contentId) return;
  try {
    const response = await dataManagerLog.downloadDataManagerFile(configId, contentId);
    const content = getDownloadFileContent(response?.data);
    if (!content) throw new Error("empty file");
    downloadTextFile(content, log?.fileName || log?.logFileName || `${error.logId}.json`);
    commonUtil.showToast(translate("File downloaded successfully"));
  } catch (_error) {
    commonUtil.showToast(translate("Failed to download the import file"));
  }
}

function shopifyAdminErrorOrderUrl(error: ShopifyOrderSyncRecentError): string {
  if (
    error.shopId !== props.id
    || orderSyncStore.shop?.shopId !== props.id
    || !/^(?!0+$)[0-9]{1,30}$/.test(error.shopifyOrderId)
  ) return "";

  const hostname = String(orderSyncStore.shop.myshopifyDomain || "").trim();
  if (
    hostname !== hostname.toLocaleLowerCase()
    || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.myshopify\.com$/.test(hostname)
  ) return "";
  return `https://${hostname}/admin/orders/${error.shopifyOrderId}`;
}

async function handleManualRefresh() {
  actionError.value = "";
  await polling.manualRefresh();
}

function downloadErrorsCsv() {
  if (!loadedShopMatchesRoute.value || !filteredErrors.value.length || errorDownloadState.value === "loading") return;
  const shopId = props.id;
  const rows = [...filteredErrors.value];
  errorDownloadState.value = "loading";
  errorDownloadMessage.value = translate("Preparing the safe error CSV.");
  if (props.id !== shopId || orderSyncStore.selectedShopId !== shopId) {
    errorDownloadState.value = "idle";
    errorDownloadMessage.value = "";
    return;
  }

  try {
    const csv = buildShopifyOrderSyncErrorCsv(rows);
    // This must stay in the original click task so Chromium retains the user's
    // download activation.
    downloadTextFile(csv, shopifyOrderSyncErrorCsvFileName(shopId));
    errorDownloadState.value = "success";
    errorDownloadMessage.value = translate("Safe error CSV download started.");
  } catch (_error) {
    errorDownloadState.value = "error";
    errorDownloadMessage.value = translate("The safe error CSV could not be downloaded.");
  }
}

function escapeAlertText(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function confirmRunNow() {
  if (!canRunForSelectedShop.value) return false;
  const routeShopId = props.id;
  const loadedShopId = orderSyncStore.shop?.shopId || "";
  const jobName = orderSyncStore.job?.jobName || "";
  if (loadedShopId !== routeShopId) return false;
  const confirmationShopName = shopName.value;
  const alert = await alertController.create({
    header: translate("Run Order Sync now?"),
    message: escapeAlertText(translate("Queue the standard next batch window for {shop}. The existing cursor, window, and job configuration will be used.", { shop: confirmationShopName })),
    buttons: [
      { text: translate("Cancel"), role: "cancel" },
      { text: translate("Run now"), role: "confirm" },
    ],
  });
  await alert.present();
  const result = await alert.onDidDismiss();
  if (
    result.role !== "confirm"
    || props.id !== routeShopId
    || orderSyncStore.selectedShopId !== routeShopId
    || orderSyncStore.shop?.shopId !== loadedShopId
    || orderSyncStore.job?.jobName !== jobName
    || !orderSyncStore.canRunNow
  ) return false;

  actionMessage.value = "";
  actionError.value = "";
  try {
    const queued = await orderSyncStore.runNow({ shopId: routeShopId });
    if (props.id !== routeShopId || orderSyncStore.selectedShopId !== routeShopId) return false;
    const correlation = queued.systemMessageId || queued.jobRunId;
    actionMessage.value = correlation
      ? translate("The standard next batch was queued as {id}.", { id: correlation })
      : translate("The standard next batch was queued.");
    await polling.manualRefresh();
    return true;
  } catch (error) {
    if (props.id !== routeShopId || orderSyncStore.selectedShopId !== routeShopId) return false;
    actionError.value = errorMessage(error, translate("Order Sync could not be queued."));
    return false;
  }
}

async function saveJobFromModal(input: { cronExpression: string; paused: boolean }) {
  const shopId = props.id;
  const currentJob = orderSyncStore.job;
  if (!shopId || !currentJob || orderSyncStore.selectedShopId !== shopId || currentJob.shopId !== shopId) {
    throw new Error("The loaded Order Sync job does not belong to the selected Shopify shop.");
  }
  if (input.cronExpression !== currentJob.cronExpression) {
    await orderSyncStore.updateSchedule(input.cronExpression, shopId);
  }
  if (input.paused !== orderSyncStore.job?.paused) {
    await orderSyncStore.updateJobStatus(input.paused, shopId);
  }
}

async function refreshAfterJobModalUpdate() {
  await polling.manualRefresh();
}

async function confirmRetry(error: ShopifyOrderSyncRecentError) {
  if (!loadedShopMatchesRoute.value || !error.retryable || !orderSyncStore.capabilities.canRetryIndividualOrder) return;
  const retryTarget = {
    errorId: error.id,
    shopId: props.id,
    shopifyOrderId: error.shopifyOrderId,
  };
  const loadedShopId = orderSyncStore.shop?.shopId || "";
  if (loadedShopId !== retryTarget.shopId || error.shopId !== retryTarget.shopId) return;
  const confirmationShopName = shopName.value;
  retryActionErrors.value = { ...retryActionErrors.value, [retryTarget.errorId]: "" };
  const alert = await alertController.create({
    header: translate("Retry individual order?"),
    message: escapeAlertText(translate("Re-fetch Shopify order {order} for {shop}, then run the normal create or update classification and HotWax import. The original error will remain unchanged.", {
      order: retryTarget.shopifyOrderId,
      shop: confirmationShopName,
    })),
    buttons: [
      { text: translate("Cancel"), role: "cancel" },
      { text: translate("Retry order"), role: "confirm" },
    ],
  });
  await alert.present();
  const result = await alert.onDidDismiss();
  const currentError = orderSyncStore.recentErrors.find((row) => row.id === retryTarget.errorId);
  if (
    result.role !== "confirm"
    || props.id !== retryTarget.shopId
    || orderSyncStore.selectedShopId !== retryTarget.shopId
    || orderSyncStore.shop?.shopId !== loadedShopId
    || !currentError
    || currentError.shopId !== retryTarget.shopId
    || currentError.shopifyOrderId !== retryTarget.shopifyOrderId
    || !currentError.retryable
    || !orderSyncStore.capabilities.canRetryIndividualOrder
  ) return;

  try {
    await orderSyncStore.retryIndividualOrder({
      errorId: retryTarget.errorId,
      shopifyOrderId: retryTarget.shopifyOrderId,
      shopId: retryTarget.shopId,
    });
    if (props.id !== retryTarget.shopId || orderSyncStore.selectedShopId !== retryTarget.shopId) return;
    // The store preserves retry state and the immutable source row while this refresh
    // makes the new standalone SystemMessage visible in monitoring.
    await polling.manualRefresh();
  } catch (retryFailure) {
    if (props.id !== retryTarget.shopId || orderSyncStore.selectedShopId !== retryTarget.shopId) return;
    retryActionErrors.value = {
      ...retryActionErrors.value,
      [retryTarget.errorId]: errorMessage(retryFailure, translate("The Shopify order could not be retried.")),
    };
  }
}
</script>

<style scoped>
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

.summary {
  grid-column: 1 / 2;
}

.progress {
  grid-column: -1 / -2;
}

.sync-monitor {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
  align-items: flex-start;
}

.sync-monitor > ion-item {
  grid-column: 1 / -1;
}

.sync-monitor ion-card {
  flex: 1 0 375px;
}

.stat-header {
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

.replay-actions {
  justify-content: flex-end;
  gap: 8px;
}

.replay-date-range { gap: 12px; }
.replay-date-range ion-input { flex: 1 1 180px; min-width: 0; }
.replay-date-range-help, .replay-date-range-error { display: block; margin: 0 16px 8px; }
.stat-data {
  display: flex;
  flex-wrap: nowrap;
  overflow-x: scroll;
  align-items: flex-start;
}

.stat-data ion-card {
  flex: 0 0 375px;
}

.progress-fact-button {
  --padding-start: 0;
  --padding-end: 0;
  height: auto;
  margin: 0;
  text-align: start;
  white-space: normal;
}

.history-object-heading {
  margin: 0 0 8px;
  font-weight: 600;
}

.history-object-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

@media screen and (max-width: 430px) {
  .sync-summary,
  .sync-monitor {
    grid-template-columns: minmax(0, 1fr);
  }

  .sync-monitor ion-card,
  .stat-title,
  .sync-stat ion-searchbar {
    flex-basis: auto;
    min-width: 0;
    width: 100%;
  }

  .replay-date-range { flex-wrap: wrap; }
  .replay-date-range ion-input { flex-basis: calc(50% - 6px); }
  .stat-data ion-card {
    flex-basis: min(100%, 375px);
    max-width: 100%;
  }
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
