<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-menu-button slot="start" />
        <ion-title>{{ translate("TikTok connections") }}</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="openAppCredentialsModal()">
            <ion-icon slot="icon-only" :icon="keyOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-item lines="full">
        <ion-icon slot="start" :icon="tiktokStore.isAppConfigured ? checkmarkCircleOutline : alertCircleOutline"
          :color="tiktokStore.isAppConfigured ? 'success' : 'warning'" />
        <ion-label>
          {{ tiktokStore.isAppConfigured ? translate("App configured") : translate("App not configured") }}
          <p v-if="!tiktokStore.isAppConfigured">{{ translate("Set app credentials before authorizing shops") }}</p>
        </ion-label>
      </ion-item>

      <main>
        <div class="list-item" v-for="shop in shops" :key="shop.shopId" @click="openConnectionDetails(shop)">
          <ion-item lines="none">
            <ion-icon slot="start" :icon="storefrontOutline" />
            <ion-label class="ion-text-wrap">
              <p class="overline">{{ shop.shopId }}</p>
              {{ shop.shopName || shop.shopId }}
              <p>{{ shop.region }}</p>
            </ion-label>
          </ion-item>

          <div class="tablet">
            <ion-label class="ion-text-center">
              {{ shop.productStoreName || shop.productStoreId || "-" }}
              <p>{{ translate("Product store") }}</p>
            </ion-label>
          </div>

          <div class="tablet">
            <ion-badge :color="shop.shopStatusId === 'TTSHOP_ACTIVE' ? 'success' : 'medium'">
              {{ shop.shopStatusId === 'TTSHOP_ACTIVE' ? translate("Active") : translate("Disabled") }}
            </ion-badge>
          </div>

          <div class="tablet">
            <ion-badge :color="tokenHealthColor(shop)">{{ tokenHealthLabel(shop) }}</ion-badge>
          </div>
        </div>
      </main>
    </ion-content>

    <ion-fab slot="fixed" vertical="bottom" horizontal="end">
      <ion-fab-button :disabled="!tiktokStore.isAppConfigured" @click="openAuthorizeModal()">
        <ion-icon :icon="addOutline" />
      </ion-fab-button>
    </ion-fab>
  </ion-page>
</template>

<script setup lang="ts">
import { IonBadge, IonButton, IonButtons, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonItem, IonLabel, IonMenuButton, IonPage, IonTitle, IonToolbar, modalController, onIonViewWillEnter } from "@ionic/vue";
import { addOutline, alertCircleOutline, checkmarkCircleOutline, keyOutline, storefrontOutline } from "ionicons/icons";
import { translate } from '@common';
import router from "@/router";
import { computed } from "vue";
import { useTikTokStore } from '@/store/tiktok';

import TikTokAppCredentialsModal from "@/components/TikTokAppCredentialsModal.vue";
import AuthorizeTikTokModal from "@/components/AuthorizeTikTokModal.vue";

const tiktokStore = useTikTokStore();
const shops = computed(() => tiktokStore.shops)

onIonViewWillEnter(async () => {
  await Promise.all([tiktokStore.fetchAppCredentials(), tiktokStore.fetchTikTokShops()])
})

function tokenHealthLabel(shop: any) {
  const health = tiktokStore.getTokenHealth(shop)
  if (health === 'expired') return translate("Token expired")
  if (health === 'expiring') return translate("Token expiring soon")
  if (health === 'ok') return translate("Token OK")
  return translate("Token unknown")
}

function tokenHealthColor(shop: any) {
  const health = tiktokStore.getTokenHealth(shop)
  if (health === 'expired') return 'danger'
  if (health === 'expiring') return 'warning'
  if (health === 'ok') return 'success'
  return 'medium'
}

function openConnectionDetails(shop: any) {
  tiktokStore.updateCurrentShop(shop)
  router.push({ path: `/tiktok-connection-details/${shop.shopId}` })
}

async function openAppCredentialsModal() {
  const modal = await modalController.create({ component: TikTokAppCredentialsModal })
  await modal.present()
  await modal.onWillDismiss()
}

async function openAuthorizeModal() {
  const modal = await modalController.create({ component: AuthorizeTikTokModal })
  await modal.present()
  const { data } = await modal.onWillDismiss()
  if (data?.shopIds?.length) {
    await tiktokStore.fetchTikTokShops()
  }
}
</script>

<style scoped>
.list-item {
  --columns-desktop: 4;
  border-bottom: var(--border-medium);
}

.list-item > ion-item {
  width: 100%;
}
</style>
