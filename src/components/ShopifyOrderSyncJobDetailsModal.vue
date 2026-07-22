<template>
  <ion-modal :is-open="isOpen" :backdrop-dismiss="false" :can-dismiss="canDismiss" @didDismiss="close">
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button :aria-label="translate('Close')" @click="close">
            <ion-icon slot="icon-only" :icon="closeOutline" />
          </ion-button>
        </ion-buttons>
        <ion-title>{{ jobTitle }}</ion-title>
        <ion-buttons slot="end">
          <ion-button
            :disabled="isLoading || !props.jobName"
            :aria-label="translate('Refresh')"
            @click="requestRefresh"
          >
            <ion-spinner v-if="isLoading" name="crescent" />
            <ion-icon v-else slot="icon-only" :icon="refreshOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-list v-if="isLoading && !jobDetails.jobName" lines="none">
        <ion-item>
          <ion-spinner name="crescent" />
        </ion-item>
      </ion-list>

      <ion-card v-else-if="loadError" class="state-card" role="alert">
        <ion-card-header>
          <ion-card-title>{{ translate("Job details unavailable") }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <p>{{ loadError }}</p>
          <ion-button fill="outline" @click="load">{{ translate("Retry") }}</ion-button>
        </ion-card-content>
      </ion-card>

      <template v-else-if="jobDetails.jobName">
        <ion-list lines="full">
          <ion-item>
            <ion-label>
              {{ jobTitle }}
              <p>{{ jobDetails.jobName }}</p>
              <p>{{ jobDetails.serviceName || translate("Unavailable") }}</p>
            </ion-label>
          </ion-item>
          <ion-item>
            <ion-label>{{ translate("Active") }}</ion-label>
            <ion-note slot="end">{{ activeLabel }}</ion-note>
          </ion-item>
          <ion-item>
            <ion-label>{{ translate("Last run") }}</ion-label>
            <ion-label slot="end">{{ lastRunLabel }}</ion-label>
          </ion-item>
          <ion-item>
            <ion-label>{{ translate("Instance of product") }}</ion-label>
            <ion-label slot="end">{{ jobDetails.instanceOfProductId || translate("Unavailable") }}</ion-label>
          </ion-item>
        </ion-list>

        <ion-accordion-group>
          <ion-accordion value="schedule">
            <ion-item slot="header">
              <ion-label>
                {{ translate("Schedule") }}
                <p>{{ scheduleDescription }}</p>
              </ion-label>
              <ion-note slot="end">{{ nextRunLabel }}</ion-note>
            </ion-item>
            <ion-list slot="content" lines="full">
              <ion-item>
                <ion-label>
                  <p class="overline">{{ translate("Schedule preview") }}</p>
                  {{ scheduleDescription }}
                </ion-label>
                <ion-note slot="end">{{ nextRunLabel }}</ion-note>
              </ion-item>
              <ion-item>
                <ion-label>{{ translate("Quartz cron expression") }}</ion-label>
                <ion-note slot="end">{{ jobDetails.cronExpression || translate("Not scheduled") }}</ion-note>
              </ion-item>
            </ion-list>
          </ion-accordion>

          <ion-accordion value="parameters">
            <ion-item slot="header">
              <ion-label>
                {{ translate("Parameters") }}
                <p>{{ translate("Job and service parameters used by this Order Sync job.") }}</p>
              </ion-label>
              <ion-note slot="end">{{ parameters.length }}</ion-note>
            </ion-item>
            <ion-list slot="content" lines="full">
              <ion-item v-for="parameter in parameters" :key="parameter.key">
                <ion-label>
                  {{ parameter.name }}
                  <p>{{ parameter.source }}</p>
                </ion-label>
                <ion-note slot="end">{{ parameter.value }}</ion-note>
              </ion-item>
              <ion-item v-if="!parameters.length">
                <ion-label>{{ translate("No parameters found") }}</ion-label>
              </ion-item>
            </ion-list>
          </ion-accordion>

          <ion-accordion value="recent-runs">
            <ion-item slot="header">
              <ion-label>
                {{ translate("Recent runs") }}
                <p>{{ translate("Last 5 executions for this service job.") }}</p>
              </ion-label>
              <ion-note slot="end">{{ recentRuns.length }}</ion-note>
            </ion-item>
            <ion-list slot="content" lines="full">
              <ion-item v-for="run in recentRuns" :key="runKey(run)">
                <ion-label>
                  {{ statusLabel(run.statusId || run.status) }}
                  <p>{{ formatDate(run.startTime || run.startedAt) }}</p>
                  <p v-if="run.endTime || run.completedAt">{{ translate("Completed") }} {{ formatDate(run.endTime || run.completedAt) }}</p>
                  <p>{{ translate("Output") }}: {{ run.message || run.output || translate("No output message") }}</p>
                </ion-label>
                <ion-badge slot="end" :color="statusColor(run.statusId || run.status)">
                  {{ statusLabel(run.statusId || run.status) }}
                </ion-badge>
              </ion-item>
              <ion-item v-if="!recentRuns.length">
                <ion-label>{{ translate("No recent runs found") }}</ion-label>
              </ion-item>
            </ion-list>
          </ion-accordion>

          <ion-accordion value="edit-history">
            <ion-item slot="header">
              <ion-label>
                {{ translate("Edit history") }}
                <p>{{ translate("User changes recorded in EntityAuditLog.") }}</p>
              </ion-label>
              <ion-note slot="end">{{ auditHistory.length }}</ion-note>
            </ion-item>
            <ion-list slot="content" lines="full">
              <ion-item v-for="audit in auditHistory" :key="auditKey(audit)">
                <ion-label>
                  {{ audit.changedFieldName || audit.fieldName || translate("Job change") }}
                  <p v-if="audit.changedByUserLoginId || audit.changedByUserId">{{ translate("Changed by") }}: {{ audit.changedByUserLoginId || audit.changedByUserId }}</p>
                  <p>{{ audit.oldValue || translate("Not available") }} → {{ audit.newValue || translate("Not available") }}</p>
                </ion-label>
                <ion-note slot="end">{{ formatDate(audit.changedDate || audit.changedDateTime) }}</ion-note>
              </ion-item>
              <ion-item v-if="!auditHistory.length">
                <ion-label>{{ translate("No edit history found") }}</ion-label>
              </ion-item>
            </ion-list>
          </ion-accordion>
        </ion-accordion-group>
      </template>
    </ion-content>
  </ion-modal>
</template>

<script setup lang="ts">
import {
  IonAccordion,
  IonAccordionGroup,
  IonBadge,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonNote,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from "@ionic/vue";
import { computed, ref, watch } from "vue";
import { closeOutline, refreshOutline } from "ionicons/icons";
import cronstrue from "cronstrue";
import { translate } from "@common";
import { formatDateTime } from "@/utils";
import useServiceJob from "@/composables/useServiceJob";

const props = defineProps<{ isOpen: boolean; jobName: string }>();
const emit = defineEmits<{ close: [] }>();
const { fetchJobDetail, fetchJobRuns, fetchJobAuditHistory } = useServiceJob();

const isLoading = ref(false);
const loadError = ref("");
const jobDetails = ref<Record<string, any>>({});
const recentRuns = ref<any[]>([]);
const auditHistory = ref<any[]>([]);

const jobTitle = computed(() => jobDetails.value.jobName || props.jobName || translate("Sync job details"));
const activeLabel = computed(() => String(jobDetails.value.paused || "N").toUpperCase() === "Y" ? translate("Paused") : translate("Active"));

const scheduleDescription = computed(() => {
  const cronExpression = String(jobDetails.value.cronExpression || "");
  if (!cronExpression) return translate("Not scheduled");
  try {
    return cronstrue.toString(cronExpression);
  } catch (_error) {
    return translate("Schedule preview unavailable");
  }
});
const nextRunLabel = computed(() => formatDateTime(jobDetails.value.nextRunTime) || translate("Not scheduled"));
const lastRunLabel = computed(() => {
  const run = recentRuns.value[0];
  return run ? `${formatDate(run.startTime || run.startedAt)} · ${statusLabel(run.statusId || run.status)}` : translate("No recent runs");
});
const parameters = computed(() => [
  ...(Array.isArray(jobDetails.value.serviceJobParameters) ? jobDetails.value.serviceJobParameters : [])
    .map((parameter: any, index: number) => ({ key: `job-${parameter.parameterName || index}`, name: parameter.parameterName || translate("Parameter"), value: formatValue(parameter.parameterValue), source: translate("Job parameter") })),
  ...(Array.isArray(jobDetails.value.serviceInParameters) ? jobDetails.value.serviceInParameters : [])
    .map((parameter: any, index: number) => ({ key: `service-${parameter.parameterName || index}`, name: parameter.parameterName || translate("Parameter"), value: formatValue(parameter.defaultValue || parameter.parameterValue || parameter.type), source: translate("Service parameter") })),
]);

watch(() => [props.isOpen, props.jobName], ([isOpen]) => {
  if (isOpen && props.jobName) void load();
});

async function load() {
  if (!props.jobName) return;
  isLoading.value = true;
  loadError.value = "";
  try {
    const [details, runs, audits] = await Promise.all([
      fetchJobDetail(props.jobName),
      fetchJobRuns(props.jobName, { pageSize: 5, pageIndex: 0 }),
      fetchJobAuditHistory(props.jobName, { pageSize: 10, pageIndex: 0 }),
    ]);
    jobDetails.value = details || {};
    recentRuns.value = Array.isArray(runs) ? runs : [];
    auditHistory.value = Array.isArray(audits) ? audits : [];
  } catch (_error) {
    loadError.value = translate("Something went wrong.");
    jobDetails.value = {};
    recentRuns.value = [];
    auditHistory.value = [];
  } finally {
    isLoading.value = false;
  }
}

async function requestRefresh() {
  await load();
}

function close() {
  emit("close");
}

function canDismiss() {
  return true;
}

function formatDate(value: unknown): string {
  return formatDateTime(value) || translate("Not available");
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null || value === "") return translate("Not available");
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function statusLabel(status: unknown): string {
  const value = String(status || "").toLowerCase();
  if (value.includes("complete") || value.includes("success") || value.includes("finish")) return translate("Completed");
  if (value.includes("error") || value.includes("fail") || value.includes("reject")) return translate("Failed");
  if (value.includes("running") || value.includes("active") || value.includes("process")) return translate("In progress");
  if (value.includes("pause")) return translate("Paused");
  return status ? String(status) : translate("Not available");
}

function statusColor(status: unknown): string {
  const label = statusLabel(status);
  if (label === translate("Completed")) return "success";
  if (label === translate("Failed")) return "danger";
  if (label === translate("In progress")) return "primary";
  if (label === translate("Paused")) return "warning";
  return "medium";
}

function runKey(run: any): string {
  return String(run.jobRunId || run.runId || run.id || `${run.startTime || "run"}-${run.statusId || run.status || "status"}`);
}

function auditKey(audit: any): string {
  return String(audit.auditLogId || audit.entityAuditLogId || `${audit.changedDate || "audit"}-${audit.changedFieldName || audit.fieldName || "field"}`);
}
</script>

<style scoped>
.state-card {
  box-shadow: none;
}

.overline {
  color: var(--ion-color-medium);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
</style>
