<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-back-button default-href="/tabs/product-store" slot="start"></ion-back-button>
        <ion-title>{{ translate("Add configurations") }}</ion-title>
        <ion-buttons slot="end">
          <ion-button slot="icon-only">
            <ion-icon :icon="informationCircleOutline" />
          </ion-button>
        </ion-buttons>
        <ion-progress-bar value="0.75" />
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <main>
        <h1 class="ion-margin-start">{{ translate('Configurations') }}</h1>

        <ion-list>
          <ion-list-header>
            <ion-label>{{ translate("Product") }}</ion-label>
          </ion-list-header>

          <ion-item>
            <ion-icon slot="start" :icon="shirtOutline"/>
            <ion-select interface="popover" :label="translate('Product Identifier')" v-model="formData.productIdentifierEnumId">
              <ion-select-option v-for="identifier in productIdentifiers" :key="identifier.enumId" :value="identifier.enumId">{{ identifier.description || identifier.enumId }}</ion-select-option>
            </ion-select>
          </ion-item>

          <ion-list-header>
            <ion-label>{{ translate("Order") }}</ion-label>
          </ion-list-header>

          <ion-item>
            <ion-toggle v-model="formData.autoApproveOrder">{{ translate("Auto approve orders") }}</ion-toggle>
          </ion-item>
          <ion-item lines="none">
            <ion-input v-model="formData.orderNumberPrefix" label-placement="floating" :label="translate('Sales order ID prefix')" :helper-text="translate('Add a custom prefix to HotWax order IDs: <inputValue>10001')" />
          </ion-item>
        </ion-list>

        <ion-button class="ion-margin-top" @click="setupProductStore()">
          {{ translate("Setup product store") }}
          <ion-icon slot="end" :icon="arrowForwardOutline"/>
        </ion-button>
      </main>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonList, IonListHeader, IonPage, IonProgressBar, IonSelect, IonSelectOption, IonTitle, IonToggle, IonToolbar, onIonViewWillEnter } from "@ionic/vue";
import { arrowForwardOutline, informationCircleOutline, shirtOutline } from "ionicons/icons";
import { translate } from "@/i18n";
import { useRouter } from "vue-router";
import logger from "@/logger";
import { ProductStoreService } from "@/services/ProductStoreService";
import { computed, defineProps, ref } from "vue";
import { hasError, showToast } from "@/utils";
import { useStore } from "vuex";
import emitter from "@/event-bus";

const store = useStore();
const router = useRouter();

const props = defineProps(["productStoreId"]);

const productStore = ref({}) as any;
const formData = ref({
  autoApproveOrder: false,
  orderNumberPrefix: "",
  productIdentifierEnumId: "SHOPIFY_PRODUCT_SKU"
})

const productIdentifiers = computed(() => store.getters["util/getProductIdentifiers"])

onIonViewWillEnter(() => {
  store.dispatch("util/fetchProductIdentifiers");
  fetchProductStore();
})

async function fetchProductStore() {
  try {
    const resp = await ProductStoreService.fetchProductStoreDetails(props.productStoreId)
    if(!hasError(resp)) {
      productStore.value = resp.data;
    } else {
      throw resp.data;
    }
  } catch(error: any) {
    logger.error("Failed to fetch product store details.")
  }
}

async function setupProductStore() {
  emitter.emit("presentLoader");

  try {
    const payload = {
      ...productStore.value,
      orderNumberPrefix: formData.value.orderNumberPrefix,
      autoApproveOrder: formData.value.autoApproveOrder ? "Y" : "N",
      productIdentifierEnumId: formData.value.productIdentifierEnumId
    }

    const resp = await ProductStoreService.updateProductStore(payload);
    if(!hasError(resp)) {
      showToast(translate("Product store configurations updated successfully."))
      emitter.emit("dismissLoader");
      router.replace(`/product-store-details/${productStore.value.productStoreId}`);
    } else {
      throw resp.data;
    }
  } catch(error: any) {
    logger.error(error)
    showToast(translate("Failed to add configurations to the product store."))
  }

  emitter.emit("dismissLoader");
}
</script>

<style scoped>
  @media (min-width: 700px) {
    main {
      max-width: 375px;
      margin: auto;
    }
  }
</style>