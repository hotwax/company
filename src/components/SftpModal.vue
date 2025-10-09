<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal()">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate("SFTP") }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <ion-item class="ion-margin-top">
      <ion-icon slot="start" :icon="informationCircleOutline" />
      <ion-label>
        {{ translate("Learn more about NetSuite SFTP configuration.") }}
      </ion-label>
      <ion-button fill="clear" size="default" color="medium" @click="openSftpDoc">
        <ion-icon :icon="openOutline" slot="icon-only" />
      </ion-button>
    </ion-item>
    
    <ion-item lines="full" class="ion-margin-top">
      <ion-input v-model="sftpFormData.guid" :label="translate('GUID')" :placeholder="translate('Unique SFTP identifier')" />
    </ion-item>
    <ion-item lines="full">
      <ion-input v-model="sftpFormData.server" :label="translate('SERVER')" :placeholder="translate('Address or domain of the SFTP server')" />
    </ion-item>
    <ion-item lines="full">
      <ion-input v-model="sftpFormData.userId" :label="translate('USER ID')" :placeholder="translate('SFTP username')" />
    </ion-item>
    <ion-item lines="full">
      <ion-input v-model="sftpFormData.port" :label="translate('PORT')" :placeholder="translate('Default is 22')" />
    </ion-item>
    <ion-item lines="full">
      <ion-input v-model="sftpFormData.hostKey" :label="translate('HOST KEY')" :placeholder="translate('Authentication key')" />
    </ion-item>
    <ion-item lines="full">
      <ion-input v-model="sftpFormData.defaultDirectory" :label="translate('DEFAULT DIRECTORY')" placeholder="/home/-sftp/netsuite/" />
    </ion-item>

    <ion-fab vertical="bottom" horizontal="end" slot="fixed">
      <ion-fab-button @click="saveSftpConfig" :disabled="isFormInvalid">
        <ion-icon :icon="saveOutline" />
      </ion-fab-button>
    </ion-fab>
  </ion-content>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { IonButton, IonButtons, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonTitle, IonToolbar, modalController } from "@ionic/vue";
import { closeOutline, informationCircleOutline, openOutline, saveOutline } from 'ionicons/icons';
import { translate } from "@/i18n"
import { NetSuiteService } from '@/services/NetSuiteService';
import { hasError, showToast } from '@/utils';
import emitter from "@/event-bus";
import logger from "@/logger";

const sftpFormData = ref({
  guid: "",
  server: "",
  userId: "",
  port: "",
  hostKey: "",
  defaultDirectory: ""
});

const isFormInvalid = computed(() => {
  return Object.values(sftpFormData.value).some(value => !value);
});

function closeModal() {
  modalController.dismiss({ dismissed: true });
}

async function saveSftpConfig() {
  try {
    const payload = {
      guid: sftpFormData.value.guid,
      server: sftpFormData.value.server,
      userId: sftpFormData.value.userId,
      port: sftpFormData.value.port,
      hostKey: sftpFormData.value.hostKey,
      defaultDirectory: sftpFormData.value.defaultDirectory
    };

    const resp = await NetSuiteService.updateSftpConfig(payload);

    if(!hasError(resp)) {
      showToast(translate("SFTP configurations updated successfully"))
    } else {
      throw resp.data;
    }
  } catch(error: any) {
    logger.error(error);
    showToast(translate("Failed to update SFTP configurations"))
  }

  emitter.emit("dismissLoader")
  closeModal();
}

function openSftpDoc() {
  window.open('https://docs.hotwax.co/documents/v/learn-netsuite/netsuite-deployment/sdfbundle/setupsftp', '_blank', 'noopener, noreferrer');
}
</script>