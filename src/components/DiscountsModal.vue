<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal()">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate("Discounts") }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <ion-item class="ion-margin-top">
      <ion-icon slot="start" :icon="informationCircleOutline" />
      <ion-label>
        {{ translate("Learn more about discounts in NetSuite") }}
      </ion-label>
      <ion-icon :icon="openOutline" slot="end" />
    </ion-item>

    <ion-item lines="full" class="ion-margin-top">
      <ion-input v-model="orderLevelDiscount" label="Order level discount" placeholder="NetSuite discount item ID" />
    </ion-item>

    <ion-item lines="full">
      <ion-input v-model="itemLevelDiscount" label="Item level discounts" placeholder="NetSuite discount item ID" />
    </ion-item>

    <ion-fab vertical="bottom" horizontal="end" slot="fixed">
      <ion-fab-button @click="saveDiscountItemIds">
        <ion-icon :icon="saveOutline" />
      </ion-fab-button>
    </ion-fab>
  </ion-content>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { IonButton, IonButtons, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonTitle, IonToolbar, modalController } from "@ionic/vue";
import { closeOutline, informationCircleOutline, openOutline, saveOutline } from 'ionicons/icons';
import { translate } from '@hotwax/dxp-components';

const orderLevelDiscount = ref('');
const itemLevelDiscount = ref('');

function closeModal() {
  modalController.dismiss({ dismissed: true });
}

function saveDiscountItemIds() {
  const payload = {
    orderLevelDiscount: orderLevelDiscount.value,
    itemLevelDiscount: itemLevelDiscount.value,
  };
  
  closeModal();
}
</script>