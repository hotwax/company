<template>
  <ion-page>
    <ShopifyConnectionFilters content-id="filter-content" />

    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-menu-button slot="start" />
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
  </ion-page>
</template>

<script setup lang="ts">
import { IonButton, IonButtons, IonChip, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonPage, IonSearchbar, IonTitle, IonToggle, IonToolbar, onIonViewWillEnter } from "@ionic/vue";
import { filterOutline, flashOutline, informationCircleOutline, openOutline, storefrontOutline } from "ionicons/icons";
import { translate } from "@/i18n";
import { useRouter } from "vue-router";
import { computed } from "vue";
import { useStore } from "vuex";

import ShopifyConnectionFilters from "@/components/ShopifyConnectionFilters.vue";

const router = useRouter();
const store = useStore();

const shops = computed(() => store.getters["shopify/getShops"])

onIonViewWillEnter(async () => {
  await store.dispatch("shopify/fetchShopifyShops")
})



function openShopifyConnectionDetails(shop: any) {
  store.dispatch("shopify/updateCurrentShop", shop)
  router.push({ path: `/shopify-connection-details/${shop.shopId}` })
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
