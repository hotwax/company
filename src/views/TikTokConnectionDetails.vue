<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-back-button slot="start" default-href="/tiktok" />
        <ion-title>{{ shop?.shopName || translate("TikTok connection") }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-card>
        <ion-card-header>
          <ion-card-subtitle>{{ shop?.shopId }}</ion-card-subtitle>
          <ion-card-title>{{ shop?.shopName || shop?.shopId }}</ion-card-title>
        </ion-card-header>
        <ion-list lines="full">
          <ion-item>
            <ion-label>{{ translate("Region") }}</ion-label>
            <ion-label slot="end">{{ shop?.region || "-" }}</ion-label>
          </ion-item>
          <ion-item>
            <ion-label>{{ translate("Status") }}</ion-label>
            <ion-badge slot="end" :color="shop?.shopStatusId === 'TTSHOP_ACTIVE' ? 'success' : 'medium'">
              {{ shop?.shopStatusId === 'TTSHOP_ACTIVE' ? translate("Active") : translate("Disabled") }}
            </ion-badge>
          </ion-item>
          <ion-item>
            <ion-label>{{ translate("Token health") }}</ion-label>
            <ion-badge slot="end" :color="tokenHealthColor()">{{ tokenHealthLabel() }}</ion-badge>
          </ion-item>
          <ion-item>
            <ion-label>{{ translate("Product store") }}</ion-label>
            <ion-label slot="end">{{ shop?.productStoreName || shop?.productStoreId || "-" }}</ion-label>
          </ion-item>
        </ion-list>
      </ion-card>

      <ion-item v-if="shop && !shop.productStoreId" lines="none" color="warning">
        <ion-icon slot="start" :icon="alertCircleOutline" />
        <ion-label class="ion-text-wrap">
          {{ translate("No product store linked. Orders cannot import until one is set.") }}
        </ion-label>
      </ion-item>

      <ion-list lines="full">
        <ion-item button detail @click="goTo('settings')">
          <ion-icon slot="start" :icon="settingsOutline" />
          <ion-label>{{ translate("Settings") }}</ion-label>
        </ion-item>
        <ion-item button detail @click="goTo('shipping-providers')">
          <ion-icon slot="start" :icon="airplaneOutline" />
          <ion-label>{{ translate("Shipping providers") }}</ion-label>
        </ion-item>
      </ion-list>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonBackButton, IonBadge, IonCard, IonCardHeader, IonCardSubtitle, IonCardTitle, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonPage, IonTitle, IonToolbar, onIonViewWillEnter } from "@ionic/vue";
import { airplaneOutline, alertCircleOutline, settingsOutline } from "ionicons/icons";
import { translate } from '@common';
import router from "@/router";
import { computed } from "vue";
import { useTikTokStore } from '@/store/tiktok';

const props = defineProps<{ id: string }>()
const tiktokStore = useTikTokStore();
const shop = computed(() => tiktokStore.current)

onIonViewWillEnter(async () => {
  await tiktokStore.fetchTikTokShop(props.id)
})

function tokenHealthLabel() {
  const health = tiktokStore.getTokenHealth(shop.value)
  if (health === 'expired') return translate("Token expired")
  if (health === 'expiring') return translate("Token expiring soon")
  if (health === 'ok') return translate("Token OK")
  return translate("Token unknown")
}

function tokenHealthColor() {
  const health = tiktokStore.getTokenHealth(shop.value)
  if (health === 'expired') return 'danger'
  if (health === 'expiring') return 'warning'
  if (health === 'ok') return 'success'
  return 'medium'
}

function goTo(section: string) {
  router.push({ path: `/tiktok-connection-details/${props.id}/${section}` })
}
</script>
