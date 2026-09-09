<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button :default-href="`/shopify-connection-details/${props.id}`" />
        </ion-buttons>
        <ion-title>{{ translate("Transfer sync") }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding-horizontal">
      <!-- Fatal: the cache never hydrated for this shop and the worker is reporting an error. -->
      <ion-card v-if="!monitoringLoaded && transferSyncError" class="ion-margin-top">
        <ion-card-content class="fatal-error">
          <ion-icon :icon="warningOutline" color="danger" />
          <ion-label class="ion-text-wrap">
            <h2>{{ translate("Transfer sync data could not be loaded") }}</h2>
            <p>{{ transferSyncError }}</p>
          </ion-label>
          <ion-button fill="outline" :disabled="retrying" @click="retry()">
            <ion-spinner v-if="retrying" name="crescent" />
            <template v-else>
              {{ translate("Retry") }}
            </template>
          </ion-button>
        </ion-card-content>
      </ion-card>

      <template v-else>
        <!-- Non-blocking: cached rows are still shown, but they may be stale. -->
        <ion-card v-if="monitoringLoaded && transferSyncError" color="warning" class="ion-margin-top stale-banner">
          <ion-card-content>
            <ion-icon :icon="warningOutline" />
            <ion-label class="ion-text-wrap">
              {{ translate("The list below may be out of date") }}
              <p>{{ transferSyncError }}</p>
            </ion-label>
          </ion-card-content>
        </ion-card>

        <template v-if="!monitoringLoaded">
          <section class="sync-summary ion-margin-top" :aria-label="translate('Loading transfer sync monitoring')">
            <ion-card v-for="i in 2" :key="i">
              <ion-card-header>
                <ion-card-title>
                  <ion-skeleton-text :animated="true" style="width: 40%" />
                </ion-card-title>
                <ion-card-subtitle>
                  <ion-skeleton-text :animated="true" style="width: 70%" />
                </ion-card-subtitle>
              </ion-card-header>
              <ion-list lines="full">
                <ion-item v-for="j in 3" :key="j">
                  <ion-label>
                    <ion-skeleton-text :animated="true" style="width: 50%" />
                    <p><ion-skeleton-text :animated="true" style="width: 70%" /></p>
                  </ion-label>
                </ion-item>
              </ion-list>
            </ion-card>
          </section>
          <ion-list lines="full">
            <ion-item v-for="i in 5" :key="i">
              <ion-label>
                <ion-skeleton-text :animated="true" style="width: 40%" />
                <p><ion-skeleton-text :animated="true" style="width: 60%" /></p>
              </ion-label>
            </ion-item>
          </ion-list>
        </template>

        <template v-else>
          <section class="sync-summary ion-margin-top">
            <!-- Left Card: Pending event count and syncing from date -->
            <ion-card class="summary">
              <ion-card-header>
                <ion-card-title>{{ translate("Summary") }}</ion-card-title>
                <ion-card-subtitle>{{ translate("Outstanding changes and sync start date") }}</ion-card-subtitle>
              </ion-card-header>
              <ion-list lines="full">
                <ion-item-divider>
                  <ion-label>{{ translate("Outstanding") }}</ion-label>
                </ion-item-divider>
                <ion-item v-for="tab in SEGMENT_TABS" :key="tab.key" button :detail="true" @click="openOutstanding(tab.key)">
                  <ion-label>{{ translate(tab.key === 'create' ? 'Transfers to create' : tab.label) }}</ion-label>
                  <ion-skeleton-text v-if="!hydrated" slot="end" :animated="true" class="count-skeleton" />
                  <ion-label v-else slot="end">{{ tab.key === 'create' ? creationOrderCount : tabCount(tab) }}</ion-label>
                </ion-item>
                <ion-item lines="none">
                  <ion-label class="ion-text-wrap">
                    {{ translate("Syncing from") }}
                    <p v-if="launchDate">
                      {{ formatDateTime(launchDate) || translate("Not available") }}
                    </p>
                    <p v-else>
                      {{ translate("Nothing will sync until a start date is set.") }}
                    </p>
                  </ion-label>
                  <ion-skeleton-text v-if="launchLoading" slot="end" :animated="true" class="count-skeleton" />
                  <ion-button v-else slot="end" fill="outline" size="small" @click="openLaunchModal()">
                    {{ launchDate ? translate("Change start date") : translate("Set start date") }}
                  </ion-button>
                </ion-item>
              </ion-list>
            </ion-card>

            <!-- Right Card: Webhook stats and job stats -->
            <ion-card class="progress">
              <ion-card-header>
                <ion-card-title>{{ translate("Webhooks and jobs") }}</ion-card-title>
                <ion-card-subtitle>{{ translate("Webhook subscriptions and background sync jobs") }}</ion-card-subtitle>
              </ion-card-header>
              <ion-list lines="full">
                <ion-item
                  button
                  detail
                  @click="showWebhooksModal = true"
                >
                  <ion-label class="ion-text-wrap">
                    {{ translate("Webhook subscriptions") }}
                    <p>{{ translate("Subscribed of the topics this OMS can consume") }}</p>
                    <p v-if="webhookSummary && webhookProblems.length" class="ion-text-wrap">
                      {{ webhookProblems.join(", ") }}
                    </p>
                    <p v-if="webhookSummary && !webhookSummary.endpointAsserted" class="ion-text-wrap">
                      {{ translate("Callback URLs are not being checked.") }}
                    </p>
                  </ion-label>
                  <ion-skeleton-text v-if="webhooksLoading" slot="end" :animated="true" class="count-skeleton" />
                  <ion-badge v-else-if="webhookSummary" slot="end" :color="webhookSummaryColor">
                    {{ webhookSummary.subscribedCount }} / {{ webhookSummary.requiredCount }}
                  </ion-badge>
                  <ion-note v-else slot="end" color="medium">
                    {{ translate("Not checked") }}
                  </ion-note>
                </ion-item>

                <!-- Every job the sync depends on, in pipeline order. Neither stager calls Shopify: they
                     write MDM files that the framework's ScheduledDataManagerRunner picks up, so an
                     active stager and a delivered transfer are still two different questions. -->
                <ion-item
                  v-for="card in jobCards"
                  :key="card.definition.key"
                  :button="jobsHydrated && (card.job || card.definition.scope === 'shop')"
                  :detail="jobsHydrated && (card.job || card.definition.scope === 'shop')"
                  @click="card.job ? openJobModal(card) : configureJob(card)"
                >
                  <ion-label class="ion-text-wrap">
                    {{ translate(card.definition.label) }}
                    <p class="message-type">{{ card.jobName }}</p>
                    <p>{{ translate(card.definition.purpose) }}</p>
                    <p v-if="card.nextRun" class="overline">
                      {{ translate("Next run") }} {{ formatDateTime(card.nextRun) || translate("Not available") }}
                    </p>
                  </ion-label>
                  <ion-skeleton-text v-if="!jobsHydrated" slot="end" :animated="true" class="count-skeleton" />
                  <ion-spinner v-else-if="configuringJobKey === card.definition.key" slot="end" name="crescent" />
                  <ion-badge v-else slot="end" :color="jobStatusColor(card.status)">
                    {{ jobStatusLabel(card) }}
                  </ion-badge>
                </ion-item>
              </ion-list>
            </ion-card>
          </section>

          <!-- Four tabs over five resources. Each row is one artifact the shop has not sent to
               Shopify yet; the server view decides that from the provenance ledger, so there is no
               status to interpret here and nothing to re-derive. Cancellations and item reductions
               share a tab because they are the same operator concern at two different grains. -->
          <ion-segment
            :value="segment"
            scrollable
            class="segment-tabs"
            @ion-change="segment = ($event.detail.value as PendingSegment) || 'create'"
          >
            <ion-segment-button v-for="tab in SEGMENT_TABS" :key="tab.key" :value="tab.key">
              <ion-label>
                {{ translate(tab.label) }}
              </ion-label>
            </ion-segment-button>
          </ion-segment>

          <!-- Outstanding vs synced are two different resources over two different views, not a
               filter over one. Outstanding is polled into the cache; synced is fetched on demand. -->
          <ion-segment :value="direction" class="direction-toggle" @ion-change="setDirection($event.detail.value as SyncDirection)">
            <ion-segment-button value="pending">
              <ion-label>{{ translate("Outstanding") }}</ion-label>
            </ion-segment-button>
            <ion-segment-button value="synced">
              <ion-label>{{ translate("Synced") }}</ion-label>
            </ion-segment-button>
          </ion-segment>

          <template v-if="direction === 'synced'">
            <ion-card v-if="syncedError">
              <ion-card-content class="ion-text-wrap">
                <ion-icon :icon="warningOutline" color="danger" /> {{ syncedError }}
              </ion-card-content>
            </ion-card>
            <ion-accordion-group v-else-if="presentationRows.length" class="transfer-row-accordion" expand="inset">
              <ion-accordion v-for="row in presentationRows" :key="row.key" :value="row.key">
                <ion-item slot="header" lines="full" class="transfer-row-header">
                  <ion-label class="ion-text-wrap">
                    <h2>{{ row.title }}</h2>
                    <p>{{ row.detail }}</p>
                  </ion-label>
                  <ion-label slot="end" class="ion-text-end last-activity">
                    <template v-if="row.syncDurationMs !== undefined">
                      {{ formatSyncDuration(row.syncDurationMs) }}
                      <p>{{ translate("OMS to Shopify") }}</p>
                    </template>
                    <template v-else>
                      {{ formatDateTime(row.syncedAt) || translate("Not available") }}
                      <p>{{ translate(row.status) }}</p>
                    </template>
                  </ion-label>
                </ion-item>
                <ion-list slot="content" class="transfer-row-content" lines="full">
                  <ion-item v-if="row.occurredAt">
                    <ion-label>{{ translate("OMS recorded") }}</ion-label>
                    <ion-label slot="end">{{ formatDateTime(row.occurredAt) || translate("Not available") }}</ion-label>
                  </ion-item>
                  <ion-item v-if="row.syncedAt">
                    <ion-label>{{ translate("Shopify confirmed") }}</ion-label>
                    <ion-label slot="end">{{ formatDateTime(row.syncedAt) || translate("Not available") }}</ion-label>
                  </ion-item>
                  <ion-item>
                    <ion-label>{{ translate("OMS transfer") }}</ion-label>
                    <ion-label slot="end">{{ row.orderId }}</ion-label>
                  </ion-item>
                  <ion-item v-if="row.shopifyTransferId">
                    <ion-label>{{ translate("Shopify transfer") }}</ion-label>
                    <ion-label slot="end">{{ row.shopifyTransferId }}</ion-label>
                  </ion-item>
                  <ShopifyTransferSnapshot v-if="segment === 'create' && row.shopifyTransferId" :shop-id="shopId" :transfer-id="row.shopifyTransferId" />
                  <ion-item v-if="row.shipmentEventStatus">
                    <ion-label>{{ translate("Shipment event") }}</ion-label>
                    <ion-label slot="end">{{ translate(row.shipmentEventStatus) }}</ion-label>
                  </ion-item>
                  <ion-item v-if="row.omsShipmentId">
                    <ion-label>{{ translate("OMS shipment ID") }}</ion-label>
                    <ion-label slot="end">{{ row.omsShipmentId }}</ion-label>
                  </ion-item>
                  <ion-item v-for="shopifyShipmentId in row.shopifyShipmentIds" :key="shopifyShipmentId">
                    <ion-label>{{ translate("Shopify shipment ID") }}</ion-label>
                    <ion-label slot="end">{{ shopifyShipmentId }}</ion-label>
                  </ion-item>
                </ion-list>
              </ion-accordion>
            </ion-accordion-group>
            <ion-card v-else-if="!syncedLoading">
              <ion-card-content>{{ translate("Nothing has synced in this tab yet.") }}</ion-card-content>
            </ion-card>
            <div v-if="syncedLoading" class="ion-text-center ion-padding">
              <ion-spinner name="crescent" />
            </div>
            <ion-button v-else-if="syncedHasMore" expand="block" fill="outline" @click="loadMoreSynced()">
              {{ translate("Load more") }}
            </ion-button>
          </template>

          <template v-else>
          <ion-card v-if="!pendingTotal">
            <ion-card-content class="empty-state">
              <ion-icon :icon="checkmarkCircleOutline" />
              <ion-label class="ion-text-wrap">
                <h2>{{ translate("Everything is in sync") }}</h2>
                <p>{{ translate("This shop has no transfer work waiting to reach Shopify. A transfer becomes owned by exactly one shop at approval time, when the order and the receiving location share exactly one common Shopify shop; a shop that owns none will also show nothing here.") }}</p>
              </ion-label>
            </ion-card-content>
          </ion-card>

          <ion-card v-else-if="!presentationRows.length">
            <ion-card-content>
              {{ translate("Nothing outstanding in this tab.") }}
            </ion-card-content>
          </ion-card>

          <ion-accordion-group v-else class="transfer-row-accordion" expand="inset">
            <ion-accordion v-for="row in presentationRows" :key="row.key" :value="row.key">
              <ion-item slot="header" lines="full" class="transfer-row-header">
                <ion-label class="ion-text-wrap">
                  <h2>{{ row.title }}</h2>
                  <p>{{ row.detail }}</p>
                </ion-label>
                <ion-label slot="end" class="ion-text-end last-activity">
                  {{ formatDateTime(row.occurredAt) || translate("Not available") }}
                  <p>{{ translate(row.status) }}</p>
                </ion-label>
              </ion-item>
              <ion-list slot="content" class="transfer-row-content" lines="full">
                <ion-item v-if="row.occurredAt">
                  <ion-label>{{ translate("OMS recorded") }}</ion-label>
                  <ion-label slot="end">{{ formatDateTime(row.occurredAt) || translate("Not available") }}</ion-label>
                </ion-item>
                <ion-item>
                  <ion-label>{{ translate("OMS transfer") }}</ion-label>
                  <ion-label slot="end">{{ row.orderId }}</ion-label>
                </ion-item>
                <ion-item v-if="row.shopifyTransferId">
                  <ion-label>{{ translate("Shopify transfer") }}</ion-label>
                  <ion-label slot="end">{{ row.shopifyTransferId }}</ion-label>
                </ion-item>
                <ion-item v-if="row.shipmentEventStatus">
                  <ion-label>{{ translate("Shipment event") }}</ion-label>
                  <ion-label slot="end">{{ translate(row.shipmentEventStatus) }}</ion-label>
                </ion-item>
                <ion-item v-if="row.omsShipmentId">
                  <ion-label>{{ translate("OMS shipment ID") }}</ion-label>
                  <ion-label slot="end">{{ row.omsShipmentId }}</ion-label>
                </ion-item>
                <ion-item v-for="shopifyShipmentId in row.shopifyShipmentIds" :key="shopifyShipmentId">
                  <ion-label>{{ translate("Shopify shipment ID") }}</ion-label>
                  <ion-label slot="end">{{ shopifyShipmentId }}</ion-label>
                </ion-item>
              </ion-list>
            </ion-accordion>
          </ion-accordion-group>
          </template>
        </template>
      </template>
    </ion-content>

    <!-- Sync start date. Every preset shows what it would actually stage, because the number is the
         decision: "start of today" and "everything" can differ by thousands of orders. -->
    <ion-modal :is-open="showLaunchModal" @did-dismiss="showLaunchModal = false">
      <ion-header>
        <ion-toolbar>
          <ion-buttons slot="start">
            <ion-button :aria-label="translate('Close')" @click="showLaunchModal = false">
              <ion-icon slot="icon-only" :icon="closeOutline" />
            </ion-button>
          </ion-buttons>
          <ion-title>{{ translate("Sync transfers from") }}</ion-title>
        </ion-toolbar>
      </ion-header>

      <ion-content class="ion-padding">
        <ion-label v-if="launchError" class="ion-text-wrap launch-error">
          <ion-icon :icon="warningOutline" color="danger" /> {{ launchError }}
        </ion-label>

        <p class="ion-text-wrap launch-intro">
          {{ translate("Transfer orders entered before this date are never sent to Shopify. Pick the point you want the sync to begin.") }}
        </p>

        <ion-radio-group :value="launchChoice" @ion-change="selectLaunchChoice($event.detail.value)">
          <ion-item v-for="option in launchOptions" :key="option.key" lines="full" :disabled="!option.value">
            <ion-radio :value="option.key" justify="start" label-placement="end">
              <ion-label class="ion-text-wrap">
                {{ translate(option.label) }}
                <p>{{ option.value ? formatDateTime(option.value) : translate("Not available") }}</p>
              </ion-label>
            </ion-radio>
          </ion-item>

          <ion-item lines="full">
            <ion-radio value="custom" justify="start" label-placement="end">
              <ion-label>{{ translate("Custom") }}</ion-label>
            </ion-radio>
            <ion-datetime-button slot="end" datetime="transfer-launch-custom" />
            <ion-popover :keep-contents-on-did-dismiss="true">
              <ion-datetime id="transfer-launch-custom" v-model="launchCustom" presentation="date-time" />
            </ion-popover>
          </ion-item>
        </ion-radio-group>

        <!-- What this date actually admits, per sweep. -->
        <ion-card class="launch-preview">
          <ion-card-header>
            <ion-card-subtitle>{{ translate("If the jobs ran now") }}</ion-card-subtitle>
            <ion-card-title>
              <ion-skeleton-text v-if="launchLoading" :animated="true" class="count-skeleton" />
              <template v-else>
                {{ launchTotal }} {{ translate("changes would sync") }}
              </template>
            </ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <ion-list lines="none">
              <ion-item v-for="row in launchCountRows" :key="row.key">
                <ion-label>{{ translate(row.label) }}</ion-label>
                <ion-badge slot="end" :color="row.count ? 'primary' : 'medium'">{{ row.count }}</ion-badge>
              </ion-item>
            </ion-list>
            <p class="ion-text-wrap overline">
              {{ translate("Each row counts that kind of change. One transfer order can appear in several rows.") }}
            </p>
          </ion-card-content>
        </ion-card>
        <ion-fab vertical="bottom" horizontal="end" slot="fixed">
          <ion-fab-button :disabled="!selectedLaunchDate || launchSaving" @click="confirmLaunch()">
            <ion-icon :icon="saveOutline" />
          </ion-fab-button>
        </ion-fab>
      </ion-content>
    </ion-modal>

    <!-- Webhook subscriptions modal -->
    <ion-modal :is-open="showWebhooksModal" @did-dismiss="showWebhooksModal = false">
      <ion-header>
        <ion-toolbar>
          <ion-buttons slot="start">
            <ion-button :aria-label="translate('Close')" @click="showWebhooksModal = false">
              <ion-icon slot="icon-only" :icon="closeOutline" />
            </ion-button>
          </ion-buttons>
          <ion-title>{{ translate("Webhook subscriptions") }}</ion-title>
          <ion-buttons slot="end">
            <ion-button :disabled="webhooksLoading" :aria-label="translate('Refresh')" @click="loadWebhookReconciliation()">
              <ion-spinner v-if="webhooksLoading" name="crescent" />
              <ion-icon v-else slot="icon-only" :icon="refreshOutline" />
            </ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>

      <ion-content>
        <ion-item lines="none">
          <ion-label class="ion-text-wrap">
            <h2>{{ translate("Transfer and shipment topics registered at Shopify") }}</h2>
            <p v-if="otherWebhookCount">
              {{ otherWebhookCount }} {{ translate("other subscriptions on this shop") }}
            </p>
            <p v-if="webhookSummary && webhookSummary.elsewhereCount">
              {{ translate("Delivering to") }} {{ elsewhereHosts.join(", ") }}, {{ translate("not this OMS") }}
            </p>
            <p v-if="receivedTruncated" class="overline">
              {{ translate("Received counts are a floor; the backlog is deeper than one page.") }}
            </p>
          </ion-label>
        </ion-item>

        <ion-card v-if="webhookSummary?.missingCount || webhookSetupResults.length">
          <ion-card-header><ion-card-title>{{ translate('Register missing topics') }}</ion-card-title></ion-card-header>
          <ion-card-content>
            <ion-input v-model="webhookCallbackUrl" type="text" :disabled="webhookSetupBusy || webhookSetupUncertain" :label="translate('HTTPS callback URL or EventBridge ARN')" label-placement="stacked" placeholder="https://oms.example.com/rest/s1/shopify/webhook/payload" />
            <p>{{ translate('Use the public endpoint routed to this OMS. Existing subscriptions will be preserved.') }}</p>
            <ion-button :disabled="!webhookCallbackUrl.trim() || webhookSetupBusy || webhookSetupUncertain || webhooksLoading || !!webhooksError || !webhookSummary?.missingCount" @click="registerMissingWebhooks">
              <ion-spinner v-if="webhookSetupBusy" name="crescent" />
              {{ translate('Register missing topics') }}
            </ion-button>
            <ion-list v-if="webhookSetupResults.length" aria-live="polite">
              <ion-item v-for="result in webhookSetupResults" :key="result.topic">
                <ion-label class="ion-text-wrap"><h3>{{ result.topic }}</h3><p>{{ result.message }}</p><p v-if="result.id">{{ result.id }}</p></ion-label>
              </ion-item>
            </ion-list>
            <p v-if="webhookSetupError">{{ webhookSetupError }}</p>
          </ion-card-content>
        </ion-card>

        <ion-item v-if="webhooksError" lines="full" color="light">
          <ion-icon slot="start" :icon="warningOutline" color="danger" />
          <ion-label class="ion-text-wrap">
            <p>{{ webhooksError }}</p>
          </ion-label>
          <ion-button slot="end" fill="outline" size="small" :disabled="webhooksLoading" @click="loadWebhookReconciliation()">
            {{ translate("Retry") }}
          </ion-button>
        </ion-item>

        <ion-list v-else-if="webhooksLoading && !webhookRows.length" lines="full">
          <ion-item v-for="i in 4" :key="i">
            <ion-label>
              <ion-skeleton-text :animated="true" style="width: 50%" />
              <p><ion-skeleton-text :animated="true" style="width: 70%" /></p>
            </ion-label>
          </ion-item>
        </ion-list>

        <div v-else-if="!webhookRows.length" class="empty-state">
          <p>{{ translate("No transfer or shipment webhook topics are registered on this shop.") }}</p>
        </div>

        <ion-list v-if="webhookRows.length" lines="full">
          <ion-item v-for="row in webhookRows" :key="row.topic">
            <ion-label class="ion-text-wrap">
              {{ row.topic }}
              <p>{{ row.uri || translate("No callback URL registered") }}</p>
              <p v-if="row.status === 'elsewhere'" class="overline">
                {{ translate("Delivers to") }} {{ row.uriHost }}
              </p>
              <p class="message-type">
                {{ row.systemMessageTypeId || translate("No OMS message type for this topic") }}
              </p>
            </ion-label>
            <ion-label slot="end" class="ion-text-end received-count">
              {{ row.receivedCount }}
              <p>{{ translate("Received") }}</p>
            </ion-label>
            <ion-badge slot="end" :color="webhookStatusColor(row.status)">
              {{ webhookStatusLabel(row.status) }}
            </ion-badge>
          </ion-item>
        </ion-list>
      </ion-content>
    </ion-modal>

    <!-- Schedule, activate, and run the selected transfer job without leaving this page. -->
    <ServiceJobDetailsModal
      :is-open="showJobModal"
      :job-name="selectedJobName"
      :title="selectedJobTitle"
      :allowed-parameter-names="selectedJobParameterNames"
      :protected-parameter-names="['shopId']"
      :parameter-description="selectedJobParameterDescription"
      @updated="handleJobUpdated"
      @close="showJobModal = false"
    />
  </ion-page>
</template>

<script setup lang="ts">
import { commonUtil, translate } from "@common";
import {
  IonAccordion, IonAccordionGroup, IonBackButton, IonBadge, IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader,
  IonCardSubtitle, IonCardTitle, IonContent, IonFab, IonFabButton, IonHeader,
  IonDatetime, IonDatetimeButton,
  IonIcon, IonItem, IonItemDivider, IonLabel, IonList, IonModal, IonNote, IonPage, IonPopover, IonRadio, IonRadioGroup,
  IonSegment, IonSegmentButton, IonInput,
  IonSkeletonText, IonSpinner, IonTitle, IonToolbar, onIonViewDidLeave, onIonViewWillEnter,
} from "@ionic/vue";
import { checkmarkCircleOutline, closeOutline, refreshOutline, saveOutline, warningOutline } from "ionicons/icons";
import { DateTime } from "luxon";
import { computed, ref, watch } from "vue";
import ServiceJobDetailsModal from "@/components/common/ServiceJobDetailsModal.vue";
import ShopifyTransferSnapshot from "@/components/shopify/ShopifyTransferSnapshot.vue";
import { useCacheSync } from "@/composables/useCacheSync";
import { useCachedList } from "@/composables/useCachedList";
import { useServiceJobs } from "@/composables/useServiceJobs";
import { useShopifyTransferSyncEnrichment } from "@/composables/useShopifyTransferSyncEnrichment";
import {
  registerMissingTransferWebhook,
  useShopifyPendingCounts,
  useShopifyTransferSyncLaunch,
  useShopifyPendingSegment,
  useShopifySyncedSegment,
  useShopifyTransferSyncJobs,
  useShopifyWebhookReconciliation,
} from "@/composables/useShopifyTransferSync";
import { formatDateTime } from "@/utils";
import { facilityCache } from "@/utils/cacheEntities";
import { isTransferSyncMonitoringLoaded } from "@/utils/shopifyTransferSync";
import { buildTransferSyncPresentation, formatSyncDuration } from "@/utils/shopifyTransferSyncPresentation";
import type { PendingSegment, SyncDirection } from "@/workers/domains/shopifyTransferSyncDomain";

const props = defineProps<{ id?: string }>();

const retrying = ref(false);

const shopId = computed(() => String(props.id ?? ""));

/**
 * The tabs. `cancellation` and `itemChange` share one tab: they are the same operator concern -
 * something was reduced or cancelled and Shopify has not been told - at two different grains
 * (whole transfer, and one line). They stay two resources because merging them in one query would
 * need a distinct over a mixed projection; merging them in one tab costs nothing.
 */
const SEGMENT_TABS = [
  { key: "create" as PendingSegment, label: "Creation", also: undefined as PendingSegment | undefined },
  { key: "shipment" as PendingSegment, label: "Shipments", also: undefined as PendingSegment | undefined },
  { key: "receipt" as PendingSegment, label: "Receipts", also: undefined as PendingSegment | undefined },
  { key: "cancellation" as PendingSegment, label: "Cancellations", also: "itemChange" as PendingSegment | undefined },
] as const;

const segment = ref<PendingSegment>("create");

const { counts, creationOrderCount, total: pendingTotal, hydrated } = useShopifyPendingCounts(() => shopId.value);
const { rows: primaryRows } = useShopifyPendingSegment(() => shopId.value, () => segment.value);
// The paired segment for the combined tab; empty for every other tab.
const { rows: pairedRows } = useShopifyPendingSegment(
  () => shopId.value,
  () => (segment.value === "cancellation" ? "itemChange" : ("" as PendingSegment)),
);

const segmentRows = computed<any[]>(() => [...primaryRows.value, ...pairedRows.value]
  .sort((a: any, b: any) => Number(a?.occurredAt ?? 0) - Number(b?.occurredAt ?? 0)));

const { records: facilities } = useCachedList<any>(facilityCache);
const facilityNamesById = computed<Record<string, string>>(() => Object.fromEntries(
  facilities.value
    .filter((facility: any) => facility?.facilityId)
    .map((facility: any) => [String(facility.facilityId), String(facility.facilityName || facility.facilityId)]),
));

function tabCount(tab: { key: PendingSegment; also?: PendingSegment }): number {
  return (counts.value[tab.key] ?? 0) + (tab.also ? (counts.value[tab.also] ?? 0) : 0);
}

// ---------------------------------------------------------------- sync start date
const {
  currentDate: launchDate,
  counts: launchCounts,
  loading: launchLoading,
  saving: launchSaving,
  error: launchError,
  load: loadLaunch,
  save: saveLaunch,
} = useShopifyTransferSyncLaunch();

const showLaunchModal = ref(false);
const launchChoice = ref("now");
const launchCustom = ref<string | null>(null);

/**
 * Presets, in the order an operator narrows through: least history first.
 *
 * Nothing here needs the server. "Now" and "start of today" are the browser's own clock, and
 * "everything" is any instant early enough to precede the shop's history - the exact date of its
 * oldest transfer order would be prettier to display but changes nothing, and the count below
 * already says precisely how much that choice admits.
 */
const EVERYTHING_FROM = "1970-01-01T00:00:00.000Z";

const launchOptions = computed(() => [
  { key: "now", label: "Now — only transfers entered from this moment", value: new Date().toISOString() },
  { key: "startOfToday", label: "Start of today", value: DateTime.now().startOf("day").toISO() },
  { key: "oldest", label: "Everything — every transfer this shop owns", value: EVERYTHING_FROM },
]);

const selectedLaunchDate = computed<string | null>(() => {
  if(launchChoice.value === "custom") { return launchCustom.value; }
  const option = launchOptions.value.find((entry) => entry.key === launchChoice.value);

  return option?.value ? String(option.value) : null;
});

const LAUNCH_COUNT_LABELS: Array<{ key: string; label: string }> = [
  { key: "create", label: "Transfers to create" },
  { key: "shipment", label: "Shipments" },
  { key: "receipt", label: "Receipts" },
  { key: "cancellation", label: "Cancellations" },
  { key: "itemChange", label: "Line reductions" },
];

const launchCountRows = computed(() => LAUNCH_COUNT_LABELS.map((entry) => ({
  ...entry,
  count: launchCounts.value?.[entry.key] ?? 0,
})));

// Each segment counts its own artifacts, so these do not add up to a count of transfer orders -
// one order can carry several shipments. Shown as a checked total rather than a headline number.
const launchTotal = computed(() => launchCountRows.value.reduce((sum, row) => sum + row.count, 0));

function openLaunchModal() {
  showLaunchModal.value = true;
  launchChoice.value = "now";
  launchCustom.value = null;
  // Context (saved setting, oldest owned order) plus the counts for the default choice.
  void loadLaunch(shopId.value, new Date().toISOString(), true);
}

/** Every choice re-previews, because the count IS the decision. */
function selectLaunchChoice(next: string) {
  launchChoice.value = next || "now";
  if(selectedLaunchDate.value) { void loadLaunch(shopId.value, selectedLaunchDate.value); }
}

// A custom date only previews once the picker settles, not on every intermediate value.
watch(launchCustom, (next) => {
  if(launchChoice.value === "custom" && next) { void loadLaunch(shopId.value, next); }
});

async function confirmLaunch() {
  const chosen = selectedLaunchDate.value;
  if(!chosen) { return; }
  if(await saveLaunch(shopId.value, chosen)) {
    showLaunchModal.value = false;
    // The gate changed, so what is outstanding changed with it.
    void syncNow();
  }
}

const direction = ref<SyncDirection>("pending");
const {
  rows: syncedRows,
  loading: syncedLoading,
  error: syncedError,
  hasMore: syncedHasMore,
  load: loadSynced,
  loadMore: loadMoreSyncedPage,
} = useShopifySyncedSegment();

const rawTransferRows = computed<Record<string, unknown>[]>(() =>
  direction.value === "synced" ? syncedRows.value : segmentRows.value);
const { enrichment, load: loadEnrichment } = useShopifyTransferSyncEnrichment();
const presentationRows = computed(() => buildTransferSyncPresentation(rawTransferRows.value, direction.value, {
  ...enrichment.value,
  facilityNamesById: facilityNamesById.value,
}));

watch(rawTransferRows, (rows) => {
  void loadEnrichment(rows);
}, { immediate: true });

/**
 * The combined tab shows two segments at once, which the cache can merge but a paged on-demand
 * read cannot. Synced history therefore shows the primary segment of the tab; the paired one has
 * its own resource and is reachable from the transfer's detail timeline.
 */
function openOutstanding(next: PendingSegment) {
  direction.value = "pending";
  segment.value = next;
}

function setDirection(next: SyncDirection) {
  direction.value = next || "pending";
  if(direction.value === "synced") {void loadSynced(shopId.value, segment.value);}
}

function loadMoreSynced() {
  void loadMoreSyncedPage(shopId.value, segment.value);
}

// Switching tab while looking at history re-reads that tab's history, not the previous tab's.
watch(segment, () => {
  if(direction.value === "synced") {void loadSynced(shopId.value, segment.value);}
});

// Shopify topic prefixes this flow owns. The vocabulary itself stays in the connector — these
// only decide which of the shop's subscriptions belong on this page.
const TRANSFER_TOPIC_PREFIXES = ["INVENTORY_TRANSFERS_", "INVENTORY_SHIPMENTS_"];

const {
  rows: webhookRows,
  summary: webhookSummary,
  otherSubscriptionCount: otherWebhookCount,
  receivedTruncated,
  loading: webhooksLoading,
  error: webhooksError,
  refresh: refreshWebhookReconciliation,
} = useShopifyWebhookReconciliation(() => shopId.value, TRANSFER_TOPIC_PREFIXES);

const webhookSummaryColor = computed(() => {
  const s = webhookSummary.value;
  if(!s) { return "medium"; }
  if(s.missingCount || s.noConsumerCount) { return "danger"; }
  if(s.duplicateCount || s.elsewhereCount) { return "warning"; }

  return "success";
});

/** Only the problems that actually apply, so a healthy shop's card stays quiet. */
const webhookProblems = computed(() => {
  const s = webhookSummary.value;
  if(!s) { return []; }
  const problems: string[] = [];
  if(s.missingCount) { problems.push(`${s.missingCount} ${translate("missing")}`); }
  if(s.noConsumerCount) { problems.push(`${s.noConsumerCount} ${translate("with no consumer")}`); }
  if(s.duplicateCount) { problems.push(`${s.duplicateCount} ${translate("duplicate")}`); }
  if(s.elsewhereCount) { problems.push(`${s.elsewhereCount} ${translate("delivering elsewhere")}`); }

  return problems;
});

const elsewhereHosts = computed(() =>
  [...new Set(webhookRows.value.filter((r: any) => r.status === "elsewhere").map((r: any) => r.uriHost).filter(Boolean))]);

/**
 * Live read: the subscription half comes from the Shopify Admin API, so this is the one thing on
 * the page outside the cached sync domain. It still runs automatically — an operator should not
 * have to ask for the reconciliation to see whether a topic is wired end to end.
 */
function loadWebhookReconciliation() {
  void refreshWebhookReconciliation();
}

function webhookStatusColor(status: string) {
  if(status === "missing" || status === "noConsumer") { return "danger"; }
  if(status === "duplicate" || status === "elsewhere") { return "warning"; }

  return "success";
}

/**
 * "Subscribed", not "Connected": all that is verified is that Shopify has a registration. Whether
 * it reaches THIS OMS is the separate `elsewhere` state.
 */
function webhookStatusLabel(status: string) {
  if(status === "missing") { return translate("Missing"); }
  if(status === "noConsumer") { return translate("No consumer"); }
  if(status === "duplicate") { return translate("Duplicate"); }
  if(status === "elsewhere") { return translate("Delivers elsewhere"); }

  return translate("Subscribed");
}

const { jobs: cachedJobs, hydrated: jobsHydrated } = useServiceJobs();
const { cards: jobCards, ensure: ensureJob } = useShopifyTransferSyncJobs(() => shopId.value, () => cachedJobs.value);

const showJobModal = ref(false);
const webhookCallbackUrl = ref('');
const webhookSetupBusy = ref(false);
const webhookSetupUncertain = ref(false);
const webhookSetupError = ref('');
const webhookSetupResults = ref<Array<{topic: string; message: string; id?: string}>>([]);
async function registerMissingWebhooks() {
  if (webhookSetupBusy.value || webhookSetupUncertain.value) return;
  webhookSetupBusy.value = true;
  webhookSetupError.value = '';
  const targetShop = shopId.value;
  const endpoint = webhookCallbackUrl.value.trim();
  try {
    await refreshWebhookReconciliation();
    if (webhooksError.value) throw new Error(webhooksError.value);
    const topics = webhookRows.value.filter(row => row.status === 'missing').map(row => row.topic);
    for (const topic of topics) {
      if (targetShop !== shopId.value) break;
      const result = await registerMissingTransferWebhook(targetShop, topic, endpoint);
      webhookSetupResults.value.push({topic, id: result.subscriptionId,
        message: translate(result.status === 'created' ? 'Registered' : result.status === 'existing'
          ? 'Already registered; existing destination preserved.'
          : 'Registration outcome unknown. Check subscriptions before attempting further changes.')});
      if (result.status === 'uncertain') { webhookSetupUncertain.value = true; break; }
    }
    await refreshWebhookReconciliation();
  } catch (error: any) { webhookSetupError.value = error.message; }
  finally { webhookSetupBusy.value = false; }
}

const showWebhooksModal = ref(false);
const selectedJobName = ref("");
const selectedJob = ref<any>(null);
const configuringJobKey = ref("");

const selectedJobTitle = computed(() => selectedJob.value
  ? translate(selectedJob.value.definition.label)
  : "");
const selectedJobParameterNames = computed(() =>
  selectedJob.value?.definition.key === "update"
    ? ["shopId", "configId", "overlapMinutes"]
    : ["shopId", "configId"]);
const selectedJobParameterDescription = computed(() => selectedJob.value
  ? translate(selectedJob.value.definition.purpose)
  : "");

function jobStatusColor(status: string) {
  if(status === "active") { return "success"; }
  if(status === "paused") { return "warning"; }

  return "medium";
}

function jobStatusLabel(card: any) {
  if(card.status === "active") { return translate("Active"); }
  if(card.status === "paused") { return translate("Paused"); }

  // A global job is installed by the data load, never from this page, so say which is missing.
  return card.definition.scope === "shop" ? translate("Not configured") : translate("Not installed");
}

function openJobModal(card: any) {
  selectedJob.value = card;
  selectedJobName.value = card.jobName;
  showJobModal.value = true;
}

/**
 * Create this shop's clone of a seeded template, then open the modal on it.
 *
 * The clone is created paused: this makes the job exist and schedulable, it does not start pushing
 * to Shopify. Activating is the operator's next, explicit step in the modal.
 */
async function configureJob(card: any) {
  configuringJobKey.value = card.definition.key;
  try {
    selectedJob.value = card;
    selectedJobName.value = await ensureJob(card.definition.key);
    showJobModal.value = true;
  } catch (error: any) {
    commonUtil.showToast(error?.message || translate("The job could not be created."));
  } finally {
    configuringJobKey.value = "";
  }
}

function handleJobUpdated() {
  showJobModal.value = false;
}

const {
  start: startSyncDomains,
  stop: stopSyncDomains,
  error: transferSyncError,
  domainStatus,
  syncNow,
} = useCacheSync();
const viewSyncBaselineAt = ref(0);

const monitoringLoaded = computed(() => isTransferSyncMonitoringLoaded({
  cacheHydrated: hydrated.value,
  cachedRowCount: pendingTotal.value,
  liveSyncAt: Number(domainStatus.value.shopifyTransferSync?.at ?? 0),
  viewSyncBaselineAt: viewSyncBaselineAt.value,
}));

function activeSyncDomains() {
  return shopId.value
    ? [{ name: "shopifyTransferSync", args: { shopId: shopId.value } }]
    : [];
}

function startTransferSyncDomains() {
  void loadLaunch(shopId.value, undefined, true);
  // Ionic retains this component between visits. Use the last completed pass as this visit's
  // baseline so an old sync-end cannot authorize a new cold empty state.
  viewSyncBaselineAt.value = Number(domainStatus.value.shopifyTransferSync?.at ?? 0);
  void startSyncDomains(activeSyncDomains());
  void loadWebhookReconciliation();
}

async function retry() {
  retrying.value = true;
  try {
    await syncNow();
  } finally {
    retrying.value = false;
  }
}

watch(shopId, startTransferSyncDomains);
onIonViewWillEnter(startTransferSyncDomains);

onIonViewDidLeave(() => { stopSyncDomains(); });
</script>

<style scoped>
.count-skeleton {
  width: var(--spacer-3xl);
}

.filter-card {
  margin-block-end: var(--spacer-base);
}

.filter-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--spacer-lg);
  align-items: center;
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

.date-filter-item {
  width: 100%;
}

.fatal-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacer-sm);
  text-align: center;
  padding: var(--spacer-2xl);
}

.stale-banner ion-card-content {
  display: flex;
  align-items: center;
  gap: var(--spacer-sm);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacer-sm);
  text-align: center;
  padding: var(--spacer-2xl);
}

.overline {
  font-size: 0.75rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ion-color-medium);
}

.last-activity {
  max-width: 50%;
}

.transfer-row-accordion {
  margin-block: var(--spacer-sm);
}

.transfer-row-content {
  color: var(--ion-color-medium);
  font-size: 0.75rem;
  margin: 0;
}

/* Not .overline: these are CamelCase SystemMessageType ids, and uppercasing them is unreadable. */
.message-type {
  font-size: 0.75rem;
  color: var(--ion-color-medium);
}

.received-count {
  max-width: 6rem;
  margin-inline-end: var(--spacer-sm);
}
</style>
