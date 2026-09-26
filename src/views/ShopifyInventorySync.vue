<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button :default-href="`/shopify-connection-details/${props.id}`" />
        </ion-buttons>
        <!-- No Event history button: every row of the queue cards below opens the same view, in the
             context that says which slice of it you are about to read. -->
        <ion-title>{{ translate("Inventory sync") }}</ion-title>
        <!-- Failures sit in the toolbar, not above the content, so a recurring one cannot move the page. -->
        <ion-buttons slot="end">
          <SyncStatusButton
            :failures="syncFailures"
            :priority="SYNC_PRIORITY"
            :note="translate('Counts that depend on a failing sync are unavailable, not confirmed empty.')"
          />
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding-horizontal">
      <ion-item v-if="jobSetupError" role="alert">
        <ion-label class="ion-text-wrap">{{ jobSetupError }}</ion-label>
      </ion-item>

      <section class="summary-grid">
        <!-- One card per ledger, built from one shape, so the two queues read the same way. -->
        <ion-card v-for="queue in queueCards" :key="queue.kind">
          <ion-card-header>
            <ion-card-title>{{ queue.title }}</ion-card-title>
            <ion-card-subtitle>{{ queue.subtitle }}</ion-card-subtitle>
            <ion-badge v-if="queue.summary.errors" color="danger">
              {{ translate("{count} delivery errors", { count: queue.summary.errors }) }}
            </ion-badge>
          </ion-card-header>
          <ion-list lines="full">
            <ion-item button detail @click="openHistory(queue.kind, { state: 'waiting' })">
              <ion-label>{{ translate("Events waiting to batch") }}</ion-label>
              <ion-badge slot="end" :color="queue.summary.waiting ? 'warning' : 'medium'">{{ queue.summary.waiting }}</ion-badge>
            </ion-item>
            <ion-item button detail @click="openHistory(queue.kind, { state: 'inFlight' })">
              <ion-label>{{ translate("Batches waiting to send") }}</ion-label>
              <ion-badge slot="end" :color="queue.inFlightBatches ? 'primary' : 'medium'">{{ queue.inFlightBatches }}</ion-badge>
            </ion-item>
            <!-- Reads as queue state, not as a way into the publisher's config: that lives in Jobs below. -->
            <ion-item>
              <ion-label>{{ queue.nextRunLabel }}</ion-label>
              <ion-label slot="end">{{ queue.nextRun }}</ion-label>
            </ion-item>
            <ion-item lines="none" button detail @click="openHistory(queue.kind, { state: 'waiting', sort: 'oldest' })">
              <ion-label>{{ translate("Oldest waiting event") }}</ion-label>
              <ion-label slot="end">
                {{ queue.summary.oldestWaitingAt ? formatDateTime(queue.summary.oldestWaitingAt) : translate("None waiting") }}
                <p v-if="queue.summary.oldestWaitingAt">{{ formatAge(queue.summary.oldestWaitingAt) }}</p>
              </ion-label>
            </ion-item>
          </ion-list>
          <ion-list lines="full">
            <ion-item-group>
              <ion-item-divider color="light">
                <ion-label>{{ translate("Jobs") }}</ion-label>
              </ion-item-divider>
              <ion-item
                v-for="job in queue.jobs"
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
                <ion-badge slot="end" :color="job.badgeColor">{{ job.status }}</ion-badge>
              </ion-item>
            </ion-item-group>
          </ion-list>
        </ion-card>
      </section>

      <ion-card>
        <ion-list lines="none">
          <ion-item button detail @click="router.push(`/shopify-connection-details/${props.id}/inventory-sync/activations`)">
            <ion-icon slot="start" :icon="checkmarkCircleOutline" />
            <ion-label class="ion-text-wrap">
              {{ translate("Product activation") }}
              <p>{{ translate("Review pending activations and recent results.") }}</p>
            </ion-label>
          </ion-item>
        </ion-list>
      </ion-card>

      <section class="inventory-channels">
        <ion-item lines="none">
          <ion-label>
            {{ translate("Inventory channels") }}
            <p>{{ translate("Facility groups mapped to Shopify locations. Delivery totals use cached events.") }}</p>
          </ion-label>
          <ion-button slot="end" fill="outline" size="small" @click="openChannelSetup()">
            <ion-icon slot="start" :icon="addOutline" />
            {{ translate("Set up channel") }}
          </ion-button>
        </ion-item>

        <ion-card v-if="!inventoryChannels.length">
          <ion-item lines="none">
            <ion-label class="ion-text-wrap">
              <p>
                {{ translate("No channel mappings yet.") }}
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
                {{ channel.facilityGroupName || channel.description || channel.facilityGroupId || channel.inventoryChannelId }}
              </ion-label>
              <ion-label slot="end" class="ion-text-end">
                {{ channel.shopifyLocationId }}
                <p>{{ translate("Shopify location") }}</p>
              </ion-label>
            </ion-item>

            <ion-list class="channel-stats" lines="full">
              <ion-item
                button
                detail
                :disabled="!groupFacilitiesHydrated || Boolean(savingGroupMembershipFor)"
                @click="openChannelFacilities(channel)"
              >
                <ion-label>
                  {{ translate("Facilities") }} ({{ channelStats(channel).composition }})
                </ion-label>
                <ion-spinner v-if="savingGroupMembershipFor === String(channel.facilityGroupId)" slot="end" name="crescent" />
              </ion-item>
              <ion-item lines="none">
                <ion-label>
                  {{ translate("Delivered in the last 24 hours") }}
                </ion-label>
                <ion-label slot="end" class="ion-text-end">{{ channelStats(channel).delivered }}</ion-label>
              </ion-item>
            </ion-list>

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
            {{ translate("Real-time inventory updates") }}
            <p>{{ translate("Choose which updates push now or wait for a batch.") }}</p>
          </ion-label>
        </ion-item>

        <!-- Keep this shop-level switch separate from the OMS-wide feeds below; each title carries
             its scope without repeating a scope sentence in the card. -->
        <ion-card>
          <ion-list lines="none">
            <ion-item>
              <ion-icon slot="start" :icon="storefrontOutline" />
              <ion-label class="ion-text-wrap">
                {{ translate("Push realtime events to {shopName}", { shopName: shopDisplayName }) }}
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
                {{ translate("Channel events") }}
                <p>{{ translate("All shops") }}</p>
              </ion-label>
              <ion-badge slot="end" :color="inventoryEventFeedBadgeColor">
                {{ inventoryEventFeedStatus }}
              </ion-badge>
              <ion-toggle
                slot="end"
                :key="`feed-${inventoryEventFeedPush}-${toggleNonce}`"
                :aria-label="translate('Use real-time push for channel inventory events')"
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
                {{ translate("Physical location events") }}
                <p>{{ translate("All shops") }}</p>
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
            <ion-card-title>{{ translate("Event sources") }}</ion-card-title>
            <ion-card-subtitle>
              {{ translate("Choose which OMS events each feed records. Missing sources need connector seed data.") }}
            </ion-card-subtitle>
          </ion-card-header>
          <ion-list lines="full">
            <ion-item v-if="documentsLoading && !inventoryEventDocuments.length" lines="none">
              <ion-spinner name="crescent" />
            </ion-item>

            <ion-item v-else-if="documentsError" lines="none" role="alert">
              <ion-label class="ion-text-wrap">
                {{ translate("Event sources unavailable") }}
                <p>{{ documentsError }}</p>
              </ion-label>
              <ion-button slot="end" fill="outline" @click="resyncEventDocuments()">
                {{ translate("Retry") }}
              </ion-button>
            </ion-item>

            <ion-item v-for="doc in inventoryEventDocuments" :key="doc.dataDocumentId">
              <ion-label class="ion-text-wrap">
                {{ doc.documentName }}
                <!-- A document the OMS has never heard of cannot be attached, and calling it
                     "off" would send someone hunting for a toggle that will not help. -->
                <p v-if="doc.missing">
                  {{ translate("Missing") }}
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
                <ion-note v-else>{{ translate("Channel feed only") }}</ion-note>
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
              {{ translate('Physical ATP reset runs') }}
              <p>{{ translate("Recent ATP resets for this shop's mapped locations.") }}</p>
            </ion-label>
          </ion-item>
        </div>
        <div class="run-carousel" :aria-label="translate('Physical ATP reset runs')">
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
                {{ translate('No physical ATP reset runs yet.') }}
              </ion-label>
            </ion-item>
          </ion-card>
        </div>
      </section>

      <section class="run-section">
        <div class="section-header">
          <ion-item lines="none">
            <ion-label>
              {{ translate('Physical on-hand reset runs') }}
              <p>{{ translate('Recent runs across mapped physical locations.') }}</p>
            </ion-label>
          </ion-item>
          <ion-button v-if="physicalResetJob" fill="clear" @click="openJobRuns(physicalResetJob, translate('Reset physical on-hand'))">
            {{ translate("View all runs") }}
          </ion-button>
        </div>
        <div class="run-carousel" :aria-label="translate('Physical on-hand reset runs')">
          <ion-card v-for="run in physicalResetRuns" :key="run.id">
            <ion-card-header>
              <ion-card-title>{{ run.id }}</ion-card-title>
              <ion-badge :color="run.badgeColor">
                {{ run.status }}
              </ion-badge>
            </ion-card-header>
            <ion-list lines="full">
              <ion-item>
                <ion-label>
                  {{ translate("Started") }}
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
                {{ translate('No recent runs in cache.') }}
              </ion-label>
            </ion-item>
          </ion-card>
        </div>
      </section>

      <section class="run-section">
        <div class="section-header">
          <ion-item lines="none">
            <ion-label>
              {{ translate('Channel ATP reset runs') }}
              <p>{{ translate('Recent full-job resets across configured channels.') }}</p>
            </ion-label>
          </ion-item>
          <ion-button v-if="primaryAggregateResetJob" fill="clear" @click="openJobRuns(primaryAggregateResetJob, translate('Reset channel ATP'))">
            {{ translate("View all runs") }}
          </ion-button>
        </div>
        <div class="run-carousel" :aria-label="translate('Channel ATP reset runs')">
          <ion-card v-for="run in aggregateResetRuns" :key="run.id">
            <ion-card-header>
              <ion-card-title>{{ run.id }}</ion-card-title>
              <ion-badge :color="run.importLogId ? 'medium' : run.badgeColor">
                {{ run.importLogId ? translate('Feed generated') : run.status }}
              </ion-badge>
            </ion-card-header>
            <ion-list lines="full">
              <ion-item>
                <ion-label>
                  {{ translate("Started") }}
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
                {{ translate('No recent runs in cache.') }}
              </ion-label>
            </ion-item>
          </ion-card>
        </div>
      </section>

      <section v-for="section in batchSections" :key="section.kind" class="run-section ion-padding-bottom">
        <div class="section-header">
          <ion-item lines="none">
            <ion-label>
              {{ section.title }}
              <p>{{ section.subtitle }}</p>
            </ion-label>
          </ion-item>
          <ion-button fill="clear" @click="openHistory(section.kind)">
            <ion-icon slot="start" :icon="listOutline" />
            {{ translate("Event history") }}
          </ion-button>
        </div>
        <div class="run-carousel" :aria-label="section.title">
          <ion-card v-for="batch in section.batches" :key="batch.id">
            <ion-card-header>
              <ion-card-title>{{ batch.id }}</ion-card-title>
              <ion-badge :color="batch.events[0].deliveryColor">{{ batch.events[0].deliveryLabel }}</ion-badge>
            </ion-card-header>
            <ion-list lines="full">
              <ion-item>
                <ion-label>
                  {{ translate("Created") }}
                  <p>{{ formatDateTime(batch.createdAt) || translate("Unknown") }}</p>
                </ion-label>
                <ion-note slot="end">{{ formatAge(batch.createdAt) }}</ion-note>
              </ion-item>
              <ion-item>
                <ion-label class="ion-text-wrap">
                  {{ translate("Shopify target") }}
                  <p>{{ batchTargetLabel(batch) }}</p>
                </ion-label>
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
              <ion-item lines="none" button detail @click="openBatch(section.kind, batch.id)">
                <ion-label>
                  {{ translate("Changes") }}
                  <p>{{ translate("From {count} source events", { count: batch.events.length }) }}</p>
                </ion-label>
                <ion-badge slot="end" color="medium">{{ batch.entries.length }}</ion-badge>
              </ion-item>
            </ion-list>
          </ion-card>
          <ion-card v-if="section.hydrated && !section.batches.length">
            <ion-item lines="none">
              <ion-icon slot="start" :icon="timeOutline" />
              <ion-label class="ion-text-wrap">{{ translate("No batches yet.") }}</ion-label>
            </ion-item>
          </ion-card>
        </div>
      </section>
    </ion-content>

    <!-- inventoryChannelId is protected: this panel finds a publisher and a reset job BY that
         parameter and labels the per-channel rows from it, so editing it would move the job to a
         different channel rather than configure this one. -->
    <ServiceJobDetailsModal
      :is-open="!!selectedServiceJob"
      :job-name="selectedServiceJob?.jobName || ''"
      :title="selectedServiceJob?.title || translate('Inventory sync job')"
      :parameter-description="translate('Job and service parameters used by this inventory sync job.')"
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

    <InventoryEventBatchModal :batch="selectedBatch" @open-event="openEventFromBatch" @close="selectedBatchKey = null" />
    <InventoryEventDetailModal
      :event="selectedEvent"
      :artifact="selectedEvent ? inventoryFor(selectedEvent.kind).sourceArtifactFor(selectedEvent) : undefined"
      :remote-id="syncContext.remoteId.value || ''"
      @open-batch="(messageId) => selectedEvent && openBatch(selectedEvent.kind, messageId)"
      @close="selectedEvent = null"
    />
  </ion-page>
</template>

<script setup lang="ts">
import { commonUtil, logger, translate } from "@common";
import {
  IonBackButton, IonBadge, IonButton, IonButtons, IonCard,
  IonCardHeader, IonCardSubtitle, IonCardTitle, IonContent,
  IonHeader, IonIcon, IonItem, IonItemDivider, IonItemGroup, IonLabel, IonList, IonNote,
  IonPage, IonSpinner, IonTitle, IonToggle, IonToolbar,
  alertController,
  modalController, onIonViewDidLeave, onIonViewWillEnter,
} from "@ionic/vue";
import {
  addOutline, checkmarkCircleOutline,
  cloudUploadOutline,
  layersOutline, listOutline, locationOutline,
  refreshOutline, sendOutline, storefrontOutline, timeOutline, trashBinOutline, trashOutline,
} from "ionicons/icons";
import {
  computed,
  ref,
  watch,
} from "vue";
import { useRouter } from "vue-router";
import ServiceJobDetailsModal from "@/components/common/ServiceJobDetailsModal.vue";
import SyncStatusButton from "@/components/common/SyncStatusButton.vue";
import SelectFacilityModal from "@/components/facility/SelectFacilityModal.vue";
import EditInventoryChannelModal from "@/components/shopify/EditInventoryChannelModal.vue";
import InventoryEventBatchModal from "@/components/shopify/InventoryEventBatchModal.vue";
import InventoryEventDetailModal from "@/components/shopify/InventoryEventDetailModal.vue";
import InventoryResetImportResult from "@/components/shopify/InventoryResetImportResult.vue";
import InventoryRunDetails from "@/components/shopify/InventoryRunDetails.vue";
import SetupInventoryChannelModal from "@/components/shopify/SetupInventoryChannelModal.vue";
import { useCachedList } from "@/composables/useCachedList";
import { useCacheSync } from "@/composables/useCacheSync";
import { useEffectiveNow } from "@/composables/useEffectiveNow";
import { useFacilityGroupMutations, useFacilityTypes } from "@/composables/useFacilities";
import { type InventoryEventRow, useInventoryEvents } from "@/composables/useInventoryEvents";
import { useServiceJobRunsByJob, useServiceJobs } from "@/composables/useServiceJobs";
import {
  DISCARD_PENDING_EVENTS_SERVICE,
  INVENTORY_ADJUSTMENT_MESSAGE_TYPE,
  type InventoryEventDocument,
  PRODUCED_SENDER_SERVICE,
  SHOPIFY_INVENTORY_EVENT_FEED_ID,
  SHOPIFY_INVENTORY_EVENT_FEED_MANUAL,
  SHOPIFY_INVENTORY_EVENT_FEED_PUSH,
  SHOPIFY_LOCATION_INVENTORY_EVENT_FEED_ID,
  ensureChannelEventDiscardJob,
  ensureChannelEventPublisherJob,
  ensureChannelResetJob,
  ensureInventoryAdjustmentSenderJob,
  ensureShopPhysicalInventoryResetJob,
  ensureShopPhysicalAtpResetJob,
  PHYSICAL_ATP_RESET_SERVICE,
  setInventoryEventDocumentAttachedForFeed,
  updateShopifyInventoryEventFeedType,
  updateShopifyLocationInventoryEventFeedType,
  useInventoryEventDocuments,
  useShopifyShopMutations,
  useShopifySyncContext,
} from "@/composables/useShopify";
import { INVENTORY_EVENT_DOMAINS } from "@/config/appSyncConfig";
import { resyncDomain } from "@/services/appCacheBootstrap";
import { useInventorySyncArea } from "@/services/inventorySyncArea";
import { formatDateTime } from "@/utils";
import {
  dataFeedCache,
  groupFacilityCache,
  inventoryChannelCache,
  shopifyShopCache,
} from "@/utils/cacheEntities";
import { isEffectiveNow } from "@/utils/cacheProjection";
import {
  type InventoryEventBatch,
  type InventoryEventKind,
  groupInventoryEventBatches,
  summarizeInventoryEvents,
} from "@/utils/inventoryEvents";
import { formatAge } from "@/utils/inventoryEventTime";
import { parameterMap } from "@/utils/serviceJob";
import { describeRunParameters, describeRunResult } from "@/utils/serviceJobRun";

const props = defineProps<{ id?: string }>();
const router = useRouter();

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
// Class B, so a local read. The two scoped inventory-history mounts need a facilityId, and the ledger
// carries a facility GROUP because the event is aggregate; these are the candidates to search.
const { records: cachedGroupFacilities, hydrated: groupFacilitiesHydrated } = useCachedList<any>(groupFacilityCache);
/**
 * A membership crossing its `fromDate` or `thruDate` while the page is open has to re-trigger the
 * computeds that read it. `Date.now()` is a snapshot, so an expired facility stayed in the channel's
 * composition and in the source-resolution search until some unrelated cache write happened.
 */
const groupFacilitiesEffectiveNow = useEffectiveNow(cachedGroupFacilities);
const {
  start: startSyncDomains,
  stop: stopSyncDomains,
  failingDomains: monitorFailingDomains,
  afterMutation,
} = useCacheSync();

/**
 * Both inventory ledgers, through the one model the history pages read. The inventory sync area keeps
 * them polled for as long as the user is on any of this shop's inventory pages, so this page only reads.
 */
const channelInventory = useInventoryEvents(String(props.id ?? ""), "channel");
const locationInventory = useInventoryEvents(String(props.id ?? ""), "location");
const { failingDomains: inventoryAreaFailures } = useInventorySyncArea();

function inventoryFor(kind: InventoryEventKind) {
  return kind === "channel" ? channelInventory : locationInventory;
}

/** Either sync failing makes the queue figures untrustworthy, so the toolbar reports both. */
const syncFailures = computed(() => ({ ...monitorFailingDomains.value, ...inventoryAreaFailures.value }));
const SYNC_PRIORITY = Object.values(INVENTORY_EVENT_DOMAINS);

const inventoryChannels = computed(() => allInventoryChannels.value.filter((channel: any) =>
  String(channel.shopId) === String(props.id ?? "") && isEffectiveNow(channel, Date.now())));

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
  if(!dataFeedsHydrated.value) {return translate("Loading");}
  if(!inventoryEventFeed.value) {return translate("Not configured");}
  if(inventoryEventFeedPush.value) {return translate("Real-time push");}
  if(inventoryEventFeed.value.dataFeedTypeEnumId === SHOPIFY_INVENTORY_EVENT_FEED_MANUAL) {return translate("Manual");}

  return translate("Unsupported mode");
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
  if (!dataFeedsHydrated.value) return translate("Loading");
  if (!locationEventFeed.value) return translate("Not configured");
  if (locationEventFeedPush.value) return translate("Real-time push");
  if (locationEventFeed.value.dataFeedTypeEnumId === SHOPIFY_INVENTORY_EVENT_FEED_MANUAL) return translate("Manual");
  return translate("Unsupported mode");
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
  currentShop.value?.name || currentShop.value?.myshopifyDomain || translate("this connection"));
const shopInventoryPush = computed(() => String(currentShop.value?.realTimeInventoryPush ?? "") === "Y");
const shopInventoryPushToggleDisabled = computed(() =>
  shopInventoryPushSaving.value || !shopsHydrated.value || !currentShop.value);
const shopInventoryPushStatus = computed(() => {
  if(!shopsHydrated.value) {return translate("Loading");}
  // Not "Off": an uncached shop row is a state nobody can read a setting out of, and rendering it as
  // off would invite someone to "fix" a shop that is already pushing.
  if(!currentShop.value) {return translate("Unavailable");}

  return shopInventoryPush.value ? translate("Real-time push") : translate("Disabled");
});
const shopInventoryPushBadgeColor = computed(() => {
  if(!shopsHydrated.value || !currentShop.value) {return "medium";}

  return shopInventoryPush.value ? "success" : "warning";
});

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
type SharedJobLocationGroup = "channel" | "physical";

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
  group?: SharedJobLocationGroup;
};

type SharedJobDefinition = JobDefinition & { group: SharedJobLocationGroup };

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

function describeJob({ name, jobs, icon, setup, targetChannelId, group }: JobDefinition) {
  const latestRun = latestRunFor(jobs);
  const nextJob = nextExecutionFor(jobs);
  const missing = !jobs.length;
  const paused = jobs.length > 0 && jobs.every((job) => job.paused === "Y");
  // nextExecutionFor intentionally selects only future runs for queue ETA calculations. A cached
  // timestamp aging out must not erase the fact that an active job still has a cron schedule.
  const scheduledJob = nextJob ?? jobs.find((job) => job.paused !== "Y" && job.cronExpression);

  return {
    name,
    ...(group ? { group } : {}),
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
      name: translate("Send channel batches"),
      jobs: publisher ? [publisher] : [],
      icon: cloudUploadOutline,
      setup: publisher ? "" : "publisher",
      targetChannelId: channelId,
    },
    {
      name: translate("Reset channel ATP"),
      jobs: reset ? [reset] : [],
      icon: refreshOutline,
      setup: reset ? "" : "aggregateReset",
      targetChannelId: channelId,
    },
  ].map((definition) => describeJob(definition as JobDefinition));
}

/**
 * Shared jobs serve every channel on the connection, or the whole OMS; their definitions do not
 * multiply as channels are added.
 *
 * With no channel mapped yet, the two per-channel rows fall back to un-scoped ones here so a
 * misconfigured connection still shows them - there is no channel card to hang them on, and the
 * "Set up channel" button is the honest action rather than cloning a job for a channel that is absent.
 */
const sharedJobs = computed(() => {
  const definitions: SharedJobDefinition[] = [];

  if(!inventoryChannels.value.length) {
    definitions.push({
      name: translate("Publish channel batches"),
      jobs: pendingPublisherJobs.value,
      icon: cloudUploadOutline,
      setup: "",
      group: "channel",
    });
    definitions.push({
      name: translate("Reset channel ATP"),
      jobs: aggregateResetJobs.value,
      icon: refreshOutline,
      setup: "",
      group: "channel",
    });
  }

  definitions.push(
    {
      name: translate("Reset physical ATP (this shop)"),
      jobs: physicalAtpResetJobs.value,
      icon: refreshOutline,
      setup: physicalAtpResetJobs.value.length ? "" : "physicalAtpReset",
      group: "physical",
    },
    {
      name: translate("Publish physical batches (all shops)"),
      jobs: locationPublishJob.value ? [locationPublishJob.value] : [],
      icon: locationOutline,
      setup: "",
      group: "physical",
    },
    {
      name: translate("Apply effective-dated inventory changes"),
      jobs: effectiveDateJob.value ? [effectiveDateJob.value] : [],
      icon: layersOutline,
      setup: "",
      group: "channel",
    },
    {
      name: translate("Reset physical on-hand"),
      jobs: physicalResetJob.value ? [physicalResetJob.value] : [],
      icon: locationOutline,
      setup: !physicalResetJob.value && syncContext.remoteId.value ? "physicalReset" : "",
      group: "physical",
    },
    // Delivery. Batches are left at SmsgProduced on purpose and a scheduled sender moves them, so a
    // paused sender stalls the whole flow while every other row still reads healthy. OMS-wide.
    {
      name: translate("Send channel batches (all shops)"),
      jobs: inventoryAdjustmentSenderJobs.value,
      icon: sendOutline,
      setup: dedicatedSenderJob.value ? "" : "sender",
      group: "channel",
    },
    // Manual tool, not a schedule: it only ever runs from Run now.
    {
      name: translate("Discard unbatched channel events (manual)"),
      jobs: discardEventsJob.value ? [discardEventsJob.value] : [],
      icon: trashOutline,
      setup: discardEventsJob.value ? "" : "discard",
      group: "channel",
    },
    // Retention. Connector-seeded, so its absence is a deploy gap rather than something to create.
    {
      name: translate("Purge old channel events (all shops)"),
      jobs: purgeDetailsJob.value ? [purgeDetailsJob.value] : [],
      icon: trashBinOutline,
      setup: "",
      group: "channel",
    },
    {
      name: translate("Purge old physical events (all shops)"),
      jobs: purgeLocationDetailsJob.value ? [purgeLocationDetailsJob.value] : [],
      icon: trashBinOutline,
      setup: "",
      group: "physical",
    },
  );

  return definitions.map(describeJob);
});

const channelSharedJobs = computed(() => sharedJobs.value.filter((job) => job.group === "channel"));
const physicalSharedJobs = computed(() => sharedJobs.value.filter((job) => job.group === "physical"));

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
  for(const event of channelInventory.events.value) {
    if(event.delivery.id !== "sent" || !event.channelId) {continue;}
    // The DELIVERY time, not the time the ledger recorded the event. An event from an older backlog
    // that was sent today belongs in this window; `createdAt` excluded it.
    const delivered = event.sentAt || event.createdAt;
    if(!delivered || now - delivered > CHANNEL_ACTIVITY_WINDOW_MS) {continue;}
    deliveredByChannel.set(event.channelId, (deliveredByChannel.get(event.channelId) ?? 0) + 1);
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
    parameters: run.parameters || configuredParameters || translate("No parameters recorded"),
    scope,
    started: formatDateTime(run.startTime),
    duration: run.endTime ? translate("Ended {at}", { at: formatDateTime(run.endTime) }) : translate("In progress"),
    status: failed ? translate("Failed") : running ? translate("Running") : translate("Completed"),
    badgeColor: failed ? "danger" : running ? "primary" : "success",
    result: summarizeResult(run.results) || summarizeResult(run.messages) || (failed
      ? (summarizeResult(run.errors) || translate("The job reported an error"))
      : running ? translate("The job is still running") : translate("Completed without a job error")),
    failed,
    startTime: toMillis(run.startTime),
  };
}

const physicalAtpResetRuns = computed(() => physicalAtpResetJobs.value
  .flatMap((job: any) => runsFor(job.jobName).map((run: any) => projectRun(job, run, translate("Physical ATP reset"))))
  .sort((a: any, b: any) => b.startTime - a.startTime));

const physicalResetRuns = computed(() => {
  const job = physicalResetJob.value;

  return job?.jobName
    ? runsFor(job.jobName).map((run: any) => projectRun(job, run, translate("Full physical on-hand reset")))
    : [];
});

const aggregateResetRuns = computed(() => aggregateResetJobs.value
  .flatMap((job: any) => runsFor(job.jobName).map((run: any) =>
    projectRun(job, run, translate("Full channel ATP reset"))))
  .sort((a: any, b: any) => b.startTime - a.startTime));

/**
 * The server's own facility-type vocabulary, indexed by id. Read through the owning composable rather
 * than copied into this file, so a renamed or custom type reads the same here as everywhere else.
 */
const { facilityTypes: cachedFacilityTypes } = useFacilityTypes();
const facilityTypeById = computed(() => new Map(cachedFacilityTypes.value
  .map((type: any) => [String(type.facilityTypeId), type])));

/**
 * The monitor carousels preview only the newest batches; Event history lists the rest. Rendering every
 * cached batch put 2,000+ cards in this one component, and each cache write re-rendered all of them.
 */
const CAROUSEL_BATCH_LIMIT = 20;

// Only an unpaused clone's next fire time is a promise; a paused clone's stored
// nextExecutionDateTime is a time at which nothing will happen.
const nextBatchRun = computed(() => {
  const nextRun = nextExecutionFor(pendingPublisherJobs.value)?.nextExecutionDateTime;

  return nextRun ? formatDateTime(nextRun) : translate("Not scheduled");
});
// ----- Event sources: which DataDocuments this feed listens to -----
// Cached like every other reference table: config that rarely moves, read on every entry, and kept
// truthful after a change by the domain's write-through rather than by re-fetching here.
const { documents: inventoryEventDocuments, hydrated: documentsHydrated } = useInventoryEventDocuments();
const documentsError = ref("");
const savingDocumentKey = ref("");
const documentsLoading = computed(() => !documentsHydrated.value);
const facilityGroupMemberFeedNotice = computed(() => {
  const title = translate("Shopify group-member updates");
  if(!documentsHydrated.value || !dataFeedsHydrated.value) {
    return {
      title,
      message: translate("Checking the group-member event feed configuration."),
      color: "medium",
    };
  }

  const document = inventoryEventDocuments.value.find((item) =>
    item.dataDocumentId === "ShopifyFacilityGroupMemberEvent");
  if(!document || document.missing) {
    return {
      title,
      message: translate("The group-member data document is not loaded on this OMS, so membership changes cannot be captured for Shopify."),
      color: "warning",
    };
  }

  if(!document.channelAttached) {
    return {
      title,
      message: translate("Facility group changes are not being captured for Shopify. Enable Shopify Facility Group Member Event under Event sources before expecting Shopify inventory to update."),
      color: "warning",
    };
  }

  if(!inventoryEventFeed.value || !inventoryEventFeedTypeSupported.value || !inventoryEventFeedPush.value) {
    return {
      title,
      message: translate("Facility group changes are captured, but the channel event feed is not set to real-time push. Changes will not reach Shopify immediately."),
      color: "warning",
    };
  }

  return {
    title,
    message: translate("Facility group changes are captured and the channel event feed is set to real-time push. Restart every OMS node after changing this feed setting before relying on event capture."),
    color: "success",
  };
});

/** Re-snapshot the domain. The read path is the cache, so "retry" means refill it, not re-fetch here. */
async function resyncEventDocuments() {
  documentsError.value = "";
  try {
    await resyncDomain("inventoryEventDocument");
  } catch (error: any) {
    documentsError.value = error?.message || translate("The OMS did not return its data documents.");
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
    header: enablePush ? translate("Enable real-time inventory updates?") : translate("Switch inventory updates to manual?"),
    message: enablePush
      ? translate("This affects every Shopify connection on this OMS. Make sure channel ATP is reconciled, then restart every OMS node after saving so Moqui registers the real-time feed.")
      : translate("This affects every Shopify connection on this OMS. New real-time events may continue for up to 15 minutes while Moqui's feed cache expires."),
    buttons: [
      { text: translate("Cancel"), role: "cancel" },
      { text: enablePush ? translate("Enable real-time push") : translate("Switch to manual"), role: "confirm" },
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
      ? translate("Inventory events set to real-time push. Restart every OMS node before relying on event capture.")
      : translate("Inventory events set to manual. Cached routing may take up to 15 minutes to expire."));
  } catch (error) {
    logger.error("Failed to update Shopify inventory event feed", error);
    commonUtil.showToast(translate("Failed to update the inventory event feed."));
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
      ? translate("Push real-time inventory to {shop}?", { shop: shopDisplayName.value })
      : translate("Stop pushing real-time inventory to {shop}?", { shop: shopDisplayName.value }),
    message: enablePush
      ? translate("Only this Shopify connection is affected. Inventory that moved while it was off was never sent and will not be replayed; run the physical location QOH reset to reconcile.")
      : translate("Only this Shopify connection is affected. Inventory changes stop reaching its Shopify locations entirely, and nothing accumulates to catch up on later. Shopify keeps whatever quantity it already has until a physical location QOH reset corrects it."),
    buttons: [
      { text: translate("Cancel"), role: "cancel" },
      { text: enablePush ? translate("Enable real-time push") : translate("Turn off real-time push"), role: "confirm" },
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
    if(commonUtil.hasError(resp)) {throw new Error(translate("The OMS rejected the real-time inventory push update."));}
    commonUtil.showToast(enablePush
      ? translate("Real-time inventory push enabled for this connection. Run a physical location QOH reset if stock moved while it was off.")
      : translate("Real-time inventory push disabled for this connection. Quantities already in Shopify are unaffected."));
  } catch (error: any) {
    logger.error("Failed to update real-time inventory push for shop", shopId, error);
    commonUtil.showToast(error?.message || translate("Failed to update real-time inventory push for this connection."));
  } finally {
    shopInventoryPushSaving.value = false;
    // The shop row was re-read above on success and left untouched on failure, so a redraw shows what
    // is actually stored either way rather than what was clicked.
    redrawToggles();
  }
}

const nextLocationBatchRun = computed(() => {
  if (!locationPublishJob.value) return translate("Not configured");
  if (locationPublishJob.value.paused === "Y") return translate("Paused");
  const nextRun = locationPublishJob.value?.nextExecutionDateTime;
  return nextRun && toMillis(nextRun) > Date.now() ? formatDateTime(nextRun) : translate("Schedule needs refresh");
});

/** Batched and not yet accepted by Shopify, retrying failures included. */
function isBatchUnsent(batch: InventoryEventBatch): boolean {
  return batch.delivery.id === "inFlight" || batch.delivery.id === "error";
}

const channelBatches = computed(() => groupInventoryEventBatches(channelInventory.events.value));
const locationBatches = computed(() => groupInventoryEventBatches(locationInventory.events.value));

const queueCards = computed(() => [
  {
    kind: "channel" as InventoryEventKind,
    title: translate("Channel inventory events"),
    subtitle: translate("Changes waiting to reach Shopify locations."),
    summary: summarizeInventoryEvents(channelInventory.events.value),
    inFlightBatches: channelBatches.value.filter(isBatchUnsent).length,
    nextRunLabel: translate("Next channel batch"),
    nextRun: nextBatchRun.value,
    jobs: channelSharedJobs.value,
  },
  {
    kind: "location" as InventoryEventKind,
    title: translate("Physical inventory events"),
    subtitle: translate("Changes waiting to reach Shopify physical locations."),
    summary: summarizeInventoryEvents(locationInventory.events.value),
    inFlightBatches: locationBatches.value.filter(isBatchUnsent).length,
    nextRunLabel: translate("Next physical batch"),
    nextRun: nextLocationBatchRun.value,
    jobs: physicalSharedJobs.value,
  },
]);

const batchSections = computed(() => [
  {
    kind: "channel" as InventoryEventKind,
    title: translate("Channel event batches"),
    subtitle: translate("Batched channel inventory changes for Shopify."),
    batches: channelBatches.value.slice(0, CAROUSEL_BATCH_LIMIT),
    hydrated: channelInventory.hydrated.value,
  },
  {
    kind: "location" as InventoryEventKind,
    title: translate("Physical location event batches"),
    subtitle: translate("Recent physical-location inventory batches."),
    batches: locationBatches.value.slice(0, CAROUSEL_BATCH_LIMIT),
    hydrated: locationInventory.hydrated.value,
  },
]);

function batchTargetLabel(batch: InventoryEventBatch<InventoryEventRow>): string {
  return [...new Set(batch.events.map((event) => event.locationLabel))].join(", ");
}

/** The open batch, rebuilt from live rows so it follows its delivery status as polls land. */
const selectedBatchKey = ref<{ kind: InventoryEventKind; id: string } | null>(null);
const selectedBatch = computed(() => {
  const key = selectedBatchKey.value;
  if(!key) {return null;}

  return (key.kind === "channel" ? channelBatches : locationBatches).value.find((batch) => batch.id === key.id) ?? null;
});
const selectedEvent = ref<InventoryEventRow | null>(null);

function openBatch(kind: InventoryEventKind, id: string) {
  selectedEvent.value = null;
  selectedBatchKey.value = { kind, id };
}

function openEventFromBatch(event: InventoryEventRow) {
  selectedBatchKey.value = null;
  selectedEvent.value = event;
}

/** Each queue row opens its ledger's history already filtered to the slice it counted. */
function openHistory(kind: InventoryEventKind, query: Record<string, string> = {}) {
  void router.push({
    path: `/shopify-connection-details/${props.id}/inventory-sync/${kind === "channel" ? "history" : "location-history"}`,
    query,
  });
}

/**
 * The monitor's own class-A domain: the runs of the jobs it reports on. The ledgers, their batches'
 * messages and their products belong to the inventory sync area, which outlives this view.
 */
function activeSyncDomains() {
  return watchedJobNames.value.length
    ? [{ name: "serviceJobRun", args: { jobNames: watchedJobNames.value, total: 5 } }]
    : [];
}

// Jobs are cached asynchronously, so the run domain is usually skipped on first pass and starts here.
watch(() => watchedJobNames.value.join(","), () => {
  if(isViewActive.value) {void startSyncDomains(activeSyncDomains());}
});

onIonViewWillEnter(() => {
  isViewActive.value = true;
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

function openChannelEdit(channel: any) {
  editingChannel.value = channel;
}

const savingGroupMembershipFor = ref("");

async function openChannelFacilities(channel: any) {
  const facilityGroupId = String(channel?.facilityGroupId ?? "");
  if(!facilityGroupId) {return;}
  if(!groupFacilitiesHydrated.value) {
    commonUtil.showToast(translate("Facilities are still loading, please try again"));
    return;
  }
  if(savingGroupMembershipFor.value) {return;}

  const currentMembers = cachedGroupFacilities.value
    .filter((member: any) => String(member.facilityGroupId) === facilityGroupId && isEffectiveNow(member, groupFacilitiesEffectiveNow.value))
    .map((member: any) => ({ ...member, facilityName: member.facilityName || member.facilityId }));
  const notice = facilityGroupMemberFeedNotice.value;
  const modal = await modalController.create({
    component: SelectFacilityModal,
    componentProps: {
      selectedFacilities: currentMembers,
      bannerTitle: notice.title,
      bannerMessage: notice.message,
      bannerColor: notice.color,
    },
  });
  await modal.present();

  const { data }: any = await modal.onDidDismiss();
  if(!data?.value) {return;}

  const { facilitiesToAdd = [], facilitiesToRemove = [] } = data.value;
  if(!facilitiesToAdd.length && !facilitiesToRemove.length) {return;}

  savingGroupMembershipFor.value = facilityGroupId;
  try {
    const now = Date.now();
    const lastSequence = currentMembers.reduce((last: number, member: any) =>
      Math.max(last, Number(member.sequenceNum) || 0), 0);
    const additions = facilitiesToAdd.map((facility: any, index: number) => ({
      facilityId: String(facility.facilityId),
      fromDate: now,
      sequenceNum: lastSequence + index + 1,
    }));
    const expirations = facilitiesToRemove.map((facility: any) => ({
      facilityId: String(facility.facilityId),
      fromDate: facility.fromDate,
      thruDate: now,
    }));
    const { failed } = await useFacilityGroupMutations(facilityGroupId).saveMembers(additions, expirations);
    commonUtil.showToast(failed ? translate("Failed to update some facilities") : translate("Facilities updated"));
  } catch (error) {
    logger.error("Failed to update Shopify inventory channel facilities", facilityGroupId, error);
    commonUtil.showToast(translate("Failed to update some facilities"));
  } finally {
    savingGroupMembershipFor.value = "";
  }
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
      if(!remoteId) {throw new Error(translate("No Shopify remote is configured for this connection."));}
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
        const desc = channel
          ? translate("Full channel ATP reset for {channel}", { channel: channel.facilityGroupName || channel.description || channelId })
          : undefined;
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
        ? translate("Send channel batches")
        : translate("Reset channel ATP");
      commonUtil.showToast(translate("{job} created, paused. Set its schedule and activate it below.", { job: openable }));
      selectedServiceJob.value = serviceJobSelection(openable, `${jobLabel} - ${channelName}`);

      return;
    }

    commonUtil.showToast(!created.length
      ? translate("Nothing to create - these jobs already exist.")
      : created.length === 1
        ? translate("{job} created, paused. Open the row to set its schedule and activate it.", { job: created[0] })
        : translate("{count} jobs created, paused. Open each row entry to schedule and activate them.", { count: created.length }));
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

/* Channels sit side by side rather than stacking: they are peers an operator compares, and a card is
   now tall enough that a vertical list pushed the second one off-screen. Same auto-fit measure as
   .summary-grid above, so the two sections break to one column at the same width. */
.inventory-channels .channel-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 400px), 1fr));
  align-items: flex-start;
}

.channel-stats {
  margin-block: 0;
  padding-block: 0;
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

@media screen and (max-width: 900px) {
  .summary-grid {
    grid-template-columns: minmax(0, 1fr);
  }

            }

@media screen and (max-width: 600px) {
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
