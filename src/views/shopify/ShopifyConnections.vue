<template>
  <ion-page>
    <ShopifyConnectionFilters content-id="filter-content" />

    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-menu-button slot="start" menu="company-menu" />
        <ion-title>{{ translate("Shopify connections") }}</ion-title>
        <ion-buttons slot="end">
          <ion-button slot="icon-only">
            <ion-icon :icon="informationCircleOutline" />
          </ion-button>
          <ion-menu-button menu="end" class="mobile-only">
            <ion-icon :icon="filterOutline" />
          </ion-menu-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content id="filter-content">
      <div>
        <aside class="filters">
          <ion-searchbar :placeholder="translate('Search keys')" />
          <ion-list>
            <ion-item lines="none">
              <ion-icon :icon="flashOutline" slot="start" />
              <ion-toggle>{{ translate("Show active shops") }}</ion-toggle>
            </ion-item>
          </ion-list>
        </aside>

        <main>
          <div class="list-item" v-for="shop in shops" :key="shop.shopId" @click="openShopifyConnectionDetails(shop)">
            <ion-item lines="none">
              <ion-icon slot="start" :icon="storefrontOutline" />
              <ion-label class="ion-text-wrap">
                <p class="overline">{{ shop.shopId }}</p>
                {{ shop.name }}
              </ion-label>
            </ion-item>

            <div class="tablet" @click.stop="">
              <ion-chip outline :href="'https://' + shop.myshopifyDomain + '/admin'" target="_blank">
                <ion-label>{{ translate("Shopify link") }}</ion-label>
                <ion-icon :icon="openOutline" color="primary" />
              </ion-chip>
            </div>

            <div class="tablet">
              <ion-label class="ion-text-center">
                {{ shop.productStoreId }}
                <p>{{ translate("Product store") }}</p>
              </ion-label>
            </div>

            <div></div>

          </div>
        </main>
      </div>
    </ion-content>

    <ion-fab slot="fixed" vertical="bottom" horizontal="end">
      <ion-fab-button @click="openCreateModal()">
        <ion-icon :icon="addOutline" />
      </ion-fab-button>
    </ion-fab>
  </ion-page>
</template>

<script setup lang="ts">
import { IonButton, IonButtons, IonChip, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonPage, IonSearchbar, IonTitle, IonToggle, IonToolbar, modalController, onIonViewWillEnter } from "@ionic/vue";
import { addOutline, filterOutline, flashOutline, informationCircleOutline, openOutline, storefrontOutline } from "ionicons/icons";
import { translate } from '@common';
import router from "@/router";
import { computed } from "vue";
import { useShopifyStore } from '@/store/shopify';

import ShopifyConnectionFilters from "@/components/shopify/ShopifyConnectionFilters.vue";
import CreateShopifyConnectionModal from "@/components/shopify/CreateShopifyConnectionModal.vue";

const shopifyStore = useShopifyStore();

const shops = computed(() => shopifyStore.shops)

onIonViewWillEnter(async () => {
  await shopifyStore.fetchShopifyShops()
})



function openShopifyConnectionDetails(shop: any) {
  shopifyStore.updateCurrentShop(shop)
  router.push({ path: `/shopify-connection-details/${shop.shopId}` })
}

async function openCreateModal() {
  const modal = await modalController.create({
    component: CreateShopifyConnectionModal
  })
  await modal.present()
  const { data } = await modal.onWillDismiss()
  if (data?.shopId) {
    const newShop = shopifyStore.getShopById(data.shopId)
    if (newShop) shopifyStore.updateCurrentShop(newShop)
    router.push({ path: `/shopify-connection-details/${data.shopId}` })
  }
}
</script>

<style scoped>

.filters {
  display: flex;
  gap: var(--spacer-xs);
}

.filters > * {
  flex: 1;
}

.list-item {
  --columns-desktop: 4;
  border-bottom: var(--border-medium);
}

.list-item > ion-item {
  width: 100%;
}
</style>
