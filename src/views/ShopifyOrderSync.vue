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
          <section class="sync-summary" :aria-label="translate('Loading Order Sync monitoring')">
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
                <ion-item v-for="row in (card === 1 ? 4 : 3)" :key="row">
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
          <ion-card v-if="!orderSync.job" class="state-card">
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
                  {{ shopName }}
                </ion-card-subtitle>
                <ion-buttons>
                  <ion-button
                    fill="clear"
                    :disabled="!canRunForSelectedShop || orderSync.activeMutation === 'run-now'"
                    @click="confirmRunNow"
                  >
                    <ion-spinner v-if="orderSync.activeMutation === 'run-now'" slot="start" name="crescent" />
                    <ion-icon v-else slot="start" :icon="flashOutline" />
                    {{ translate("Run now") }}
                  </ion-button>
                </ion-buttons>
              </ion-card-header>

              <ion-list lines="full">
                <ion-item>
                  <ion-label class="ion-text-wrap">{{ translate("Orders imported in the last hour") }}</ion-label>
                  <ion-label slot="end" class="ion-text-end">{{ arrivals?.count ?? unavailable }}</ion-label>
                </ion-item>
                <ion-item :href="latestOrderHref || undefined" :detail="!!latestOrderHref" target="_blank" rel="noopener noreferrer">
                  <ion-label>{{ translate("Last order imported") }}
                    <p v-if="arrivals?.latest">{{ arrivals.latest.orderName || arrivals.latest.shopifyOrderId }}</p>
                  </ion-label>
                  <ion-label slot="end" class="ion-text-end">{{ latestArrivalLabel }}</ion-label>
                </ion-item>
                <ion-item>
                  <ion-label>{{ translate("Median sync delay") }}<p>{{ translate("Orders imported in the last hour") }}</p></ion-label>
                  <ion-label slot="end" class="ion-text-end ion-text-wrap">{{ medianLabel }}</ion-label>
                </ion-item>
                <ion-item lines="none">
                  <ion-label>{{ translate("Next scheduled sync") }}</ion-label>
                  <ion-label slot="end" class="ion-text-end">{{ nextRunLabel }}
                    <p v-if="nextRun">{{ relativeTime(nextRun) }}</p>
                  </ion-label>
                </ion-item>
              </ion-list>

              <ion-card-content v-if="(!canRunNow && runNowDisabledReason) || actionMessage || actionError" class="action-feedback">
                <p v-if="!canRunNow && runNowDisabledReason">{{ runNowDisabledReason }}</p>
                <p v-if="actionMessage" role="status">{{ actionMessage }}</p>
                <p v-if="actionError" class="ion-text-danger" role="alert">{{ actionError }}</p>
                <p v-if="orderSync.lastRunResult?.systemMessageId">
                  {{ translate("Queued SystemMessage") }}:
                  <ion-button fill="clear" size="small" @click="openSystemMessageDetails(orderSync.lastRunResult.systemMessageId)">
                    {{ orderSync.lastRunResult.systemMessageId }}
                  </ion-button>
                </p>
              </ion-card-content>
            </ion-card>

            <ion-card class="progress">
              <ion-card-header>
                <ion-card-title>{{ translate("Latest run") }}</ion-card-title>
                <ion-buttons>
                  <ion-button
                    fill="clear"
                    :router-link="`${connectionDetailsHref}/order-sync/history`"
                    :aria-label="translate('Batch history')"
                  >
                    {{ translate("Batch history") }}
                  </ion-button>
                </ion-buttons>
              </ion-card-header>

              <ion-list lines="full">
                <ion-item :button="!!latestBatch" :detail="!!latestBatch" @click="openSystemMessageDetails(latestBatch?.systemMessageId)">
                  <ion-label class="ion-text-wrap">
                    {{ translate("Fetch Shopify orders") }}
                    <p v-if="latestBatch?.initDate">{{ translate("Queued at {time}", { time: formatDate(latestBatch.initDate) }) }}</p>
                  </ion-label>
                  <ion-label slot="end" class="ion-text-end" :color="progressColor(summary.batchStatus)">
                    {{ latestBatch ? progressStateLabel(summary.batchStatus) : translate("Awaiting first run") }}
                  </ion-label>
                </ion-item>
                <ion-item>
                  <ion-label>{{ translate("Import into OMS") }}</ion-label>
                  <ion-label slot="end" class="ion-text-end ion-text-wrap">{{ importStepLabel }}</ion-label>
                </ion-item>
                <template v-for="group in (latestBatch && runLogs && !runReadFailed && orderSync.importConfigsAvailable ? importGroups : [])" :key="group.label">
                  <ion-item :button="group.logs.length === 1" :detail="group.logs.length === 1" @click="group.logs.length === 1 && openMdmLogDetails(group.logs[0].logId)">
                    <ion-label class="ion-padding-start">{{ group.label }}</ion-label>
                    <ion-label slot="end" class="ion-text-end ion-text-wrap">{{ group.logs.length ? importCountsLabel(group.logs) : emptyImportLabel(summary.batchStatus) }}</ion-label>
                  </ion-item>
                  <template v-if="group.logs.length > 1">
                    <ion-item v-for="log in group.logs" :key="log.logId" button detail @click="openMdmLogDetails(log.logId)">
                      <ion-label>{{ translate("Import log") }} {{ log.logId }}</ion-label>
                      <ion-label slot="end" class="ion-text-end">{{ progressStateLabel(orderImportState(log)) }}</ion-label>
                    </ion-item>
                  </template>
                </template>
              </ion-list>
            </ion-card>
          </section>

          <ion-card v-if="failedImportLogs.length">
            <ion-card-header>
              <ion-card-title>{{ translate("Failed imports") }} ({{ failedImportLogs.length }})</ion-card-title>
              <ion-card-subtitle>{{ translate("Across the latest {count} batches", { count: SHOPIFY_ORDER_SYNC_RESULT_LIMIT }) }}</ion-card-subtitle>
            </ion-card-header>
            <ion-list>
              <ion-item v-for="log in failedImportLogs" :key="log.logId" button detail @click="openMdmLogDetails(log.logId)">
                <ion-label>{{ importLabel(log.configId) }} · {{ log.logId }}
                  <p>{{ translate("Batch") }} {{ log.systemMessageId }} · {{ formatDate(log.finishDateTime || log.createdDate) }}</p>
                </ion-label>
                <ion-note slot="end">{{ importCountsLabel([log]) }}</ion-note>
              </ion-item>
            </ion-list>
          </ion-card>

          <section class="sync-monitor" :aria-label="translate('Order sync jobs')">
            <ion-card>
              <ion-card-header>
                <ion-card-title>{{ translate("Order sync jobs") }}</ion-card-title>
                <ion-card-subtitle>{{ translate("Review the job that queues scheduled Shopify order requests") }}</ion-card-subtitle>
              </ion-card-header>
              <ion-list>
                <ion-item button detail :disabled="!orderSync.job" @click="showJobDetailsModal = true">
                  <ion-label>
                    {{ translate("Queue order requests") }}
                    <p>{{ formatDate(orderSync.job?.lastRunTime) }}</p>
                  </ion-label>
                  <ion-badge slot="end" :color="jobStateColor">{{ jobStateLabel }}</ion-badge>
                </ion-item>
                <ion-item button detail :router-link="configurationHref">
                  <ion-label>
                    {{ translate("Schedule") }}
                    <p>{{ orderSync.job?.cronExpression || translate("Not scheduled") }}</p>
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
                <ion-item
                  v-for="landmark in landmarkDateRows"
                  :key="landmark.key"
                  :lines="landmark.last ? 'none' : 'full'"
                >
                  <ion-label class="ion-text-wrap">
                    {{ landmark.title }}
                    <p>{{ landmark.description }}</p>
                    <ion-badge v-if="!landmark.value && orderSync.landmarkDates.status === 'ready'" color="warning">
                      {{ translate("Setup required") }}
                    </ion-badge>
                  </ion-label>
                  <ion-label v-if="landmark.value || !capabilities.canConfigure" slot="end">
                    {{ landmarkDateLabel(landmark.value) }}
                  </ion-label>
                  <ion-button
                    v-if="capabilities.canConfigure"
                    slot="end"
                    fill="clear"
                    @click="openLandmarkDateModal(landmark.key)"
                  >
                    {{ landmark.value ? translate("Edit") : translate("Set date") }}
                  </ion-button>
                </ion-item>
                <ion-item v-if="orderSync.landmarkDates.status === 'error'" lines="none">
                  <ion-label class="ion-text-wrap ion-text-danger" role="status">
                    <p>{{ translate("Landmark dates could not be loaded.") }}</p>
                  </ion-label>
                </ion-item>
              </ion-list>
            </ion-card>

            <ShopifyOrderSyncCustomRequestCard :disabled="!!orderSync.activeMutation || !capabilities.canRetryIndividualOrder || !loadedShopMatchesRoute" @open-search="openCustomOrderRequest" @open-replay="openOrdersReplay" />
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
                  {{ translate("Recent order sync history") }}
                  <p>{{ orderSync.historySource === "orders" ? translate("Shopify matches among the latest 100 OMS sales orders for this product store") : translate("Latest order sync records for this shop") }}</p>
                </ion-label>
                <ion-badge v-if="!orderSync.historyError" slot="end" color="medium">{{ orderSync.recentOrders.length }}</ion-badge>
              </ion-item>
              <ion-searchbar
                :value="ordersQuery"
                :disabled="!orderSync.recentOrders.length"
                :placeholder="translate('Search by order name, Shopify ID, or OMS ID')"
                :aria-label="translate('Search order sync history')"
                @ionInput="ordersQuery = String($event.detail.value || '')"
              />
            </div>
            <ion-item v-if="orderSync.historyError" role="status">
              <ion-label>{{ translate("Order history is unavailable.") }}
                <p v-if="orderSync.recentOrders.length">{{ translate("Showing the last loaded orders.") }}</p>
              </ion-label>
              <ion-button slot="end" :disabled="orderSync.historyLoading" @click="orderSync.loadHistory(id)">{{ translate("Retry") }}</ion-button>
            </ion-item>
            <div class="stat-data" role="list">
              <transition-group name="list" tag="div" class="list-transition-group">
                <ion-card v-for="order in filteredOrders" :key="order.orderId || order.shopifyOrderId" role="listitem">
                  <ion-list lines="full">
                    <ion-item>
                      <ion-label class="ion-text-wrap">
                        {{ order.orderName || order.shopifyOrderId }}
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
                    <ion-item>
                      <ion-label>{{ translate("Shopify order ID") }}</ion-label>
                      <ion-label slot="end" class="ion-text-end ion-text-wrap">{{ order.shopifyOrderId }}</ion-label>
                    </ion-item>
                    <ion-item v-if="order.orderId">
                      <ion-label>{{ translate("OMS order ID") }}</ion-label>
                      <ion-label slot="end" class="ion-text-end ion-text-wrap">{{ order.orderId }}</ion-label>
                    </ion-item>
                    <ion-item>
                      <ion-label>{{ translate("Order placed") }}</ion-label>
                      <ion-label slot="end" class="ion-text-end ion-text-wrap">{{ formatOrderTimestamp(order.orderDate) }}</ion-label>
                    </ion-item>
                    <ion-item>
                      <ion-label>{{ translate("Imported into OMS") }}</ion-label>
                      <ion-label slot="end" class="ion-text-end ion-text-wrap">{{ formatOrderTimestamp(order.importedAt) }}</ion-label>
                    </ion-item>
                    <ion-item>
                      <ion-label>{{ translate("Time to import") }}</ion-label>
                      <ion-label slot="end" class="ion-text-end ion-text-wrap">{{ importDelay(order) }}</ion-label>
                    </ion-item>
                    <ion-item v-if="order.historyUpdatedAt">
                      <ion-label>{{ translate("History updated") }}</ion-label>
                      <ion-label slot="end" class="ion-text-end ion-text-wrap">{{ formatDate(order.historyUpdatedAt) }}</ion-label>
                    </ion-item>
                  </ion-list>
                </ion-card>
              </transition-group>
              <ion-card v-if="!filteredOrders.length && !orderSync.historyError">
                <ion-item lines="none">
                  <ion-label class="ion-text-center">
                    <p v-if="ordersQuery">{{ translate("No loaded orders match this search.") }}</p>
                    <p v-else>{{ translate("No matching orders in the loaded history.") }}</p>
                  </ion-label>
                </ion-item>
              </ion-card>
            </div>
          </section>

        </template>
      </main>
    </ion-content>

    <ion-modal :is-open="showLandmarkDateModal" :backdrop-dismiss="false" @didDismiss="showLandmarkDateModal = false">
      <ion-header>
        <ion-toolbar>
          <ion-buttons slot="start">
            <ion-button :aria-label="translate('Close')" @click="showLandmarkDateModal = false">
              <ion-icon slot="icon-only" :icon="closeOutline" />
            </ion-button>
          </ion-buttons>
          <ion-title>{{ activeLandmark?.title }}</ion-title>
        </ion-toolbar>
      </ion-header>
      <ion-content>
        <ion-list lines="full">
          <ion-item lines="none">
            <ion-label class="ion-text-wrap">
              <p>{{ activeLandmark?.description }}</p>
            </ion-label>
          </ion-item>
          <ion-item>
            <ion-label>{{ translate("Date") }}</ion-label>
            <ion-datetime-button slot="end" datetime="landmark-datetime" />
            <ion-popover :keep-contents-on-did-dismiss="true">
              <ion-datetime id="landmark-datetime" presentation="date-time" v-model="landmarkDateValue" />
            </ion-popover>
          </ion-item>
          <ion-item v-if="landmarkSuggestionLoading" lines="none">
            <ion-spinner slot="start" name="crescent" />
            <ion-label class="ion-text-wrap"><p>{{ translate("Finding the oldest order date…") }}</p></ion-label>
          </ion-item>
          <ion-item v-else-if="landmarkSuggestedDate" lines="none">
            <ion-label class="ion-text-wrap">
              <p>{{ translate("Suggested from the oldest order in the system") }}: {{ landmarkDateLabel(landmarkSuggestedDate) }}</p>
            </ion-label>
            <ion-button slot="end" fill="clear" @click="landmarkDateValue = landmarkSuggestedDate">
              {{ translate("Use suggestion") }}
            </ion-button>
          </ion-item>
          <ion-item v-if="landmarkSaveError" lines="none">
            <ion-label class="ion-text-wrap ion-text-danger" role="alert"><p>{{ landmarkSaveError }}</p></ion-label>
          </ion-item>
        </ion-list>
      </ion-content>
      <ion-footer>
        <ion-toolbar>
          <ion-buttons slot="start">
            <ion-button fill="clear" :disabled="isLandmarkSaving" @click="showLandmarkDateModal = false">{{ translate("Cancel") }}</ion-button>
          </ion-buttons>
          <ion-buttons slot="end">
            <ion-button fill="solid" color="primary" :disabled="isLandmarkSaving || !landmarkDateValue" @click="saveLandmarkDate">
              <ion-spinner v-if="isLandmarkSaving" name="crescent" />
              <span v-else>{{ translate("Save date") }}</span>
            </ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-footer>
    </ion-modal>

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
          <ion-item>
            <ion-label class="ion-text-wrap">{{ shopName }}
              <p>{{ translate("Import orders updated from midnight on the chosen date through the start of this replay ({zone}). Keep this page open until it finishes.", { zone: replayZone }) }}</p>
            </ion-label>
          </ion-item>
          <ion-item>
            <ion-input type="date" :label="translate('Updated since')" :max="replayToday" v-model="replayFromDate" />
          </ion-item>
          <ion-item lines="none" class="replay-actions">
            <ion-button fill="clear" :disabled="orderSync.activeMutation === 'replay-orders'" @click="showReplayOrdersModal = false">{{ translate("Cancel") }}</ion-button>
            <ion-button fill="solid" color="primary" :disabled="!replayFromDate || replayFromDate > replayToday || !!orderSync.activeMutation" @click="startOrdersReplay">
              <ion-spinner v-if="orderSync.activeMutation === 'replay-orders'" name="crescent" />
              <span v-else>{{ translate("Start replay") }}</span>
            </ion-button>
          </ion-item>
        </ion-list>
      </ion-content>
    </ion-modal>

    <ion-modal :is-open="showCustomOrderRequestModal" @didDismiss="showCustomOrderRequestModal = false">
      <ion-header>
        <ion-toolbar>
          <ion-buttons slot="start">
            <ion-button :aria-label="translate('Close')" @click="showCustomOrderRequestModal = false">
              <ion-icon slot="icon-only" :icon="closeOutline" />
            </ion-button>
          </ion-buttons>
          <ion-title>{{ translate("Select orders") }}</ion-title>
          <ion-buttons slot="end" v-if="isLoading">
            <ion-spinner name="crescent" />
          </ion-buttons>
        </ion-toolbar>
        <ion-toolbar>
          <ion-searchbar
            v-model="queryString"
            :placeholder="translate('Search order name or Shopify ID')"
            @keyup.enter="searchOrders()"
            @ionInput="handleInput"
          />
        </ion-toolbar>
      </ion-header>

      <ion-content>
        <ion-list v-if="orders.length" lines="full">
          <ion-list-header v-if="!queryString.trim()">
            <ion-label>{{ translate("Recently created orders from Shopify") }}</ion-label>
          </ion-list-header>
          <ion-item>
            <ion-checkbox justify="space-between" :checked="allSelected" @ion-change="toggleAll">
              <ion-label>
                {{ translate("Select all") }}
                <p>{{ selectedOrders.length }} {{ translate("selected") }}</p>
              </ion-label>
            </ion-checkbox>
          </ion-item>
          <ion-item v-for="order in orders" :key="order.legacyResourceId">
            <ion-checkbox justify="space-between" :checked="isSelected(order.legacyResourceId)" @ion-change="toggleOrder(order)">
              <ion-label>
                {{ order.name }}
                <p>{{ translate("Shopify ID") }}: {{ order.legacyResourceId }}</p>
                <p>{{ order.customerName || translate("No customer") }}, {{ order.displayFinancialStatus || translate("Status unavailable") }}</p>
                <p>{{ formatOrderDate(order.createdAt) }}</p>
              </ion-label>
              <ion-note>{{ order.totalAmount || translate("No total") }} {{ order.currencyCode || "" }}</ion-note>
            </ion-checkbox>
          </ion-item>
        </ion-list>
        <ion-list v-else-if="isLoading" lines="none"><ion-item><ion-spinner name="crescent" /></ion-item></ion-list>
        <ion-list v-else-if="queryString" lines="none"><ion-item><ion-label>{{ translate("No orders found") }}</ion-label></ion-item></ion-list>
        <ion-list v-else lines="none"><ion-item><ion-label>{{ translate("No recent Shopify orders found") }}</ion-label></ion-item></ion-list>
        <ion-infinite-scroll v-if="hasNextPage" @ionInfinite="loadMore">
          <ion-infinite-scroll-content loading-spinner="crescent" :loading-text="translate('Loading')" />
        </ion-infinite-scroll>
      </ion-content>

      <ion-footer>
        <ion-toolbar>
          <ion-buttons slot="start"><ion-button fill="clear" :disabled="!selectedOrders.length" @click="selectedOrdersById = {}">{{ translate("Clear") }}</ion-button></ion-buttons>
          <ion-buttons slot="end"><ion-button fill="solid" color="primary" :disabled="!selectedOrders.length || !!orderSync.activeMutation" @click="submit">{{ translate("Download selected orders") }} ({{ selectedOrders.length }})</ion-button></ion-buttons>
        </ion-toolbar>
      </ion-footer>
    </ion-modal>

    <ServiceJobDetailsModal
      :is-open="showJobDetailsModal"
      :job-name="orderSync.job?.jobName || ''"
      :allowed-parameter-names="['shopId', 'systemMessageRemoteId', 'systemMessageTypeId', 'runAsBatch']"
      :parameter-description="translate('Job and service parameters used by this Order Sync job.')"
      :can-run-now="canRunForSelectedShop"
      :can-edit="canEditJobFromModal"
      :run-now-disabled-reason="runNowDisabledReason"
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
  IonCheckbox,
  IonContent,
  IonDatetime,
  IonDatetimeButton,
  IonFooter,
  IonHeader,
  IonIcon,
  IonInfiniteScroll,
  IonInfiniteScrollContent,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonModal,
  IonNote,
  IonPage,
  IonPopover,
  IonProgressBar,
  IonSearchbar,
  IonSkeletonText,
  IonSpinner,
  IonTitle,
  IonToolbar,
  alertController,
} from "@ionic/vue";
import {
  canRunOrderSyncNow,
  filterRecentOrders,
  isOrderSyncBatchActive,
  ORDER_SYNC_FEATURE,
  getSyncCapabilities,
  getNextSyncRun,
  fetchOrderRunImports,
  deriveSyncProgress,
  orderSyncRunNowDisabledReason,
  orderSyncSummary,
  useShopifyOrderSyncPolling,
  useShopifyOrderSync,
  SHOPIFY_ORDER_SYNC_RESULT_LIMIT,
  type ShopifyOrderSyncImport,
  type ShopifyOrderSyncRecentOrder,
  type ShopifyOrderSyncSearchResult,
} from "@/composables/useShopify";
import { commonUtil, logger, translate } from "@common";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { DateTime } from "luxon";
import { closeOutline, flashOutline, openOutline, refreshOutline } from "ionicons/icons";
import { formatDateTime, parseDateTimeValue } from "@/utils";
import { formatSyncDuration } from "@/utils/shopifyTransferSyncPresentation";
import { importCountsLabel, orderImportGroups, emptyImportLabel, orderImportState, progressColor, progressStateLabel, sumReported } from "@/utils/orderImportDisplay";
import { useOrderArrivalMetrics } from "@/composables/useOrderArrivalMetrics";
import { useUserStore } from "@/store/user";
import ServiceJobDetailsModal from "@/components/common/ServiceJobDetailsModal.vue";
import SystemMessageDetailsModal from "@/components/common/SystemMessageDetailsModal.vue";
import ShopifyOrderSyncMdmLogModal from "@/components/shopify-order-sync/ShopifyOrderSyncMdmLogModal.vue";
import ShopifyOrderSyncCustomRequestCard from "@/components/shopify-order-sync/ShopifyOrderSyncCustomRequestCard.vue";










const props = defineProps<{ id: string }>();
const orderSync = useShopifyOrderSync();
const userStore = useUserStore();

// View-model derivations computed locally from the store's RAW entity state.
const summary = computed(() => orderSyncSummary(
  orderSync.batches,
  orderSync.importsBySystemMessageId,
  orderSync.job,
  orderSync.productStore,
));
const capabilities = computed(() => getSyncCapabilities({ hasPermission: (permissionId: string) => userStore.hasPermission(permissionId) }, ORDER_SYNC_FEATURE));
const canRunNow = computed(() => canRunOrderSyncNow(orderSync.job, orderSync.batches));
const runNowDisabledReason = computed(() => orderSyncRunNowDisabledReason(capabilities.value, orderSync.job, summary.value));
const isBatchActive = computed(() => isOrderSyncBatchActive(summary.value));

const ordersQuery = ref("");
const pollingError = ref("");
const actionMessage = ref("");
const actionError = ref("");
const showJobDetailsModal = ref(false);
const showSystemMessageModal = ref(false);
const showMdmLogModal = ref(false);
const selectedSystemMessageId = ref("");
const selectedMdmLogId = ref("");

async function refreshStore() {
  const shopId = props.id;
  try {
    await orderSync.loadMonitoring(shopId);
    if (props.id === shopId && orderSync.selectedShopId === shopId) pollingError.value = "";
  } catch (error) {
    if (props.id !== shopId || orderSync.selectedShopId !== shopId) return;
    pollingError.value = errorMessage(error, translate("Order Sync monitoring could not be refreshed."));
    throw error;
  }
}

const polling = useShopifyOrderSyncPolling({
  batchActive: () => isBatchActive.value,
  remoteIds: () => orderSync.remoteIds,
  refresh: refreshStore,
  onError: (error) => {
    pollingError.value = errorMessage(error, translate("Order Sync monitoring could not be refreshed."));
  },
});

watch(() => props.id, (nextId, previousId) => {
  if (!nextId || nextId === previousId) return;
  const refreshWasInFlight = polling.isRefreshing.value;
  ordersQuery.value = "";
  pollingError.value = "";
  actionMessage.value = "";
  actionError.value = "";
  orderSync.resetForShop(nextId);

  if (!polling.isPageActive.value) return;
  const routeRefresh = polling.manualRefresh();
  if (refreshWasInFlight) {
    void routeRefresh.then(() => {
      if (
        polling.isPageActive.value
        && props.id === nextId
        && orderSync.selectedShopId === nextId
        && !orderSync.monitoringLoadedAt
      ) {
        void polling.manualRefresh();
      }
    });
  }
}, { immediate: true, flush: "sync" });

const connectionDetailsHref = computed(() => `/shopify-connection-details/${encodeURIComponent(props.id)}`);
const configurationHref = computed(() => `${connectionDetailsHref.value}/order-sync/configure`);
const hasLoadedMonitoring = computed(() => Boolean(orderSync.monitoringLoadedAt));
const isInitialLoading = computed(() => (!hasLoadedMonitoring.value || !orderSync.hydrated) && !orderSync.monitoringError && !pollingError.value);
const isRefreshing = computed(() => orderSync.monitoringRefreshing || polling.isRefreshing.value);
const fatalLoadError = computed(() => hasLoadedMonitoring.value ? "" : (orderSync.monitoringError || pollingError.value));
const staleRefreshError = computed(() => hasLoadedMonitoring.value ? (orderSync.monitoringError || pollingError.value) : "");
const selectedShopMatchesRoute = computed(() => Boolean(props.id) && orderSync.selectedShopId === props.id);
const loadedShopMatchesRoute = computed(() => selectedShopMatchesRoute.value && orderSync.shop?.shopId === props.id);
const canRunForSelectedShop = computed(() => loadedShopMatchesRoute.value && capabilities.value.canRunNow && canRunNow.value && !orderSync.activeMutation);
const canEditJobFromModal = computed(() => loadedShopMatchesRoute.value
  && capabilities.value.canEditSchedule
  && capabilities.value.canActivate
  && !orderSync.activeMutation);
const editJobDisabledReason = computed(() => canEditJobFromModal.value
  ? ""
  : translate("COMMON_ADMIN permission is required to edit Order Sync."));
const shopName = computed(() => orderSync.shop?.name || translate("Shopify instance {id}", { id: props.id }));
const latestBatch = computed(() => summary.value.latestBatch);
const { metrics, failed: metricsFailed, now, refresh: refreshMetrics } = useOrderArrivalMetrics(
  () => props.id,
  () => loadedShopMatchesRoute.value ? orderSync.shop?.productStoreId || "" : "",
  polling.isPageActive,
  () => orderSync.latestImportChange,
);
const arrivals = computed(() => metricsFailed.value ? undefined : metrics.value);
const unavailable = computed(() => metricsFailed.value || !orderSync.shop?.productStoreId ? translate("Not available") : translate("Loading"));
const latestOrderHref = computed(() => arrivals.value?.latest ? shopifyAdminOrderUrl(arrivals.value.latest) : "");
function relativeTime(value: Date | string) {
  const date = parseDateTimeValue(value);
  return date?.toRelative({ base: DateTime.fromMillis(now.value) }) || translate("Not available");
}
const latestArrivalLabel = computed(() => arrivals.value?.latest ? relativeTime(arrivals.value.latest.entryDate)
  : arrivals.value ? translate("No imports recorded") : unavailable.value);
const medianLabel = computed(() => {
  if (!arrivals.value) return unavailable.value;
  if (!arrivals.value.count) return translate("No imports in the last hour");
  const ms = arrivals.value.medianMs;
  return ms == null ? translate("Not available") : formatDelay(ms);
});
const runLogs = ref<{ id: string; logs: ShopifyOrderSyncImport[] }>();
const runReadFailed = ref(false);
watch([() => polling.isPageActive.value && latestBatch.value?.systemMessageId, () => latestBatch.value?.statusId, () => orderSync.latestImportChange, () => orderSync.monitoringLoadedAt],
  async ([id], _, onCleanup) => {
    if (id !== runLogs.value?.id) runLogs.value = undefined;
    if (!id) return;
    let current = true;
    onCleanup(() => { current = false; });
    runReadFailed.value = false;
    try {
      const logs = await fetchOrderRunImports(id);
      if (current) runLogs.value = { id, logs };
    } catch {
      if (current) runReadFailed.value = true;
    }
  }, { immediate: true });
const progressImports = computed(() => runLogs.value?.id === latestBatch.value?.systemMessageId ? runLogs.value?.logs || [] : []);
const visibleLogs = computed(() => [...progressImports.value, ...Object.values(orderSync.importsBySystemMessageId).flat()]);
const selectedSystemMessageDetails = computed(() => {
  const message = (orderSync.systemMessages || [])
    .find((row) => row.systemMessageId === selectedSystemMessageId.value);
  const imports = runLogs.value?.id === selectedSystemMessageId.value ? progressImports.value : orderSync.importsBySystemMessageId[selectedSystemMessageId.value] || [];
  return {
    statusId: message?.statusId,
    systemMessageTypeId: message?.systemMessageTypeId,
    systemMessageRemoteId: message?.systemMessageRemoteId,
    requestedAt: message?.initDate,
    completedAt: message?.processedDate,
    totalRecordCount: sumReported(imports, "totalRecordCount"),
    failureCount: sumReported(imports, "failedRecordCount"),
  };
});
const selectedMdmLogDetails = computed(() => {
  const log = visibleLogs.value.find(entry => entry.logId === selectedMdmLogId.value);
  return { ...log, startedAt: log?.startDateTime, completedAt: log?.finishDateTime };
});
const importGroups = computed(() => orderImportGroups(progressImports.value, orderSync.importConfigIds));
const importStepLabel = computed(() => {
  if ((!orderSync.importConfigsAvailable || runReadFailed.value) && latestBatch.value) return translate("Import status unavailable");
  if (latestBatch.value && !runLogs.value) return translate("Loading");
  const [batch, imports] = deriveSyncProgress(latestBatch.value, progressImports.value);
  return progressImports.value.length ? progressStateLabel(imports.state) : emptyImportLabel(batch.state);
});
const filteredOrders = computed(() => filterRecentOrders(orderSync.recentOrders, ordersQuery.value));
const failedImportLogs = computed(() => orderSync.failedDataManagerLogs);

const jobStateLabel = computed(() => {
  if (!orderSync.job) return translate("Setup required");
  return orderSync.isPaused ? translate("Paused") : translate("Active");
});
const jobStateColor = computed(() => !orderSync.job ? "medium" : orderSync.isPaused ? "warning" : "success");
const nextRun = computed(() => orderSync.job && !orderSync.isPaused
  ? getNextSyncRun(orderSync.job.cronExpression, {
    currentDate: new Date(now.value), timeZone: orderSync.productStore?.defaultTimeZone || orderSync.productStore?.timeZone,
  }) : null);
const nextRunLabel = computed(() => {
  if (!orderSync.job) return translate("Not configured");
  if (orderSync.isPaused) return translate("Paused");
  return nextRun.value ? formatDateTime(nextRun.value, "h:mm a ZZZZ") : translate("Not scheduled");
});
function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function formatOrderTimestamp(value?: string) {
  return formatDateTime(value, "LLL d, yyyy, h:mm:ss a ZZZZ") || translate("Not available");
}

function importDelay(order: ShopifyOrderSyncRecentOrder) {
  const placed = parseDateTimeValue(order.orderDate);
  const imported = parseDateTimeValue(order.importedAt);
  if (!placed || !imported) return translate("Not available");
  return formatDelay(imported.toMillis() - placed.toMillis());
}

function formatDelay(ms: number) {
  return (ms < 0 ? "−" : "") + formatSyncDuration(Math.abs(ms));
}

function formatDate(value: unknown): string {
  return formatDateTime(value) || translate("Not available");
}


function landmarkDateLabel(value: string): string {
  if (orderSync.landmarkDates.status === "loading") return translate("Loading");
  if (!value) return translate("Not set");
  return formatDateTime(value) || value;
}

/** `configId` is optional on a cached import row, so the label must accept its absence. */
function importLabel(configId: string | undefined): string {
  return configId === orderSync.importConfigIds[0]
    ? translate("New order import")
    : translate("Updated order import");
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
  if (!visibleLogs.value.some(log => log.logId === id)) return;
  selectedMdmLogId.value = id;
  showMdmLogModal.value = true;
}

const showCustomOrderRequestModal = ref(false);
const queryString = ref("");
const orders = ref<ShopifyOrderSyncSearchResult[]>([]);
const selectedOrdersById = ref<Record<string, ShopifyOrderSyncSearchResult>>({});
const isLoading = ref(false);
const hasNextPage = ref(false);
const endCursor = ref("");
let debounceTimer: number | undefined;
let requestId = 0;

const selectedOrders = computed(() => Object.values(selectedOrdersById.value));
const allSelected = computed(() => orders.value.length > 0 && orders.value.every((order) => selectedOrdersById.value[order.legacyResourceId]));

function openCustomOrderRequest() {
  if (!capabilities.value.canRetryIndividualOrder) {
    actionError.value = translate("Administrator permission is required to download specific orders.");
    return;
  }
  if (!orderSync.remote?.systemMessageRemoteId) {
    commonUtil.showToast(translate("Shopify order search is unavailable for this shop."));
    return;
  }
  queryString.value = "";
  orders.value = [];
  selectedOrdersById.value = {};
  isLoading.value = false;
  hasNextPage.value = false;
  endCursor.value = "";
  if (debounceTimer) window.clearTimeout(debounceTimer);
  showCustomOrderRequestModal.value = true;
  void searchOrders();
}

async function searchOrders(after?: string) {
  isLoading.value = true;
  const currentRequestId = ++requestId;
  const shopId = props.id;
  try {
    const result = await orderSync.searchShopifyOrders({ queryString: queryString.value.trim(), after, pageSize: 20, shopId });
    if (currentRequestId !== requestId || shopId !== props.id) return;
    orders.value = after ? orders.value.concat(result.orders) : result.orders;
    hasNextPage.value = result.hasNextPage;
    endCursor.value = result.endCursor ?? "";
  } catch (error) {
    if (currentRequestId !== requestId || shopId !== props.id) return;
    const serverError = commonUtil.getErrorMessage(error);
    logger.error(error);
    commonUtil.showToast(`${translate("Failed to search Shopify orders.")} ${serverError}`);
    orders.value = [];
    hasNextPage.value = false;
  } finally {
    if (currentRequestId === requestId) isLoading.value = false;
  }
}

function handleInput() {
  if (debounceTimer) window.clearTimeout(debounceTimer);
  requestId++;
  debounceTimer = window.setTimeout(() => void searchOrders(), 600);
}

async function loadMore(event: any) {
  if (hasNextPage.value && endCursor.value) await searchOrders(endCursor.value);
  await event.target.complete();
}

function toggleOrder(order: ShopifyOrderSyncSearchResult) {
  const next = { ...selectedOrdersById.value };
  if (next[order.legacyResourceId]) delete next[order.legacyResourceId];
  else next[order.legacyResourceId] = order;
  selectedOrdersById.value = next;
}

function toggleAll() {
  selectedOrdersById.value = allSelected.value
    ? {}
    : Object.fromEntries(orders.value.map((order) => [order.legacyResourceId, order]));
}

function isSelected(id: string) { return Boolean(selectedOrdersById.value[id]); }
function formatOrderDate(value?: string) { return value ? formatDateTime(value) : translate("Date unavailable"); }

async function runImport(importOrders: () => Promise<{ imported: number; failed: string[] }>) {
  const shopId = props.id;
  actionMessage.value = translate("Import in progress. Keep this page open.");
  actionError.value = "";
  try {
    const result = await importOrders();
    if (props.id !== shopId) return;
    actionMessage.value = translate("{succeeded} succeeded · {failed} failed", { succeeded: result.imported, failed: result.failed.length });
    if (result.failed.length) actionError.value = translate("Could not confirm import for Shopify orders: {ids}", { ids: result.failed.join(", ") });
    void polling.manualRefresh().catch(error => logger.error(error));
  } catch (error) {
    if (props.id !== shopId) return;
    actionMessage.value = "";
    actionError.value = errorMessage(error, translate("Order import failed."));
  }
}

function submit() {
  if (!capabilities.value.canRetryIndividualOrder || orderSync.activeMutation || !selectedOrders.value.length) return;
  showCustomOrderRequestModal.value = false;
  void runImport(() => orderSync.requestSelectedOrders({ ids: Object.keys(selectedOrdersById.value), shopId: props.id }));
}

onBeforeUnmount(() => { if (debounceTimer) window.clearTimeout(debounceTimer); });

type LandmarkDateKey = "launchDate" | "historyLastSyncDate";

const landmarkDateRows = computed(() => ([
  {
    key: "launchDate" as LandmarkDateKey,
    title: translate("New order sync launch date"),
    description: translate("Orders created on or after this go-live date sync as live fulfillment work"),
    value: orderSync.landmarkDates.launchDate,
    last: false,
  },
  {
    key: "historyLastSyncDate" as LandmarkDateKey,
    title: translate("Order history synced through"),
    description: translate("Orders before the launch date are imported as historical records up to this point"),
    value: orderSync.landmarkDates.historyLastSyncDate,
    last: true,
  },
]));

const showLandmarkDateModal = ref(false);
const activeLandmarkKey = ref<LandmarkDateKey>("launchDate");
const landmarkDateValue = ref("");
const landmarkSuggestedDate = ref("");
const landmarkSuggestionLoading = ref(false);
const isLandmarkSaving = ref(false);
const landmarkSaveError = ref("");
const activeLandmark = computed(() => landmarkDateRows.value.find((row) => row.key === activeLandmarkKey.value));

async function openLandmarkDateModal(key: LandmarkDateKey) {
  if (!capabilities.value.canConfigure) {
    actionError.value = translate("Administrator permission is required to set landmark dates.");
    return;
  }
  activeLandmarkKey.value = key;
  landmarkSaveError.value = "";
  landmarkSuggestedDate.value = "";
  const existing = orderSync.landmarkDates[key];
  landmarkDateValue.value = existing ? toDatetimeInput(existing) : "";
  showLandmarkDateModal.value = true;
  landmarkSuggestionLoading.value = true;
  try {
    const suggestion = await orderSync.suggestOldestOrderDate();
    landmarkSuggestedDate.value = suggestion;
    if (!landmarkDateValue.value && suggestion) landmarkDateValue.value = toDatetimeInput(suggestion);
  } finally {
    landmarkSuggestionLoading.value = false;
  }
}

async function saveLandmarkDate() {
  if (!landmarkDateValue.value) return;
  const requestedShopId = props.id;
  const key = activeLandmarkKey.value;
  isLandmarkSaving.value = true;
  landmarkSaveError.value = "";
  try {
    const value = formatDateTime(landmarkDateValue.value, "yyyy-MM-dd HH:mm:ss") || landmarkDateValue.value;
    await orderSync.setLandmarkDate({ key, value, shopId: requestedShopId });
    if (props.id !== requestedShopId || orderSync.selectedShopId !== requestedShopId) return;
    showLandmarkDateModal.value = false;
    actionMessage.value = translate("Landmark date saved.");
    await polling.manualRefresh();
  } catch (error) {
    landmarkSaveError.value = errorMessage(error, translate("The landmark date could not be saved."));
  } finally {
    isLandmarkSaving.value = false;
  }
}

function toDatetimeInput(value: string): string {
  return formatDateTime(value, "yyyy-MM-dd'T'HH:mm:ss") || "";
}

const showReplayOrdersModal = ref(false);
const replayFromDate = ref("");
const replayZone = computed(() => orderSync.productStore?.defaultTimeZone || userStore.getUserTimeZone || "UTC");
const replayToday = ref("");

function openOrdersReplay() {
  if (!capabilities.value.canRetryIndividualOrder || orderSync.activeMutation) return;
  replayToday.value = DateTime.now().setZone(replayZone.value).toISODate() || "";
  replayFromDate.value = "";
  showReplayOrdersModal.value = true;
}

function startOrdersReplay() {
  const start = DateTime.fromISO(replayFromDate.value, { zone: replayZone.value }).startOf("day");
  if (!capabilities.value.canRetryIndividualOrder || orderSync.activeMutation || !start.isValid || start > DateTime.now()) return;
  showReplayOrdersModal.value = false;
  void runImport(() => orderSync.replayOrdersFromDate({ fromDate: start.toUTC().toISO()!, shopId: props.id }));
}

watch(() => props.id, () => {
  requestId++;
  selectedOrdersById.value = {};
  showCustomOrderRequestModal.value = showReplayOrdersModal.value = showLandmarkDateModal.value = false;
  showMdmLogModal.value = showSystemMessageModal.value = showJobDetailsModal.value = false;
});

function shopifyAdminOrderUrl(order: ShopifyOrderSyncRecentOrder): string {
  if (
    order.shopId !== props.id
    || orderSync.shop?.shopId !== props.id
    || !/^(?!0+$)[0-9]{1,30}$/.test(order.shopifyOrderId)
  ) return "";

  const hostname = String(orderSync.shop.myshopifyDomain || "").trim();
  if (
    hostname !== hostname.toLocaleLowerCase()
    || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.myshopify\.com$/.test(hostname)
  ) return "";
  return `https://${hostname}/admin/orders/${order.shopifyOrderId}`;
}

async function handleManualRefresh() {
  void refreshMetrics();
  actionError.value = "";
  await polling.manualRefresh();
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
  const loadedShopId = orderSync.shop?.shopId || "";
  const jobName = orderSync.job?.jobName || "";
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
    || orderSync.selectedShopId !== routeShopId
    || orderSync.shop?.shopId !== loadedShopId
    || orderSync.job?.jobName !== jobName
    || !canRunNow.value
  ) return false;

  actionMessage.value = "";
  actionError.value = "";
  try {
    const queued = await orderSync.runNow({ shopId: routeShopId });
    if (props.id !== routeShopId || orderSync.selectedShopId !== routeShopId) return false;
    const correlation = queued.systemMessageId || queued.jobRunId;
    actionMessage.value = correlation
      ? translate("The standard next batch was queued as {id}.", { id: correlation })
      : translate("The standard next batch was queued.");
    await polling.manualRefresh();
    return true;
  } catch (error) {
    if (props.id !== routeShopId || orderSync.selectedShopId !== routeShopId) return false;
    actionError.value = errorMessage(error, translate("Order Sync could not be queued."));
    return false;
  }
}

async function saveJobFromModal(input: { cronExpression?: string; paused?: boolean }) {
  const shopId = props.id;
  const currentJob = orderSync.job;
  /**
   * The shop binding is `selectedShopId`, NOT a `shopId` on the job row.
   *
   * A cached ServiceJob carries no top-level `shopId` — it is resolved for this shop by matching the
   * shop's remote against the job's `serviceJobParameters`. Testing `currentJob.shopId !== shopId`
   * compared `undefined` to the id and was therefore always true, so saving a schedule from this
   * modal ALWAYS threw "does not belong to the selected Shopify shop" and never wrote anything.
   */
  if (!shopId || !currentJob || orderSync.selectedShopId !== shopId) {
    throw new Error("The loaded Order Sync job does not belong to the selected Shopify shop.");
  }
  // The modal passes only a changed field, one per call, so each write is its own committed stage.
  if (input.cronExpression !== undefined) {
    await orderSync.updateSchedule(input.cronExpression, shopId);
  }
  if (input.paused !== undefined) {
    await orderSync.updateJobStatus(input.paused, shopId);
  }
}

async function refreshAfterJobModalUpdate() {
  await polling.manualRefresh();
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

.stat-data {
  display: flex;
  flex-wrap: nowrap;
  overflow-x: scroll;
  align-items: flex-start;
}

.stat-data ion-card {
  flex: 0 0 375px;
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
