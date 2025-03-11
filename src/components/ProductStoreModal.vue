<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal()">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate("Product Store") }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <ion-item class="ion-margin-top">
      <ion-icon slot="start" :icon="informationCircleOutline" />
      <ion-label>
        {{ translate("Learn more about mapping product stores to subsidiaries") }}
      </ion-label>
      <ion-button fill="clear" size="small" color="medium" @click="openProductStoreDoc">
        <ion-icon :icon="openOutline" slot="icon-only" />
      </ion-button>
    </ion-item>

    <ion-item lines="full" class="ion-margin-top">
      <ion-select v-model="selectedProductStoreId" interface="popover" :label="translate('Product Store')" :placeholder="translate('Select')" @ionChange="updatedStoreSubsidiaryId">
        <ion-select-option v-for="store in productStores" :key="store" :value="store.productStoreId">
          {{ store.storeName ? store.storeName : store.productStoreId }}
        </ion-select-option>
      </ion-select>
    </ion-item>

    <ion-item lines="full">
      <ion-input v-model="subsidiaryId" :label="translate('Subsidiary')" :placeholder="translate('Usually 1')" />
    </ion-item>
    
    <ion-fab vertical="bottom" horizontal="end" slot="fixed">
      <ion-fab-button @click="updateSubsidiaryId" :disabled="isSaveButtonDisabled()"> 
        <ion-icon :icon="saveOutline" />
      </ion-fab-button>
    </ion-fab>
  </ion-content>
</template>

<script setup lang="ts">
import { IonButton, IonButtons, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonSelect, IonSelectOption, IonTitle, IonToolbar, modalController } from "@ionic/vue";
import { closeOutline, informationCircleOutline, openOutline, saveOutline } from 'ionicons/icons'
import { translate } from "@/i18n"
import { hasError, showToast } from "@/utils";
import { useStore } from "vuex";
import { computed, onMounted, ref } from "vue";
import { ProductStoreService } from "@/services/ProductStoreService";
import emitter from "@/event-bus";
import logger from "@/logger";

const store = useStore();

const productStores = computed(() => store.getters["productStore/getProductStores"])
const netSuiteProductStore = computed(() => store.getters["productStore/getNetSuiteProductStore"]);
const selectedProductStoreId = ref("");
const subsidiaryId = ref("")

onMounted(async () => {
  await store.dispatch("productStore/fetchProductStores", "productStoreModal");
  if(netSuiteProductStore.value) {
    selectedProductStoreId.value = netSuiteProductStore.value.productStoreId;
    subsidiaryId.value = netSuiteProductStore.value.subsidiaryId;
  }
})

function closeModal() {
  modalController.dismiss({ dismissed: true });
}

function isSaveButtonDisabled() {
  const initialProductStoreId = netSuiteProductStore.value?.productStoreId;
  const initialSubsidiaryId = netSuiteProductStore.value?.subsidiaryId;
  return !selectedProductStoreId.value || !subsidiaryId.value || (selectedProductStoreId.value === initialProductStoreId) && (subsidiaryId.value === initialSubsidiaryId);
}

async function updateSubsidiaryId() {
  const initialNetSuiteProductStore = netSuiteProductStore.value.productStoreId; // Store the initial value

  try {
    const updatedStore = {
      externalId: subsidiaryId.value,
      productStoreId: selectedProductStoreId.value
    };

    const resp = await ProductStoreService.updateProductStore(updatedStore);
    if(!hasError(resp)) {
      showToast(translate("Product store setting updated successfully"))   // We are updating the selected product store in the state
      await store.dispatch("productStore/updateSelectedProductStore", {
        productStoreId: selectedProductStoreId.value,
        subsidiaryId: subsidiaryId.value
      });
      // fetching the shopify shop for the selected product store
      if(!initialNetSuiteProductStore || initialNetSuiteProductStore !== selectedProductStoreId.value) {
        await store.dispatch("productStore/fetchProductStoreShopifyShops");
      }
    } else {
      throw resp.data;
    }
  } catch(error: any) {
    logger.error(error);
    showToast(translate("Failed to update product store settings"))
  }
  emitter.emit("dismissLoader")
  closeModal();
}

function updatedStoreSubsidiaryId() {
  const updatedProductStore = productStores.value.find((store: any) => store.productStoreId === selectedProductStoreId.value);
  subsidiaryId.value = updatedProductStore.externalId ? updatedProductStore.externalId : "";
}

function openProductStoreDoc() {
  window.open('https://docs.hotwax.co/documents/v/learn-netsuite/netsuite-deployment/prerequisites/productstoresettings', '_blank', 'noopener, noreferrer');
}
</script>