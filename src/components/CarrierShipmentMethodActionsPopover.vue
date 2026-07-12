<template>
  <ion-content>
    <ion-list>
      <ion-list-header>{{ shipmentMethod.description || shipmentMethod.shipmentMethodTypeId }}</ion-list-header>
      <ion-item lines="none" button @click="renameShipmentMethod">
        <ion-icon slot="end" :icon="pencilOutline" />
        {{ translate("Edit name") }}
      </ion-item>
      <template v-if="shipmentMethod.isChecked">
        <ion-item button @click="editDeliveryDays">
          <ion-icon slot="end" :icon="calendarClearOutline" />
          {{ translate("Edit delivery days") }}
        </ion-item>
        <ion-item button @click="editCarrierCode">
          <ion-icon slot="end" :icon="codeWorkingOutline" />
          {{ translate("Edit carrier code") }}
        </ion-item>
        <ion-item button @click="openEditSequenceModal">
          <ion-icon slot="end" :icon="listOutline" />
          {{ translate("Edit sequence") }}
        </ion-item>
        <ion-item lines="none" button @click="removeCarrierShipmentMethod">
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
import { calendarClearOutline, codeWorkingOutline, listOutline, pencilOutline, unlinkOutline } from "ionicons/icons";
import { commonUtil, logger, translate } from "@common";
import { useCarrierStore } from "@/store/carrier";
import EditCarrierShipmentMethodSequenceModal from "@/components/EditCarrierShipmentMethodSequenceModal.vue";

const props = defineProps<{ shipmentMethod: any }>();
const carrierStore = useCarrierStore();

function closePopover() {
  popoverController.dismiss();
}

async function updateMethod(fields: Record<string, any>, successMessage: string, errorMessage: string) {
  try {
    const response = await carrierStore.updateCarrierShipmentMethod(
      carrierStore.getCurrent!.partyId,
      props.shipmentMethod.shipmentMethodTypeId,
      fields,
    );
    if (commonUtil.hasError(response)) throw response.data;
    commonUtil.showToast(translate(successMessage));
    await carrierStore.fetchCarrierDetail(carrierStore.getCurrent!.partyId);
  } catch (error) {
    logger.error(errorMessage, error);
    commonUtil.showToast(translate(errorMessage));
  }
}

async function renameShipmentMethod() {
  const alert = await alertController.create({
    header: translate("Rename shipment method"),
    inputs: [{ name: "shipmentMethodName", value: props.shipmentMethod.description || "" }],
    buttons: [
      { text: translate("Cancel"), role: "cancel" },
      {
        text: translate("Apply"),
        handler: async (data: any) => {
          const description = String(data.shipmentMethodName || "").trim();
          if (!description) return false;
          const response = await carrierStore.renameShipmentMethod(props.shipmentMethod.shipmentMethodTypeId, description);
          if (commonUtil.hasError(response)) throw response.data;
          await carrierStore.fetchCarrierDetail(carrierStore.getCurrent!.partyId);
        },
      },
    ],
  });
  await alert.present();
  closePopover();
}

async function editDeliveryDays() {
  const alert = await alertController.create({
    header: translate("Edit delivery days"),
    inputs: [{ name: "deliveryDays", value: props.shipmentMethod.deliveryDays || "" }],
    buttons: [
      { text: translate("Cancel"), role: "cancel" },
      { text: translate("Apply"), handler: (data: any) => updateMethod({ deliveryDays: String(data.deliveryDays || "").trim() }, "Delivery days updated.", "Failed to update delivery days.") },
    ],
  });
  await alert.present();
  closePopover();
}

async function editCarrierCode() {
  const alert = await alertController.create({
    header: translate("Edit carrier code"),
    inputs: [{ name: "carrierServiceCode", value: props.shipmentMethod.carrierServiceCode || "" }],
    buttons: [
      { text: translate("Cancel"), role: "cancel" },
      { text: translate("Apply"), handler: (data: any) => updateMethod({ carrierServiceCode: String(data.carrierServiceCode || "").trim() }, "Carrier code updated.", "Failed to update carrier code.") },
    ],
  });
  await alert.present();
  closePopover();
}

async function openEditSequenceModal() {
  const modal = await modalController.create({ component: EditCarrierShipmentMethodSequenceModal });
  modal.onDidDismiss().finally(closePopover);
  await modal.present();
}

async function removeCarrierShipmentMethod() {
  try {
    const response = await carrierStore.setCarrierShipmentMethod(
      carrierStore.getCurrent!.partyId,
      props.shipmentMethod.shipmentMethodTypeId,
      false,
    );
    if (commonUtil.hasError(response)) throw response.data;
    commonUtil.showToast(translate("Shipment method removed successfully"));
    await carrierStore.fetchCarrierDetail(carrierStore.getCurrent!.partyId);
  } catch (error) {
    logger.error("Failed to remove shipment method", error);
    commonUtil.showToast(translate("Failed to remove shipment method"));
  }
  closePopover();
}
</script>
