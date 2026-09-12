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
        class="status-row"
        color="danger"
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
      >
        <ion-icon slot="start" aria-hidden="true" :icon="alertCircleOutline" />
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
        class="status-row"
        color="warning"
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
      >
        <ion-icon slot="start" aria-hidden="true" :icon="alertCircleOutline" />
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
              <ion-badge :color="configurationPresentation.color">
                {{ translate(configurationPresentation.label) }}
              </ion-badge>
            </div>
            <p>{{ translate(configuration.summary) }}</p>
          </ion-label>
        </ion-item>

        <ion-item v-for="check in configuration.checks ?? []" :key="check.id" class="check-row">
          <ion-icon
            slot="start"
            aria-hidden="true"
            :color="checkPresentation(check.status).color"
            :icon="checkPresentation(check.status).icon"
          />
          <ion-label class="ion-text-wrap">
            <h3>{{ translate(check.label) }}</h3>
            <p v-if="check.detail">
              {{ translate(check.detail) }}
            </p>
          </ion-label>
          <ion-badge slot="end" :color="checkPresentation(check.status).color">
            {{ translate(checkPresentation(check.status).label) }}
          </ion-badge>
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
              <ion-badge :color="runPresentation.color">
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
                <ion-badge :color="runStatusPresentation(stage.status).color">
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

    <ion-item v-if="initialLoad.recoveryHint" lines="none">
      <ion-note color="primary" class="ion-text-wrap">
        <strong>{{ translate("Next action") }}:</strong>
        {{ translate(initialLoad.recoveryHint) }}
      </ion-note>
    </ion-item>

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
  IonNote,
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
.onboarding-sync-status ion-list {
  padding: 0;
}

.onboarding-sync-status ion-list-header {
  padding-inline-start: 0;
}

.status-row,
.stage-row,
.check-row {
  --padding-start: 0;
}

.stage-row,
.check-row {
  --padding-start: var(--spacer-lg);
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

.sync-progress {
  margin-top: calc(var(--spacer-xs) * -1);
}

.status-diagnostics {
  margin-top: var(--spacer-sm);
  padding: var(--spacer-sm);
  border-inline-start: 3px solid var(--ion-color-danger);
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

  .status-diagnostics dl > div {
    grid-template-columns: 1fr;
    gap: 0;
  }

  .status-actions ion-button {
    flex: 1 1 auto;
  }
}

/* Visually hidden live region. Ionic's ion-hide is display:none, which also hides it from assistive tech. */
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
</style>
