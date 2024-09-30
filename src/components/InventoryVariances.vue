<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
      <ion-back-button slot="start" default-href="/netsuite" />
        <ion-menu-button slot="start" />
        <ion-title>{{ translate("Inventory variances") }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <div class="ion-margin-top">
        <ion-item lines="none">
          <ion-icon slot="start" :icon="shieldCheckmarkOutline" />
          <ion-label>
            Inventory variances synced to NetSuite
            <p>Select exactly which inventory variances should be synced to NetSuite</p>
          </ion-label>
          <ion-badge slot="end" color="dark">next sync in 15 minutes</ion-badge>
        </ion-item>
      </div>

      <div class="list-item ion-margin-top">
        <ion-item lines="none">
          <ion-label>
            Variance Enum Name
            <p>Variance Enum Id</p>
          </ion-label>
        </ion-item>

        <ion-label>
          200
          <p>variances in 7 days</p>
        </ion-label>
        
        <div class="ion-text-center">
          <ion-chip :outline="true">
            <ion-label>15</ion-label>
            <ion-icon fill="" :icon="closeCircleOutline" />
          </ion-chip>
          <ion-label>
            <p>NetSuite transfer location</p>
          </ion-label>
        </div>
         
        <ion-item lines="none">
          <ion-checkbox></ion-checkbox>
        </ion-item>
      </div>

      <div class="list-item">
        <ion-item lines="none">
          <ion-label>
            Variance Enum Name
            <p>Variance Enum Id</p>
          </ion-label>
        </ion-item>

        <ion-label>
          200
          <p>variances in 7 days</p>
        </ion-label>
        
        <ion-button size="small" fill="outline" @click="openTransferInventoryModal()">
          <ion-label>Transfer inventory</ion-label>
          <ion-icon :icon="swapHorizontalOutline" slot="end"/>
        </ion-button>

        <ion-item lines="none">
          <ion-checkbox></ion-checkbox>
        </ion-item>
      </div>
    </ion-content>
  </ion-page>
</template>
<script setup lang="ts">
import { translate } from '@hotwax/dxp-components';
import { IonBackButton, IonBadge, IonButton, IonChip, IonCheckbox, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonPage, IonMenuButton, IonTitle, IonToolbar, modalController } from "@ionic/vue";
import { closeCircleOutline, shieldCheckmarkOutline, swapHorizontalOutline } from 'ionicons/icons'
import TransferInventoryModal from './TransferInventoryModal.vue';

async function openTransferInventoryModal() {
  const modal = await modalController.create({
    component: TransferInventoryModal,
  })
  modal.present()
}
</script>
<style scoped>
.list-item {
  --columns-desktop: 4;
}
</style>