<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal()">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate('SFTP') }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <ion-item class="ion-margin-top">
      <ion-icon slot="start" :icon="informationCircleOutline" />
      <ion-label>
        Learn more about NetSuite SFTP configuration.
      </ion-label>
      <ion-icon :icon="openOutline" slot="end" />
    </ion-item>
    
    <ion-item lines="full" class="ion-margin-top">
      <ion-input label="GUID" placeholder="Unique SFTP identifier" />
    </ion-item>
    <ion-item lines="full">
      <ion-input label="SERVER" placeholder="Address or domain of the SFTP server" />
    </ion-item>
    <ion-item lines="full">
      <ion-input label="USER ID" placeholder="SFTP username" />
    </ion-item>
    <ion-item lines="full">
      <ion-input label="PORT" placeholder="Default is 22" />
    </ion-item>
    <ion-item lines="full">
      <ion-input label="HOST KEY" placeholder="Authentication key" />
    </ion-item>
    <ion-item lines="full">
      <ion-input label="DEFAULT DIRECTORY" placeholder="/home/-sftp/netsuite/" />
    </ion-item>
    <ion-fab vertical="bottom" horizontal="end" slot="fixed">
      <ion-fab-button>
        <ion-icon :icon="saveOutline" />
      </ion-fab-button>
    </ion-fab>
  </ion-content>
</template>
<script setup lang="ts">
import { IonButton, IonButtons, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonTitle, IonToolbar, modalController } from "@ionic/vue";
import { closeOutline, informationCircleOutline, openOutline, saveOutline } from 'ionicons/icons'
import { translate } from '@hotwax/dxp-components';
 
function closeModal() {
  modalController.dismiss({ dismissed: true });
}
</script>