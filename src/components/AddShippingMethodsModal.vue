<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal">
          <ion-icon slot="icon-only" :icon="close" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate("Add shipping method") }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <ion-list>
      <ion-item lines="none">
        <ion-label>{{ translate("Shopify Shipping method") }}</ion-label>
        <ion-label slot="end">{{ "<shippingMethodName>" }}</ion-label>
      </ion-item>

      <ion-item-divider color="light">
        <ion-label>{{ translate("OMS Carrier and Shipping methods") }}</ion-label>
      </ion-item-divider>

      <ion-item>
        <ion-select :placeholder="translate('Select')" :label="translate('Carrier')" value="">
          <ion-select-option value="">{{ "<carrierName>" }}</ion-select-option>
        </ion-select>
      </ion-item>

      <ion-item>
        <ion-select :placeholder="translate('Select')" :label="translate('Shipping method')" value="">
          <ion-select-option value="">{{ "<carrierShippingMethod>" }}</ion-select-option>
        </ion-select>
      </ion-item>

      <ion-item lines="none">
        <ion-toggle>{{ translate("Ship without tracking ID") }}</ion-toggle>
      </ion-item>
    </ion-list>
  </ion-content>

  <ion-fab vertical="bottom" horizontal="end" slot="fixed">
    <ion-fab-button>
      <ion-icon :icon="saveOutline" />
    </ion-fab-button>
  </ion-fab>
</template>

<script setup lang="ts">
import { IonButton, IonButtons, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonItem, IonItemDivider, IonLabel, IonList, IonSelect, IonSelectOption, IonTitle, IonToggle, IonToolbar, modalController } from "@ionic/vue";
import { close, saveOutline } from "ionicons/icons";
import { translate } from "@/i18n";

function closeModal() {
  modalController.dismiss();
}
</script>

<style scoped>
ion-content {
  --padding-bottom: 80px;
}
</style>