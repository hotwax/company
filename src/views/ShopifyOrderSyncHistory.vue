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

        <SearchFilterCard v-model="filters.query" :placeholder="translate('Search by batch, job run, or import log ID')" :show-clear="false">
          <UniformFilterLayout @clear="clearFilters">
            <ion-select v-model="filters.outcome" :label="translate('Outcome')" label-placement="stacked" fill="outline" interface="popover">
              <ion-select-option value="">{{ translate("All outcomes") }}</ion-select-option>
              <ion-select-option v-for="option in outcomeOptions" :key="option.value" :value="option.value">{{ option.label }}</ion-select-option>
            </ion-select>
            <ion-select v-model="filters.sortOrder" :label="translate('Sort')" label-placement="stacked" fill="outline" interface="popover">
              <ion-select-option value="newest">{{ translate("Newest first") }}</ion-select-option>
              <ion-select-option value="oldest">{{ translate("Oldest first") }}</ion-select-option>
            </ion-select>
            <ion-input v-model="filters.requestedAfter" :label="translate('Requested after')" label-placement="stacked" fill="outline" type="datetime-local" />
            <ion-input v-model="filters.requestedBefore" :label="translate('Requested before')" label-placement="stacked" fill="outline" type="datetime-local" />
          </UniformFilterLayout>
        </SearchFilterCard>

        <ion-list lines="full">
          <ion-list-header>
            <ion-label>
              {{ runs.length === 1 ? translate("1 run") : translate("{count} runs", { count: runs.length }) }}
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
            <ion-item slot="header" :class="{ 'requested-run': run.id === requestedRun?.id }">
              <div class="list-item">
                <ion-item lines="none">
                  <ion-icon slot="start" :icon="runIcons[run.overallState]" :color="progressColor(run.overallState)" />
                  <ion-label>
                    {{ run.id }}
                    <ion-badge v-if="run.id === requestedRun?.id" color="primary">{{ translate("Requested run") }}</ion-badge>
                  </ion-label>
                </ion-item>
                <ion-label class="stat tablet ion-text-wrap">
                  <ion-chip outline :color="progressColor(run.batchRow.state)">{{ progressStateLabel(run.batchRow.state) }}</ion-chip>
                  <p>{{ translate("Fetch Shopify orders") }}</p>
                  <p v-if="run.batch.initDate">{{ translate("Queued at {time}", { time: formatDate(run.batch.initDate) }) }}</p>
                </ion-label>
                <ion-label class="stat tablet ion-text-wrap">
                  <ion-chip outline :color="run.importColor">{{ run.importStatus }}</ion-chip>
                  <p>{{ translate("Import into OMS") }}</p>
                  <p v-for="group in run.groups" :key="group.label">
                    {{ group.label }} · {{ group.logs.length ? importCountsLabel(group.logs) : emptyImportLabel(run.batchRow.state) }}
                  </p>
                </ion-label>
              </div>
            </ion-item>

            <ion-list slot="content" lines="full">
              <ion-item v-if="run.batch.processedDate">
                <ion-label>{{ translate("Processed") }}</ion-label>
                <ion-label slot="end">{{ formatDate(run.batch.processedDate) }}</ion-label>
              </ion-item>
              <ion-item v-if="run.batch.createdByJobRunId">
                <ion-label>{{ translate("Job run") }}</ion-label>
                <ion-label slot="end">{{ run.batch.createdByJobRunId }}</ion-label>
              </ion-item>
              <ion-item v-for="log in run.imports" :key="log.logId" button detail @click="openMdmLogDetails(log)">
                <ion-label>
                  {{ translate("Import log") }} {{ log.logId }}
                  <p>{{ log.configId }}</p>
                  <p>{{ importCountsLabel([log]) }}</p>
                </ion-label>
                <ion-label slot="end" class="ion-text-end" :color="progressColor(orderImportState(log))">
                  {{ progressStateLabel(orderImportState(log)) }}
                </ion-label>
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
import { alertCircleOutline, checkmarkCircleOutline, helpCircleOutline, refreshOutline, syncCircleOutline } from "ionicons/icons";
import { computed, reactive, ref, watch } from "vue";
import { useRoute } from "vue-router";
import SearchFilterCard from "@/components/common/SearchFilterCard.vue";
import UniformFilterLayout from "@/components/common/UniformFilterLayout.vue";
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
  fetchOrderRunImports, mergeOrderSyncHistoryBatches,
  useShopifyOrderSync,
  useShopifyOrderSyncHistorySession,
  useShopifySyncContext,
  useShopifySyncMessages
} from "@/composables/useShopify";
import { importCountsLabel, orderImportGroups, emptyImportLabel, orderImportState, progressColor, progressStateLabel } from "@/utils/orderImportDisplay";
import { formatDateTime, parseDateTimeValue } from "@/utils";
import { getSafeSyncRunQueryId } from "@/utils/syncRunRoute";

interface OrderSyncHistoryRun {
  id: string;
  batch: ShopifyOrderSyncBatch;
  imports: ShopifyOrderSyncImport[];
  batchRow: SyncProgressRow;
  importStatus: string;
  importColor: string;
  groups: ReturnType<typeof orderImportGroups>;
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
const orderHistoryJobName = computed(() => onboardingInitialLoadJobName("orders", props.id));
const orderHistoryJobRuns = useServiceJobRunsByJob(() => [orderHistoryJobName.value], 25);
const historyError = ref("");
const refreshVersion = ref(0);
const historySession = useShopifyOrderSyncHistorySession({
  remoteIds: () => syncContext.hydrated.value ? syncContext.remoteIds.value : [],
  jobName: () => orderHistoryJobName.value,
  refresh: async () => {
    historyError.value = "";
    await orderSync.loadImportConfigs(props.id);
    refreshVersion.value++;
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
const batches = computed(() => mergeOrderSyncHistoryBatches(
  orderSync.batches,
  onboardingHistoryMessages.records.value
));
const runIds = computed(() => batches.value.map(batch => batch.systemMessageId).filter(Boolean).join(","));
const logsByRun = ref<Record<string, ShopifyOrderSyncImport[]>>({});
const logReadFailed = ref(false);
watch([() => historySession.isPageActive.value && props.id, runIds, () => orderSync.latestImportChange, refreshVersion],
  async ([shop, ids], old, onCleanup) => {
    if (shop !== old?.[0]) { logsByRun.value = {}; logReadFailed.value = false; }
    if (!shop || !ids) return;
    let current = true;
    onCleanup(() => { current = false; });
    try {
      const messages = ids.split(",");
      const byRun: Record<string, ShopifyOrderSyncImport[]> = Object.fromEntries(messages.map(id => [id, []]));
      for (const log of await fetchOrderRunImports(messages)) byRun[log.systemMessageId!].push(log);
      if (current) { logsByRun.value = byRun; logReadFailed.value = false; }
    } catch {
      if (current) logReadFailed.value = true;
    }
  }, { immediate: true });
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

const defaultFilters = {
  query: "",
  outcome: "" as "" | SyncProgressState,
  sortOrder: "newest" as "newest" | "oldest",
  requestedAfter: "",
  requestedBefore: "",
};
const filters = reactive({ ...defaultFilters });
function clearFilters() { Object.assign(filters, defaultFilters); }

const outcomeOptions = computed(() => ([
  { value: "completed", label: progressStateLabel("completed") },
  { value: "partial", label: progressStateLabel("partial") },
  { value: "failed", label: progressStateLabel("failed") },
  { value: "active", label: progressStateLabel("active") },
  { value: "pending", label: progressStateLabel("pending") },
]));

const runIcons: Record<SyncProgressState, string> = {
  completed: checkmarkCircleOutline, partial: alertCircleOutline, failed: alertCircleOutline,
  active: syncCircleOutline, pending: helpCircleOutline,
};

const allRuns = computed<OrderSyncHistoryRun[]>(() => batches.value.flatMap((batch) => {
  const id = String(batch.systemMessageId || "").trim();
  if(!id) {return [];}
  const logs = logsByRun.value[id];
  const imports = logs || [];
  const [batchRow, importRow] = deriveSyncProgress(batch, imports);

  return [{
    id,
    batch,
    imports,
    batchRow,
    groups: logs && !logReadFailed.value ? orderImportGroups(logs, orderSync.importConfigsAvailable ? orderSync.importConfigIds : []) : [],
    importColor: imports.length && !logReadFailed.value ? progressColor(importRow.state) : "medium",
    importStatus: logReadFailed.value ? translate("Could not load import logs")
      : !logs ? translate("Loading") : logs.length ? progressStateLabel(importRow.state) : emptyImportLabel(batchRow.state),
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
  const query = filters.query.trim().toLowerCase();
  const filtered = allRuns.value.filter((run) => {
    if (query && ![run.id, run.batch.createdByJobRunId, ...run.imports.map(log => log.logId)]
      .some(id => String(id || "").toLowerCase().includes(query))) return false;
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
onIonViewWillEnter(() => { if (orderSync.selectedShopId !== props.id) orderSync.resetForShop(props.id); });

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
  --columns-tablet: 4;
  width: 100%;
  padding-block: var(--spacer-sm);
}

.list-item > .stat:last-child { justify-self: center; }

.requested-run-card p {
  margin-block: var(--spacer-xs);
  overflow-wrap: anywhere;
}

.requested-run {
  border-inline-start: 4px solid var(--ion-color-primary);
  background: rgba(var(--ion-color-primary-rgb), 0.08);
}

@media (max-width: 699px) {
  .list-item { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .list-item > ion-item { grid-column: 1 / -1; }
  .list-item > .stat { display: block; align-self: start; }
}
</style>
