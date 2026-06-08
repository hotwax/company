<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal()">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ isAdd ? translate("Add Config") : translate("Edit Config") }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <ion-list>
      <ion-item v-if="isAdd">
        <ion-input
          :label="translate('Config ID') + ' *'"
          label-placement="stacked"
          v-model="form.configId"
          placeholder="ALLCAPS_SNAKE_ID"
          autocomplete="off"
        />
      </ion-item>

      <ion-item>
        <ion-input
          :label="translate('Description')"
          label-placement="stacked"
          v-model="form.description"
        />
      </ion-item>

      <ion-item>
        <ion-input
          :label="translate('Import Service')"
          label-placement="stacked"
          v-model="form.importServiceName"
          placeholder="co.hotwax.…"
          autocomplete="off"
        />
      </ion-item>

      <ion-item>
        <ion-select
          :label="translate('Execution Mode')"
          label-placement="stacked"
          interface="popover"
          v-model="form.executionModeId"
        >
          <ion-select-option value="Queue">{{ translate("Queue") }}</ion-select-option>
          <ion-select-option value="Immediate">{{ translate("Immediate") }}</ion-select-option>
        </ion-select>
      </ion-item>

      <ion-item>
        <ion-label>{{ translate("Multi Threading") }}</ion-label>
        <ion-toggle slot="end" v-model="multiThreadingBool" />
      </ion-item>

      <ion-item>
        <ion-input
          :label="translate('Priority')"
          label-placement="stacked"
          type="number"
          v-model="form.priority"
          placeholder="(higher = runs first)"
        />
      </ion-item>
    </ion-list>
  </ion-content>

  <ion-fab vertical="bottom" horizontal="end" slot="fixed">
    <ion-fab-button
      v-if="!isSaving"
      @click="save()"
      :disabled="!isFormValid"
      :aria-label="translate('Save')"
    >
      <ion-icon :icon="saveOutline" />
    </ion-fab-button>
    <ion-fab-button v-else disabled :aria-label="translate('Saving')">
      <ion-spinner name="crescent" />
    </ion-fab-button>
  </ion-fab>
</template>

<script setup lang="ts">
import {
  IonButton,
  IonButtons,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTitle,
  IonToggle,
  IonToolbar,
  modalController
} from '@ionic/vue'
import { translate, commonUtil } from '@common'
import { computed, ref } from 'vue'
import { closeOutline, saveOutline } from 'ionicons/icons'
import { useMdmStore } from '@/store/mdm'
import { showToast } from '@/utils'

const props = defineProps<{ config: any }>()

const mdmStore = useMdmStore()
const isSaving = ref(false)
const isAdd = !props.config

const form = ref({
  configId: props.config?.configId ?? '',
  description: props.config?.description ?? '',
  importServiceName: props.config?.importServiceName ?? '',
  executionModeId: props.config?.executionModeId ?? 'Queue',
  priority: props.config?.priority ?? ''
})

const multiThreadingBool = ref(props.config?.multiThreading === 'Y')

const isFormValid = computed(() =>
  !isAdd || !!form.value.configId.trim()
)

function closeModal(data?: any) {
  modalController.dismiss(data)
}

async function save() {
  isSaving.value = true
  try {
    const payload = {
      ...form.value,
      multiThreading: multiThreadingBool.value ? 'Y' : 'N'
    }
    const resp = isAdd
      ? await mdmStore.createConfig(payload)
      : await mdmStore.updateConfig(payload)

    if (commonUtil.hasError(resp)) throw resp.data

    closeModal({ saved: true })
  } catch (e: any) {
    const msg = e?._ERROR_MESSAGE_ || e?.message || translate('Save failed')
    await showToast(msg)
  } finally {
    isSaving.value = false
  }
}
</script>
