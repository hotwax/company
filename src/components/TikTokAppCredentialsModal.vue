<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal()">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate("TikTok app credentials") }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <ion-list>
      <ion-item lines="none">
        <ion-label class="ion-text-wrap">
          <p>{{ translate("Credentials of the TikTok Partner Center app. The secret is write-only: it is stored encrypted and never displayed again.") }}</p>
        </ion-label>
      </ion-item>
      <ion-item>
        <ion-input v-model="appKey" :label="translate('App key')" label-placement="floating" />
      </ion-item>
      <ion-item>
        <ion-input v-model="appSecret" type="password" autocomplete="off" :label="translate('App secret')" label-placement="floating"
          :placeholder="appCredentials.configured ? '••••••••' : ''" />
      </ion-item>
    </ion-list>

    <ion-fab vertical="bottom" horizontal="end" slot="fixed">
      <ion-fab-button :disabled="!appKey.trim() || !appSecret.trim() || isSaving" @click="save()">
        <ion-icon :icon="saveOutline" />
      </ion-fab-button>
    </ion-fab>
  </ion-content>
</template>

<script setup lang="ts">
import { IonButton, IonButtons, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonList, IonTitle, IonToolbar, modalController } from "@ionic/vue";
import { closeOutline, saveOutline } from "ionicons/icons";
import { computed, ref } from "vue";
import { translate, commonUtil } from '@common';
import { useTikTokStore } from '@/store/tiktok';

const tiktokStore = useTikTokStore();
const appCredentials = computed(() => tiktokStore.appCredentials)
const appKey = ref(appCredentials.value.appKey || "")
const appSecret = ref("")
const isSaving = ref(false)

function closeModal(saved = false) {
  modalController.dismiss({ saved })
}

async function save() {
  isSaving.value = true
  try {
    await tiktokStore.updateAppCredentials({ appKey: appKey.value.trim(), appSecret: appSecret.value.trim() })
    commonUtil.showToast(translate("TikTok app credentials saved"))
    closeModal(true)
  } catch (error) {
    commonUtil.showToast(translate("Failed to save TikTok app credentials"))
  } finally {
    isSaving.value = false
  }
}
</script>
