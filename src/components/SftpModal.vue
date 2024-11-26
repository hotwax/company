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
        {{ translate("Learn more about NetSuite SFTP configuration.") }}
      </ion-label>
      <ion-icon :icon="openOutline" slot="end" />
    </ion-item>
    
    <ion-item lines="full" class="ion-margin-top">
      <ion-input v-model="sftpFormData.guid" label="GUID" placeholder="Unique SFTP identifier" />
    </ion-item>
    <ion-item lines="full">
      <ion-input v-model="sftpFormData.server" label="SERVER" placeholder="Address or domain of the SFTP server" />
    </ion-item>
    <ion-item lines="full">
      <ion-input v-model="sftpFormData.userId" label="USER ID" placeholder="SFTP username" />
    </ion-item>
    <ion-item lines="full">
      <ion-input v-model="sftpFormData.port" label="PORT" placeholder="Default is 22" />
    </ion-item>
    <ion-item lines="full">
      <ion-input v-model="sftpFormData.hostKey" label="HOST KEY" placeholder="Authentication key" />
    </ion-item>
    <ion-item lines="full">
      <ion-input v-model="sftpFormData.defaultDirectory" label="DEFAULT DIRECTORY" placeholder="/home/-sftp/netsuite/" />
    </ion-item>
    <ion-fab vertical="bottom" horizontal="end" slot="fixed">
      <ion-fab-button @click="saveSftpConfig">
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

const sftpFormData = ref({
  guid: '',
  server: '',
  userId: '',
  port: '',
  hostKey: '',
  defaultDirectory: ''
});

function closeModal() {
  modalController.dismiss({ dismissed: true });
}

function saveSftpConfig() {
  const payload = {
    guid: sftpFormData.value.guid,
    server: sftpFormData.value.server,
    userId: sftpFormData.value.userId,
    port: sftpFormData.value.port,
    hostKey: sftpFormData.value.hostKey,
    defaultDirectory: sftpFormData.value.defaultDirectory
  };

  closeModal();
  // Here you would typically call the API to save the data
  // For now, we just log the payload
}
</script>