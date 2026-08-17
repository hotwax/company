<template>
  <ion-page>
    <template v-if="activeView === 'monitor'">
      <ion-header>
        <ion-toolbar>
          <ion-buttons slot="start">
            <ion-back-button :default-href="`/shopify-connection-details/${props.id}`" />
          </ion-buttons>
          <!-- No Event history button: every row of the queue card below opens the same view, in the
               context that says which slice of it you are about to read. -->
          <ion-title>Inventory sync</ion-title>
        </ion-toolbar>
      </ion-header>

      <ion-content class="ion-padding-horizontal">
        <!-- A failed cache sync must never look like a healthy empty queue: without this the
             counts below render 0 / "None waiting" after the OMS rejects the query. -->
        <ion-card v-if="inventorySyncError" color="warning" class="sync-error-banner">
          <ion-card-content>
            <ion-icon :icon="warningOutline" />
            <ion-label>
              <h2>Inventory data could not be loaded from the OMS</h2>
              <p>{{ inventorySyncError }}</p>
              <p>The counts below are unavailable, not confirmed empty. Do not read them as "nothing pending".</p>
            </ion-label>
          </ion-card-content>
        </ion-card>

        <section class="summary-grid">
          <ion-card>
            <ion-card-header>
              <ion-card-title>Aggregate event queue</ion-card-title>
              <ion-card-subtitle>Inventory changes waiting to reach Shopify aggregate locations</ion-card-subtitle>
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
              <!-- Reads as queue state ("when does what is waiting go out?"), not as a way into the
                   publisher's config - that lives once, in Inventory sync jobs below. -->
              <ion-item>
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

          <!-- Sits beside the queue card rather than in a section of its own further down: the two
               answer the paired questions a monitor is opened for (what is waiting, and what will
               move it), and after the duplicate schedule card was removed each was left spanning a
               desktop width to hold four rows. `auto-fit` still stacks them on narrow screens. -->
          <ion-card>
            <ion-card-header>
              <ion-card-title>Inventory sync jobs</ion-card-title>
              <ion-card-subtitle>Schedules, recent runs, and current health</ion-card-subtitle>
              <!-- The rollup badge that used to head its own card. Every job's status is listed
                   below it, so this is the summary of the rows it sits on rather than a second
                   place to read the same schedules. -->
              <ion-badge :color="scheduleHealthColor">{{ scheduleHealth }}</ion-badge>
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
                <!-- Creates the row's missing job(s) PAUSED; activating is a second, deliberate step
                     in the row's own modal. Also shown beside a Paused/Active badge when a newer
                     channel still lacks its per-channel clone. -->
                <ion-button
                  v-if="job.setup"
                  slot="end"
                  fill="outline"
                  size="small"
                  :disabled="!!provisioningJobKind"
                  @click.stop="setUpSyncJob(job.setup, job.targetChannelId)"
                >
                  <ion-spinner v-if="provisioningJobKind === (job.targetChannelId ? `${job.setup}-${job.targetChannelId}` : job.setup)" name="crescent" />
                  <template v-else>{{ translate("Set up") }}</template>
                </ion-button>
                <ion-badge slot="end" :color="job.badgeColor">
                  {{ job.status }}
                </ion-badge>
              </ion-item>
            </ion-list>
          </ion-card>
        </section>

        <section class="inventory-channels">
          <ion-item lines="none">
            <ion-label>
              <h2>Inventory channels</h2>
              <p>Facility groups whose aggregated inventory is pushed to one Shopify location</p>
            </ion-label>
            <ion-button slot="end" fill="outline" size="small" @click="openChannelSetup()">
              <ion-icon slot="start" :icon="addOutline" />
              Set up channel
            </ion-button>
          </ion-item>

          <ion-card>
            <ion-list lines="full">
              <ion-item v-if="!inventoryChannels.length" lines="none">
                <ion-label class="ion-text-wrap">
                  <p>No inventory channels are mapped for this connection. Aggregate inventory
                     cannot be published until a facility group is mapped to a Shopify location.</p>
                </ion-label>
              </ion-item>
              <ion-item
                v-for="channel in inventoryChannels"
                :key="channel.inventoryChannelId"
                button
                detail
                @click="openChannelEdit(channel)"
              >
                <ion-icon :icon="layersOutline" slot="start" />
                <ion-label class="ion-text-wrap">
                  {{ channel.description || channel.facilityGroupName || channel.facilityGroupId }}
                  <p>{{ channelSubtitle(channel) }}</p>
                  <p>{{ channelResetJobSummary(channel) }}</p>
                </ion-label>
                <ion-button
                  slot="end"
                  fill="outline"
                  size="small"
                  @click.stop="openChannelResetJob(channel)"
                >
                  <ion-icon slot="start" :icon="timeOutline" />
                  {{ translate("Schedule reset") }}
                </ion-button>
                <ion-label slot="end" class="ion-text-end">
                  {{ channel.shopifyLocationId }}
                  <p>Shopify location</p>
                </ion-label>
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

          <!-- Its own card, above the OMS-wide one, because the two are read as the same switch the
               moment they share a list: this is `ShopifyShop.realTimeInventoryPush` for the ONE
               connection this page is scoped to, and the card below is a single OMS-wide DataFeed.
               Each names its own scope on its last line rather than relying on the order. -->
          <ion-card>
            <ion-list lines="none">
              <ion-item>
                <ion-icon slot="start" :icon="storefrontOutline" />
                <ion-label class="ion-text-wrap">
                  Real-time inventory push for this shop
                  <p>Sends inventory changes at this connection's mapped facilities straight to its Shopify locations as they happen</p>
                  <p>Applies only to {{ shopDisplayName }} &mdash; every other Shopify connection keeps its own setting</p>
                </ion-label>
                <ion-badge slot="end" :color="shopInventoryPushBadgeColor">
                  {{ shopInventoryPushStatus }}
                </ion-badge>
                <ion-toggle
                  slot="end"
                  :key="`shop-push-${shopInventoryPush}-${toggleNonce}`"
                  :aria-label="`Push real-time inventory updates to ${shopDisplayName}`"
                  :checked="shopInventoryPush"
                  :disabled="shopInventoryPushToggleDisabled"
                  @click.prevent="requestShopInventoryPushChange($event)"
                />
              </ion-item>
            </ion-list>
          </ion-card>

          <ion-card>
            <ion-list lines="none">
              <ion-item>
                <ion-icon slot="start" :icon="cloudUploadOutline" />
                <ion-label class="ion-text-wrap">
                  Inventory channel event updates
                  <p>Receipts, reservations, POS issuances, and inventory configuration changes</p>
                  <p>Applies to every Shopify connection on this OMS</p>
                </ion-label>
                <ion-badge slot="end" :color="inventoryEventFeedBadgeColor">
                  {{ inventoryEventFeedStatus }}
                </ion-badge>
                <ion-toggle
                  slot="end"
                  :key="`feed-${inventoryEventFeedPush}-${toggleNonce}`"
                  aria-label="Use real-time push for Shopify inventory events"
                  :checked="inventoryEventFeedPush"
                  :disabled="inventoryEventFeedToggleDisabled"
                  @click.prevent="requestInventoryEventFeedChange($event)"
                />
              </ion-item>
            </ion-list>
          </ion-card>

          <ion-card>
            <ion-card-header>
              <ion-card-title>Event sources</ion-card-title>
              <ion-card-subtitle>
                Which OMS changes this feed listens to. Turning one off stops that kind of inventory
                event being recorded at all.
              </ion-card-subtitle>
            </ion-card-header>
            <ion-list lines="full">
              <ion-item v-if="documentsLoading && !inventoryEventDocuments.length" lines="none">
                <ion-spinner name="crescent" />
              </ion-item>

              <ion-item v-else-if="documentsError" lines="none" role="alert">
                <ion-label class="ion-text-wrap">
                  Event sources unavailable
                  <p>{{ documentsError }}</p>
                </ion-label>
                <ion-button slot="end" fill="outline" @click="resyncEventDocuments()">Retry</ion-button>
              </ion-item>

              <ion-item v-for="doc in inventoryEventDocuments" :key="doc.dataDocumentId">
                <ion-label class="ion-text-wrap">
                  {{ doc.documentName }}
                  <p>{{ doc.primaryEntityName || doc.dataDocumentId }}</p>
                  <!-- A document the OMS has never heard of cannot be attached, and calling it
                       "off" would send someone hunting for a toggle that will not help. -->
                  <p v-if="doc.missing">Not loaded on this OMS &mdash; run the connector's seed data</p>
                </ion-label>
                <ion-toggle
                  slot="end"
                  :key="`${doc.dataDocumentId}-${doc.attached}-${toggleNonce}`"
                  :aria-label="`Feed events from ${doc.documentName}`"
                  :checked="doc.attached"
                  :disabled="doc.missing || savingDocumentId === doc.dataDocumentId"
                  @click.prevent="requestDocumentAttachChange(doc)"
                />
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
            <ion-button v-if="physicalResetJob" fill="clear" @click="openJobRuns(physicalResetJob, 'Reset physical location QOH')">
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
            <ion-button v-if="primaryAggregateResetJob" fill="clear" @click="openJobRuns(primaryAggregateResetJob, 'Reset aggregate ATP inventory')">
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
            <div ref="eventScrollerRef" class="event-scroller" @scroll.passive="onEventScroll">
            <div :style="{ height: `${eventTopSpacer}px` }" aria-hidden="true" />
            <div v-for="event in virtualEvents" :key="event.rowKey" data-virtual-row class="event-table event-table-row" role="row">
              <ion-label class="ion-text-wrap">
                <span class="overline mobile-only">Event</span>
                {{ event.type }}
                <p>{{ event.key }}</p>
              </ion-label>
              <ion-label class="ion-text-wrap">
                <span class="overline mobile-only">Shopify inventory item</span>
                {{ event.shopifyInventoryItem }}
                <p>{{ event.facility }}</p>
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
            <div :style="{ height: `${eventBottomSpacer}px` }" aria-hidden="true" />
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
                <ion-item
                  v-for="event in group.events.slice(0, shownInGroup(group.id))"
                  :key="event.rowKey"
                  button
                  detail
                  @click="selectedEvent = event"
                >
                  <ion-label class="ion-text-wrap">
                    {{ event.type }} for item {{ event.shopifyInventoryItem }}
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
                <ion-item v-if="group.events.length > shownInGroup(group.id)" lines="none">
                  <ion-label class="ion-text-wrap">
                    <p>Showing {{ shownInGroup(group.id) }} of {{ group.events.length }}</p>
                  </ion-label>
                  <ion-button slot="end" fill="outline" size="small" @click="loadMoreInGroup(group.id)">
                    Load more
                  </ion-button>
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
            <ion-label>Shopify inventory item<p>{{ selectedEvent?.shopifyInventoryItem || 'Unknown item' }}</p></ion-label>
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

          <!-- Why it has not landed. Without this a failed batch reads as merely "not sent yet". -->
          <template v-if="batchErrors.length">
            <ion-list-header>
              <ion-label>Delivery errors</ion-label>
            </ion-list-header>
            <ion-item v-for="(err, i) in batchErrors" :key="err.errorDate ?? i">
              <ion-icon :icon="warningOutline" slot="start" color="danger" />
              <ion-label class="ion-text-wrap">
                {{ err.errorText }}
                <p>Attempted {{ statusLabel(err.attemptedStatusId) }} · {{ formatDateTime(toMillis(err.errorDate)) }}</p>
              </ion-label>
            </ion-item>
          </template>
          <ion-item v-else-if="loadingBatchErrors" lines="none">
            <ion-spinner name="crescent" slot="start" />
            <ion-label>Checking delivery errors</ion-label>
          </ion-item>

          <ion-item lines="none">
            <ion-label class="ion-text-wrap">
              Resend this batch
              <p>Re-sends the same frozen payload and idempotency key, so Shopify cannot double-apply it</p>
            </ion-label>
            <ion-button slot="end" fill="outline" :disabled="resendingBatch" @click="resendBatch()">
              <ion-spinner v-if="resendingBatch" name="crescent" />
              <template v-else>
                <ion-icon slot="start" :icon="refreshOutline" />
                Resend
              </template>
            </ion-button>
          </ion-item>
          <ion-list-header>
            <ion-label>Event details</ion-label>
          </ion-list-header>
          <ion-item v-for="event in eventsForSelectedBatch" :key="event.rowKey">
            <ion-label class="ion-text-wrap">
              {{ event.type }} for item {{ event.shopifyInventoryItem }}
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

    <EditInventoryChannelModal
      :is-open="!!editingChannel"
      :channel="editingChannel"
      @updated="onChannelUpdated"
      @schedule-job="handleScheduleChannelJob"
      @close="editingChannel = null"
    />
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonAccordion, IonAccordionGroup, IonBackButton, IonBadge, IonButton, IonButtons, IonCard,
  IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonChip, IonContent,
  IonHeader, IonIcon, IonItem, IonLabel, IonList, IonListHeader, IonModal, IonNote,
  IonPage, IonSearchbar, IonSegment, IonSegmentButton, IonSelect, IonSelectOption, IonSpinner,
  IonTextarea, IonTitle, IonToggle, IonToolbar, alertController, modalController, onIonViewDidLeave,
  onIonViewWillEnter,
} from "@ionic/vue";
import {
  addOutline, checkmarkCircleOutline, chevronForwardOutline,
  closeCircleOutline, closeOutline, cloudUploadOutline, documentTextOutline,
  layersOutline, listOutline, locationOutline,
  refreshOutline, storefrontOutline, timeOutline, warningOutline,
} from "ionicons/icons";
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import cronstrue from "cronstrue";
import { commonUtil, logger, translate } from "@common";
import { useCacheSync } from "@/composables/useCacheSync";
import { resyncDomain } from "@/services/appCacheBootstrap";
import { useCachedList } from "@/composables/useCachedList";
import { useVirtualRows } from "@/composables/useVirtualRows";
import { useServiceJobRunsByJob, useServiceJobs } from "@/composables/useServiceJobs";
import { useStatuses } from "@/composables/useSeed";
import { useSystemMessage } from "@/composables/useSystemMessage";
import {
  SHOPIFY_INVENTORY_EVENT_FEED_ID,
  SHOPIFY_INVENTORY_EVENT_FEED_MANUAL,
  SHOPIFY_INVENTORY_EVENT_FEED_PUSH,
  ensureChannelEventPublisherJob,
  ensureChannelResetJob,
  ensureShopPhysicalInventoryResetJob,
  setInventoryEventDocumentAttached,
  useInventoryEventDocuments,
  updateShopifyInventoryEventFeedType,
  useShopifyShopMutations,
  useShopifySyncContext,
  type InventoryEventDocument,
} from "@/composables/useShopify";
import {
  dataFeedCache,
  inventoryChannelCache,
  shopifyInventoryAdjustmentDetailCache,
  shopifyShopCache,
  systemMessageCache,
} from "@/utils/cacheEntities";
import { isEffectiveNow } from "@/utils/cacheProjection";
import { formatDateTime } from "@/utils";
import { parameterMap } from "@/utils/serviceJob";
import ServiceJobDetailsModal from "@/components/common/ServiceJobDetailsModal.vue";
import SetupInventoryChannelModal from "@/components/shopify/SetupInventoryChannelModal.vue";
import EditInventoryChannelModal from "@/components/shopify/EditInventoryChannelModal.vue";

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
  /** The ledger's Shopify inventory item -- the detail row carries no OMS product. */
  shopifyInventoryItem: string;
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
const editingChannel = ref<any>(null);
const isViewActive = ref(false);
const inventoryEventFeedSaving = ref(false);
const shopInventoryPushSaving = ref(false);

// Both implementations of "publish this channel's pending events" are matched. The seeded job runs
// drain#, which repeats publish# until the channel's queue is empty; publish# stays a valid service a
// channel can be pointed at directly, and unreleased branches still carry clones on it. Matching only
// one silently drops the job out of this panel - it renders as "Not configured" with no schedule,
// which is exactly what happened when the seeded job moved from publish# to drain#.
const PUBLISH_PENDING_SERVICES = [
  "co.hotwax.sob.product.InventoryServices.drain#PendingShopifyInventoryAdjustments",
  "co.hotwax.sob.product.InventoryServices.publish#PendingShopifyInventoryAdjustments",
];
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
  error: inventorySyncError,
  afterMutation,
} = useCacheSync();

const { labelFor: statusDescriptionFor } = useStatuses();
const { ensureSystemMessageErrors, resendSystemMessage } = useSystemMessage();

const batchErrors = ref<any[]>([]);
const loadingBatchErrors = ref(false);
const resendingBatch = ref(false);

// Errors are class C - only failed messages have any - so they are fetched when a batch is opened.
watch(() => selectedBatch.value?.id, async (systemMessageId) => {
  batchErrors.value = [];
  if (!systemMessageId) return;
  loadingBatchErrors.value = true;
  try {
    batchErrors.value = await ensureSystemMessageErrors(String(systemMessageId));
  } catch (error) {
    logger.error("Could not load delivery errors for batch", systemMessageId, error);
  } finally {
    loadingBatchErrors.value = false;
  }
});

async function resendBatch() {
  const systemMessageId = selectedBatch.value?.id;
  if (!systemMessageId) return;
  resendingBatch.value = true;
  try {
    await resendSystemMessage(String(systemMessageId));
    commonUtil.showToast("Batch queued for another delivery attempt.");
    // Re-read the message so the badge reflects the new attempt, then reload its errors: a
    // failed retry appends a new SystemMessageError rather than replacing the old one.
    await afterMutation("systemMessage", { systemMessageId: String(systemMessageId) });
    batchErrors.value = await ensureSystemMessageErrors(String(systemMessageId));
  } catch (error: any) {
    logger.error("Failed to resend batch", systemMessageId, error);
    commonUtil.showToast(error?.message || "Could not resend this batch.");
  } finally {
    resendingBatch.value = false;
  }
}

const inventoryChannels = computed(() => allInventoryChannels.value.filter((channel: any) =>
  String(channel.shopId) === String(props.id ?? "") && isEffectiveNow(channel, Date.now())));

/**
 * Every channel this shop has ever had, expired ones included. Detail rows carry no shopId -- the
 * channel is the target identity -- so this is how the page scopes the ledger to one connection.
 * Effectiveness is deliberately NOT applied: an expired channel still owns its historical events,
 * and dropping it here would silently shrink history rather than mark it inactive.
 */
const shopChannelIds = computed(() => allInventoryChannels.value
  .filter((channel: any) => String(channel.shopId) === String(props.id ?? ""))
  .map((channel: any) => String(channel.inventoryChannelId))
  .filter(Boolean)
  .sort());

/**
 * Shops by id, for naming a channel's target and for this connection's own push gate. Cached table,
 * so no request per row and no extra fetch for the toggle below.
 */
const { records: allShopifyShops, hydrated: shopsHydrated } = useCachedList<any>(shopifyShopCache);
const shopsById = computed<Record<string, any>>(() =>
  allShopifyShops.value.reduce((map: Record<string, any>, shop: any) => {
    map[String(shop.shopId)] = shop;
    return map;
  }, {}));

const inventoryDetails = computed(() => {
  const scope = new Set(shopChannelIds.value);
  return allInventoryDetails.value.filter((detail: any) =>
    scope.has(String(detail.inventoryChannelId)));
});

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

/**
 * The PER-SHOP half of real-time inventory, and a different switch from the feed above in every way
 * that matters. This is `ShopifyShop.realTimeInventoryPush` for the one connection this page is
 * scoped to: the connector filters on it in find#EligibleRealtimeInventoryPushShops, the direct
 * facility-to-Shopify-location path, so turning it off silences THIS shop and no other. The feed is
 * one OMS-wide DataFeed deciding whether aggregate channel events are recorded for anybody.
 *
 * Read from the shop row this page already caches rather than fetching: `updateShop` re-reads that
 * row on success, so what renders here is what the OMS stored, not what was clicked.
 */
const currentShop = computed<any>(() => shopsById.value[String(props.id ?? "")] ?? null);
const shopDisplayName = computed(() =>
  currentShop.value?.name || currentShop.value?.myshopifyDomain || "this connection");
const shopInventoryPush = computed(() => String(currentShop.value?.realTimeInventoryPush ?? "") === "Y");
const shopInventoryPushToggleDisabled = computed(() =>
  shopInventoryPushSaving.value || !shopsHydrated.value || !currentShop.value);
const shopInventoryPushStatus = computed(() => {
  if (!shopsHydrated.value) return "Loading";
  // Not "Off": an uncached shop row is a state nobody can read a setting out of, and rendering it as
  // off would invite someone to "fix" a shop that is already pushing.
  if (!currentShop.value) return "Unavailable";
  return shopInventoryPush.value ? "Real-time push" : "Disabled";
});
const shopInventoryPushBadgeColor = computed(() => {
  if (!shopsHydrated.value || !currentShop.value) return "medium";
  return shopInventoryPush.value ? "success" : "warning";
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

// Match on serviceName AND the inventoryChannelId parameter, the way aggregateResetJobs does.
// serviceName alone also matches the seeded template (paused, no channel) and any other channel's
// clone, so the panel could report the template's paused state as if a channel were configured.
// A LIST, not a find: publishing is per channel, so with two channels this row is the set of their
// clones — reporting only the first would hide that the second channel never publishes.
const pendingPublisherJobs = computed<any[]>(() => {
  const channelIds = new Set(inventoryChannels.value.map((channel: any) => String(channel.inventoryChannelId)));
  return cachedJobs.value.filter((job: any) =>
    PUBLISH_PENDING_SERVICES.includes(job.serviceName) &&
    channelIds.has(String(parameterMap(job).inventoryChannelId ?? "")));
});

const effectiveDateJob = computed<any>(() =>
  cachedJobs.value.find((job: any) => job.serviceName === EFFECTIVE_DATE_SERVICE) ?? null);

const aggregateResetJobs = computed<any[]>(() => {
  const channelIds = new Set(inventoryChannels.value.map((channel: any) => String(channel.inventoryChannelId)));
  return cachedJobs.value.filter((job: any) =>
    job.serviceName === ABSOLUTE_CHANNEL_RESET_SERVICE &&
    channelIds.has(String(parameterMap(job).inventoryChannelId ?? "")));
});

const primaryAggregateResetJob = computed<any>(() =>
  nextExecutionFor(aggregateResetJobs.value) ?? aggregateResetJobs.value[0] ?? null);

const watchedJobNames = computed(() => [...new Set([
  physicalResetJob.value?.jobName,
  effectiveDateJob.value?.jobName,
  ...pendingPublisherJobs.value.map((job: any) => job.jobName),
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

type JobSetupKind = "publisher" | "aggregateReset" | "physicalReset";

/**
 * The channels a per-channel job list does NOT cover yet. Setup must know WHICH channels are
 * uncovered, not merely that some job exists: a channel added after the first was provisioned still
 * needs its own publisher and reset clones, and "the row has a job" would hide that forever.
 */
function channelIdsWithoutJob(jobs: any[]): string[] {
  const covered = new Set(jobs.map((job: any) => String(parameterMap(job).inventoryChannelId ?? "")));
  return inventoryChannels.value
    .map((channel: any) => String(channel.inventoryChannelId))
    .filter((channelId: string) => !covered.has(channelId));
}

function findChannelResetJob(channelId: string) {
  const targetId = String(channelId);
  return cachedJobs.value.find((job: any) =>
    job.serviceName === ABSOLUTE_CHANNEL_RESET_SERVICE &&
    String(parameterMap(job).inventoryChannelId ?? "") === targetId)
    || cachedJobs.value.find((job: any) =>
      job.serviceName === ABSOLUTE_CHANNEL_RESET_SERVICE &&
      job.jobName === `reset_InventoryChannelInventory_${targetId}`)
    || cachedJobs.value.find((job: any) =>
      job.jobName === `reset_InventoryChannelInventory_${targetId}`)
    || null;
}

function channelResetJobSummary(channel: any): string {
  const job = findChannelResetJob(channel.inventoryChannelId);
  if (!job) return translate("Reset job: Not configured");
  if (job.paused === "Y") return translate("Reset job: Paused");
  if (job.nextExecutionDateTime) {
    return `${translate("Reset job:")} ${translate("Next run")} ${formatDateTime(job.nextExecutionDateTime)}`;
  }
  if (job.cronExpression) {
    try {
      return `${translate("Reset job:")} ${cronstrue.toString(job.cronExpression)}`;
    } catch {
      return `${translate("Reset job:")} ${job.cronExpression}`;
    }
  }
  return translate("Reset job: Active");
}

const monitoredJobs = computed(() => {
  // `setup` is the row's create-the-missing-clone action, empty when there is nothing this page can
  // honestly create: the per-channel rows need a channel to clone for (creating one is the "Set up
  // channel" button's job), the physical reset needs the shop's SystemMessageRemote resolved, and
  // the effective-date scanner is seeded by the connector release — its absence is a deploy gap the
  // app must report, not paper over by inventing a job definition.
  const definitions: Array<{
    name: string;
    jobs: any[];
    icon: string;
    setup: JobSetupKind | "";
    targetChannelId?: string;
  }> = [
    {
      name: "Publish and send aggregate event batches", jobs: pendingPublisherJobs.value, icon: cloudUploadOutline,
      setup: channelIdsWithoutJob(pendingPublisherJobs.value).length ? "publisher" : "",
    },
    {
      name: "Process effective-dated inventory changes", jobs: effectiveDateJob.value ? [effectiveDateJob.value] : [], icon: layersOutline,
      setup: "",
    },
    {
      name: "Reset physical location QOH", jobs: physicalResetJob.value ? [physicalResetJob.value] : [], icon: locationOutline,
      setup: !physicalResetJob.value && syncContext.remoteId.value ? "physicalReset" : "",
    },
  ];

  if (!inventoryChannels.value.length) {
    definitions.push({
      name: "Reset aggregate ATP inventory",
      jobs: aggregateResetJobs.value,
      icon: refreshOutline,
      setup: "",
    });
  } else {
    for (const channel of inventoryChannels.value) {
      const channelId = String(channel.inventoryChannelId);
      const channelName = channel.facilityGroupName || channel.description || channelId;
      const job = findChannelResetJob(channelId);
      definitions.push({
        name: `${translate("Reset aggregate ATP")} (${channelName})`,
        jobs: job ? [job] : [],
        icon: refreshOutline,
        setup: !job ? "aggregateReset" : "",
        targetChannelId: channelId,
      });
    }
  }

  return definitions.map(({ name, jobs, icon, setup, targetChannelId }) => {
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
      setup,
      targetChannelId,
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

/**
 * Colour stays a UI decision, but the LABEL comes from the StatusItem description the OMS actually
 * ships. Hardcoding it meant the screen said "Queued" for SmsgProduced while every other HotWax
 * surface said something else, and it silently mislabelled any status not in this list.
 */
function batchState(statusId?: string): { status: string; badgeColor: string } {
  const badgeColor = statusId === "SmsgSent" ? "success"
    : statusId === "SmsgError" ? "danger"
    : statusId === "SmsgProduced" || statusId === "SmsgSending" ? "primary"
    : "medium";
  return { status: statusLabel(statusId), badgeColor };
}

/** StatusItem description, falling back to the raw id rather than inventing a label. */
function statusLabel(statusId?: string): string {
  if (!statusId) return "Assigned";
  return statusDescriptionFor(statusId) || statusId;
}

function targetLabel(detail: any): string {
  // The Shopify location lives on the channel, not the detail row, so fall back through the
  // cached channel before giving up on a generic label.
  const channel = allInventoryChannels.value.find((candidate: any) =>
    String(candidate.inventoryChannelId) === String(detail.inventoryChannelId));
  return detail.inventoryChannelDescription || channel?.description ||
    (channel?.shopifyLocationId ? `Shopify location ${channel.shopifyLocationId}` : "Shopify aggregate location");
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

/**
 * The server owns this label. `eventTypeDescription` is joined from ShopifyInventoryEventType --
 * the closed vocabulary the ledger's EVENT_TYPE_ID is foreign-keyed to -- so it is always present
 * and always in step with the types the connector actually emits. The fallback only prettifies the
 * id, and exists for a row whose type row was somehow not joined; it is not a mapping table,
 * because a client-side copy of that vocabulary is exactly what drifts.
 */
function eventTypeLabel(detail: any): string {
  const description = String(detail?.eventTypeDescription ?? "").trim();
  if (description) return description;
  return String(detail?.eventTypeId ?? "")
    .toLowerCase().replaceAll("_", " ").replace(/^./, (value) => value.toUpperCase());
}

const inventoryEvents = computed<InventoryEvent[]>(() => inventoryDetails.value.map((detail: any) => {
  const state = eventState(detail);
  const change = Number(detail.computedInventoryChange || 0);
  // Same identity as the server PK and the cache key: event type + reference + channel + item.
  const identity = [
    detail.eventTypeId,
    detail.eventReferenceId,
    detail.inventoryChannelId,
    detail.shopifyInventoryItemId,
  ];
  return {
    rowKey: JSON.stringify(identity.map(String)),
    key: `${String(detail.eventTypeId ?? "")}:${String(detail.eventReferenceId ?? "")}`,
    type: eventTypeLabel(detail),
    // The ledger identifies a Shopify inventory item, not an OMS product, and nothing cached here
    // maps one to the other. Show the item id -- the row's real identity -- rather than resolving a
    // product through a join this screen does not have.
    shopifyInventoryItem: String(detail.shopifyInventoryItemId ?? ""),
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

// Only an unpaused clone's next fire time is a promise; a paused clone's stored
// nextExecutionDateTime is a time at which nothing will happen.
const nextBatchRun = computed(() => {
  const nextRun = nextExecutionFor(pendingPublisherJobs.value)?.nextExecutionDateTime;
  return nextRun ? formatDateTime(nextRun) : "Not scheduled";
});
const scheduleHealth = computed(() => monitoredJobs.value.some((job) => job.status !== "Active")
  ? "Needs attention" : "Healthy");
const scheduleHealthColor = computed(() => scheduleHealth.value === "Healthy" ? "success" : "warning");

// ----- Event sources: which DataDocuments this feed listens to -----
// Cached like every other reference table: config that rarely moves, read on every entry, and kept
// truthful after a change by the domain's write-through rather than by re-fetching here.
const { documents: inventoryEventDocuments, hydrated: documentsHydrated } = useInventoryEventDocuments();
const documentsError = ref("");
const savingDocumentId = ref("");
const documentsLoading = computed(() => !documentsHydrated.value);

/** Re-snapshot the domain. The read path is the cache, so "retry" means refill it, not re-fetch here. */
async function resyncEventDocuments() {
  documentsError.value = "";
  try {
    await resyncDomain("inventoryEventDocument");
  } catch (error: any) {
    documentsError.value = error?.message || "The OMS did not return its data documents.";
  }
}

/**
 * Bumped whenever a toggle must be redrawn from stored state rather than from the click.
 *
 * `@click.prevent` stops the default but NOT ion-toggle flipping its own internal checked state, so
 * a cancelled confirm - or a failed write - leaves the control showing a value the server never took.
 * Writing `checked` back on the element races Ionic's own update; including this in the toggle's
 * `key` makes Vue discard and rebuild it instead, which can only render the bound value. Observed
 * live before this: a document reading off while the server had it attached.
 */
const toggleNonce = ref(0);
const redrawToggles = () => { toggleNonce.value += 1; };

/**
 * Turning a source off is destructive in a way a toggle does not look: it stops that class of event
 * being RECORDED, so nothing accumulates to replay once it goes back on. Confirm before, and say that
 * the change is not instant - Moqui reads this through a cached query.
 */
async function requestDocumentAttachChange(doc: InventoryEventDocument) {
  if (doc.missing || savingDocumentId.value) {
    redrawToggles();
    return;
  }
  const attaching = !doc.attached;

  const alert = await alertController.create({
    header: attaching ? `Listen to ${doc.documentName}?` : `Stop listening to ${doc.documentName}?`,
    message: attaching
      ? "New changes of this kind will start producing inventory events. Changes made while it was off were not recorded and will not be replayed; run a full aggregate ATP reset to reconcile."
      : "Changes of this kind stop producing inventory events entirely, and nothing accumulates to catch up on later. Shopify keeps whatever quantity it already has until a full aggregate ATP reset corrects it.",
    buttons: [
      { text: "Cancel", role: "cancel" },
      { text: attaching ? "Start listening" : "Stop listening", role: "confirm" },
    ],
  });
  await alert.present();
  if ((await alert.onDidDismiss()).role !== "confirm") {
    redrawToggles();
    return;
  }

  savingDocumentId.value = doc.dataDocumentId;
  try {
    // The composable's list updates from the cache write-through inside this call.
    await setInventoryEventDocumentAttached(doc.dataDocumentId, attaching);
    commonUtil.showToast(attaching
      ? "Event source enabled. It can take a few minutes to take effect."
      : "Event source disabled. Events already recorded are unaffected.");
  } catch (error: any) {
    commonUtil.showToast(error?.message || "Failed to update the event source.");
  } finally {
    savingDocumentId.value = "";
    // The list was re-read above on success and left untouched on failure, so a redraw shows what is
    // actually stored either way rather than what was clicked.
    redrawToggles();
  }
}

async function requestInventoryEventFeedChange(event: Event) {
  event.stopImmediatePropagation();
  if (inventoryEventFeedToggleDisabled.value) {
    redrawToggles();
    return;
  }

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
  if (result.role !== "confirm") {
    redrawToggles();
    return;
  }

  inventoryEventFeedSaving.value = true;
  try {
    await updateShopifyInventoryEventFeedType(
      enablePush ? SHOPIFY_INVENTORY_EVENT_FEED_PUSH : SHOPIFY_INVENTORY_EVENT_FEED_MANUAL,
    );
    // The feed domain only syncs once per login, so without this re-read the toggle keeps
    // rendering the pre-save mode for the rest of the session.
    await afterMutation("shopifyInventoryEventFeed", { dataFeedId: SHOPIFY_INVENTORY_EVENT_FEED_ID });
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

/**
 * Flip this connection's push gate. Confirmed first because turning it off queues NOTHING: an
 * ineligible shop is skipped in the resolver and the delta is dropped there, so there is no backlog
 * to drain when it goes back on - only the physical location QOH reset (listed above) closes the gap.
 */
async function requestShopInventoryPushChange(event: Event) {
  event.stopImmediatePropagation();
  if (shopInventoryPushToggleDisabled.value) {
    redrawToggles();
    return;
  }

  const shopId = String(props.id ?? "");
  const enablePush = !shopInventoryPush.value;
  const alert = await alertController.create({
    header: enablePush
      ? `Push real-time inventory to ${shopDisplayName.value}?`
      : `Stop pushing real-time inventory to ${shopDisplayName.value}?`,
    message: enablePush
      ? "Only this Shopify connection is affected. Inventory that moved while it was off was never sent and will not be replayed; run the physical location QOH reset to reconcile."
      : "Only this Shopify connection is affected. Inventory changes stop reaching its Shopify locations entirely, and nothing accumulates to catch up on later. Shopify keeps whatever quantity it already has until a physical location QOH reset corrects it.",
    buttons: [
      { text: "Cancel", role: "cancel" },
      { text: enablePush ? "Enable real-time push" : "Turn off real-time push", role: "confirm" },
    ],
  });
  await alert.present();
  if ((await alert.onDidDismiss()).role !== "confirm") {
    redrawToggles();
    return;
  }

  shopInventoryPushSaving.value = true;
  try {
    // `updateShop` re-reads the shop by PK into the cache on success, so the row this toggle renders
    // from becomes the stored one. It reports a rejected write in the RESPONSE rather than throwing,
    // so an unchecked 200 is exactly how a toggle ends up showing a value the OMS never took.
    const resp: any = await useShopifyShopMutations(shopId).updateShop({
      realTimeInventoryPush: enablePush ? "Y" : "N",
    });
    if (commonUtil.hasError(resp)) throw new Error("The OMS rejected the real-time inventory push update.");
    commonUtil.showToast(enablePush
      ? "Real-time inventory push enabled for this connection. Run a physical location QOH reset if stock moved while it was off."
      : "Real-time inventory push disabled for this connection. Quantities already in Shopify are unaffected.");
  } catch (error: any) {
    logger.error("Failed to update real-time inventory push for shop", shopId, error);
    commonUtil.showToast(error?.message || "Failed to update real-time inventory push for this connection.");
  } finally {
    shopInventoryPushSaving.value = false;
    // The shop row was re-read above on success and left untouched on failure, so a redraw shows what
    // is actually stored either way rather than what was clicked.
    redrawToggles();
  }
}

function activeSyncDomains() {
  return [
    // Skipped entirely until the channels are known: with no channel list the domain cannot tell
    // "this shop has no channels" from "read every shop", so it must not run.
    ...(shopChannelIds.value.length
      ? [{
        name: "shopifyInventoryAdjustmentDetail",
        args: { inventoryChannelIds: shopChannelIds.value, total: 500 },
      }]
      : []),
    ...(watchedJobNames.value.length
      ? [{ name: "serviceJobRun", args: { jobNames: watchedJobNames.value, total: 5 } }]
      : []),
  ];
}

// Channels are cached asynchronously, so the detail domain is usually skipped on first pass and
// starts here once they land.
watch(() => `${props.id ?? ""}|${watchedJobNames.value.join(",")}|${shopChannelIds.value.join(",")}`, () => {
  if (isViewActive.value) void startSyncDomains(activeSyncDomains());
});
watch(() => props.initialView, (view) => { activeView.value = view ?? "monitor"; });
watch(() => props.initialHistoryMode, (mode) => { historyMode.value = mode ?? "events"; });

onIonViewWillEnter(() => {
  isViewActive.value = true;
  void startSyncDomains(activeSyncDomains());
  // The feed domain is gated to one sync per login, so a mode changed from anywhere else stays
  // stale here for the whole session. This page owns the toggle, so it re-reads the row on entry.
  void afterMutation("shopifyInventoryEventFeed", { dataFeedId: SHOPIFY_INVENTORY_EVENT_FEED_ID });
  // Same gate on the shop domain, and the same reason: this page renders the connection's push flag,
  // which the Moqui admin screen can also change. Skipped without an id - the by-PK read would go to
  // `oms/shopifyShops/shops/` and re-list every shop.
  if (props.id) void afterMutation("shopifyShop", { shopId: String(props.id) });
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
    const matchesQuery = !query || [event.key, event.type, event.shopifyInventoryItem,
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

/**
 * Only the rows near the viewport get DOM nodes. The history can hold tens of thousands of events,
 * and rendering one row each is what made this page slow to open.
 */
const {
  containerRef: eventScrollerRef,
  visibleItems: virtualEvents,
  topSpacer: eventTopSpacer,
  bottomSpacer: eventBottomSpacer,
  onScroll: onEventScroll,
  scrollToTop: scrollEventsToTop,
} = useVirtualRows(filteredEvents, { estimatedRowHeight: 56 });

/**
 * A collapsed ion-accordion still renders its content, so a batch of thousands of events cost the
 * whole page even unopened. Each group starts at GROUP_PAGE_SIZE and grows only when asked.
 */
const GROUP_PAGE_SIZE = 10;
const groupShownCounts = ref<Record<string, number>>({});

function shownInGroup(groupId: string): number {
  return groupShownCounts.value[groupId] ?? GROUP_PAGE_SIZE;
}

function loadMoreInGroup(groupId: string) {
  groupShownCounts.value = {
    ...groupShownCounts.value,
    [groupId]: shownInGroup(groupId) + GROUP_PAGE_SIZE,
  };
}

// A narrower filter should not leave a group expanded to a count the operator chose for the old,
// larger set; and the flat list should start at the top of the new results rather than mid-scroll.
// Watch the filter inputs rather than filteredEvents: that array is rebuilt whenever a background
// cache sync lands, which would otherwise throw away the reader's place and their loaded rows.
watch(
  [historyQuery, selectedHistoryStatus, selectedEventType, selectedTarget, historySortOrder],
  () => {
    groupShownCounts.value = {};
    scrollEventsToTop();
  },
);
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

async function openChannelSetup() {
  const modal = await modalController.create({
    component: SetupInventoryChannelModal,
    componentProps: { shopId: String(props.id ?? "") },
  });
  await modal.present();
  const { data } = await modal.onDidDismiss();
  // The channel drives which reset jobs belong to this connection, so pull both domains again
  // rather than waiting for the next scheduled sync pass.
  if (data?.created) await startSyncDomains(activeSyncDomains());
}

/**
 * "Online Facility Group · HC Demo" - what the channel maps, in the names people use for those two
 * things rather than their ids.
 *
 * Both halves are already cached: facilityGroupName rides along on the channel row, and the shop's
 * name comes from the shop table this page is scoped to, so this is a local read and not a fetch per
 * row. Falls back to the id on either side rather than rendering a bare separator, which is what a
 * shop whose row has not landed yet would otherwise produce.
 */
function channelSubtitle(channel: any): string {
  const groupLabel = channel?.facilityGroupName || channel?.facilityGroupId || "";
  const shop = shopsById.value[String(channel?.shopId ?? "")];
  const shopLabel = shop?.name || shop?.myshopifyDomain || channel?.shopId || "";
  return [groupLabel, shopLabel].filter(Boolean).join(" · ");
}

function openChannelEdit(channel: any) {
  editingChannel.value = channel;
}

async function openChannelResetJob(channel: any) {
  if (!channel?.inventoryChannelId) return;
  const channelId = String(channel.inventoryChannelId);
  const channelName = channel.facilityGroupName || channel.description || channelId;
  let job = findChannelResetJob(channelId);
  if (!job) {
    try {
      const jobName = await ensureChannelResetJob({
        inventoryChannelId: channelId,
        description: `Full aggregate ATP reset for ${channelName}`,
      });
      refreshServiceJobData();
      selectedServiceJob.value = {
        jobName,
        title: `${translate("Reset aggregate ATP")} - ${channelName}`,
      };
      return;
    } catch (error: any) {
      logger.error("Failed to create aggregate reset job for channel", channelId, error);
      commonUtil.showToast(error?.message || translate("Failed to set up aggregate reset job."));
      return;
    }
  }
  selectedServiceJob.value = {
    jobName: String(job.jobName),
    title: `${translate("Reset aggregate ATP")} - ${channelName}`,
  };
}

function handleScheduleChannelJob(payload: { jobName: string; title: string }) {
  editingChannel.value = null;
  selectedServiceJob.value = payload;
}

async function onChannelUpdated() {
  // Changing the location changes what the reset jobs target, so re-read rather than waiting for the
  // next scheduled pass.
  await startSyncDomains(activeSyncDomains());
}

/** The one way into a job's configuration - from its row in Inventory sync jobs. */
function openServiceJob(job: any, title: string) {
  if (!job?.jobName) return;
  selectedServiceJob.value = { jobName: String(job.jobName), title };
}

/** "View all runs" goes to the full history page, which is what it says. */
function openJobRuns(job: any, title: string) {
  if (!job?.jobName) return;
  router.push({
    name: "ShopifyInventoryJobRuns",
    params: { id: props.id, jobName: String(job.jobName) },
    query: { title },
  });
}

function refreshServiceJobData() {
  if (isViewActive.value) void startSyncDomains(activeSyncDomains());
}

const provisioningJobKind = ref<JobSetupKind | "">("");

/**
 * Create a row's missing job(s), PAUSED — activation stays a deliberate second step in the job's own
 * modal, per the connector release runbook. The per-channel kinds provision EVERY effective channel
 * still missing its clone, not only the first: this is also the recovery path when a channel was
 * created but its job provisioning failed, which otherwise left no way to finish the setup from the
 * app at all. The ensure* helpers are idempotent and write the new row through to the job cache, so
 * the row flips from "Not configured" to "Paused" without a re-login.
 */
async function setUpSyncJob(kind: JobSetupKind | "", targetChannelId?: string) {
  if (!kind || provisioningJobKind.value) return;
  const provisioningKey = targetChannelId ? `${kind}-${targetChannelId}` : kind;
  provisioningJobKind.value = provisioningKey as JobSetupKind;
  try {
    const created: string[] = [];
    if (kind === "physicalReset") {
      const remoteId = String(syncContext.remoteId.value ?? "");
      if (!remoteId) throw new Error("No Shopify remote is configured for this connection.");
      created.push(await ensureShopPhysicalInventoryResetJob({ systemMessageRemoteId: remoteId }));
    } else {
      // Snapshot the uncovered channels first: each ensure* refreshes the job cache, which would
      // otherwise recompute the list mid-loop.
      const targetIds = targetChannelId
        ? [targetChannelId]
        : channelIdsWithoutJob(kind === "publisher" ? pendingPublisherJobs.value : aggregateResetJobs.value);
      for (const channelId of targetIds) {
        const channel = inventoryChannels.value.find((c: any) => String(c.inventoryChannelId) === String(channelId));
        const desc = channel ? `Full aggregate ATP reset for ${channel.facilityGroupName || channel.description || channelId}` : undefined;
        created.push(kind === "publisher"
          ? await ensureChannelEventPublisherJob(channelId)
          : await ensureChannelResetJob({ inventoryChannelId: channelId, description: desc }));
      }
    }
    commonUtil.showToast(!created.length
      ? "Nothing to create - these jobs already exist."
      : created.length === 1
        ? `${created[0]} created, paused. Open the row to set its schedule and activate it.`
        : `${created.length} jobs created, paused. Open each row entry to schedule and activate them.`);
    refreshServiceJobData();
  } catch (error: any) {
    logger.error("Failed to set up inventory sync job", kind, error);
    commonUtil.showToast(error?.message || "The job could not be created.");
  } finally {
    provisioningJobKind.value = "";
  }
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

/* ion-badge fills its line inside a card header, so without the summary-grid selector here the
   health rollup rendered as a full-width bar across the card instead of a chip in its corner. */
.summary-grid ion-card-header ion-buttons,
.summary-grid ion-card-header ion-badge,
.run-carousel ion-card-header ion-badge {
  position: absolute;
  inset-block-start: var(--spacer-xs);
  inset-inline-end: var(--spacer-xs);
}

.event-feed-settings > ion-item {
  margin-block-start: var(--spacer-sm);
}

.sync-error-banner ion-card-content {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  gap: var(--spacer-base);
}

.sync-error-banner ion-label {
  min-width: 0;
  white-space: normal;
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
.summary-grid ion-label {
  min-width: 0;
  white-space: normal;
}

.summary-grid ion-label[slot="end"] {
  max-width: 50%;
  text-align: end;
}

/* The page owns the vertical rhythm. Before this the stack mixed three sources - Ionic's default
   card margin, an ad-hoc margin on the segment, and nothing at all elsewhere - which left the
   filter card flush against the toolbar and the segment flush against the results header. */
.history-page {
  display: flex;
  flex-direction: column;
  gap: var(--spacer-sm);
  padding-block: var(--spacer-sm) var(--spacer-lg);
}

/* Cards keep their horizontal margin; the flex gap above owns the spacing between them. */
.history-page > ion-card {
  margin-block: 0;
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
  margin-block-end: 0;
}

/* The virtualised rows scroll inside this box rather than the page, so the window maths has a
   viewport to measure against. The column header above it stays put while the rows move. */
.event-scroller {
  max-block-size: 70vh;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
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
  .run-carousel ion-item,
  ion-modal ion-item {
    --inner-padding-end: var(--spacer-xs);
  }

}
</style>
