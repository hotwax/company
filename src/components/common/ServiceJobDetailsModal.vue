<template>
  <ion-modal
    :is-open="isOpen"
    :backdrop-dismiss="!isDirty"
    :can-dismiss="canDismiss"
    @didDismiss="handleDidDismiss"
  >
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button :aria-label="translate('Close')" @click="requestClose">
            <ion-icon slot="icon-only" :icon="closeOutline" />
          </ion-button>
        </ion-buttons>
        <ion-title>{{ modalTitle }}</ion-title>
        <ion-buttons slot="end">
          <ion-button :disabled="isLoading || isSaving || !jobName" :aria-label="translate('Refresh')" @click="requestRefresh">
            <ion-icon slot="icon-only" :icon="refreshOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-list v-if="isLoading && !jobDetails.jobName" lines="none">
        <ion-item><ion-spinner name="crescent" /></ion-item>
      </ion-list>

      <ion-list v-else-if="loadError" lines="full" role="alert">
        <ion-item>
          <ion-label>
            {{ translate('Sync job details unavailable') }}
            <p>{{ translate('Failed to load sync job details.') }}</p>
          </ion-label>
          <ion-button slot="end" fill="outline" @click="load">{{ translate('Retry') }}</ion-button>
        </ion-item>
      </ion-list>

      <template v-else-if="jobDetails.jobName">
        <ion-list lines="full">
          <ion-item>
            <ion-label>
              {{ jobDetails.description || translate('No description') }}
              <p>{{ jobDetails.serviceName || translate('Unavailable') }}</p>
            </ion-label>
          </ion-item>
          <ion-item>
            <ion-label>
              {{ translate('Run now') }}
              <p>{{ translate('Create an immediate execution of this service job without changing its schedule.') }}</p>
            </ion-label>
            <ion-button
              slot="end"
              fill="outline"
              color="primary"
              :disabled="isSaving || isRunning || !canRunNow"
              :title="!canRunNow ? runNowDisabledReason : undefined"
              @click="runJobNow"
            >
              <ion-spinner v-if="isRunning" name="crescent" />
              <span v-else>{{ translate('Run now') }}</span>
            </ion-button>
          </ion-item>
          <ion-item>
            <ion-label>{{ translate('Active') }}</ion-label>
            <ion-toggle slot="end" :checked="draftActive" :disabled="isSaving || !canEdit" @ionChange="draftActive = $event.detail.checked" />
          </ion-item>
        </ion-list>

        <ion-accordion-group>
          <ion-accordion value="schedule">
            <ion-item slot="header">
              <ion-label>
                {{ translate('Schedule') }}
                <p>{{ scheduleDescription }}</p>
              </ion-label>
              <ion-note slot="end">{{ nextRunLabel }}</ion-note>
            </ion-item>
            <div slot="content">
              <!-- Outlined fields sit in padded content, not in an ion-item, whose wrapper clips the outline label. -->
              <div class="ion-padding">
                <ion-input
                  v-model="draftCronExpression"
                  fill="outline"
                  label-placement="stacked"
                  :label="translate('Quartz cron expression')"
                  :disabled="isSaving || !canEdit"
                />
              </div>
              <ion-list lines="full">
                <ion-item>
                  <ion-label>
                    <p class="overline">{{ translate('Schedule preview') }}</p>
                    {{ isScheduleValid ? scheduleDescription : translate('Provide a valid cron expression') }}
                  </ion-label>
                  <ion-note slot="end">{{ nextRunLabel }}</ion-note>
                </ion-item>
                <ion-list-header>{{ translate('Schedule Options') }}</ion-list-header>
                <ion-radio-group v-model="draftCronExpression">
                  <ion-item v-for="option in scheduleOptions" :key="option.expression">
                    <ion-radio label-placement="end" justify="start" :value="option.expression" :disabled="isSaving || !canEdit">{{ translate(option.label) }}</ion-radio>
                  </ion-item>
                </ion-radio-group>
              </ion-list>
            </div>
          </ion-accordion>

          <ion-accordion value="parameters">
            <ion-item slot="header">
              <ion-label>
                {{ translate('Parameters') }}
                <p>{{ parameterDescription }}</p>
              </ion-label>
              <ion-note slot="end">{{ parameterCount }}</ion-note>
            </ion-item>
            <div slot="content">
              <!-- The job parameters are this job's stored values, so they are the editable ones. Saved
                   through the same `serviceJobParameters` PUT that provisions a cloned job. Outlined, in
                   padded content rather than ion-items, whose wrapper clips the outline label. -->
              <div v-if="jobParameters.length" class="ion-padding">
                <template v-for="parameter in jobParameters" :key="parameter.key">
                  <!-- A parameter whose valid values the host screen knows is chosen, not typed: an id
                       typed by hand is a silent misconfiguration the job only reveals when it runs. -->
                  <ion-select
                    v-if="parameter.options"
                    class="ion-margin-bottom"
                    fill="outline"
                    label-placement="stacked"
                    interface="popover"
                    :label="parameter.label"
                    :helper-text="parameter.helperText"
                    :value="draftParameters[parameter.name]"
                    :disabled="isSaving || !canEdit || parameter.isProtected"
                    @ionChange="draftParameters[parameter.name] = String($event.detail.value ?? '')"
                  >
                    <ion-select-option v-for="option in parameter.options" :key="option.value" :value="option.value">
                      {{ option.label }}
                    </ion-select-option>
                  </ion-select>
                  <ion-input
                    v-else
                    class="ion-margin-bottom"
                    fill="outline"
                    label-placement="stacked"
                    :label="parameter.label"
                    :helper-text="parameter.helperText"
                    :value="draftParameters[parameter.name]"
                    :disabled="isSaving || !canEdit || parameter.isProtected"
                    @ionInput="draftParameters[parameter.name] = String($event.detail.value ?? '')"
                  />
                </template>
              </div>

              <!-- The service's other parameters: its SIGNATURE, not values stored against this job, so
                   there is nothing a save could write. A parameter the job sets shows its signature
                   as the helper text of its own field instead. -->
              <ion-list v-if="unsetServiceParameters.length || !parameterCount" lines="full">
                <template v-if="unsetServiceParameters.length">
                  <ion-list-header>{{ translate("Not set on this job") }}</ion-list-header>
                  <ion-item v-for="parameter in unsetServiceParameters" :key="parameter.name">
                    <ion-label>
                      {{ parameter.name }}
                      <p v-if="parameter.signature">
                        {{ parameter.signature }}
                      </p>
                    </ion-label>
                  </ion-item>
                </template>
                <ion-item v-if="!parameterCount"><ion-label>{{ translate('No parameters found') }}</ion-label></ion-item>
              </ion-list>
            </div>
          </ion-accordion>

          <ion-accordion value="recent-runs">
            <ion-item slot="header">
              <!-- The last run, readable with the section closed; the rows below are the five newest. -->
              <ion-label>
                {{ translate('Recent runs') }}
                <p>{{ runRows[0] ? translate("Last run {at}", { at: runRows[0].startedAt }) : translate('No recent runs') }}</p>
              </ion-label>
              <ion-badge v-if="runRows[0]" slot="end" :color="runRows[0].statusColor">
                {{ runRows[0].statusLabel }}
              </ion-badge>
            </ion-item>
            <!-- The status once, as the badge; the lines say when, how long, and what the run did. -->
            <ion-list slot="content" inset lines="full">
              <ion-item v-for="run in runRows" :key="run.key">
                <ion-label class="ion-text-wrap">
                  {{ run.startedAt }}
                  <p v-if="run.duration">
                    {{ run.duration }}
                  </p>
                  <p v-for="figure in run.figures" :key="figure">
                    {{ figure }}
                  </p>
                  <p v-if="run.error">
                    {{ run.error }}
                  </p>
                </ion-label>
                <ion-badge slot="end" :color="run.statusColor">
                  {{ run.statusLabel }}
                </ion-badge>
              </ion-item>
              <ion-item v-if="!runRows.length"><ion-label>{{ translate('No recent runs found') }}</ion-label></ion-item>
            </ion-list>
          </ion-accordion>

          <ion-accordion value="edit-history">
            <ion-item slot="header">
              <ion-label>{{ translate('Edit history') }}<p>{{ translate('User changes recorded in EntityAuditLog.') }}</p></ion-label>
              <ion-note slot="end">{{ auditHistory.length }}</ion-note>
            </ion-item>
            <ion-list slot="content" lines="full">
              <ion-item v-for="audit in auditHistory" :key="auditKey(audit)">
                <ion-label class="ion-text-wrap">
                  {{ audit.changedFieldName || audit.fieldName || translate('Job change') }}
                  <p v-if="audit.changedByUserLoginId || audit.changedByUserId">{{ translate('Changed by') }}: {{ audit.changedByUserLoginId || usernames[audit.changedByUserId] || audit.changedByUserId }}</p>
                  <p>{{ translate("Previous value") }}: {{ auditValueOf(audit, audit.oldValueText) }}</p>
                  <p>{{ translate("New value") }}: {{ auditValueOf(audit, audit.newValueText) }}</p>
                </ion-label>
                <ion-note slot="end">{{ formatDate(audit.changedDate || audit.changedDateTime) }}</ion-note>
              </ion-item>
              <ion-item v-if="!auditHistory.length"><ion-label>{{ translate('No edit history found') }}</ion-label></ion-item>
            </ion-list>
          </ion-accordion>
        </ion-accordion-group>

        <ion-fab vertical="bottom" horizontal="end" slot="fixed">
          <ion-fab-button
            :disabled="!canSave || isSaving"
            :title="!canEdit ? editDisabledReason : undefined"
            :aria-label="translate(isSaving ? 'Saving' : 'Save')"
            @click="save"
          >
            <ion-spinner v-if="isSaving" name="crescent" />
            <ion-icon v-else :icon="saveOutline" />
          </ion-fab-button>
        </ion-fab>
      </template>
    </ion-content>
  </ion-modal>
</template>

<script setup lang="ts">
import {
  IonAccordion, IonAccordionGroup, IonBadge, IonButton, IonButtons, IonContent, IonFab, IonFabButton,
  IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonList, IonListHeader, IonModal, IonNote,
  IonRadio, IonRadioGroup, IonSelect, IonSelectOption, IonSpinner, IonTitle, IonToggle, IonToolbar,
  alertController,
} from '@ionic/vue';
import { closeOutline, refreshOutline, saveOutline } from 'ionicons/icons';
import cronstrue from 'cronstrue';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { commonUtil, translate } from '@common';
import { formatDateTime } from '@/utils';
import { useServiceJob } from '@/composables/useServiceJobs';
import { isCacheReconciliationError } from "@/utils/cacheReconciliationError";
import { translateMutationError } from "@/utils/errorPresentation";
import { formatLag } from "@/utils/inventoryEventTime";
import { describeRunResult, serviceJobRunStatus } from "@/utils/serviceJobRun";

/**
 * Parameters that bind a job to what it serves - the ones a screen finds the job BY. Editing one
 * silently re-points the job instead of configuring it, so they are read-only unless a screen names
 * one in `editableParameterNames` because, for that job, it is an input.
 */
const IDENTITY_PARAMETER_NAMES = [
  "shopId", "productStoreId", "productStoreIds", "configId", "inventoryChannelId",
  "systemMessageRemoteId", "systemMessageTypeId", "systemMessageTypeIds",
];

const props = withDefaults(defineProps<{
  isOpen: boolean;
  /** Also the modal's title, on every screen. */
  jobName: string;
  allowedParameterNames?: string[];
  editableParameterNames?: string[];
  /**
   * Valid values per job parameter, keyed by parameter name. A parameter listed here renders as a
   * dropdown instead of a free-text field.
   */
  parameterOptions?: Record<string, Array<{ value: string; label: string }>>;
  parameterDescription?: string;
  canRunNow?: boolean;
  canEdit?: boolean;
  runNowDisabledReason?: string;
  editDisabledReason?: string;
  runHandler?: (() => Promise<unknown>) | null;
  /** Writes the one field it is given (schedule or pause); called once per changed field. */
  saveHandler?: ((payload: { cronExpression?: string; paused?: boolean }) => Promise<unknown>) | null;
}>(), {
  allowedParameterNames: () => [],
  editableParameterNames: () => [],
  parameterOptions: () => ({}),
  parameterDescription: 'Job and service parameters used for this Shopify product sync.',
  canRunNow: true,
  canEdit: true,
  runNowDisabledReason: '',
  editDisabledReason: '',
  runHandler: null,
  saveHandler: null,
});
const emit = defineEmits<{ close: []; updated: [] }>();
const { fetchJobDetail, fetchJobRuns, fetchJobAuditHistory, fetchUsernames, updateJob, runNow } = useServiceJob();

const isLoading = ref(false);
const isSaving = ref(false);
const isRunning = ref(false);
const loadError = ref('');
const jobDetails = ref<Record<string, any>>({});
const recentRuns = ref<any[]>([]);
const auditHistory = ref<any[]>([]);
const usernames = ref<Record<string, string>>({});
const draftCronExpression = ref('');
const draftActive = ref(false);
const draftParameters = ref<Record<string, string>>({});

const modalTitle = computed(() => props.jobName || translate("Sync job details"));
const originalCronExpression = computed(() => String(jobDetails.value.cronExpression || ''));
const originalActive = computed(() => String(jobDetails.value.paused || 'N').toUpperCase() !== 'Y');
const hasLoadedJob = computed(() => !!props.jobName && jobDetails.value.jobName === props.jobName && !loadError.value);
const isDirty = computed(() => hasLoadedJob.value && (draftCronExpression.value !== originalCronExpression.value
  || draftActive.value !== originalActive.value
  || changedParameters.value.length > 0));
const isScheduleValid = computed(() => {
  if (!draftCronExpression.value) return false;
  try { cronstrue.toString(draftCronExpression.value); return true; } catch (_error) { return false; }
});
/**
 * A manual, run-on-demand job has NO cron by design, which made `isScheduleValid` false and disabled
 * Save for it permanently - so its parameters could never be edited. Validity is only the schedule's
 * business: gate on it when the schedule is what changed, not when a parameter is.
 */
const scheduleChanged = computed(() => draftCronExpression.value !== originalCronExpression.value);
const canSave = computed(() => !isLoading.value && !isSaving.value && props.canEdit && isDirty.value && (!scheduleChanged.value || isScheduleValid.value));
/**
 * The schedule in words, in the job's own `executionTimeZone`: the OMS evaluates the cron there, so
 * "At 12:00 AM" is that zone's midnight, not the reader's. A draft runs in the same zone once saved.
 */
const scheduleDescription = computed(() => {
  if(!draftCronExpression.value) {return translate("Not scheduled");}
  let schedule: string;
  try {
    schedule = cronstrue.toString(draftCronExpression.value);
  } catch {
    return translate("Schedule preview unavailable");
  }
  const timeZone = String(jobDetails.value.executionTimeZone ?? "").trim();

  return timeZone ? `${schedule} (${timeZone})` : schedule;
});
/**
 * The job routes call this `nextExecutionDateTime`; nothing returns `nextRunTime`, which this read.
 * A scheduled job therefore reported "Not scheduled" here while the list row behind the modal showed
 * the correct next run from the same field - the list-vs-detail spelling trap `useServiceJobs`
 * already documents for `cronDescription`/`cronString`. Read the spellings in order, as the product
 * sync screen does.
 */
const nextRunLabel = computed(() => {
  // The server timestamp belongs to the saved schedule, never to an edited draft.
  if (scheduleChanged.value) return translate('Next run recalculated after saving');
  const details = jobDetails.value;
  const nextRun = details.nextExecutionDateTime ?? details.nextRunTime ?? details.nextRunDate;
  return formatDateTime(nextRun) || translate('Not scheduled');
});
/**
 * What each recent run did. Zero figures are dropped (a publisher pass that found an empty queue reads
 * "Stopped because: the queue was empty", not five zeros), and `{}` results leave just the timing.
 */
const runRows = computed(() => recentRuns.value.map((run) => {
  const status = serviceJobRunStatus(run);
  const started = Number(run.startTime ?? run.startedAt);
  const tookMs = Number(run.endTime ?? run.completedAt) - started;
  const error = status === "Failed" ? String(run.errors ?? "").trim() : "";

  return {
    key: runKey(run),
    startedAt: formatDate(run.startTime || run.startedAt),
    duration: Number.isFinite(tookMs) && tookMs >= 0
      ? translate("Took {duration}", { duration: tookMs < 1000 ? translate("{ms} ms", { ms: tookMs }) : formatLag(tookMs) })
      : "",
    figures: describeRunResult(run.results).filter((row) => row.value !== "0").map((row) => `${row.label}: ${row.value}`),
    error: error.length > 200 ? `${error.slice(0, 200).trimEnd()}…` : error,
    statusLabel: statusLabel(status),
    statusColor: statusColor(status),
  };
}));
const scheduleOptions = [
  { label: 'Every 15 minutes', expression: '0 */15 * ? * *' },
  { label: 'Every 30 minutes', expression: '0 */30 * ? * *' },
  { label: 'Every hour', expression: '0 0 * ? * *' },
  { label: 'Every day at midnight', expression: '0 0 0 ? * *' },
];
const parameterIsAllowed = (parameter: any) => !props.allowedParameterNames.length || props.allowedParameterNames.includes(String(parameter?.parameterName || parameter?.name || ''));

/** The service's signature per parameter name, e.g. "Integer, default 5, required". */
const serviceSignatures = computed(() => {
  const parameters = Array.isArray(jobDetails.value.serviceInParameters) ? jobDetails.value.serviceInParameters : [];

  return new Map<string, string>(parameters.map((parameter: any) => [String(parameter?.name ?? ""), [
    parameter?.type,
    parameter?.default === null || parameter?.default === undefined ? "" : translate("default {value}", { value: String(parameter.default) }),
    parameter?.required === true || parameter?.required === "true" ? translate("required") : "",
  ].filter(Boolean).join(", ")]));
});

/** Only rows with a real parameterName can be written back, so unnamed rows are not made editable. */
const jobParameters = computed(() =>
  (Array.isArray(jobDetails.value.serviceJobParameters) ? jobDetails.value.serviceJobParameters : [])
    .filter(parameterIsAllowed)
    .filter((parameter: any) => !!parameter?.parameterName)
    .map((parameter: any) => {
      const name = String(parameter.parameterName);
      const isProtected = IDENTITY_PARAMETER_NAMES.includes(name) && !props.editableParameterNames.includes(name);

      return {
        key: `job-${name}`, name, label: name, isProtected,
        helperText: helperTextOf({ name, isProtected }), options: props.parameterOptions[name],
      };
    }));

/** The field's helper text: the service's signature for it, and why it is disabled when it is. */
function helperTextOf(parameter: { name: string; isProtected: boolean }) {
  return [serviceSignatures.value.get(parameter.name), parameter.isProtected ? translate("read only") : ""]
    .filter(Boolean).join(", ") || undefined;
}

/** Service parameters the job does not set; a leading underscore marks one Moqui supplies itself (`_jobRunId`). */
const unsetServiceParameters = computed(() => [...serviceSignatures.value]
  .filter(([name]) => name && !name.startsWith("_") && parameterIsAllowed({ name }))
  .filter(([name]) => !jobParameters.value.some((parameter) => parameter.name === name))
  .map(([name, signature]) => ({ name, signature })));

const parameterCount = computed(() => jobParameters.value.length + unsetServiceParameters.value.length);

const originalParameters = computed<Record<string, string>>(() => Object.fromEntries(
  (Array.isArray(jobDetails.value.serviceJobParameters) ? jobDetails.value.serviceJobParameters : [])
    .filter((parameter: any) => !!parameter?.parameterName)
    .map((parameter: any) => [String(parameter.parameterName), toDraftValue(parameter.parameterValue)])));

/**
 * Only the parameters the user actually changed are sent. A full rewrite would also re-PUT the values
 * this modal filters out of view (`allowedParameterNames`) and the protected ones, turning an edit of
 * one field into a rewrite of the job's whole parameter set.
 */
const changedParameters = computed(() => jobParameters.value
  .filter((parameter) => !parameter.isProtected)
  .filter((parameter) => draftParameters.value[parameter.name] !== originalParameters.value[parameter.name])
  .map((parameter) => ({ parameterName: parameter.name, parameterValue: draftParameters.value[parameter.name] })));

let loadGeneration = 0;
watch(() => [props.isOpen, props.jobName], ([open]) => {
  if (open && props.jobName) void load();
  else { loadGeneration++; isLoading.value = false; }
}, { immediate: true });
onBeforeUnmount(() => { loadGeneration++; });

async function load() {
  if (!props.jobName) return;
  const request = ++loadGeneration;
  const jobName = props.jobName;
  isLoading.value = true; loadError.value = '';
  jobDetails.value = {}; recentRuns.value = []; auditHistory.value = [];
  resetDraft();
  try {
    const [details, runs, audits] = await Promise.all([
      fetchJobDetail(jobName),
      fetchJobRuns(jobName, { pageSize: 5, pageIndex: 0 }, { fromServer: true }),
      fetchJobAuditHistory(jobName, { pageSize: 10, pageIndex: 0 }),
    ]);
    if (request !== loadGeneration) return;
    if (!details || details.jobName !== jobName) throw new Error('Job identity could not be verified');
    jobDetails.value = details;
    recentRuns.value = Array.isArray(runs) ? runs : [];
    auditHistory.value = Array.isArray(audits) ? audits : [];
    resetDraft();
    // Names arrive after the modal has rendered; until then a row shows the id.
    void fetchUsernames(auditHistory.value.map((audit) => String(audit.changedByUserId ?? ""))).then((names) => {
      if(request === loadGeneration) {usernames.value = names;}
    });
  } catch (_error) {
    if (request !== loadGeneration) return;
    loadError.value = translate('Failed to load sync job details.');
    jobDetails.value = {}; recentRuns.value = []; auditHistory.value = [];
    resetDraft();
  } finally { if (request === loadGeneration) isLoading.value = false; }
}

function resetDraft() {
  draftCronExpression.value = originalCronExpression.value;
  draftActive.value = originalActive.value;
  draftParameters.value = { ...originalParameters.value };
}
async function confirmDiscard() {
  if (!isDirty.value) return true;
  return new Promise<boolean>((resolve) => {
    alertController.create({
      header: translate('Unsaved changes'), message: translate('You have unsaved job changes. Discard them?'), backdropDismiss: false,
      buttons: [
        { text: translate('Keep editing'), role: 'cancel', handler: () => resolve(false) },
        { text: translate('Discard changes'), role: 'destructive', handler: () => resolve(true) },
      ],
    }).then((alert) => alert.present());
  });
}
async function canDismiss() { return confirmDiscard(); }
async function requestClose() { if (await confirmDiscard()) { resetDraft(); emit('close'); } }
function handleDidDismiss() { resetDraft(); emit('close'); }
async function requestRefresh() { if (await confirmDiscard()) await load(); }
async function runJobNow() {
  if(!hasLoadedJob.value || isLoading.value || isSaving.value || isRunning.value || !props.canRunNow) {return;}
  isRunning.value = true;
  try {
    const result = props.runHandler ? await props.runHandler() : await runNow(props.jobName);
    if(result === false) {return;}
    commonUtil.showToast(translate("Job queued successfully."));
  } catch (error) {
    commonUtil.showToast(translateMutationError(error, "Something went wrong."));
    // Only the cache refresh after a queued run failed: the run is real, so the view reloads.
    if(!isCacheReconciliationError(error)) {return;}
  } finally {
    isRunning.value = false;
  }
  await load();
}
async function save() {
  if(!canSave.value) {return;}
  isSaving.value = true;
  const paused = !draftActive.value;
  const schedule = { cronExpression: draftCronExpression.value, paused: paused ? "Y" : "N" };
  const parameterChanges = changedParameters.value;
  try {
    if(props.saveHandler) {
      // A `saveHandler` owns the schedule and pause writes, one field per call, so each is folded in as
      // it lands: a failure after the first leaves only the second unsaved, and a retry skips the first.
      // Parameters go through the standard job PUT.
      if(scheduleChanged.value) {
        await committed(() => props.saveHandler!({ cronExpression: schedule.cronExpression }), { cronExpression: schedule.cronExpression }, []);
      }
      if(draftActive.value !== originalActive.value) {
        await committed(() => props.saveHandler!({ paused }), { paused: schedule.paused }, []);
      }
      if(parameterChanges.length) {
        await committed(() => updateJob({ jobName: props.jobName, serviceJobParameters: parameterChanges }), {}, parameterChanges);
      }
    } else {
      await committed(() => updateJob({
        jobName: props.jobName,
        paused: schedule.paused,
        ...(scheduleChanged.value ? { cronExpression: schedule.cronExpression } : {}),
        ...(parameterChanges.length ? { serviceJobParameters: parameterChanges } : {}),
      }), schedule, parameterChanges);
    }
    commonUtil.showToast(translate("Sync job updated successfully."));
  } catch (error) {
    commonUtil.showToast(translateMutationError(error, "Failed to update sync job."));
    // Whatever landed is folded in, so the modal stays open only for changes that were not sent.
    if(isDirty.value) {return;}
  } finally {
    isSaving.value = false;
  }
  emit("updated");
  emit("close");
}

/**
 * Run one write and fold what it wrote into the loaded job, including when only the cache refresh
 * after it failed: the write landed, and leaving it dirty would send it again on retry.
 */
async function committed(write: () => Promise<unknown>, schedule: Record<string, string>, parameterChanges: Array<{ parameterName: string; parameterValue: string }>) {
  try {
    await write();
  } catch (error) {
    if(isCacheReconciliationError(error)) {fold(schedule, parameterChanges);}
    throw error;
  }
  fold(schedule, parameterChanges);
}

/** Folded values match their drafts, so `isDirty` (and `can-dismiss`) stop counting them. */
function fold(schedule: Record<string, string>, parameterChanges: Array<{ parameterName: string; parameterValue: string }>) {
  jobDetails.value = {
    ...jobDetails.value,
    ...schedule,
    serviceJobParameters: (Array.isArray(jobDetails.value.serviceJobParameters) ? jobDetails.value.serviceJobParameters : [])
      .map((parameter: any) => {
        const saved = parameterChanges.find((change) => change.parameterName === String(parameter?.parameterName ?? ""));

        return saved ? { ...parameter, parameterValue: saved.parameterValue } : parameter;
      }),
  };
}
/**
 * An audit value as a reader would say it: `paused` Y/N as Paused/Active, a cron expression with its
 * schedule in words, and an empty value (the field was first set, or cleared) as "Not set".
 */
function auditValueOf(audit: any, value: unknown) {
  const text = value === undefined || value === null ? "" : String(value).trim();
  if(!text) {return translate("Not set");}
  const field = String(audit?.changedFieldName ?? audit?.fieldName ?? "");
  if(field === "paused" && (text === "Y" || text === "N")) {return translate(text === "Y" ? "Paused" : "Active");}
  if(field === "cronExpression") {
    try {
      return `${text} (${cronstrue.toString(text)})`;
    } catch {
      return text;
    }
  }

  return text;
}
function formatDate(value: unknown) { return formatDateTime(value) || translate('Not available'); }
/**
 * The value an input edits, which must round-trip - so it never substitutes "Not available" for an
 * empty value, which would otherwise be saved back as the literal text.
 */
function toDraftValue(value: unknown) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
function statusLabel(status: unknown) {
  const value = String(status || '').toLowerCase();
  if (value.includes('complete') || value.includes('success') || value.includes('finish')) return translate('Completed');
  if (value.includes('error') || value.includes('fail') || value.includes('reject')) return translate('Failed');
  if (value.includes('running') || value.includes('active') || value.includes('process')) return translate('In progress');
  if (value.includes('pause')) return translate('Paused');
  return status ? String(status) : translate('Not available');
}
function statusColor(status: unknown) {
  const label = statusLabel(status);
  if (label === translate('Completed')) return 'success';
  if (label === translate('Failed')) return 'danger';
  if (label === translate('In progress')) return 'primary';
  if (label === translate('Paused')) return 'warning';
  return 'medium';
}
function runKey(run: any) { return String(run.jobRunId || run.runId || run.id || `${run.startTime || 'run'}-${run.statusId || run.status || 'status'}`); }
function auditKey(audit: any) { return String(audit.auditLogId || audit.entityAuditLogId || `${audit.changedDate || 'audit'}-${audit.changedFieldName || audit.fieldName || 'field'}`); }
</script>

<style scoped>
.overline { color: var(--ion-color-medium); font-size: 0.75rem; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; }

/* Room under the last row for the save button, which floats over the content (56px, 16px off the edge). */
ion-content {
  --padding-bottom: var(--spacer-2xl);
}
</style>
