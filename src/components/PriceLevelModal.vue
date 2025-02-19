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
      <ion-icon :icon="openOutline" slot="end" @click="openPriceLevelDoc"/>
    </ion-item>

    <ion-item lines="full" class="ion-margin-top">
      <ion-input v-model="selectedPriceLevel" :label="translate('Price level')" :placeholder="translate('Base Price')"/>
    </ion-item>

    <ion-list>
      <ion-list-header>{{ translate("Frequently used") }}</ion-list-header>
      <ion-radio-group v-model="selectedPriceLevel">
        <ion-item>
          <ion-radio value="Base" label-placement="end" justify="start">
            <ion-label>
              {{ translate("Base Price") }}
              <p>{{ translate("Defaults to product price set in NetSuite") }}</p>
            </ion-label>  
          </ion-radio>
        </ion-item>
        <ion-item>
          <ion-radio value="Custom" label-placement="end" justify="start">
            <ion-label>
              {{ translate("Custom") }}
              <p>{{ translate("Use the price a product was sold at in the order.") }}</p>
            </ion-label>  
          </ion-radio>
        </ion-item>
      </ion-radio-group>
    </ion-list>
   
    <ion-fab vertical="bottom" horizontal="end" slot="fixed">
      <ion-fab-button :disabled="isPriceLevelChanged()" @click="savePrice">
        <ion-icon :icon="saveOutline" />
      </ion-fab-button>
    </ion-fab>
  </ion-content>
</template>

<script setup lang="ts">
import { IonButton, IonButtons, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonList, IonListHeader, IonRadio, IonRadioGroup, IonTitle, IonToolbar, modalController } from "@ionic/vue";
import { closeOutline, informationCircleOutline, openOutline, saveOutline } from 'ionicons/icons';
import { translate } from "@/i18n"
import { useStore } from "vuex"
import { ref, onMounted } from "vue"
import { useNetSuiteComposables } from "@/composables/useNetSuiteComposables";

const store = useStore();
const priceLevelTypeId = JSON.parse(process.env.VUE_APP_NETSUITE_INTEGRATION_TYPE_MAPPING)?.PRICE_LEVEL_TYPE_ID
const { updateNetSuiteId } = useNetSuiteComposables(priceLevelTypeId);

const integrationMapping = ref("") as any;
const selectedPriceLevel = ref("")

onMounted(async () => {
  await store.dispatch("netSuite/fetchIntegrationTypeMappings", { 
    integrationTypeId: priceLevelTypeId,
    mappingKey: "PRICE_LEVEL"
  })
  const integrationMappings = store.getters["netSuite/getIntegrationTypeMappings"](priceLevelTypeId);
  selectedPriceLevel.value = (integrationMapping.value = integrationMappings[0]).mappingValue || "";
})

function isPriceLevelChanged() {
  return (!selectedPriceLevel.value.trim() || selectedPriceLevel.value.trim() === integrationMapping.value.mappingValue)
}

// saves the selectedPriceLevel price level to Netsuite for integration type id: 'NETSUITE_PRICE_LEVEL' & mappingKey: 'PRICE_LEVEL'.
async function savePrice() {
  const payload = {
    integrationTypeId: priceLevelTypeId,
    mappingKey: "PRICE_LEVEL",
    mappingValue: selectedPriceLevel.value
  };
  await updateNetSuiteId(payload, integrationMapping.value.integrationMappingId);
  closeModal();
}

function closeModal() {
  modalController.dismiss({ dismissed: true });
}

function openPriceLevelDoc() {
  window.open('https://docs.hotwax.co/documents/v/learn-netsuite/synchronization-flows/integration-mappings/price-levels', '_blank');
}
</script>