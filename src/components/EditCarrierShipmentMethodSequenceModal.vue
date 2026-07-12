<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal">
          <ion-icon slot="icon-only" :icon="close" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate("Sequence methods") }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content class="ion-padding">
    <main>
      <ion-reorder-group v-if="shipmentMethods.length" @ionItemReorder="doReorder($event)" :disabled="false">
        <div class="list-item" v-for="shipmentMethod in shipmentMethods" :key="shipmentMethod.shipmentMethodTypeId">
          <ion-item lines="none">
            <ion-label>
              {{ shipmentMethod.description || shipmentMethod.shipmentMethodTypeId }}
              <p>{{ shipmentMethod.shipmentMethodTypeId }}</p>
            </ion-label>
          </ion-item>
          <ion-reorder />
        </div>
      </ion-reorder-group>
      <div v-else class="empty-state">
        <p>{{ translate("No shipment methods found.") }}</p>
      </div>
    </main>

    <ion-fab vertical="bottom" horizontal="end" slot="fixed">
      <ion-fab-button @click="saveShipmentMethodsOrder">
        <ion-icon :icon="saveOutline" />
      </ion-fab-button>
    </ion-fab>
  </ion-content>
</template>

<script setup lang="ts">
import { ref } from "vue";
import {
  IonButton,
  IonButtons,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonReorder,
  IonReorderGroup,
  IonTitle,
  IonToolbar,
  modalController,
  onIonViewWillEnter,
} from "@ionic/vue";
import { close, saveOutline } from "ionicons/icons";
import { commonUtil, translate } from "@common";
import { useCarrierStore } from "@/store/carrier";
import { mergeCarrierShipmentMethods } from "@/utils/carrierManagement";

const carrierStore = useCarrierStore();
const shipmentMethods = ref<any[]>([]);

onIonViewWillEnter(() => {
  shipmentMethods.value = mergeCarrierShipmentMethods(
    carrierStore.getShipmentMethodTypes || [],
    carrierStore.getCarrierShipmentMethods || [],
  ).filter((method: any) => method.isConfigured)
    .sort((left: any, right: any) => Number(left.sequenceNumber || 999) - Number(right.sequenceNumber || 999));
});

function closeModal() {
  modalController.dismiss({ dismissed: true });
}

function doReorder(event: CustomEvent) {
  shipmentMethods.value = event.detail.complete([...shipmentMethods.value]);
  commonUtil.showToast(translate("Shipment methods order has been changed. Click save button to update them."));
}

async function saveShipmentMethodsOrder() {
  await carrierStore.saveShipmentMethodsOrder(carrierStore.getCurrent!.partyId, shipmentMethods.value);
  await carrierStore.fetchCarrierDetail(carrierStore.getCurrent!.partyId);
  commonUtil.showToast(translate("Shipment methods sequence updated successfully"));
  closeModal();
}
</script>

<style scoped>
.list-item {
  --columns-desktop: 2;
}
ion-content {
  --padding-bottom: 80px;
}
</style>
