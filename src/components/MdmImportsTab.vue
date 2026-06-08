<template>
  <!-- Status filter -->
  <ion-list lines="full">
    <ion-list-header>
      <ion-label>{{ translate("Filters") }}</ion-label>
    </ion-list-header>
    <ion-item>
      <ion-select
        :label="translate('Status')"
        :value="statusFilter"
        interface="popover"
        @ionChange="statusFilter = $event.detail.value"
      >
        <ion-select-option value="">{{ translate("All statuses") }}</ion-select-option>
        <ion-select-option value="DmlsPending">{{ translate("Pending") }}</ion-select-option>
        <ion-select-option value="DmlsQueued">{{ translate("Queued") }}</ion-select-option>
        <ion-select-option value="DmlsRunning">{{ translate("Running") }}</ion-select-option>
        <ion-select-option value="DmlsFinished">{{ translate("Finished") }}</ion-select-option>
        <ion-select-option value="DmlsFailed">{{ translate("Failed") }}</ion-select-option>
        <ion-select-option value="DmlsCrashed">{{ translate("Crashed") }}</ion-select-option>
        <ion-select-option value="DmlsCancelled">{{ translate("Cancelled") }}</ion-select-option>
      </ion-select>
    </ion-item>
  </ion-list>

  <!-- Loading -->
  <ion-card v-if="mdmStore.fetchStatus.logs === 'pending' && !mdmStore.logs.length">
    <ion-card-header>
      <ion-card-title>{{ translate("Loading imports") }}</ion-card-title>
    </ion-card-header>
    <ion-card-content>
      <ion-spinner name="crescent" />
    </ion-card-content>
  </ion-card>

  <!-- Error -->
  <ion-card v-else-if="mdmStore.fetchStatus.logs === 'error'">
    <ion-card-header>
      <ion-card-title>{{ translate("Could not load imports") }}</ion-card-title>
    </ion-card-header>
    <ion-card-content>
      <ion-button fill="outline" @click="mdmStore.fetchLogs()">{{ translate("Retry") }}</ion-button>
    </ion-card-content>
  </ion-card>

  <!-- Feed -->
  <ion-list v-else>
    <ion-list-header>
      <ion-label>{{ translate("A list of recent import runs") }}</ion-label>
    </ion-list-header>

    <ion-accordion-group>
      <ion-accordion
        v-for="log in filteredLogs"
        :key="log.logId"
        :value="log.logId"
      >
        <div class="list-item" slot="header">
          <ion-item lines="none">
            <ion-icon
              slot="start"
              :icon="getLogIcon(log)"
              :color="getLogIconColor(log)"
            />
            <ion-label>
              {{ log.description || log.configId }}
              <p>{{ log.configId }}</p>
              <p>{{ translate("Created") }}: {{ formatDateTime(log.createdDate) || translate("Unavailable") }}</p>
            </ion-label>
          </ion-item>

          <ion-label class="stat">
            <ion-chip outline :color="getMdmStatusColor(log)">
              <ion-label>{{ getMdmStatusLabel(log) }}</ion-label>
              <ion-icon :icon="getMdmStatusIcon(log)" />
            </ion-chip>
            <p>{{ translate("Status") }}</p>
          </ion-label>

          <ion-label class="stat">
            <ion-chip
              outline
              :color="log.logContentId ? 'primary' : 'medium'"
              :disabled="!log.logContentId"
              @click.stop="downloadFile(log)"
            >
              <ion-icon :icon="downloadOutline" />
              <ion-label>{{ log.totalRecordCount ?? '—' }}</ion-label>
            </ion-chip>
            <p>{{ translate("total records") }}</p>
          </ion-label>

          <ion-label class="stat">
            <ion-chip
              outline
              :color="log.errorLogContentId ? 'danger' : 'medium'"
              :disabled="!log.errorLogContentId"
              @click.stop="downloadErrorFile(log)"
            >
              <ion-icon :icon="downloadOutline" />
              <ion-label>{{ log.failedRecordCount ?? '—' }}</ion-label>
            </ion-chip>
            <p>{{ translate("failed records") }}</p>
          </ion-label>
        </div>

        <ion-list slot="content" lines="full">
          <ion-item>
            <ion-label>
              {{ translate("Log ID") }}
              <p>{{ log.logId }}</p>
            </ion-label>
          </ion-item>
          <ion-item>
            <ion-label>
              {{ translate("Config") }}
              <p>{{ log.configId }}</p>
            </ion-label>
          </ion-item>
          <ion-item>
            <ion-label>
              {{ translate("Created") }}
              <p>{{ formatDateTime(log.createdDate) || translate("Unavailable") }}</p>
            </ion-label>
          </ion-item>
          <ion-item>
            <ion-label>
              {{ translate("Started") }}
              <p>{{ formatDateTime(log.startDateTime) || translate("Unavailable") }}</p>
            </ion-label>
          </ion-item>
          <ion-item>
            <ion-label>
              {{ translate("Finished") }}
              <p>{{ formatDateTime(log.finishDateTime) || translate("Unavailable") }}</p>
            </ion-label>
          </ion-item>
          <ion-item>
            <ion-label>
              {{ translate("Records") }}
              <p>{{ translate("Total") }}: {{ log.totalRecordCount ?? '—' }} / {{ translate("Failed") }}: {{ log.failedRecordCount ?? '—' }}</p>
            </ion-label>
          </ion-item>
        </ion-list>
      </ion-accordion>
    </ion-accordion-group>

    <!-- Empty state -->
    <div class="empty-state" v-if="!filteredLogs.length && mdmStore.fetchStatus.logs === 'success'">
      <p>{{ translate("No recent imports found") }}</p>
    </div>
  </ion-list>

  <!-- Infinite scroll -->
  <ion-infinite-scroll
    :disabled="!hasMoreLogs"
    @ionInfinite="loadMore($event)"
  >
    <ion-infinite-scroll-content
      loading-spinner="crescent"
      :loading-text="translate('Loading more imports')"
    />
  </ion-infinite-scroll>
</template>

<script setup lang="ts">
import {
  IonAccordion,
  IonAccordionGroup,
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonChip,
  IonIcon,
  IonInfiniteScroll,
  IonInfiniteScrollContent,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  onIonViewWillEnter
} from '@ionic/vue'
import { translate } from '@common'
import { computed, onUnmounted, ref } from 'vue'
import {
  alertCircleOutline,
  checkmarkCircleOutline,
  downloadOutline,
  helpCircleOutline,
  serverOutline,
  syncCircleOutline
} from 'ionicons/icons'
import { useMdmStore } from '@/store/mdm'
import { useDataManagerLog } from '@/composables/useDataManagerLog'
import { formatDateTime, getDownloadFileContent, downloadTextFile } from '@/utils'

const mdmStore = useMdmStore()
const { downloadDataManagerFile } = useDataManagerLog()

const statusFilter = ref('')
const hasMoreLogs = ref(true)
const pageIndex = ref(1)

let pollTimer: ReturnType<typeof setInterval> | null = null

const filteredLogs = computed(() => {
  if (!statusFilter.value) return mdmStore.logs
  return mdmStore.logs.filter((l: any) => l.statusId === statusFilter.value)
})

const hasActiveRuns = computed(() =>
  mdmStore.logs.some((l: any) => l.statusId === 'DmlsPending' || l.statusId === 'DmlsQueued' || l.statusId === 'DmlsRunning')
)

onIonViewWillEnter(() => {
  startPollingIfNeeded()
})

onUnmounted(() => {
  stopPolling()
})

function startPollingIfNeeded() {
  stopPolling()
  if (hasActiveRuns.value) {
    pollTimer = setInterval(async () => {
      await mdmStore.fetchLogs()
      if (!hasActiveRuns.value) stopPolling()
    }, 30000)
  }
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}

async function loadMore(event: any) {
  const count = await mdmStore.fetchMoreLogs({ pageIndex: pageIndex.value })
  pageIndex.value++
  if (count < 50) hasMoreLogs.value = false
  event.target.complete()
}

async function downloadFile(log: any) {
  if (!log.logContentId) return
  try {
    const resp = await downloadDataManagerFile(log.configId, log.logContentId)
    downloadTextFile(getDownloadFileContent(resp?.data), `${log.configId}-${log.logId}.csv`)
  } catch (e) {
    // silent — chip is disabled when logContentId is absent
  }
}

async function downloadErrorFile(log: any) {
  if (!log.errorLogContentId) return
  try {
    const resp = await downloadDataManagerFile(log.configId, log.errorLogContentId)
    downloadTextFile(getDownloadFileContent(resp?.data), `${log.configId}-${log.logId}-errors.csv`)
  } catch (e) {
    // silent
  }
}

// ── Status helpers ──────────────────────────────────────────────────────────

function normalizeStatus(s: string) {
  return String(s || '').toLowerCase().replace(/[_\-\s]/g, '')
}

function getMdmStatusLabel(log: any) {
  if (Number(log.failedRecordCount) > 0 && log.statusId === 'DmlsFinished') return translate('Finished with errors')
  const map: Record<string, string> = {
    DmlsPending: translate('Pending'),
    DmlsQueued: translate('Queued'),
    DmlsRunning: translate('Running'),
    DmlsFinished: translate('Finished'),
    DmlsFailed: translate('Failed'),
    DmlsCrashed: translate('Crashed'),
    DmlsCancelled: translate('Cancelled')
  }
  return map[log.statusId] ?? log.statusId
}

function getMdmStatusColor(log: any) {
  if (Number(log.failedRecordCount) > 0 && log.statusId === 'DmlsFinished') return 'danger'
  const map: Record<string, string> = {
    DmlsPending: 'medium',
    DmlsQueued: 'medium',
    DmlsRunning: 'primary',
    DmlsFinished: 'success',
    DmlsFailed: 'danger',
    DmlsCrashed: 'danger',
    DmlsCancelled: 'warning'
  }
  return map[log.statusId] ?? 'medium'
}

function getMdmStatusIcon(log: any) {
  if (Number(log.failedRecordCount) > 0 && log.statusId === 'DmlsFinished') return alertCircleOutline
  const ns = normalizeStatus(log.statusId)
  if (ns === 'dmlsfinished') return checkmarkCircleOutline
  if (['dmlsrunning', 'dmlspending', 'dmlsqueued'].includes(ns)) return syncCircleOutline
  if (['dmlsfailed', 'dmlscrashed', 'dmlscancelled'].includes(ns)) return alertCircleOutline
  return helpCircleOutline
}

function getLogIcon(log: any) {
  if (Number(log.failedRecordCount) > 0) return alertCircleOutline
  if (log.statusId === 'DmlsFinished') return serverOutline
  return helpCircleOutline
}

function getLogIconColor(log: any) {
  if (Number(log.failedRecordCount) > 0) return 'danger'
  if (log.statusId === 'DmlsFinished') return 'success'
  if (log.statusId === 'DmlsRunning' || log.statusId === 'DmlsQueued') return 'primary'
  return 'medium'
}
</script>

<style scoped>
.list-item {
  --columns-desktop: 4;
  border-top: 1px solid var(--ion-color-medium);
}

@media (min-width: 991px) {
  .list-item {
    padding-block: var(--spacer-sm);
    padding-inline-end: var(--spacer-sm);
  }
}
</style>
