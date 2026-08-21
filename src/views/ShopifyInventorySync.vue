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
              <ion-card-title>Shared sync jobs</ion-card-title>
              <ion-card-subtitle>One schedule each, serving every channel on this connection</ion-card-subtitle>
              <!-- The rollup badge that used to head its own card. Every job's status is listed
                   below it, so this is the summary of the rows it sits on rather than a second
                   place to read the same schedules. -->
              <ion-badge :color="scheduleHealthColor">{{ scheduleHealth }}</ion-badge>
            </ion-card-header>
            <ion-list lines="full">
              <ion-item
                v-for="job in sharedJobs"
                :key="`${job.name}-${job.targetChannelId ?? ''}`"
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

          <ion-card v-if="!inventoryChannels.length">
            <ion-item lines="none">
              <ion-label class="ion-text-wrap">
                <p>No inventory channels are mapped for this connection. Aggregate inventory
                   cannot be published until a facility group is mapped to a Shopify location.</p>
              </ion-label>
            </ion-item>
          </ion-card>

          <!-- One card per channel. A channel is the unit an operator manages -- it owns a facility
               group, a Shopify location, and its own two schedules -- so its jobs sit on it rather than
               in a shared list that needed the channel's name in brackets to tell rows apart. -->
          <ion-card v-for="channel in inventoryChannels" :key="channel.inventoryChannelId">
            <ion-item lines="full" button detail @click="openChannelEdit(channel)">
              <ion-icon :icon="layersOutline" slot="start" />
              <ion-label class="ion-text-wrap">
                {{ channel.description || channel.facilityGroupName || channel.facilityGroupId }}
                <p>{{ channelSubtitle(channel) }}</p>
              </ion-label>
              <ion-label slot="end" class="ion-text-end">
                {{ channel.shopifyLocationId }}
                <p>Shopify location</p>
              </ion-label>
            </ion-item>

            <ion-list lines="full">
              <ion-item
                v-for="job in jobsForChannel(channel)"
                :key="`${job.name}-${job.targetChannelId ?? ''}`"
                :button="!!job.job"
                :detail="!!job.job"
                @click="openServiceJob(job.job, `${job.name} (${channel.facilityGroupName || channel.description || channel.inventoryChannelId})`)"
              >
                <ion-icon slot="start" :icon="job.icon" />
                <ion-label class="ion-text-wrap">
                  {{ job.name }}
                  <p>{{ job.lastRun }}</p>
                  <p>{{ job.nextRun }}</p>
                </ion-label>
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
                  <ion-label class="ion-text-wrap">
                    Publishes under
                    <p>{{ batch.reason }}</p>
                  </ion-label>
                  <ion-badge v-if="!batch.reasonMapped" slot="end" color="warning">
                    {{ batch.mixedEventTypes ? "Mixed types" : "Unmapped" }}
                  </ion-badge>
                </ion-item>
                <ion-item button detail @click="selectedBatch = batch">
                  <ion-label>
                    Change entries
                    <p>Summed from {{ batch.eventCount }} ledger events</p>
                  </ion-label>
                  <ion-badge slot="end" color="medium">
                    {{ batch.entries.length }}
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
                placeholder="Search event type, source record, inventory item, location, reason, or batch"
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
                    :value="selectedChannel"
                    label="Inventory channel"
                    label-placement="stacked"
                    fill="outline"
                    interface="popover"
                    placeholder="All"
                    @ion-change="selectedChannel = $event.detail.value || ''"
                  >
                    <ion-select-option value="">
                      All
                    </ion-select-option>
                    <ion-select-option v-for="option in channelFilterOptions" :key="option.value" :value="option.value">
                      {{ option.label }}
                    </ion-select-option>
                  </ion-select>
                  <ion-button v-if="selectedChannel" fill="clear" class="clear-filter-button" aria-label="Clear inventory channel filter" @click.stop="selectedChannel = ''">
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
              <ion-label class="ion-text-wrap">
                <h2>Inventory event pipeline</h2>
                <p>
                  Aggregate inventory events in the order the publisher acts on them. Settled events are
                  purged after five days, so this is a rolling window rather than a full history.
                </p>
              </ion-label>
            </ion-item>
            <ion-badge color="medium">
              {{ filteredEvents.length }} shown
            </ion-badge>
          </div>

          <!-- The batch boundary is a job parameter, and taking eventTypeId out of it costs a truthful
               reason on every batch. Said here, where the reasons are read. -->
          <ion-card v-if="batchesWillMixEventTypes">
            <ion-item lines="none">
              <ion-icon slot="start" :icon="warningOutline" color="warning" />
              <ion-label class="ion-text-wrap">
                Batches can mix event types
                <p>
                  The publisher groups by {{ publisherGroupBy.join(", ") }}, which leaves out event type.
                  Any batch holding more than one kind of event must publish under correction, because no
                  other reason is true about it.
                </p>
              </ion-label>
            </ion-item>
          </ion-card>

          <section class="pipeline-section">
            <div class="section-header">
              <ion-item lines="none">
                <ion-icon slot="start" :icon="timeOutline" color="warning" />
                <ion-label class="ion-text-wrap">
                  <h2>Waiting to batch</h2>
                  <p>Grouped the way the publisher will group it. The oldest group drains first.</p>
                </ion-label>
              </ion-item>
              <ion-badge color="warning">
                {{ visibleWaitingBatches.length }}
              </ion-badge>
            </div>

            <ion-card v-for="group in visibleWaitingBatches" :key="group.id">
              <ion-item lines="full">
                <ion-label class="ion-text-wrap">
                  {{ group.type }}
                  <p>{{ group.channel }}</p>
                  <p>{{ group.eventCount }} events, oldest recorded {{ group.oldestAge }}</p>
                </ion-label>
                <div slot="end" class="reason-cell">
                  <span class="overline">Publishes under</span>
                  <ion-badge :color="group.reasonMapped ? 'primary' : 'warning'">
                    {{ group.reason }}
                  </ion-badge>
                </div>
              </ion-item>

              <ion-item v-if="!group.reasonMapped" lines="full">
                <ion-icon slot="start" :icon="warningOutline" color="warning" />
                <ion-label class="ion-text-wrap">
                  <p v-if="group.mixedEventTypes">
                    This group holds more than one event type, so no single Shopify reason is true about
                    it and the batch falls back to correction.
                  </p>
                  <p v-else>
                    This event type has no Shopify reason mapped, so the batch falls back to correction.
                    Map it by editing the event type row in the OMS, and the next batch picks it up.
                  </p>
                </ion-label>
              </ion-item>

              <ion-list lines="full">
                <ion-list-header>
                  <ion-label>Change entries Shopify will receive</ion-label>
                </ion-list-header>
                <ion-item v-for="entry in group.entries" :key="entry.key">
                  <ion-label class="ion-text-wrap">
                    {{ entry.productLabel }}
                    <p>{{ entry.productSku }}</p>
                    <p>{{ entry.locationLabel }}, item {{ entry.shopifyInventoryItem }}</p>
                    <p>{{ entry.eventCount }} events summed</p>
                  </ion-label>
                  <div slot="end" class="entry-outcome">
                    <ion-note>{{ entry.change }}</ion-note>
                    <ion-badge v-if="entry.outcome !== 'publish'" :color="entry.outcomeColor">
                      {{ entry.outcomeLabel }}
                    </ion-badge>
                    <ion-badge v-if="entry.retarget" color="danger">
                      Drains the location the channel left
                    </ion-badge>
                  </div>
                </ion-item>
              </ion-list>

              <ion-accordion-group>
                <ion-accordion value="events">
                  <ion-item slot="header" lines="full">
                    <ion-label>Contributing events</ion-label>
                  </ion-item>
                  <ion-list slot="content" lines="full">
                    <ion-item
                      v-for="event in group.events.slice(0, shownInGroup(group.id))"
                      :key="event.rowKey"
                      button
                      detail
                      @click="selectedEvent = event"
                    >
                      <ion-label class="ion-text-wrap">
                        {{ event.type }}
                        <p>{{ sourceLine(event) }}</p>
                        <p>{{ event.calculation || "No calculation comment recorded" }}</p>
                      </ion-label>
                      <div slot="end" class="entry-outcome">
                        <ion-note>{{ event.change }}</ion-note>
                        <ion-badge v-if="event.sourcePhase" color="medium">{{ event.sourcePhase }}</ion-badge>
                      </div>
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
            </ion-card>

            <ion-card v-if="!visibleWaitingBatches.length">
              <ion-item lines="none">
                <ion-icon slot="start" :icon="checkmarkCircleOutline" color="success" />
                <ion-label class="ion-text-wrap">
                  Nothing waiting
                  <p>Every recorded event has been claimed into a batch or settled.</p>
                </ion-label>
              </ion-item>
            </ion-card>
          </section>

          <section class="pipeline-section">
            <div class="section-header">
              <ion-item lines="none">
                <ion-icon slot="start" :icon="cloudUploadOutline" color="primary" />
                <ion-label class="ion-text-wrap">
                  <h2>In flight and failed</h2>
                  <p>
                    Batches the OMS has produced that Shopify has not confirmed. A rejection freezes into
                    the message and replays identically on every retry.
                  </p>
                </ion-label>
              </ion-item>
              <ion-badge color="primary">
                {{ visibleInFlightBatches.length }}
              </ion-badge>
            </div>

            <ion-card v-for="batch in visibleInFlightBatches" :key="batch.id">
              <ion-item lines="full">
                <ion-label class="ion-text-wrap">
                  {{ batch.id }}
                  <p>{{ batch.channel }}</p>
                  <p>Produced {{ batch.created }}, {{ batch.age }}</p>
                </ion-label>
                <div slot="end" class="reason-cell">
                  <ion-badge :color="batch.badgeColor">
                    {{ batch.status }}
                  </ion-badge>
                  <ion-badge :color="batch.reasonMapped ? 'primary' : 'warning'">
                    {{ batch.reason }}
                  </ion-badge>
                </div>
              </ion-item>
              <ion-list lines="full">
                <ion-item v-for="entry in batch.entries" :key="entry.key">
                  <ion-label class="ion-text-wrap">
                    {{ entry.productLabel }}
                    <p>{{ entry.productSku }}</p>
                    <p>{{ entry.locationLabel }}, item {{ entry.shopifyInventoryItem }}</p>
                  </ion-label>
                  <ion-note slot="end">{{ entry.change }}</ion-note>
                </ion-item>
                <ion-item lines="none">
                  <ion-button fill="clear" @click="selectedBatch = batch">
                    <ion-icon slot="start" :icon="listOutline" />
                    Events
                  </ion-button>
                  <ion-button fill="clear" @click="openMessage(batch)">
                    <ion-icon slot="start" :icon="documentTextOutline" />
                    Message text
                  </ion-button>
                </ion-item>
              </ion-list>
            </ion-card>

            <ion-card v-if="!visibleInFlightBatches.length">
              <ion-item lines="none">
                <ion-icon slot="start" :icon="checkmarkCircleOutline" color="success" />
                <ion-label class="ion-text-wrap">
                  Nothing in flight
                  <p>Every batch produced for this connection has reached Shopify.</p>
                </ion-label>
              </ion-item>
            </ion-card>
          </section>

          <section class="pipeline-section">
            <div class="section-header">
              <ion-item lines="none">
                <ion-icon slot="start" :icon="warningOutline" :color="visibleQuarantinedEvents.length ? 'danger' : 'medium'" />
                <ion-label class="ion-text-wrap">
                  <h2>Quarantined</h2>
                  <p>
                    Terminal. These are never batched again and are excluded from the absolute reset gate,
                    so nothing retries them: fix the source rows and record a new event.
                  </p>
                </ion-label>
              </ion-item>
              <ion-badge :color="visibleQuarantinedEvents.length ? 'danger' : 'medium'">
                {{ visibleQuarantinedEvents.length }}
              </ion-badge>
            </div>

            <ion-card v-if="visibleQuarantinedEvents.length">
              <ion-list lines="full">
                <ion-item
                  v-for="event in visibleQuarantinedEvents"
                  :key="event.rowKey"
                  button
                  detail
                  @click="selectedEvent = event"
                >
                  <ion-label class="ion-text-wrap">
                    {{ event.type }}
                    <p>{{ event.productName || `Item ${event.shopifyInventoryItem}` }}<template v-if="event.productSku"> ({{ event.productSku }})</template></p>
                    <p>{{ sourceLine(event) }}, at {{ event.locationLabel }}</p>
                    <p>{{ event.calculation || "No calculation comment recorded" }}</p>
                  </ion-label>
                  <ion-note slot="end">{{ event.change }}</ion-note>
                </ion-item>
              </ion-list>
            </ion-card>

            <ion-card v-else>
              <ion-item lines="none">
                <ion-icon slot="start" :icon="checkmarkCircleOutline" color="success" />
                <ion-label class="ion-text-wrap">
                  Nothing quarantined
                  <p>No event has produced a summed delta the publisher had to refuse.</p>
                </ion-label>
              </ion-item>
            </ion-card>
          </section>

          <section v-if="visibleSettledEvents.length" class="pipeline-section">
            <ion-accordion-group :value="historyMode === 'events' ? ['settled'] : []" :multiple="true">
              <ion-accordion value="settled">
                <div slot="header" class="section-header">
                  <ion-item lines="none">
                    <ion-icon slot="start" :icon="checkmarkCircleOutline" color="success" />
                    <ion-label class="ion-text-wrap">
                      <h2>Settled in the last five days</h2>
                      <p>Delivered to Shopify or closed as no change. Purged on the retention schedule.</p>
                    </ion-label>
                  </ion-item>
                  <ion-badge color="medium">
                    {{ visibleSettledEvents.length }}
                  </ion-badge>
                </div>

                <ion-card slot="content">
                  <div class="event-table event-table-header" role="row">
                    <ion-label>Event</ion-label>
                    <ion-label>Product</ion-label>
                    <ion-label>Location</ion-label>
                    <ion-label>Adjustment</ion-label>
                    <ion-label>Batch</ion-label>
                    <span />
                  </div>
                  <div ref="eventScrollerRef" class="event-scroller" @scroll.passive="onEventScroll">
                    <div :style="{ height: `${eventTopSpacer}px` }" aria-hidden="true" />
                    <div v-for="event in virtualEvents" :key="event.rowKey" data-virtual-row class="event-table event-table-row" role="row">
                      <ion-label class="ion-text-wrap">
                        <span class="overline mobile-only">Event</span>
                        <span class="event-type">{{ event.type }}</span>
                        <p>{{ sourceLine(event) }}</p>
                      </ion-label>
                      <ion-label class="ion-text-wrap">
                        <span class="overline mobile-only">Product</span>
                        <span class="event-type">{{ event.productName || `Item ${event.shopifyInventoryItem}` }}</span>
                        <p>{{ event.productSku || event.productId || event.shopifyInventoryItem }}</p>
                      </ion-label>
                      <ion-label class="ion-text-wrap">
                        <span class="overline mobile-only">Location</span>
                        <span class="event-type">{{ event.locationLabel }}</span>
                        <p v-if="event.retargetLocationId">Channel has left this location</p>
                      </ion-label>
                      <ion-label>
                        <span class="overline mobile-only">Adjustment</span>
                        <span>{{ event.change }}</span>
                      </ion-label>
                      <div class="event-status">
                        <span class="overline mobile-only">Batch</span>
                        <span>{{ event.batchId || "No batch" }}</span>
                        <ion-badge :color="event.deliveryColor || event.detailStateColor">
                          {{ event.delivery || event.detailState }}
                        </ion-badge>
                      </div>
                      <ion-button fill="clear" aria-label="View event details" @click="selectedEvent = event">
                        <ion-icon slot="icon-only" :icon="chevronForwardOutline" />
                      </ion-button>
                      <p class="row-calculation">{{ event.calculation || "No calculation comment recorded" }}</p>
                    </div>
                    <div :style="{ height: `${eventBottomSpacer}px` }" aria-hidden="true" />
                  </div>
                </ion-card>
              </ion-accordion>
            </ion-accordion-group>
          </section>

          <ion-card v-if="!filteredEvents.length && inventoryDetailsHydrated && inventorySyncReady">
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
            <ion-label class="ion-text-wrap">Event type<p>{{ selectedEvent?.type }}</p></ion-label>
            <ion-badge slot="end" :color="selectedEvent?.detailStateColor">{{ selectedEvent?.detailState }}</ion-badge>
          </ion-item>
          <!-- The reference is its own field, not half of a composed key: it is the source row's
               natural key, and for the effective-date families it carries the lifecycle phase too. -->
          <ion-item>
            <ion-label class="ion-text-wrap">
              Source record
              <p>{{ selectedEvent?.sourceLabel }}</p>
              <p v-if="selectedEvent?.sourcePhase">
                Effective-date boundary this row crossed: {{ selectedEvent?.sourcePhase }}
              </p>
            </ion-label>
          </ion-item>
          <ion-item v-if="selectedEvent && selectedArtifact">
            <ion-label class="ion-text-wrap">
              Came from
              <p v-if="selectedArtifact.label">{{ selectedArtifact.label }}</p>
              <p v-if="selectedArtifact.actor">Recorded by {{ selectedArtifact.actor }}</p>
              <p v-if="selectedArtifact.note">{{ selectedArtifact.note }}</p>
              <p v-if="selectedArtifact.unresolved">{{ selectedArtifact.unresolved }}</p>
            </ion-label>
          </ion-item>
          <ion-item v-if="selectedEvent?.showRawReference">
            <ion-label class="ion-text-wrap">
              Ledger event reference
              <p>{{ selectedEvent?.eventReferenceId }}</p>
            </ion-label>
          </ion-item>
          <ion-item>
            <ion-label class="ion-text-wrap">
              Product
              <p>{{ selectedEvent?.productName || 'Not resolved' }}</p>
              <p v-if="selectedEvent?.productSku">{{ selectedEvent?.productSku }}</p>
              <p v-if="selectedEvent?.productId">HotWax product {{ selectedEvent?.productId }}</p>
            </ion-label>
            <ion-note slot="end">{{ selectedEvent?.change }}</ion-note>
          </ion-item>
          <ion-item>
            <ion-label>Shopify inventory item<p>{{ selectedEvent?.shopifyInventoryItem || 'Unknown item' }}</p></ion-label>
          </ion-item>
          <ion-item>
            <ion-label class="ion-text-wrap">Inventory channel<p>{{ selectedEvent?.channelLabel }}</p></ion-label>
          </ion-item>
          <ion-item>
            <ion-label class="ion-text-wrap">
              Shopify location
              <p>{{ selectedEvent?.locationLabel }}</p>
              <p v-if="selectedEvent?.locationId">Shopify location {{ selectedEvent?.locationId }}</p>
              <p v-if="selectedEvent?.retargetLocationId">
                This delta was calculated against the location the channel has since stopped pointing at,
                and publishes there rather than to the channel's current one.
              </p>
            </ion-label>
            <ion-badge v-if="selectedEvent?.retargetLocationId" slot="end" color="danger">
              Retarget drain
            </ion-badge>
          </ion-item>
          <ion-item>
            <ion-label class="ion-text-wrap">Publishes under<p>{{ selectedEvent?.reason }}</p></ion-label>
            <ion-badge v-if="selectedEvent && !selectedEvent.reasonMapped" slot="end" color="warning">
              Unmapped
            </ion-badge>
          </ion-item>
          <ion-item>
            <ion-label>Batch<p>{{ selectedEvent?.batchId || 'Not batched' }}</p></ion-label>
            <ion-badge v-if="selectedEvent?.delivery" slot="end" :color="selectedEvent?.deliveryColor">
              {{ selectedEvent?.delivery }}
            </ion-badge>
          </ion-item>
          <ion-item lines="none">
            <ion-label class="ion-text-wrap">
              How this delta was calculated
              <p>{{ selectedEvent?.calculation || 'No calculation comment recorded' }}</p>
            </ion-label>
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
            <ion-label class="ion-text-wrap">
              Inventory channel
              <p>{{ selectedBatch?.channel }}</p>
            </ion-label>
            <ion-badge slot="end" :color="selectedBatch?.badgeColor">
              {{ selectedBatch?.status }}
            </ion-badge>
          </ion-item>
          <ion-item>
            <ion-label class="ion-text-wrap">
              Publishes under
              <p>{{ selectedBatch?.reason }}</p>
            </ion-label>
            <ion-badge v-if="selectedBatch && !selectedBatch.reasonMapped" slot="end" color="warning">
              {{ selectedBatch.mixedEventTypes ? "Mixed types" : "Unmapped" }}
            </ion-badge>
          </ion-item>
          <ion-item>
            <ion-label class="ion-text-wrap">
              Included events
              <p>Each keeps its own event type and reference</p>
            </ion-label>
            <ion-label slot="end">
              {{ selectedBatch?.eventCount }}
            </ion-label>
          </ion-item>

          <!-- What the mutation carried: the deltas above, summed per (inventory item, location). -->
          <ion-list-header>
            <ion-label>Change entries</ion-label>
          </ion-list-header>
          <ion-item v-for="entry in selectedBatch?.entries ?? []" :key="entry.key">
            <ion-label class="ion-text-wrap">
              {{ entry.productLabel }}
              <p>{{ entry.productSku }}</p>
              <p>{{ entry.locationLabel }}, item {{ entry.shopifyInventoryItem }}</p>
              <p>{{ entry.eventCount }} events summed</p>
            </ion-label>
            <ion-note slot="end">{{ entry.change }}</ion-note>
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
                <p>Attempted {{ statusLabel(err.attemptedStatusId) }} at {{ formatDateTime(toMillis(err.errorDate)) }}</p>
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
              {{ event.type }}
              <p>{{ sourceLine(event) }}</p>
              <p>Item {{ event.shopifyInventoryItem }} at {{ event.locationLabel }}</p>
              <p>{{ event.calculation }}</p>
            </ion-label>
            <ion-note slot="end">
              {{ event.change }}
            </ion-note>
            <ion-badge slot="end" :color="event.detailStateColor">
              {{ event.detailState }}
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

    <!-- inventoryChannelId is protected: this panel finds a publisher and a reset job BY that
         parameter and labels the per-channel rows from it, so editing it would move the job to a
         different channel rather than configure this one. -->
    <ServiceJobDetailsModal
      :is-open="!!selectedServiceJob"
      :job-name="selectedServiceJob?.jobName || ''"
      :title="selectedServiceJob?.title || 'Inventory sync job'"
      parameter-description="Job and service parameters used by this inventory sync job."
      :protected-parameter-names="selectedServiceJob?.protectedParameterNames || []"
      :parameter-options="selectedServiceJob?.parameterOptions || {}"
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
  IonPage, IonSearchbar, IonSelect, IonSelectOption, IonSpinner,
  IonTextarea, IonTitle, IonToggle, IonToolbar, alertController, modalController, onIonViewDidLeave,
  onIonViewWillEnter,
} from "@ionic/vue";
import {
  addOutline, checkmarkCircleOutline, chevronForwardOutline,
  closeCircleOutline, closeOutline, cloudUploadOutline, documentTextOutline,
  layersOutline, listOutline, locationOutline,
  refreshOutline, sendOutline, storefrontOutline, timeOutline, trashBinOutline, trashOutline,
  warningOutline,
} from "ionicons/icons";
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
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
  DISCARD_PENDING_EVENTS_SERVICE,
  INVENTORY_ADJUSTMENT_MESSAGE_TYPE,
  PRODUCED_SENDER_SERVICE,
  ensureChannelEventDiscardJob,
  ensureChannelEventPublisherJob,
  ensureChannelResetJob,
  ensureInventoryAdjustmentSenderJob,
  ensureShopPhysicalInventoryResetJob,
  fetchLocationsFromShopify,
  setInventoryEventDocumentAttached,
  useInventoryEventDocuments,
  updateShopifyInventoryEventFeedType,
  useShopifyShopMutations,
  useShopifySyncContext,
  type InventoryEventDocument,
} from "@/composables/useShopify";
import {
  dataFeedCache,
  groupFacilityCache,
  inventoryChannelCache,
  shopifyInventoryAdjustmentDetailCache,
  shopifyShopCache,
  systemMessageCache,
} from "@/utils/cacheEntities";
import { isEffectiveNow } from "@/utils/cacheProjection";
import { useEventSourceNames, type SourceLookup } from "@/composables/useEventSourceNames";
import { useProductNames } from "@/composables/useProductNames";
import { formatDateTime } from "@/utils";
import { parameterMap } from "@/utils/serviceJob";
import ServiceJobDetailsModal from "@/components/common/ServiceJobDetailsModal.vue";
import SetupInventoryChannelModal from "@/components/shopify/SetupInventoryChannelModal.vue";
import EditInventoryChannelModal from "@/components/shopify/EditInventoryChannelModal.vue";

type ViewName = "monitor" | "history";
type HistoryMode = "events" | "batches";

interface Batch {
  id: string;
  /** SystemMessage delivery. A batch genuinely has a delivery status; a ledger row does not. */
  statusId?: string;
  status: string;
  badgeColor: string;
  created: string;
  createdAt: number;
  age: string;
  channel: string;
  eventCount: number;
  /** What the mutation carried: one entry per (inventory item, location), deltas summed. */
  entries: ChangeEntry[];
  mixedEventTypes: boolean;
  reason: string;
  reasonMapped: boolean;
  messageText?: string;
}

interface InventoryEvent {
  rowKey: string;
  /**
   * The ledger's source identity is TWO fields, not one composed string. eventTypeId is atomic so it
   * can be grouped on -- which is what lets the Shopify `reason` be derived from data instead of
   * hardcoded -- and eventReferenceId names which occurrence of that type this is. Concatenating them
   * for display throws away exactly the split the entity exists to make.
   */
  eventTypeId: string;
  eventReferenceId: string;
  type: string;
  /** The reference named as the OMS record it is, e.g. "Shipment receipt 107319". */
  sourceLabel: string;
  /** Trailing lifecycle phase on an effective-date reference: OLD, NEW, ACTIVATE or EXPIRE. */
  sourcePhase: string;
  /** True only when the raw ledger reference is not already spelled out inside `sourceLabel`. */
  showRawReference: boolean;
  /** The ledger's Shopify inventory item -- the detail row carries no OMS product. */
  shopifyInventoryItem: string;
  /** Channel identity, which the channel filter matches on -- `channelLabel` is the label. */
  inventoryChannelId: string;
  channelLabel: string;
  /** The Shopify location this row's delta was calculated FOR, which is not always the channel's. */
  locationId: string;
  locationLabel: string;
  /**
   * Set only when the row carries publishShopifyLocationId: a delta written to drain a location the
   * channel has since stopped pointing at. Resolving such a row through the channel would apply it to
   * the new location, draining that and stranding the stock at the old one.
   */
  retargetLocationId?: string;
  delta: number;
  change: string;
  /** The reason a batch of this event type publishes under, and whether the type maps to one at all. */
  reason: string;
  reasonMapped: boolean;
  batchId?: string;
  /**
   * Ledger lifecycle ONLY: Pending / Assigned / No change / Quarantined. Never a delivery status --
   * these are two different state machines and collapsing them hides "quarantined, never batches"
   * behind the same chip as "batched, mutation rejected".
   */
  detailState: string;
  detailStateColor: string;
  /** SystemMessage delivery, present only once the row has been assigned to a batch. */
  delivery?: string;
  deliveryColor?: string;
  /** The raw SmsgProduced/Sending/Sent/Error id. Sections branch on this, never on the label. */
  deliveryStatusId?: string;
  createdAt: number;
  /** Raw, so the search box still matches what the server actually wrote. */
  decisionComment?: string;
  /**
   * The OMS product whose publishable ATP moved. Read out of the calculation comment, which is the only
   * place it appears: the ledger row carries no productId, and ShopifyShopProduct has no reverse mount
   * on shopifyInventoryItemId (checked against this instance's sob and oms Swagger), so the comment is
   * the available source. Empty when the comment does not follow the connector's template.
   */
  productId: string;
  /** Solr-resolved name and SKU for `productId`, absent until the lookup lands. */
  productName: string;
  productSku: string;
  /** The calculation itself, e.g. "publishable ATP 40.0 -> 41.0." */
  calculation: string;
}

const props = defineProps<{ id?: string; initialView?: ViewName; initialHistoryMode?: HistoryMode }>();
const router = useRouter();

const activeView = ref<ViewName>(props.initialView ?? "monitor");
const historyMode = ref<HistoryMode>(props.initialHistoryMode ?? "events");
const historyQuery = ref("");
const selectedHistoryStatus = ref("");
const selectedEventType = ref("");
const selectedChannel = ref("");
const historySortOrder = ref("newest");
const selectedEvent = ref<InventoryEvent | null>(null);
const selectedBatch = ref<Batch | null>(null);
const messageBatch = ref<Batch | null>(null);
interface ParameterOption { value: string; label: string }
interface ServiceJobSelection {
  jobName: string;
  title: string;
  protectedParameterNames: string[];
  parameterOptions: Record<string, ParameterOption[]>;
}
const selectedServiceJob = ref<ServiceJobSelection | null>(null);
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
const PURGE_DETAILS_SERVICE = "co.hotwax.sob.product.InventoryServices.purge#OldShopifyInventoryAdjustmentDetails";

const syncContext = useShopifySyncContext(() => props.id);
const { jobs: cachedJobs, hydrated: jobsHydrated } = useServiceJobs();
const { records: cachedDataFeeds, hydrated: dataFeedsHydrated } = useCachedList<any>(dataFeedCache);
const { records: allInventoryChannels, hydrated: inventoryChannelsHydrated } = useCachedList<any>(inventoryChannelCache);
const { records: allInventoryDetails, hydrated: inventoryDetailsHydrated } = useCachedList<any>(shopifyInventoryAdjustmentDetailCache);
const { records: cachedSystemMessages } = useCachedList<any>(systemMessageCache);
// Class B, so a local read. The two scoped inventory-history mounts need a facilityId, and the ledger
// carries a facility GROUP because the event is aggregate; these are the candidates to search.
const { records: cachedGroupFacilities } = useCachedList<any>(groupFacilityCache);
const {
  start: startSyncDomains,
  stop: stopSyncDomains,
  ready: inventorySyncReady,
  error: inventorySyncError,
  afterMutation,
} = useCacheSync();

/**
 * SHOPIFY'S OWN NAME FOR EACH LOCATION, read from Shopify through get#ShopifyLocations -- the same
 * call the location import screen makes, so the names on this page and in that picker are the same
 * strings the merchant sees in their admin.
 *
 * NOT resolved through ShopifyShopLocation -> Facility. That mapping exists, but an aggregate location
 * is not a facility: the shop records it against the `_NA_` sentinel, whose Facility row is named
 * "Brokering Queue" (verified on rails-oms channel 100002 / location 83049873577), so that join
 * produces a confident, wrong label. Shopify is the authority on what its own locations are called.
 *
 * One call per shop, on view entry, and never blocking: a shop that cannot be reached leaves the ids
 * showing rather than emptying the column.
 */
const shopifyLocationNames = ref(new Map<string, string>());

async function loadShopifyLocationNames() {
  const shopId = String(syncContext.shopId?.value ?? "");
  if (!shopId) return;
  try {
    const nodes = await fetchLocationsFromShopify(shopId);
    const names = new Map<string, string>();
    for (const node of nodes) {
      // The node id is a GID; the ledger and the channel both carry the bare numeric id.
      const locationId = String(node?.id ?? "").split("/").pop() ?? "";
      const name = String(node?.name ?? "").trim();
      if (locationId && name) names.set(locationId, name);
    }
    shopifyLocationNames.value = names;
  } catch (error) {
    logger.warn("Could not read Shopify location names; falling back to location ids", error);
  }
}

// Optional chaining on purpose: this getter runs at setup, before anything guarantees the context has
// settled, and a caller that stubs the context without a shopId should not take the whole view down.
watch(() => syncContext.shopId?.value, (shopId) => {
  if (shopId) void loadShopifyLocationNames();
}, { immediate: true });

const { products: resolvedProducts, resolve: resolveProductNames } = useProductNames();
const { sources: resolvedSources, resolve: resolveSourceNames, sourceKeyOf } = useEventSourceNames();

/** Effective member facilities of a channel's group, which is what a scoped lookup can search. */
const facilityIdsByGroup = computed(() => {
  const byGroup = new Map<string, string[]>();
  const now = Date.now();
  for (const member of cachedGroupFacilities.value) {
    if(!isEffectiveNow(member, now)) {continue;}
    const group = String(member.facilityGroupId ?? "");
    const facilityId = String(member.facilityId ?? "");
    if(!group || !facilityId) {continue;}
    byGroup.set(group, [...(byGroup.get(group) ?? []), facilityId]);
  }
  return byGroup;
});

function lookupFor(event: InventoryEvent): SourceLookup {
  const channel = allInventoryChannels.value.find((candidate: any) =>
    String(candidate.inventoryChannelId) === event.inventoryChannelId);
  return {
    eventTypeId: event.eventTypeId,
    eventReferenceId: event.eventReferenceId,
    productId: event.productId,
    facilityIds: facilityIdsByGroup.value.get(String(channel?.facilityGroupId ?? "")) ?? [],
  };
}

/** The resolved artifact for a row, once its lookup has landed. */
function artifactFor(event: InventoryEvent) {
  return resolvedSources.value.get(sourceKeyOf(event.eventTypeId, event.eventReferenceId));
}

/**
 * One line naming the source: the artifact when it resolved, otherwise the record the reference points
 * at. Both, when the artifact does not already spell the record out.
 */
const selectedArtifact = computed(() =>
  selectedEvent.value ? artifactFor(selectedEvent.value) : undefined);

function sourceLine(event: InventoryEvent): string {
  // The artifact replaces the record rather than sitting beside it. Both together read as duplication on
  // one clamped line, and the reservation families spell out to something far too long for it; the exact
  // source record keeps its own row in the detail.
  return artifactFor(event)?.label || event.sourceLabel;
}

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

/** Retention cleanup for the event ledger. Connector-seeded and OMS-wide, so it is not per channel. */
const purgeDetailsJob = computed<any>(() =>
  cachedJobs.value.find((job: any) => job.serviceName === PURGE_DETAILS_SERVICE) ?? null);

/** The manual discard handle. One job serves every channel via its inventoryChannelId parameter. */
const discardEventsJob = computed<any>(() =>
  cachedJobs.value.find((job: any) => job.serviceName === DISCARD_PENDING_EVENTS_SERVICE) ?? null);

/**
 * The sender this flow depends on, matched by TYPE SCOPE and not by serviceName alone. The OMS runs
 * several jobs on send#AllProducedSystemMessages: an unscoped one, plus clones restricted to other
 * message types. A serviceName-only match would report an unrelated type's sender as this flow's, so
 * only a job whose systemMessageTypeIds is empty (sends everything, so it does cover us) or names
 * ShopifyInventoryAdjustment counts.
 */
const inventoryAdjustmentSenderJobs = computed<any[]>(() =>
  cachedJobs.value.filter((job: any) => {
    if (job.serviceName !== PRODUCED_SENDER_SERVICE) return false;
    const scope = String(parameterMap(job).systemMessageTypeIds ?? "").trim();
    if (!scope) return true;
    return scope.split(",").map((type: string) => type.trim()).includes(INVENTORY_ADJUSTMENT_MESSAGE_TYPE);
  }));

/** Prefer a sender scoped to inventory adjustments over the shared unscoped one. */
const dedicatedSenderJob = computed<any>(() =>
  inventoryAdjustmentSenderJobs.value.find((job: any) =>
    String(parameterMap(job).systemMessageTypeIds ?? "").trim()) ?? null);

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
  purgeDetailsJob.value?.jobName,
  discardEventsJob.value?.jobName,
  ...inventoryAdjustmentSenderJobs.value.map((job: any) => job.jobName),
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

type JobSetupKind = "publisher" | "aggregateReset" | "physicalReset" | "discard" | "sender";

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

/**
 * The publisher clone that serves ONE channel. Matched the way findChannelResetJob matches its own:
 * the inventoryChannelId parameter is the real identity, with the seeded naming convention as a
 * fallback for a clone whose parameter rows have not been cached yet. Deliberately never matches the
 * seeded template (no channel parameter, no `_<id>` suffix) - reporting the template's paused state
 * under a channel's name would claim that channel publishes when it does not.
 */
function findChannelPublisherJob(channelId: string) {
  const targetId = String(channelId);
  return cachedJobs.value.find((job: any) =>
    PUBLISH_PENDING_SERVICES.includes(job.serviceName) &&
    String(parameterMap(job).inventoryChannelId ?? "") === targetId)
    || cachedJobs.value.find((job: any) =>
      PUBLISH_PENDING_SERVICES.includes(job.serviceName) &&
      job.jobName === `publish_PendingShopifyInventoryAdjustments_${targetId}`)
    || null;
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

/**
 * A job as this page renders it, wherever it renders. Both surfaces below build the same shape so a
 * row behaves identically on a channel card and in the shared list.
 */
type JobDefinition = {
  name: string;
  jobs: any[];
  icon: string;
  setup: JobSetupKind | "";
  targetChannelId?: string;
};

function describeJob({ name, jobs, icon, setup, targetChannelId }: JobDefinition) {
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
}

/**
 * THE TWO JOBS THAT BELONG TO ONE CHANNEL, rendered on that channel's own card.
 *
 * These used to sit in the flat jobs list with the channel's name in parentheses -- a suffix that
 * existed only to tell two otherwise identical rows apart. Grouping them under the channel makes the
 * card the context, so the suffix is gone, and the list stops growing by two rows per channel.
 *
 * `setup` is the row's create-the-missing-clone action, empty when there is nothing this page can
 * honestly create.
 */
function jobsForChannel(channel: any) {
  const channelId = String(channel.inventoryChannelId);
  const publisher = findChannelPublisherJob(channelId);
  const reset = findChannelResetJob(channelId);

  return [
    {
      name: translate("Publish and send event batches"),
      jobs: publisher ? [publisher] : [],
      icon: cloudUploadOutline,
      setup: publisher ? "" : "publisher",
      targetChannelId: channelId,
    },
    {
      name: translate("Reset aggregate ATP"),
      jobs: reset ? [reset] : [],
      icon: refreshOutline,
      setup: reset ? "" : "aggregateReset",
      targetChannelId: channelId,
    },
  ].map((definition) => describeJob(definition as JobDefinition));
}

/**
 * The jobs that are NOT per channel: one schedule serves every channel on the connection, or the whole
 * OMS. A fixed five, however many channels exist.
 *
 * With no channel mapped yet, the two per-channel rows fall back to un-scoped ones here so a
 * misconfigured connection still shows them - there is no channel card to hang them on, and the
 * "Set up channel" button is the honest action rather than cloning a job for a channel that is absent.
 */
const sharedJobs = computed(() => {
  const definitions: JobDefinition[] = [];

  if (!inventoryChannels.value.length) {
    definitions.push({
      name: "Publish and send aggregate event batches",
      jobs: pendingPublisherJobs.value,
      icon: cloudUploadOutline,
      setup: "",
    });
    definitions.push({
      name: "Reset aggregate ATP inventory",
      jobs: aggregateResetJobs.value,
      icon: refreshOutline,
      setup: "",
    });
  }

  definitions.push(
    {
      name: "Process effective-dated inventory changes",
      jobs: effectiveDateJob.value ? [effectiveDateJob.value] : [],
      icon: layersOutline,
      setup: "",
    },
    {
      name: "Reset physical location QOH",
      jobs: physicalResetJob.value ? [physicalResetJob.value] : [],
      icon: locationOutline,
      setup: !physicalResetJob.value && syncContext.remoteId.value ? "physicalReset" : "",
    },
    // Delivery. Batches are left at SmsgProduced on purpose and a scheduled sender moves them, so a
    // paused sender stalls the whole flow while every other row still reads healthy. OMS-wide.
    {
      name: "Send produced inventory batches (all Shopify connections)",
      jobs: inventoryAdjustmentSenderJobs.value,
      icon: sendOutline,
      setup: dedicatedSenderJob.value ? "" : "sender",
    },
    // Manual tool, not a schedule: it only ever runs from Run now.
    {
      name: "Discard unbatched events (manual, per channel)",
      jobs: discardEventsJob.value ? [discardEventsJob.value] : [],
      icon: trashOutline,
      setup: discardEventsJob.value ? "" : "discard",
    },
    // Retention. Connector-seeded, so its absence is a deploy gap rather than something to create.
    {
      name: "Purge old inventory events (all Shopify connections)",
      jobs: purgeDetailsJob.value ? [purgeDetailsJob.value] : [],
      icon: trashBinOutline,
      setup: "",
    },
  );

  return definitions.map(describeJob);
});

/** Every job on the page, whichever surface renders it. The health rollup reads this, not one half. */
const monitoredJobs = computed(() => [
  ...inventoryChannels.value.flatMap((channel: any) => jobsForChannel(channel)),
  ...sharedJobs.value,
]);

const RESULT_SUMMARY_LIMIT = 200;

function truncateResultText(text: string): string {
  return text.length > RESULT_SUMMARY_LIMIT ? `${text.slice(0, RESULT_SUMMARY_LIMIT).trimEnd()}…` : text;
}

/**
 * A reset that reports per-item failures answers with hundreds of lines of `results` JSON - one run
 * card rendered taller than the viewport, burying the figures it exists to show. Keep what an operator
 * triages on (the counts, and HOW MANY failures there were, not each one) and cap the rest. The
 * untruncated payload is still rendered in full under "View all runs".
 *
 * "{}" and "[]" mean "nothing to report" - the convention the job runs screen already documents - so
 * they summarise to nothing and let the caller's status wording stand instead of printing "{}".
 */
function summarizeResult(raw: unknown): string {
  const text = raw === undefined || raw === null ? "" : String(raw).trim();
  if (!text || text === "{}" || text === "[]") return "";

  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    return truncateResultText(text);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return truncateResultText(text);

  // Scalars keep their value; a collection reports its SIZE, which is the part that was flooding the
  // card. Anything unrecognised falls back to the capped raw text rather than being dropped silently.
  const parts = Object.entries(parsed).map(([key, value]) => {
    if (Array.isArray(value)) return `${key}: ${value.length}`;
    if (value === null || typeof value === "object") return "";
    return `${key}: ${value}`;
  }).filter(Boolean);

  return parts.length ? truncateResultText(parts.join(", ")) : truncateResultText(text);
}

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
    result: summarizeResult(run.results) || summarizeResult(run.messages) || (failed
      ? (summarizeResult(run.errors) || "The job reported an error")
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

function channelFor(detail: any): any {
  return allInventoryChannels.value.find((candidate: any) =>
    String(candidate.inventoryChannelId) === String(detail.inventoryChannelId));
}

/** The channel that owns the row, by name. This is the row's SCOPE, not its Shopify target. */
function channelLabel(detail: any): string {
  return detail.inventoryChannelDescription || channelFor(detail)?.description ||
    detail.facilityGroupId || detail.inventoryChannelId || "Inventory channel";
}

/**
 * The Shopify location this row's delta will actually be applied to. Mirrors `locationOf` in
 * create#ShopifyInventoryAdjustmentSystemMessage exactly: a row publishes to its own
 * publishShopifyLocationId when it carries one, and to the channel's current location otherwise.
 *
 * Resolving every row through the channel -- which is what this page used to do -- is wrong for the
 * one row type where it matters. A retarget writes a negative delta computed against the OLD location;
 * labelling it with the channel's NEW location tells the operator the opposite of what will happen.
 */
function locationIdOf(detail: any): string {
  return String(detail.publishShopifyLocationId || channelFor(detail)?.shopifyLocationId || "");
}

/**
 * The Shopify location a row publishes to, by id.
 *
 * NOT resolved to a name. ShopifyShopLocation does map (shopId, shopifyLocationId) -> facilityId, and
 * going on to Facility for a name looks like the obvious enrichment -- but an AGGREGATE location is not
 * a facility, and the shop records it against the `_NA_` sentinel. On rails-oms, channel 100002's
 * location 83049873577 resolves that way to a Facility row named "Brokering Queue", so the join
 * produces a confident, wrong target label. The channel's own description is the human name for this
 * target and it is already shown in context; the id is the precise one.
 */
function locationLabel(detail: any): string {
  const locationId = locationIdOf(detail);
  if (!locationId) return "Shopify aggregate location";
  return shopifyLocationNames.value.get(locationId) || `Location ${locationId}`;
}

/**
 * WHICH OMS RECORD THE EVENT CAME FROM. eventReferenceId is the source row's natural key, and its shape
 * is decided per family in post#ShopifyInventoryChannelEvent:
 *
 *   RECEIPT / TRANSFER_RECEIPT / RETURN_RESTOCK   ShipmentReceipt.receiptId
 *   POS_ISSUANCE                                  ItemIssuance.itemIssuanceId
 *   PHYSICAL_INVENTORY / CYCLE_COUNT              PhysicalInventory.physicalInventoryId
 *   EXTERNAL_RESET                                ExternalInventoryReset.resetItemId
 *   RESERVATION_CREATE / RESERVATION_RELEASE      inventoryItemId:inventoryItemDetailSeqId
 *   the configuration families                    the source row's composite key, and for the
 *                                                 effective-date ones a trailing :OLD or :NEW phase
 *
 * A bare number tells an operator nothing about where to look, so this names the record type. It is a
 * DISPLAY LABEL ONLY and the raw reference is always shown beside it, so an unrecognised type -- a new
 * one seeded in the OMS before this app ships -- degrades to the reference alone rather than to a wrong
 * label. The durable fix for "which sales order was that" is a resolved source on the server; this
 * ledger row deliberately carries no order, return or shipment id at all.
 */
const SOURCE_RECORD_LABELS: Record<string, string> = {
  RECEIPT: "Shipment receipt",
  TRANSFER_RECEIPT: "Shipment receipt",
  RETURN_RESTOCK: "Shipment receipt",
  POS_ISSUANCE: "Item issuance",
  PHYSICAL_INVENTORY: "Physical inventory",
  CYCLE_COUNT: "Physical inventory",
  EXTERNAL_RESET: "External inventory reset",
  // Deliberately absent: the reservation reference is spelled out below as "Inventory item X, detail Y",
  // which already names the record, and prefixing it would repeat the words.
  RESERVATION_CREATE: "",
  RESERVATION_RELEASE: "",
};

interface EventSource {
  /** What kind of OMS record the reference points at, empty when the type is not recognised. */
  recordLabel: string;
  /** The reference, spelled out for the composite families. */
  reference: string;
  /** ACTIVATE/EXPIRE-style boundary phase, carried as a trailing :OLD or :NEW on the reference. */
  phase: string;
}

function sourceOf(detail: any): EventSource {
  const eventTypeId = String(detail.eventTypeId ?? "");
  const raw = String(detail.eventReferenceId ?? "");
  const phaseMatch = raw.match(/:(OLD|NEW|ACTIVATE|EXPIRE)$/);
  const phase = phaseMatch ? phaseMatch[1] : "";
  const body = phase ? raw.slice(0, -(phase.length + 1)) : raw;

  // The reservation families are one inventory item plus one detail sequence, which reads as two
  // things rather than one opaque colon-joined token.
  if (eventTypeId.startsWith("RESERVATION_") && body.includes(":")) {
    const [inventoryItemId, detailSeqId] = body.split(":");
    return {
      recordLabel: SOURCE_RECORD_LABELS[eventTypeId] ?? "",
      reference: `Inventory item ${inventoryItemId}, detail ${detailSeqId}`,
      phase,
    };
  }

  return { recordLabel: SOURCE_RECORD_LABELS[eventTypeId] ?? "", reference: body, phase };
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
    const entries = changeEntriesOf(details);
    // Reason is a property of the WHOLE mutation, so it can only be stated when the batch holds one
    // event type. A mixed batch is the case the batcher publishes under `correction` because no single
    // reason is true about it -- worth showing as such rather than picking the first row's reason.
    const eventTypeIds = new Set(details.map((detail: any) => String(detail.eventTypeId ?? "")));
    const { reason, mapped } = eventTypeIds.size === 1
      ? reasonOf(details[0])
      : { reason: "correction", mapped: false };
    return {
      id,
      statusId,
      ...state,
      created: createdAt ? formatDateTime(createdAt) : "Unknown",
      createdAt,
      age: formatAge(createdAt),
      channel: channelLabel(details[0]),
      eventCount: details.length,
      // What Shopify receives: one change entry per (inventory item, location) with the deltas SUMMED.
      // A net figure across the whole message corresponds to nothing in the mutation.
      entries,
      mixedEventTypes: eventTypeIds.size > 1,
      reason,
      reasonMapped: mapped,
      messageText: message?.messageText,
    };
  }).sort((a, b) => b.createdAt - a.createdAt);
});

/**
 * THE LEDGER'S OWN LIFECYCLE, and nothing else. DETAIL_PENDING / ASSIGNED / NOOP / ERROR is a closed
 * vocabulary seeded by the connector; SystemMessage delivery is a separate state machine that lives on
 * the batch. This page used to return the batch's delivery status here whenever a row was assigned,
 * which meant "Sent" appeared as though it were a detail status and DETAIL_ERROR -- a terminal
 * quarantine that never batches and needs a human to record a new event -- read as just another
 * red chip. They are reported separately now.
 */
function detailState(detail: any): { label: string; color: string } {
  switch (detail.detailStatusId) {
    case "DETAIL_PENDING": return { label: "Waiting", color: "warning" };
    case "DETAIL_ASSIGNED": return { label: "Batched", color: "primary" };
    case "DETAIL_NOOP": return { label: "No change", color: "medium" };
    case "DETAIL_ERROR": return { label: "Quarantined", color: "danger" };
    default: return { label: String(detail.detailStatusId || "Unknown"), color: "medium" };
  }
}

/** Delivery of the batch this row was assigned to. Absent while the row is still unbatched. */
function deliveryState(detail: any): { label: string; color: string; statusId: string } | null {
  const systemMessageId = String(detail.systemMessageId ?? "");
  if (!systemMessageId) return null;
  const statusId = String(messageById.value.get(systemMessageId)?.statusId ||
    detail.systemMessageStatusId || "");
  const state = batchState(statusId);
  return { label: state.status, color: state.badgeColor, statusId };
}

/**
 * The reason a batch made up of this event type publishes under. `shopifyReason` is aliased onto the
 * view from ShopifyInventoryEventType precisely so it is readable BEFORE a send: inventoryAdjustQuantities
 * validates reason server-side and rejects the WHOLE mutation on a bad value, and that rejection freezes
 * into messageText and replays identically on every retry. A null mapping is a recorded decision, not an
 * oversight, and the batcher falls back to `correction` -- the one reason that is never a lie about an
 * aggregate adjustment.
 */
function reasonOf(detail: any): { reason: string; mapped: boolean } {
  const mapped = String(detail.shopifyReason ?? "").trim();
  return mapped ? { reason: mapped, mapped: true } : { reason: "correction", mapped: false };
}

/**
 * THE DECISION LOGIC, minus the identity it restates. A comment reads
 * "Event RETURN_RESTOCK:107319: product 140876 publishable ATP 40.0 -> 41.0." and the first clause is
 * the row's own event type and reference, already shown two lines above it. Stripping exactly that
 * prefix -- rebuilt from the row's own fields, so this is an equality test and not a pattern guess --
 * leaves the part that exists nowhere else on the screen: which OMS product's publishable ATP moved,
 * and the transition it made. A comment that does not open that way is passed through untouched.
 */
function calculationOf(detail: any): { productId: string; calculation: string } {
  const comment = String(detail.decisionComment ?? "").trim();
  const prefix = `Event ${detail.eventTypeId}:${detail.eventReferenceId}:`;
  const body = comment.startsWith(prefix) ? comment.slice(prefix.length).trim() : comment;
  // "product 140876 publishable ATP 40.0 -> 41.0." -- the productId is the ONLY place this screen can
  // get an OMS product from, and the phrase after it is the calculation itself.
  const parts = body.match(/^product (\S+) (publishable ATP .*)$/);
  return parts ? { productId: parts[1], calculation: parts[2] } : { productId: "", calculation: body };
}

/** The ledger's four-column primary key, used as the identity of a row everywhere on this page. */
function rowKeyOf(detail: any): string {
  return JSON.stringify([detail.eventTypeId, detail.eventReferenceId,
    detail.inventoryChannelId, detail.shopifyInventoryItemId].map(String));
}

/**
 * ONE CHANGE ENTRY -- what Shopify is actually sent. The batcher groups its claimed rows by
 * (shopifyInventoryItemId, effective location) and SUMS the deltas, so several ledger rows collapse
 * into a single entry in the mutation. Reporting per-row deltas alone, which is all this page used to
 * do, never shows the number Shopify receives.
 *
 * The summed delta also decides the rows' fate before any send happens: exactly zero settles them as
 * DETAIL_NOOP, and a non-whole sum quarantines the whole group as DETAIL_ERROR. Both are worth seeing
 * while the rows are still pending.
 */
interface ChangeEntry {
  key: string;
  shopifyInventoryItem: string;
  /**
   * One inventory item is one remote target, and the rows feeding an entry are all for that target, so
   * the product is taken from the first. Mappings that collapse several Shopify products onto a shared
   * inventory item are one target by design, which is why this cannot disagree with itself.
   */
  productLabel: string;
  productSku: string;
  locationId: string;
  locationLabel: string;
  retarget: boolean;
  delta: number;
  change: string;
  eventCount: number;
  outcome: "publish" | "noChange" | "quarantine";
  outcomeLabel: string;
  outcomeColor: string;
}

/** Binary floating point makes a summed decimal delta like 0.1 + 0.2 fail an exact integer test. */
function isWholeNumber(value: number): boolean {
  return Number.isInteger(Math.round(value * 1e6) / 1e6);
}

function changeEntriesOf(details: any[]): ChangeEntry[] {
  const grouped = new Map<string, any[]>();
  for (const detail of details) {
    const key = `${String(detail.shopifyInventoryItemId ?? "")}@${locationIdOf(detail)}`;
    grouped.set(key, [...(grouped.get(key) ?? []), detail]);
  }
  return [...grouped.entries()].map(([key, rows]) => {
    const delta = rows.reduce((total, row) => total + Number(row.computedInventoryChange || 0), 0);
    const outcome = delta === 0 ? "noChange" : isWholeNumber(delta) ? "publish" : "quarantine";
    const { productId } = calculationOf(rows[0]);
    const product = productId ? resolvedProducts.value.get(productId) : undefined;
    return {
      key,
      shopifyInventoryItem: String(rows[0].shopifyInventoryItemId ?? ""),
      productLabel: product?.parentProductName || product?.internalName || product?.productName ||
        `Item ${rows[0].shopifyInventoryItemId ?? ""}`,
      productSku: product?.sku || productId || "",
      locationId: locationIdOf(rows[0]),
      locationLabel: locationLabel(rows[0]),
      retarget: !!rows[0].publishShopifyLocationId,
      delta,
      change: `${delta > 0 ? "+" : ""}${delta}`,
      eventCount: rows.length,
      outcome,
      outcomeLabel: outcome === "publish" ? "Will publish"
        : outcome === "noChange" ? "Nets to zero, will settle as no change"
        : "Not a whole number, will be quarantined",
      outcomeColor: outcome === "publish" ? "primary" : outcome === "noChange" ? "medium" : "danger",
    } as ChangeEntry;
  }).sort((a, b) => a.shopifyInventoryItem.localeCompare(b.shopifyInventoryItem));
}

/**
 * THE PUBLISHER'S BATCH BOUNDARY. `groupByFields` is a parameter on the drain job; unset means the
 * default documented in create#ShopifyInventoryAdjustmentSystemMessage, which puts one inventory item
 * and one event type in a message so a rejected item can only ever take itself down.
 */
const PUBLISHER_DEFAULT_GROUP_BY = ["inventoryChannelId", "shopifyInventoryItemId", "eventTypeId"];

const publisherGroupBy = computed<string[]>(() => {
  for (const job of pendingPublisherJobs.value) {
    const configured = String(parameterMap(job).groupByFields ?? "").trim();
    if (configured) return configured.split(",").map((field) => field.trim()).filter(Boolean);
  }
  return PUBLISHER_DEFAULT_GROUP_BY;
});

/**
 * With eventTypeId out of the grouping, one message can hold a receipt and a POS sale, and the batcher
 * then has to publish under `correction` because no single reason is true about the batch. That is a
 * configuration choice with a visible cost, so the page says so rather than letting the reason quietly
 * degrade.
 */
const batchesWillMixEventTypes = computed(() => !publisherGroupBy.value.includes("eventTypeId"));

const eventByRowKey = computed(() => new Map(inventoryEvents.value.map((event) => [event.rowKey, event])));

function eventsFor(details: any[]): InventoryEvent[] {
  return details.map((detail) => eventByRowKey.value.get(rowKeyOf(detail)))
    .filter((event): event is InventoryEvent => !!event);
}

/**
 * SECTION 1 -- what has not been sent yet, grouped the way the publisher will group it, so the reason
 * each prospective batch will publish under is readable while it is still cheap to change. A wrong
 * reason is rejected for the whole mutation and then replays verbatim on every retry, so this is the
 * only moment an operator can act on it.
 *
 * Oldest group first: that is the order the publisher drains, because it picks the oldest pending group
 * on each run.
 */
const waitingBatches = computed(() => {
  const pending = inventoryDetails.value.filter((detail: any) =>
    detail.detailStatusId === "DETAIL_PENDING" && !detail.systemMessageId);
  const grouped = new Map<string, any[]>();
  for (const detail of pending) {
    const key = publisherGroupBy.value.map((field) => `${field}=${detail[field] ?? ""}`).join(", ");
    grouped.set(key, [...(grouped.get(key) ?? []), detail]);
  }

  return [...grouped.entries()].map(([key, rows]) => {
    const eventTypeIds = new Set(rows.map((row: any) => String(row.eventTypeId ?? "")));
    const { reason, mapped } = eventTypeIds.size === 1
      ? reasonOf(rows[0])
      : { reason: "correction", mapped: false };
    const timestamps = rows.map((row: any) => toMillis(row.createdDate)).filter(Boolean);
    const oldestAt = timestamps.length ? Math.min(...timestamps) : 0;
    return {
      id: key,
      channel: channelLabel(rows[0]),
      inventoryChannelId: String(rows[0].inventoryChannelId ?? ""),
      type: eventTypeIds.size === 1 ? eventTypeLabel(rows[0]) : `${eventTypeIds.size} event types mixed`,
      mixedEventTypes: eventTypeIds.size > 1,
      reason,
      reasonMapped: mapped,
      entries: changeEntriesOf(rows),
      eventCount: rows.length,
      oldestAt,
      oldestAge: oldestAt ? formatAge(oldestAt) : "Unknown",
      events: eventsFor(rows),
    };
  }).sort((a, b) => a.oldestAt - b.oldestAt);
});

/** SECTION 2 -- batches the OMS has produced but Shopify has not confirmed, including outright failures. */
const IN_FLIGHT_STATUS_IDS = ["SmsgProduced", "SmsgSending", "SmsgError"];
const inFlightBatches = computed(() => batches.value
  .filter((batch: any) => IN_FLIGHT_STATUS_IDS.includes(String(batch.statusId))));

/**
 * SECTION 3 -- terminal quarantine. These rows are never claimed again and are deliberately excluded
 * from the absolute publisher's pending-delta gate, so nothing will retry them: the source rows have to
 * be fixed and a NEW event recorded.
 */
const quarantinedEvents = computed(() => inventoryEvents.value
  .filter((event) => event.detailState === "Quarantined"));

/**
 * SECTION 4 -- the settled tail. Retention-bound, not an archive: the scheduled purge removes terminal
 * rows after five days by default, so this can only ever be a rolling window.
 */
const settledEvents = computed(() => inventoryEvents.value.filter((event) =>
  event.detailState === "No change" || event.deliveryStatusId === "SmsgSent"));

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
  const state = detailState(detail);
  const delivery = deliveryState(detail);
  const { reason, mapped } = reasonOf(detail);
  const source = sourceOf(detail);
  const { productId, calculation } = calculationOf(detail);
  const product = productId ? resolvedProducts.value.get(productId) : undefined;
  const delta = Number(detail.computedInventoryChange || 0);
  // Same identity as the server PK and the cache key: event type + reference + channel + item.
  const identity = [
    detail.eventTypeId,
    detail.eventReferenceId,
    detail.inventoryChannelId,
    detail.shopifyInventoryItemId,
  ];
  return {
    rowKey: JSON.stringify(identity.map(String)),
    eventTypeId: String(detail.eventTypeId ?? ""),
    eventReferenceId: String(detail.eventReferenceId ?? ""),
    type: eventTypeLabel(detail),
    sourceLabel: [source.recordLabel, source.reference].filter(Boolean).join(" "),
    sourcePhase: source.phase,
    showRawReference: !`${source.recordLabel} ${source.reference}`.includes(String(detail.eventReferenceId ?? "")),
    // The ledger identifies a Shopify inventory item, not an OMS product, and nothing cached here
    // maps one to the other. Show the item id -- the row's real identity -- rather than resolving a
    // product through a join this screen does not have.
    shopifyInventoryItem: String(detail.shopifyInventoryItemId ?? ""),
    // The filter matches on this, not on the display label: two channels can share a description.
    inventoryChannelId: String(detail.inventoryChannelId ?? ""),
    channelLabel: channelLabel(detail),
    locationId: locationIdOf(detail),
    locationLabel: locationLabel(detail),
    retargetLocationId: detail.publishShopifyLocationId ? String(detail.publishShopifyLocationId) : undefined,
    delta,
    change: `${delta > 0 ? "+" : ""}${delta}`,
    reason,
    reasonMapped: mapped,
    batchId: detail.systemMessageId || undefined,
    detailState: state.label,
    detailStateColor: state.color,
    delivery: delivery?.label,
    deliveryColor: delivery?.color,
    deliveryStatusId: delivery?.statusId,
    createdAt: toMillis(detail.createdDate),
    decisionComment: detail.decisionComment,
    productId,
    productName: product?.parentProductName || product?.internalName || product?.productName || "",
    productSku: product?.sku || "",
    calculation,
  };
}).sort((a, b) => b.createdAt - a.createdAt));

/**
 * Ask Solr for the products the rendered rows mention. Watches the rows rather than fetching per row:
 * `resolve` filters against what it has already requested, so a stable list is one round trip and a
 * background cache sync that rebuilds the array is none.
 */
watch(inventoryEvents, (events) => {
  void resolveProductNames(events.map((event) => event.productId).filter(Boolean));
}, { immediate: true });


const pendingEventCount = computed(() => inventoryDetails.value.filter((detail: any) =>
  detail.detailStatusId === "DETAIL_PENDING").length);
const pendingBatchCount = computed(() => batches.value.filter((batch) =>
  ["SmsgProduced", "SmsgSending", "SmsgError"].includes(String(batch.statusId))).length);
const oldestUnbatchedEvent = computed(() => {
  const oldest = inventoryEvents.value.filter((event) => event.detailState === "Waiting")
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

const historyStatusOptions = computed(() => [...new Set(inventoryEvents.value.map((event) => event.detailState))]);
const eventTypeOptions = computed(() => [...new Set(inventoryEvents.value.map((event) => event.type))]);
/**
 * Channel choices for the history filter and the discard job's channel parameter.
 *
 * Built from the CHANNELS rather than from labels scraped off events: an event-derived list hides a
 * channel that has no events yet. Two channels can also carry the SAME facility group name (this OMS
 * has a pair of them), so a label that repeats gets its id appended - the value is the id either way,
 * but an operator picking a target must be able to tell two entries apart.
 */
const channelFilterOptions = computed<ParameterOption[]>(() => {
  const labelFor = (channel: any) =>
    String(channel.facilityGroupName || channel.description || channel.inventoryChannelId);
  const labelCounts = inventoryChannels.value.reduce((counts: Record<string, number>, channel: any) => {
    const label = labelFor(channel);
    counts[label] = (counts[label] ?? 0) + 1;
    return counts;
  }, {});

  return inventoryChannels.value.map((channel: any) => {
    const label = labelFor(channel);
    return {
      value: String(channel.inventoryChannelId),
      label: labelCounts[label] > 1 ? `${label} (${channel.inventoryChannelId})` : label,
    };
  });
});

const filteredEvents = computed(() => {
  const query = historyQuery.value.trim().toLowerCase();
  const events = inventoryEvents.value.filter((event) => {
    const matchesQuery = !query || [event.eventTypeId, event.eventReferenceId, event.type,
      event.shopifyInventoryItem, event.channelLabel, event.locationId, event.locationLabel,
      event.reason, event.batchId, event.detailState, event.delivery, event.decisionComment,
      event.productId, event.productName, event.productSku]
      .some((value) => String(value ?? "").toLowerCase().includes(query));
    return matchesQuery &&
      (!selectedHistoryStatus.value || event.detailState === selectedHistoryStatus.value) &&
      (!selectedEventType.value || event.type === selectedEventType.value) &&
      (!selectedChannel.value || event.inventoryChannelId === selectedChannel.value);
  });
  return historySortOrder.value === "oldest" ? events.reverse() : events;
});

/**
 * The four pipeline sections all read `filteredEvents`, so the search box and the selects narrow every
 * section at once rather than only the flat list.
 */
const visibleRowKeys = computed(() => new Set(filteredEvents.value.map((event) => event.rowKey)));

const visibleWaitingBatches = computed(() => waitingBatches.value
  .map((group) => ({ ...group, events: group.events.filter((event) => visibleRowKeys.value.has(event.rowKey)) }))
  .filter((group) => group.events.length));

const visibleInFlightBatches = computed(() => inFlightBatches.value
  .filter((batch: any) => filteredEvents.value.some((event) => event.batchId === batch.id)));

const visibleQuarantinedEvents = computed(() => quarantinedEvents.value
  .filter((event) => visibleRowKeys.value.has(event.rowKey)));

const visibleSettledEvents = computed(() => settledEvents.value
  .filter((event) => visibleRowKeys.value.has(event.rowKey)));

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
} = useVirtualRows(visibleSettledEvents, { estimatedRowHeight: 76 });

/**
 * Source artifacts for the rows actually on screen.
 *
 * NOT for the whole list. The receipt and issuance families need a walk over the channel's facilities,
 * which is affordable for a row a person opened and not for hundreds; those are skipped here (no
 * `fanOut`) and resolved when the row's detail opens. The reservation, cycle-count and external-reset
 * families each cost one call and are resolved eagerly, so the actionable sections and the visible
 * window of the settled tail carry real names without a click.
 */
const onScreenEvents = computed<InventoryEvent[]>(() => [
  ...visibleWaitingBatches.value.flatMap((group: any) => group.events as InventoryEvent[]),
  ...visibleQuarantinedEvents.value,
  ...virtualEvents.value,
]);

watch(onScreenEvents, (events) => {
  if(!events.length) {return;}
  void resolveSourceNames(events.map(lookupFor));
}, { immediate: true });

/**
 * Opening a row is the explicit request that pays for the facility walk. Everything already resolved is
 * skipped inside the resolver, so this only ever adds the receipt/issuance families.
 */
watch(selectedEvent, (event) => {
  if(event) {void resolveSourceNames([lookupFor(event)], { fanOut: true });}
});

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
  [historyQuery, selectedHistoryStatus, selectedEventType, selectedChannel, historySortOrder],
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
    inventoryChannel: messageBatch.value?.channel,
    reason: messageBatch.value?.reason,
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
 * "Online Facility Group, HC Demo" - what the channel maps, in the names people use for those two
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
  return [groupLabel, shopLabel].filter(Boolean).join(", ");
}

function openChannelEdit(channel: any) {
  editingChannel.value = channel;
}

function handleScheduleChannelJob(payload: { jobName: string; title: string }) {
  editingChannel.value = null;
  selectedServiceJob.value = serviceJobSelection(payload.jobName, payload.title);
}

async function onChannelUpdated() {
  // Changing the location changes what the reset jobs target, so re-read rather than waiting for the
  // next scheduled pass.
  await startSyncDomains(activeSyncDomains());
}

/** The one way into a job's configuration - from its row in Inventory sync jobs. */
/**
 * Per-job parameter policy, because inventoryChannelId means opposite things on different rows.
 *
 * On a per-channel publisher or reset job the channel IS the job's identity - this panel finds the job
 * by it and labels the row from it - so editing the value would move the job to another channel and
 * orphan the row it was opened from. It stays read-only there.
 *
 * On the manual discard job the channel is the job's INPUT: one job serves every channel and choosing
 * one is how the tool is aimed. So it is editable there, and offered as a dropdown of channel names
 * rather than a free-text id, which is a misconfiguration the job would only reveal when it ran.
 */
function serviceJobSelection(jobName: string, title: string, serviceName?: string): ServiceJobSelection {
  const isDiscardJob = serviceName === DISCARD_PENDING_EVENTS_SERVICE;
  return {
    jobName: String(jobName),
    title,
    // Default to protecting the channel: every other job that carries inventoryChannelId is bound to
    // one channel, and only the discard tool takes it as an input.
    protectedParameterNames: isDiscardJob ? [] : ["inventoryChannelId"],
    parameterOptions: isDiscardJob ? { inventoryChannelId: channelFilterOptions.value } : {},
  };
}

function openServiceJob(job: any, title: string) {
  if (!job?.jobName) return;
  selectedServiceJob.value = serviceJobSelection(job.jobName, title, job.serviceName);
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
    } else if (kind === "sender") {
      created.push(await ensureInventoryAdjustmentSenderJob());
    } else if (kind === "discard") {
      // Seed it pointed at a channel so the parameter is never an empty id, but the operator still
      // picks the channel deliberately in the modal before running it.
      created.push(await ensureChannelEventDiscardJob({
        inventoryChannelId: String(inventoryChannels.value[0]?.inventoryChannelId ?? ""),
      }));
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
    refreshServiceJobData();

    // One job, created for one named channel: open it, which is what the row's own click would do and
    // what the removed "Schedule reset" button did. A multi-create -- the shared rows provision every
    // uncovered channel at once -- has no single job to open, so it keeps the toast.
    const openable = created.length === 1 && targetChannelId ? created[0] : "";
    if (openable) {
      const channel = inventoryChannels.value.find((c: any) => String(c.inventoryChannelId) === String(targetChannelId));
      const channelName = channel?.facilityGroupName || channel?.description || targetChannelId;
      const jobLabel = kind === "publisher"
        ? translate("Publish and send event batches")
        : translate("Reset aggregate ATP");
      commonUtil.showToast(`${openable} created, paused. Set its schedule and activate it below.`);
      selectedServiceJob.value = serviceJobSelection(openable, `${jobLabel} - ${channelName}`);
      return;
    }

    commonUtil.showToast(!created.length
      ? "Nothing to create - these jobs already exist."
      : created.length === 1
        ? `${created[0]} created, paused. Open the row to set its schedule and activate it.`
        : `${created.length} jobs created, paused. Open each row entry to schedule and activate them.`);
  } catch (error: any) {
    logger.error("Failed to set up inventory sync job", kind, error);
    commonUtil.showToast(error?.message || "The job could not be created.");
  } finally {
    provisioningJobKind.value = "";
  }
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

/* The virtualised rows scroll inside this box rather than the page, so the window maths has a
   viewport to measure against. The column header above it stays put while the rows move. */
.event-scroller {
  max-block-size: 70vh;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
}

/* Five columns, down from six plus a constant: the channel is section scope now rather than a
   per-row repeat, and "Aggregate ATP" was the same string on every row. */
.event-table {
  display: grid;
  grid-template-columns: minmax(240px, 1.8fr) minmax(180px, 1.4fr) minmax(110px, 0.8fr) minmax(80px, 0.5fr) minmax(110px, 0.7fr) max-content;
  align-items: center;
  gap: var(--spacer-xs);
  padding: var(--spacer-sm);
}

/* Each pipeline state owns a block, so the gap between sections has to read as larger than the gap
   between the cards inside one. */
.pipeline-section {
  display: flex;
  flex-direction: column;
  gap: var(--spacer-sm);
  margin-block-start: var(--spacer-base);
}

.pipeline-section > ion-card,
.pipeline-section ion-accordion-group {
  margin-block: 0;
}

/* The reason a batch publishes under, and its delivery, stack at the end of a header row rather than
   competing for the same slot. */
.reason-cell,
.entry-outcome {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--spacer-2xs);
  min-width: 0;
}

.reason-cell ion-badge,
.entry-outcome ion-badge {
  white-space: normal;
  text-align: end;
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

/* The batch id and its delivery badge share one cell: the badge is the state OF that batch, so they
   read as one fact rather than two columns that always move together. Stacked at every width, which
   is what the row-restack rule below used to do only on narrow screens. */
.event-status {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--spacer-2xs);
  min-width: 0;
}

.event-status > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.event-table-row > ion-label:first-child p {
  overflow-wrap: anywhere;
}

/* The calculation is prose, so it gets the whole row rather than the narrowest column: it spans every
   track and wraps onto the grid's second line.

   ONE LINE, ALWAYS PRESENT. useVirtualRows measures a single row and assumes the others match, so a
   comment of varying length would drift the spacer maths and make the scroll jump. Clamped here and
   shown in full in the row's own detail. */
.event-table-row .row-calculation {
  grid-column: 1 / -1;
  margin-block: 0;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.event-table-row > ion-label {
  min-width: 0;
}

.event-table-row > ion-label p {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* TWO LINES, FIXED, on every cell whose text is free-form: the server-owned event-type description,
   the Solr product name and the Shopify location name all vary in length, so any of them can decide
   the row's height -- measured live, rows landed on 106px or 122px depending on the event type alone.
   useVirtualRows measures ONE row and applies that height to the spacers for all of them, so a varying
   row drifts the scrollbar over hundreds of rows.

   Clamped so a long description cannot grow the row, and floored at the same two line boxes so a short
   one cannot shrink it. `lh` is the line box itself rather than a guessed pixel value; where it is not
   supported the cell just sizes to content, which is the behaviour this replaces rather than a break.
   The full description is in the row's own detail. */
.event-table-row .event-type {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  block-size: 2lh;
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

  /* Stacked rows get the full width, and truncating a product name on a 375px screen costs more than
     it saves, so everything wraps here.

     That does mean mobile rows vary in height while desktop rows do not, and useVirtualRows measures
     one row for all of them -- so the mobile spacers stay an approximation. This is the behaviour the
     stacked layout already had before the columns changed; it is not worth buying back by clamping the
     one place the text most needs to be readable. Fixing it properly means teaching the virtualiser
     about variable heights, which is a change to a shared composable rather than to this page. */
  .event-table-row > ion-label p,
  .event-table-row .row-calculation {
    white-space: normal;
  }

  .event-table-row .event-type {
    display: block;
    block-size: auto;
  }

  .event-table-row > ion-button {
    grid-column: 2;
    grid-row: 1;
  }

  /* Stacked rows have the width to show a long batch id in full. */
  .event-status > span {
    white-space: normal;
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
