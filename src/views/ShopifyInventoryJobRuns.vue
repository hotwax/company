<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button :default-href="`/shopify-connection-details/${id}/inventory-sync`" />
        </ion-buttons>
        <ion-title>{{ title }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding-horizontal">
      <main class="runs-page">
        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ translate("Run history") }}</ion-card-title>
            <ion-card-subtitle>{{ jobName }}</ion-card-subtitle>
          </ion-card-header>
          <ion-card-content>
            <p class="job-service">{{ jobDetail.serviceName || translate("Service unavailable") }}</p>
          </ion-card-content>
        </ion-card>

        <ion-list lines="full">
          <ion-list-header>
            <ion-label>{{ translate("Filters") }}</ion-label>
          </ion-list-header>
          <ion-item>
            <ion-select
              :label="translate('Outcome')"
              label-placement="stacked"
              interface="popover"
              :value="outcome"
              @ionChange="outcome = $event.detail.value"
            >
              <ion-select-option value="">{{ translate("All outcomes") }}</ion-select-option>
              <ion-select-option value="error">{{ translate("Errors only") }}</ion-select-option>
              <ion-select-option value="clean">{{ translate("Without errors") }}</ion-select-option>
            </ion-select>
          </ion-item>
        </ion-list>

        <ion-card>
          <ion-list lines="full">
            <ion-item v-if="isLoading && !runs.length" lines="none">
              <ion-spinner name="crescent" />
            </ion-item>

            <ion-item v-else-if="loadError" lines="none" role="alert">
              <ion-label class="ion-text-wrap">
                {{ translate("Run history unavailable") }}
                <p>{{ loadError }}</p>
              </ion-label>
              <ion-button slot="end" fill="outline" @click="reload()">{{ translate("Retry") }}</ion-button>
            </ion-item>

            <ion-item v-else-if="!visibleRuns.length" lines="none">
              <ion-label class="ion-text-wrap">
                {{ translate("No runs match this view") }}
                <p>{{ runs.length ? translate("Clear the outcome filter to see every run.")
                  : translate("This job has not run yet.") }}</p>
              </ion-label>
            </ion-item>

            <ion-item v-for="run in visibleRuns" :key="run.key">
              <ion-label class="ion-text-wrap">
                {{ run.started }}
                <p v-if="run.ended">{{ translate("Ended") }} {{ run.ended }}<span v-if="run.duration"> · {{ run.duration }}</span></p>
                <p v-else>{{ translate("No end time recorded") }}</p>
                <p v-if="run.errorText" class="run-error">{{ run.errorText }}</p>
              </ion-label>
              <ion-badge slot="end" :color="run.badgeColor">{{ run.outcome }}</ion-badge>
            </ion-item>
          </ion-list>
        </ion-card>

        <ion-button
          v-if="canLoadMore"
          expand="block"
          fill="outline"
          :disabled="isLoading"
          @click="loadMore()"
        >
          <ion-spinner v-if="isLoading" name="crescent" />
          <span v-else>{{ translate("Load more runs") }}</span>
        </ion-button>
        <p v-else-if="runs.length" class="run-tally">
          {{ runs.length }} {{ runs.length === 1 ? translate("run") : translate("runs") }} loaded
        </p>
      </main>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonBackButton, IonBadge, IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader,
  IonCardSubtitle, IonCardTitle, IonContent, IonHeader, IonItem, IonLabel, IonList, IonListHeader,
  IonPage, IonSelect, IonSelectOption, IonSpinner, IonTitle, IonToolbar, onIonViewWillEnter,
} from "@ionic/vue";
import { computed, ref } from "vue";
import { translate } from "@common";
import { formatDateTime } from "@/utils";
import { useServiceJob } from "@/composables/useServiceJobs";

/**
 * Full run history for ONE inventory sync job.
 *
 * Exists because "View all runs" used to open the job configuration modal, whose run list is a fixed
 * five and which five other controls on the page already opened. Runs are read straight from the
 * server (`fromServer`) rather than the cache: the `serviceJobRun` domain is activated with a small
 * per-job total, so the cached read answers "the newest few", never "all".
 */
const props = defineProps<{ id: string; jobName: string; title?: string }>();

const PAGE_SIZE = 50;

const { fetchJobDetail, fetchJobRuns } = useServiceJob();

const runs = ref<any[]>([]);
const jobDetail = ref<Record<string, any>>({});
const isLoading = ref(false);
const loadError = ref("");
const pageIndex = ref(0);
const reachedEnd = ref(false);
const outcome = ref("");

const title = computed(() => props.title || translate("Run history"));
const canLoadMore = computed(() => !reachedEnd.value && !loadError.value);

const visibleRuns = computed(() => runs.value.filter((run) => {
  if (outcome.value === "error") return run.hasError;
  if (outcome.value === "clean") return !run.hasError;
  return true;
}));

function projectRun(run: any, index: number) {
  const start = run.startTime ?? run.startedAt;
  const end = run.endTime ?? run.completedAt;
  const hasError = String(run.hasError ?? "").toUpperCase() === "Y" || !!run.errors;
  return {
    // jobRunId is the natural key; fall back to position so a row without one still renders.
    key: String(run.jobRunId ?? run.runId ?? `${start ?? "run"}-${index}`),
    started: formatDateTime(start) || translate("Start time unavailable"),
    ended: formatDateTime(end),
    duration: start && end ? `${Math.max(0, Math.round((Number(end) - Number(start)) / 1000))}s` : "",
    hasError,
    errorText: run.errors ? String(run.errors).slice(0, 400) : "",
    outcome: hasError ? translate("Failed") : end ? translate("Completed") : translate("Running"),
    badgeColor: hasError ? "danger" : end ? "success" : "primary",
  };
}

async function loadPage(nextIndex: number) {
  if (!props.jobName) return;
  isLoading.value = true;
  loadError.value = "";
  try {
    const page = await fetchJobRuns(
      props.jobName,
      { pageSize: PAGE_SIZE, pageIndex: nextIndex, orderByField: "-startTime" },
      { fromServer: true },
    );
    const rows = Array.isArray(page) ? page : [];
    const offset = runs.value.length;
    runs.value = nextIndex === 0
      ? rows.map(projectRun)
      : [...runs.value, ...rows.map((row: any, i: number) => projectRun(row, offset + i))];
    // A short page is the only end-of-list signal these routes give.
    reachedEnd.value = rows.length < PAGE_SIZE;
    pageIndex.value = nextIndex;
  } catch (_error) {
    loadError.value = translate("Failed to load run history.");
  } finally {
    isLoading.value = false;
  }
}

async function reload() {
  reachedEnd.value = false;
  await loadPage(0);
}

function loadMore() {
  void loadPage(pageIndex.value + 1);
}

onIonViewWillEnter(async () => {
  if (!props.jobName) return;
  void fetchJobDetail(props.jobName).then((detail) => { jobDetail.value = detail || {}; }).catch(() => {});
  await reload();
});
</script>

<style scoped>
.runs-page {
  display: flex;
  flex-direction: column;
  gap: var(--spacer-sm);
  padding-block: var(--spacer-sm) var(--spacer-lg);
}

.runs-page > ion-card {
  margin-block: 0;
}

.job-service {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.8rem;
  color: var(--ion-color-medium);
  margin: 0;
  overflow-wrap: anywhere;
}

.run-error {
  color: var(--ion-color-danger);
  overflow-wrap: anywhere;
}

.run-tally {
  color: var(--ion-color-medium);
  font-size: 0.85rem;
  margin: 0;
  text-align: center;
}
</style>
