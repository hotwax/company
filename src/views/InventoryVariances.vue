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
            {{ translate("Inventory variances synced to NetSuite") }}
            <p>{{ translate("Select exactly which inventory variances should be synced to NetSuite") }}</p>
          </ion-label>
          <ion-badge slot="end" color="dark">next sync in 15 minutes</ion-badge>
        </ion-item>
      </div>

      <div class="list-item ion-margin-top" v-for="variance in inventoryVariances" :key="variance.enumId">
        <ion-item lines="none">
          <ion-label>
            {{ variance.enumName ? variance.enumName : variance.enumId }}
            <p>{{ variance.enumId }}</p>
          </ion-label>
        </ion-item>
        
        <ion-label>
          200
          <p>{{ translate("variances in 7 days") }}</p>
        </ion-label>

        <template v-if="variance.transferLocationId">
          <div class="ion-text-center">
            <ion-chip :outline="true">
              <ion-label>{{ variance.transferLocationId }}</ion-label>
              <ion-icon fill="" :icon="closeCircleOutline" />
            </ion-chip>
            <ion-label>
              <p>{{ translate("NetSuite transfer location") }}</p>
            </ion-label>
          </div>
        </template>
        <template v-else>
          <ion-button size="small" fill="outline" @click="openTransferInventoryModal(variance)">
            <ion-label>{{ translate("Transfer inventory") }}</ion-label>
            <ion-icon :icon="swapHorizontalOutline" slot="end"/>
          </ion-button>
        </template>
        
        <ion-item lines="none">
          <ion-checkbox></ion-checkbox>
        </ion-item>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { translate } from '@hotwax/dxp-components';
import { IonBackButton, IonBadge, IonButton, IonChip, IonCheckbox, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonPage, IonMenuButton, IonTitle, IonToolbar, onIonViewWillEnter, modalController } from "@ionic/vue";
import { closeCircleOutline, shieldCheckmarkOutline, swapHorizontalOutline } from 'ionicons/icons';
import TransferInventoryModal from '@/components/TransferInventoryModal.vue';
import { useStore } from "vuex";
import { computed } from 'vue';

const store = useStore();

const inventoryVariances = computed(() => store.getters["netSuite/getInventoryVariances"]);

onIonViewWillEnter(async () => {
  await store.dispatch("netSuite/fetchInventoryVariances");
});

async function openTransferInventoryModal(variance: any) {
  const transferInventoryModal = await modalController.create({
    component: TransferInventoryModal,
    componentProps: { 
      varianceEnumId: variance.enumId,
      // currentTransferLocationId: variance.transferLocationId || ''
    }
  });

  transferInventoryModal.onDidDismiss().then((result) => {
    if (result?.data?.transferLocationId) {
      variance.transferLocationId = result.data.transferLocationId;
    }
  });
  transferInventoryModal.present();
}
</script>

<style scoped>
.list-item {
  --columns-desktop: 4;
}
</style>