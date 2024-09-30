<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal()">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate('Price level') }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <ion-item class="ion-margin-top">
      <ion-icon slot="start" :icon="informationCircleOutline" />
      <ion-label>
        Learn more about price levels in NetSuite
      </ion-label>
      <ion-icon :icon="openOutline" slot="end" />
    </ion-item>

    <ion-item lines="full" class="ion-margin-top">
      <ion-input label="Price level" placeholder="Base Price" />
    </ion-item>

    <ion-list>
      <ion-list-header>Frequently used</ion-list-header>
      <ion-radio-group>
        <ion-item>
          <ion-radio label-placement="end" justify="start">
            <ion-label>
              Base leave
              <p>Defaults to product price set in NetSuite</p>
            </ion-label>  
          </ion-radio>
        </ion-item>
        <ion-item>
          <ion-radio label-placement="end" justify="start">
            <ion-label>
              Custom
              <p>Use the price a product was sold at in the order.</p>
            </ion-label>  
          </ion-radio>
        </ion-item>
      </ion-radio-group>
    </ion-list>
   
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