<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal()">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate("Transfer Inventory") }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <ion-item class="ion-margin-top">
      <ion-icon slot="start" :icon="informationCircleOutline" />
      <ion-label>
        {{ translate("Learn more about creating inventory transfers from inventory variances") }}
      </ion-label>
      <ion-icon :icon="openOutline" slot="end" />
    </ion-item>

    <ion-item>
      <ion-icon slot="start" :icon="businessOutline" />
      <ion-label>
        {{ translate("Facility wise inventory transfer") }}
        <p>{{ translate("If each facility has its own dedicated inventory transfer location for this variance, configure the transfer location from the facility configuration section") }}</p>
      </ion-label>
    </ion-item>

    <ion-item lines="none" class="ion-margin-top">
      <ion-input v-model="transferLocationId" label="Transfer location" placeholder="NetSuite facility ID" :helperText="props.varianceEnumId"/>
    </ion-item>
     
    <ion-fab vertical="bottom" horizontal="end" slot="fixed">
      <ion-fab-button @click="saveTransferInventory">
        <ion-icon :icon="saveOutline" />
      </ion-fab-button>
    </ion-fab>

  </ion-content>
</template>

<script setup lang="ts">
import { IonButton, IonButtons, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonTitle, IonToolbar, modalController } from "@ionic/vue";
import { businessOutline, closeOutline, informationCircleOutline, openOutline, saveOutline } from 'ionicons/icons';
import { translate } from '@hotwax/dxp-components';
import { defineProps, ref } from 'vue';

const props = defineProps(["varianceEnumId"]);

const transferLocationId = ref('');

function saveTransferInventory() {
  closeModal();
}

function closeModal() {
  modalController.dismiss({ dismissed: true, transferLocationId: transferLocationId.value });
}
</script>