<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-back-button slot="start" default-href="/mdm" />
        <ion-title>{{ config?.description || configId }}</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="openEditModal()">{{ translate("Edit") }}</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <!-- Config fields -->
      <ion-list lines="full">
        <ion-list-header>
          <ion-label>{{ translate("Config details") }}</ion-label>
        </ion-list-header>
        <ion-item>
          <ion-label>
            {{ translate("Config ID") }}
            <p>{{ config?.configId }}</p>
          </ion-label>
        </ion-item>
        <ion-item>
          <ion-label>
            {{ translate("Import Service") }}
            <p>{{ config?.importServiceName || '—' }}</p>
          </ion-label>
        </ion-item>
        <ion-item>
          <ion-label>
            {{ translate("Execution Mode") }}
            <p>{{ config?.executionModeId || '—' }}</p>
          </ion-label>
        </ion-item>
        <ion-item>
          <ion-label>
            {{ translate("Multi Threading") }}
            <p>{{ config?.multiThreading || 'N' }}</p>
          </ion-label>
        </ion-item>
        <ion-item>
          <ion-label>
            {{ translate("Priority") }}
            <p>{{ config?.priority || '—' }}</p>
          </ion-label>
        </ion-item>
      </ion-list>

      <!-- Recent runs -->
      <ion-list lines="full">
        <ion-list-header>
          <ion-label>{{ translate("Recent runs") }}</ion-label>
          <ion-button slot="end" @click="openUploadModal()" :aria-label="translate('Upload')">
            <ion-icon slot="icon-only" :icon="cloudUploadOutline" />
          </ion-button>
        </ion-list-header>

        <ion-card v-if="isLoadingLogs">
          <ion-card-content><ion-spinner name="crescent" /></ion-card-content>
        </ion-card>

        <ion-accordion-group v-else>
          <ion-accordion
            v-for="log in configLogs"
            :key="log.logId"
            :value="log.logId"
          >
            <div class="list-item" slot="header">
              <ion-item lines="none">
                <ion-icon slot="start" :icon="getLogIcon(log)" :color="getLogIconColor(log)" />
                <ion-label>
                  {{ formatDateTime(log.createdDate) || translate("Unavailable") }}
                </ion-label>
              </ion-item>
              <ion-label class="stat">
                <ion-chip outline :color="getMdmStatusColor(log)">
                  <ion-label>{{ getMdmStatusLabel(log) }}</ion-label>
                  <ion-icon :icon="getMdmStatusIcon(log)" />
                </ion-chip>
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
                <p>{{ translate("total") }}</p>
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
                <p>{{ translate("failed") }}</p>
              </ion-label>
            </div>

            <ion-list slot="content" lines="full">
              <ion-item>
                <ion-label>{{ translate("Log ID") }}<p>{{ log.logId }}</p></ion-label>
              </ion-item>
              <ion-item>
                <ion-label>{{ translate("Started") }}<p>{{ formatDateTime(log.startDateTime) || '—' }}</p></ion-label>
              </ion-item>
              <ion-item>
                <ion-label>{{ translate("Finished") }}<p>{{ formatDateTime(log.finishDateTime) || '—' }}</p></ion-label>
              </ion-item>
            </ion-list>
          </ion-accordion>
        </ion-accordion-group>

        <div class="empty-state" v-if="!isLoadingLogs && !configLogs.length">
          <p>{{ translate("No runs yet") }}</p>
        </div>
      </ion-list>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonAccordion,
  IonAccordionGroup,
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonChip,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonPage,
  IonSpinner,
  IonTitle,
  IonToolbar,
  modalController,
  onIonViewWillEnter
} from '@ionic/vue'
import { translate } from '@common'
import { computed, ref } from 'vue'
import {
  alertCircleOutline,
  checkmarkCircleOutline,
  cloudUploadOutline,
  downloadOutline,
  helpCircleOutline,
  serverOutline,
  syncCircleOutline
} from 'ionicons/icons'
import { useMdmStore } from '@/store/mdm'
import { useDataManagerLog } from '@/composables/useDataManagerLog'
import { formatDateTime, getDownloadFileContent, downloadTextFile } from '@/utils'
import MdmUploadModal from '@/components/MdmUploadModal.vue'
import MdmConfigModal from '@/components/MdmConfigModal.vue'

const props = defineProps<{ configId: string }>()

const mdmStore = useMdmStore()
const { downloadDataManagerFile, fetchRecentLogsByConfigId } = useDataManagerLog()
const isLoadingLogs = ref(false)
const configLogs = ref<any[]>([])

const config = computed(() => mdmStore.getConfigById(props.configId))

onIonViewWillEnter(async () => {
  if (mdmStore.fetchStatus.configs === 'none') {
    await mdmStore.fetchConfigs()
  }
  await loadConfigLogs()
})

async function loadConfigLogs() {
  isLoadingLogs.value = true
  try {
    configLogs.value = await fetchRecentLogsByConfigId(props.configId, 10) ?? []
  } finally {
    isLoadingLogs.value = false
  }
}

async function openUploadModal() {
  const modal = await modalController.create({
    component: MdmUploadModal,
    componentProps: { configId: props.configId }
  })
  await modal.present()
  const { data } = await modal.onWillDismiss()
  if (data?.uploaded) await loadConfigLogs()
}

async function openEditModal() {
  const modal = await modalController.create({
    component: MdmConfigModal,
    componentProps: { config: config.value }
  })
  await modal.present()
  const { data } = await modal.onWillDismiss()
  if (data?.saved) await mdmStore.fetchConfigs()
}

async function downloadFile(log: any) {
  if (!log.logContentId) return
  try {
    const resp = await downloadDataManagerFile(log.configId, log.logContentId)
    downloadTextFile(getDownloadFileContent(resp?.data), `${log.configId}-${log.logId}.csv`)
  } catch (e) { /* silent */ }
}

async function downloadErrorFile(log: any) {
  if (!log.errorLogContentId) return
  try {
    const resp = await downloadDataManagerFile(log.configId, log.errorLogContentId)
    downloadTextFile(getDownloadFileContent(resp?.data), `${log.configId}-${log.logId}-errors.csv`)
  } catch (e) { /* silent */ }
}

// ── Status helpers ──────────────────────────────────────────────────────────

function normalizeStatus(s: string) {
  return String(s || '').toLowerCase().replace(/[_\-\s]/g, '')
}
function getMdmStatusLabel(log: any) {
  if (Number(log.failedRecordCount) > 0 && log.statusId === 'DmlsFinished') return translate('Finished with errors')
  const map: Record<string, string> = {
    DmlsPending: translate('Pending'), DmlsQueued: translate('Queued'),
    DmlsRunning: translate('Running'), DmlsFinished: translate('Finished'),
    DmlsFailed: translate('Failed'), DmlsCrashed: translate('Crashed'),
    DmlsCancelled: translate('Cancelled')
  }
  return map[log.statusId] ?? log.statusId
}
function getMdmStatusColor(log: any) {
  if (Number(log.failedRecordCount) > 0 && log.statusId === 'DmlsFinished') return 'danger'
  const map: Record<string, string> = {
    DmlsPending: 'medium', DmlsQueued: 'medium', DmlsRunning: 'primary',
    DmlsFinished: 'success', DmlsFailed: 'danger', DmlsCrashed: 'danger', DmlsCancelled: 'warning'
  }
  return map[log.statusId] ?? 'medium'
}
function getMdmStatusIcon(log: any) {
  if (Number(log.failedRecordCount) > 0 && log.statusId === 'DmlsFinished') return alertCircleOutline
  const ns = normalizeStatus(log.statusId)
  if (ns === 'dmlsfinished') return checkmarkCircleOutline
  if (['dmlsrunning', 'dmlspending', 'dmlsqueued'].includes(ns)) return syncCircleOutline
  return alertCircleOutline
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
