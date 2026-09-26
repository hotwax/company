<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal">
          <ion-icon slot="icon-only" :icon="close" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate("Create shipment method") }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <ion-item>
      <ion-input
        v-model="shipmentMethod.description"
        label-placement="floating"
        @ion-blur="setShipmentMethodTypeId($event)"
      >
        <div slot="label">{{ translate("Name") }} <ion-text color="danger">*</ion-text></div>
      </ion-input>
    </ion-item>
    <ion-item>
      <ion-input
        v-model="shipmentMethod.shipmentMethodTypeId"
        label-placement="floating"
      >
        <div slot="label">{{ translate("ID") }} <ion-text color="danger">*</ion-text></div>
      </ion-input>
    </ion-item>
    <ion-fab vertical="bottom" horizontal="end" slot="fixed">
      <ion-fab-button :disabled="saving" @click="createShipmentMethod()">
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
  IonInput,
  IonItem,
  IonText,
  IonTitle,
  IonToolbar,
  modalController,
} from "@ionic/vue";
import { ref } from "vue";
import { close, saveOutline } from "ionicons/icons";
import { commonUtil, logger, translate } from "@common";
import { enableCarrierShipmentMethod } from "@/composables/useCarriers";
import { useShipmentMethodTypeMutations } from "@/composables/useSeed";

const props = defineProps<{
  carrierPartyId: string;
}>();

const { createShipmentMethodType } = useShipmentMethodTypeMutations();

const shipmentMethod = ref({
  description: "",
  shipmentMethodTypeId: "",
});
const saving = ref(false);

const closeModal = () => {
  modalController.dismiss({ dismissed: true });
};

const setShipmentMethodTypeId = (event: any) => {
  if (!shipmentMethod.value.shipmentMethodTypeId) {
    shipmentMethod.value.shipmentMethodTypeId = commonUtil.generateInternalId(event.target.value);
  }
};

const createShipmentMethod = async () => {
  const description = shipmentMethod.value.description?.trim();
  const shipmentMethodTypeId = shipmentMethod.value.shipmentMethodTypeId?.trim();
  if (!description || !shipmentMethodTypeId) {
    commonUtil.showToast(translate("Please fill all the required fields"));
    return;
  }

  saving.value = true;
  try {
    await createShipmentMethodType({
      shipmentMethodTypeId,
      description,
    });
    if (props.carrierPartyId) {
      await enableCarrierShipmentMethod(props.carrierPartyId, shipmentMethodTypeId);
    }
    commonUtil.showToast(translate("Shipment method created successfully."));
    modalController.dismiss({ created: true, shipmentMethodTypeId });
  } catch (err: any) {
    logger.error("Failed to create shipment method", err);
    commonUtil.showToast(translate("Failed to create shipment method."));
  } finally {
    saving.value = false;
  }
};
</script>
