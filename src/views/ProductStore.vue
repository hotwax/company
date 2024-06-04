<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-title>{{ translate("Product store") }}</ion-title>
        <ion-buttons slot="end">
          <ion-button slot="icon-only" @click="openGitbookSearch()">
            <ion-icon :icon="informationCircleOutline" />
          </ion-button>
        </ion-buttons>
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
import { IonButton, IonButtons, IonChip, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonPage, IonTitle, IonToolbar, modalController, onIonViewWillEnter } from "@ionic/vue";
import { addOutline, informationCircleOutline, openOutline, storefrontOutline } from "ionicons/icons";
import { translate } from "@/i18n";
import { useRouter } from "vue-router";
import { computed } from "vue";
import { useStore } from "vuex";
import { useAuthStore } from '@hotwax/dxp-components'
import GitBookSearch from "@/components/GitBookSearch.vue";

const store = useStore();
const router = useRouter();
const authStore = useAuthStore();

const productStores = computed(() => store.getters["productStore/getProductStores"])
const omsRedirectionInfo = computed(() => store.getters["user/getOmsRedirectionInfo"])

onIonViewWillEnter(async () => {
  await store.dispatch("productStore/fetchProductStores");
})

async function viewProductStoreDetails(productStoreId: string) {
  router.push({ path: `/product-store-details/${productStoreId}` })
}

function createStore() {
  router.push("/create-product-store")
}

function viewFacilities(productStoreId: string) {
  const facilitiesListUrl = `${process.env.VUE_APP_FACILITIES_LOGIN_URL}?oms=${omsRedirectionInfo.value.url}&token=${authStore.token.value}&expirationTime=${authStore.token.expiration}&productStoreId=${productStoreId}`
  window.open(facilitiesListUrl, "_blank")
}

async function openGitbookSearch() {
  const modal = await modalController.create({
    component: GitBookSearch
  })

  modal.present()
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