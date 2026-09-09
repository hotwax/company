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
        <template v-if="!hydrated">
          <div class="list-item" v-for="n in 3" :key="`sk-${n}`">
            <ion-item lines="none"><ion-label><ion-skeleton-text animated style="width: 55%" /></ion-label></ion-item>
          </div>
        </template>
        <div class="list-item" v-for="store in productStores" :key="store.productStoreId" @click="viewProductStoreDetails(store.productStoreId)">
          <ion-item lines="none">
            <ion-icon slot="start" :icon="storefrontOutline" />
            <ion-label class="ion-text-wrap">
              <p class="overline">{{ store.productStoreId }}</p>
              {{ store.storeName ? store.storeName : store.productStoreId }}
            </ion-label>
          </ion-item>

          <div class="tablet" @click.stop="">
            <ion-chip outline @click.stop="viewFacilities(store.productStoreId)" :disabled="store.facilityCount == null">
              <ion-label>{{ translate((store.facilityCount ?? 0) === 1 ? "facility" : "facilities", { count: store.facilityCount ?? 0 }) }}</ion-label>
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
          <ion-button fill="outline" @click="cloneStoreSettings()">
            <ion-icon slot="start" :icon="copyOutline"/>
            {{ translate("Clone store settings") }}
          </ion-button>
        </div>
      </main>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { commonUtil, translate } from "@common";
import { IonButton, IonChip, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonMenuButton, IonPage, IonSkeletonText, IonTitle, IonToolbar } from "@ionic/vue";
import { addOutline, copyOutline, openOutline, storefrontOutline } from "ionicons/icons";
import { useProductStoreOnboardingWizard } from "@/composables/useProductStoreOnboardingWizard";
import { useProductStores } from "@/composables/useProductStores";
import router from "@/router";

const onboardingWizard = useProductStoreOnboardingWizard();

// No store: the list (with its shipment-method counts folded in) comes from the cache.
const { productStores, hydrated } = useProductStores();


function viewProductStoreDetails(productStoreId: string) {
  router.push({ path: `/product-store-details/${productStoreId}` })
}

function createStore() {
  onboardingWizard.startNewSetup()
  router.push("/product-store-onboarding")
}

function cloneStoreSettings() {
  router.push("/clone-product-store")
}

function viewFacilities(productStoreId: string) {
  router.push(`/facilities/find?productStoreId=${productStoreId}`)
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
