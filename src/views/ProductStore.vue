<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-menu-button slot="start" />
        <ion-title>{{ translate("Product store") }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <main>
        <div class="list-item" v-for="store in productStores" :key="store.productStoreId" @click="viewProductStoreDetails(store.productStoreId)">
          <ion-item lines="none">
            <ion-icon slot="start" :icon="storefrontOutline" />
            <ion-label class="ion-text-wrap">
              <p class="overline">{{ store.productStoreId }}</p>
              {{ store.storeName ? store.storeName : store.productStoreId }}
            </ion-label>
          </ion-item>

          <div class="tablet" @click.stop="">
            <ion-chip outline @click.stop="viewFacilities(store.productStoreId)" :disabled="!store.facilityCount">
              <ion-label>{{ translate(store.facilityCount > 1 ? "facilities" : "facility", { count: store.facilityCount }) }}</ion-label>
              <ion-icon :icon="openOutline" color="primary"/>
            </ion-chip>
          </div>

          <div class="tablet" @click.stop="">
            <ion-chip outline>
              <ion-label>{{ translate(store.shipmentMethodCount > 1 ? "shipping methods" : "shipping method", { count: store.shipmentMethodCount }) }}</ion-label>
            </ion-chip>
          </div>
        </div>

        <div class="ion-text-center ion-margin">
          <ion-button fill="outline" @click="createStore()">
            <ion-icon slot="start" :icon="addOutline"/>
            {{ translate("Create new product store") }}
          </ion-button>
        </div>
      </main>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonButton, IonChip, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonPage, IonMenuButton, IonTitle, IonToolbar, onIonViewWillEnter } from "@ionic/vue";
import { addOutline, openOutline, storefrontOutline } from "ionicons/icons";
import { translate } from '@common';
import { useRouter } from "vue-router";
import { computed } from "vue";
import { useProductStoreStore } from '@/store/productStore';
import { useAuth } from '@common/composables/useAuth'

const productStoreStore = useProductStoreStore();
const router = useRouter();
const { isAuthenticated } = useAuth();

const productStores = computed(() => productStoreStore.productStores)


onIonViewWillEnter(async () => {
  await productStoreStore.fetchProductStores({ fetchCounts: true });
})

async function viewProductStoreDetails(productStoreId: string) {
  router.push({ path: `/product-store-details/${productStoreId}` })
}

function createStore() {
  router.push("/create-product-store")
}

function viewFacilities(productStoreId: string) {
  const { token } = useAuth();
  const facilitiesListUrl = `${import.meta.env.VITE_FACILITIES_LOGIN_URL}?productStoreId=${productStoreId}`
  window.open(facilitiesListUrl, "_blank")
}
</script>

<style scoped>
.list-item {
  --columns-desktop: 4;
  border-bottom: var(--border-medium);
}

.list-item > ion-item {
  width: 100%
}

main {
  margin: var(--spacer-lg);
}

ion-content {
  --padding-bottom: 80px;
}
</style>