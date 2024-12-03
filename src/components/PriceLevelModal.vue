<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal()">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate("Price level") }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <ion-item class="ion-margin-top">
      <ion-icon slot="start" :icon="informationCircleOutline" />
      <ion-label>
        {{ translate("Learn more about price levels in NetSuite") }}
      </ion-label>
      <ion-icon :icon="openOutline" slot="end" />
    </ion-item>

    <ion-item lines="full" class="ion-margin-top">
      <ion-input v-model="inputPrice" :label="translate('Price level')" :placeholder="translate('Base Price')" @click="clearSelection" />
    </ion-item>

    <ion-list>
      <ion-list-header>{{ translate("Frequently used") }}</ion-list-header>
      <ion-radio-group v-model="selectedPriceType" @ionChange="onPriceTypeChange">
        <ion-item>
          <ion-radio value="base" label-placement="end" justify="start">
            <ion-label>
              {{ translate("Base leave") }}
              <p>{{ translate("Defaults to product price set in NetSuite") }}</p>
            </ion-label>  
          </ion-radio>
        </ion-item>
        <ion-item>
          <ion-radio value="custom" label-placement="end" justify="start">
            <ion-label>
              {{ translate("Custom") }}
              <p>{{ translate("Use the price a product was sold at in the order.") }}</p>
            </ion-label>  
          </ion-radio>
        </ion-item>
      </ion-radio-group>
    </ion-list>
   
    <ion-fab vertical="bottom" horizontal="end" slot="fixed">
      <ion-fab-button @click="savePrice">
        <ion-icon :icon="saveOutline" />
      </ion-fab-button>
    </ion-fab>
  </ion-content>
</template>

<script setup lang="ts">
import { IonButton, IonButtons, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonList, IonListHeader, IonRadio, IonRadioGroup, IonTitle, IonToolbar, modalController } from "@ionic/vue";
import { closeOutline, informationCircleOutline, openOutline, saveOutline } from 'ionicons/icons';
import { translate } from '@hotwax/dxp-components';
import { ref, computed } from "vue";
import { useNetSuiteComposables } from "@/composables/useNetSuiteComposables";

const { addNetSuiteId } = useNetSuiteComposables("NETSUITE_PRICE_LEVEL");

const selectedPriceType = ref("");
const inputPrice = ref("");
const mappingValue = computed(() => {
  return inputPrice.value || selectedPriceType.value;
});

// Clear the selection when the input is clicked
function clearSelection() {
  selectedPriceType.value = "";
}

function onPriceTypeChange(event: any) {
  selectedPriceType.value = event.detail.value;
}

// saves the selected price level to Netsuite for integration type id: 'NETSUITE_PRICE_LEVEL' & mappingKey: 'PRICE_LEVEL'.
async function savePrice() {
  const payload = {
    integrationTypeId: "NETSUITE_PRICE_LEVEL",
    mappingKey: "PRICE_LEVEL",
    mappingValue: mappingValue.value
  };
  await addNetSuiteId(payload);
  closeModal();
}

function closeModal() {
  modalController.dismiss({ dismissed: true });
}
</script>