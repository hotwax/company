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
      <ion-input v-model="customPrice" :disabled="isBasePriceSelected" label="Price level" placeholder="Base Price" />
    </ion-item>

    <ion-list>
      <ion-list-header>{{ translate("Frequently used") }}</ion-list-header>
      <ion-radio-group v-model="selectedPriceType">
        <ion-item>
          <ion-radio value="base" label-placement="end" justify="start" @click="selectBasePrice">
            <ion-label>
              {{ translate("Base leave") }}
              <p>{{ translate("Defaults to product price set in NetSuite") }}</p>
            </ion-label>  
          </ion-radio>
        </ion-item>
        <ion-item>
          <ion-radio value="custom" label-placement="end" justify="start" @click="selectCustomPrice">
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
import { IonButton, IonButtons, IonContent, IonFab, IonFabButton, IonHeader, IonListHeader, IonIcon, IonInput, IonItem, IonLabel, IonList, IonRadio, IonRadioGroup, IonTitle, IonToolbar, modalController } from "@ionic/vue";
import { closeOutline, informationCircleOutline, openOutline, saveOutline } from 'ionicons/icons'
import { translate } from '@hotwax/dxp-components';
import { computed, ref } from "vue";
 
const selectedPriceType = ref('');
const customPrice = ref('');

function closeModal() {
  modalController.dismiss({ dismissed: true });
}

const isBasePriceSelected = computed(() => selectedPriceType.value === "base");

function selectBasePrice() {
  selectedPriceType.value = "base";
}

function selectCustomPrice() {
  selectedPriceType.value = "custom";
}

function savePrice() {
  const payload = {
    priceType: selectedPriceType.value,
    customPrice: selectedPriceType.value === "custom" ? customPrice.value : '',
  };

  closeModal();
}
</script>