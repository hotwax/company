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
              {{ modalTitle }}
              <p>{{ jobDetails.jobName }}</p>
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
          <ion-item>
            <ion-label>{{ translate('Last run') }}</ion-label>
            <ion-label slot="end">{{ lastRunLabel }}</ion-label>
          </ion-item>
          <ion-item>
            <ion-label>{{ translate('Instance of product') }}</ion-label>
            <ion-label slot="end">{{ productLabel }}</ion-label>
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
            <ion-list slot="content" lines="full">
              <ion-item>
                <ion-input label-placement="stacked" :label="translate('Quartz cron expression')" v-model="draftCronExpression" :disabled="isSaving || !canEdit" />
              </ion-item>
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
          </ion-accordion>

          <ion-accordion value="parameters">
            <ion-item slot="header">
              <ion-label>
                {{ translate('Parameters') }}
                <p>{{ parameterDescription }}</p>
              </ion-label>
              <ion-note slot="end">{{ parameterCount }}</ion-note>
            </ion-item>
            <ion-list slot="content" lines="full">
              <!-- The job parameters are this job's stored values, so they are the editable ones.
                   Saved through the same `serviceJobParameters` PUT that provisions a cloned job. -->
              <ion-item v-for="parameter in jobParameters" :key="parameter.key">
                <!-- A parameter whose valid values the host screen knows is chosen, not typed: an id
                     typed by hand is a silent misconfiguration the job only reveals when it runs. -->
                <ion-select
                  v-if="parameter.options"
                  label-placement="stacked"
                  interface="popover"
                  :label="parameter.label"
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
                  label-placement="stacked"
                  :label="parameter.label"
                  :value="draftParameters[parameter.name]"
                  :disabled="isSaving || !canEdit || parameter.isProtected"
                  @ionInput="draftParameters[parameter.name] = String($event.detail.value ?? '')"
                />
                <ion-note v-if="parameter.isProtected" slot="end">{{ translate('Read only') }}</ion-note>
              </ion-item>

              <!-- Service parameters are the service SIGNATURE (type, mode, default), not values
                   stored against this job - there is nothing here a save could write, so they stay
                   read-only rather than offering an edit that goes nowhere. -->
              <template v-if="serviceParameters.length">
                <ion-list-header>{{ translate('Service parameters') }}</ion-list-header>
                <ion-item v-for="parameter in serviceParameters" :key="parameter.key">
                  <ion-label>{{ parameter.label }}</ion-label>
                  <ion-label slot="end">{{ parameter.value }}</ion-label>
                </ion-item>
              </template>

              <ion-item v-if="!parameterCount"><ion-label>{{ translate('No parameters found') }}</ion-label></ion-item>
            </ion-list>
          </ion-accordion>

          <ion-accordion value="recent-runs">
            <ion-item slot="header">
              <ion-label>{{ translate('Recent runs') }}<p>{{ translate('Last 5 executions for this service job.') }}</p></ion-label>
              <ion-note slot="end">{{ recentRuns.length }}</ion-note>
            </ion-item>
            <ion-list slot="content" lines="full">
              <ion-item v-for="run in recentRuns" :key="runKey(run)">
                <ion-label>
                  {{ statusLabel(run.statusId || run.status) }}
                  <p>{{ formatDate(run.startTime || run.startedAt) }}</p>
                  <p v-if="run.endTime || run.completedAt">{{ translate('Completed') }} {{ formatDate(run.endTime || run.completedAt) }}</p>
                </ion-label>
                <ion-badge slot="end" :color="statusColor(run.statusId || run.status)">{{ statusLabel(run.statusId || run.status) }}</ion-badge>
              </ion-item>
              <ion-item v-if="!recentRuns.length"><ion-label>{{ translate('No recent runs found') }}</ion-label></ion-item>
            </ion-list>
          </ion-accordion>

          <ion-accordion value="edit-history">
            <ion-item slot="header">
              <ion-label>{{ translate('Edit history') }}<p>{{ translate('User changes recorded in EntityAuditLog.') }}</p></ion-label>
              <ion-note slot="end">{{ auditHistory.length }}</ion-note>
            </ion-item>
            <ion-list slot="content" lines="full">
              <ion-item v-for="audit in auditHistory" :key="auditKey(audit)">
                <ion-label>
                  {{ audit.changedFieldName || audit.fieldName || translate('Job change') }}
                  <p v-if="audit.changedByUserLoginId || audit.changedByUserId">{{ translate('Changed by') }}: {{ audit.changedByUserLoginId || audit.changedByUserId }}</p>
                  <p>{{ translate('Job configuration changed') }}</p>
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
import { computed, ref, watch } from 'vue';
import { commonUtil, translate } from '@common';
import { formatDateTime } from '@/utils';
import { useServiceJob } from '@/composables/useServiceJobs';
import { refreshAfterMutation } from '@/services/appCacheBootstrap';

const props = withDefaults(defineProps<{
  isOpen: boolean;
  jobName: string;
  productStoreId?: string;
  title?: string;
  allowedParameterNames?: string[];
  /**
   * Job parameters that stay read-only. For identity parameters - the ones a screen finds this job
   * BY - editing the value silently reassigns the job to something else instead of configuring it.
   */
  protectedParameterNames?: string[];
  /**
   * Valid values per job parameter, keyed by parameter name. A parameter listed here renders as a
   * dropdown instead of a free-text field.
   */
  parameterOptions?: Record<string, Array<{ value: string; label: string }>>;
  parameterDescription?: string;
  canRunNow?: boolean;
  canEdit?: boolean;
  allowEmptySchedule?: boolean;
  runNowDisabledReason?: string;
  editDisabledReason?: string;
  runHandler?: (() => Promise<unknown>) | null;
  saveHandler?: ((payload: { cronExpression: string; paused: boolean }) => Promise<unknown>) | null;
}>(), {
  title: '',
  productStoreId: '',
  allowedParameterNames: () => [],
  protectedParameterNames: () => [],
  parameterOptions: () => ({}),
  parameterDescription: 'Job and service parameters used for this Shopify product sync.',
  canRunNow: true,
  canEdit: true,
  allowEmptySchedule: false,
  runNowDisabledReason: '',
  editDisabledReason: '',
  runHandler: null,
  saveHandler: null,
});
const emit = defineEmits<{ close: []; updated: [] }>();
const { fetchJobDetail, fetchJobRuns, fetchJobAuditHistory, updateJob, runNow } = useServiceJob();

const isLoading = ref(false);
const isSaving = ref(false);
const isRunning = ref(false);
const loadError = ref('');
const jobDetails = ref<Record<string, any>>({});
const recentRuns = ref<any[]>([]);
const auditHistory = ref<any[]>([]);
const draftCronExpression = ref('');
const draftActive = ref(false);
const draftParameters = ref<Record<string, string>>({});

const modalTitle = computed(() => props.title || jobDetails.value.jobName || props.jobName || translate('Sync job details'));
const originalCronExpression = computed(() => String(jobDetails.value.cronExpression || ''));
const originalActive = computed(() => String(jobDetails.value.paused || 'N').toUpperCase() !== 'Y');
const isDirty = computed(() => draftCronExpression.value !== originalCronExpression.value
  || draftActive.value !== originalActive.value
  || changedParameters.value.length > 0);
const isScheduleValid = computed(() => {
  if (!draftCronExpression.value) return props.allowEmptySchedule;
  try { cronstrue.toString(draftCronExpression.value); return true; } catch (_error) { return false; }
});
/**
 * A manual, run-on-demand job has NO cron by design, which made `isScheduleValid` false and disabled
 * Save for it permanently - so its parameters could never be edited. Validity is only the schedule's
 * business: gate on it when the schedule is what changed, not when a parameter is.
 */
const scheduleChanged = computed(() => draftCronExpression.value !== originalCronExpression.value);
const canSave = computed(() => props.canEdit && isDirty.value && (!scheduleChanged.value || isScheduleValid.value));
const scheduleDescription = computed(() => {
  if (!draftCronExpression.value) return translate('Not scheduled');
  try { return cronstrue.toString(draftCronExpression.value); } catch (_error) { return translate('Schedule preview unavailable'); }
});
/**
 * The job routes call this `nextExecutionDateTime`; nothing returns `nextRunTime`, which this read.
 * A scheduled job therefore reported "Not scheduled" here while the list row behind the modal showed
 * the correct next run from the same field - the list-vs-detail spelling trap `useServiceJobs`
 * already documents for `cronDescription`/`cronString`. Read the spellings in order, as the product
 * sync screen does.
 */
const nextRunLabel = computed(() => {
  const details = jobDetails.value;
  const nextRun = details.nextExecutionDateTime ?? details.nextRunTime ?? details.nextRunDate;
  return formatDateTime(nextRun) || translate('Not scheduled');
});
const lastRunLabel = computed(() => recentRuns.value.length
  ? `${formatDate(recentRuns.value[0].startTime || recentRuns.value[0].startedAt)} · ${statusLabel(recentRuns.value[0].statusId || recentRuns.value[0].status)}`
  : translate('No recent runs'));
const productLabel = computed(() => jobDetails.value.instanceOfProductId || translate('Unavailable'));
const scheduleOptions = [
  { label: 'Every 15 minutes', expression: '0 */15 * ? * *' },
  { label: 'Every 30 minutes', expression: '0 */30 * ? * *' },
  { label: 'Every hour', expression: '0 0 * ? * *' },
  { label: 'Every day at midnight', expression: '0 0 0 ? * *' },
];
const parameterIsAllowed = (parameter: any) => !props.allowedParameterNames.length || props.allowedParameterNames.includes(String(parameter?.parameterName || parameter?.name || ''));

/** Only rows with a real parameterName can be written back, so unnamed rows are not made editable. */
const jobParameters = computed(() =>
  (Array.isArray(jobDetails.value.serviceJobParameters) ? jobDetails.value.serviceJobParameters : [])
    .filter(parameterIsAllowed)
    .filter((parameter: any) => !!parameter?.parameterName)
    .map((parameter: any) => ({
      key: `job-${parameter.parameterName}`,
      name: String(parameter.parameterName),
      label: String(parameter.parameterName),
      isProtected: props.protectedParameterNames.includes(String(parameter.parameterName)),
      options: props.parameterOptions[String(parameter.parameterName)],
    })));

const serviceParameters = computed(() =>
  (Array.isArray(jobDetails.value.serviceInParameters) ? jobDetails.value.serviceInParameters : [])
    .filter(parameterIsAllowed)
    .map((parameter: any, index: number) => ({
      key: `service-${parameter.parameterName || parameter.name || index}`,
      label: parameter.parameterName || parameter.name || translate('Parameter'),
      value: formatValue(parameter.defaultValue || parameter.parameterValue || parameter.type || parameter.mode),
    })));

const parameterCount = computed(() => jobParameters.value.length + serviceParameters.value.length);

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

watch(() => [props.isOpen, props.jobName], ([open]) => { if (open && props.jobName) void load(); });

async function load() {
  if (!props.jobName) return;
  isLoading.value = true; loadError.value = '';
  try {
    const [details, runs, audits] = await Promise.all([
      fetchJobDetail(props.jobName, props.productStoreId),
      fetchJobRuns(props.jobName, { pageSize: 5, pageIndex: 0 }),
      fetchJobAuditHistory(props.jobName, { pageSize: 10, pageIndex: 0 }),
    ]);
    jobDetails.value = details || {};
    recentRuns.value = Array.isArray(runs) ? runs : [];
    auditHistory.value = Array.isArray(audits) ? audits : [];
    resetDraft();
  } catch (_error) {
    loadError.value = translate('Failed to load sync job details.');
    jobDetails.value = {}; recentRuns.value = []; auditHistory.value = [];
  } finally { isLoading.value = false; }
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
  if (!props.jobName || !props.canRunNow) return;
  isRunning.value = true;
  try {
    const result = props.runHandler ? await props.runHandler() : await runNow(props.jobName);
    if (result === false) return;
    commonUtil.showToast(translate('Job queued successfully.'));
    await load();
  }
  catch (_error) { commonUtil.showToast(translate('Something went wrong.')); }
  finally { isRunning.value = false; }
}
async function save() {
  if (!canSave.value) return;
  isSaving.value = true;
  try {
    const paused = !draftActive.value;
    const parameterChanges = changedParameters.value;
    if (props.saveHandler) {
      await props.saveHandler({ cronExpression: draftCronExpression.value, paused });
      // A `saveHandler` owns the schedule/pause write only - it is where a screen puts its own
      // validation for those. Parameters go through the standard job PUT so a caller that predates
      // editable parameters drops them silently instead of writing them.
      if (parameterChanges.length) await updateJob({ jobName: props.jobName, serviceJobParameters: parameterChanges });
    } else {
      await updateJob({
        jobName: props.jobName,
        paused: paused ? 'Y' : 'N',
        ...(scheduleChanged.value ? { cronExpression: draftCronExpression.value } : {}),
        ...(parameterChanges.length ? { serviceJobParameters: parameterChanges } : {}),
      });
    }
    // Fold the saved values back in before closing. Emitting `close` leaves `jobDetails` holding the
    // pre-save row, so `isDirty` is still true when ion-modal runs `can-dismiss` - and the user is
    // asked to discard the changes that were just written.
    jobDetails.value = {
      ...jobDetails.value,
      cronExpression: draftCronExpression.value,
      paused: paused ? 'Y' : 'N',
      serviceJobParameters: (Array.isArray(jobDetails.value.serviceJobParameters) ? jobDetails.value.serviceJobParameters : [])
        .map((parameter: any) => {
          const saved = parameterChanges.find((change) => change.parameterName === String(parameter?.parameterName ?? ''));
          return saved ? { ...parameter, parameterValue: saved.parameterValue } : parameter;
        }),
    };
    resetDraft();
    commonUtil.showToast(translate('Sync job updated successfully.'));
    emit('updated'); emit('close');
  } catch (_error) { commonUtil.showToast(translate('Something went wrong.')); }
  finally { isSaving.value = false; }
}
function formatDate(value: unknown) { return formatDateTime(value) || translate('Not available'); }
/**
 * The value an input edits, which must round-trip - so unlike `formatValue` it never substitutes
 * "Not available" for an empty value, which would otherwise be saved back as the literal text.
 */
function toDraftValue(value: unknown) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
function formatValue(value: unknown) {
  if (value === undefined || value === null || value === '') return translate('Not available');
  if (Array.isArray(value)) return value.join(', ');
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
</style>
