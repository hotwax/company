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
      <div v-if="filteredShipmentMethods.length">
        <ion-reorder-group :disabled="false" @ionItemReorder="doReorder($event)">
          <div
            v-for="shipmentMethod in filteredShipmentMethods"
            :key="shipmentMethod.shipmentMethodTypeId"
            class="list-item"
          >
            <ion-item lines="none">
              <ion-label>
                {{ shipmentMethod.description || shipmentMethod.shipmentMethodTypeId }}
                <p>{{ shipmentMethod.shipmentMethodTypeId }}</p>
              </ion-label>
            </ion-item>
            <ion-reorder />
          </div>
        </ion-reorder-group>
      </div>
      <div v-else class="empty-state">
        <p>{{ translate("No shipment methods found.") }}</p>
      </div>
    </main>

    <ion-fab vertical="bottom" horizontal="end" slot="fixed">
      <ion-fab-button :disabled="saving" @click="saveShipmentMethodsOrder()">
        <ion-icon :icon="saveOutline" />
      </ion-fab-button>
    </ion-fab>
  </ion-content>
</template>

<script setup lang="ts">
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
} from "@ionic/vue";
import { onMounted, ref } from "vue";
import { close, saveOutline } from "ionicons/icons";
import { commonUtil, logger, translate } from "@common";
import type { CarrierShipmentMethod } from "@/composables/useCarriers";
import { resequenceCarrierShipmentMethods } from "@/composables/useCarriers";

const props = defineProps<{
  carrierPartyId: string;
  configuredMethods: CarrierShipmentMethod[];
}>();

const filteredShipmentMethods = ref<CarrierShipmentMethod[]>([]);
const isOrderChanged = ref(false);
const saving = ref(false);

onMounted(() => {
  const methods = props.configuredMethods.filter((m) => m.isConfigured);
  commonUtil.sortItems(methods, "sequenceNumber");
  filteredShipmentMethods.value = methods.map((m) => ({ ...m }));
});

const closeModal = () => {
  modalController.dismiss({ dismissed: true });
};

const doReorder = (event: CustomEvent) => {
  const updatedSeq = event.detail.complete(
    JSON.parse(JSON.stringify(filteredShipmentMethods.value)),
  );
  filteredShipmentMethods.value = updatedSeq;
  isOrderChanged.value = true;
  commonUtil.showToast(
    translate("Shipment methods order has been changed. Click save button to update them."),
  );
};

const saveShipmentMethodsOrder = async () => {
  saving.value = true;
  try {
    await resequenceCarrierShipmentMethods(
      props.carrierPartyId,
      filteredShipmentMethods.value,
    );
    commonUtil.showToast(translate("Shipment methods order updated successfully."));
    modalController.dismiss({ updated: true });
  } catch (err) {
    logger.error("Failed to save shipment methods order", err);
    commonUtil.showToast(translate("Failed to save shipment methods order."));
  } finally {
    saving.value = false;
  }
};
</script>

<style scoped>
.list-item {
  --columns-desktop: 2;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
ion-content {
  --padding-bottom: 80px;
}
</style>
