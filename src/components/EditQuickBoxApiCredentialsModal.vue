<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal()">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate("API credentials") }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <ion-list>
      <ion-item lines="none">
        <ion-label class="ion-text-wrap">
          <p>{{ translate("Outbound connection to the QuickBox iQ Connect API. The secret is write-only — leave it blank to keep the stored value.") }}</p>
        </ion-label>
      </ion-item>

      <ion-item>
        <ion-input
          v-model="form.sendUrl"
          :label="translate('Base URL') + ' *'"
          label-placement="stacked"
          placeholder="https://..."
          autocomplete="off"
        />
      </ion-item>

      <ion-item>
        <ion-select v-model="form.authMode" :label="translate('Authentication')" interface="popover">
          <ion-select-option value="bearer">{{ translate("Bearer token") }}</ion-select-option>
          <ion-select-option value="basic">{{ translate("Basic auth") }}</ion-select-option>
        </ion-select>
      </ion-item>

      <ion-item v-if="form.authMode === 'basic'">
        <ion-input
          v-model="form.username"
          :label="translate('Username') + ' *'"
          label-placement="stacked"
          autocomplete="off"
        />
      </ion-item>

      <ion-item>
        <ion-input
          v-model="form.password"
          :label="form.authMode === 'basic' ? translate('Password') : translate('API token')"
          label-placement="stacked"
          type="password"
          :placeholder="isConfigured ? '••••••••' : ''"
          autocomplete="off"
        />
      </ion-item>
    </ion-list>

    <ion-button
      class="ion-margin"
      expand="block"
      :disabled="!isFormValid || isSaving"
      @click="save()"
    >
      {{ translate("Save") }}
    </ion-button>
  </ion-content>
</template>

<script setup lang="ts">
import {
  IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonInput,
  IonItem, IonLabel, IonList, IonSelect, IonSelectOption, IonTitle, IonToolbar, modalController
} from '@ionic/vue'
import { closeOutline } from 'ionicons/icons'
import { commonUtil, logger, translate } from '@common'
import { useQuickBoxStore } from '@/store/quickbox'
import { computed, reactive, ref } from 'vue'

const quickBoxStore = useQuickBoxStore()

const isConfigured = computed(() => quickBoxStore.isApiConfigured)

const form = reactive({
  sendUrl: quickBoxStore.apiConfig.sendUrl || '',
  // Snapshot of current config — the hub awaits fetchConnectionConfig() before opening this modal.
  authMode: quickBoxStore.getAuthMode as 'bearer' | 'basic',
  username: quickBoxStore.apiConfig.username || '',
  password: ''
})
const isSaving = ref(false)

const isFormValid = computed(() =>
  !!form.sendUrl.trim() && (form.authMode === 'bearer' || !!form.username.trim())
)

function closeModal(saved = false) {
  modalController.dismiss({ saved })
}

async function save() {
  isSaving.value = true
  try {
    await quickBoxStore.updateApiCredentials({
      sendUrl: form.sendUrl.trim(),
      authMode: form.authMode,
      username: form.authMode === 'basic' ? form.username.trim() : '',
      password: form.password.trim() || undefined
    })
    commonUtil.showToast(translate("QuickBox API credentials saved"))
    closeModal(true)
  } catch (error) {
    logger.error('updateQuickBoxApiCredentials', error)
    commonUtil.showToast(translate("Failed to save QuickBox API credentials"))
  } finally {
    isSaving.value = false
  }
}
</script>
