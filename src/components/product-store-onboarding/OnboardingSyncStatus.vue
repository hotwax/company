<template>
  <section
    class="onboarding-sync-status"
    :aria-label="translate(title)"
    :aria-busy="busyAction ? 'true' : undefined"
  >
    <p
      v-if="hydrated"
      class="sync-live-announcement"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {{ runStatusAnnouncement }}
    </p>
    <ion-list lines="full">
      <ion-list-header>
        <ion-label>
          {{ translate(title) }}
          <p v-if="subtitle">
            {{ translate(subtitle) }}
          </p>
        </ion-label>
      </ion-list-header>

      <ion-item
        v-if="!hydrated && loadError"
        class="status-row status-error"
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
      >
        <ion-icon slot="start" aria-hidden="true" color="danger" :icon="alertCircleOutline" />
        <ion-label class="ion-text-wrap">
          <h3>{{ translate("Sync status unavailable") }}</h3>
          <p>{{ translate(loadError) }}</p>
        </ion-label>
      </ion-item>

      <ion-item v-else-if="!hydrated" class="status-row" aria-busy="true">
        <ion-label class="ion-text-wrap">
          <h3>{{ translate("Loading sync status") }}</h3>
          <ion-skeleton-text animated style="width: 70%" />
          <ion-skeleton-text animated style="width: 45%" />
        </ion-label>
      </ion-item>

      <ion-item
        v-else-if="loadError"
        class="status-row status-warning"
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
      >
        <ion-icon slot="start" aria-hidden="true" color="warning" :icon="alertCircleOutline" />
        <ion-label class="ion-text-wrap">
          <h3>{{ translate("Latest refresh failed") }}</h3>
          <p>{{ translate(loadError) }}</p>
        </ion-label>
      </ion-item>

      <template v-if="hydrated">
        <ion-item class="status-row">
          <ion-icon
            slot="start"
            aria-hidden="true"
            :color="configurationPresentation.color"
            :icon="configurationPresentation.icon"
          />
          <ion-label class="ion-text-wrap">
            <div class="status-heading">
              <h3>{{ translate("Configuration") }}</h3>
              <ion-badge
                :class="['status-badge', `status-badge--${configurationPresentation.color}`]"
              >
                {{ translate(configurationPresentation.label) }}
              </ion-badge>
            </div>
            <p>{{ translate(configuration.summary) }}</p>
            <ul v-if="configuration.checks?.length" class="status-checks">
              <li v-for="check in configuration.checks" :key="check.id">
                <ion-icon
                  aria-hidden="true"
                  :color="checkPresentation(check.status).color"
                  :icon="checkPresentation(check.status).icon"
                />
                <span>
                  <strong>{{ translate(check.label) }}</strong>
                  <small v-if="check.detail">{{ translate(check.detail) }}</small>
                </span>
                <ion-badge
                  :class="[
                    'status-badge',
                    'check-badge',
                    `status-badge--${checkPresentation(check.status).color}`
                  ]"
                >
                  {{ translate(checkPresentation(check.status).label) }}
                </ion-badge>
              </li>
            </ul>
          </ion-label>
        </ion-item>

        <ion-item class="status-row">
          <ion-icon
            slot="start"
            aria-hidden="true"
            :color="runPresentation.color"
            :icon="runPresentation.icon"
          />
          <ion-label class="ion-text-wrap">
            <div class="status-heading">
              <h3>{{ translate("Current or last run") }}</h3>
              <ion-badge :class="['status-badge', `status-badge--${runPresentation.color}`]">
                {{ translate(runPresentation.label) }}
              </ion-badge>
            </div>
            <p>
              {{ translate(initialLoad.summary) }}
            </p>
            <p v-if="initialLoad.lastRunLabel">
              <strong>{{ translate("Request context") }}:</strong>
              {{ translate(initialLoad.lastRunLabel) }}
            </p>
            <p v-if="hasRecordEvidence(initialLoad)">
              {{ recordEvidence(initialLoad) }}
            </p>
          </ion-label>
        </ion-item>

        <template v-if="initialLoad.stages?.length">
          <ion-item v-for="stage in initialLoad.stages" :key="stage.id" class="stage-row">
            <ion-icon
              slot="start"
              aria-hidden="true"
              :color="runStatusPresentation(stage.status).color"
              :icon="runStatusPresentation(stage.status).icon"
            />
            <ion-label class="ion-text-wrap">
              <div class="status-heading">
                <h3>{{ translate(stage.label) }}</h3>
                <ion-badge
                  :class="[
                    'status-badge',
                    `status-badge--${runStatusPresentation(stage.status).color}`
                  ]"
                >
                  {{ translate(runStatusPresentation(stage.status).label) }}
                </ion-badge>
              </div>
              <p v-if="stage.detail">
                {{ translate(stage.detail) }}
              </p>
              <p v-if="hasRecordEvidence(stage)">
                {{ recordEvidence(stage) }}
              </p>
              <div
                v-if="stage.diagnostics?.length"
                class="status-diagnostics"
                :aria-label="translate('Error details')"
              >
                <strong>{{ translate("Error details") }}</strong>
                <dl>
                  <div v-for="diagnostic in stage.diagnostics" :key="diagnostic.id">
                    <dt>{{ translate(diagnostic.label) }}</dt>
                    <dd>{{ diagnostic.detail }}</dd>
                  </div>
                </dl>
              </div>
            </ion-label>
          </ion-item>
        </template>
      </template>
    </ion-list>

    <ion-progress-bar
      v-if="showsProgress"
      class="sync-progress"
      :type="hasMeasuredProgress ? undefined : 'indeterminate'"
      :value="hasMeasuredProgress ? initialLoad.progress : undefined"
      :aria-label="`${translate('Status')}: ${translate(runPresentation.label)}`"
    />

    <p v-if="initialLoad.recoveryHint" class="recovery-guidance">
      <strong>{{ translate("Next action") }}:</strong>
      {{ translate(initialLoad.recoveryHint) }}
    </p>

    <div v-if="hasActions" class="status-actions">
      <ion-button
        v-if="saveActionLabel"
        fill="outline"
        :disabled="saveDisabled || !!busyAction"
        @click="emit('save')"
      >
        <ion-spinner v-if="busyAction === 'save'" slot="start" name="crescent" />
        <ion-icon v-else slot="start" :icon="saveOutline" />
        {{ translate(saveActionLabel) }}
      </ion-button>
      <ion-button
        v-if="showRunAction"
        :disabled="runDisabled || !!busyAction"
        @click="emit('run')"
      >
        <ion-spinner v-if="busyAction === 'run'" slot="start" name="crescent" />
        <ion-icon v-else slot="start" :icon="flashOutline" />
        {{ translate(resolvedRunActionLabel) }}
      </ion-button>
      <ion-button
        v-if="showRefreshAction"
        fill="clear"
        :disabled="refreshDisabled || !!busyAction"
        @click="emit('refresh')"
      >
        <ion-spinner v-if="busyAction === 'refresh'" slot="start" name="crescent" />
        <ion-icon v-else slot="start" :icon="refreshOutline" />
        {{ translate("Refresh") }}
      </ion-button>
      <ion-button
        v-if="showDetailsAction"
        fill="clear"
        :disabled="detailsDisabled || !!busyAction"
        @click="emit('open-details')"
      >
        <ion-spinner v-if="busyAction === 'details'" slot="start" name="crescent" />
        <ion-icon v-else slot="start" :icon="openOutline" />
        {{ translate("View details") }}
      </ion-button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { translate } from "@common"
import {
  IonBadge,
  IonButton,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonProgressBar,
  IonSkeletonText,
  IonSpinner
} from "@ionic/vue"
import {
  alertCircleOutline,
  checkmarkCircleOutline,
  flashOutline,
  openOutline,
  pulseOutline,
  refreshOutline,
  saveOutline,
  timeOutline
} from "ionicons/icons"
import { computed } from "vue"
import type {
  OnboardingSyncBusyAction,
  OnboardingSyncCheckStatus,
  OnboardingSyncConfiguration,
  OnboardingSyncRun,
  OnboardingSyncRunStatus,
  OnboardingSyncStage
} from "./OnboardingSyncStatus.types"

const props = withDefaults(defineProps<{
  title?: string
  subtitle?: string
  configuration: OnboardingSyncConfiguration
  initialLoad: OnboardingSyncRun
  hydrated?: boolean
  loadError?: string
  saveActionLabel?: string
  showRunAction?: boolean
  runActionLabel?: string
  showRefreshAction?: boolean
  showDetailsAction?: boolean
  saveDisabled?: boolean
  runDisabled?: boolean
  refreshDisabled?: boolean
  detailsDisabled?: boolean
  busyAction?: OnboardingSyncBusyAction
}>(), {
  title: "Track sync progress",
  subtitle: "",
  hydrated: true,
  loadError: "",
  saveActionLabel: "",
  showRunAction: false,
  runActionLabel: "",
  showRefreshAction: false,
  showDetailsAction: false,
  saveDisabled: false,
  runDisabled: false,
  refreshDisabled: false,
  detailsDisabled: false,
  busyAction: null
})

const emit = defineEmits<{
  (event: "save"): void
  (event: "run"): void
  (event: "refresh"): void
  (event: "open-details"): void
}>()

const configurationPresentation = computed(() => {
  if(props.configuration.status === "configured") {
    return { label: "Configured", color: "success", icon: checkmarkCircleOutline }
  }
  if(props.configuration.status === "not-configured") {
    return { label: "Setup required", color: "warning", icon: alertCircleOutline }
  }

  return { label: "Unknown", color: "medium", icon: timeOutline }
})

const runPresentation = computed(() => runStatusPresentation(props.initialLoad.status))
const activeStage = computed(() => {
  const stages = props.initialLoad.stages ?? []
  const activeStatuses: OnboardingSyncRunStatus[] = ["running", "importing", "sent", "queued", "pending"]
  const active = stages.find((stage) => activeStatuses.includes(stage.status))
  if(active) {return active}

  if(["error", "cancelled", "unavailable"].includes(props.initialLoad.status)) {
    return stages.find((stage) => ["error", "cancelled", "unavailable"].includes(stage.status))
  }

  return undefined
})
const runStatusAnnouncement = computed(() => {
  const parts = [
    `${translate("Current or last run")}: ${translate(runPresentation.value.label)}`
  ]

  if(activeStage.value) {
    const status = translate(runStatusPresentation(activeStage.value.status).label)
    parts.push(`${translate("Active stage")}: ${translate(activeStage.value.label)}, ${status}`)
  }

  const countSource = hasRecordEvidence(props.initialLoad)
    ? props.initialLoad
    : activeStage.value && hasRecordEvidence(activeStage.value)
      ? activeStage.value
      : null
  if(countSource) {
    parts.push(recordEvidence(countSource))
  }

  return `${parts.join(". ")}.`
})
const resolvedRunActionLabel = computed(() => props.runActionLabel ||
  (["error", "cancelled"].includes(props.initialLoad.status) ? "Retry" : "Run now"))
const hasMeasuredProgress = computed(() => Number.isFinite(props.initialLoad.progress))
const showsProgress = computed(() =>
  ["pending", "queued", "sent", "running", "importing"].includes(props.initialLoad.status) || hasMeasuredProgress.value)
const hasActions = computed(() => !!props.saveActionLabel || props.showRunAction ||
  props.showRefreshAction || props.showDetailsAction)

function checkPresentation(status: OnboardingSyncCheckStatus) {
  if(status === "complete") {
    return { label: "Complete", color: "success", icon: checkmarkCircleOutline }
  }
  if(status === "missing") {
    return { label: "Missing", color: "warning", icon: alertCircleOutline }
  }

  return { label: "Unknown", color: "medium", icon: timeOutline }
}

function runStatusPresentation(status: OnboardingSyncRunStatus) {
  if(status === "completed") {
    return { label: "Completed", color: "success", icon: checkmarkCircleOutline }
  }
  if(status === "error") {
    return { label: "Error", color: "danger", icon: alertCircleOutline }
  }
  if(status === "cancelled") {
    return { label: "Cancelled", color: "danger", icon: alertCircleOutline }
  }
  if(status === "sent") {
    return { label: "Sent", color: "primary", icon: pulseOutline }
  }
  if(status === "running") {
    return { label: "Running", color: "primary", icon: pulseOutline }
  }
  if(status === "importing") {
    return { label: "Importing", color: "primary", icon: pulseOutline }
  }
  if(status === "skipped") {
    return { label: "Skipped", color: "warning", icon: alertCircleOutline }
  }
  if(status === "queued") {
    return { label: "Queued", color: "medium", icon: timeOutline }
  }
  if(status === "pending") {
    return { label: "Pending", color: "medium", icon: timeOutline }
  }
  if(status === "not-started") {
    return { label: "Not started", color: "medium", icon: timeOutline }
  }
  if(status === "unavailable") {
    return { label: "Unavailable", color: "medium", icon: timeOutline }
  }

  return { label: "Unknown", color: "medium", icon: timeOutline }
}

function hasRecordEvidence(value: { totalRecordCount?: number; failedRecordCount?: number }) {
  return Number.isFinite(value.totalRecordCount) || Number.isFinite(value.failedRecordCount)
}

function recordEvidence(value: { totalRecordCount?: number; failedRecordCount?: number }) {
  const total = Number(value.totalRecordCount || 0)
  const failed = Number(value.failedRecordCount || 0)
  if((value as OnboardingSyncStage).countUnit === "objects") {
    return `${formatCount(total)} ${translate("objects processed")}`
  }
  if(failed > 0 && Number.isFinite(value.totalRecordCount)) {
    return `${formatCount(failed)} ${translate("failed of")} ${formatCount(total)} ${translate("records processed")}`
  }
  if(failed > 0) {
    return `${formatCount(failed)} ${translate("failed records")}`
  }

  return `${formatCount(total)} ${translate("records processed")}`
}

function formatCount(value: number) {
  return new Intl.NumberFormat().format(value)
}
</script>

<style scoped>
.onboarding-sync-status {
  --sync-detail-text: #475467;
  --sync-danger-detail: #8a1c29;
  --sync-warning-detail: #684500;
}

.onboarding-sync-status ion-list {
  padding: 0;
}

.onboarding-sync-status ion-list-header {
  padding-inline-start: 0;
}

.status-row,
.stage-row {
  --padding-start: 0;
}

.stage-row {
  --padding-start: var(--spacer-lg);
}

.status-checks {
  display: grid;
  gap: var(--spacer-xs);
  margin: var(--spacer-sm) 0 0;
  padding: 0;
  list-style: none;
}

.status-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacer-xs);
}

.status-heading h3 {
  flex: 1 1 12rem;
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
}

.status-badge {
  flex: 0 1 auto;
  max-width: 100%;
  border: 1px solid;
  font-weight: 600;
  line-height: 1.25;
  white-space: normal;
}

.status-badge--success {
  --background: #e7f6ec;
  --color: #176b38;
  border-color: #54a76d;
}

.status-badge--warning {
  --background: #fff4d6;
  --color: #714200;
  border-color: #c68a15;
}

.status-badge--danger {
  --background: #fdecec;
  --color: #a61b29;
  border-color: #d46b75;
}

.status-badge--primary {
  --background: #e8f1ff;
  --color: #174ea6;
  border-color: #7da5e8;
}

.status-badge--medium {
  --background: #f1f3f5;
  --color: #39414a;
  border-color: #98a1ab;
}

.check-badge {
  align-self: start;
}

.status-checks li {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: start;
  gap: var(--spacer-xs);
}

.status-checks ion-icon {
  margin-top: 0.125rem;
}

.status-checks span {
  display: grid;
  min-width: 0;
}

.status-row p,
.stage-row p,
.status-checks small {
  color: var(--sync-detail-text);
}

.status-error {
  --background: #fff1f2;
}

.status-error h3,
.status-error p {
  color: var(--sync-danger-detail);
}

.status-warning {
  --background: #fff8e7;
}

.status-warning h3,
.status-warning p {
  color: var(--sync-warning-detail);
}

.sync-progress {
  margin-top: calc(var(--spacer-xs) * -1);
}

.status-diagnostics {
  margin-top: var(--spacer-sm);
  padding: var(--spacer-sm);
  border-inline-start: 3px solid var(--ion-color-danger);
  background: rgba(var(--ion-color-danger-rgb), 0.08);
  color: #5f1b24;
  white-space: normal;
}

.status-diagnostics dl {
  display: grid;
  gap: var(--spacer-xs);
  margin: var(--spacer-xs) 0 0;
}

.status-diagnostics dl > div {
  display: grid;
  grid-template-columns: minmax(6rem, auto) minmax(0, 1fr);
  gap: var(--spacer-xs);
}

.status-diagnostics dt {
  font-weight: 600;
}

.status-diagnostics dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.recovery-guidance {
  margin: var(--spacer-sm) 0 0;
  padding: var(--spacer-sm);
  border-inline-start: 3px solid #175cd3;
  background: #eff6ff;
  color: #1d3f72;
}

.status-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacer-xs);
  padding-top: var(--spacer-sm);
}

@media (max-width: 600px) {
  .status-heading {
    flex-direction: column;
    align-items: flex-start;
  }

  .status-heading h3 {
    flex-basis: auto;
  }

  .status-checks li {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .check-badge {
    grid-column: 2;
    justify-self: start;
  }

  .status-diagnostics dl > div {
    grid-template-columns: 1fr;
    gap: 0;
  }

  .status-actions ion-button {
    flex: 1 1 auto;
  }
}

.sync-live-announcement {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (prefers-color-scheme: dark) {
  .onboarding-sync-status {
    --sync-detail-text: #d0d5dd;
    --sync-danger-detail: #ffd2d8;
    --sync-warning-detail: #ffe0a3;
  }

  .status-badge--success {
    --background: #173d2a;
    --color: #b7f5c9;
    border-color: #55b77a;
  }

  .status-badge--warning {
    --background: #493200;
    --color: #ffe0a3;
    border-color: #d1a640;
  }

  .status-badge--danger {
    --background: #4b1d25;
    --color: #ffd2d8;
    border-color: #d9707d;
  }

  .status-badge--primary {
    --background: #17385f;
    --color: #d6e8ff;
    border-color: #75a7ea;
  }

  .status-badge--medium {
    --background: #30343a;
    --color: #f2f4f7;
    border-color: #98a1ab;
  }

  .status-error,
  .status-diagnostics {
    --background: #4b1d25;
    background: #4b1d25;
    color: #ffd2d8;
  }

  .status-warning {
    --background: #493200;
  }

  .recovery-guidance {
    border-inline-start-color: #75a7ea;
    background: #17385f;
    color: #d6e8ff;
  }
}
</style>
