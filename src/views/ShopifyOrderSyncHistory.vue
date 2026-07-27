<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button :default-href="`/shopify-connection-details/${id}/order-sync`" />
        </ion-buttons>
        <ion-title>{{ translate("Order import history") }}</ion-title>
        <!--
          No refresh button: this list is a live projection of the cache, so a new run appears on its
          own as the sync worker commits. A manual refresh would only re-render the same values while
          flashing a spinner.
        -->
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
        <ion-list lines="full">
          <ion-list-header>
            <ion-label>{{ translate("Filters") }}</ion-label>
          </ion-list-header>
          <ion-item>
            <ion-select
              :label="translate('Outcome')"
              :value="filters.outcome"
              interface="popover"
              @ionChange="filters.outcome = $event.detail.value"
            >
              <ion-select-option value="">{{ translate("All outcomes") }}</ion-select-option>
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
              @ionChange="filters.sortOrder = $event.detail.value === 'oldest' ? 'oldest' : 'newest'"
            >
              <ion-select-option value="newest">{{ translate("Newest first") }}</ion-select-option>
              <ion-select-option value="oldest">{{ translate("Oldest first") }}</ion-select-option>
            </ion-select>
          </ion-item>
          <ion-item>
            <ion-input
              :label="translate('Requested after')"
              type="datetime-local"
              :value="filters.requestedAfter"
              @ionChange="filters.requestedAfter = String($event.detail.value || '')"
            />
          </ion-item>
          <ion-item>
            <ion-input
              :label="translate('Requested before')"
              type="datetime-local"
              :value="filters.requestedBefore"
              @ionChange="filters.requestedBefore = String($event.detail.value || '')"
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
            <div slot="header" class="list-item">
              <ion-item lines="none">
                <ion-icon slot="start" :icon="stateIcon(run.overallState)" :color="progressColor(run.overallState)" />
                <ion-label>
                  {{ run.id }}
                  <p>{{ translate("Requested") }}: {{ formatDate(run.batch.initDate) }}</p>
                  <p v-if="importCountsLabel(run)">{{ importCountsLabel(run) }}</p>
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
              <div></div>
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
import {
  IonAccordion, IonAccordionGroup, IonBackButton, IonBadge, IonButton, IonButtons, IonCard,
  IonCardContent, IonCardHeader, IonCardTitle, IonChip, IonContent, IonHeader, IonIcon, IonInput,
  IonItem, IonLabel, IonList, IonListHeader, IonPage, IonSelect, IonSelectOption, IonSpinner,
  IonTitle, IonToolbar, onIonViewWillEnter
} from "@ionic/vue";
import {
  alertCircleOutline, checkmarkCircleOutline, helpCircleOutline, syncCircleOutline
} from "ionicons/icons";
import ShopifyOrderSyncMdmLogModal from "@/components/shopify-order-sync/ShopifyOrderSyncMdmLogModal.vue";
import {
  deriveSyncOverallState,
  deriveSyncProgress,
  useShopifyOrderSync,
  type SyncProgressRow,
  type SyncProgressState,
  type ShopifyOrderSyncBatch,
  type ShopifyOrderSyncImport
} from "@/composables/useShopify";
import { translate } from "@common";
import { formatDateTime, parseDateTimeValue } from "@/utils";
import { computed, reactive, ref } from "vue";

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
const orderSync = useShopifyOrderSync();
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
const batches = computed(() => orderSync.batches);
const importsBySystemMessageId = computed(() => orderSync.importsBySystemMessageId);
const isLoading = computed(() => !orderSync.hydrated);
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

const allRuns = computed<OrderSyncHistoryRun[]>(() => batches.value.map((batch) => {
  const imports = importsBySystemMessageId.value[batch.systemMessageId] || [];
  const [batchRow, importRow] = deriveSyncProgress(batch, imports);
  return {
    id: batch.systemMessageId,
    batch,
    imports,
    batchRow,
    importRow,
    overallState: deriveSyncOverallState(batchRow, importRow),
    requestedTime: toMillis(batch.initDate),
  };
}));

const runs = computed<OrderSyncHistoryRun[]>(() => {
  const requestedAfter = filterTimestamp(filters.requestedAfter);
  const requestedBefore = filterTimestamp(filters.requestedBefore);
  const filtered = allRuns.value.filter((run) => {
    if (filters.outcome && run.overallState !== filters.outcome) return false;
    if (requestedAfter && run.requestedTime < requestedAfter) return false;
    if (requestedBefore && run.requestedTime > requestedBefore) return false;
    return true;
  });
  return filters.sortOrder === "oldest" ? [...filtered].reverse() : filtered;
});

/** Bind the shared session to this shop; the reads above then resolve against it. */
onIonViewWillEnter(() => orderSync.resetForShop(props.id));

function toMillis(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 0 && value < 100_000_000_000 ? value * 1000 : value;
  }
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function filterTimestamp(value: string): number {
  if (!value) return 0;
  return parseDateTimeValue(value)?.toMillis() || 0;
}

function formatDate(value: unknown): string {
  return formatDateTime(value) || translate("Not available");
}

function importLabel(configId: string): string {
  return configId === "SYNC_SHOPIFY_ORDER" ? translate("New order import") : translate("Updated order import");
}

function batchStatusLabel(statusId: string): string {
  const label = SYSTEM_MESSAGE_STATUS_LABELS[statusId];
  return label ? translate(label) : statusLabel(statusId);
}

function progressStateLabel(state: SyncProgressState): string {
  if (state === "completed") return translate("Completed");
  if (state === "partial") return translate("Partially completed");
  if (state === "failed") return translate("Failed");
  if (state === "active") return translate("In progress");
  return translate("Waiting");
}

function importCountsLabel(run: OrderSyncHistoryRun): string {
  const { state, successfulRecords, failedRecords, logCount } = run.importRow;
  if (!logCount && (state === "pending" || state === "active")) return "";
  const processed = translate("{count} processed", { count: successfulRecords });
  if (!failedRecords) return processed;
  return `${processed}, ${translate("{count} failed", { count: failedRecords })}`;
}

function progressColor(state: SyncProgressState): string {
  if (state === "completed") return "success";
  if (state === "partial") return "warning";
  if (state === "failed") return "danger";
  if (state === "active") return "primary";
  return "medium";
}

function stateIcon(state: SyncProgressState): string {
  if (state === "completed") return checkmarkCircleOutline;
  if (state === "partial" || state === "failed") return alertCircleOutline;
  if (state === "active") return syncCircleOutline;
  return helpCircleOutline;
}

function statusLabel(status: unknown, failed = 0): string {
  const value = String(status || "").toLowerCase();
  if (failed > 0 || value.includes("error") || value.includes("fail")) return translate("Failed");
  if (value.includes("complete") || value.includes("success") || value.includes("finish") || value.includes("confirm")) return translate("Completed");
  if (value.includes("run") || value.includes("process") || value.includes("active")) return translate("In progress");
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

@media (min-width: 991px) {
  .list-item {
    padding-block: var(--spacer-sm);
    padding-inline-end: var(--spacer-sm);
  }
}
</style>
