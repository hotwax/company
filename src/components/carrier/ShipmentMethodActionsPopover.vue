<template>
  <ion-content>
    <ion-list>
      <ion-list-header>{{ shipmentMethod.description || shipmentMethod.shipmentMethodTypeId }}</ion-list-header>
      <ion-item lines="none" button @click="renameShipmentMethod()">
        <ion-icon slot="end" :icon="pencilOutline" />
        {{ translate("Edit name") }}
      </ion-item>
      <template v-if="shipmentMethod.isConfigured">
        <ion-item button @click="editDeliveryDays()">
          <ion-icon slot="end" :icon="calendarClearOutline" />
          {{ translate("Edit delivery days") }}
        </ion-item>
        <ion-item button @click="editCarrierCode()">
          <ion-icon slot="end" :icon="codeWorkingOutline" />
          {{ translate("Edit carrier code") }}
        </ion-item>
        <ion-item button @click="openEditSequenceModal()">
          <ion-icon slot="end" :icon="listOutline" />
          {{ translate("Edit sequence") }}
        </ion-item>
        <ion-item lines="none" button @click="removeCarrierShipmentMethod()">
          <ion-icon slot="end" :icon="unlinkOutline" />
          {{ translate("Remove from carrier") }}
        </ion-item>
      </template>
    </ion-list>
  </ion-content>
</template>

<script setup lang="ts">
import {
  IonContent,
  IonIcon,
  IonItem,
  IonList,
  IonListHeader,
  alertController,
  modalController,
  popoverController,
} from "@ionic/vue";
import {
  calendarClearOutline,
  codeWorkingOutline,
  listOutline,
  pencilOutline,
  unlinkOutline,
} from "ionicons/icons";
import { commonUtil, logger, translate } from "@common";
import type { CarrierShipmentMethod } from "@/composables/useCarriers";
import {
  deleteCarrierShipmentMethod,
  updateCarrierShipmentMethod,
} from "@/composables/useCarriers";
import { useShipmentMethodTypeMutations } from "@/composables/useSeed";
import EditShipmentMethodSequenceModal from "./EditShipmentMethodSequenceModal.vue";

const props = defineProps<{
  shipmentMethod: CarrierShipmentMethod;
  carrierPartyId: string;
  configuredMethods?: CarrierShipmentMethod[];
}>();

const emit = defineEmits<{
  (event: "mutation-complete"): void;
}>();

const closePopover = () => {
  popoverController.dismiss();
};

const renameShipmentMethod = async () => {
  const alert = await alertController.create({
    header: translate("Rename shipment method"),
    inputs: [{ name: "shipmentMethodName", value: props.shipmentMethod.description }],
    buttons: [
      { text: translate("Cancel"), role: "cancel" },
      {
        text: translate("Apply"),
        handler: async (data) => {
          const updatedName = data.shipmentMethodName?.trim();
          if (!updatedName) {
            commonUtil.showToast(translate("Shipment method name can not be empty."));
            return;
          }
          if (updatedName !== props.shipmentMethod.description) {
            try {
              const { renameShipmentMethodType } = useShipmentMethodTypeMutations(props.shipmentMethod.shipmentMethodTypeId);
              await renameShipmentMethodType(updatedName);
              commonUtil.showToast(translate("Shipment method renamed successfully."));
              emit("mutation-complete");
            } catch (err) {
              logger.error("Failed to rename shipment method", err);
              commonUtil.showToast(translate("Failed to rename shipment method."));
            }
          }
        },
      },
    ],
  });
  await alert.present();
  closePopover();
};

const editDeliveryDays = async () => {
  const alert = await alertController.create({
    header: translate("Edit delivery days"),
    inputs: [{
      name: "deliveryDays",
      type: "number",
      value: props.shipmentMethod.deliveryDays !== undefined ? String(props.shipmentMethod.deliveryDays) : "",
    }],
    buttons: [
      { text: translate("Cancel"), role: "cancel" },
      {
        text: translate("Apply"),
        handler: async (data) => {
          const rawValue = data.deliveryDays?.trim();
          const deliveryDays = rawValue ? Number(rawValue) : undefined;
          if (deliveryDays !== props.shipmentMethod.deliveryDays) {
            try {
              await updateCarrierShipmentMethod(
                props.carrierPartyId,
                props.shipmentMethod.shipmentMethodTypeId,
                { deliveryDays },
              );
              commonUtil.showToast(translate("Delivery days updated."));
              emit("mutation-complete");
            } catch (err) {
              logger.error("Failed to update delivery days", err);
              commonUtil.showToast(translate("Failed to update delivery days."));
            }
          }
        },
      },
    ],
  });
  await alert.present();
  closePopover();
};

const editCarrierCode = async () => {
  const alert = await alertController.create({
    header: translate("Edit carrier code"),
    inputs: [{
      name: "carrierServiceCode",
      value: props.shipmentMethod.carrierServiceCode || "",
    }],
    buttons: [
      { text: translate("Cancel"), role: "cancel" },
      {
        text: translate("Apply"),
        handler: async (data) => {
          const carrierServiceCode = data.carrierServiceCode?.trim();
          if (carrierServiceCode !== (props.shipmentMethod.carrierServiceCode || "")) {
            try {
              await updateCarrierShipmentMethod(
                props.carrierPartyId,
                props.shipmentMethod.shipmentMethodTypeId,
                { carrierServiceCode },
              );
              commonUtil.showToast(translate("Carrier code updated."));
              emit("mutation-complete");
            } catch (err) {
              logger.error("Failed to update carrier code", err);
              commonUtil.showToast(translate("Failed to update carrier code."));
            }
          }
        },
      },
    ],
  });
  await alert.present();
  closePopover();
};

const openEditSequenceModal = async () => {
  const modal = await modalController.create({
    component: EditShipmentMethodSequenceModal,
    componentProps: {
      carrierPartyId: props.carrierPartyId,
      configuredMethods: props.configuredMethods || [],
    },
  });
  modal.onDidDismiss().finally(() => {
    closePopover();
    emit("mutation-complete");
  });
  return modal.present();
};

const removeCarrierShipmentMethod = async () => {
  try {
    await deleteCarrierShipmentMethod(
      props.carrierPartyId,
      props.shipmentMethod.shipmentMethodTypeId,
    );
    commonUtil.showToast(translate("Shipment method removed from carrier."));
    closePopover();
    emit("mutation-complete");
  } catch (err) {
    logger.error("Failed to remove carrier shipment method", err);
    commonUtil.showToast(translate("Failed to remove shipment method."));
  }
};
</script>
