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
      <ion-icon :icon="openOutline" slot="end" />
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
  await store.dispatch("productStore/fetchProductStores");
  if (netSuiteProductStore.value) {
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

  try {
    const updatedStore = {
      externalId: subsidiaryId.value,
      productStoreId: selectedProductStoreId.value
    };

    const resp = await ProductStoreService.updateProductStore(updatedStore);
    if(!hasError(resp)) {
      showToast("Product store setting updated successfully.")
      await store.dispatch("productStore/fetchProductStores");
      // We are updating the selected product store in the state to retrieve the 
      // appropriate shipment methods based on the user's selection on Shipment methods page
      await store.dispatch("productStore/updateSelectedProductStore", {
        productStoreId: selectedProductStoreId.value,
        subsidiaryId: subsidiaryId.value
      });
    } else {
      throw resp.data;
    }
  } catch(error: any) {
    logger.error(error);
    showToast(translate("Failed to update product store settings."))
  }
  emitter.emit("dismissLoader")
  closeModal();
}

function updatedStoreSubsidiaryId() {
  const updatedProductStore = productStores.value.find((store: any) => store.productStoreId === selectedProductStoreId.value);
  subsidiaryId.value = updatedProductStore.externalId ? updatedProductStore.externalId : "";
}
</script>