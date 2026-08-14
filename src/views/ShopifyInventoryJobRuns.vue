<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button :default-href="`/shopify-connection-details/${id}/inventory-sync`" />
        </ion-buttons>
        <!-- Job Manager's wording, kept as the fallback; this page is always scoped to one job, so
             the job's own name is more use in the bar when the caller passes it. -->
        <ion-title>{{ title || translate("Service Job Run History") }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <main>
        <div class="kpi-grid">
          <ion-card>
            <ion-card-header>
              <ion-card-subtitle>{{ translate("Total runs") }}</ion-card-subtitle>
              <ion-card-title>{{ stats.total }}</ion-card-title>
            </ion-card-header>
          </ion-card>
          <ion-card>
            <ion-card-header>
              <ion-card-subtitle>{{ translate("Successful") }}</ion-card-subtitle>
              <ion-card-title>{{ stats.successful }}</ion-card-title>
            </ion-card-header>
          </ion-card>
          <ion-card>
            <ion-card-header>
              <ion-card-subtitle>{{ translate("Failed") }}</ion-card-subtitle>
              <ion-card-title>{{ stats.failed }}</ion-card-title>
            </ion-card-header>
          </ion-card>
          <ion-card>
            <ion-card-header>
              <ion-card-subtitle>{{ translate("Running") }}</ion-card-subtitle>
              <ion-card-title>{{ stats.running }}</ion-card-title>
            </ion-card-header>
          </ion-card>
        </div>

        <ion-card>
          <ion-card-content>
            <ion-searchbar
              :value="queryString"
              :debounce="300"
              :placeholder="translate('Search by run, service, user, parameters, or result')"
              @ionInput="queryString = $event.detail.value || ''"
            />

            <div class="filter-grid">
              <div class="filter-item">
                <ion-select
                  :label="translate('Status')"
                  label-placement="stacked"
                  interface="popover"
                  :value="selectedStatus"
                  @ionChange="selectedStatus = $event.detail.value"
                >
                  <ion-select-option value="">{{ translate("All") }}</ion-select-option>
                  <ion-select-option value="RUNNING">{{ translate("Running") }}</ion-select-option>
                  <ion-select-option value="SUCCESSFUL">{{ translate("Successful") }}</ion-select-option>
                  <ion-select-option value="FAILED">{{ translate("Failed") }}</ion-select-option>
                </ion-select>
                <ion-button v-if="selectedStatus" fill="clear" class="clear-filter-btn" :title="translate('Clear')" @click="selectedStatus = ''">
                  <ion-icon slot="icon-only" :icon="closeCircleOutline" />
                </ion-button>
              </div>

              <div class="filter-item">
                <ion-input
                  :value="selectedUserId"
                  :label="translate('User')"
                  label-placement="stacked"
                  fill="outline"
                  :placeholder="translate('Any user')"
                  :debounce="300"
                  @ionInput="selectedUserId = $event.detail.value || ''"
                />
                <ion-button v-if="selectedUserId" fill="clear" class="clear-filter-btn" :title="translate('Clear')" @click="selectedUserId = ''">
                  <ion-icon slot="icon-only" :icon="closeCircleOutline" />
                </ion-button>
              </div>
            </div>
          </ion-card-content>
        </ion-card>

        <div class="pagination">
          <!-- Never silently drop runs: if the job has more than one read can carry, say so. -->
          <ion-note v-if="truncated" color="warning">
            {{ translate("Showing the most recent") }} {{ MAX_RUNS }} {{ translate("runs") }}
          </ion-note>
          <ion-button fill="outline" :disabled="pageIndex === 0 || isLoading" @click="pageIndex -= 1">
            {{ translate("Previous") }}
          </ion-button>
          <ion-note color="medium">{{ translate("Page") }} {{ pageIndex + 1 }} / {{ pageCount }}</ion-note>
          <ion-button fill="outline" :disabled="pageIndex >= pageCount - 1 || isLoading" @click="pageIndex += 1">
            {{ translate("Next") }}
          </ion-button>
        </div>

        <div v-if="isLoading" class="loading-state">
          <ion-spinner name="crescent" />
          <p>{{ translate("Loading") }}</p>
        </div>

        <div v-else-if="loadError" class="empty-state" role="alert">
          <p>{{ loadError }}</p>
          <ion-button fill="outline" @click="loadRuns()">{{ translate("Retry") }}</ion-button>
        </div>

        <ion-list v-else-if="pagedRuns.length">
          <ion-card v-for="run in pagedRuns" :key="run.jobRunId" class="run-card">
            <ion-item lines="none">
              <ion-icon slot="start" :icon="run.statusIcon" :color="run.statusColor" />
              <ion-label class="ion-text-wrap">
                <p class="overline">#{{ run.jobRunId }}</p>
                <h2>{{ run.jobName }}</h2>
                <p>{{ serviceName || translate("Service unavailable") }}</p>
              </ion-label>
              <ion-badge slot="end" :color="run.statusColor">{{ translate(run.statusLabel) }}</ion-badge>
            </ion-item>

            <ion-card-content>
              <div class="run-metrics">
                <ion-item lines="none">
                  <ion-icon slot="start" :icon="playOutline" color="medium" />
                  <ion-label>
                    <p>{{ translate("Started") }}</p>
                    {{ run.started }}
                  </ion-label>
                </ion-item>
                <ion-item lines="none">
                  <ion-icon slot="start" :icon="checkmarkCircleOutline" color="medium" />
                  <ion-label>
                    <p>{{ translate("Completed") }}</p>
                    {{ run.completed }}
                  </ion-label>
                </ion-item>
                <ion-item lines="none">
                  <ion-icon slot="start" :icon="timeOutline" color="medium" />
                  <ion-label>
                    <p>{{ translate("Duration") }}</p>
                    {{ run.duration }}
                  </ion-label>
                </ion-item>
                <ion-item lines="none">
                  <ion-icon slot="start" :icon="personOutline" color="medium" />
                  <ion-label>
                    <p>{{ translate("User") }}</p>
                    {{ run.userId }}
                  </ion-label>
                </ion-item>
              </div>

              <ion-accordion-group v-if="run.hasResults || run.parameters" @click.stop>
                <ion-accordion v-if="run.hasResults" value="results">
                  <ion-item slot="header">
                    <ion-label>{{ translate("Results") }}</ion-label>
                  </ion-item>
                  <div slot="content" class="accordion-content">
                    <pre><code>{{ run.results }}</code></pre>
                  </div>
                </ion-accordion>

                <ion-accordion v-if="run.parameters" value="parameters">
                  <ion-item slot="header">
                    <ion-label>{{ translate("Parameters") }}</ion-label>
                  </ion-item>
                  <div slot="content" class="accordion-content">
                    <pre><code>{{ run.parameters }}</code></pre>
                  </div>
                </ion-accordion>
              </ion-accordion-group>
            </ion-card-content>
          </ion-card>
        </ion-list>

        <p v-else class="empty-state">{{ translate("No service job runs found for the selected filters.") }}</p>
      </main>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonAccordion, IonAccordionGroup, IonBackButton, IonBadge, IonButton, IonButtons, IonCard,
  IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonContent, IonHeader, IonIcon,
  IonInput, IonItem, IonLabel, IonList, IonNote, IonPage, IonSearchbar, IonSelect,
  IonSelectOption, IonSpinner, IonTitle, IonToolbar, onIonViewWillEnter,
} from "@ionic/vue";
import {
  alertCircleOutline, checkmarkCircleOutline, closeCircleOutline, personOutline, playOutline,
  timeOutline,
} from "ionicons/icons";
import { computed, ref, watch } from "vue";
import { translate } from "@common";
import { formatDateTime } from "@/utils";
import { useServiceJob } from "@/composables/useServiceJobs";

/**
 * Full run history for ONE inventory sync job, laid out like Job Manager's Service Job Run History
 * so the two read the same way.
 *
 * Two deliberate departures, both forced by the data rather than by taste:
 *
 *  - `admin/serviceJobs/{jobName}/runs` returns no `runStatus`, `messages`, `errors` or `logs` -
 *    only `hasError` and the timestamps. Status is derived from those, and the Message / Errors /
 *    Data logs accordions Job Manager shows are omitted rather than rendered permanently empty.
 *  - The route returns a bare array with no total, so paging it blind could not fill a "Page x / y"
 *    counter or the KPI cards. One capped read is taken and paged in memory instead, which keeps
 *    both honest; `truncated` says so when a job has more runs than the cap.
 *
 * Runs are read with `fromServer`: the cached read returns as soon as the cache holds anything, and
 * the domain that fills it is capped at five per job, so it can never answer "all runs".
 */
const props = defineProps<{ id: string; jobName: string; title?: string }>();

/** Client-side page size, matching Job Manager's. */
const PAGE_SIZE = 25;
/** One read, then paged in memory — see the note above about the route carrying no total. */
const MAX_RUNS = 500;

const { fetchJobDetail, fetchJobRuns } = useServiceJob();

const rawRuns = ref<any[]>([]);
const serviceName = ref("");
const isLoading = ref(false);
const loadError = ref("");
const truncated = ref(false);

const queryString = ref("");
const selectedStatus = ref("");
const selectedUserId = ref("");
const pageIndex = ref(0);

function statusOf(run: any) {
  if (String(run.hasError ?? "").toUpperCase() === "Y") {
    return { key: "FAILED", label: "Failed", color: "danger", icon: closeCircleOutline };
  }
  if (run.endTime) {
    return { key: "SUCCESSFUL", label: "Successful", color: "success", icon: checkmarkCircleOutline };
  }
  if (run.startTime) {
    return { key: "RUNNING", label: "Running", color: "primary", icon: timeOutline };
  }
  return { key: "TERMINATED", label: "Terminated", color: "medium", icon: alertCircleOutline };
}

function formatDuration(start: any, end: any) {
  const from = Number(start);
  const to = Number(end);
  if (!from || !to || to < from) return "-";
  const totalSeconds = Math.floor((to - from) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes === 0 ? `${seconds}s` : `${minutes}m ${seconds}s`;
}

/** `results` is a JSON string; "{}" and "[]" are the service's way of saying "nothing to report". */
function hasResults(results: any) {
  if (results === undefined || results === null) return false;
  const trimmed = String(results).trim();
  return !!trimmed && trimmed !== "{}" && trimmed !== "[]";
}

const runs = computed(() => rawRuns.value.map((run: any) => {
  const status = statusOf(run);
  return {
    jobRunId: String(run.jobRunId ?? ""),
    jobName: String(run.jobName ?? props.jobName),
    userId: run.userId ? String(run.userId) : "-",
    started: formatDateTime(run.startTime) || "-",
    completed: formatDateTime(run.endTime) || "-",
    duration: formatDuration(run.startTime, run.endTime),
    parameters: run.parameters ? String(run.parameters) : "",
    results: run.results ? String(run.results) : "",
    hasResults: hasResults(run.results),
    statusKey: status.key,
    statusLabel: status.label,
    statusColor: status.color,
    statusIcon: status.icon,
  };
}));

const stats = computed(() => ({
  total: runs.value.length,
  successful: runs.value.filter((run) => run.statusKey === "SUCCESSFUL").length,
  failed: runs.value.filter((run) => run.statusKey === "FAILED").length,
  running: runs.value.filter((run) => run.statusKey === "RUNNING").length,
}));

const filteredRuns = computed(() => {
  const query = queryString.value.trim().toLowerCase();
  const user = selectedUserId.value.trim().toLowerCase();
  return runs.value.filter((run) => {
    if (selectedStatus.value && run.statusKey !== selectedStatus.value) return false;
    if (user && !run.userId.toLowerCase().includes(user)) return false;
    if (!query) return true;
    return [run.jobRunId, run.jobName, serviceName.value, run.userId, run.parameters, run.results]
      .some((value) => String(value ?? "").toLowerCase().includes(query));
  });
});

const pageCount = computed(() => Math.max(Math.ceil(filteredRuns.value.length / PAGE_SIZE), 1));
const pagedRuns = computed(() =>
  filteredRuns.value.slice(pageIndex.value * PAGE_SIZE, (pageIndex.value + 1) * PAGE_SIZE));

// A filter change can leave the reader on a page that no longer exists.
watch([queryString, selectedStatus, selectedUserId], () => { pageIndex.value = 0; });

async function loadRuns() {
  if (!props.jobName) return;
  isLoading.value = true;
  loadError.value = "";
  try {
    const page = await fetchJobRuns(
      props.jobName,
      { pageSize: MAX_RUNS, pageIndex: 0, orderByField: "-startTime" },
      { fromServer: true },
    );
    const rows = Array.isArray(page) ? page : [];
    rawRuns.value = rows;
    truncated.value = rows.length >= MAX_RUNS;
    pageIndex.value = 0;
  } catch (_error) {
    loadError.value = translate("Failed to load run history.");
    rawRuns.value = [];
  } finally {
    isLoading.value = false;
  }
}

onIonViewWillEnter(async () => {
  if (!props.jobName) return;
  void fetchJobDetail(props.jobName)
    .then((detail) => { serviceName.value = String(detail?.serviceName ?? ""); })
    .catch(() => { serviceName.value = ""; });
  await loadRuns();
});
</script>

<style scoped>
main {
  padding: var(--spacer-base);
}

.kpi-grid,
.filter-grid,
.run-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--spacer-base);
}

.kpi-grid {
  margin-block-end: var(--spacer-base);
}

.kpi-grid ion-card {
  margin: 0;
}

.filter-item {
  display: flex;
  align-items: center;
  gap: var(--spacer-xs);
}

.filter-item ion-select,
.filter-item ion-input {
  flex: 1;
}

.pagination {
  display: flex;
  align-items: center;
  gap: var(--spacer-sm);
  flex-wrap: wrap;
  justify-content: flex-end;
  padding: var(--spacer-base);
}

.run-card {
  margin-block-end: var(--spacer-base);
}

.run-metrics ion-item {
  --padding-start: 0;
  --inner-padding-end: 0;
}

.overline {
  font-size: 0.75rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ion-color-medium);
}

.accordion-content {
  padding: var(--spacer-base);
}

.accordion-content pre {
  overflow: auto;
  white-space: pre-wrap;
  margin: 0;
}

.loading-state,
.empty-state {
  text-align: center;
  padding: var(--spacer-lg);
}

@media (max-width: 600px) {
  .pagination ion-button {
    width: 100%;
  }

  .pagination {
    justify-content: stretch;
  }
}
</style>
