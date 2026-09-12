<template>
  <ion-page>
    <!-- Outside the monitor/history split on purpose: the history route is linkable and can be opened
         cold, and a reader who cannot see this banner reads every empty section as "nothing pending". -->
    <ion-card v-if="inventorySyncError" color="warning" class="sync-error-banner">
      <ion-card-content>
        <ion-icon :icon="warningOutline" />
        <ion-label>
          <h2>{{ translate("Inventory data could not be loaded from the OMS") }}</h2>
          <p>{{ inventorySyncError }}</p>
          <p>{{ translate("The counts below are unavailable, not confirmed empty. Do not read them as \"nothing pending\".") }}</p>
        </ion-label>
      </ion-card-content>
    </ion-card>

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
        <section class="summary-grid">
          <div class="queue-column">
            <ion-card>
              <ion-card-header>
                <ion-card-title>{{ translate("Aggregate event queue") }}</ion-card-title>
                <ion-card-subtitle>{{ translate("Inventory changes waiting to reach Shopify aggregate locations") }}</ion-card-subtitle>
              </ion-card-header>
              <ion-list lines="full">
                <ion-item button detail @click="openHistory()">
                  <ion-label>
                    {{ translate("Aggregate events pending batching") }}
                    <p>{{ translate("Calculated inventory adjustments without a System Message") }}</p>
                  </ion-label>
                  <ion-badge slot="end" color="warning">
                    {{ pendingEventCount }}
                  </ion-badge>
                </ion-item>
                <ion-item button detail @click="openHistory('batches')">
                  <ion-label>
                    {{ translate("Batches pending delivery") }}
                    <p>{{ translate("System Messages waiting to send or retry") }}</p>
                  </ion-label>
                  <ion-badge slot="end" color="primary">
                    {{ pendingBatchCount }}
                  </ion-badge>
                </ion-item>
                <!-- Reads as queue state ("when does what is waiting go out?"), not as a way into the
                     publisher's config - that lives once, in Inventory sync jobs below. -->
                <ion-item>
                  <ion-label>
                    {{ translate("Next batch send") }}
                    <p>{{ translate("Send Shopify aggregate inventory adjustments") }}</p>
                  </ion-label>
                  <ion-label slot="end">
                    {{ nextBatchRun }}
                    <p>{{ translate("Publisher job schedule") }}</p>
                  </ion-label>
                </ion-item>
                <ion-item lines="none" button detail @click="openHistory()">
                  <ion-label>
                    {{ translate("Oldest unbatched event") }}
                    <p>{{ translate("First calculated adjustment still waiting for a batch") }}</p>
                  </ion-label>
                  <ion-label slot="end">
                    {{ oldestUnbatchedEvent }}
                  </ion-label>
                </ion-item>
              </ion-list>
            </ion-card>

            <ion-card>
              <ion-card-header>
                <ion-card-title>{{ translate("Location event queue") }}</ion-card-title>
                <ion-card-subtitle>{{ translate("Inventory changes waiting to reach Shopify physical locations") }}</ion-card-subtitle>
                <ion-badge v-if="(locationDeliveryErrorCount ?? 0) > 0" color="danger">
                  {{ locationDeliveryErrorCount }} {{ translate("errors") }}
                </ion-badge>
              </ion-card-header>
              <ion-list lines="full">
                <ion-item button detail @click="openLocationHistory('unassigned')">
                  <ion-label>
                    {{ translate("Location events pending batching") }}
                    <p>{{ translate("Location adjustments without a System Message") }}</p>
                  </ion-label>
                  <ion-badge slot="end" :color="unassignedNonZeroCount ? 'warning' : 'medium'">
                    {{ unassignedNonZeroCount }}
                  </ion-badge>
                </ion-item>
                <ion-item button detail @click="openLocationHistory('batches')">
                  <ion-label>
                    {{ translate("Batches pending delivery") }}
                    <p>{{ translate("System Messages waiting to send or retry") }}</p>
                  </ion-label>
                  <ion-badge slot="end" :color="pendingLocationBatchCount ? 'primary' : 'medium'">
                    {{ pendingLocationBatchCount }}
                  </ion-badge>
                </ion-item>
                <ion-item>
                  <ion-label>
                    {{ translate("Next batch send") }}
                    <p>publish_PendingShopifyLocationInventoryAdjustments</p>
                  </ion-label>
                  <ion-label slot="end">
                    {{ nextLocationBatchRun }}
                    <p>{{ translate("Publisher job schedule") }}</p>
                  </ion-label>
                </ion-item>
                <ion-item lines="none" button detail @click="openLocationHistory('unassigned')">
                  <ion-label>
                    {{ translate("Oldest unbatched event") }}
                    <p>{{ translate("First location adjustment still waiting for a batch") }}</p>
                  </ion-label>
                  <ion-label slot="end">
                    {{ oldestLocationUnbatchedEvent }}
                    <p v-if="oldestUnassignedCreatedAt !== undefined">{{ oldestUnassignedAgeLabel }}</p>
                  </ion-label>
                </ion-item>
              </ion-list>
            </ion-card>
          </div>

          <!-- Sits beside the queue card rather than in a section of its own further down: the two
               answer the paired questions a monitor is opened for (what is waiting, and what will
               move it), and after the duplicate schedule card was removed each was left spanning a
               desktop width to hold four rows. `auto-fit` still stacks them on narrow screens. -->
          <ion-card>
            <ion-card-header>
              <ion-card-title>{{ translate("Shared sync jobs") }}</ion-card-title>
              <ion-card-subtitle>{{ translate("One schedule each, serving every channel on this connection") }}</ion-card-subtitle>
              <!-- The rollup badge that used to head its own card. Every job's status is listed
                   below it, so this is the summary of the rows it sits on rather than a second
                   place to read the same schedules. -->
              <ion-badge :color="scheduleHealthColor">
                {{ scheduleHealth }}
              </ion-badge>
            </ion-card-header>
            <ion-list lines="full">
              <ion-item v-if="jobSetupError" role="alert"><ion-label class="ion-text-wrap">{{ jobSetupError }}</ion-label></ion-item>
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
                  <template v-else>
                    {{ translate("Set up") }}
                  </template>
                </ion-button>
                <ion-badge slot="end" :color="job.badgeColor">
                  {{ job.status }}
                </ion-badge>
              </ion-item>
            </ion-list>
          </ion-card>
        </section>

        <ion-card>
          <ion-list lines="none">
            <ion-item button detail @click="router.push(`/shopify-connection-details/${props.id}/inventory-sync/activations`)">
              <ion-icon slot="start" :icon="checkmarkCircleOutline" />
              <ion-label class="ion-text-wrap">
                <h2>{{ translate("Product activation") }}</h2>
                <p>{{ translate("Monitor pending product locations and review the latest Shopify activation confirmations.") }}</p>
              </ion-label>
            </ion-item>
          </ion-list>
        </ion-card>

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
                <p>
                  No inventory channels are mapped for this connection. Aggregate inventory
                  cannot be published until a facility group is mapped to a Shopify location.
                </p>
              </ion-label>
            </ion-item>
          </ion-card>

          <!-- One card per channel. A channel is the unit an operator manages -- it owns a facility
               group, a Shopify location, and its own two schedules -- so its jobs sit on it rather than
               in a shared list that needed the channel's name in brackets to tell rows apart. -->
          <div class="channel-grid">
            <ion-card v-for="channel in inventoryChannels" :key="channel.inventoryChannelId">
              <ion-item lines="full" button detail @click="openChannelEdit(channel)">
                <ion-label class="ion-text-wrap">
                  {{ channel.description || channel.facilityGroupName || channel.facilityGroupId }}
                  <p>{{ channelSubtitle(channel) }}</p>
                </ion-label>
                <ion-label slot="end" class="ion-text-end">
                  {{ channel.shopifyLocationId }}
                  <p>Shopify location</p>
                </ion-label>
              </ion-item>

              <!-- What feeds this channel, and how much of it has actually landed at Shopify lately. -->
              <div class="channel-stats">
                <div class="channel-stat">
                  <ion-note>{{ translate("Feeding this channel") }}</ion-note>
                  <!-- The composition carries its own counts, so a separate total would just repeat one
                       of them on a single-type group. -->
                  <span>{{ channelStats(channel).composition }}</span>
                </div>
                <div class="channel-stat">
                  <ion-note>{{ translate("Delivered in 24h") }}</ion-note>
                  <span>{{ channelStats(channel).delivered }}</span>
                  <p>{{ translate("From cached events") }}</p>
                </div>
              </div>

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
                    <template v-else>
                      {{ translate("Set up") }}
                    </template>
                  </ion-button>
                  <ion-badge slot="end" :color="job.badgeColor">
                    {{ job.status }}
                  </ion-badge>
                </ion-item>
              </ion-list>
            </ion-card>
          </div>
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
            <ion-list lines="none">
              <ion-item>
                <ion-icon slot="start" :icon="locationOutline" />
                <ion-label class="ion-text-wrap">
                  {{ translate("Location event updates") }}
                  <p>{{ translate("Physical inventory, receipts, POS issuances, and location adjustments") }}</p>
                  <p>{{ translate("Applies to every Shopify connection on this OMS") }}</p>
                </ion-label>
                <ion-badge slot="end" :color="locationEventFeedBadgeColor">
                  {{ locationEventFeedStatus }}
                </ion-badge>
                <ion-toggle
                  slot="end"
                  :key="`location-feed-${locationEventFeedPush}-${toggleNonce}`"
                  :aria-label="translate('Use real-time push for Shopify location inventory events')"
                  :checked="locationEventFeedPush"
                  :disabled="locationEventFeedToggleDisabled"
                  @click.prevent="requestLocationEventFeedChange($event)"
                />
              </ion-item>
            </ion-list>
          </ion-card>

          <ion-card>
            <ion-card-header>
              <ion-card-title>Event sources</ion-card-title>
              <ion-card-subtitle>
                {{ translate("Choose which OMS changes each feed records. Turning a source off stops that kind of inventory event being recorded for that feed.") }}
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
                <ion-button slot="end" fill="outline" @click="resyncEventDocuments()">
                  Retry
                </ion-button>
              </ion-item>

              <ion-item v-for="doc in inventoryEventDocuments" :key="doc.dataDocumentId">
                <ion-label class="ion-text-wrap">
                  {{ doc.documentName }}
                  <p>{{ doc.primaryEntityName || doc.dataDocumentId }}</p>
                  <!-- A document the OMS has never heard of cannot be attached, and calling it
                       "off" would send someone hunting for a toggle that will not help. -->
                  <p v-if="doc.missing">
                    Not loaded on this OMS &mdash; run the connector's seed data
                  </p>
                </ion-label>
                <!-- One wrapper so the two feed switches can stack on narrow screens; the toggles carry
                     their own labels, so no text styling is needed here. -->
                <div slot="end" class="event-source-feeds">
                  <ion-toggle
                    :key="`${doc.dataDocumentId}-channel-${doc.channelAttached}-${toggleNonce}`"
                    label-placement="start"
                    :aria-label="eventSourceToggleLabel(doc, SHOPIFY_INVENTORY_EVENT_FEED_ID)"
                    :checked="doc.channelAttached"
                    :disabled="doc.missing || savingDocumentKey === `${SHOPIFY_INVENTORY_EVENT_FEED_ID}:${doc.dataDocumentId}`"
                    @click.prevent="requestDocumentFeedAttachChange(doc, SHOPIFY_INVENTORY_EVENT_FEED_ID)"
                  >
                    {{ translate("Channel") }}
                  </ion-toggle>
                  <ion-toggle
                    v-if="doc.locationSupported"
                    :key="`${doc.dataDocumentId}-location-${doc.locationAttached}-${toggleNonce}`"
                    label-placement="start"
                    :aria-label="eventSourceToggleLabel(doc, SHOPIFY_LOCATION_INVENTORY_EVENT_FEED_ID)"
                    :checked="doc.locationAttached"
                    :disabled="doc.missing || savingDocumentKey === `${SHOPIFY_LOCATION_INVENTORY_EVENT_FEED_ID}:${doc.dataDocumentId}`"
                    @click.prevent="requestDocumentFeedAttachChange(doc, SHOPIFY_LOCATION_INVENTORY_EVENT_FEED_ID)"
                  >
                    {{ translate("Physical location") }}
                  </ion-toggle>
                  <ion-note v-else>{{ translate("Physical location not used") }}</ion-note>
                </div>
              </ion-item>
            </ion-list>
          </ion-card>
        </section>


        <!-- Same run-section/run-carousel structure as every other run list on this page. Outside the
             carousel the badge positioning below does not apply, and "Feed generated" rendered as a
             full-width bar across the card instead of a chip in its corner. -->
        <section class="run-section">
          <div class="section-header">
            <ion-item lines="none">
              <ion-label class="ion-text-wrap">
                <h2>{{ translate('Physical location ATP reset runs') }}</h2>
                <p>{{ translate('Resets available inventory at this shop’s mapped physical locations. Optional job filters restrict facilities and products.') }}</p>
              </ion-label>
            </ion-item>
          </div>
          <div class="run-carousel" aria-label="Physical location ATP reset job runs">
            <ion-card v-for="run in physicalAtpResetRuns" :key="run.id">
              <ion-card-header>
                <ion-card-title>{{ run.id }}</ion-card-title>
                <ion-badge :color="run.importLogId ? 'medium' : run.badgeColor">
                  {{ run.importLogId ? translate('Feed generated') : run.status }}
                </ion-badge>
              </ion-card-header>
              <ion-list lines="full">
                <ion-item>
                  <ion-label class="ion-text-wrap">
                    {{ translate('Started') }}
                    <p>{{ run.started }}</p>
                  </ion-label>
                  <ion-note slot="end">
                    {{ run.duration }}
                  </ion-note>
                </ion-item>
                <InventoryRunDetails
                  :scope="run.parameterScope"
                  :tuning="run.parameterTuning"
                  :result="run.resultRows"
                  :parameters-fallback="run.parameters"
                  :result-fallback="run.result"
                />
              </ion-list>
              <InventoryResetImportResult v-if="run.importLogId" :key="run.importLogId" :log-id="run.importLogId" config-id="RESET_PHYSICAL_LOC_INV" />
            </ion-card>
            <ion-card v-if="jobsHydrated && !physicalAtpResetRuns.length">
              <ion-item lines="none">
                <ion-icon slot="start" :icon="timeOutline" />
                <ion-label class="ion-text-wrap">
                  {{ translate('No recorded physical ATP reset runs') }}
                </ion-label>
              </ion-item>
            </ion-card>
          </div>
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
                <InventoryRunDetails
                  :scope="run.parameterScope"
                  :tuning="run.parameterTuning"
                  :result="run.resultRows"
                  :parameters-fallback="run.parameters"
                  :result-fallback="run.result"
                />
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
                <ion-badge :color="run.importLogId ? 'medium' : run.badgeColor">
                  {{ run.importLogId ? translate('Feed generated') : run.status }}
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
                <InventoryRunDetails
                  :scope="run.parameterScope"
                  :tuning="run.parameterTuning"
                  :result="run.resultRows"
                  :parameters-fallback="run.parameters"
                  :result-fallback="run.result"
                />
              </ion-list>
              <InventoryResetImportResult v-if="run.importLogId" :key="run.importLogId" :log-id="run.importLogId"
                :remote-id="syncContext.remoteId.value || ''" :channels="inventoryChannels" />
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
                    {{ translate("Publishes under") }}
                    <p>{{ batch.reason }}</p>
                  </ion-label>
                  <ion-badge v-if="!batch.reasonMapped" slot="end" color="warning">
                    {{ batch.mixedEventTypes ? translate("Mixed types") : translate("Unmapped") }}
                  </ion-badge>
                </ion-item>
                <ion-item button detail @click="selectedBatch = batch">
                  <ion-label>
                    {{ translate("Change entries") }}
                    <p>{{ translate("Summed from {count} ledger events", { count: batch.eventCount }) }}</p>
                  </ion-label>
                  <ion-badge slot="end" color="medium">
                    {{ batch.entries.length }}
                  </ion-badge>
                </ion-item>
                <ion-item lines="none">
                  <ion-button fill="clear" @click="openMessage(batch)">
                    <ion-icon slot="start" :icon="documentTextOutline" />
                    {{ translate("Message text") }}
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

        <section class="run-section ion-padding-bottom" id="real-time-location-inventory">
          <div class="section-header">
            <ion-item lines="none">
              <ion-label>
                <h2>{{ translate("Location event batches") }}</h2>
                <p>{{ translate("System Messages containing direct location inventory adjustments") }}</p>
              </ion-label>
            </ion-item>
            <ion-button fill="clear" @click="openLocationHistory()">
              <ion-icon slot="start" :icon="listOutline" />
              {{ translate("Event history") }}
            </ion-button>
          </div>
          <div class="run-carousel" aria-label="Location inventory event batches">
            <ion-card v-for="batch in locationBatches" :key="batch.id">
              <ion-card-header>
                <ion-card-title>{{ batch.id }}</ion-card-title>
                <ion-card-subtitle>{{ translate("Location inventory adjustment batch") }}</ion-card-subtitle>
                <ion-badge :color="batch.badgeColor">
                  {{ batch.status }}
                </ion-badge>
              </ion-card-header>
              <ion-list lines="full">
                <ion-item>
                  <ion-label>
                    {{ translate("Created") }}
                    <p>{{ batch.created }}</p>
                  </ion-label>
                  <ion-note slot="end">
                    {{ batch.age }}
                  </ion-note>
                </ion-item>
                <ion-item>
                  <ion-label>
                    {{ translate("Shopify target") }}
                    <p>{{ batch.target }}</p>
                  </ion-label>
                </ion-item>
                <ion-item button detail @click="selectedLocationBatch = batch">
                  <ion-label>
                    {{ translate("Events in this batch") }}
                    <p>{{ batch.detail }}</p>
                  </ion-label>
                  <ion-badge slot="end" color="medium">
                    {{ batch.eventCount }}
                  </ion-badge>
                </ion-item>
                <ion-item lines="none">
                  <ion-button fill="clear" @click="openMessage(batch)">
                    <ion-icon slot="start" :icon="documentTextOutline" />
                    {{ translate("Message text") }}
                  </ion-button>
                  <ion-button slot="end" fill="clear" @click="selectedLocationBatch = batch">
                    {{ translate("View events") }}
                  </ion-button>
                </ion-item>
              </ion-list>
            </ion-card>
            <ion-card v-if="locationInventoryDetailsHydrated && !locationBatches.length">
              <ion-item lines="none">
                <ion-icon slot="start" :icon="timeOutline" />
                <ion-label class="ion-text-wrap">
                  {{ translate("No location event batches") }}
                  <p>{{ translate("No direct location inventory events for this Shopify connection have been assigned to a System Message yet.") }}</p>
                </ion-label>
              </ion-item>
            </ion-card>
          </div>
        </section>
      </ion-content>
    </template>

    <template v-else-if="activeView === 'location-history'">
      <ion-header>
        <ion-toolbar>
          <ion-buttons slot="start">
            <ion-back-button :default-href="`/shopify-connection-details/${props.id}/inventory-sync`" />
          </ion-buttons>
          <ion-title>{{ translate("Location inventory history") }}</ion-title>
        </ion-toolbar>
      </ion-header>

      <ion-content class="ion-padding-horizontal">
        <main class="history-page">
          <div class="kpi-grid">
            <ion-card button @click="locationFilterState = 'unassigned'">
              <ion-card-header>
                <ion-card-subtitle>{{ translate("Unassigned backlog") }}</ion-card-subtitle>
                <ion-card-title :color="unassignedBacklogWarn ? 'warning' : undefined">
                  {{ unassignedNonZeroCount }}
                </ion-card-title>
              </ion-card-header>
              <ion-card-content>
                {{ translate("Location adjustments not yet linked to a batch") }}
                <p v-if="oldestUnassignedAgeLabel" class="overline">
                  <ion-badge v-if="unassignedBacklogWarn" color="warning">{{ translate("Oldest") }}: {{ oldestUnassignedAgeLabel }}</ion-badge>
                  <template v-else>{{ translate("Oldest") }}: {{ oldestUnassignedAgeLabel }}</template>
                </p>
              </ion-card-content>
            </ion-card>
            <ion-card button @click="locationFilterState = 'SmsgError'">
              <ion-card-header>
                <ion-card-subtitle>{{ translate("Delivery errors") }}</ion-card-subtitle>
                <!-- An absent count is not zero. Say so, the way the no-op/quarantined card does,
                     rather than rendering an empty title that reads as "none". -->
                <ion-card-title :color="locationDeliveryErrorCount ? 'danger' : undefined">
                  {{ locationDeliveryErrorCount ?? translate("Not available") }}
                </ion-card-title>
              </ion-card-header>
              <ion-card-content>{{ translate("Details linked to a System Message in error") }}</ion-card-content>
            </ion-card>
            <ion-card>
              <ion-card-header>
                <ion-card-subtitle>{{ translate("No-op / quarantined") }}</ion-card-subtitle>
                <ion-card-title>{{ locationNoOpOrQuarantinedCount }}</ion-card-title>
              </ion-card-header>
              <ion-card-content>{{ translate("Zero-change details or details quarantined in a cancelled SystemMessage") }}</ion-card-content>
            </ion-card>
            <ion-card>
              <ion-card-header>
                <ion-card-subtitle>{{ translate("Publish job") }}</ion-card-subtitle>
                <ion-card-title v-if="!jobsHydrated">
                  <ion-skeleton-text :animated="true" class="count-skeleton" />
                </ion-card-title>
                <ion-card-title v-else :color="locationPublishJobBadgeColor">{{ locationPublishJobStatus }}</ion-card-title>
              </ion-card-header>
              <ion-card-content>
                {{ translate("publish_PendingShopifyLocationInventoryAdjustments") }}
                <p v-if="locationPublishJobNextRun" class="overline">
                  {{ translate("Next run") }} {{ formatDateTime(locationPublishJobNextRun) || translate("Not available") }}
                </p>
              </ion-card-content>
            </ion-card>
          </div>

          <ion-card class="history-filter-card">
            <ion-card-content>
              <ion-searchbar
                v-model="locationHistoryQuery"
                class="history-search"
                :debounce="250"
                :placeholder="translate('Search event reference, location, or inventory item')"
              />

              <div class="filter-grid">
                <div class="filter-item">
                  <ion-select
                    :value="locationFilterLocationId"
                    :label="translate('Location')"
                    label-placement="stacked"
                    fill="outline"
                    interface="popover"
                    :placeholder="translate('All')"
                    @ion-change="locationFilterLocationId = $event.detail.value || ''"
                  >
                    <ion-select-option value="">{{ translate("All") }}</ion-select-option>
                    <ion-select-option v-for="option in locationLocationOptions" :key="option" :value="option">
                      {{ option }}
                    </ion-select-option>
                  </ion-select>
                  <ion-button v-if="locationFilterLocationId" fill="clear" class="clear-filter-button" :aria-label="translate('Clear location filter')" @click.stop="locationFilterLocationId = ''">
                    <ion-icon slot="icon-only" :icon="closeCircleOutline" />
                  </ion-button>
                </div>
                <div class="filter-item">
                  <ion-select
                    :value="locationFilterEventType"
                    :label="translate('Event type')"
                    label-placement="stacked"
                    fill="outline"
                    interface="popover"
                    :placeholder="translate('All')"
                    @ion-change="locationFilterEventType = $event.detail.value || ''"
                  >
                    <ion-select-option value="">{{ translate("All") }}</ion-select-option>
                    <ion-select-option v-for="option in locationEventTypeOptions" :key="option" :value="option">
                      {{ option }}
                    </ion-select-option>
                  </ion-select>
                  <ion-button v-if="locationFilterEventType" fill="clear" class="clear-filter-button" :aria-label="translate('Clear event type filter')" @click.stop="locationFilterEventType = ''">
                    <ion-icon slot="icon-only" :icon="closeCircleOutline" />
                  </ion-button>
                </div>
                <div class="filter-item">
                  <ion-select
                    :value="locationFilterState"
                    :label="translate('Delivery state')"
                    label-placement="stacked"
                    fill="outline"
                    interface="popover"
                    :placeholder="translate('All')"
                    @ion-change="locationFilterState = $event.detail.value || ''"
                  >
                    <ion-select-option value="">{{ translate("All") }}</ion-select-option>
                    <ion-select-option v-for="option in locationStateOptions" :key="option.id" :value="option.id">
                      {{ option.label }}
                    </ion-select-option>
                  </ion-select>
                  <ion-button v-if="locationFilterState" fill="clear" class="clear-filter-button" :aria-label="translate('Clear delivery state filter')" @click.stop="locationFilterState = ''">
                    <ion-icon slot="icon-only" :icon="closeCircleOutline" />
                  </ion-button>
                </div>
                <div class="filter-item">
                  <ion-item lines="none" class="date-filter-item">
                    <ion-label>{{ translate("From") }}</ion-label>
                    <input slot="end" type="date" :aria-label="translate('From date')" v-model="locationFilterFrom" />
                  </ion-item>
                </div>
                <div class="filter-item">
                  <ion-item lines="none" class="date-filter-item">
                    <ion-label>{{ translate("To") }}</ion-label>
                    <input slot="end" type="date" :aria-label="translate('To date')" v-model="locationFilterTo" />
                  </ion-item>
                </div>
              </div>
            </ion-card-content>
          </ion-card>

          <div class="history-results-header">
            <ion-item lines="none">
              <ion-label>
                <h2>{{ translate("Location event history") }}</h2>
                <p>{{ translate("A list of direct location inventory adjustment events and their delivery states") }}</p>
              </ion-label>
            </ion-item>
            <ion-badge color="medium">
              {{ filteredLocationDetailRows.length }} {{ translate("shown") }}
            </ion-badge>
          </div>

          <ion-card v-if="inventorySyncError"><ion-card-content>{{ translate("Refresh failed. Showing previously loaded data.") }} {{ inventorySyncError }}</ion-card-content></ion-card>
          <ion-segment :value="locationHistoryMode" @ion-change="changeLocationMode(String($event.detail.value))">
            <ion-segment-button value="events"><ion-label>{{ translate("All events") }}</ion-label></ion-segment-button>
            <ion-segment-button value="batches"><ion-label>{{ translate("Grouped by batch") }}</ion-label></ion-segment-button>
          </ion-segment>
          <ion-accordion-group v-if="locationHistoryMode === 'batches' && filteredLocationDetailRows.length">
            <ion-accordion v-for="batch in filteredLocationBatches.slice(0, locationVisibleCount)" :key="batch.id" :value="batch.id">
              <ion-item slot="header"><ion-label>{{ batch.label }}<p>{{ batch.rows.length }} {{ translate("events") }} · {{ translate("Net adjustment") }} {{ batch.net }}</p><p>{{ batch.target }} · {{ formatDateTime(batch.created) }}</p></ion-label><ion-badge slot="end">{{ batch.state }}</ion-badge></ion-item>
              <ion-list slot="content">
                <ion-item v-if="batch.id !== 'unassigned'"><ion-button fill="clear" @click="openMessage(locationBatches.find(entry => entry.id === batch.id)!)">{{ translate("Message text") }}</ion-button></ion-item>
                <ion-item v-for="row in batch.rows" :key="row.rowKey" button @click="selectedLocationDetail = row">
                  <ion-label>{{ row.eventTypeDescription || row.eventTypeId }}<p>{{ row.eventReferenceId }} · {{ row.shopifyLocationId }} · {{ row.shopifyInventoryItemId }}</p><p>{{ formatDateTime(row.createdDate) }}</p></ion-label>
                  <ion-note slot="end">{{ row.computedInventoryChange }}</ion-note>
                </ion-item>
              </ion-list>
            </ion-accordion>
          </ion-accordion-group>
          <ion-card v-else-if="locationInventoryDetailsHydrated && !filteredLocationDetailRows.length">
            <ion-card-content>{{ translate("No location inventory events match this view.") }}</ion-card-content>
          </ion-card>

          <ion-list v-else lines="full">
            <ion-item
              v-for="row in filteredLocationDetailRows.slice(0, locationVisibleCount)"
              :key="row.rowKey"
              button
              detail
              @click="selectedLocationDetail = row"
            >
              <ion-label class="ion-text-wrap">
                {{ row.eventTypeDescription || row.eventTypeId }}
                <p>{{ row.eventReferenceId }}</p>
              </ion-label>
              <ion-label slot="end">
                {{ row.shopifyLocationId }}
                <p>{{ translate("Location") }}</p>
              </ion-label>
              <ion-label slot="end">
                {{ row.shopifyInventoryItemId }}
                <p>{{ translate("Inventory item") }}</p>
              </ion-label>
              <ion-note slot="end" :color="row.computedInventoryChange < 0 ? 'danger' : 'success'">
                {{ row.computedInventoryChange > 0 ? "+" : "" }}{{ row.computedInventoryChange }}
              </ion-note>
              <ion-label slot="end">
                {{ formatDateTime(row.createdDate) || translate("Not available") }}
                <p>{{ translate("Created") }}</p>
              </ion-label>
              <ion-badge slot="end" :color="row.stateColor">{{ row.stateLabel }}</ion-badge>
            </ion-item>
          </ion-list>

          <ion-button v-if="(locationHistoryMode === 'batches' ? filteredLocationBatches.length : filteredLocationDetailRows.length) > locationVisibleCount" expand="block" fill="clear" @click="locationVisibleCount += 50">{{ translate("Load more") }}</ion-button>
          <ion-card>
            <ion-card-header>
              <ion-card-title>{{ translate("Mapping gaps") }}</ion-card-title>
              <ion-card-subtitle>{{ translate("Locations excluded from real-time push, intentionally or otherwise") }}</ion-card-subtitle>
            </ion-card-header>
            <ion-list lines="full">
              <ion-item v-if="!shopInventoryPush" lines="none">
                <ion-label class="ion-text-wrap" color="medium">
                  {{ shopDisplayName }}
                  <p>{{ translate("Real-time inventory push is off for this connection (intentional opt-out)") }}</p>
                </ion-label>
              </ion-item>
              <ion-item lines="none">
                <ion-label class="ion-text-wrap">
                  <p>{{ translate("Not available") }}</p>
                  <p>{{ translate("This OMS does not yet expose recent unusable location mapping omissions from posting-run outputs.") }}</p>
                </ion-label>
              </ion-item>
            </ion-list>
          </ion-card>
        </main>
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
                :placeholder="translate('Search event type, source record, inventory item, location, reason, or batch')"
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
                <h2>{{ translate("Inventory adjustment events") }}</h2>
                <p>{{ translate("The newest 500 events for this connection, plus every event still waiting to batch or sitting in an unsent batch. Settled events are purged after five days, so this is a working window rather than a full history.") }}</p>
              </ion-label>
            </ion-item>
            <ion-badge color="medium">
              {{ historyEvents.length }} shown
            </ion-badge>
          </div>

          <div v-if="historyEvents.length" ref="eventScrollerRef" class="event-scroller" @scroll.passive="onEventScroll">
            <div :style="{ height: `${eventTopSpacer}px` }" aria-hidden="true" />

            <div
              v-for="event in virtualEvents"
              :key="event.rowKey"
              data-virtual-row
              class="list-item"
              role="button"
              tabindex="0"
              :aria-label="translate('View event details')"
              @click="selectedEvent = event"
              @keydown.enter="selectedEvent = event"
              @keydown.space.prevent="selectedEvent = event"
            >
              <ion-item lines="none">
                <ion-thumbnail slot="start">
                  <DxpShopifyImg :src="event.productImageUrl" size="small" />
                </ion-thumbnail>
                <ion-label class="ion-text-wrap">
                  <span class="one-line">{{ event.productName || translate("Item {id}", { id: event.shopifyInventoryItem }) }}</span>
                  <p>{{ productSecondaryLine(event) }}</p>
                  <!-- Below 991px the grid keeps only this cell and the button, so the columns that
                       disappear have to say their piece here or the row stops being readable. -->
                  <p class="row-summary">
                    {{ event.change }} &middot; {{ sourceLine(event) }}
                  </p>
                </ion-label>
              </ion-item>

              <ion-label>
                <span class="change" :class="{ 'change-up': event.delta > 0, 'change-down': event.delta < 0 }">
                  {{ event.change }}
                </span>
                <p class="one-line">{{ event.locationLabel }}</p>
              </ion-label>

              <ion-label class="event-cell ion-text-wrap">
                <span class="one-line">{{ event.type }}</span>
                <p>{{ sourceLine(event) }}{{ event.sourcePhase ? ` · ${event.sourcePhase}` : "" }}</p>
              </ion-label>

              <!-- Ledger lifecycle and Shopify delivery stay two chips: an unbatched row has only
                   the first, and collapsing them would hide "quarantined, never batches" behind the
                   same chip as "batched, mutation rejected". The chips sit on ONE line and the
                   message id on the next, so a row with one chip is exactly as tall as a row with
                   two -- the virtualiser sizes every spacer from a single measured row. -->
              <ion-label class="status-cell">
                <span class="status-chips">
                  <ion-badge :color="event.detailStateColor">
                    {{ event.detailState }}
                  </ion-badge>
                  <ion-badge v-if="event.delivery" :color="event.deliveryColor">
                    {{ event.delivery }}
                  </ion-badge>
                </span>
                <span v-if="event.batchId" class="one-line batch-id">{{ event.batchId }}</span>
                <ion-note v-else class="one-line">{{ translate("Not batched") }}</ion-note>
              </ion-label>

            </div>

          <div :style="{ height: `${eventBottomSpacer}px` }" aria-hidden="true" />
          </div>

          <!-- "Nothing here" is a claim about the data, so it may only be made once the ledger is
               readable. Before that, say the cache has not loaded rather than that the history is empty. -->
          <ion-card v-else-if="pipelineReadable">
            <ion-item lines="none">
              <ion-icon slot="start" :icon="timeOutline" />
              <ion-label class="ion-text-wrap">
                {{ translate("No inventory events match this view") }}
                <p>{{ translate("Clear the filters, or wait for the OMS to calculate an aggregate inventory event for this Shopify connection.") }}</p>
              </ion-label>
            </ion-item>
          </ion-card>

          <ion-card v-else>
            <ion-item lines="none">
              <ion-icon slot="start" :icon="warningOutline" color="medium" />
              <ion-label class="ion-text-wrap">
                {{ translate("Not loaded") }}
                <p>{{ translate("The inventory event cache has not loaded yet. This is not a confirmed empty history.") }}</p>
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
            <ion-label class="ion-text-wrap">
              {{ translate("Event type") }}<p>{{ selectedEvent?.type }}</p>
            </ion-label>
            <ion-badge slot="end" :color="selectedEvent?.detailStateColor">
              {{ selectedEvent?.detailState }}
            </ion-badge>
          </ion-item>
          <!-- The reference is its own field, not half of a composed key: it is the source row's
               natural key, and for the effective-date families it carries the lifecycle phase too. -->
          <ion-item>
            <ion-label class="ion-text-wrap">
              {{ translate("Source record") }}
              <p>{{ selectedEvent?.sourceLabel }}</p>
              <p v-if="selectedEvent?.sourcePhase">
                {{ translate("Effective-date boundary this row crossed: {phase}", { phase: selectedEvent?.sourcePhase }) }}
              </p>
            </ion-label>
          </ion-item>
          <ion-item v-if="selectedEvent && selectedArtifact">
            <ion-label class="ion-text-wrap">
              {{ translate("Came from") }}
              <p v-if="selectedArtifact.label">
                {{ selectedArtifact.label }}
              </p>
              <p v-if="selectedArtifact.actor">
                {{ translate("Recorded by {actor}", { actor: selectedArtifact.actor }) }}
              </p>
              <p v-if="selectedArtifact.note">
                {{ selectedArtifact.note }}
              </p>
              <p v-if="selectedArtifact.unresolved">
                {{ selectedArtifact.unresolved }}
              </p>
            </ion-label>
          </ion-item>
          <ion-item v-if="selectedEvent?.showRawReference">
            <ion-label class="ion-text-wrap">
              {{ translate("Ledger event reference") }}
              <p>{{ selectedEvent?.eventReferenceId }}</p>
            </ion-label>
          </ion-item>
          <ion-item>
            <ion-label class="ion-text-wrap">
              {{ translate("Product") }}
              <p>{{ selectedEvent?.productName || translate("Not resolved") }}</p>
              <p v-if="selectedEvent?.productSku">
                {{ selectedEvent?.productSku }}
              </p>
              <p v-if="selectedEvent?.productId">
                {{ translate("HotWax product {id}", { id: selectedEvent?.productId }) }}
              </p>
            </ion-label>
            <ion-note slot="end">
              {{ selectedEvent?.change }}
            </ion-note>
          </ion-item>
          <ion-item>
            <ion-label>Shopify inventory item<p>{{ selectedEvent?.shopifyInventoryItem || 'Unknown item' }}</p></ion-label>
          </ion-item>
          <ion-item>
            <ion-label class="ion-text-wrap">
              {{ translate("Inventory channel") }}<p>{{ selectedEvent?.channelLabel }}</p>
            </ion-label>
          </ion-item>
          <ion-item>
            <ion-label class="ion-text-wrap">
              {{ translate("Shopify location") }}
              <p>{{ selectedEvent?.locationLabel }}</p>
              <p v-if="selectedEvent?.locationId">
                {{ translate("Shopify location {id}", { id: selectedEvent?.locationId }) }}
              </p>
              <p v-if="selectedEvent?.retargetLocationId">
                {{ translate("This delta was calculated against the location the channel has since stopped pointing at, and publishes there rather than to the channel's current one.") }}
              </p>
            </ion-label>
            <ion-badge v-if="selectedEvent?.retargetLocationId" slot="end" color="danger">
              {{ translate("Retarget drain") }}
            </ion-badge>
          </ion-item>
          <ion-item>
            <ion-label class="ion-text-wrap">
              {{ translate("Publishes under") }}<p>{{ selectedEvent?.reason }}</p>
            </ion-label>
            <ion-badge v-if="selectedEvent && !selectedEvent.reasonMapped" slot="end" color="warning">
              {{ translate("Unmapped") }}
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
              {{ translate("How this delta was calculated") }}
              <p>{{ selectedEvent?.calculation || translate("No calculation comment recorded") }}</p>
            </ion-label>
          </ion-item>
          <ShopifyInventorySnapshot v-if="selectedEvent" :key="selectedEvent.rowKey"
            :remote-id="syncContext.remoteId.value || ''"
            :inventory-item-id="selectedEvent.shopifyInventoryItem || ''"
            :location-id="selectedEvent.locationId || ''" />
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
              {{ translate("Inventory channel") }}
              <p>{{ selectedBatch?.channel }}</p>
            </ion-label>
            <ion-badge slot="end" :color="selectedBatch?.badgeColor">
              {{ selectedBatch?.status }}
            </ion-badge>
          </ion-item>
          <ion-item>
            <ion-label class="ion-text-wrap">
              {{ translate("Publishes under") }}
              <p>{{ selectedBatch?.reason }}</p>
            </ion-label>
            <ion-badge v-if="selectedBatch && !selectedBatch.reasonMapped" slot="end" color="warning">
              {{ selectedBatch.mixedEventTypes ? translate("Mixed types") : translate("Unmapped") }}
            </ion-badge>
          </ion-item>
          <ion-item>
            <ion-label class="ion-text-wrap">
              Included events
              <p>{{ translate("Each keeps its own event type and reference") }}</p>
            </ion-label>
            <ion-label slot="end">
              {{ selectedBatch?.eventCount }}
            </ion-label>
          </ion-item>

          <!-- What the mutation carried: the deltas above, summed per (inventory item, location). -->
          <ion-list-header>
            <ion-label>{{ translate("Change entries") }}</ion-label>
          </ion-list-header>
          <ion-item v-for="entry in selectedBatch?.entries ?? []" :key="entry.key">
            <ion-label class="ion-text-wrap">
              {{ entry.productLabel }}
              <p>{{ entry.productSku }}</p>
              <p>{{ translate("{location}, item {item}", { location: entry.locationLabel, item: entry.shopifyInventoryItem }) }}</p>
              <p>{{ translate("{count} events summed", { count: entry.eventCount }) }}</p>
            </ion-label>
            <ion-note slot="end">
              {{ entry.change }}
            </ion-note>
          </ion-item>

          <!-- Why it has not landed. Without this a failed batch reads as merely "not sent yet". -->
          <template v-if="batchErrors.length">
            <ion-list-header>
              <ion-label>Delivery errors</ion-label>
            </ion-list-header>
            <ion-item v-for="(err, i) in batchErrors" :key="err.errorDate ?? i">
              <ion-icon slot="start" :icon="warningOutline" color="danger" />
              <ion-label class="ion-text-wrap">
                {{ err.errorText }}
                <p>{{ translate("Attempted {status} at {at}", { status: statusLabel(err.attemptedStatusId), at: formatDateTime(toMillis(err.errorDate)) }) }}</p>
              </ion-label>
            </ion-item>
          </template>
          <ion-item v-else-if="loadingBatchErrors" lines="none">
            <ion-spinner slot="start" name="crescent" />
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
              <p>{{ translate("Item {id} at {location}", { id: event.shopifyInventoryItem, location: event.locationLabel }) }}</p>
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
              <p>{{ messageById.get(String(messageBatch?.id ?? ''))?.systemMessageTypeId || 'ShopifyInventoryAdjustment' }}</p>
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

    <ion-modal :is-open="!!selectedLocationDetail" @did-dismiss="selectedLocationDetail = null">
      <ion-header>
        <ion-toolbar>
          <ion-buttons slot="start">
            <ion-button :aria-label="translate('Close')" @click="selectedLocationDetail = null">
              <ion-icon slot="icon-only" :icon="closeOutline" />
            </ion-button>
          </ion-buttons>
          <ion-title>{{ translate("Location inventory event") }}</ion-title>
        </ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding" v-if="selectedLocationDetail">
        <ion-list lines="full">
          <ion-item>
            <ion-label>{{ translate("Event type") }}</ion-label>
            <ion-note slot="end">{{ selectedLocationDetail.eventTypeDescription || selectedLocationDetail.eventTypeId }}</ion-note>
          </ion-item>
          <ion-item>
            <ion-label>{{ translate("Delivery state") }}</ion-label>
            <ion-badge slot="end" :color="selectedLocationDetail.stateColor">{{ selectedLocationDetail.stateLabel }}</ion-badge>
          </ion-item>
          <ion-item lines="none">
            <ion-label class="ion-text-wrap">
              {{ translate("Decision comment") }}
              <p>{{ selectedLocationDetail.decisionComment || translate("Not available") }}</p>
            </ion-label>
          </ion-item>
          <ion-item v-if="locationDetailErrorText" lines="none">
            <ion-label class="ion-text-wrap">
              <ion-text color="danger">
                {{ translate("Linked message error") }}
                <p>{{ locationDetailErrorText }}</p>
              </ion-text>
            </ion-label>
          </ion-item>
          <ShopifyInventorySnapshot :key="selectedLocationDetail.rowKey"
            :remote-id="syncContext.remoteId.value || ''"
            :inventory-item-id="selectedLocationDetail.shopifyInventoryItemId || ''"
            :location-id="selectedLocationDetail.shopifyLocationId || ''" />
        </ion-list>
      </ion-content>
    </ion-modal>

    <ion-modal :is-open="!!selectedLocationBatch" @did-dismiss="selectedLocationBatch = null">
      <ion-header>
        <ion-toolbar>
          <ion-buttons slot="start">
            <ion-button :aria-label="translate('Close batch events')" @click="selectedLocationBatch = null">
              <ion-icon slot="icon-only" :icon="closeOutline" />
            </ion-button>
          </ion-buttons>
          <ion-title>{{ translate("Events in") }} {{ selectedLocationBatch?.id }}</ion-title>
        </ion-toolbar>
      </ion-header>
      <ion-content>
        <ion-list lines="full">
          <ion-item>
            <ion-label>
              {{ translate("Shopify target") }}
              <p>{{ selectedLocationBatch?.target }}</p>
            </ion-label>
            <ion-badge slot="end" :color="selectedLocationBatch?.badgeColor">
              {{ selectedLocationBatch?.status }}
            </ion-badge>
          </ion-item>
          <ion-item>
            <ion-label>
              {{ translate("Included events") }}
              <p>{{ translate("Every event retains its original HotWax event key") }}</p>
            </ion-label>
            <ion-label slot="end">
              {{ selectedLocationBatch?.eventCount }}
            </ion-label>
          </ion-item>
          <ion-list-header>
            <ion-label>{{ translate("Event details") }}</ion-label>
          </ion-list-header>
          <ion-item
            v-for="event in eventsForSelectedLocationBatch"
            :key="event.rowKey"
            button
            detail
            @click="selectedLocationDetail = event"
          >
            <ion-label class="ion-text-wrap">
              {{ event.eventTypeDescription || event.eventTypeId }}
              <p>{{ event.eventReferenceId }}</p>
            </ion-label>
            <ion-label slot="end">
              {{ event.shopifyInventoryItemId }}
              <p>{{ translate("Inventory item") }}</p>
            </ion-label>
            <ion-note slot="end" :color="event.computedInventoryChange < 0 ? 'danger' : 'success'">
              {{ event.computedInventoryChange > 0 ? "+" : "" }}{{ event.computedInventoryChange }}
            </ion-note>
            <ion-badge slot="end" :color="event.stateColor">
              {{ event.stateLabel }}
            </ion-badge>
          </ion-item>
        </ion-list>
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
import { DxpShopifyImg, commonUtil, logger, translate, useProducts } from "@common";
import {
  IonAccordion, IonAccordionGroup, IonBackButton, IonBadge, IonButton, IonButtons, IonCard,
  IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonContent, IonDatetime,
  IonDatetimeButton, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonListHeader, IonModal, IonNote,
  IonPage, IonPopover, IonSearchbar, IonSegment, IonSegmentButton, IonSelect, IonSelectOption,
  IonSkeletonText, IonSpinner, IonText, IonTextarea, IonThumbnail, IonTitle, IonToggle, IonToolbar,
  alertController,
  modalController, onIonViewDidLeave, onIonViewWillEnter,
} from "@ionic/vue";
import {
  addOutline, checkmarkCircleOutline,
  closeCircleOutline, closeOutline, cloudUploadOutline, documentTextOutline,
  layersOutline, listOutline, locationOutline,
  refreshOutline, sendOutline, storefrontOutline, timeOutline, trashBinOutline, trashOutline,
  warningOutline,
} from "ionicons/icons";
import { DateTime } from "luxon";
import {
  computed,
  nextTick,
  ref,
  watch,
} from "vue";
import { useRouter } from "vue-router";
import InventoryResetImportResult from "@/components/shopify/InventoryResetImportResult.vue";
import InventoryRunDetails from "@/components/shopify/InventoryRunDetails.vue";
import ShopifyInventorySnapshot from "@/components/shopify/ShopifyInventorySnapshot.vue";
import ServiceJobDetailsModal from "@/components/common/ServiceJobDetailsModal.vue";
import EditInventoryChannelModal from "@/components/shopify/EditInventoryChannelModal.vue";
import SetupInventoryChannelModal from "@/components/shopify/SetupInventoryChannelModal.vue";
import { useCachedList } from "@/composables/useCachedList";
import { useCacheSync } from "@/composables/useCacheSync";
import { useEffectiveNow } from "@/composables/useEffectiveNow";
import { useFacilityTypes } from "@/composables/useFacilities";
import { useStatuses } from "@/composables/useSeed";
import { useServiceJobRunsByJob, useServiceJobs } from "@/composables/useServiceJobs";
import {
  DISCARD_PENDING_EVENTS_SERVICE,
  INVENTORY_ADJUSTMENT_MESSAGE_TYPE,
  type InventoryEventDocument,
  type InventoryEventSourceLookup,
  PRODUCED_SENDER_SERVICE,
  SHOPIFY_INVENTORY_EVENT_FEED_ID,
  SHOPIFY_LOCATION_INVENTORY_EVENT_FEED_ID,
  SHOPIFY_INVENTORY_EVENT_FEED_MANUAL,
  SHOPIFY_INVENTORY_EVENT_FEED_PUSH,
  ensureChannelEventDiscardJob,
  ensureChannelEventPublisherJob,
  ensureChannelResetJob,
  ensureInventoryAdjustmentSenderJob,
  ensureShopPhysicalInventoryResetJob,
  ensureShopPhysicalAtpResetJob,
  PHYSICAL_ATP_RESET_SERVICE,
  fetchLocationsFromShopify,
  setInventoryEventDocumentAttachedForFeed,
  updateShopifyInventoryEventFeedType,
  updateShopifyLocationInventoryEventFeedType,
  useInventoryEventDocuments,
  useInventoryEventSources,
  useShopifyShopMutations,
  useShopifySyncContext,
} from "@/composables/useShopify";
import { useSystemMessage } from "@/composables/useSystemMessage";
import { useVirtualRows } from "@/composables/useVirtualRows";
import { resyncDomain } from "@/services/appCacheBootstrap";
import { formatDateTime } from "@/utils";
import {
  dataFeedCache,
  groupFacilityCache,
  inventoryChannelCache,
  shopifyInventoryAdjustmentDetailCache,
  shopifyLocationInventoryAdjustmentDetailCache,
  shopifyLocationInventorySummaryCache,
  shopifyShopCache,
  systemMessageCache,
} from "@/utils/cacheEntities";
import { isEffectiveNow } from "@/utils/cacheProjection";
import { parameterMap } from "@/utils/serviceJob";
import { describeRunParameters, describeRunResult } from "@/utils/serviceJobRun";
import { locationInventoryDeliveryErrorCount } from "@/utils/shopifyLocationInventory";
import type { PipelineSectionId } from "@/utils/shopifyInventoryPipeline";
import {
  deliveryStatusOf,
  deltaOutcome,
  isDeliveryTerminalFailure,
  isWaitingDetail,
  roundDelta,
  sectionOfBatch,
  sectionOfEvent,
  sumDelta,
} from "@/utils/shopifyInventoryPipeline";

type ViewName = "monitor" | "history" | "location-history";
type HistoryMode = "events" | "batches" | "unassigned";

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
  /** The raw ledger rows behind the batch, so a filtered view can restate its summed entries. */
  details: any[];
  /** Rejected or cancelled: nothing will retry this batch on its own. */
  terminalFailure: boolean;
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
  /** The raw DETAIL_* id behind `detailState`. Sections branch on this, never on the translated label. */
  detailStatusId: string;
  /** SystemMessage delivery, present only once the row has been assigned to a batch. */
  delivery?: string;
  deliveryColor?: string;
  /** The raw SmsgProduced/Sending/Sent/Error id. Sections branch on this, never on the label. */
  deliveryStatusId?: string;
  /** Rejected or cancelled: failed and NOT retryable, unlike SmsgError which the sweep picks up again. */
  deliveryTerminalFailure: boolean;
  /**
   * Which pipeline section owns this row, from `sectionOfEvent`. Every row gets exactly one, including
   * statuses this app has never seen — the rule is total so nothing can fall off the page.
   */
  section: PipelineSectionId;
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
  /** Solr's `mainImageUrl`; empty until the lookup lands, which DxpShopifyImg renders as its placeholder. */
  productImageUrl: string;
  /** The variant's own name, kept only when it differs from the parent -- "S" beside "Tencel Shirt". */
  productVariant: string;
  /** The calculation itself, e.g. "publishable ATP 40.0 -> 41.0." */
  calculation: string;
}

const props = defineProps<{ id?: string; initialView?: ViewName; initialHistoryMode?: HistoryMode }>();
const router = useRouter();

const activeView = ref<ViewName>(props.initialView ?? "monitor");
const historyMode = ref<HistoryMode>(props.initialHistoryMode ?? "events");
const historyQuery = ref("");
const locationHistoryQuery = ref("");
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
const ABSOLUTE_CHANNEL_RESET_SERVICE = "co.hotwax.sob.product.InventoryServices.generate#InventoryChannelInventoryFeed";
const PHYSICAL_RESET_MESSAGE_TYPE = "ResetInventoryQoh";
const PURGE_DETAILS_SERVICE = "co.hotwax.sob.product.InventoryServices.purge#OldShopifyInventoryAdjustmentDetails";
const PURGE_LOCATION_DETAILS_SERVICE = "co.hotwax.sob.product.InventoryServices.purge#OldShopifyLocationInventoryAdjustmentDetails";

const syncContext = useShopifySyncContext(() => props.id);
const { jobs: cachedJobs, hydrated: jobsHydrated } = useServiceJobs();
const { records: cachedDataFeeds, hydrated: dataFeedsHydrated } = useCachedList<any>(dataFeedCache);
const { records: allInventoryChannels, hydrated: inventoryChannelsHydrated } = useCachedList<any>(inventoryChannelCache);
const { records: allInventoryDetails, hydrated: inventoryDetailsHydrated } = useCachedList<any>(shopifyInventoryAdjustmentDetailCache);
const { records: cachedSystemMessages } = useCachedList<any>(systemMessageCache);
// Class B, so a local read. The two scoped inventory-history mounts need a facilityId, and the ledger
// carries a facility GROUP because the event is aggregate; these are the candidates to search.
const { records: cachedGroupFacilities } = useCachedList<any>(groupFacilityCache);
/**
 * A membership crossing its `fromDate` or `thruDate` while the page is open has to re-trigger the
 * computeds that read it. `Date.now()` is a snapshot, so an expired facility stayed in the channel's
 * composition and in the source-resolution search until some unrelated cache write happened.
 */
const groupFacilitiesEffectiveNow = useEffectiveNow(cachedGroupFacilities);
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
  if(!shopId) {return;}
  try {
    const nodes = await fetchLocationsFromShopify(shopId);
    const names = new Map<string, string>();
    for(const node of nodes) {
      // The node id is a GID; the ledger and the channel both carry the bare numeric id.
      const locationId = String(node?.id ?? "").split("/").pop() ?? "";
      const name = String(node?.name ?? "").trim();
      if(locationId && name) {names.set(locationId, name);}
    }
    shopifyLocationNames.value = names;
  } catch (error) {
    logger.warn("Location [Shopify] - Could not read location names; falling back to location ids", error);
  }
}

// Optional chaining on purpose: this getter runs at setup, before anything guarantees the context has
// settled, and a caller that stubs the context without a shopId should not take the whole view down.
watch(() => syncContext.shopId?.value, (shopId) => {
  if(shopId) {void loadShopifyLocationNames();}
}, { immediate: true });

const { products: resolvedProducts, resolve: resolveProductNames } = useProducts();
const { sources: resolvedSources, resolve: resolveSourceNames, sourceKeyOf } = useInventoryEventSources();

/** Effective member facilities of a channel's group, which is what a scoped lookup can search. */
const facilityIdsByGroup = computed(() => {
  const byGroup = new Map<string, string[]>();
  for(const member of cachedGroupFacilities.value) {
    if(!isEffectiveNow(member, groupFacilitiesEffectiveNow.value)) {continue;}
    const group = String(member.facilityGroupId ?? "");
    const facilityId = String(member.facilityId ?? "");
    if(!group || !facilityId) {continue;}
    const bucket = byGroup.get(group);
    if(bucket) {bucket.push(facilityId);} else {byGroup.set(group, [facilityId]);}
  }

  return byGroup;
});

function lookupFor(event: InventoryEvent): InventoryEventSourceLookup {
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

/**
 * The identifiers under the product name, on ONE line. SKU and variant are both qualifiers on the same
 * product, so they read as one secondary line rather than two; the ledger's own item id stands in when
 * Solr has resolved nothing, because that id is the row's real identity.
 */
function productSecondaryLine(event: InventoryEvent): string {
  return [event.productSku, event.productVariant].filter(Boolean).join(" \u00b7 ") ||
    event.productId || event.shopifyInventoryItem;
}

const { labelFor: statusDescriptionFor } = useStatuses();
const { ensureSystemMessageErrors, ensureSystemMessageById, resendSystemMessage } = useSystemMessage();

const batchErrors = ref<any[]>([]);
const loadingBatchErrors = ref(false);
const resendingBatch = ref(false);

// Errors are class C - only failed messages have any - so they are fetched when a batch is opened.
watch(() => selectedBatch.value?.id, async (systemMessageId) => {
  batchErrors.value = [];
  if(!systemMessageId) {return;}
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
  if(!systemMessageId) {return;}
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
  if(!dataFeedsHydrated.value) {return "Loading";}
  if(!inventoryEventFeed.value) {return "Not configured";}
  if(inventoryEventFeedPush.value) {return "Real-time push";}
  if(inventoryEventFeed.value.dataFeedTypeEnumId === SHOPIFY_INVENTORY_EVENT_FEED_MANUAL) {return "Manual";}

  return "Unsupported mode";
});
const inventoryEventFeedBadgeColor = computed(() => {
  if(!dataFeedsHydrated.value || !inventoryEventFeed.value) {return "medium";}
  if(!inventoryEventFeedTypeSupported.value) {return "danger";}

  return inventoryEventFeedPush.value ? "success" : "warning";
});

const locationEventFeed = computed<any>(() => cachedDataFeeds.value.find((feed: any) =>
  String(feed.dataFeedId) === SHOPIFY_LOCATION_INVENTORY_EVENT_FEED_ID) ?? null);
const locationEventFeedPush = computed(() =>
  locationEventFeed.value?.dataFeedTypeEnumId === SHOPIFY_INVENTORY_EVENT_FEED_PUSH);
const locationEventFeedTypeSupported = computed(() => [
  SHOPIFY_INVENTORY_EVENT_FEED_MANUAL,
  SHOPIFY_INVENTORY_EVENT_FEED_PUSH,
].includes(String(locationEventFeed.value?.dataFeedTypeEnumId ?? "")));
const locationEventFeedToggleDisabled = computed(() =>
  locationEventFeedSaving.value || !dataFeedsHydrated.value || !locationEventFeed.value ||
  !locationEventFeedTypeSupported.value);
const locationEventFeedStatus = computed(() => {
  if (!dataFeedsHydrated.value) return "Loading";
  if (!locationEventFeed.value) return "Not configured";
  if (locationEventFeedPush.value) return "Real-time push";
  if (locationEventFeed.value.dataFeedTypeEnumId === SHOPIFY_INVENTORY_EVENT_FEED_MANUAL) return "Manual";
  return "Unsupported mode";
});
const locationEventFeedBadgeColor = computed(() => {
  if (!dataFeedsHydrated.value || !locationEventFeed.value) return "medium";
  if (!locationEventFeedTypeSupported.value) return "danger";
  return locationEventFeedPush.value ? "success" : "warning";
});
const locationEventFeedSaving = ref(false);

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
  if(!shopsHydrated.value) {return "Loading";}
  // Not "Off": an uncached shop row is a state nobody can read a setting out of, and rendering it as
  // off would invite someone to "fix" a shop that is already pushing.
  if(!currentShop.value) {return "Unavailable";}

  return shopInventoryPush.value ? "Real-time push" : "Disabled";
});
const shopInventoryPushBadgeColor = computed(() => {
  if(!shopsHydrated.value || !currentShop.value) {return "medium";}

  return shopInventoryPush.value ? "success" : "warning";
});

const messageById = computed<Map<string, any>>(() => new Map(cachedSystemMessages.value.map((message: any) => [String(message.systemMessageId), message]),));

const physicalAtpResetJobs = computed<any[]>(() => cachedJobs.value.filter((job: any) =>
  job.serviceName === PHYSICAL_ATP_RESET_SERVICE && String(parameterMap(job).shopId || "") === String(props.id)));

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
const purgeLocationDetailsJob = computed<any>(() =>
  cachedJobs.value.find((job: any) => job.serviceName === PURGE_LOCATION_DETAILS_SERVICE) ?? null);

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
    if(job.serviceName !== PRODUCED_SENDER_SERVICE) {return false;}
    const scope = String(parameterMap(job).systemMessageTypeIds ?? "").trim();
    if(!scope) {return true;}

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

const locationPublishJob = computed(() => cachedJobs.value.find((job: any) =>
  String(job.jobName ?? "") === "publish_PendingShopifyLocationInventoryAdjustments"));

const watchedJobNames = computed(() => [...new Set([
  locationPublishJob.value?.jobName,
  physicalResetJob.value?.jobName,
  ...physicalAtpResetJobs.value.map((job: any) => job.jobName),
  effectiveDateJob.value?.jobName,
  purgeDetailsJob.value?.jobName,
  purgeLocationDetailsJob.value?.jobName,
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
  return jobs.filter((job) => job.paused !== "Y" && toMillis(job.nextExecutionDateTime) > Date.now())
    .sort((a, b) => toMillis(a.nextExecutionDateTime) - toMillis(b.nextExecutionDateTime))[0] ?? null;
}

type JobSetupKind = "publisher" | "aggregateReset" | "physicalReset" | "physicalAtpReset" | "discard" | "sender";

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
    String(parameterMap(job).inventoryChannelId ?? "") === targetId) ||
    cachedJobs.value.find((job: any) =>
      PUBLISH_PENDING_SERVICES.includes(job.serviceName) &&
      job.jobName === `publish_PendingShopifyInventoryAdjustments_${targetId}`) ||
    null;
}

function findChannelResetJob(channelId: string) {
  const targetId = String(channelId);

  return cachedJobs.value.find((job: any) =>
    job.serviceName === ABSOLUTE_CHANNEL_RESET_SERVICE &&
    String(parameterMap(job).inventoryChannelId ?? "") === targetId) ||
    cachedJobs.value.find((job: any) =>
      job.serviceName === ABSOLUTE_CHANNEL_RESET_SERVICE &&
      job.jobName === `reset_InventoryChannelInventory_${targetId}`) ||
    null;
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

/**
 * What to say about the next run, which depends on whether the stored value can be trusted.
 *
 * ServiceJob is cached class B - snapshotted once per login - while its RUNS are polled live while this
 * view is open. So nextExecutionDateTime ages out of the cache while "Last run" stays current, and on
 * this connection every job reported a next run behind its own last one. Calling that overdue would be
 * a false alarm on a job running perfectly well every fifteen minutes.
 *
 * A future timestamp can be displayed. Missing or expired timestamps cannot establish that the
 * schedule is absent or overdue; retain the configured cadence until refreshed scheduler data arrives.
 */
function nextRunLine(nextJob: any, latestRun: any): string {
  if(!nextJob) {return translate("No active schedule");}

  const nextMs = toMillis(nextJob.nextExecutionDateTime);
  const lastMs = latestRun?.startTime ? toMillis(latestRun.startTime) : 0;

  if(!nextMs || nextMs <= Date.now() || (lastMs && lastMs > nextMs)) {
    // `useServiceJobs` already normalises this, preferring the OMS's own `cronDescription` over a
    // cronstrue rendering. Re-deriving it here made this row disagree with the job's detail modal.
    if(nextJob.cronString) {
      return translate("Runs {cron}", { cron: String(nextJob.cronString).toLowerCase() });
    }

    return translate("Next run not yet recalculated");
  }

  return translate("Next run {until}, {at}", { until: formatUntil(nextMs), at: formatDateTime(nextJob.nextExecutionDateTime) });
}

function describeJob({ name, jobs, icon, setup, targetChannelId }: JobDefinition) {
  const latestRun = latestRunFor(jobs);
  const nextJob = nextExecutionFor(jobs);
  const missing = !jobs.length;
  const paused = jobs.length > 0 && jobs.every((job) => job.paused === "Y");
  // nextExecutionFor intentionally selects only future runs for queue ETA calculations. A cached
  // timestamp aging out must not erase the fact that an active job still has a cron schedule.
  const scheduledJob = nextJob ?? jobs.find((job) => job.paused !== "Y" && job.cronExpression);

  return {
    name,
    job: nextJob ?? jobs[0] ?? null,
    lastRun: latestRun?.startTime ? translate("Last run {at}", { at: formatDateTime(latestRun.startTime) }) : translate("No cached runs"),
    nextRun: nextRunLine(scheduledJob, latestRun),
    status: missing ? translate("Not configured") : paused ? translate("Paused") : translate("Active"),
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

  if(!inventoryChannels.value.length) {
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
      name: "Reset physical location ATP (all mapped locations on this shop)",
      jobs: physicalAtpResetJobs.value,
      icon: refreshOutline,
      setup: physicalAtpResetJobs.value.length ? "" : "physicalAtpReset",
    },
    {
      name: "Publish physical location event batches (all Shopify connections)",
      jobs: locationPublishJob.value ? [locationPublishJob.value] : [],
      icon: locationOutline,
      setup: "",
    },
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
      name: "Purge old aggregate inventory events (all Shopify connections)",
      jobs: purgeDetailsJob.value ? [purgeDetailsJob.value] : [],
      icon: trashBinOutline,
      setup: "",
    },
    {
      name: "Purge old physical location events (all Shopify connections)",
      jobs: purgeLocationDetailsJob.value ? [purgeLocationDetailsJob.value] : [],
      icon: trashBinOutline,
      setup: "",
    },
  );

  return definitions.map(describeJob);
});

/**
 * Facility types read for display. The group's members carry a facilityTypeId but no description, and
 * the shape of a channel is worth stating in words rather than as a raw enum.
 *
 * Counted by the types ACTUALLY PRESENT rather than by asking for retail and warehouse specifically:
 * this OMS also groups NA, BACKORDER and PRE_ORDER facilities, and a hardcoded pair would report a
 * group of them as empty. An unmapped type falls back to its own id, lowercased.
 */
/**
 * Plural forms for the facility-type nouns. The NOUN itself comes from the type cache (the server's
 * own `description`), so a tenant that renames a type or seeds a custom one reads the same word here
 * as on every other HotWax screen; only English pluralisation, which the server does not supply,
 * stays local. A hardcoded id-to-noun map was drifting from the seeded vocabulary silently.
 */
const FACILITY_TYPE_PLURALS: Record<string, string> = {
  "retail store": "retail stores",
  "warehouse": "warehouses",
  "distribution center": "distribution centers",
  "distribution centre": "distribution centres",
  "backorder location": "backorder locations",
  "pre-order location": "pre-order locations",
};

function facilityTypeLabel(facilityTypeId: string, count: number): string {
  const described = String(facilityTypeById.value.get(facilityTypeId)?.description ?? "").trim().toLowerCase();
  const singular = described || facilityTypeId.toLowerCase().replaceAll("_", " ");
  const type = count === 1 ? singular : (FACILITY_TYPE_PLURALS[singular] ?? `${singular}s`);

  return translate("{count} {type}", { count, type });
}

/** Events delivered to Shopify are counted over this window. */
const CHANNEL_ACTIVITY_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * The two facts a channel's shape and throughput come down to: what feeds it, and how much has actually
 * landed at Shopify lately.
 *
 * The delivered count is over the ledger this page has CACHED, which is a rolling window rather than the
 * full history - so it is a floor, not a total, and it is labelled with its window so the number is not
 * mistaken for one. Measured on this connection the cache spans about 70 hours, comfortably more than
 * the 24 it reports on.
 */
const channelStatsById = computed(() => {
  const now = Date.now();

  // One pass over the ledger for every channel rather than one per channel per render: the template
  // reads several fields off this and the cached ledger runs to hundreds of rows.
  const deliveredByChannel = new Map<string, number>();
  for(const detail of inventoryDetails.value) {
    if(detail.systemMessageStatusId !== "SmsgSent") {continue;}
    // The DELIVERY time, not the time the ledger recorded the event. An event from an older backlog
    // that was sent today belongs in this window; `createdDate` excluded it.
    const delivered = toMillis(detail.systemMessageProcessedDate) || toMillis(detail.createdDate);
    if(!delivered || now - delivered > CHANNEL_ACTIVITY_WINDOW_MS) {continue;}
    const channelId = String(detail.inventoryChannelId ?? "");
    deliveredByChannel.set(channelId, (deliveredByChannel.get(channelId) ?? 0) + 1);
  }

  const typesByGroup = new Map<string, Map<string, number>>();
  for(const member of cachedGroupFacilities.value) {
    if(!isEffectiveNow(member, groupFacilitiesEffectiveNow.value)) {continue;}
    const groupId = String(member.facilityGroupId ?? "");
    const typeId = String(member.facilityTypeId ?? "").trim() || "NA";
    const byType = typesByGroup.get(groupId) ?? new Map<string, number>();
    byType.set(typeId, (byType.get(typeId) ?? 0) + 1);
    typesByGroup.set(groupId, byType);
  }

  const stats = new Map<string, { composition: string; delivered: number }>();
  for(const channel of inventoryChannels.value) {
    const channelId = String(channel.inventoryChannelId ?? "");
    const byType = typesByGroup.get(String(channel.facilityGroupId ?? "")) ?? new Map<string, number>();
    const composition = [...byType.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([typeId, count]) => facilityTypeLabel(typeId, count));
    stats.set(channelId, {
      composition: composition.length ? composition.join(", ") : translate("No facilities in this group"),
      delivered: deliveredByChannel.get(channelId) ?? 0,
    });
  }

  return stats;
});

const EMPTY_CHANNEL_STATS = { composition: translate("No facilities in this group"), delivered: 0 };

function channelStats(channel: any) {
  return channelStatsById.value.get(String(channel.inventoryChannelId ?? "")) ?? EMPTY_CHANNEL_STATS;
}

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
  if(!text || text === "{}" || text === "[]") {return "";}

  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    return truncateResultText(text);
  }
  if(!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {return truncateResultText(text);}

  // Scalars keep their value; a collection reports its SIZE, which is the part that was flooding the
  // card. Anything unrecognised falls back to the capped raw text rather than being dropped silently.
  const parts = Object.entries(parsed).map(([key, value]) => {
    if(Array.isArray(value)) {return `${key}: ${value.length}`;}
    if(value === null || typeof value === "object") {return "";}

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

  let importLogId = "";
  try { importLogId = String((typeof run.results === "string" ? JSON.parse(run.results) : run.results)?.dataManagerLogId || ""); } catch { /* No structured result recorded. */ }
  const parameterDetail = describeRunParameters(run.parameters);
  const resultRows = describeRunResult(run.results);

  return {
    importLogId,
    id: run.jobRunId,
    parameterScope: parameterDetail.scope,
    parameterTuning: parameterDetail.tuning,
    resultRows: resultRows.length ? resultRows : describeRunResult(run.messages),
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

const physicalAtpResetRuns = computed(() => physicalAtpResetJobs.value
  .flatMap((job: any) => runsFor(job.jobName).map((run: any) => projectRun(job, run, "Physical location ATP reset")))
  .sort((a: any, b: any) => b.startTime - a.startTime));

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
  if(!statusId) {return "Assigned";}

  return statusDescriptionFor(statusId) || statusId;
}

/**
 * The server's own facility-type vocabulary, indexed by id. Read through the owning composable rather
 * than copied into this file, so a renamed or custom type reads the same here as everywhere else.
 */
const { facilityTypes: cachedFacilityTypes } = useFacilityTypes();
const facilityTypeById = computed(() => new Map(cachedFacilityTypes.value
  .map((type: any) => [String(type.facilityTypeId), type])));

/** Indexed once per channel-cache change: `channelFor` runs several times per ledger row. */
const channelsById = computed(() => new Map(allInventoryChannels.value
  .map((channel: any) => [String(channel.inventoryChannelId), channel])));

function channelFor(detail: any): any {
  return channelsById.value.get(String(detail.inventoryChannelId));
}

/** The channel that owns the row, by name. This is the row's SCOPE, not its Shopify target. */
function channelLabel(detail: any): string {
  return detail.inventoryChannelDescription || channelFor(detail)?.description ||
    detail.facilityGroupId || detail.inventoryChannelId || translate("Inventory channel");
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
  // The row's OWN fields first -- that is what `shopifyLocationId` was added to the projection for.
  // Resolving through the channel made every row render "Shopify aggregate location" until the channel
  // cache hydrated, and collapsed distinct locations into one change-entry group keyed `item@`.
  // The channel is kept only as a fallback for rows cached before that projection field existed.
  return String(detail.publishShopifyLocationId || detail.shopifyLocationId ||
    channelFor(detail)?.shopifyLocationId || "");
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
  if(!locationId) {return translate("Shopify aggregate location");}

  return shopifyLocationNames.value.get(locationId) || translate("Location {id}", { id: locationId });
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

/** The table holds catalog keys; an unrecognised type stays empty rather than becoming a wrong label. */
function sourceRecordLabel(eventTypeId: string): string {
  const key = SOURCE_RECORD_LABELS[eventTypeId] ?? "";

  return key ? translate(key) : "";
}

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
  if(eventTypeId.startsWith("RESERVATION_") && body.includes(":")) {
    const [inventoryItemId, detailSeqId] = body.split(":");

    return {
      recordLabel: sourceRecordLabel(eventTypeId),
      reference: translate("Inventory item {id}, detail {seq}", { id: inventoryItemId, seq: detailSeqId }),
      phase,
    };
  }

  return { recordLabel: sourceRecordLabel(eventTypeId), reference: body, phase };
}

const batches = computed<Batch[]>(() => {
  const grouped = new Map<string, any[]>();
  for(const detail of inventoryDetails.value) {
    const id = String(detail.systemMessageId ?? "");
    if(!id) {continue;}
    const bucket = grouped.get(id);
    if(bucket) {bucket.push(detail);} else {grouped.set(id, [detail]);}
  }

  return [...grouped.entries()].map(([id, details]) => {
    const message = messageById.value.get(id);
    const statusId = details[0]?.systemMessageStatusId || message?.statusId;
    const state = batchState(statusId);
    const createdAt = toMillis(message?.initDate || details[0]?.systemMessageInitDate || details[0]?.createdDate);
    const entries = changeEntriesOf(details);
    // Reason is a property of the WHOLE mutation, so it can only be stated when the batch holds one
    // event type. A mixed batch is the case the batcher publishes under `correction` because no single
    // reason is true about it -- worth showing as such rather than picking the first row's reason.
    const { reason, mapped, mixed } = reasonForGroup(details);

    return {
      id,
      statusId,
      ...state,
      // Kept so a filtered view can restate the entries from the rows that actually matched.
      details,
      // Nothing retries a rejected or cancelled batch; a person has to act on it.
      terminalFailure: isDeliveryTerminalFailure(statusId),
      created: createdAt ? formatDateTime(createdAt) : "Unknown",
      createdAt,
      age: formatAge(createdAt),
      channel: channelLabel(details[0]),
      eventCount: details.length,
      // What Shopify receives: one change entry per (inventory item, location) with the deltas SUMMED.
      // A net figure across the whole message corresponds to nothing in the mutation.
      entries,
      mixedEventTypes: mixed,
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
    case "DETAIL_PENDING": return { label: translate("Waiting"), color: "warning" };
    case "DETAIL_ASSIGNED": return { label: translate("Batched"), color: "primary" };
    case "DETAIL_NOOP": return { label: translate("No change"), color: "medium" };
    case "DETAIL_ERROR": return { label: translate("Quarantined"), color: "danger" };
    default: return { label: String(detail.detailStatusId || translate("Unknown")), color: "medium" };
  }
}

/** Delivery of the batch this row was assigned to. Absent while the row is still unbatched. */
function deliveryState(detail: any): { label: string; color: string; statusId: string; terminalFailure: boolean } | null {
  const systemMessageId = String(detail.systemMessageId ?? "");
  if(!systemMessageId) {return null;}
  const statusId = deliveryStatusOf(detail, messageById.value.get(systemMessageId)?.statusId);
  const state = batchState(statusId);

  return {
    label: state.status,
    color: state.badgeColor,
    statusId,
    terminalFailure: isDeliveryTerminalFailure(statusId),
  };
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
/**
 * The merchandiser-facing name for a row's product, with the ledger's item id as the last resort.
 * Written once: the settled table and the change-entry list were showing different labels for the
 * same event because only one of the two copies had been updated.
 */
function productLabelOf(productId: string, fallbackItemId?: unknown):
  { label: string; name: string; sku: string; imageUrl: string; variant: string } {
  const product = productId ? resolvedProducts.value.get(productId) : undefined;
  const name = product?.parentProductName || product?.internalName || product?.productName || "";

  return {
    // `label` always says something; `name` is empty when unresolved, for callers whose template
    // supplies its own fallback and must not print the item id twice.
    label: name || translate("Item {id}", { id: fallbackItemId ?? "" }),
    name,
    sku: product?.sku || "",
    imageUrl: product?.mainImageUrl || "",
    // `productName` is the variant qualifier, so it is only worth a line when it says something the
    // name above it does not.
    variant: product?.productName && product.productName !== name ? product.productName : "",
  };
}

/**
 * The Shopify reason a GROUP publishes under. A reason is a property of the whole mutation, so it can
 * only be stated when the group holds one event type; a mixed group falls back to `correction`, which
 * is what the batcher itself does. Shared by the produced batches and the waiting preview so the
 * preview cannot promise a reason the produced batch will not use.
 */
function reasonForGroup(rows: any[]): { reason: string; mapped: boolean; mixed: boolean } {
  const eventTypeIds = new Set(rows.map((row: any) => String(row.eventTypeId ?? "")));
  const mixed = eventTypeIds.size > 1;
  const { reason, mapped } = mixed ? { reason: "correction", mapped: false } : reasonOf(rows[0]);

  return { reason, mapped, mixed };
}

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

function changeEntriesOf(details: any[]): ChangeEntry[] {
  const grouped = new Map<string, any[]>();
  for(const detail of details) {
    const key = `${String(detail.shopifyInventoryItemId ?? "")}@${locationIdOf(detail)}`;
    const bucket = grouped.get(key);
    if(bucket) {bucket.push(detail);} else {grouped.set(key, [detail]);}
  }

  return [...grouped.entries()].map(([key, rows]) => {
    const delta = sumDelta(rows.map((row: any) => row.computedInventoryChange));
    const outcome = deltaOutcome(delta);
    const { productId } = calculationOf(rows[0]);
    const product = productLabelOf(productId, rows[0].shopifyInventoryItemId);

    return {
      key,
      shopifyInventoryItem: String(rows[0].shopifyInventoryItemId ?? ""),
      productLabel: product.label,
      productSku: product.sku || productId || "",
      locationId: locationIdOf(rows[0]),
      locationLabel: locationLabel(rows[0]),
      retarget: !!rows[0].publishShopifyLocationId,
      delta,
      change: `${delta > 0 ? "+" : ""}${delta}`,
      eventCount: rows.length,
      outcome,
      outcomeLabel: outcome === "publish" ? translate("Will publish")
        : outcome === "noChange" ? translate("Nets to zero, will settle as no change")
          : translate("Not a whole number, will be quarantined"),
      outcomeColor: outcome === "publish" ? "primary" : outcome === "noChange" ? "medium" : "danger",
    } as ChangeEntry;
  }).sort((a, b) => a.shopifyInventoryItem.localeCompare(b.shopifyInventoryItem));
}

/** Batches the OMS has produced but Shopify has not confirmed, including outright failures. */
const inFlightBatches = computed(() => batches.value
  .filter((batch: any) => sectionOfBatch(batch.statusId) === "inFlight"));

/**
 * The server owns this label. `eventTypeDescription` is joined from ShopifyInventoryEventType --
 * the closed vocabulary the ledger's EVENT_TYPE_ID is foreign-keyed to -- so it is always present
 * and always in step with the types the connector actually emits. The fallback only prettifies the
 * id, and exists for a row whose type row was somehow not joined; it is not a mapping table,
 * because a client-side copy of that vocabulary is exactly what drifts.
 */
function eventTypeLabel(detail: any): string {
  const description = String(detail?.eventTypeDescription ?? "").trim();
  if(description) {return description;}

  return String(detail?.eventTypeId ?? "")
    .toLowerCase().replaceAll("_", " ").replace(/^./, (value) => value.toUpperCase());
}

const inventoryEvents = computed<InventoryEvent[]>(() => inventoryDetails.value.map((detail: any) => {
  const state = detailState(detail);
  const delivery = deliveryState(detail);
  const { reason, mapped } = reasonOf(detail);
  const source = sourceOf(detail);
  const { productId, calculation } = calculationOf(detail);
  const product = productLabelOf(productId);
  const delta = roundDelta(detail.computedInventoryChange);

  // Same identity as the server PK and the cache key: event type + reference + channel + item.
  return {
    // `eventsFor` joins a batch's raw rows to rendered events on this exact string, so it has to be
    // built in ONE place -- two spellings of the same identity make that join silently return nothing.
    rowKey: rowKeyOf(detail),
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
    detailStatusId: String(detail.detailStatusId ?? ""),
    delivery: delivery?.label,
    deliveryColor: delivery?.color,
    deliveryStatusId: delivery?.statusId,
    deliveryTerminalFailure: !!delivery?.terminalFailure,
    // Decided once, by the pipeline rule, so the sections cannot disagree about a row.
    section: sectionOfEvent(detail, delivery?.statusId),
    createdAt: toMillis(detail.createdDate),
    decisionComment: detail.decisionComment,
    productId,
    // The bare name: this template supplies its own item-id fallback, so it must not print one here.
    productName: product.name,
    productSku: product.sku,
    productImageUrl: product.imageUrl,
    productVariant: product.variant,
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


/**
 * Is the ledger actually readable right now?
 *
 * An empty section only means "nothing there" once the cache has hydrated and the sync is healthy;
 * before that it means "not known yet". The monitor view has carried this rule since it was written --
 * a failed cache sync must never look like a healthy empty queue -- and the pipeline rewrite dropped
 * it, so three green all-clear cards rendered over a cold or failed cache.
 */
const pipelineReadable = computed(() =>
  inventoryDetailsHydrated.value && inventorySyncReady.value && !inventorySyncError.value);

const pendingEventCount = computed(() => inventoryDetails.value.filter(isWaitingDetail).length);
const pendingBatchCount = computed(() => inFlightBatches.value.length);
const oldestUnbatchedEvent = computed(() => {
  const oldest = inventoryEvents.value.filter((event) => event.section === "waiting")
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
const savingDocumentKey = ref("");
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

/** The feed a switch controls, as it reads inside a sentence: "... for channel events". */
function inventoryEventFeedLabel(dataFeedId: string): string {
  return dataFeedId === SHOPIFY_LOCATION_INVENTORY_EVENT_FEED_ID ? translate("physical location") : translate("channel");
}

/**
 * Accessible name for one feed switch. The visible label only says which feed, so a screen reader
 * would hear a column of identical "Channel" switches; name the document and the action as well.
 */
function eventSourceToggleLabel(doc: InventoryEventDocument, dataFeedId: string): string {
  const attached = dataFeedId === SHOPIFY_LOCATION_INVENTORY_EVENT_FEED_ID ? doc.locationAttached : doc.channelAttached;
  const copy = { document: doc.documentName, feed: inventoryEventFeedLabel(dataFeedId) };
  return attached ? translate("Stop {document} for {feed} events", copy) : translate("Start {document} for {feed} events", copy);
}

/**
 * Turning a source off is destructive in a way a toggle does not look: it stops that class of event
 * being RECORDED, so nothing accumulates to replay once it goes back on. Confirm before, and say that
 * the change is not instant - Moqui reads this through a cached query.
 */
async function requestDocumentFeedAttachChange(doc: InventoryEventDocument, dataFeedId: string) {
  const savingKey = `${dataFeedId}:${doc.dataDocumentId}`;
  const isLocationFeed = dataFeedId === SHOPIFY_LOCATION_INVENTORY_EVENT_FEED_ID;
  if(doc.missing || (isLocationFeed && !doc.locationSupported) || savingDocumentKey.value) {
    redrawToggles();

    return;
  }
  const attached = isLocationFeed ? doc.locationAttached : doc.channelAttached;
  const attaching = !attached;
  const copy = { document: doc.documentName, feed: inventoryEventFeedLabel(dataFeedId) };

  const alert = await alertController.create({
    header: attaching
      ? translate("Listen to {document} for {feed} events?", copy)
      : translate("Stop listening to {document} for {feed} events?", copy),
    message: attaching
      ? translate("New changes of this kind will start producing {feed} inventory events. Changes made while it was off were not recorded and will not be replayed; use the relevant inventory reset if Shopify needs to be reconciled.", copy)
      : translate("Changes of this kind stop producing {feed} inventory events entirely, and nothing accumulates to catch up later. Existing events are unaffected.", copy),
    buttons: [
      { text: translate("Cancel"), role: "cancel" },
      { text: attaching ? translate("Start listening") : translate("Stop listening"), role: "confirm" },
    ],
  });
  await alert.present();
  if((await alert.onDidDismiss()).role !== "confirm") {
    redrawToggles();

    return;
  }

  savingDocumentKey.value = savingKey;
  try {
    // The composable's list updates from the cache write-through inside this call.
    await setInventoryEventDocumentAttachedForFeed(dataFeedId, doc.dataDocumentId, attaching);
    commonUtil.showToast(attaching
      ? translate("Event source enabled for {feed} events. It can take a few minutes to take effect.", copy)
      : translate("Event source disabled for {feed} events. Events already recorded are unaffected.", copy));
  } catch (error: any) {
    commonUtil.showToast(error?.message || translate("Failed to update the event source."));
  } finally {
    savingDocumentKey.value = "";
    // The list was re-read above on success and left untouched on failure, so a redraw shows what is
    // actually stored either way rather than what was clicked.
    redrawToggles();
  }
}

async function requestInventoryEventFeedChange(event: Event) {
  event.stopImmediatePropagation();
  if(inventoryEventFeedToggleDisabled.value) {
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
  if(result.role !== "confirm") {
    redrawToggles();

    return;
  }

  inventoryEventFeedSaving.value = true;
  try {
    await updateShopifyInventoryEventFeedType(enablePush ? SHOPIFY_INVENTORY_EVENT_FEED_PUSH : SHOPIFY_INVENTORY_EVENT_FEED_MANUAL,);
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

async function requestLocationEventFeedChange(event: Event) {
  event.stopImmediatePropagation();
  if (locationEventFeedToggleDisabled.value) {
    redrawToggles();
    return;
  }

  const enablePush = !locationEventFeedPush.value;
  const alert = await alertController.create({
    header: enablePush ? translate("Enable real-time location updates?") : translate("Switch location updates to manual?"),
    message: enablePush
      ? translate("This affects every Shopify connection on this OMS. Restart every OMS node after saving so Moqui registers the real-time feed.")
      : translate("This affects every Shopify connection on this OMS. New real-time events may continue for up to 15 minutes while Moqui's feed cache expires."),
    buttons: [
      { text: translate("Cancel"), role: "cancel" },
      { text: enablePush ? translate("Enable real-time push") : translate("Switch to manual"), role: "confirm" },
    ],
  });
  await alert.present();
  const result = await alert.onDidDismiss();
  if (result.role !== "confirm") {
    redrawToggles();
    return;
  }

  locationEventFeedSaving.value = true;
  try {
    await updateShopifyLocationInventoryEventFeedType(
      enablePush ? SHOPIFY_INVENTORY_EVENT_FEED_PUSH : SHOPIFY_INVENTORY_EVENT_FEED_MANUAL,
    );
    await afterMutation("shopifyInventoryEventFeed", { dataFeedId: SHOPIFY_LOCATION_INVENTORY_EVENT_FEED_ID });
    commonUtil.showToast(enablePush
      ? translate("Location events set to real-time push. Restart every OMS node before relying on event capture.")
      : translate("Location events set to manual. Cached routing may take up to 15 minutes to expire."));
  } catch (error) {
    logger.error("Failed to update Shopify location inventory event feed", error);
    commonUtil.showToast(translate("Failed to update the location inventory event feed."));
  } finally {
    locationEventFeedSaving.value = false;
  }
}

/**
 * Flip this connection's push gate. Confirmed first because turning it off queues NOTHING: an
 * ineligible shop is skipped in the resolver and the delta is dropped there, so there is no backlog
 * to drain when it goes back on - only the physical location QOH reset (listed above) closes the gap.
 */
async function requestShopInventoryPushChange(event: Event) {
  event.stopImmediatePropagation();
  if(shopInventoryPushToggleDisabled.value) {
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
  if((await alert.onDidDismiss()).role !== "confirm") {
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
    if(commonUtil.hasError(resp)) {throw new Error("The OMS rejected the real-time inventory push update.");}
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

// =================================================================================================
// Real-time location inventory (per-Shopify-location push ledger; ui.md §2) — additive section.
// Distinct from the AGGREGATE channel ledger above: this row carries shopId/shopifyLocationId
// directly, since real-time location push targets one Shopify location per mapped facility rather
// than a facility-group aggregate, so it needs no channel indirection to scope by shop.
// =================================================================================================
const { records: allLocationInventoryDetails, hydrated: locationInventoryDetailsHydrated } =
  useCachedList<any>(shopifyLocationInventoryAdjustmentDetailCache);
const { records: allLocationInventorySummaries } =
  useCachedList<any>(shopifyLocationInventorySummaryCache);

const locationInventoryDetailsForShop = computed(() => allLocationInventoryDetails.value
  .filter((row: any) => String(row.shopId ?? "") === String(props.id ?? "")));
const locationInventorySummary = computed(() => allLocationInventorySummaries.value
  .find((row: any) => String(row.shopId ?? "") === String(props.id ?? "")));

/** `publish_PendingShopifyLocationInventoryAdjustments` runs every minute; the backlog age badge
 *  warns once the oldest unassigned row has outlived two publish intervals. */
const LOCATION_PUBLISH_INTERVAL_MS = 60_000;

const locationPublishJobStatus = computed(() => {
  if (!locationPublishJob.value) return translate("Not configured");
  return locationPublishJob.value.paused === "Y" ? translate("Paused") : translate("Active");
});
const locationPublishJobBadgeColor = computed(() => {
  if (!locationPublishJob.value) return "medium";
  return locationPublishJob.value.paused === "Y" ? "warning" : "success";
});
const locationPublishJobNextRun = computed(() => nextExecutionFor(locationPublishJob.value ? [locationPublishJob.value] : [])?.nextExecutionDateTime);

/**
 * Delivery state, derived ONLY from the linked message — never synthesized beyond the three cases
 * the blueprint names: unassigned+non-zero, unassigned+zero (no-op), and "whatever the message says".
 */
function locationDeliveryState(row: any): { label: string; color: string } {
  const messageId = String(row.systemMessageId ?? "");
  const change = Number(row.computedInventoryChange ?? 0);
  if (!messageId) {
    return change !== 0
      ? { label: translate("Unassigned (publishable)"), color: "warning" }
      : { label: translate("No-op"), color: "medium" };
  }
  const message = cachedSystemMessages.value.find((m: any) => String(m.systemMessageId) === messageId);
  const statusId = row.systemMessageStatusId || message?.statusId;
  const label = statusDescriptionFor(statusId) || statusId || translate("Not available");
  const errorish = /error|fail/i.test(String(statusId ?? ""));
  return { label, color: errorish ? "danger" : "medium" };
}

const locationDetailRows = computed(() => locationInventoryDetailsForShop.value.map((row: any) => {
  const state = locationDeliveryState(row);
  return {
    ...row,
    rowKey: row.locationAdjustmentKey,
    eventTypeId: row.eventTypeId,
    eventReferenceId: row.eventReferenceId,
    eventTypeDescription: row.eventTypeDescription,
    shopifyLocationId: row.shopifyLocationId,
    shopifyInventoryItemId: row.shopifyInventoryItemId,
    computedInventoryChange: Number(row.computedInventoryChange ?? 0),
    createdDate: row.createdDate,
    decisionComment: row.decisionComment,
    systemMessageId: row.systemMessageId,
    stateLabel: state.label,
    stateColor: state.color,
  };
}));

const locationFilterLocationId = ref("");
const locationFilterEventType = ref("");
const locationFilterState = ref("");
const locationFilterFrom = ref<string | null>(null);
const locationFilterTo = ref<string | null>(null);
const locationLocationOptions = computed(() =>
  [...new Set(locationDetailRows.value.map((row) => row.shopifyLocationId).filter(Boolean))]);
const locationEventTypeOptions = computed(() =>
  [...new Set(locationDetailRows.value.map((row) => row.eventTypeId).filter(Boolean))]);
const locationStateOptions = computed(() => [
  { id: "pending", label: translate("Pending delivery") },
  { id: "unassigned", label: translate("Unassigned (publishable)") },
  { id: "noop", label: translate("No-op") },
  ...["SmsgProduced", "SmsgSending", "SmsgError", "SmsgSent", "SmsgCancelled"].map(id => ({ id, label: statusDescriptionFor(id) || id })),
]);
const locationVisibleCount = ref(50);
watch([locationFilterState, locationFilterLocationId, locationFilterEventType, locationFilterFrom, locationFilterTo, locationHistoryQuery], () => { locationVisibleCount.value = 50; });
const locationHistoryMode = ref(props.initialHistoryMode === "batches" ? "batches" : "events");
function changeLocationMode(mode: string) {
  locationHistoryMode.value = mode;
  void router.replace({ query: { ...router.currentRoute.value.query, mode } });
}
watch([locationFilterState, locationFilterLocationId, locationFilterEventType, locationFilterFrom, locationFilterTo, locationHistoryQuery],
  ([state, location, eventType, from, to, search]) => {
    if (activeView.value === "location-history") void router.replace({ query: {
      ...router.currentRoute.value.query, state: state || undefined, location: location || undefined,
      eventType: eventType || undefined, from: from || undefined, to: to || undefined, search: search || undefined,
    } });
  });
watch(() => router.currentRoute.value.query, (query) => {
  if (activeView.value !== "location-history") return;
  locationHistoryMode.value = query.mode === "batches" ? "batches" : "events";
  locationFilterLocationId.value = String(query.location || "");
  locationFilterEventType.value = String(query.eventType || "");
  locationFilterFrom.value = query.from ? String(query.from) : null;
  locationFilterTo.value = query.to ? String(query.to) : null;
  locationHistoryQuery.value = String(query.search || "");
  locationFilterState.value = String(query.state || (query.mode === "unassigned" ? "unassigned" : ""));
}, { immediate: true });
const filteredLocationBatches = computed(() => {
  const grouped = new Map<string, any[]>();
  for (const row of filteredLocationDetailRows.value) {
    const key = row.systemMessageId || "unassigned";
    grouped.set(key, [...(grouped.get(key) || []), row]);
  }
  return [...grouped].map(([id, rows]) => ({ id, rows,
    label: id === "unassigned" ? translate("Unbatched events") : id,
    state: rows[0].stateLabel,
    target: [...new Set(rows.map(row => row.shopifyLocationId))].join(", "),
    created: rows[0].systemMessageInitDate || rows[0].createdDate,
    net: rows.reduce((total, row) => total + row.computedInventoryChange, 0),
  }));
});

const filteredLocationDetailRows = computed(() => {
  const query = locationHistoryQuery.value.trim().toLowerCase();
  return locationDetailRows.value
    .filter((row) => !locationFilterLocationId.value || row.shopifyLocationId === locationFilterLocationId.value)
    .filter((row) => !locationFilterEventType.value || row.eventTypeId === locationFilterEventType.value)
    .filter((row) => !locationFilterState.value
      || (locationFilterState.value === "pending" && ["SmsgProduced", "SmsgSending", "SmsgError"].includes(row.systemMessageStatusId))
      || (locationFilterState.value === "unassigned" && !row.systemMessageId && row.computedInventoryChange !== 0)
      || (locationFilterState.value === "noop" && !row.systemMessageId && row.computedInventoryChange === 0)
      || row.systemMessageStatusId === locationFilterState.value)
    .filter((row) => !locationFilterFrom.value
      || Number(row.createdDate ?? 0) >= DateTime.fromISO(locationFilterFrom.value).startOf("day").toMillis())
    .filter((row) => !locationFilterTo.value
      || Number(row.createdDate ?? 0) <= DateTime.fromISO(locationFilterTo.value).endOf("day").toMillis())
    .filter((row) => {
      if (!query) return true;
      return String(row.systemMessageId ?? "").toLowerCase().includes(query)
        || String(row.eventReferenceId ?? "").toLowerCase().includes(query)
        || String(row.shopifyLocationId ?? "").toLowerCase().includes(query)
        || String(row.shopifyInventoryItemId ?? "").toLowerCase().includes(query)
        || String(row.eventTypeDescription ?? "").toLowerCase().includes(query)
        || String(row.eventTypeId ?? "").toLowerCase().includes(query);
    })
    .sort((a, b) => Number(b.createdDate ?? 0) - Number(a.createdDate ?? 0));
});

// --- 2.1 Summary tiles ---
const unassignedNonZeroRows = computed(() => locationDetailRows.value
  .filter((row) => !row.systemMessageId && row.computedInventoryChange !== 0));
const unassignedNonZeroCount = computed(() => locationInventorySummary.value?.backlogCount ?? unassignedNonZeroRows.value.length);
const oldestUnassignedCreatedAt = computed(() => toMillis(locationInventorySummary.value?.oldestBacklogDate) || unassignedNonZeroRows.value.reduce(
  (oldest: number | undefined, row) => {
    const created = Number(row.createdDate ?? 0);
    return created && (oldest === undefined || created < oldest) ? created : oldest;
  },
  undefined as number | undefined,
));
const oldestUnassignedAgeLabel = computed(() => {
  if (oldestUnassignedCreatedAt.value === undefined) return "";
  const minutes = Math.round((Date.now() - oldestUnassignedCreatedAt.value) / 60_000);
  return minutes < 1 ? translate("< 1 min") : `${minutes} ${translate("min")}`;
});
const unassignedBacklogWarn = computed(() =>
  oldestUnassignedCreatedAt.value !== undefined
  && Date.now() - oldestUnassignedCreatedAt.value > LOCATION_PUBLISH_INTERVAL_MS * 2);
const locationDeliveryErrorCount = computed<number | undefined>(() =>
  locationInventoryDeliveryErrorCount(locationInventorySummary.value));
const locationNoOpOrQuarantinedCount = computed(() =>
  locationInventorySummary.value?.noOpOrQuarantinedCount ?? translate("Not available"));

const locationMessageIds = computed(() => {
  const ids = new Set<string>();
  for (const row of locationDetailRows.value) {
    if (row.systemMessageId) ids.add(String(row.systemMessageId));
  }
  return [...ids];
});

const pendingLocationBatchCount = computed(() => new Set(locationDetailRows.value
  .filter((row: any) => ["SmsgProduced", "SmsgSending", "SmsgError"].includes(row.systemMessageStatusId))
  .map((row: any) => row.systemMessageId).filter(Boolean)).size);

const selectedLocationBatch = ref<Batch | null>(null);

const locationBatches = computed<Batch[]>(() => {
  const grouped = new Map<string, any[]>();
  for (const detail of locationDetailRows.value) {
    const id = String(detail.systemMessageId ?? "");
    if (!id) continue;
    grouped.set(id, [...(grouped.get(id) ?? []), detail]);
  }

  return [...grouped.entries()].map(([id, details]) => {
    const message = messageById.value.get(id);
    const statusId = details[0]?.systemMessageStatusId || message?.statusId;
    const state = batchState(statusId);
    const createdAt = toMillis(message?.initDate || details[0]?.createdDate);
    const net = details.reduce((total, detail) => total + Number(detail.computedInventoryChange || 0), 0);
    const locId = details[0]?.shopifyLocationId;
    return {
      id,
      statusId,
      ...state,
      created: createdAt ? formatDateTime(createdAt) : translate("Unknown"),
      createdAt,
      age: formatAge(createdAt),
      target: locId ? `${translate("Shopify location")} ${locId}` : translate("Shopify location"),
      eventCount: details.length,
      detail: `${translate("Net adjustment")} ${net > 0 ? "+" : ""}${net}`,
      messageText: message?.messageText,
    };
  }).sort((a, b) => b.createdAt - a.createdAt);
});

const eventsForSelectedLocationBatch = computed(() => selectedLocationBatch.value
  ? locationDetailRows.value.filter((row) => row.systemMessageId === selectedLocationBatch.value?.id) : []);

const nextLocationBatchRun = computed(() => {
  if (!locationPublishJob.value) return translate("Not configured");
  if (locationPublishJob.value.paused === "Y") return translate("Paused");
  const nextRun = locationPublishJob.value?.nextExecutionDateTime;
  return nextRun && toMillis(nextRun) > Date.now() ? formatDateTime(nextRun) : translate("Schedule needs refresh");
});

const oldestLocationUnbatchedEvent = computed(() => {
  return oldestUnassignedCreatedAt.value !== undefined
    ? formatDateTime(oldestUnassignedCreatedAt.value)
    : translate("None waiting");
});

function openLocationHistory(mode?: "unassigned" | "batches" | "errors") {
  if (mode === "unassigned") {
    locationFilterState.value = "unassigned";
  } else {
    locationFilterState.value = "";
  }
  void router.push({
    path: `/shopify-connection-details/${props.id}/inventory-sync/location-history`,
    query: mode ? { mode, state: mode === "batches" ? "pending" : mode === "unassigned" ? "unassigned" : mode === "errors" ? "SmsgError" : undefined } : {},
  });
}

// --- Row expand modal: decisionComment verbatim + the linked message's error text ---
const selectedLocationDetail = ref<any>(null);
const locationDetailErrorText = ref("");
watch(() => selectedLocationDetail.value?.systemMessageId, async (systemMessageId) => {
  locationDetailErrorText.value = "";
  if (!systemMessageId) return;
  try {
    const errors = await ensureSystemMessageErrors(String(systemMessageId));
    locationDetailErrorText.value = errors?.[0]?.errorText || "";
  } catch (error) {
    logger.error("Could not load delivery errors for a location inventory detail", systemMessageId, error);
  }
});

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
    // The location ledger carries shopId natively, so it needs only the shop id to scope — no
    // channel resolution required.
    ...(props.id
      ? [{ name: "shopifyLocationInventoryAdjustmentDetail", args: { shopId: String(props.id) } }]
      : []),
  ];
}

// Channels are cached asynchronously, so the detail domain is usually skipped on first pass and
// starts here once they land.
watch(() => `${props.id ?? ""}|${watchedJobNames.value.join(",")}|${shopChannelIds.value.join(",")}`, () => {
  if(isViewActive.value) {void startSyncDomains(activeSyncDomains());}
});
watch(() => props.initialView, (view) => { activeView.value = view ?? "monitor"; });
watch(() => props.initialHistoryMode, (mode) => {
  if (mode === "unassigned") {
    locationFilterState.value = "unassigned";
  } else {
    historyMode.value = (mode as HistoryMode) ?? "events";
  }
});

onIonViewWillEnter(() => {
  isViewActive.value = true;
  if (props.initialView) activeView.value = props.initialView;
  if (props.initialHistoryMode === "unassigned") {
    locationFilterState.value = "unassigned";
  }
  void startSyncDomains(activeSyncDomains());
  // The feed domain is gated to one sync per login, so a mode changed from anywhere else stays
  // stale here for the whole session. This page owns the toggle, so it re-reads the row on entry.
  void afterMutation("shopifyInventoryEventFeed", { dataFeedId: SHOPIFY_INVENTORY_EVENT_FEED_ID });
  void afterMutation("shopifyInventoryEventFeed", { dataFeedId: SHOPIFY_LOCATION_INVENTORY_EVENT_FEED_ID });
  // Same gate on the shop domain, and the same reason: this page renders the connection's push flag,
  // which the Moqui admin screen can also change. Skipped without an id - the by-PK read would go to
  // `oms/shopifyShops/shops/` and re-list every shop.
  if(props.id) {void afterMutation("shopifyShop", { shopId: String(props.id) });}
  // The location publisher is global, so it is not in watchedJobNames but its run state still
  // changes what this page reports.
  for(const jobName of [...watchedJobNames.value, "publish_PendingShopifyLocationInventoryAdjustments"]) {
    void afterMutation("serviceJob", { jobName });
  }
});

onIonViewDidLeave(() => {
  isViewActive.value = false;
  stopSyncDomains();
});

/**
 * Both state machines are selectable. Offering only the ledger state left an operator triaging
 * "which events failed to reach Shopify" with no filter value for it.
 */
const historyStatusOptions = computed(() => [...new Set(inventoryEvents.value
  .flatMap((event) => [event.detailState, event.delivery])
  .filter(Boolean) as string[])]);
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
      // Every one of these is rendered somewhere on the row, which is the rule: a search that hides a
      // row for text the reader can see on it is a broken search. `productVariant` prints beside the
      // SKU on the product cell, so it has to be matchable there.
      event.productId, event.productName, event.productSku, event.productVariant]
      .some((value) => String(value ?? "").toLowerCase().includes(query));

    return matchesQuery &&
      (!selectedHistoryStatus.value || event.detailState === selectedHistoryStatus.value ||
        event.delivery === selectedHistoryStatus.value) &&
      (!selectedEventType.value || event.type === selectedEventType.value) &&
      (!selectedChannel.value || event.inventoryChannelId === selectedChannel.value);
  });

  return events;
});

/**
 * `inventoryEvents` is hard-sorted newest-first, and `filteredEvents` is consumed as a membership set
 * rather than as an order, so the Sort select has to be applied to the lists that are actually
 * rendered. Applying it there and not to the batch groups is deliberate: a waiting group's order is
 * the publisher's own drain order, not a user preference.
 */
function sortEvents(events: InventoryEvent[]): InventoryEvent[] {
  return historySortOrder.value === "oldest" ? [...events].reverse() : events;
}

/**
 * One list, in the order the reader asked for. This page used to slice `filteredEvents` into four
 * pipeline sections; the table renders every matching event instead and lets the Status column say
 * which stage each row is at.
 */
const historyEvents = computed(() => sortEvents(filteredEvents.value));

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
  // 67px is what a rendered `.list-item` row measures at desktop width -- every cell is clamped to a
  // fixed line count so they all land on it. The estimate matters more than it looks: `useVirtualRows`
  // only measures once its container exists, and this scroller is behind a `v-if` on an async cache,
  // so on a cold open there may be nothing to measure and the estimate is what sizes the spacers for
  // the whole list.
} = useVirtualRows(historyEvents, { estimatedRowHeight: 67 });

/**
 * Source artifacts for the rows actually on screen.
 *
 * NOT for the whole list. The receipt and issuance families need a walk over the channel's facilities,
 * which is affordable for a row a person opened and not for hundreds; those are skipped here (no
 * `fanOut`) and resolved when the row's detail opens. The reservation, cycle-count and external-reset
 * families each cost one call, so the visible window carries real names without a click.
 */
watch(virtualEvents, (events) => {
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

// A narrower filter should start the reader at the top of the new results rather than mid-scroll.
// Watch the filter inputs rather than filteredEvents: that array is rebuilt whenever a background
// cache sync lands, which would otherwise throw away the reader's place.
watch(
  [historyQuery, selectedHistoryStatus, selectedEventType, selectedChannel, historySortOrder],
  () => {
    scrollEventsToTop();
  },
);

const eventsForSelectedBatch = computed(() => selectedBatch.value
  ? inventoryEvents.value.filter((event) => event.batchId === selectedBatch.value?.id) : []);

const messageText = computed(() => {
  const raw = messageBatch.value?.messageText;
  if(raw) {
    try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { return raw; }
  }

  return JSON.stringify({
    systemMessageId: messageBatch.value?.id,
    // A location batch is not always a ShopifyInventoryAdjustment, so read the real type when the
    // message is cached and fall back to the aggregate type only when it is not.
    systemMessageTypeId: messageById.value.get(String(messageBatch.value?.id ?? ""))?.systemMessageTypeId || "ShopifyInventoryAdjustment",
    shopifyLocation: messageBatch.value?.target,
    inventoryChannel: messageBatch.value?.channel,
    reason: messageBatch.value?.reason,
    eventCount: messageBatch.value?.eventCount,
    messageText: "The exact System Message payload is still loading.",
  }, null, 2);
});

async function openMessage(batch: Batch) {
  messageBatch.value = { ...batch, messageText: "Loading message…" };
  const message = await ensureSystemMessageById(batch.id);
  if (messageBatch.value?.id === batch.id) messageBatch.value = { ...batch, messageText: message?.messageText || "Message text unavailable" };
}
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
  if(data?.created) {await startSyncDomains(activeSyncDomains());}
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
    protectedParameterNames: isDiscardJob ? [] : ["inventoryChannelId", "shopId"],
    parameterOptions: isDiscardJob ? { inventoryChannelId: channelFilterOptions.value } : {},
  };
}

function openServiceJob(job: any, title: string) {
  if(!job?.jobName) {return;}
  selectedServiceJob.value = serviceJobSelection(job.jobName, title, job.serviceName);
}

/** "View all runs" goes to the full history page, which is what it says. */
function openJobRuns(job: any, title: string) {
  if(!job?.jobName) {return;}
  router.push({
    name: "ShopifyInventoryJobRuns",
    params: { id: props.id, jobName: String(job.jobName) },
    query: { title },
  });
}

function refreshServiceJobData() {
  if(isViewActive.value) {void startSyncDomains(activeSyncDomains());}
}

const provisioningJobKind = ref<JobSetupKind | "">("");
const jobSetupError = ref("");

/**
 * Create a row's missing job(s), PAUSED — activation stays a deliberate second step in the job's own
 * modal, per the connector release runbook. The per-channel kinds provision EVERY effective channel
 * still missing its clone, not only the first: this is also the recovery path when a channel was
 * created but its job provisioning failed, which otherwise left no way to finish the setup from the
 * app at all. The ensure* helpers are idempotent and write the new row through to the job cache, so
 * the row flips from "Not configured" to "Paused" without a re-login.
 */
async function setUpSyncJob(kind: JobSetupKind | "", targetChannelId?: string) {
  if(!kind || provisioningJobKind.value) {return;}
  const provisioningKey = targetChannelId ? `${kind}-${targetChannelId}` : kind;
  provisioningJobKind.value = provisioningKey as JobSetupKind;
  jobSetupError.value = "";
  try {
    const created: string[] = [];
    if(kind === "physicalAtpReset") {
      created.push(await ensureShopPhysicalAtpResetJob(String(props.id)));
    } else if(kind === "physicalReset") {
      const remoteId = String(syncContext.remoteId.value ?? "");
      if(!remoteId) {throw new Error("No Shopify remote is configured for this connection.");}
      created.push(await ensureShopPhysicalInventoryResetJob({ systemMessageRemoteId: remoteId }));
    } else if(kind === "sender") {
      created.push(await ensureInventoryAdjustmentSenderJob());
    } else if(kind === "discard") {
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
      for(const channelId of targetIds) {
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
    if(openable) {
      const channel = inventoryChannels.value.find((c: any) => String(c.inventoryChannelId) === String(targetChannelId));
      const channelName = channel?.facilityGroupName || channel?.description || targetChannelId;
      const jobLabel = kind === "publisher"
        ? translate("Publish and send event batches")
        : translate("Reset aggregate ATP");
      commonUtil.showToast(translate("{job} created, paused. Set its schedule and activate it below.", { job: openable }));
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
    jobSetupError.value = error?.message || translate("The job could not be created.");
    commonUtil.showToast(jobSetupError.value);
  } finally {
    provisioningJobKind.value = "";
  }
}

function toMillis(value: unknown): number {
  if(value === undefined || value === null || value === "") {return 0;}
  const numeric = Number(value);
  if(Number.isFinite(numeric)) {return numeric;}
  const parsed = Date.parse(String(value));

  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * How long until a scheduled run, as a delta rather than a wall-clock time an operator has to subtract
 * from "now" themselves.
 *
 * Handles the past deliberately. A stored nextExecutionDateTime can sit BEHIND the job's own last run --
 * observed live on this connection, where the publisher reported a next run 35 minutes before its last
 * one -- and printing that timestamp reads as a normal schedule. Overdue is the honest word for it.
 */
function formatUntil(timestamp: number): string {
  if(!timestamp) {return "";}
  const minutes = Math.round((timestamp - Date.now()) / 60_000);
  if(minutes < -1) {
    const overdue = Math.abs(minutes);
    if(overdue < 60) {return translate("overdue by {minutes} min", { minutes: overdue });}
    const hours = Math.floor(overdue / 60);

    return hours < 24
      ? translate("overdue by {hours}h", { hours })
      : translate("overdue by {days}d", { days: Math.floor(hours / 24) });
  }
  if(minutes <= 1) {return translate("due now");}
  if(minutes < 60) {return translate("in {minutes} min", { minutes });}
  const hours = Math.floor(minutes / 60);
  if(hours < 24) {
    return minutes % 60
      ? translate("in {hours}h {minutes}m", { hours, minutes: minutes % 60 })
      : translate("in {hours}h", { hours });
  }

  return translate("in {days}d", { days: Math.floor(hours / 24) });
}

function formatAge(timestamp: number): string {
  if(!timestamp) {return "Unknown age";}
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if(minutes < 1) {return "Just now";}
  if(minutes < 60) {return `${minutes}m ago`;}
  const hours = Math.floor(minutes / 60);
  if(hours < 24) {return `${hours}h ago`;}

  return `${Math.floor(hours / 24)}d ago`;
}
</script>

<style scoped>
.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 400px), 1fr));
  align-items: flex-start;
}

.queue-column {
  display: flex;
  flex-direction: column;
}

.queue-column ion-card {
  margin: 10px;
}

/* Location inventory section (ui.md §2) — kpi-grid copied from ShopifyInventoryJobRuns.vue. */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--spacer-base);
  margin-block-end: var(--spacer-base);
}

.kpi-grid ion-card {
  margin: 0;
}

.count-skeleton {
  width: var(--spacer-3xl);
}

.location-filter-card {
  margin-block-end: var(--spacer-base);
}

.date-filter-item {
  width: 100%;
}

/* Copied from the same idiom already used in NetSuiteSyncMonitor.vue / ShopifyInventoryJobRuns.vue. */
.overline {
  font-size: 0.75rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ion-color-medium);
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

/* Channels sit side by side rather than stacking: they are peers an operator compares, and a card is
   now tall enough that a vertical list pushed the second one off-screen. Same auto-fit measure as
   .summary-grid above, so the two sections break to one column at the same width. */
.inventory-channels .channel-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 400px), 1fr));
  align-items: flex-start;
}

.channel-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: var(--spacer-sm);
  padding: var(--spacer-sm) var(--spacer-base);
  border-block-end: var(--border-medium);
}

.channel-stat {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.channel-stat p {
  margin-block: var(--spacer-2xs) 0;
  overflow-wrap: anywhere;
}

.event-feed-settings > ion-item {
  margin-block-start: var(--spacer-sm);
}

/* Layout only: the toggles style their own labels. Side by side normally, stacked on narrow screens. */
.event-source-feeds {
  display: grid;
  grid-auto-flow: column;
  align-items: center;
  gap: var(--spacer-base);
}

@media (max-width: 700px) {
  .event-source-feeds {
    grid-auto-flow: row;
    gap: var(--spacer-2xs);
  }
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

/* Four cells over five tracks: product, change, event (two), status. The row itself opens the
   detail, so there is no button column. The grid -- and the rule that keeps only the first and last
   cell below 991px, which here leaves the product and the status chips -- is `.list-item` in the
   theme. */
.list-item {
  --columns-desktop: 5;
  padding-inline-end: var(--spacer-sm);
  cursor: pointer;
}

.list-item:hover {
  background: var(--ion-color-light);
}

.list-item:focus-visible {
  outline: 2px solid var(--ion-color-primary);
  outline-offset: -2px;
}

.list-item:last-child {
  border-bottom: none;
}

.list-item ion-item,
.list-item ion-label {
  min-width: 0;
}

/* The theme centres grid items, which sizes each one to its content -- so a cell whose text is wider
   than its track overflows it instead of being clipped, and a long event description ran under the
   status chips with no ellipsis at all. Stretching the cells onto their tracks is what lets
   `.one-line` do its job. The event column reads as prose, so its text starts at the track edge; the
   short cells stay centred like the rest of the app's list rows. */
.list-item > ion-label {
  justify-self: stretch;
  width: 100%;
}

.list-item > ion-label.event-cell {
  text-align: start;
}

.list-item ion-thumbnail {
  --size: 48px;
  --border-radius: 4px;
}

.change {
  font-size: 1.125rem;
}

/* Direction is the first thing read off an adjustment row, so it is carried by colour as well as by
   the sign the label already prints. */
.change-up {
  color: var(--ion-color-success);
}

.change-down {
  color: var(--ion-color-danger);
}

/* ONE LINE, on every cell whose text is free-form: the server-owned event-type description, the Solr
   product name, the Shopify location name and the system message id all vary in length, and any of
   them can decide the row's height. useVirtualRows measures ONE row and applies that height to the
   spacers for all of them, so a varying row drifts the scrollbar over hundreds of rows. The full text
   is in the row's own detail. */
.one-line,
.list-item p {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

/* Below the grid's own breakpoint the row keeps only the product cell and the button, so the line
   inside that cell has to carry what the dropped columns said. Hidden again at the width where those
   columns come back -- 991px, which is `.list-item`'s breakpoint, not the 900px the rest of this
   sheet uses.

   Selected through `.list-item` so it outranks the `.list-item p` clamp above; a bare `.row-summary`
   loses to it on specificity and the line stayed visible at every width. */
/* TWO LINES, FIXED. This line carries four columns' worth of fact, and one clamped line dropped the
   status off the end of it; two lines fixed at two keeps the row uniform for the virtualiser either
   way, which a free-wrapping line would not. */
.list-item .row-summary {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  white-space: normal;
  block-size: 2lh;
}

@media (min-width: 991px) {
  /* Equal columns gave the product 182px and cut the name mid-word, so the tracks are weighted by how
     much text each actually carries. Only at this width: below it the theme hides every cell but the
     first and the button, and those proportions would be meaningless. */
  .list-item {
    grid-template-columns:
      minmax(0, 2.2fr) minmax(0, 0.6fr) minmax(0, 1.5fr) minmax(0, 1.5fr) minmax(0, 1.3fr);
  }

  /* Two tracks for the event: it carries the longest text on the row by some distance -- a
     server-owned description that runs to "Inventory reservation created (reason unmapped, publishes
     as correction)" plus the source artifact under it -- and every other cell is a number, a chip or
     a short label. */
  .list-item > .event-cell {
    grid-column: span 2;
  }

  /* Ledger lifecycle and Shopify delivery stack in one cell: the second is the state OF the batch the
     first put the row into, so they read as one fact rather than two columns that always move
     together. Only here -- below this width the theme hides the cell and the summary line says it. */
  .status-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacer-2xs);
  }

  /* One line for the chips, whether there are one or two, so the cell is the same height either way. */
  .status-chips {
    display: flex;
    align-items: center;
    gap: var(--spacer-2xs);
  }

  .batch-id {
    font-size: 0.8rem;
    color: var(--ion-color-medium);
    max-width: 100%;
  }

  .list-item .row-summary {
    display: none;
  }
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
ion-modal p {
  overflow-wrap: anywhere;
}

@media screen and (max-width: 900px) {
  .summary-grid {
    grid-template-columns: minmax(0, 1fr);
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
