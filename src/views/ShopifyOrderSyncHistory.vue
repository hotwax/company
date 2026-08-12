<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button :default-href="backHref" />
        </ion-buttons>
        <ion-title>{{ translate("Order import history") }}</ion-title>
        <ion-buttons slot="end">
          <ion-button
            :disabled="historySession.isRefreshing.value"
            :aria-label="translate('Refresh order import history')"
            @click="historySession.manualRefresh"
          >
            <ion-spinner v-if="historySession.isRefreshing.value" name="crescent" />
            <ion-icon v-else slot="icon-only" :icon="refreshOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-card v-if="isLoading">
        <ion-card-header>
          <ion-card-title>{{ translate("Loading order import history") }}</ion-card-title>
        </ion-card-header>
        <ion-card-content><ion-spinner name="crescent" /></ion-card-content>
      </ion-card>

      <template v-else>
        <ion-card v-if="historyError" role="alert">
          <ion-card-content>{{ historyError }}</ion-card-content>
        </ion-card>

        <ion-card
          v-if="requestedSystemMessageId || requestedJobRunId"
          class="requested-run-card"
          role="status"
          aria-live="polite"
        >
          <ion-card-header>
            <ion-card-title>{{ translate("Requested onboarding run") }}</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <p v-if="requestedSystemMessageId">
              <strong>{{ translate("System message") }}:</strong> {{ requestedSystemMessageId }}
            </p>
            <p v-else-if="correlatedSystemMessageId">
              <strong>{{ translate("System message") }}:</strong> {{ correlatedSystemMessageId }}
            </p>
            <p v-if="requestedJobRunId">
              <strong>{{ translate("Job run") }}:</strong> {{ requestedJobRunId }}
            </p>
            <ion-note v-if="!requestedRun">
              {{ translate("This run is not in the loaded sync history yet. The page will identify it when its system message appears.") }}
            </ion-note>
          </ion-card-content>
        </ion-card>

        <ion-list lines="full">
          <ion-list-header>
            <ion-label>{{ translate("Filters") }}</ion-label>
          </ion-list-header>
          <ion-item>
            <ion-select
              :label="translate('Outcome')"
              :value="filters.outcome"
              interface="popover"
              @ion-change="filters.outcome = $event.detail.value"
            >
              <ion-select-option value="">
                {{ translate("All outcomes") }}
              </ion-select-option>
              <ion-select-option v-for="option in outcomeOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </ion-select-option>
            </ion-select>
          </ion-item>
          <ion-item>
            <ion-select
              :label="translate('Sort')"
              :value="filters.sortOrder"
              interface="popover"
              @ion-change="filters.sortOrder = $event.detail.value === 'oldest' ? 'oldest' : 'newest'"
            >
              <ion-select-option value="newest">
                {{ translate("Newest first") }}
              </ion-select-option>
              <ion-select-option value="oldest">
                {{ translate("Oldest first") }}
              </ion-select-option>
            </ion-select>
          </ion-item>
          <ion-item>
            <ion-input
              :label="translate('Requested after')"
              type="datetime-local"
              :value="filters.requestedAfter"
              @ion-change="filters.requestedAfter = String($event.detail.value || '')"
            />
          </ion-item>
          <ion-item>
            <ion-input
              :label="translate('Requested before')"
              type="datetime-local"
              :value="filters.requestedBefore"
              @ion-change="filters.requestedBefore = String($event.detail.value || '')"
            />
          </ion-item>
        </ion-list>

        <ion-list lines="full">
          <ion-list-header>
            <ion-label>
              {{ translate("A list of previous order sync runs") }}
              <p>{{ shopName }}</p>
            </ion-label>
          </ion-list-header>
          <ion-item v-if="!runs.length" lines="none">
            <ion-label>
              {{ batches.length ? translate("No runs match the current filters") : translate("No order sync history found") }}
            </ion-label>
          </ion-item>
        </ion-list>

        <ion-accordion-group>
          <ion-accordion v-for="run in runs" :key="run.id" :value="run.id">
            <div
              slot="header"
              class="list-item"
              :class="{ 'requested-run': run.id === requestedRun?.id }"
            >
              <ion-item lines="none">
                <ion-icon slot="start" :icon="stateIcon(run.overallState)" :color="progressColor(run.overallState)" />
                <ion-label>
                  {{ run.id }}
                  <ion-badge v-if="run.id === requestedRun?.id" color="primary">
                    {{ translate("Requested run") }}
                  </ion-badge>
                  <p>{{ translate("Requested") }}: {{ formatDate(run.batch.initDate) }}</p>
                  <p v-if="importCountsLabel(run)">
                    {{ importCountsLabel(run) }}
                  </p>
                </ion-label>
              </ion-item>
              <ion-label class="stat">
                <ion-chip outline :color="progressColor(run.batchRow.state)">
                  <ion-label>{{ progressStateLabel(run.batchRow.state) }}</ion-label>
                </ion-chip>
                <p>{{ translate("Shopify order batch request") }}</p>
              </ion-label>
              <ion-label class="stat">
                <ion-chip outline :color="progressColor(run.importRow.state)">
                  <ion-label>{{ progressStateLabel(run.importRow.state) }}</ion-label>
                </ion-chip>
                <p>{{ translate("HotWax order import") }}</p>
              </ion-label>
              <div />
            </div>

            <ion-list slot="content" lines="full">
              <ion-item>
                <ion-label>
                  {{ translate("System message") }}
                  <p>{{ run.id }}</p>
                </ion-label>
                <ion-badge slot="end" :color="progressColor(run.batchRow.state)">
                  {{ batchStatusLabel(run.batch.statusId) }}
                </ion-badge>
              </ion-item>
              <ion-item>
                <ion-label>
                  {{ translate("Processed") }}
                  <p>{{ formatDate(run.batch.processedDate) }}</p>
                </ion-label>
              </ion-item>
              <ion-item>
                <ion-label>
                  {{ translate("Job run") }}
                  <p>{{ run.batch.createdByJobRunId || translate("Not available") }}</p>
                </ion-label>
              </ion-item>
              <ion-item v-for="log in run.imports" :key="log.logId">
                <ion-label>
                  {{ importLabel(log.configId) }}
                  <p>{{ log.logId }}</p>
                  <p>{{ log.totalRecordCount }} {{ translate("records") }}</p>
                  <p>{{ log.successRecordCount }} {{ translate("successful") }}</p>
                  <p>{{ log.failedRecordCount }} {{ translate("failed") }}</p>
                </ion-label>
                <ion-badge slot="end" :color="statusColor(log.statusId, log.failedRecordCount)">
                  {{ statusLabel(log.statusId, log.failedRecordCount) }}
                </ion-badge>
                <ion-button slot="end" fill="clear" @click="openMdmLogDetails(log)">
                  {{ translate("View MDM log") }}
                </ion-button>
              </ion-item>
              <ion-item v-if="!run.imports.length">
                <ion-label>{{ translate("No MDM import was required for this batch") }}</ion-label>
              </ion-item>
            </ion-list>
          </ion-accordion>
        </ion-accordion-group>
      </template>
    </ion-content>
    <ShopifyOrderSyncMdmLogModal
      :is-open="showMdmLogModal"
      :log-id="selectedMdmLog?.logId || ''"
      :details="selectedMdmLogDetails"
      @close="closeMdmLogDetails"
    />
  </ion-page>
</template>

<script setup lang="ts">
import { translate } from "@common";
import {
  IonAccordion, IonAccordionGroup, IonBackButton, IonBadge, IonButton, IonButtons, IonCard,
  IonCardContent, IonCardHeader, IonCardTitle, IonChip, IonContent, IonHeader, IonIcon, IonInput,
  IonItem, IonLabel, IonList, IonListHeader, IonNote, IonPage, IonSelect, IonSelectOption, IonSpinner,
  IonTitle, IonToolbar, onIonViewWillEnter
} from "@ionic/vue";
import {
  alertCircleOutline, checkmarkCircleOutline, helpCircleOutline, refreshOutline, syncCircleOutline
} from "ionicons/icons";
import { computed, reactive, ref } from "vue";
import { useRoute } from "vue-router";
import ShopifyOrderSyncMdmLogModal from "@/components/shopify-order-sync/ShopifyOrderSyncMdmLogModal.vue";
import {
  onboardingInitialLoadJobName,
  onboardingJobRunSystemMessageId
} from "@/composables/useProductStoreOnboardingInitialLoad";
import { useServiceJobRunsByJob } from "@/composables/useServiceJobs";
import {
  ORDER_HISTORY_SYNC_FEATURE,
  type ShopifyOrderSyncBatch,
  type ShopifyOrderSyncImport,
  type SyncProgressRow,
  type SyncProgressState,
  deriveSyncOverallState,
  deriveSyncProgress,
  mergeOrderSyncHistoryBatches,
  useShopifyOrderSync,
  useShopifyOrderSyncHistorySession,
  useShopifySyncContext,
  useShopifySyncImports,
  useShopifySyncMessages
} from "@/composables/useShopify";
import { formatDateTime, parseDateTimeValue } from "@/utils";
import { getSafeSyncRunQueryId } from "@/utils/syncRunRoute";

interface OrderSyncHistoryRun {
  id: string;
  batch: ShopifyOrderSyncBatch;
  imports: ShopifyOrderSyncImport[];
  batchRow: SyncProgressRow;
  importRow: SyncProgressRow;
  overallState: SyncProgressState;
  requestedTime: number;
}

const props = defineProps<{ id: string }>();
const route = useRoute();
const orderSync = useShopifyOrderSync();
const syncContext = useShopifySyncContext(() => props.id);
const onboardingHistoryMessages = useShopifySyncMessages(
  ORDER_HISTORY_SYNC_FEATURE,
  syncContext,
  { limit: 100 }
);
const onboardingHistoryImports = useShopifySyncImports(ORDER_HISTORY_SYNC_FEATURE);
const orderHistoryJobName = computed(() => onboardingInitialLoadJobName("orders", props.id));
const orderHistoryJobRuns = useServiceJobRunsByJob(() => [orderHistoryJobName.value], 25);
const historyError = ref("");
const historySession = useShopifyOrderSyncHistorySession({
  remoteIds: () => syncContext.hydrated.value ? syncContext.remoteIds.value : [],
  jobName: () => orderHistoryJobName.value,
  refresh: () => {
    historyError.value = "";

    return Promise.resolve();
  },
  onError: (error) => { historyError.value = String((error as Error)?.message || error || ""); }
});
const requestedSystemMessageId = computed(() => getSafeSyncRunQueryId(route.query.systemMessageId));
const requestedJobRunId = computed(() => getSafeSyncRunQueryId(route.query.jobRunId));
const requestedJobRun = computed(() => requestedJobRunId.value
  ? orderHistoryJobRuns.runsFor(orderHistoryJobName.value).find((run: any) =>
    String(run.jobRunId || "") === requestedJobRunId.value) || null
  : null);
const correlatedSystemMessageId = computed(() => requestedSystemMessageId.value ||
  onboardingJobRunSystemMessageId("orders", requestedJobRun.value));
const backHref = computed(() => {
  const value = Array.isArray(route.query.returnTo) ? route.query.returnTo[0] : route.query.returnTo;
  const path = String(value || "").trim();

  return path.startsWith("/") && !path.startsWith("//") && !path.includes("://")
    ? path
    : `/shopify-connection-details/${encodeURIComponent(props.id)}/order-sync`;
});
/**
 * Batches and their imports come straight from the cache, LIVE.
 *
 * This page used to hold them in local refs filled by `orderSync.loadHistory(id)` — a store-era
 * contract that returned `{ batches, importsBySystemMessageId }`. That contract is gone: both values
 * are now cached projections that re-derive themselves whenever the sync worker commits, so the page
 * needs no fetch, no copy, and no re-entry to show a new run appearing.
 *
 * `isLoading` is the cache's own hydration flag rather than a request flag. On a revisit the cache is
 * already hydrated, so no skeleton is shown at all.
 */
const batches = computed(() => mergeOrderSyncHistoryBatches(
  orderSync.batches,
  onboardingHistoryMessages.records.value
));
const importsBySystemMessageId = computed(() => ({
  ...orderSync.importsBySystemMessageId,
  ...onboardingHistoryImports.bySystemMessageId.value
}));
const isLoading = computed(() => !orderSync.hydrated || !onboardingHistoryMessages.hydrated.value);
const showMdmLogModal = ref(false);
const selectedMdmLog = ref<ShopifyOrderSyncImport | null>(null);
const shopName = computed(() => orderSync.shop?.name || translate("Shopify instance {id}", { id: props.id }));
const selectedMdmLogDetails = computed(() => selectedMdmLog.value ? {
  statusId: selectedMdmLog.value.statusId,
  configId: selectedMdmLog.value.configId,
  systemMessageId: selectedMdmLog.value.systemMessageId,
  startedAt: selectedMdmLog.value.createdDate,
  completedAt: selectedMdmLog.value.finishDateTime,
  totalRecordCount: selectedMdmLog.value.totalRecordCount,
  successRecordCount: selectedMdmLog.value.successRecordCount,
  failedRecordCount: selectedMdmLog.value.failedRecordCount,
} : {});

const filters = reactive({
  outcome: "" as "" | SyncProgressState,
  sortOrder: "newest" as "newest" | "oldest",
  requestedAfter: "",
  requestedBefore: "",
});

const outcomeOptions = computed(() => ([
  { value: "completed", label: progressStateLabel("completed") },
  { value: "partial", label: progressStateLabel("partial") },
  { value: "failed", label: progressStateLabel("failed") },
  { value: "active", label: progressStateLabel("active") },
  { value: "pending", label: progressStateLabel("pending") },
]));

const SYSTEM_MESSAGE_STATUS_LABELS: Record<string, string> = {
  SmsgProduced: "Produced",
  SmsgSent: "Sent",
  SmsgReceived: "Received",
  SmsgConsumed: "Consumed",
  SmsgConfirmed: "Confirmed",
  SmsgError: "Error",
  SmsgCancelled: "Cancelled",
};

const allRuns = computed<OrderSyncHistoryRun[]>(() => batches.value.flatMap((batch) => {
  const id = String(batch.systemMessageId || "").trim();
  if(!id) {return [];}
  const imports = importsBySystemMessageId.value[id] || [];
  const [batchRow, importRow] = deriveSyncProgress(batch, imports);

  return [{
    id,
    batch,
    imports,
    batchRow,
    importRow,
    overallState: deriveSyncOverallState(batchRow, importRow),
    requestedTime: toMillis(batch.initDate),
  }];
}));

const requestedRun = computed(() => {
  if(correlatedSystemMessageId.value) {
    return allRuns.value.find((run) => run.id === correlatedSystemMessageId.value) || null;
  }
  if(requestedJobRunId.value) {
    return allRuns.value.find((run) =>
      String(run.batch.createdByJobRunId || "") === requestedJobRunId.value) || null;
  }

  return null;
});

const runs = computed<OrderSyncHistoryRun[]>(() => {
  const requestedAfter = filterTimestamp(filters.requestedAfter);
  const requestedBefore = filterTimestamp(filters.requestedBefore);
  const filtered = allRuns.value.filter((run) => {
    if(filters.outcome && run.overallState !== filters.outcome) {return false;}
    if(requestedAfter && run.requestedTime < requestedAfter) {return false;}
    if(requestedBefore && run.requestedTime > requestedBefore) {return false;}

    return true;
  });

  const sorted = filters.sortOrder === "oldest" ? [...filtered].reverse() : filtered;
  if(!requestedRun.value || sorted.some((run) => run.id === requestedRun.value?.id)) {return sorted;}

  return [requestedRun.value, ...sorted];
});

/** Bind the shared session to this shop; the reads above then resolve against it. */
onIonViewWillEnter(() => orderSync.resetForShop(props.id));

function toMillis(value: unknown): number {
  if(typeof value === "number" && Number.isFinite(value)) {
    return value > 0 && value < 100_000_000_000 ? value * 1000 : value;
  }
  const parsed = Date.parse(String(value || ""));

  return Number.isFinite(parsed) ? parsed : 0;
}

function filterTimestamp(value: string): number {
  if(!value) {return 0;}

  return parseDateTimeValue(value)?.toMillis() || 0;
}

function formatDate(value: unknown): string {
  return formatDateTime(value) || translate("Not available");
}

/** Both ids are optional on the cached rows these render, so both labels accept their absence. */
function importLabel(configId: string | undefined): string {
  if(configId === "BULK_ORDER_HISTORY") {return translate("Historic order import");}

  return configId === "SYNC_SHOPIFY_ORDER" ? translate("New order import") : translate("Updated order import");
}

function batchStatusLabel(statusId: string | undefined): string {
  const label = statusId ? SYSTEM_MESSAGE_STATUS_LABELS[statusId] : "";

  return label ? translate(label) : statusLabel(statusId ?? "");
}

function progressStateLabel(state: SyncProgressState): string {
  if(state === "completed") {return translate("Completed");}
  if(state === "partial") {return translate("Partially completed");}
  if(state === "failed") {return translate("Failed");}
  if(state === "active") {return translate("In progress");}

  return translate("Waiting");
}

function importCountsLabel(run: OrderSyncHistoryRun): string {
  const { state, successfulRecords, failedRecords, logCount } = run.importRow;
  if(!logCount && (state === "pending" || state === "active")) {return "";}
  const processed = translate("{count} processed", { count: successfulRecords });
  if(!failedRecords) {return processed;}

  return `${processed}, ${translate("{count} failed", { count: failedRecords })}`;
}

function progressColor(state: SyncProgressState): string {
  if(state === "completed") {return "success";}
  if(state === "partial") {return "warning";}
  if(state === "failed") {return "danger";}
  if(state === "active") {return "primary";}

  return "medium";
}

function stateIcon(state: SyncProgressState): string {
  if(state === "completed") {return checkmarkCircleOutline;}
  if(state === "partial" || state === "failed") {return alertCircleOutline;}
  if(state === "active") {return syncCircleOutline;}

  return helpCircleOutline;
}

function statusLabel(status: unknown, failed = 0): string {
  const value = String(status || "").toLowerCase();
  if(failed > 0 || value.includes("error") || value.includes("fail")) {return translate("Failed");}
  if(value.includes("complete") || value.includes("success") || value.includes("finish") || value.includes("confirm")) {return translate("Completed");}
  if(value.includes("run") || value.includes("process") || value.includes("active")) {return translate("In progress");}

  return status ? String(status) : translate("Not available");
}

function statusColor(status: unknown, failed = 0): string {
  return statusLabel(status, failed) === translate("Failed") ? "danger" : statusLabel(status, failed) === translate("Completed") ? "success" : "primary";
}

function openMdmLogDetails(log: ShopifyOrderSyncImport) {
  selectedMdmLog.value = log;
  showMdmLogModal.value = true;
}

function closeMdmLogDetails() {
  showMdmLogModal.value = false;
  selectedMdmLog.value = null;
}
</script>

<style scoped>
.list-item {
  --columns-desktop: 4;
  border-top: var(--border-medium);
}

.requested-run-card p {
  margin-block: var(--spacer-xs);
  overflow-wrap: anywhere;
}

.requested-run {
  border-inline-start: 4px solid var(--ion-color-primary);
  background: rgba(var(--ion-color-primary-rgb), 0.08);
}

@media (min-width: 991px) {
  .list-item {
    padding-block: var(--spacer-sm);
    padding-inline-end: var(--spacer-sm);
  }
}
</style>
