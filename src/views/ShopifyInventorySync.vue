<template>
  <ion-page>
    <template v-if="activeView === 'monitor'">
      <ion-header>
        <ion-toolbar>
          <ion-buttons slot="start">
            <ion-back-button :default-href="`/shopify-connection-details/${props.id}`" />
          </ion-buttons>
          <ion-title>Inventory sync</ion-title>
          <ion-buttons slot="end">
            <ion-button @click="openHistory()">
              <ion-icon slot="start" :icon="timeOutline" />
              Event history
            </ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>

      <ion-content class="ion-padding-horizontal">
        <section class="summary-grid">
          <ion-card>
            <ion-card-header>
              <ion-card-title>Aggregate event queue</ion-card-title>
              <ion-card-subtitle>Inventory changes waiting to reach Shopify aggregate locations</ion-card-subtitle>
              <ion-buttons>
                <ion-button fill="clear" aria-label="Run batch now" disabled>
                  <ion-icon slot="icon-only" :icon="flashOutline" />
                </ion-button>
                <ion-button fill="clear" aria-label="More queue actions" disabled>
                  <ion-icon slot="icon-only" :icon="ellipsisVerticalOutline" />
                </ion-button>
              </ion-buttons>
            </ion-card-header>
            <ion-list lines="full">
              <ion-item button detail @click="openHistory()">
                <ion-label>
                  Aggregate events pending batching
                  <p>Calculated inventory adjustments without a System Message</p>
                </ion-label>
                <ion-badge slot="end" color="warning">
                  {{ pendingEventCount }}
                </ion-badge>
              </ion-item>
              <ion-item button detail @click="openHistory('batches')">
                <ion-label>
                  Batches pending delivery
                  <p>System Messages waiting to send or retry</p>
                </ion-label>
                <ion-badge slot="end" color="primary">
                  {{ pendingBatchCount }}
                </ion-badge>
              </ion-item>
              <ion-item
                :button="!!pendingPublisherJob"
                :detail="!!pendingPublisherJob"
                @click="openServiceJob(pendingPublisherJob, 'Publish and send aggregate event batches')"
              >
                <ion-label>
                  Next batch send
                  <p>Send Shopify aggregate inventory adjustments</p>
                </ion-label>
                <ion-label slot="end">
                  {{ nextBatchRun }}
                  <p>Publisher job schedule</p>
                </ion-label>
              </ion-item>
              <ion-item lines="none" button detail @click="openHistory()">
                <ion-label>
                  Oldest unbatched event
                  <p>First calculated adjustment still waiting for a batch</p>
                </ion-label>
                <ion-label slot="end">
                  {{ oldestUnbatchedEvent }}
                </ion-label>
              </ion-item>
            </ion-list>
          </ion-card>

          <ion-card>
            <ion-card-header>
              <ion-card-title>Next scheduled inventory work</ion-card-title>
              <ion-card-subtitle>Upcoming batch and reset jobs for this Shopify connection</ion-card-subtitle>
              <ion-buttons>
                <ion-button fill="clear" aria-label="View schedules" @click="openFirstScheduledJob()">
                  <ion-icon slot="icon-only" :icon="calendarOutline" />
                </ion-button>
              </ion-buttons>
            </ion-card-header>
            <ion-list lines="full">
              <ion-item
                :button="!!pendingPublisherJob"
                :detail="!!pendingPublisherJob"
                @click="openServiceJob(pendingPublisherJob, 'Publish and send aggregate event batches')"
              >
                <ion-label>
                  Aggregate event batch
                  <p>{{ pendingEventCount }} calculated adjustments waiting</p>
                </ion-label>
                <ion-label slot="end">
                  {{ nextBatchRun }}
                  <p>Shared publisher job</p>
                </ion-label>
              </ion-item>
              <ion-item
                :button="!!primaryAggregateResetJob"
                :detail="!!primaryAggregateResetJob"
                @click="openServiceJob(primaryAggregateResetJob, 'Reset aggregate ATP inventory')"
              >
                <ion-label>
                  Aggregate ATP reset
                  <p>{{ aggregateResetJobCount }} reset job{{ aggregateResetJobCount === 1 ? '' : 's' }} for this connection</p>
                </ion-label>
                <ion-label slot="end">
                  {{ nextAggregateReset }}
                  <p>Full aggregate ATP reset</p>
                </ion-label>
              </ion-item>
              <ion-item
                :button="!!physicalResetJob"
                :detail="!!physicalResetJob"
                @click="openServiceJob(physicalResetJob, 'Reset physical location QOH')"
              >
                <ion-label>
                  Physical location QOH reset
                  <p>All mapped physical Shopify locations</p>
                </ion-label>
                <ion-label slot="end">
                  {{ nextPhysicalReset }}
                  <p>{{ physicalResetJob?.paused === 'Y' ? 'Paused' : 'Connection-scoped job' }}</p>
                </ion-label>
              </ion-item>
              <ion-item lines="none">
                <ion-label>
                  Schedule health
                  <p>Connection schedules and event delivery are visible from the OMS cache</p>
                </ion-label>
                <ion-badge slot="end" :color="scheduleHealthColor">
                  {{ scheduleHealth }}
                </ion-badge>
              </ion-item>
            </ion-list>
          </ion-card>
        </section>

        <section class="event-feed-settings">
          <ion-item lines="none">
            <ion-label>
              <h2>Real-time inventory updates</h2>
              <p>Control whether inventory events are pushed as they happen or retained for manual processing</p>
            </ion-label>
          </ion-item>

          <ion-card>
            <ion-card-content class="event-feed-setting">
              <ion-icon :icon="cloudUploadOutline" />
              <ion-label>
                Inventory channel event updates
                <p>Receipts, reservations, POS issuances, and inventory configuration changes</p>
                <p class="global-feed-scope">Applies to every Shopify connection on this OMS</p>
              </ion-label>
              <div class="event-feed-control">
                <ion-badge :color="inventoryEventFeedBadgeColor">
                  {{ inventoryEventFeedStatus }}
                </ion-badge>
                <ion-toggle
                  aria-label="Use real-time push for Shopify inventory events"
                  :checked="inventoryEventFeedPush"
                  :disabled="inventoryEventFeedToggleDisabled"
                  @click.prevent="requestInventoryEventFeedChange($event)"
                />
              </div>
            </ion-card-content>
          </ion-card>
        </section>

        <section ref="syncMonitorSection" class="sync-monitor">
          <ion-item lines="none">
            <ion-label>
              <h2>Sync monitor</h2>
              <p>Review the jobs that move physical and aggregate inventory to Shopify</p>
            </ion-label>
          </ion-item>

          <ion-card>
            <ion-card-header>
              <ion-card-title>Inventory sync jobs</ion-card-title>
              <ion-card-subtitle>Schedules, recent runs, and current health</ion-card-subtitle>
            </ion-card-header>
            <ion-list lines="full">
              <ion-item
                v-for="job in monitoredJobs"
                :key="job.name"
                :button="!!job.job"
                :detail="!!job.job"
                @click="openServiceJob(job.job, job.name)"
              >
                <ion-icon slot="start" :icon="job.icon" />
                <ion-label>
                  {{ job.name }}
                  <p>{{ job.lastRun }}</p>
                  <p>{{ job.nextRun }}</p>
                </ion-label>
                <ion-badge slot="end" :color="job.badgeColor">
                  {{ job.status }}
                </ion-badge>
              </ion-item>
            </ion-list>
          </ion-card>
        </section>

        <section class="run-section">
          <div class="section-header">
            <ion-item lines="none">
              <ion-label>
                <h2>Physical location on hand reset runs</h2>
                <p>Recent full-job runs that reset on-hand inventory across every mapped physical location</p>
              </ion-label>
            </ion-item>
            <ion-button v-if="physicalResetJob" fill="clear" @click="openServiceJob(physicalResetJob, 'Reset physical location QOH')">
              View all runs
            </ion-button>
          </div>
          <div class="run-carousel" aria-label="Physical location on hand reset job runs">
            <ion-card v-for="run in physicalResetRuns" :key="run.id">
              <ion-card-header>
                <ion-card-title>{{ run.id }}</ion-card-title>
                <ion-card-subtitle>Physical location QOH reset</ion-card-subtitle>
                <ion-badge :color="run.badgeColor">
                  {{ run.status }}
                </ion-badge>
              </ion-card-header>
              <ion-list lines="full">
                <ion-item>
                  <ion-label>
                    Started
                    <p>{{ run.started }}</p>
                  </ion-label>
                  <ion-note slot="end">
                    {{ run.duration }}
                  </ion-note>
                </ion-item>
                <ion-item>
                  <ion-label>
                    Parameters
                    <p>{{ run.parameters }}</p>
                    <p>Scope: {{ run.scope }}</p>
                  </ion-label>
                </ion-item>
                <ion-item lines="none">
                  <ion-label>
                    Result
                    <p>{{ run.result }}</p>
                  </ion-label>
                  <ion-chip slot="end" outline :color="run.failed ? 'danger' : 'success'">
                    <ion-label>{{ run.failed ? 'Job error' : 'No job error' }}</ion-label>
                  </ion-chip>
                </ion-item>
              </ion-list>
            </ion-card>
            <ion-card v-if="jobsHydrated && !physicalResetRuns.length">
              <ion-item lines="none">
                <ion-icon slot="start" :icon="timeOutline" />
                <ion-label>
                  No cached physical reset runs
                  <p>The job may be unconfigured, paused, or have no recorded executions.</p>
                </ion-label>
              </ion-item>
            </ion-card>
          </div>
        </section>

        <section class="run-section">
          <div class="section-header">
            <ion-item lines="none">
              <ion-label>
                <h2>Aggregate location ATP reset runs</h2>
                <p>Recent full-job runs that reset ATP across every configured aggregate location</p>
              </ion-label>
            </ion-item>
            <ion-button v-if="primaryAggregateResetJob" fill="clear" @click="openServiceJob(primaryAggregateResetJob, 'Reset aggregate ATP inventory')">
              View all runs
            </ion-button>
          </div>
          <div class="run-carousel" aria-label="Aggregate location ATP reset job runs">
            <ion-card v-for="run in aggregateResetRuns" :key="run.id">
              <ion-card-header>
                <ion-card-title>{{ run.id }}</ion-card-title>
                <ion-card-subtitle>Aggregate location ATP reset</ion-card-subtitle>
                <ion-badge :color="run.badgeColor">
                  {{ run.status }}
                </ion-badge>
              </ion-card-header>
              <ion-list lines="full">
                <ion-item>
                  <ion-label>
                    Started
                    <p>{{ run.started }}</p>
                  </ion-label>
                  <ion-note slot="end">
                    {{ run.duration }}
                  </ion-note>
                </ion-item>
                <ion-item>
                  <ion-label>
                    Parameters
                    <p>{{ run.parameters }}</p>
                    <p>Scope: {{ run.scope }}</p>
                  </ion-label>
                </ion-item>
                <ion-item lines="none">
                  <ion-label>
                    Result
                    <p>{{ run.result }}</p>
                  </ion-label>
                  <ion-chip slot="end" outline :color="run.failed ? 'danger' : 'success'">
                    <ion-label>{{ run.failed ? 'Job error' : 'No job error' }}</ion-label>
                  </ion-chip>
                </ion-item>
              </ion-list>
            </ion-card>
            <ion-card v-if="jobsHydrated && inventoryChannelsHydrated && !aggregateResetRuns.length">
              <ion-item lines="none">
                <ion-icon slot="start" :icon="timeOutline" />
                <ion-label class="ion-text-wrap">
                  No cached aggregate reset runs
                  <p>The connection has no aggregate reset job, or its configured jobs have not run yet.</p>
                </ion-label>
              </ion-item>
            </ion-card>
          </div>
        </section>

        <section class="run-section ion-padding-bottom">
          <div class="section-header">
            <ion-item lines="none">
              <ion-label>
                <h2>Aggregate event batches</h2>
                <p>System Messages containing calculated aggregate inventory adjustments</p>
              </ion-label>
            </ion-item>
            <ion-button fill="clear" @click="openHistory()">
              <ion-icon slot="start" :icon="listOutline" />
              Event history
            </ion-button>
          </div>
          <div class="run-carousel" aria-label="Aggregate inventory event batches">
            <ion-card v-for="batch in batches" :key="batch.id">
              <ion-card-header>
                <ion-card-title>{{ batch.id }}</ion-card-title>
                <ion-card-subtitle>Aggregate inventory adjustment batch</ion-card-subtitle>
                <ion-badge :color="batch.badgeColor">
                  {{ batch.status }}
                </ion-badge>
              </ion-card-header>
              <ion-list lines="full">
                <ion-item>
                  <ion-label>
                    Created
                    <p>{{ batch.created }}</p>
                  </ion-label>
                  <ion-note slot="end">
                    {{ batch.age }}
                  </ion-note>
                </ion-item>
                <ion-item>
                  <ion-label>
                    Shopify target
                    <p>{{ batch.target }}</p>
                  </ion-label>
                </ion-item>
                <ion-item button detail @click="selectedBatch = batch">
                  <ion-label>
                    Events in this batch
                    <p>{{ batch.detail }}</p>
                  </ion-label>
                  <ion-badge slot="end" color="medium">
                    {{ batch.eventCount }}
                  </ion-badge>
                </ion-item>
                <ion-item lines="none">
                  <ion-button fill="clear" @click="openMessage(batch)">
                    <ion-icon slot="start" :icon="documentTextOutline" />
                    Message text
                  </ion-button>
                  <ion-button slot="end" fill="clear" @click="selectedBatch = batch">
                    View events
                  </ion-button>
                </ion-item>
              </ion-list>
            </ion-card>
            <ion-card v-if="inventoryDetailsHydrated && inventorySyncReady && !batches.length">
              <ion-item lines="none">
                <ion-icon slot="start" :icon="timeOutline" />
                <ion-label class="ion-text-wrap">
                  No aggregate event batches
                  <p>No calculated events for this Shopify connection have been assigned to a System Message yet.</p>
                </ion-label>
              </ion-item>
            </ion-card>
          </div>
        </section>
      </ion-content>
    </template>

    <template v-else>
      <ion-header>
        <ion-toolbar>
          <ion-buttons slot="start">
            <ion-back-button :default-href="`/shopify-connection-details/${props.id}/inventory-sync`" />
          </ion-buttons>
          <ion-title>Inventory event history</ion-title>
        </ion-toolbar>
      </ion-header>

      <ion-content class="ion-padding-horizontal">
        <main class="history-page">
          <ion-card class="history-filter-card">
            <ion-card-content>
              <ion-searchbar
                v-model="historyQuery"
                class="history-search"
                :debounce="250"
                placeholder="Search event key, product, inventory channel, Shopify target, or batch"
              />

              <div class="filter-grid">
                <div class="filter-item">
                  <ion-select
                    :value="selectedHistoryStatus"
                    label="Status"
                    label-placement="stacked"
                    fill="outline"
                    interface="popover"
                    placeholder="All"
                    @ion-change="selectedHistoryStatus = $event.detail.value || ''"
                  >
                    <ion-select-option value="">
                      All
                    </ion-select-option>
                    <ion-select-option v-for="status in historyStatusOptions" :key="status" :value="status">
                      {{ status }}
                    </ion-select-option>
                  </ion-select>
                  <ion-button v-if="selectedHistoryStatus" fill="clear" class="clear-filter-button" aria-label="Clear status filter" @click.stop="selectedHistoryStatus = ''">
                    <ion-icon slot="icon-only" :icon="closeCircleOutline" />
                  </ion-button>
                </div>

                <div class="filter-item">
                  <ion-select
                    :value="selectedEventType"
                    label="Event type"
                    label-placement="stacked"
                    fill="outline"
                    interface="popover"
                    placeholder="All"
                    @ion-change="selectedEventType = $event.detail.value || ''"
                  >
                    <ion-select-option value="">
                      All
                    </ion-select-option>
                    <ion-select-option v-for="eventType in eventTypeOptions" :key="eventType" :value="eventType">
                      {{ eventType }}
                    </ion-select-option>
                  </ion-select>
                  <ion-button v-if="selectedEventType" fill="clear" class="clear-filter-button" aria-label="Clear event type filter" @click.stop="selectedEventType = ''">
                    <ion-icon slot="icon-only" :icon="closeCircleOutline" />
                  </ion-button>
                </div>

                <div class="filter-item">
                  <ion-select
                    :value="selectedTarget"
                    label="Shopify target"
                    label-placement="stacked"
                    fill="outline"
                    interface="popover"
                    placeholder="All"
                    @ion-change="selectedTarget = $event.detail.value || ''"
                  >
                    <ion-select-option value="">
                      All
                    </ion-select-option>
                    <ion-select-option v-for="target in targetOptions" :key="target" :value="target">
                      {{ target }}
                    </ion-select-option>
                  </ion-select>
                  <ion-button v-if="selectedTarget" fill="clear" class="clear-filter-button" aria-label="Clear Shopify target filter" @click.stop="selectedTarget = ''">
                    <ion-icon slot="icon-only" :icon="closeCircleOutline" />
                  </ion-button>
                </div>

                <div class="filter-item">
                  <ion-select
                    :value="historySortOrder"
                    label="Sort"
                    label-placement="stacked"
                    fill="outline"
                    interface="popover"
                    @ion-change="historySortOrder = $event.detail.value"
                  >
                    <ion-select-option value="newest">
                      Newest first
                    </ion-select-option>
                    <ion-select-option value="oldest">
                      Oldest first
                    </ion-select-option>
                  </ion-select>
                </div>
              </div>
            </ion-card-content>
          </ion-card>

          <div class="history-results-header">
            <ion-item lines="none">
              <ion-label>
                <h2>Inventory event history</h2>
                <p>A list of aggregate inventory events and the batches that carry them to Shopify</p>
              </ion-label>
            </ion-item>
            <ion-badge color="medium">
              {{ filteredEvents.length }} shown
            </ion-badge>
          </div>

          <ion-segment v-model="historyMode" class="history-mode">
            <ion-segment-button value="events">
              <ion-label>All events</ion-label>
            </ion-segment-button>
            <ion-segment-button value="batches">
              <ion-label>Grouped by batch</ion-label>
            </ion-segment-button>
          </ion-segment>

          <ion-card v-if="historyMode === 'events' && filteredEvents.length">
            <div class="event-table event-table-header" role="row">
              <ion-label>Event</ion-label>
              <ion-label>Product</ion-label>
              <ion-label>Shopify target</ion-label>
              <ion-label>Adjustment</ion-label>
              <ion-label>Batch</ion-label>
              <ion-label>Status</ion-label>
              <span />
            </div>
            <div v-for="event in filteredEvents" :key="event.rowKey" class="event-table event-table-row" role="row">
              <ion-label class="ion-text-wrap">
                <span class="overline mobile-only">Event</span>
                {{ event.type }}
                <p>{{ event.key }}</p>
              </ion-label>
              <ion-label class="ion-text-wrap">
                <span class="overline mobile-only">Product</span>
                {{ event.productId }}
                <p>{{ event.productName || event.facility }}</p>
                <p v-if="event.productName">{{ event.facility }}</p>
              </ion-label>
              <ion-label class="ion-text-wrap">
                <span class="overline mobile-only">Shopify target</span>
                {{ event.target }}
                <p>{{ event.model }}</p>
              </ion-label>
              <ion-label>
                <span class="overline mobile-only">Adjustment</span>
                {{ event.change }}
              </ion-label>
              <ion-label>
                <span class="overline mobile-only">Batch</span>
                {{ event.batchId || "Not batched" }}
              </ion-label>
              <div class="event-status">
                <span class="overline mobile-only">Status</span>
                <ion-badge :color="event.badgeColor">
                  {{ event.status }}
                </ion-badge>
              </div>
              <ion-button fill="clear" aria-label="View event details" @click="selectedEvent = event">
                <ion-icon slot="icon-only" :icon="chevronForwardOutline" />
              </ion-button>
            </div>
          </ion-card>

          <ion-accordion-group v-else-if="historyMode === 'batches' && visibleBatchGroups.length" :multiple="true" :value="['unsent']">
            <ion-accordion
              v-for="group in visibleBatchGroups"
              :key="group.id"
              :value="group.id"
            >
              <div slot="header" class="batch-header list-item">
                <ion-item lines="none">
                  <ion-icon slot="start" :icon="group.icon" />
                  <ion-label>
                    {{ group.title }}
                    <p>{{ group.subtitle }}</p>
                  </ion-label>
                </ion-item>
                <ion-label>
                  {{ group.events.length }} events
                  <p>{{ group.totalChange }}</p>
                </ion-label>
                <ion-badge :color="group.badgeColor">
                  {{ group.status }}
                </ion-badge>
                <span />
              </div>
              <ion-list slot="content" lines="full">
                <ion-item v-for="event in group.events" :key="event.rowKey" button detail @click="selectedEvent = event">
                  <ion-label class="ion-text-wrap">
                    {{ event.type }} for {{ event.productId }}
                    <p>{{ event.key }}</p>
                    <p>{{ event.facility }} to {{ event.target }}</p>
                  </ion-label>
                  <ion-note slot="end">
                    {{ event.change }}
                  </ion-note>
                  <ion-badge slot="end" :color="event.badgeColor">
                    {{ event.status }}
                  </ion-badge>
                </ion-item>
              </ion-list>
            </ion-accordion>
          </ion-accordion-group>
          <ion-card v-else-if="inventoryDetailsHydrated && inventorySyncReady">
            <ion-item lines="none">
              <ion-icon slot="start" :icon="timeOutline" />
              <ion-label class="ion-text-wrap">
                No inventory events match this view
                <p>Clear the filters, or wait for the OMS to calculate an aggregate inventory event for this Shopify connection.</p>
              </ion-label>
            </ion-item>
          </ion-card>
        </main>
      </ion-content>
    </template>

    <ion-modal :is-open="!!selectedEvent" @did-dismiss="selectedEvent = null">
      <ion-header>
        <ion-toolbar>
          <ion-buttons slot="start">
            <ion-button aria-label="Close event details" @click="selectedEvent = null">
              <ion-icon slot="icon-only" :icon="closeOutline" />
            </ion-button>
          </ion-buttons>
          <ion-title>Inventory event detail</ion-title>
        </ion-toolbar>
      </ion-header>
      <ion-content>
        <ion-list lines="full">
          <ion-item>
            <ion-label class="ion-text-wrap">Event<p>{{ selectedEvent?.key }}</p></ion-label>
            <ion-badge slot="end" :color="selectedEvent?.badgeColor">{{ selectedEvent?.status }}</ion-badge>
          </ion-item>
          <ion-item>
            <ion-label>Product<p>{{ selectedEvent?.productId }} · {{ selectedEvent?.productName || 'No product name' }}</p></ion-label>
          </ion-item>
          <ion-item>
            <ion-label class="ion-text-wrap">Inventory channel<p>{{ selectedEvent?.facility }}</p></ion-label>
          </ion-item>
          <ion-item>
            <ion-label>Shopify target<p>{{ selectedEvent?.target }}</p></ion-label>
            <ion-note slot="end">{{ selectedEvent?.change }}</ion-note>
          </ion-item>
          <ion-item>
            <ion-label>Batch<p>{{ selectedEvent?.batchId || 'Not batched' }}</p></ion-label>
          </ion-item>
          <ion-item lines="none">
            <ion-label class="ion-text-wrap">Calculation<p>{{ selectedEvent?.decisionComment || 'No calculation comment recorded' }}</p></ion-label>
          </ion-item>
        </ion-list>
      </ion-content>
    </ion-modal>

    <ion-modal :is-open="!!selectedBatch" @did-dismiss="selectedBatch = null">
      <ion-header>
        <ion-toolbar>
          <ion-buttons slot="start">
            <ion-button aria-label="Close batch events" @click="selectedBatch = null">
              <ion-icon slot="icon-only" :icon="closeOutline" />
            </ion-button>
          </ion-buttons>
          <ion-title>Events in {{ selectedBatch?.id }}</ion-title>
        </ion-toolbar>
      </ion-header>
      <ion-content>
        <ion-list lines="full">
          <ion-item>
            <ion-label>
              Shopify target
              <p>{{ selectedBatch?.target }}</p>
            </ion-label>
            <ion-badge slot="end" :color="selectedBatch?.badgeColor">
              {{ selectedBatch?.status }}
            </ion-badge>
          </ion-item>
          <ion-item>
            <ion-label>
              Included events
              <p>Every event retains its original HotWax event key</p>
            </ion-label>
            <ion-label slot="end">
              {{ selectedBatch?.eventCount }}
            </ion-label>
          </ion-item>
          <ion-list-header>
            <ion-label>Event details</ion-label>
          </ion-list-header>
          <ion-item v-for="event in eventsForSelectedBatch" :key="event.rowKey">
            <ion-label class="ion-text-wrap">
              {{ event.type }} for {{ event.productId }}
              <p>{{ event.key }}</p>
              <p>{{ event.facility }} to {{ event.target }}</p>
            </ion-label>
            <ion-note slot="end">
              {{ event.change }}
            </ion-note>
            <ion-badge slot="end" :color="event.badgeColor">
              {{ event.status }}
            </ion-badge>
          </ion-item>
        </ion-list>
      </ion-content>
    </ion-modal>

    <ion-modal :is-open="!!messageBatch" @did-dismiss="messageBatch = null">
      <ion-header>
        <ion-toolbar>
          <ion-buttons slot="start">
            <ion-button aria-label="Close message text" @click="messageBatch = null">
              <ion-icon slot="icon-only" :icon="closeOutline" />
            </ion-button>
          </ion-buttons>
          <ion-title>System Message text</ion-title>
        </ion-toolbar>
      </ion-header>
      <ion-content>
        <ion-list lines="full">
          <ion-item>
            <ion-label>
              System Message
              <p>{{ messageBatch?.id }}</p>
            </ion-label>
            <ion-badge slot="end" :color="messageBatch?.badgeColor">
              {{ messageBatch?.status }}
            </ion-badge>
          </ion-item>
          <ion-item>
            <ion-label>
              Message type
              <p>ShopifyInventoryAdjustment</p>
            </ion-label>
          </ion-item>
        </ion-list>
        <ion-textarea
          class="ion-padding"
          :value="messageText"
          label="Message payload"
          label-placement="stacked"
          auto-grow
          readonly
        />
      </ion-content>
    </ion-modal>

    <ServiceJobDetailsModal
      :is-open="!!selectedServiceJob"
      :job-name="selectedServiceJob?.jobName || ''"
      :title="selectedServiceJob?.title || 'Inventory sync job'"
      parameter-description="Job and service parameters used by this inventory sync job."
      @updated="refreshServiceJobData"
      @close="selectedServiceJob = null"
    />
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonAccordion, IonAccordionGroup, IonBackButton, IonBadge, IonButton, IonButtons, IonCard,
  IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonChip, IonContent,
  IonHeader, IonIcon, IonItem, IonLabel, IonList, IonListHeader, IonModal, IonNote,
  IonPage, IonSearchbar, IonSegment, IonSegmentButton, IonSelect, IonSelectOption,
  IonTextarea, IonTitle, IonToggle, IonToolbar, alertController, onIonViewDidLeave,
  onIonViewWillEnter,
} from "@ionic/vue";
import {
  calendarOutline, checkmarkCircleOutline, chevronForwardOutline,
  closeCircleOutline, closeOutline, cloudUploadOutline, documentTextOutline,
  ellipsisVerticalOutline, flashOutline, layersOutline, listOutline, locationOutline,
  refreshOutline, timeOutline, warningOutline,
} from "ionicons/icons";
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { commonUtil, logger } from "@common";
import { useCacheSync } from "@/composables/useCacheSync";
import { useCachedList } from "@/composables/useCachedList";
import { useServiceJobRunsByJob, useServiceJobs } from "@/composables/useServiceJobs";
import {
  SHOPIFY_INVENTORY_EVENT_FEED_ID,
  SHOPIFY_INVENTORY_EVENT_FEED_MANUAL,
  SHOPIFY_INVENTORY_EVENT_FEED_PUSH,
  updateShopifyInventoryEventFeedType,
  useShopifySyncContext,
} from "@/composables/useShopify";
import {
  dataFeedCache,
  inventoryChannelCache,
  shopifyInventoryAdjustmentDetailCache,
  systemMessageCache,
} from "@/utils/cacheEntities";
import { isEffectiveNow } from "@/utils/cacheProjection";
import { formatDateTime } from "@/utils";
import { parameterMap } from "@/utils/serviceJob";
import ServiceJobDetailsModal from "@/components/common/ServiceJobDetailsModal.vue";

type ViewName = "monitor" | "history";
type HistoryMode = "events" | "batches";

interface Batch {
  id: string;
  statusId?: string;
  status: string;
  badgeColor: string;
  created: string;
  createdAt: number;
  age: string;
  target: string;
  eventCount: number;
  detail: string;
  messageText?: string;
}

interface InventoryEvent {
  rowKey: string;
  key: string;
  type: string;
  productId: string;
  productName?: string;
  facility: string;
  target: string;
  model: string;
  change: string;
  batchId?: string;
  status: string;
  badgeColor: string;
  createdAt: number;
  decisionComment?: string;
}

const props = defineProps<{ id?: string; initialView?: ViewName; initialHistoryMode?: HistoryMode }>();
const router = useRouter();

const activeView = ref<ViewName>(props.initialView ?? "monitor");
const historyMode = ref<HistoryMode>(props.initialHistoryMode ?? "events");
const historyQuery = ref("");
const selectedHistoryStatus = ref("");
const selectedEventType = ref("");
const selectedTarget = ref("");
const historySortOrder = ref("newest");
const selectedEvent = ref<InventoryEvent | null>(null);
const selectedBatch = ref<Batch | null>(null);
const messageBatch = ref<Batch | null>(null);
const selectedServiceJob = ref<{ jobName: string; title: string } | null>(null);
const syncMonitorSection = ref<HTMLElement | null>(null);
const isViewActive = ref(false);
const inventoryEventFeedSaving = ref(false);

const PUBLISH_PENDING_SERVICE = "co.hotwax.sob.product.InventoryServices.publish#PendingShopifyInventoryAdjustments";
const EFFECTIVE_DATE_SERVICE = "co.hotwax.sob.product.InventoryServices.run#ShopifyInventoryEffectiveDateEvents";
const ABSOLUTE_CHANNEL_RESET_SERVICE = "co.hotwax.sob.product.InventoryServices.post#InventoryChannelInventory";
const PHYSICAL_RESET_MESSAGE_TYPE = "ResetInventoryQoh";

const syncContext = useShopifySyncContext(() => props.id);
const { jobs: cachedJobs, hydrated: jobsHydrated } = useServiceJobs();
const { records: cachedDataFeeds, hydrated: dataFeedsHydrated } = useCachedList<any>(dataFeedCache);
const { records: allInventoryChannels, hydrated: inventoryChannelsHydrated } = useCachedList<any>(inventoryChannelCache);
const { records: allInventoryDetails, hydrated: inventoryDetailsHydrated } = useCachedList<any>(shopifyInventoryAdjustmentDetailCache);
const { records: cachedSystemMessages } = useCachedList<any>(systemMessageCache);
const {
  start: startSyncDomains,
  stop: stopSyncDomains,
  ready: inventorySyncReady,
} = useCacheSync();

const inventoryChannels = computed(() => allInventoryChannels.value.filter((channel: any) =>
  String(channel.shopId) === String(props.id ?? "") && isEffectiveNow(channel, Date.now())));

const inventoryDetails = computed(() => allInventoryDetails.value.filter((detail: any) =>
  String(detail.shopId) === String(props.id ?? "")));

const inventoryEventFeed = computed<any>(() => cachedDataFeeds.value.find((feed: any) =>
  String(feed.dataFeedId) === SHOPIFY_INVENTORY_EVENT_FEED_ID) ?? null);
const inventoryEventFeedPush = computed(() =>
  inventoryEventFeed.value?.dataFeedTypeEnumId === SHOPIFY_INVENTORY_EVENT_FEED_PUSH);
const inventoryEventFeedTypeSupported = computed(() => [
  SHOPIFY_INVENTORY_EVENT_FEED_MANUAL,
  SHOPIFY_INVENTORY_EVENT_FEED_PUSH,
].includes(String(inventoryEventFeed.value?.dataFeedTypeEnumId ?? "")));
const inventoryEventFeedToggleDisabled = computed(() =>
  inventoryEventFeedSaving.value || !dataFeedsHydrated.value || !inventoryEventFeed.value ||
  !inventoryEventFeedTypeSupported.value);
const inventoryEventFeedStatus = computed(() => {
  if (!dataFeedsHydrated.value) return "Loading";
  if (!inventoryEventFeed.value) return "Not configured";
  if (inventoryEventFeedPush.value) return "Real-time push";
  if (inventoryEventFeed.value.dataFeedTypeEnumId === SHOPIFY_INVENTORY_EVENT_FEED_MANUAL) return "Manual";
  return "Unsupported mode";
});
const inventoryEventFeedBadgeColor = computed(() => {
  if (!dataFeedsHydrated.value || !inventoryEventFeed.value) return "medium";
  if (!inventoryEventFeedTypeSupported.value) return "danger";
  return inventoryEventFeedPush.value ? "success" : "warning";
});

const messageById = computed<Map<string, any>>(() => new Map(
  cachedSystemMessages.value.map((message: any) => [String(message.systemMessageId), message]),
));

const physicalResetJob = computed<any>(() => cachedJobs.value.find((job: any) => {
  const parameters = parameterMap(job);
  return parameters.systemMessageRemoteId === syncContext.remoteId.value &&
    parameters.systemMessageTypeId === PHYSICAL_RESET_MESSAGE_TYPE &&
    parameters.runAsBatch === "true";
}) ?? null);

const pendingPublisherJob = computed<any>(() =>
  cachedJobs.value.find((job: any) => job.serviceName === PUBLISH_PENDING_SERVICE) ?? null);

const effectiveDateJob = computed<any>(() =>
  cachedJobs.value.find((job: any) => job.serviceName === EFFECTIVE_DATE_SERVICE) ?? null);

const aggregateResetJobs = computed<any[]>(() => {
  const channelIds = new Set(inventoryChannels.value.map((channel: any) => String(channel.inventoryChannelId)));
  return cachedJobs.value.filter((job: any) =>
    job.serviceName === ABSOLUTE_CHANNEL_RESET_SERVICE &&
    channelIds.has(String(parameterMap(job).inventoryChannelId ?? "")));
});

const aggregateResetJobCount = computed(() => aggregateResetJobs.value.length);
const primaryAggregateResetJob = computed<any>(() =>
  nextExecutionFor(aggregateResetJobs.value) ?? aggregateResetJobs.value[0] ?? null);

const watchedJobNames = computed(() => [...new Set([
  physicalResetJob.value?.jobName,
  pendingPublisherJob.value?.jobName,
  effectiveDateJob.value?.jobName,
  ...aggregateResetJobs.value.map((job: any) => job.jobName),
].filter(Boolean))] as string[]);

const { runsFor } = useServiceJobRunsByJob(() => watchedJobNames.value, 5);

function latestRunFor(jobs: any[]): any | null {
  return jobs.flatMap((job) => runsFor(job.jobName))
    .sort((a: any, b: any) => toMillis(b.startTime) - toMillis(a.startTime))[0] ?? null;
}

function nextExecutionFor(jobs: any[]): any | null {
  return jobs.filter((job) => job.paused !== "Y" && job.nextExecutionDateTime)
    .sort((a, b) => toMillis(a.nextExecutionDateTime) - toMillis(b.nextExecutionDateTime))[0] ?? null;
}

const monitoredJobs = computed(() => {
  const definitions = [
    { name: "Publish and send aggregate event batches", jobs: pendingPublisherJob.value ? [pendingPublisherJob.value] : [], icon: cloudUploadOutline },
    { name: "Process effective-dated inventory changes", jobs: effectiveDateJob.value ? [effectiveDateJob.value] : [], icon: layersOutline },
    { name: "Reset physical location QOH", jobs: physicalResetJob.value ? [physicalResetJob.value] : [], icon: locationOutline },
    { name: "Reset aggregate ATP inventory", jobs: aggregateResetJobs.value, icon: refreshOutline },
  ];

  return definitions.map(({ name, jobs, icon }) => {
    const latestRun = latestRunFor(jobs);
    const nextJob = nextExecutionFor(jobs);
    const missing = !jobs.length;
    const paused = jobs.length > 0 && jobs.every((job) => job.paused === "Y");
    return {
      name,
      job: nextJob ?? jobs[0] ?? null,
      lastRun: latestRun?.startTime ? `Last run ${formatDateTime(latestRun.startTime)}` : "No cached runs",
      nextRun: nextJob ? `Next run ${formatDateTime(nextJob.nextExecutionDateTime)}` : "No active schedule",
      status: missing ? "Not configured" : paused ? "Paused" : "Active",
      badgeColor: missing ? "medium" : paused ? "warning" : "success",
      icon,
    };
  });
});

function projectRun(job: any, run: any, scope: string) {
  const failed = run.hasError === "Y";
  const running = !run.endTime;
  const configuredParameters = Object.entries(parameterMap(job))
    .map(([name, value]) => `${name}: ${value}`)
    .join(", ");
  return {
    id: run.jobRunId,
    parameters: run.parameters || configuredParameters || "No parameters recorded",
    scope,
    started: formatDateTime(run.startTime),
    duration: run.endTime ? `Ended ${formatDateTime(run.endTime)}` : "In progress",
    status: failed ? "Failed" : running ? "Running" : "Completed",
    badgeColor: failed ? "danger" : running ? "primary" : "success",
    result: run.results || run.messages || (failed
      ? (run.errors || "The job reported an error")
      : running ? "The job is still running" : "Completed without a job error"),
    failed,
    startTime: toMillis(run.startTime),
  };
}

const physicalResetRuns = computed(() => {
  const job = physicalResetJob.value;
  return job?.jobName
    ? runsFor(job.jobName).map((run: any) => projectRun(job, run, "Full physical location QOH reset"))
    : [];
});

const aggregateResetRuns = computed(() => aggregateResetJobs.value
  .flatMap((job: any) => runsFor(job.jobName).map((run: any) =>
    projectRun(job, run, "Full aggregate ATP reset")))
  .sort((a: any, b: any) => b.startTime - a.startTime));

function batchState(statusId?: string): { status: string; badgeColor: string } {
  switch (statusId) {
    case "SmsgProduced": return { status: "Queued", badgeColor: "primary" };
    case "SmsgSending": return { status: "Sending", badgeColor: "primary" };
    case "SmsgSent": return { status: "Sent", badgeColor: "success" };
    case "SmsgError": return { status: "Error", badgeColor: "danger" };
    default: return { status: "Assigned", badgeColor: "medium" };
  }
}

function targetLabel(detail: any): string {
  return detail.inventoryChannelDescription ||
    (detail.shopifyLocationId ? `Shopify location ${detail.shopifyLocationId}` : "Shopify aggregate location");
}

const batches = computed<Batch[]>(() => {
  const grouped = new Map<string, any[]>();
  for (const detail of inventoryDetails.value) {
    const id = String(detail.systemMessageId ?? "");
    if (!id) continue;
    grouped.set(id, [...(grouped.get(id) ?? []), detail]);
  }

  return [...grouped.entries()].map(([id, details]) => {
    const message = messageById.value.get(id);
    const statusId = message?.statusId || details[0]?.systemMessageStatusId;
    const state = batchState(statusId);
    const createdAt = toMillis(message?.initDate || details[0]?.systemMessageInitDate || details[0]?.createdDate);
    const net = details.reduce((total, detail) => total + Number(detail.computedInventoryChange || 0), 0);
    return {
      id,
      statusId,
      ...state,
      created: createdAt ? formatDateTime(createdAt) : "Unknown",
      createdAt,
      age: formatAge(createdAt),
      target: targetLabel(details[0]),
      eventCount: details.length,
      detail: `Net adjustment ${net > 0 ? "+" : ""}${net}`,
      messageText: message?.messageText,
    };
  }).sort((a, b) => b.createdAt - a.createdAt);
});

function eventState(detail: any): { status: string; badgeColor: string } {
  switch (detail.detailStatusId) {
    case "DETAIL_PENDING": return { status: "Unbatched", badgeColor: "warning" };
    case "DETAIL_NOOP": return { status: "No change", badgeColor: "medium" };
    case "DETAIL_ERROR": return { status: "Error", badgeColor: "danger" };
    case "DETAIL_ASSIGNED": {
      const messageStatus = messageById.value.get(String(detail.systemMessageId ?? ""))?.statusId ||
        detail.systemMessageStatusId;
      return batchState(messageStatus);
    }
    default: return { status: String(detail.detailStatusId || "Unknown"), badgeColor: "medium" };
  }
}

function eventType(eventKey: string): string {
  const code = eventKey.split(":", 1)[0].toUpperCase();
  const known: Record<string, string> = {
    RECEIPT: "Receipt",
    ISSUANCE: "POS issuance",
    POS_ISSUANCE: "POS issuance",
    RESERVATION: "Reservation",
    RESERVATION_CREATE: "Reservation",
    RESERVATION_RELEASE: "Reservation release",
    PRODUCT_FACILITY_AUDIT: "Minimum stock change",
    FACILITY_GROUP_MEMBER: "Facility group membership",
    INVENTORY_CHANNEL_AUDIT: "Inventory channel change",
  };
  return known[code] || code.toLowerCase().replaceAll("_", " ").replace(/^./, (value) => value.toUpperCase());
}

const inventoryEvents = computed<InventoryEvent[]>(() => inventoryDetails.value.map((detail: any) => {
  const state = eventState(detail);
  const change = Number(detail.computedInventoryChange || 0);
  const identity = [detail.eventKey, detail.shopId, detail.shopifyLocationId, detail.productId, detail.shopifyProductId];
  return {
    rowKey: JSON.stringify(identity.map(String)),
    key: String(detail.eventKey),
    type: eventType(String(detail.eventKey)),
    productId: String(detail.productId),
    productName: detail.internalName,
    facility: detail.inventoryChannelDescription || detail.facilityGroupId || detail.inventoryChannelId || "Inventory channel",
    target: targetLabel(detail),
    model: "Aggregate ATP",
    change: `${change > 0 ? "+" : ""}${change}`,
    batchId: detail.systemMessageId || undefined,
    ...state,
    createdAt: toMillis(detail.createdDate),
    decisionComment: detail.decisionComment,
  };
}).sort((a, b) => b.createdAt - a.createdAt));

const pendingEventCount = computed(() => inventoryDetails.value.filter((detail: any) =>
  detail.detailStatusId === "DETAIL_PENDING").length);
const pendingBatchCount = computed(() => batches.value.filter((batch) =>
  ["SmsgProduced", "SmsgSending", "SmsgError"].includes(String(batch.statusId))).length);
const oldestUnbatchedEvent = computed(() => {
  const oldest = inventoryEvents.value.filter((event) => event.status === "Unbatched")
    .sort((a, b) => a.createdAt - b.createdAt)[0];
  return oldest ? formatDateTime(oldest.createdAt) : "None waiting";
});

const nextBatchRun = computed(() => pendingPublisherJob.value?.nextExecutionDateTime
  ? formatDateTime(pendingPublisherJob.value.nextExecutionDateTime) : "Not scheduled");
const nextPhysicalReset = computed(() => physicalResetJob.value?.nextExecutionDateTime
  ? formatDateTime(physicalResetJob.value.nextExecutionDateTime) : "Not scheduled");
const nextAggregateReset = computed(() => {
  const job = nextExecutionFor(aggregateResetJobs.value);
  return job ? formatDateTime(job.nextExecutionDateTime) : "Not scheduled";
});
const scheduleHealth = computed(() => monitoredJobs.value.some((job) => job.status !== "Active")
  ? "Needs attention" : "Healthy");
const scheduleHealthColor = computed(() => scheduleHealth.value === "Healthy" ? "success" : "warning");

async function requestInventoryEventFeedChange(event: Event) {
  event.stopImmediatePropagation();
  if (inventoryEventFeedToggleDisabled.value) return;

  const enablePush = !inventoryEventFeedPush.value;
  const alert = await alertController.create({
    header: enablePush ? "Enable real-time inventory updates?" : "Switch inventory updates to manual?",
    message: enablePush
      ? "This affects every Shopify connection on this OMS. Make sure aggregate ATP is reconciled, then restart every OMS node after saving so Moqui registers the real-time feed."
      : "This affects every Shopify connection on this OMS. New real-time events may continue for up to 15 minutes while Moqui's feed cache expires.",
    buttons: [
      { text: "Cancel", role: "cancel" },
      { text: enablePush ? "Enable real-time push" : "Switch to manual", role: "confirm" },
    ],
  });
  await alert.present();
  const result = await alert.onDidDismiss();
  if (result.role !== "confirm") return;

  inventoryEventFeedSaving.value = true;
  try {
    await updateShopifyInventoryEventFeedType(
      enablePush ? SHOPIFY_INVENTORY_EVENT_FEED_PUSH : SHOPIFY_INVENTORY_EVENT_FEED_MANUAL,
    );
    commonUtil.showToast(enablePush
      ? "Inventory events set to real-time push. Restart every OMS node before relying on event capture."
      : "Inventory events set to manual. Cached routing may take up to 15 minutes to expire.");
  } catch (error) {
    logger.error("Failed to update Shopify inventory event feed", error);
    commonUtil.showToast("Failed to update the inventory event feed.");
  } finally {
    inventoryEventFeedSaving.value = false;
  }
}

function activeSyncDomains() {
  return [
    { name: "shopifyInventoryAdjustmentDetail", args: { shopId: String(props.id ?? ""), total: 500 } },
    ...(watchedJobNames.value.length
      ? [{ name: "serviceJobRun", args: { jobNames: watchedJobNames.value, total: 5 } }]
      : []),
  ];
}

watch(() => `${props.id ?? ""}|${watchedJobNames.value.join(",")}`, () => {
  if (isViewActive.value) void startSyncDomains(activeSyncDomains());
});
watch(() => props.initialView, (view) => { activeView.value = view ?? "monitor"; });
watch(() => props.initialHistoryMode, (mode) => { historyMode.value = mode ?? "events"; });

onIonViewWillEnter(() => {
  isViewActive.value = true;
  void startSyncDomains(activeSyncDomains());
});

onIonViewDidLeave(() => {
  isViewActive.value = false;
  stopSyncDomains();
});

const historyStatusOptions = computed(() => [...new Set(inventoryEvents.value.map((event) => event.status))]);
const eventTypeOptions = computed(() => [...new Set(inventoryEvents.value.map((event) => event.type))]);
const targetOptions = computed(() => [...new Set(inventoryEvents.value.map((event) => event.target))]);

const filteredEvents = computed(() => {
  const query = historyQuery.value.trim().toLowerCase();
  const events = inventoryEvents.value.filter((event) => {
    const matchesQuery = !query || [event.key, event.type, event.productId, event.productName,
      event.facility, event.target, event.model, event.batchId, event.status, event.decisionComment]
      .some((value) => String(value ?? "").toLowerCase().includes(query));
    return matchesQuery &&
      (!selectedHistoryStatus.value || event.status === selectedHistoryStatus.value) &&
      (!selectedEventType.value || event.type === selectedEventType.value) &&
      (!selectedTarget.value || event.target === selectedTarget.value);
  });
  return historySortOrder.value === "oldest" ? events.reverse() : events;
});

const batchGroups = computed(() => {
  const visibleEvents = filteredEvents.value;
  const unsent = visibleEvents.filter((event) => !event.batchId);
  return [
    {
      id: "unsent", title: "Unsent events", subtitle: "Calculated events waiting for the next batch",
      status: "Waiting", badgeColor: "warning", totalChange: formatNetAdjustment(unsent),
      icon: timeOutline, events: unsent,
    },
    ...batches.value.map((batch) => {
      const events = visibleEvents.filter((event) => event.batchId === batch.id);
      return {
        id: batch.id, title: batch.id, subtitle: `${batch.target} | ${batch.created}`,
        status: batch.status, badgeColor: batch.badgeColor, totalChange: formatNetAdjustment(events),
        icon: batch.status === "Error" ? warningOutline : checkmarkCircleOutline, events,
      };
    }),
  ].filter((group) => group.events.length);
});

const visibleBatchGroups = computed(() => batchGroups.value);
const eventsForSelectedBatch = computed(() => selectedBatch.value
  ? inventoryEvents.value.filter((event) => event.batchId === selectedBatch.value?.id) : []);

const messageText = computed(() => {
  const raw = messageBatch.value?.messageText;
  if (raw) {
    try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { return raw; }
  }
  return JSON.stringify({
    systemMessageId: messageBatch.value?.id,
    systemMessageTypeId: "ShopifyInventoryAdjustment",
    shopifyLocation: messageBatch.value?.target,
    eventCount: messageBatch.value?.eventCount,
    messageText: "The exact System Message payload is still loading.",
  }, null, 2);
});

function openMessage(batch: Batch) { messageBatch.value = batch; }
function openHistory(mode: HistoryMode = "events") {
  historyMode.value = mode;
  void router.push({
    path: `/shopify-connection-details/${props.id}/inventory-sync/history`,
    query: mode === "batches" ? { mode } : {},
  });
}

function openServiceJob(job: any, title: string) {
  if (!job?.jobName) return;
  selectedServiceJob.value = { jobName: String(job.jobName), title };
}

function openFirstScheduledJob() {
  const monitoredJob = monitoredJobs.value.find((job) => job.job);
  if (monitoredJob) openServiceJob(monitoredJob.job, monitoredJob.name);
  else syncMonitorSection.value?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function refreshServiceJobData() {
  if (isViewActive.value) void startSyncDomains(activeSyncDomains());
}

function formatNetAdjustment(events: InventoryEvent[]) {
  const netAdjustment = events.reduce((total, event) => total + Number(event.change), 0);
  return `Net adjustment ${netAdjustment > 0 ? "+" : ""}${netAdjustment}`;
}

function toMillis(value: unknown): number {
  if (value === undefined || value === null || value === "") return 0;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatAge(timestamp: number): string {
  if (!timestamp) return "Unknown age";
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
</script>

<style scoped>
.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 400px), 1fr));
  align-items: flex-start;
}

.summary-grid ion-card-header,
.run-carousel ion-card-header {
  position: relative;
  padding-inline-end: var(--spacer-2xl);
}

.summary-grid ion-card-header ion-buttons,
.run-carousel ion-card-header ion-badge {
  position: absolute;
  inset-block-start: var(--spacer-xs);
  inset-inline-end: var(--spacer-xs);
}

.sync-monitor > ion-item {
  margin-block-start: var(--spacer-sm);
}

.event-feed-settings > ion-item {
  margin-block-start: var(--spacer-sm);
}

.event-feed-setting ion-label {
  color: var(--ion-text-color);
  min-width: 0;
  white-space: normal;
}

.event-feed-setting {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--spacer-base);
}

.global-feed-scope {
  font-weight: 500;
}

.event-feed-control {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--spacer-sm);
  min-width: max-content;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  margin-block-start: var(--spacer-sm);
}

.section-header ion-item {
  flex: 1 1 min(100%, 375px);
  min-width: 0;
}

.run-carousel {
  display: flex;
  flex-wrap: nowrap;
  overflow-x: auto;
  align-items: flex-start;
  padding-block-end: var(--spacer-xs);
}

.run-carousel ion-card {
  flex: 0 0 min(375px, calc(100% - var(--spacer-sm)));
}

.run-carousel ion-label,
.summary-grid ion-label,
.sync-monitor ion-label {
  min-width: 0;
  white-space: normal;
}

.summary-grid ion-label[slot="end"] {
  max-width: 50%;
  text-align: end;
}

.history-page {
  padding-block-end: var(--spacer-lg);
}

.history-filter-card {
  margin-block-start: 0;
}

.filter-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--spacer-lg);
}

.filter-item {
  display: flex;
  align-items: center;
  min-width: 0;
}

.filter-item ion-select {
  flex: 1;
  min-width: 0;
}

.clear-filter-button {
  flex: 0 0 auto;
  margin-inline-start: var(--spacer-2xs);
}

.history-search {
  padding-inline: 0;
}

.history-results-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacer-sm);
  flex-wrap: wrap;
}

.history-results-header ion-item {
  flex: 1 1 min(100%, 520px);
  min-width: 0;
}

.history-mode {
  margin-block-end: var(--spacer-sm);
}

.event-table {
  display: grid;
  grid-template-columns: minmax(220px, 1.5fr) minmax(140px, 1fr) minmax(160px, 1fr) minmax(90px, 0.6fr) minmax(110px, 0.7fr) minmax(90px, 0.6fr) max-content;
  align-items: center;
  gap: var(--spacer-xs);
  padding: var(--spacer-sm);
}

.event-table-header,
.event-table-row {
  border-block-end: var(--border-medium);
}

.event-table-row:last-child {
  border-block-end: 0;
}

.event-table-row:hover {
  background: var(--ion-color-light);
}

.event-table ion-badge,
.event-status {
  justify-self: start;
}

.event-table-row > ion-label:first-child p {
  overflow-wrap: anywhere;
}

.batch-header {
  --columns-desktop: 4;
  --columns-tablet: 3;
  padding-inline-end: var(--spacer-sm);
  border-block-end: var(--border-medium);
}

.batch-header > ion-label {
  padding: var(--spacer-sm);
}

.batch-header ion-label,
.batch-header ion-item {
  min-width: 0;
}

.batch-header p,
.event-table-row p,
ion-modal p {
  overflow-wrap: anywhere;
}

.mobile-only {
  display: none;
}

@media screen and (max-width: 900px) {
  .summary-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .event-table-header {
    display: none;
  }

  .event-table-row {
    grid-template-columns: minmax(0, 1fr) max-content;
    gap: var(--spacer-sm);
  }

  .event-table-row > * {
    grid-column: 1;
  }

  .event-table-row > ion-button {
    grid-column: 2;
    grid-row: 1;
  }

  .event-status {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--spacer-2xs);
  }

  .mobile-only {
    display: block;
  }

  .batch-header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) max-content;
    justify-items: stretch;
    padding-inline-end: var(--spacer-lg);
  }

  .batch-header > * {
    display: unset;
  }

  .batch-header > ion-item:first-child {
    grid-column: 1;
    grid-row: 1;
  }

  .batch-header > ion-label {
    grid-column: 1;
    grid-row: 2;
    justify-self: start;
  }

  .batch-header > ion-badge {
    grid-column: 2;
    grid-row: 1;
    align-self: center;
  }

  .batch-header > span {
    display: none;
  }
}

@media screen and (max-width: 600px) {
  .filter-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--spacer-base);
  }

  .history-results-header {
    align-items: flex-start;
  }

  .section-header > ion-button {
    margin-inline-start: auto;
  }

  .summary-grid ion-item,
  .event-feed-settings ion-item,
  .sync-monitor ion-item,
  .run-carousel ion-item,
  ion-modal ion-item {
    --inner-padding-end: var(--spacer-xs);
  }

  .event-feed-setting {
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
  }

  .event-feed-control {
    grid-column: 1 / -1;
    width: 100%;
    margin-block-start: var(--spacer-xs);
  }
}
</style>
