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
                  <ion-label>{{ translate("Recently processed orders") }}</ion-label>
                  <ion-label slot="end">{{ orderSyncStore.recentOrders.length }}</ion-label>
                </ion-item>
                <ion-item>
                  <ion-label>
                    {{ translate("Import error records") }}
                    <p>{{ translate("Latest loaded create and update import failures") }}</p>
                  </ion-label>
                  <ion-label slot="end">{{ orderSyncStore.recentErrors.length }}</ion-label>
                </ion-item>
                <ion-item>
                  <ion-label>
                    {{ translate("Request failures") }}
                    <p>{{ translate("Terminal Shopify requests that failed before import") }}</p>
                  </ion-label>
                  <ion-label slot="end">{{ orderSyncStore.recentRequestErrors.length }}</ion-label>
                </ion-item>
              </ion-list>
            </ion-card>

            <ShopifyOrderSyncCustomRequestCard @open-search="openCustomOrderRequest" />
          </section>

          <section class="sync-stat" aria-labelledby="recent-orders-heading">
            <ion-progress-bar
              v-if="isRefreshing"
              type="indeterminate"
              :aria-label="translate('Refreshing recently processed orders')"
            />
            <div class="stat-header">
              <ion-item class="stat-title" lines="none">
                <ion-label>
                  <h2 id="recent-orders-heading">{{ translate("Recently processed orders") }}</h2>
                  <p>{{ translate("Latest 100 orders confirmed as processed by DataManager, newest first") }}</p>
                </ion-label>
                <ion-badge slot="end" color="medium">{{ orderSyncStore.recentOrders.length }}</ion-badge>
              </ion-item>
              <ion-searchbar
                :value="ordersQuery"
                :debounce="0"
                :placeholder="translate('Search the loaded orders by Shopify name or ID')"
                :aria-label="translate('Search recently processed orders')"
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
                    <ion-item
                      :button="!!order.logId"
                      :detail="!!order.logId"
                      @click="openMdmLogDetails(order.logId)"
                    >
                      <ion-label>
                        {{ translate("DataManager result") }}
                        <p>{{ order.configId || translate("Not available") }}</p>
                      </ion-label>
                      <ion-note slot="end">{{ translate("Completed") }}</ion-note>
                    </ion-item>
                    <ion-item
                      :button="!!order.systemMessageId"
                      :detail="!!order.systemMessageId"
                      @click="openSystemMessageDetails(order.systemMessageId)"
                    >
                      <ion-label>
                        {{ translate("SystemMessage") }}
                        <p>{{ order.systemMessageId || translate("Not available") }}</p>
                      </ion-label>
                    </ion-item>
                    <ion-item lines="none">
                      <ion-buttons>
                        <ion-button v-if="order.logId" fill="clear" @click.stop="openMdmLogDetails(order.logId)">
                          {{ translate("DataManager run") }}
                        </ion-button>
                        <ion-button v-if="hotWaxOrderUrl(order.orderId)" fill="clear" :href="hotWaxOrderUrl(order.orderId)" target="_blank" rel="noopener noreferrer">
                          {{ translate("HotWax order") }}
                        </ion-button>
                        <ion-button v-if="shopifyAdminOrderUrl(order)" fill="clear" :href="shopifyAdminOrderUrl(order)" target="_blank" rel="noopener noreferrer">
                          {{ translate("Shopify Admin") }}
                        </ion-button>
                        <ion-button v-if="order.systemMessageId" fill="clear" @click="openSystemMessageDetails(order.systemMessageId)">
                          {{ translate("Batch") }}
                        </ion-button>
                      </ion-buttons>
                    </ion-item>
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

          <section class="sync-stat" aria-labelledby="recent-request-errors-heading">
            <div class="stat-header">
              <ion-item class="stat-title" lines="none">
                <ion-label>
                  <h2 id="recent-request-errors-heading">{{ translate("Recent request failures") }}</h2>
                  <p>{{ translate("Latest 100 terminal Shopify requests that failed before import, newest first") }}</p>
                </ion-label>
              </ion-item>
              <ion-badge :color="orderSyncStore.recentRequestErrors.length ? 'danger' : 'medium'">
                {{ orderSyncStore.recentRequestErrors.length }}
              </ion-badge>
            </div>

            <div class="stat-data" role="list">
              <transition-group name="list" tag="div" class="list-transition-group">
                <ion-card v-for="error in orderSyncStore.recentRequestErrors" :key="error.id" role="listitem">
                  <ion-list lines="full">
                    <ion-item>
                      <ion-label class="ion-text-wrap">
                        {{ translate("Shopify request failed before import") }}
                        <p>{{ formatDate(error.occurredAt) }}</p>
                      </ion-label>
                      <ion-badge slot="end" color="danger">{{ translate("Failed") }}</ion-badge>
                    </ion-item>
                    <ion-item>
                      <ion-label class="ion-text-wrap">
                        {{ translate("Error") }}
                        <p>{{ translate(error.errorText) }}</p>
                      </ion-label>
                    </ion-item>
                    <ion-item>
                      <ion-label>
                        {{ translate("SystemMessage") }}
                        <p>{{ error.systemMessageId }}</p>
                      </ion-label>
                    </ion-item>
                    <ion-item lines="none">
                      <ion-button fill="clear" @click="openSystemMessageDetails(error.systemMessageId)">
                        {{ translate("View request progress") }}
                      </ion-button>
                    </ion-item>
                  </ion-list>
                </ion-card>
              </transition-group>
              <ion-card v-if="!orderSyncStore.recentRequestErrors.length">
                <ion-item lines="none">
                  <ion-label class="ion-text-center">
                    <p>{{ translate("No recent Shopify request failures were found for this instance.") }}</p>
                  </ion-label>
                </ion-item>
              </ion-card>
            </div>
          </section>

          <section class="sync-stat" aria-labelledby="recent-errors-heading">
            <ion-progress-bar
              v-if="isRefreshing"
              type="indeterminate"
              :aria-label="translate('Refreshing recent Order Sync errors')"
            />
            <div class="stat-header">
              <ion-item class="stat-title" lines="none">
                <ion-label>
                  <h2 id="recent-errors-heading">{{ translate("Recent import errors") }}</h2>
                  <p>{{ translate("Latest 100 failed create and update import records, newest first") }}</p>
                </ion-label>
              </ion-item>
              <ion-buttons>
                <ion-button
                  size="small"
                  fill="clear"
                  :disabled="!loadedShopMatchesRoute || !filteredErrors.length || errorDownloadState === 'loading'"
                  :aria-label="translate('Download loaded Order Sync errors as CSV')"
                  @click="downloadErrorsCsv"
                >
                  <ion-spinner v-if="errorDownloadState === 'loading'" slot="start" name="crescent" />
                  <ion-icon v-else slot="start" :icon="downloadOutline" />
                  {{ errorDownloadState === "loading" ? translate("Preparing CSV") : translate("Download CSV") }}
                </ion-button>
                <ion-badge :color="orderSyncStore.recentErrors.length ? 'danger' : 'medium'">
                  {{ orderSyncStore.recentErrors.length }}
                </ion-badge>
              </ion-buttons>
              <ion-searchbar
                :value="errorsQuery"
                :debounce="0"
                :placeholder="translate('Search the loaded errors by order, config, or batch')"
                :aria-label="translate('Search recent Order Sync errors')"
                @ionInput="errorsQuery = String($event.detail.value || '')"
              />
            </div>
            <p
              v-if="errorDownloadMessage"
              :class="errorDownloadState === 'error' ? 'ion-text-danger' : 'ion-text-success'"
              :role="errorDownloadState === 'error' ? 'alert' : 'status'"
              aria-live="polite"
            >
              {{ errorDownloadMessage }}
            </p>

            <div class="stat-data" role="list">
              <transition-group name="list" tag="div" class="list-transition-group">
                <ion-card v-for="error in filteredErrors" :key="error.id" role="listitem">
                  <ion-list lines="full">
                    <ion-item>
                      <ion-label class="ion-text-wrap">
                        {{ error.orderName || error.shopifyOrderId || translate("Unresolved Shopify order") }}
                        <p>{{ formatDate(error.occurredAt) }}</p>
                      </ion-label>
                      <ion-badge slot="end" color="danger">{{ translate("Failed") }}</ion-badge>
                    </ion-item>
                    <ion-item>
                      <ion-label class="ion-text-wrap">
                        {{ translate("Error") }}
                        <p>{{ error.errorText ? translate(error.errorText) : translate("No error text was returned.") }}</p>
                      </ion-label>
                    </ion-item>
                    <ion-item>
                      <ion-label>
                        {{ translate("Shopify order") }}
                        <p>{{ error.shopifyOrderId || translate("Not resolved") }}</p>
                      </ion-label>
                      <ion-note slot="end">{{ error.configId || translate("Not available") }}</ion-note>
                    </ion-item>
                    <ion-item
                      :button="!!error.systemMessageId"
                      :detail="!!error.systemMessageId"
                      @click="openSystemMessageDetails(error.systemMessageId)"
                    >
                      <ion-label>
                        {{ translate("SystemMessage") }}
                        <p>{{ error.systemMessageId || translate("Not available") }}</p>
                      </ion-label>
                    </ion-item>
                    <ion-item
                      v-if="error.logId"
                      button
                      detail
                      @click="openMdmLogDetails(error.logId)"
                    >
                      <ion-label>
                        {{ translate("DataManager run") }}
                        <p>{{ error.logId }}</p>
                      </ion-label>
                      <ion-note slot="end">{{ error.configId }}</ion-note>
                    </ion-item>
                    <ion-item lines="none">
                      <ion-buttons>
                        <ion-button v-if="error.logId" fill="clear" @click.stop="openMdmLogDetails(error.logId)">
                          {{ translate("View import") }}
                        </ion-button>
                        <ion-button v-if="error.systemMessageId" fill="clear" @click="openSystemMessageDetails(error.systemMessageId)">
                          {{ translate("View SystemMessage") }}
                        </ion-button>
                        <ion-button
                          v-if="error.retryable && orderSyncStore.capabilities.canRetryIndividualOrder"
                          fill="outline"
                          :disabled="!loadedShopMatchesRoute || retryState(error.id)?.pending"
                          @click="confirmRetry(error)"
                        >
                          <ion-spinner v-if="retryState(error.id)?.pending" slot="start" name="crescent" />
                          {{ translate("Retry individual order") }}
                        </ion-button>
                      </ion-buttons>
                    </ion-item>
                    <ion-item v-if="!error.retryable || !orderSyncStore.capabilities.canRetryIndividualOrder || retryError(error.id) || retryState(error.id)?.systemMessageId" lines="none">
                      <ion-label class="ion-text-wrap">
                        <p v-if="!error.retryable">{{ translate("Retry unavailable because this record has no Shopify-resolvable order ID.") }}</p>
                        <p v-else-if="!orderSyncStore.capabilities.canRetryIndividualOrder">{{ translate("Administrator permission is required to retry this order.") }}</p>
                        <p v-if="retryError(error.id)" class="ion-text-danger" role="alert">{{ retryError(error.id) }}</p>
                        <p v-if="retryState(error.id)?.systemMessageId" role="status">
                          {{ translate("Retry queued as SystemMessage") }}
                          <ion-button fill="clear" size="small" @click="openSystemMessageDetails(retryState(error.id)?.systemMessageId || '')">
                            {{ retryState(error.id)?.systemMessageId }}
                          </ion-button>.
                          {{ translate("The original error remains unchanged.") }}
                        </p>
                      </ion-label>
                    </ion-item>
                  </ion-list>
                </ion-card>
              </transition-group>
              <ion-card v-if="!filteredErrors.length">
                <ion-item lines="none">
                  <ion-label class="ion-text-center">
                    <p v-if="errorsQuery">{{ translate("No loaded errors match this search.") }}</p>
                    <p v-else>{{ translate("No recent order import errors were found for this Shopify instance.") }}</p>
                  </ion-label>
                </ion-item>
              </ion-card>
            </div>
          </section>
        </template>
      </main>
    </ion-content>

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
    <ShopifyOrderSyncSystemMessageModal
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
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonPage,
  IonProgressBar,
  IonSearchbar,
  IonSkeletonText,
  IonSpinner,
  IonTitle,
  IonToolbar,
  alertController,
  modalController,
} from "@ionic/vue";
import { buildAppUrl, commonUtil, translate } from "@common";
import { computed, ref, watch } from "vue";
import { downloadOutline, flashOutline, openOutline, refreshOutline, timeOutline } from "ionicons/icons";
import { downloadTextFile, formatDateTime } from "@/utils";
import { useShopifyOrderSyncPolling } from "@/composables/useShopifyOrderSyncPolling";
import ServiceJobDetailsModal from "@/components/ServiceJobDetailsModal.vue";
import ShopifyOrderSyncSystemMessageModal from "@/components/ShopifyOrderSyncSystemMessageModal.vue";
import ShopifyOrderSyncMdmLogModal from "@/components/ShopifyOrderSyncMdmLogModal.vue";
import ShopifyOrderSyncCustomRequestCard from "@/components/ShopifyOrderSyncCustomRequestCard.vue";
import ShopifyOrderSyncOrdersModal from "@/components/ShopifyOrderSyncOrdersModal.vue";
import {
  useShopifyOrderSyncStore,
  type ShopifyOrderSyncImport,
  type ShopifyOrderSyncRecentError,
  type ShopifyOrderSyncRecentOrder,
} from "@/store/shopifyOrderSync";
import type { OrderSyncProgressRow, OrderSyncProgressState } from "@/utils/shopifyOrderSync";
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
  const successfulAudit = (orderSyncStore.recentOrders || [])
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
  const successfulAudits = (orderSyncStore.recentOrders || [])
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
  if (!orderSyncStore.job) return translate("Configure Order Sync to begin recording processed orders.");
  if (!latestBatch.value) {
    return orderSyncStore.job.paused
      ? translate("The job is paused and has not completed its first batch.")
      : translate("Order Sync is awaiting its first batch.");
  }
  if (orderSyncStore.summary.batchStatus === "completed" && orderSyncStore.summary.processedOrderCount === 0) {
    return translate("The latest batch completed with 0 actionable order changes.");
  }
  return translate("No recently processed orders were found for this Shopify instance.");
});

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function formatDate(value: unknown): string {
  return formatDateTime(value) || translate("Not available");
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
    ...(orderSyncStore.recentOrders || []).map((order) => order.logId),
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

function openProgressDetails(row: OrderSyncProgressRow) {
  if (row.id === "batch-request" && latestBatch.value?.systemMessageId) {
    openSystemMessageDetails(latestBatch.value.systemMessageId);
    return;
  }
  if (row.id === "hotwax-import" && progressImports.value[0]?.logId) {
    openMdmLogDetails(progressImports.value[0].logId);
  }
}

function hotWaxOrderUrl(orderId: string): string {
  return orderId ? buildAppUrl("order-manager", `/orders/${encodeURIComponent(orderId)}`) || "" : "";
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
