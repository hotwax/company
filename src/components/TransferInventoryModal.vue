<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal()">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate('Transfer Inventory') }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content>

    <ion-item class="ion-margin-top">
      <ion-icon slot="start" :icon="informationCircleOutline"></ion-icon>
      <ion-label>
        Learn more about creating inventory transfers from inventory variances
      </ion-label>
      <ion-icon :icon="openOutline" slot="end"></ion-icon>
    </ion-item>

    <ion-item>
      <ion-icon slot="start" :icon="businessOutline"></ion-icon>
      <ion-label>
        Facility wise inventory transfer
        <p>If each facility has its own dedicated inventory transfer location for this variance, configure the transfer location from the facility configuration section</p>
      </ion-label>
    </ion-item>

    <ion-item lines="full" class="ion-margin-top">
      <ion-input label="Transfer location" placeholder="NetSuite facility ID"></ion-input>
    </ion-item>
    <!-- TODO: need to add left margin on the ion-label -->
    <ion-label class="ion-margin-start">
      <p>Variance Enum ID</p>
    </ion-label>

    <ion-fab vertical="bottom" horizontal="end" slot="fixed">
      <ion-fab-button>
        <ion-icon :icon="saveOutline" />
      </ion-fab-button>
    </ion-fab>

  </ion-content>
</template>
<script setup lang="ts">
import { IonButton, IonContent, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonTitle, IonToolbar, modalController } from "@ionic/vue";
import { businessOutline, closeOutline, informationCircleOutline, openOutline, saveOutline } from 'ionicons/icons'
import { translate } from '@hotwax/dxp-components';
 
function closeModal() {
  modalController.dismiss({ dismissed: true });
}
</script>