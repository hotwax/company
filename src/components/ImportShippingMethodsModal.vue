<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal">
          <ion-icon slot="icon-only" :icon="close" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate("Import facility") }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <ion-searchbar :placeholder="translate('Search shipping method')"/>

    <ion-item-divider color="light">
      <ion-label>{{ translate("Select all") }}</ion-label>
      <ion-checkbox />
    </ion-item-divider>

    <ion-list>
      <ion-item>
        <ion-checkbox>{{ "<shopifyShippingMethodName>" }}</ion-checkbox>
      </ion-item>
      <ion-item>
        <ion-checkbox>{{ "<shopifyShippingMethodName>" }}</ion-checkbox>
      </ion-item>
    </ion-list>
  </ion-content>

  <ion-fab vertical="bottom" horizontal="end" slot="fixed">
    <ion-fab-button>
      <ion-icon :icon="downloadOutline" />
    </ion-fab-button>
  </ion-fab>
</template>

<script setup lang="ts">
import { IonButton, IonButtons, IonCheckbox, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonItem, IonItemDivider, IonLabel, IonList, IonSearchbar, IonTitle, IonToolbar, modalController } from "@ionic/vue";
import { close, downloadOutline } from "ionicons/icons";
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