<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal()">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate("Inbound webhooks") }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <ion-list>
      <ion-item lines="none">
        <ion-label class="ion-text-wrap">
          <p>{{ translate("Give these URLs and the shared token to QuickBox so it can post events back to the OMS.") }}</p>
        </ion-label>
      </ion-item>

      <ion-item v-for="hook in webhookList" :key="hook.key">
        <ion-label class="ion-text-wrap">
          {{ hook.label }}
          <p>{{ hook.url || translate("OMS URL unavailable") }}</p>
        </ion-label>
        <ion-button slot="end" fill="clear" :disabled="!hook.url" @click="copyUrl(hook.url)">
          <ion-icon slot="icon-only" :icon="copyOutline" />
        </ion-button>
      </ion-item>

      <ion-item>
        <ion-input
          v-model="sharedToken"
          :label="translate('Shared webhook token')"
          label-placement="stacked"
          type="password"
          placeholder="••••••••"
          autocomplete="off"
        />
      </ion-item>
    </ion-list>

    <ion-button
      class="ion-margin"
      expand="block"
      :disabled="!sharedToken.trim() || isSaving"
      @click="save()"
    >
      {{ translate("Save token") }}
    </ion-button>
  </ion-content>
</template>

<script setup lang="ts">
import {
  IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonInput,
  IonItem, IonLabel, IonList, IonTitle, IonToolbar, modalController
} from '@ionic/vue'
import { closeOutline, copyOutline } from 'ionicons/icons'
import { commonUtil, logger, translate } from '@common'
import { useQuickBoxStore } from '@/store/quickbox'
import { computed, ref } from 'vue'

const quickBoxStore = useQuickBoxStore()
const sharedToken = ref("")
const isSaving = ref(false)

const webhookList = computed(() => {
  const urls = quickBoxStore.getWebhookUrls
  return [
    { key: 'fulfillmentStatus', label: translate("Fulfillment status"), url: urls.fulfillmentStatus },
    { key: 'shipmentConfirm', label: translate("Shipment confirmation"), url: urls.shipmentConfirm },
    { key: 'inventoryAdjustment', label: translate("Inventory adjustment"), url: urls.inventoryAdjustment }
  ]
})

function closeModal(saved = false) {
  modalController.dismiss({ saved })
}

async function copyUrl(url: string) {
  if (!url) return
  try {
    await navigator.clipboard.writeText(url)
    commonUtil.showToast(translate("Copied to clipboard"))
  } catch (error) {
    logger.error('copyWebhookUrl', error)
    commonUtil.showToast(translate("Could not copy to clipboard"))
  }
}

async function save() {
  isSaving.value = true
  try {
    await quickBoxStore.updateWebhookToken({ password: sharedToken.value.trim() })
    commonUtil.showToast(translate("QuickBox webhook token saved"))
    closeModal(true)
  } catch (error) {
    logger.error('updateQuickBoxWebhookToken', error)
    commonUtil.showToast(translate("Failed to save QuickBox webhook token"))
  } finally {
    isSaving.value = false
  }
}
</script>
