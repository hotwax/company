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
      <ion-select v-model="selectedProductStore" interface="popover" :label="translate('Product Store')" :placeholder="translate('Select')" @ionChange="updatedStoreSubsidiaryId">
        <ion-select-option v-for="store in productStores" :key="store" :value="store.productStoreId">
          {{ store.storeName ? store.storeName : store.productStoreId }}
        </ion-select-option>
      </ion-select>
    </ion-item>

    <ion-item lines="full">
      <ion-input  v-model="subsidiaryId" :label="translate('Subsidiary')" :placeholder="translate('Usually 1')" />
    </ion-item>
    
    <ion-fab vertical="bottom" horizontal="end" slot="fixed">
      <ion-fab-button @click="updateSubsidiaryId"> 
        <ion-icon :icon="saveOutline" />
      </ion-fab-button>
    </ion-fab>
  </ion-content>
</template>

<script setup lang="ts">
import { IonButton, IonButtons, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonSelect, IonSelectOption, IonTitle, IonToolbar, onIonViewWillEnter, modalController } from "@ionic/vue";
import { closeOutline, informationCircleOutline, openOutline, saveOutline } from 'ionicons/icons'
import { translate } from "@/i18n"
import { hasError, showToast } from "@/utils";
import { useStore } from "vuex";
import { computed, ref } from "vue";
import { ProductStoreService } from "@/services/ProductStoreService";
import emitter from "@/event-bus";
import logger from "@/logger";

 
const store = useStore();

const productStores = computed(() => store.getters["productStore/getProductStores"])
const selectedProductStore = ref("");
const subsidiaryId = ref("")

onIonViewWillEnter(async () => {
  await store.dispatch("productStore/fetchProductStores");
})

function closeModal() {
  modalController.dismiss({ dismissed: true });
}

async function updateSubsidiaryId() {

  try {
    const updatedStore = {
      externalId: subsidiaryId.value,
      productStoreId: selectedProductStore.value
    };

    const resp = await ProductStoreService.updateProductStore(updatedStore);
    if(!hasError(resp)) {
      showToast("Product store setting updated successfully.")
      await store.dispatch("productStore/fetchProductStores");
      await store.dispatch("productStore/updateSelectedProductStore", selectedProductStore.value);
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
  const updatedProductStore = productStores.value.find((store: any) => store.productStoreId === selectedProductStore.value);
  subsidiaryId.value = updatedProductStore.externalId ? updatedProductStore.externalId : "";
}
</script>