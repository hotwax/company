<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal()">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate('Discounts') }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content>

    <ion-item class="ion-margin-top">
      <ion-icon slot="start" :icon="informationCircleOutline"></ion-icon>
      <ion-label>
        Learn more about discounts in NetSuite
      </ion-label>
      <ion-icon :icon="openOutline" slot="end"></ion-icon>
    </ion-item>

    <ion-item lines="full" class="ion-margin-top">
      <ion-input label="Order level discount" placeholder="NetSuite discount item ID"></ion-input>
    </ion-item>

    <ion-item lines="full">
      <ion-input label="Item level discounts" placeholder="NetSuite discount item ID"></ion-input>
    </ion-item>

    <ion-fab vertical="bottom" horizontal="end" slot="fixed">
      <ion-fab-button>
        <ion-icon :icon="saveOutline" />
      </ion-fab-button>
    </ion-fab>

  </ion-content>
</template>
<script setup lang="ts">
import { IonButton, IonContent, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonTitle, IonToolbar, modalController } from "@ionic/vue";
import { closeOutline, informationCircleOutline, openOutline, saveOutline } from 'ionicons/icons'
import { translate } from '@hotwax/dxp-components';
 
function closeModal() {
  modalController.dismiss({ dismissed: true });
}
</script>