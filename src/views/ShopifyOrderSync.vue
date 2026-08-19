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
                  {{ translate("Latest scheduled batch activity for this Shopify instance") }}
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
                  <ion-badge v-if="orderSync.isPaused" slot="end" color="warning">
                    {{ translate("Paused") }}
                  </ion-badge>
                </ion-item>
                <ion-item>
                  <ion-label>{{ translate("Orders processed") }}</ion-label>
                  <ion-note slot="end">{{ summary.processedOrderCount }}</ion-note>
                </ion-item>
                <ion-item>
                  <ion-label>
                    {{ translate("Latest batch outcome") }}
                    <p>{{ latestBatch?.systemMessageId || translate("Awaiting first run") }}</p>
                  </ion-label>
                  <ion-badge slot="end" :color="progressColor(summary.overallStatus)">
                    {{ progressStateLabel(summary.overallStatus) }}
                  </ion-badge>
                </ion-item>
                <ion-item>
                  <ion-label>{{ translate("Pending batch requests") }}</ion-label>
                  <ion-badge slot="end" :color="summary.pendingBatchRequests ? 'primary' : 'medium'">
                    {{ summary.pendingBatchRequests }}
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
                  <ion-label slot="end">{{ summary.pendingBatchRequests }}</ion-label>
                </ion-item>
                <ion-item>
                  <ion-label>
                    {{ translate("Current Shopify request status") }}
                    <p>{{ latestBatch?.systemMessageId || translate("No recent request") }}</p>
                  </ion-label>
                  <ion-badge slot="end" :color="progressColor(summary.batchStatus)">
                    {{ progressStateLabel(summary.batchStatus) }}
                  </ion-badge>
                </ion-item>
                <ion-item>
                  <ion-label>{{ translate("Order history records") }}</ion-label>
                  <ion-label slot="end">{{ orderSync.recentOrders.length }}</ion-label>
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
                <ion-badge slot="end" color="medium">{{ orderSync.recentOrders.length }}</ion-badge>
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
                        @click="openMdmLogDetails(log.logId)"
                      >
                        {{ translate("View DataManager run") }}
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
<<<<<<< Updated upstream
            <ion-popover :keep-contents-on-did-dismiss="true">
              <ion-datetime id="landmark-datetime" presentation="date-time" v-model="landmarkDateValue" />
            </ion-popover>
=======
>>>>>>> Stashed changes
          </ion-item>
          <ion-popover :keep-contents-on-did-dismiss="true">
            <ion-datetime id="landmark-datetime" presentation="date-time" v-model="landmarkDateValue" />
          </ion-popover>
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
          <ion-item lines="none">
            <ion-label class="ion-text-wrap">
              <h2>{{ translate("Replay orders from a date range") }}</h2>
              <p>{{ translate("Re-import Shopify orders through the standard import path. The run covers every order updated since the From date; the date range previews the orders it targets.") }}</p>
            </ion-label>
          </ion-item>
          <ion-item>
            <ion-select
              :label="translate('Match orders by')"
              :value="replayBasis"
              interface="popover"
              @ionChange="replayBasis = $event.detail.value === 'created_at' ? 'created_at' : 'updated_at'"
            >
              <ion-select-option value="updated_at">{{ translate("Updated time") }}</ion-select-option>
              <ion-select-option value="created_at">{{ translate("Created time") }}</ion-select-option>
            </ion-select>
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
            {{ translate("Dates are inclusive and use the OMS runtime timezone: {timeZone}.", { timeZone: orderSync.runtimeTimeZone || "UTC" }) }}
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
          <ion-item button @click="toggleAll">
            <ion-label>
              {{ translate("Select all") }}
              <p>{{ selectedOrders.length }} {{ translate("selected") }}</p>
            </ion-label>
            <ion-checkbox slot="end" :checked="allSelected" @click.stop="toggleAll" />
          </ion-item>
          <ion-item v-for="order in orders" :key="order.legacyResourceId" button @click="toggleOrder(order)">
            <ion-label>
              <h2>{{ order.name }}</h2>
              <p>{{ translate("Shopify ID") }}: {{ order.legacyResourceId }}</p>
              <p>{{ order.customerName || translate("No customer") }} · {{ order.displayFinancialStatus || translate("Status unavailable") }}</p>
              <p>{{ formatOrderDate(order.createdAt) }}</p>
            </ion-label>
            <ion-note slot="end">{{ order.totalAmount || translate("No total") }} {{ order.currencyCode || "" }}</ion-note>
            <ion-checkbox slot="end" :checked="isSelected(order.legacyResourceId)" @click.stop="toggleOrder(order)" />
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
          <ion-buttons slot="end"><ion-button fill="solid" color="primary" :disabled="!selectedOrders.length" @click="submit">{{ translate("Download selected orders") }} ({{ selectedOrders.length }})</ion-button></ion-buttons>
        </ion-toolbar>
      </ion-footer>
    </ion-modal>

    <ServiceJobDetailsModal
      :is-open="showJobDetailsModal"
      :job-name="orderSync.job?.jobName || ''"
      :title="translate('Queue order requests')"
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
  IonChip,
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
  IonSelect,
  IonSelectOption,
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
  orderSyncRunNowDisabledReason,
  orderSyncSummary,
  useShopifyOrderSyncPolling,
  useShopifyOrderSync,
  type SyncProgressRow,
  type SyncProgressState,
  type ShopifyOrderSyncImport,
  type ShopifyOrderSyncRecentOrder,
  type ShopifyOrderSyncSearchResult,
} from "@/composables/useShopify";
import { commonUtil, logger, translate } from "@common";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { DateTime } from "luxon";
import { closeOutline, flashOutline, openOutline, refreshOutline, timeOutline } from "ionicons/icons";
import { formatDateTime } from "@/utils";
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
const isInitialLoading = computed(() => !hasLoadedMonitoring.value && !orderSync.monitoringError);
const isRefreshing = computed(() => orderSync.monitoringRefreshing || polling.isRefreshing.value);
const fatalLoadError = computed(() => hasLoadedMonitoring.value ? "" : (orderSync.monitoringError || pollingError.value));
const staleRefreshError = computed(() => hasLoadedMonitoring.value ? (orderSync.monitoringError || pollingError.value) : "");
const selectedShopMatchesRoute = computed(() => Boolean(props.id) && orderSync.selectedShopId === props.id);
const loadedShopMatchesRoute = computed(() => selectedShopMatchesRoute.value && orderSync.shop?.shopId === props.id);
const canRunForSelectedShop = computed(() => loadedShopMatchesRoute.value && canRunNow.value);
const canEditJobFromModal = computed(() => loadedShopMatchesRoute.value
  && capabilities.value.canEditSchedule
  && capabilities.value.canActivate
  && !orderSync.activeMutation);
const editJobDisabledReason = computed(() => canEditJobFromModal.value
  ? ""
  : translate("COMMON_ADMIN permission is required to edit Order Sync."));
const shopName = computed(() => orderSync.shop?.name || translate("Shopify instance {id}", { id: props.id }));
const shopifyShopId = computed(() => orderSync.shop?.shopifyShopId || "");
const productStoreId = computed(() => orderSync.productStore?.productStoreId || orderSync.shop?.productStoreId || "");
const productStoreName = computed(() => orderSync.productStore?.name || orderSync.shop?.productStoreName || translate("Not linked"));
const latestBatch = computed(() => summary.value.latestBatch);
const latestCompletedBatchId = computed(() => summary.value.latestCompletedBatch?.systemMessageId || translate("None"));
const progressRows = computed<readonly [SyncProgressRow, SyncProgressRow]>(() => summary.value.progressRows);
const progressImports = computed<ShopifyOrderSyncImport[]>(() => {
  const systemMessageId = latestBatch.value?.systemMessageId;
  return systemMessageId ? orderSync.importsBySystemMessageId[systemMessageId] || [] : [];
});
const selectedSystemMessageDetails = computed(() => {
  const message = (orderSync.systemMessages || [])
    .find((row) => row.systemMessageId === selectedSystemMessageId.value);
  const imports = orderSync.importsBySystemMessageId[selectedSystemMessageId.value] || [];
  const successfulAudit = (orderSync.recentAudits || [])
    .find((row) => row.systemMessageId === selectedSystemMessageId.value);
  const requestFailure = (orderSync.recentRequestErrors || [])
    .find((row) => row.systemMessageId === selectedSystemMessageId.value);
  const importFailure = (orderSync.recentErrors || [])
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
  const imports = Object.values(orderSync.importsBySystemMessageId || {}).flat();
  const imported = imports.find((entry) => entry.logId === selectedMdmLogId.value);
  const successfulAudits = (orderSync.recentAudits || [])
    .filter((order) => order.logId === selectedMdmLogId.value);
  const failed = (orderSync.recentErrors || [])
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
const filteredOrders = computed(() => filterRecentOrders(orderSync.recentOrders, ordersQuery.value));
const failedImportLogs = computed(() => {
  return orderSync.failedDataManagerLogs || [];
});

const jobStateLabel = computed(() => {
  if (!orderSync.job) return translate("Setup required");
  return orderSync.isPaused ? translate("Paused") : translate("Active");
});
const jobStateColor = computed(() => !orderSync.job ? "medium" : orderSync.isPaused ? "warning" : "success");
const lastCompletedBatchLabel = computed(() => summary.value.lastCompletedAt
  ? formatDate(summary.value.lastCompletedAt)
  : translate("No completed batch recorded"));
const nextRunLabel = computed(() => {
  if (!orderSync.job) return translate("Not configured");
  if (orderSync.isPaused) return translate("Paused");
  return summary.value.nextRunTime ? formatDate(summary.value.nextRunTime) : translate("Not scheduled");
});
const batchRequestedLabel = computed(() => latestBatch.value?.initDate
  ? formatDate(latestBatch.value.initDate)
  : translate("Not requested yet"));
const runNowExplanation = computed(() => {
  if (canRunNow.value) {
    return translate("Queues the standard next batch window from the existing job configuration.");
  }
  return runNowDisabledReason.value;
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


function landmarkDateLabel(value: string): string {
  if (orderSync.landmarkDates.status === "loading") return translate("Loading");
  if (!value) return translate("Not set");
  return formatDateTime(value) || value;
}

function progressRowTitle(id: SyncProgressRow["id"]): string {
  return id === "batch-request"
    ? translate("Shopify order batch request")
    : translate("HotWax order import");
}

function progressStateLabel(state: SyncProgressState): string {
  if (state === "completed") return translate("Completed");
  if (state === "partial") return translate("Partially completed");
  if (state === "failed") return translate("Failed");
  if (state === "active") return translate("In progress");
  return translate("Waiting");
}

function progressDetailLabel(row: SyncProgressRow): string {
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

function progressColor(state: SyncProgressState): string {
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

/** `configId` is optional on a cached import row, so the label must accept its absence. */
function importLabel(configId: string | undefined): string {
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
    ...Object.values(orderSync.importsBySystemMessageId || {}).flat().map((entry) => entry.logId),
    ...(orderSync.recentAudits || []).map((order) => order.logId),
    ...(orderSync.recentErrors || []).map((error) => error.logId),
  ].filter(Boolean));
  if (!safeLogIds.has(id)) return;
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
  try {
    const result = await orderSync.searchShopifyOrders({ queryString: queryString.value.trim(), after, pageSize: 20 });
    if (currentRequestId !== requestId) return;
    orders.value = after ? orders.value.concat(result.orders) : result.orders;
    hasNextPage.value = result.hasNextPage;
    endCursor.value = result.endCursor ?? "";
  } catch (error) {
    if (currentRequestId !== requestId) return;
    logger.error(error);
    commonUtil.showToast(translate("Failed to search Shopify orders."));
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

async function submit() {
  const selectedIds = selectedOrders.value.map((order) => order.legacyResourceId);
  showCustomOrderRequestModal.value = false;
  if (!selectedIds.length) return;
  const requestedShopId = props.id;
  actionMessage.value = "";
  actionError.value = "";
  try {
    const result = await orderSync.requestSelectedOrders({ orders: selectedOrders.value, shopId: requestedShopId });
    if (props.id !== requestedShopId || orderSync.selectedShopId !== requestedShopId) return;
    if (result.queued.length === 1) {
      actionMessage.value = translate("Requested import run {id} covering Shopify order {order}.", {
        order: result.queued[0].shopifyOrderId,
        id: result.jobRunId,
      });
    } else {
      actionMessage.value = translate("Requested import run {id} covering {count} Shopify orders.", {
        count: result.queued.length,
        id: result.jobRunId,
      });
    }
    await polling.manualRefresh();
  } catch (error) {
    if (props.id !== requestedShopId || orderSync.selectedShopId !== requestedShopId) return;
    actionError.value = errorMessage(error, translate("The selected Shopify orders could not be queued."));
  }
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

const REPLAY_ORDER_LIMIT = 50;
const showReplayOrdersModal = ref(false);
const replayBasis = ref<"updated_at" | "created_at">("updated_at");
const replayFromDate = ref("");
const replayThruDate = ref("");
const isReplayStarting = ref(false);
const replayDateRangeError = computed(() => {
  if (!replayFromDate.value || !replayThruDate.value || replayFromDate.value <= replayThruDate.value) return "";
  return translate("From date must be on or before Thru date.");
});

function openOrdersReplay() {
  if (!capabilities.value.canRetryIndividualOrder) {
    actionError.value = translate("Administrator permission is required to download specific orders.");
    return;
  }
  if (!orderSync.remote?.systemMessageRemoteId) {
    commonUtil.showToast(translate("Shopify order search is unavailable for this shop."));
    return;
  }
  replayBasis.value = "updated_at";
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
    const zone = orderSync.runtimeTimeZone || "UTC";
    const fromDateTime = DateTime.fromISO(replayFromDate.value, { zone }).startOf("day").toUTC().toISO() || "";
    const thruDateTime = DateTime.fromISO(replayThruDate.value, { zone }).endOf("day").toUTC().toISO() || "";
    const basis = replayBasis.value;
    const search = await orderSync.searchShopifyOrders({
      queryString: `${basis}:>=${fromDateTime} ${basis}:<=${thruDateTime}`,
      pageSize: REPLAY_ORDER_LIMIT,
      shopId: requestedShopId,
    });
    if (props.id !== requestedShopId || orderSync.selectedShopId !== requestedShopId) return;

    if (!search.orders.length) {
      actionMessage.value = translate("No Shopify orders were found in the selected date range.");
      showReplayOrdersModal.value = false;
      return;
    }

    // The window import covers every order updated since the From date in ONE run, so the matched
    // count is a preview, not a cap — `hasNextPage` only means the preview stopped counting.
    const result = await orderSync.replayOrdersFromDate({ fromDate: fromDateTime, shopId: requestedShopId });
    if (props.id !== requestedShopId || orderSync.selectedShopId !== requestedShopId) return;
    actionMessage.value = search.hasNextPage
      ? translate("Requested import run {id} covering more than {limit} Shopify orders.", {
        id: result.jobRunId,
        limit: REPLAY_ORDER_LIMIT,
      })
      : translate("Requested import run {id} covering {count} Shopify orders.", {
        count: search.orders.length,
        id: result.jobRunId,
      });
    showReplayOrdersModal.value = false;
    await polling.manualRefresh();
  } catch (error) {
    if (props.id !== requestedShopId || orderSync.selectedShopId !== requestedShopId) return;
    actionError.value = errorMessage(error, translate("The selected Shopify orders could not be queued."));
  } finally {
    isReplayStarting.value = false;
  }
}

function openProgressDetails(row: SyncProgressRow) {
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
    || orderSync.shop?.shopId !== props.id
    || order.shopifyFetchVerified !== true
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

async function saveJobFromModal(input: { cronExpression: string; paused: boolean }) {
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
  if (input.cronExpression !== currentJob.cronExpression) {
    await orderSync.updateSchedule(input.cronExpression, shopId);
  }
  if (input.paused !== orderSync.isPaused) {
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
