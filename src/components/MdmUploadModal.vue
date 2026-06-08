<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal()">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate("Upload File") }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <ion-list>
      <ion-item>
        <ion-select
          :label="translate('Config') + ' *'"
          label-placement="stacked"
          interface="popover"
          v-model="selectedConfigId"
          @ionChange="onConfigChange"
        >
          <ion-select-option
            v-for="cfg in sortedConfigs"
            :key="cfg.configId"
            :value="cfg.configId"
          >
            {{ cfg.description || cfg.configId }} ({{ cfg.configId }})
          </ion-select-option>
        </ion-select>
      </ion-item>

      <ion-item>
        <ion-label position="stacked">{{ translate("File") }} *</ion-label>
        <input
          type="file"
          accept=".csv,.json,.txt"
          ref="fileInput"
          @change="onFileChange"
          class="ion-padding-top"
        />
      </ion-item>

      <ion-item v-if="selectedConfigId">
        <ion-button
          fill="outline"
          @click="downloadTemplate()"
          :disabled="isDownloadingTemplate"
        >
          <ion-icon slot="start" :icon="downloadOutline" />
          {{ translate("Download CSV template") }}
        </ion-button>
      </ion-item>
    </ion-list>

    <ion-button
      class="ion-margin"
      expand="block"
      :disabled="!selectedConfigId || !selectedFile || isUploading"
      @click="upload()"
    >
      <ion-spinner v-if="isUploading" name="crescent" />
      <span v-else>{{ translate("Upload") }}</span>
    </ion-button>
  </ion-content>
</template>

<script setup lang="ts">
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTitle,
  IonToolbar,
  modalController
} from '@ionic/vue'
import { translate, api, logger } from '@common'
import { computed, ref } from 'vue'
import { closeOutline, downloadOutline } from 'ionicons/icons'
import { useMdmStore } from '@/store/mdm'
import { showToast, getDownloadFileContent, downloadTextFile } from '@/utils'

const props = withDefaults(defineProps<{ configId?: string }>(), { configId: undefined })

const mdmStore = useMdmStore()
const selectedConfigId = ref(props.configId ?? '')
const selectedFile = ref<File | null>(null)
const isUploading = ref(false)
const isDownloadingTemplate = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const sortedConfigs = computed(() =>
  [...mdmStore.configs].sort((a: any, b: any) =>
    (a.description || a.configId).localeCompare(b.description || b.configId)
  )
)

function onConfigChange() {
  selectedFile.value = null
  if (fileInput.value) fileInput.value.value = ''
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  selectedFile.value = input.files?.[0] ?? null
}

function closeModal(data?: any) {
  modalController.dismiss(data)
}

async function downloadTemplate() {
  if (!selectedConfigId.value) return
  isDownloadingTemplate.value = true
  try {
    const resp = await api({
      url: `admin/dataManager/${selectedConfigId.value}/downloadTemplate`,
      method: 'get'
    }) as any
    const content = getDownloadFileContent(resp?.data)
    downloadTextFile(content, `${selectedConfigId.value}-template.csv`)
  } catch (e) {
    logger.error('Failed to download template', e)
    await showToast(translate('Failed to download template'))
  } finally {
    isDownloadingTemplate.value = false
  }
}

async function upload() {
  if (!selectedConfigId.value || !selectedFile.value) return
  isUploading.value = true
  try {
    const formData = new FormData()
    formData.append('configId', selectedConfigId.value)
    formData.append('uploadedFile', selectedFile.value)

    const resp = await api({
      url: 'admin/uploadDataManagerFile',
      method: 'post',
      data: formData,
      headers: { 'Content-Type': 'multipart/form-data' }
    }) as any

    if (resp?.data?.logId) {
      await showToast(translate('File uploaded successfully'))
      closeModal({ uploaded: true, logId: resp.data.logId })
    } else {
      throw resp?.data
    }
  } catch (e: any) {
    logger.error('Upload failed', e)
    const msg = e?._ERROR_MESSAGE_ || e?.message || translate('Upload failed')
    await showToast(msg)
  } finally {
    isUploading.value = false
  }
}
</script>
