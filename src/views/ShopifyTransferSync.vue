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
          <div class="kpi-grid ion-margin-top">
            <ion-card v-for="i in 4" :key="i">
              <ion-card-header>
                <ion-skeleton-text :animated="true" style="width: 60%" />
                <ion-skeleton-text :animated="true" style="width: 30%; height: 1.5rem" />
              </ion-card-header>
            </ion-card>
          </div>
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
          <section class="kpi-grid ion-margin-top">
            <ion-card>
              <ion-card-header>
                <ion-card-subtitle>{{ translate("Outstanding") }}</ion-card-subtitle>
                <ion-card-title :color="pendingTotal ? 'warning' : undefined">{{ pendingTotal }}</ion-card-title>
              </ion-card-header>
              <ion-card-content>{{ translate("Changes this shop has not sent to Shopify yet") }}</ion-card-content>
            </ion-card>

            <ion-card>
              <ion-card-header>
                <ion-card-subtitle>{{ translate("Webhook subscriptions") }}</ion-card-subtitle>
                <ion-card-title v-if="!webhookSummary" color="medium">
                  <ion-skeleton-text v-if="webhooksLoading" :animated="true" class="count-skeleton" />
                  <template v-else>
                    {{ translate("Not checked") }}
                  </template>
                </ion-card-title>
                <ion-card-title v-else :color="webhookSummaryColor">
                  {{ webhookSummary.subscribedCount }} / {{ webhookSummary.requiredCount }}
                </ion-card-title>
              </ion-card-header>
              <ion-card-content>
                {{ translate("Subscribed of the topics this OMS can consume") }}
                <p v-if="webhookSummary && webhookProblems.length" class="ion-text-wrap">
                  {{ webhookProblems.join(" · ") }}
                </p>
                <p v-if="webhookSummary && !webhookSummary.endpointAsserted" class="ion-text-wrap">
                  {{ translate("Callback URLs are not being checked.") }}
                </p>
              </ion-card-content>
            </ion-card>
          </section>

          <!-- Every job the sync depends on, in pipeline order. Neither stager calls Shopify: they
               write MDM files that the framework's ScheduledDataManagerRunner picks up, so an
               active stager and a delivered transfer are still two different questions. -->
          <h2 class="section-heading">
            {{ translate("Jobs") }}
          </h2>
          <section class="kpi-grid">
            <ion-card v-for="card in jobCards" :key="card.definition.key">
              <ion-card-header>
                <ion-card-subtitle>{{ translate(card.definition.label) }}</ion-card-subtitle>
                <ion-card-title v-if="!jobsHydrated">
                  <ion-skeleton-text :animated="true" class="count-skeleton" />
                </ion-card-title>
                <ion-card-title v-else :color="jobStatusColor(card.status)">
                  {{ jobStatusLabel(card) }}
                </ion-card-title>
              </ion-card-header>
              <ion-card-content>
                <p class="message-type">
                  {{ card.jobName }}
                </p>
                <p class="ion-text-wrap">
                  {{ translate(card.definition.purpose) }}
                </p>
                <p v-if="card.nextRun" class="overline">
                  {{ translate("Next run") }} {{ formatDateTime(card.nextRun) || translate("Not available") }}
                </p>
                <ion-button
                  v-if="jobsHydrated && (card.job || card.definition.scope === 'shop')"
                  size="small"
                  fill="outline"
                  class="job-action"
                  :disabled="configuringJobKey === card.definition.key"
                  @click="card.job ? openJobModal(card) : configureJob(card)"
                >
                  <ion-spinner v-if="configuringJobKey === card.definition.key" name="crescent" />
                  <template v-else>
                    {{ card.job ? translate("Manage job") : translate("Set up and manage job") }}
                  </template>
                </ion-button>
              </ion-card-content>
            </ion-card>
          </section>

          <!-- Topics subscribed at Shopify, the OMS message type each one is consumed by, and the
               received-status backlog per type — reconciled in one table so an operator never has
               to open three screens to answer "is this topic actually wired end to end?". -->
          <ion-accordion-group class="webhook-card" expand="inset">
            <ion-accordion value="webhook-subscriptions">
              <ion-item slot="header" lines="none" class="webhook-header">
                <ion-label class="ion-text-wrap">
                  <p class="webhook-subtitle">{{ translate("Webhook subscriptions") }}</p>
                  <h2 class="webhook-title">{{ translate("Transfer and shipment topics registered at Shopify") }}</h2>
                </ion-label>
              </ion-item>

              <div slot="content" class="webhook-content">
                <ion-card-content>
                  <div class="webhook-actions">
                    <ion-button size="small" fill="outline" :disabled="webhooksLoading" @click="loadWebhookReconciliation()">
                      <ion-spinner v-if="webhooksLoading" name="crescent" />
                      <template v-else>
                        {{ translate("Refresh") }}
                      </template>
                    </ion-button>
                    <span v-if="otherWebhookCount" class="overline">
                      {{ otherWebhookCount }} {{ translate("other subscriptions on this shop") }}
                    </span>
                    <span v-if="webhookSummary && webhookSummary.elsewhereCount" class="overline">
                      {{ translate("Delivering to") }} {{ elsewhereHosts.join(", ") }}, {{ translate("not this OMS") }}
                    </span>
                    <span v-if="receivedTruncated" class="overline">
                      {{ translate("Received counts are a floor; the backlog is deeper than one page.") }}
                    </span>
                  </div>

                  <ion-label v-if="webhooksError" class="ion-text-wrap webhook-error">
                    <ion-icon :icon="warningOutline" color="danger" />
                    {{ webhooksError }}
                  </ion-label>

                  <ion-label v-else-if="webhooksLoading && !webhookRows.length" class="ion-text-wrap">
                    <ion-skeleton-text :animated="true" style="width: 45%" />
                  </ion-label>

                  <ion-label v-else-if="!webhookRows.length" class="ion-text-wrap">
                    <p>{{ translate("No transfer or shipment webhook topics are registered on this shop.") }}</p>
                  </ion-label>
                </ion-card-content>

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
              </div>
            </ion-accordion>
          </ion-accordion-group>

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
                <ion-badge v-if="tabCount(tab)" :color="tab.key === segment ? 'primary' : 'medium'">
                  {{ tabCount(tab) }}
                </ion-badge>
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
            <ion-list v-else-if="syncedRows.length" lines="full">
              <ion-item v-for="(row, index) in syncedRows" :key="`${row.orderId}-${index}`" button detail @click="openDetail(row)">
                <ion-label class="ion-text-wrap">
                  {{ row.orderId }}
                  <p>{{ artifactLabel(row) }}</p>
                  <p>{{ row.shopifyInventoryTransferId || translate("Not available") }}</p>
                </ion-label>
                <ion-label slot="end" class="ion-text-end last-activity">
                  {{ formatDateTime(row.syncedDate) || translate("Not available") }}
                  <p>{{ translate("Synced") }}</p>
                </ion-label>
              </ion-item>
            </ion-list>
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
              <ion-icon :icon="swapHorizontalOutline" />
              <ion-label class="ion-text-wrap">
                <h2>{{ translate("Everything is in sync") }}</h2>
                <p>{{ translate("This shop has no transfer work waiting to reach Shopify. A transfer becomes owned by exactly one shop at approval time, when the order and the receiving location share exactly one common Shopify shop; a shop that owns none will also show nothing here.") }}</p>
              </ion-label>
            </ion-card-content>
          </ion-card>

          <ion-card v-else-if="!segmentRows.length">
            <ion-card-content>
              {{ translate("Nothing outstanding in this tab.") }}
            </ion-card-content>
          </ion-card>

          <ion-list v-else lines="full">
            <ion-item
              v-for="row in segmentRows"
              :key="row.pendingKey"
              button
              detail
              @click="openDetail(row)"
            >
              <ion-label class="ion-text-wrap">
                {{ row.orderId }}
                <p>{{ artifactLabel(row) }}</p>
                <p>{{ row.shopifyInventoryTransferId || translate("Not created yet") }}</p>
              </ion-label>
              <ion-label slot="end" class="ion-text-end last-activity">
                {{ formatDateTime(row.occurredAt) || translate("Not available") }}
                <p>{{ translate("Outstanding since") }}</p>
              </ion-label>
            </ion-item>
          </ion-list>
          </template>
        </template>
      </template>
    </ion-content>

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
  IonCardSubtitle, IonCardTitle, IonContent, IonHeader,
  IonIcon, IonItem, IonLabel, IonList, IonPage, IonSegment, IonSegmentButton,
  IonSkeletonText, IonSpinner, IonTitle, IonToolbar, onIonViewDidLeave, onIonViewWillEnter,
} from "@ionic/vue";
import { swapHorizontalOutline, warningOutline } from "ionicons/icons";
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import ServiceJobDetailsModal from "@/components/common/ServiceJobDetailsModal.vue";
import { useCacheSync } from "@/composables/useCacheSync";
import { useServiceJobs } from "@/composables/useServiceJobs";
import {
  useShopifyPendingCounts,
  useShopifyPendingSegment,
  useShopifySyncedSegment,
  useShopifyTransferSyncJobs,
  useShopifyWebhookReconciliation,
} from "@/composables/useShopifyTransferSync";
import { formatDateTime } from "@/utils";
import { isTransferSyncMonitoringLoaded } from "@/utils/shopifyTransferSync";
import type { PendingSegment, SyncDirection } from "@/workers/domains/shopifyTransferSyncDomain";

const props = defineProps<{ id?: string }>();
const router = useRouter();

const retrying = ref(false);

const shopId = computed(() => String(props.id ?? ""));

/**
 * The tabs. `cancellation` and `itemChange` share one tab: they are the same operator concern -
 * something was reduced or cancelled and Shopify has not been told - at two different grains
 * (whole transfer, and one line). They stay two resources because merging them in one query would
 * need a distinct over a mixed projection; merging them in one tab costs nothing.
 */
const SEGMENT_TABS = [
  { key: "create" as PendingSegment, label: "Not yet created", also: undefined as PendingSegment | undefined },
  { key: "shipment" as PendingSegment, label: "Shipments", also: undefined as PendingSegment | undefined },
  { key: "receipt" as PendingSegment, label: "Receipts", also: undefined as PendingSegment | undefined },
  { key: "cancellation" as PendingSegment, label: "Cancellations", also: "itemChange" as PendingSegment | undefined },
] as const;

const segment = ref<PendingSegment>("create");

const { counts, total: pendingTotal, hydrated } = useShopifyPendingCounts(() => shopId.value);
const { rows: primaryRows } = useShopifyPendingSegment(() => shopId.value, () => segment.value);
// The paired segment for the combined tab; empty for every other tab.
const { rows: pairedRows } = useShopifyPendingSegment(
  () => shopId.value,
  () => (segment.value === "cancellation" ? "itemChange" : ("" as PendingSegment)),
);

const segmentRows = computed<any[]>(() => [...primaryRows.value, ...pairedRows.value]
  .sort((a: any, b: any) => Number(a?.occurredAt ?? 0) - Number(b?.occurredAt ?? 0)));

function tabCount(tab: { key: PendingSegment; also?: PendingSegment }): number {
  return (counts.value[tab.key] ?? 0) + (tab.also ? (counts.value[tab.also] ?? 0) : 0);
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

/**
 * The combined tab shows two segments at once, which the cache can merge but a paged on-demand
 * read cannot. Synced history therefore shows the primary segment of the tab; the paired one has
 * its own resource and is reachable from the transfer's detail timeline.
 */
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

/** Which artifact this row is, named the way the tab it sits in would name it. */
function artifactLabel(row: any): string {
  if(row?.shipmentStatusId) {return `${translate("Shipment")} ${row.shipmentId}`;}
  if(row?.receiptId) {return `${translate("Receipt")} ${row.receiptId}`;}
  if(row?.orderStatusId) {return translate("Transfer cancelled");}
  if(row?.orderItemChangeId) {return `${translate("Line")} ${row.orderItemSeqId}`;}

  return `${translate("Line")} ${row?.orderItemSeqId ?? ""}`.trim();
}

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

function openDetail(row: any) {
  router.push(`/shopify-connection-details/${props.id}/transfer-sync/${row.orderId}`);
}

watch(shopId, startTransferSyncDomains);
onIonViewWillEnter(startTransferSyncDomains);

onIonViewDidLeave(() => { stopSyncDomains(); });
</script>

<style scoped>
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--spacer-base);
  margin-block-end: var(--spacer-base);
}

.kpi-grid ion-card {
  margin: 0;
}

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

.webhook-card {
  margin-block-end: var(--spacer-base);
}

.webhook-header {
  --background: var(--ion-card-background, var(--ion-background-color));
  --inner-padding-end: var(--spacer-base);
  --padding-start: var(--spacer-base);
}

.webhook-subtitle {
  margin: 0 0 var(--spacer-xs);
  color: var(--ion-color-medium);
  font-size: 0.875rem;
}

.webhook-title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
}

.webhook-content {
  background: var(--ion-card-background, var(--ion-background-color));
}

.webhook-actions {
  display: flex;
  align-items: center;
  gap: var(--spacer-sm);
  flex-wrap: wrap;
  margin-block-end: var(--spacer-sm);
}

.webhook-error {
  display: flex;
  align-items: center;
  gap: var(--spacer-xs);
}

/* Not .overline: these are CamelCase SystemMessageType ids, and uppercasing them is unreadable. */
.message-type {
  font-size: 0.75rem;
  color: var(--ion-color-medium);
}

.section-heading {
  margin-block: var(--spacer-base) var(--spacer-sm);
}

.job-action {
  margin-block-start: var(--spacer-sm);
}

.received-count {
  max-width: 6rem;
  margin-inline-end: var(--spacer-sm);
}
</style>
