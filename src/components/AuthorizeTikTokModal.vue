<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal()">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate("Authorize TikTok shops") }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <ion-list>
      <ion-item lines="none">
        <ion-label class="ion-text-wrap">
          <p>{{ translate("Authorize the seller in TikTok Partner Center, then paste the auth_code from the redirect URL here. Auth codes expire in 30 minutes and can only be used once.") }}</p>
        </ion-label>
      </ion-item>
      <ion-item>
        <ion-input v-model="authCode" :label="translate('Auth code')" label-placement="floating" />
      </ion-item>
    </ion-list>

    <ion-fab vertical="bottom" horizontal="end" slot="fixed">
      <ion-fab-button :disabled="!authCode.trim() || isAuthorizing" @click="authorize()">
        <ion-icon :icon="checkmarkDoneOutline" />
      </ion-fab-button>
    </ion-fab>
  </ion-content>
</template>

<script setup lang="ts">
import { IonButton, IonButtons, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonList, IonTitle, IonToolbar, modalController } from "@ionic/vue";
import { checkmarkDoneOutline, closeOutline } from "ionicons/icons";
import { ref } from "vue";
import { translate, commonUtil } from '@common';
import { useTikTokStore } from '@/store/tiktok';

const tiktokStore = useTikTokStore();
const authCode = ref("")
const isAuthorizing = ref(false)

function closeModal() {
  modalController.dismiss({})
}

async function authorize() {
  isAuthorizing.value = true
  try {
    const data = await tiktokStore.authorizeTikTok(authCode.value.trim())
    const count = data?.shopIds?.length ?? 0
    commonUtil.showToast(translate("Imported {count} TikTok shops", { count }))
    modalController.dismiss({ shopIds: data?.shopIds ?? [] })
  } catch (error) {
    commonUtil.showToast(translate("Authorization failed. Check that the auth code is fresh — codes expire in 30 minutes and can only be used once."))
  } finally {
    isAuthorizing.value = false
  }
}
</script>
