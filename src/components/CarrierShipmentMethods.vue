<template>
  <template v-if="filteredShipmentMethods.length">
    <div class="list-item ion-padding" v-for="shipmentMethod in filteredShipmentMethods" :key="shipmentMethod.shipmentMethodTypeId">
      <ion-item lines="none">
        <ion-label>
          {{ shipmentMethod.description }}
          <p>{{ shipmentMethod.shipmentMethodTypeId }}</p>
        </ion-label>
      </ion-item>
      <div class="tablet">
        <ion-chip v-if="shipmentMethod.deliveryDays" outline @click.stop="editDeliveryDays(shipmentMethod)">
          <ion-label>{{ shipmentMethod.deliveryDays }}</ion-label>
        </ion-chip>
        <ion-chip v-else :disabled="!shipmentMethod.isChecked" outline @click.stop="editDeliveryDays(shipmentMethod)">
          <ion-icon :icon="addCircleOutline" />
          <ion-label>{{ translate("delivery days") }}</ion-label>
        </ion-chip>
        <ion-note class="config-label">{{ translate("delivery days") }}</ion-note>
      </div>
      <div class="tablet">
        <ion-chip v-if="shipmentMethod.carrierServiceCode" outline @click.stop="editCarrierCode(shipmentMethod)">
          <ion-label>{{ shipmentMethod.carrierServiceCode }}</ion-label>
        </ion-chip>
        <ion-chip v-else :disabled="!shipmentMethod.isChecked" outline @click.stop="editCarrierCode(shipmentMethod)">
          <ion-icon :icon="addCircleOutline" />
          <ion-label>{{ translate("carrier code") }}</ion-label>
        </ion-chip>
        <ion-note class="config-label">{{ translate("carrier code") }}</ion-note>
      </div>
      <div class="tablet">
        <ion-checkbox :checked="shipmentMethod.isChecked" @click="updateCarrierShipmentMethodAssociation($event, shipmentMethod)" />
      </div>
      <ion-button fill="clear" color="medium" @click="openShipmentMethodActionsPopover($event, shipmentMethod)">
        <ion-icon slot="icon-only" :icon="ellipsisVerticalOutline" />
      </ion-button>
    </div>
  </template>
  <div v-else class="empty-state">
    <p>{{ translate("No data found") }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
  IonButton,
  IonCheckbox,
  IonChip,
  IonIcon,
  IonItem,
  IonLabel,
  IonNote,
  alertController,
  popoverController,
} from "@ionic/vue";
import { addCircleOutline, ellipsisVerticalOutline } from "ionicons/icons";
import { commonUtil, logger, translate } from "@common";
import { useCarrierStore } from "@/store/carrier";
import { mergeCarrierShipmentMethods } from "@/utils/carrierManagement";
import CarrierShipmentMethodActionsPopover from "@/components/CarrierShipmentMethodActionsPopover.vue";

const props = defineProps<{ showSelected: boolean }>();
const carrierStore = useCarrierStore();

const shipmentMethods = computed(() => mergeCarrierShipmentMethods(
  carrierStore.getShipmentMethodTypes || [],
  carrierStore.getCarrierShipmentMethods || [],
).map((method: any) => ({ ...method, isChecked: method.isConfigured })));
const filteredShipmentMethods = computed(() => {
  const methods = props.showSelected
    ? shipmentMethods.value.filter((method: any) => method.isChecked)
    : shipmentMethods.value;
  return [...methods].sort((left: any, right: any) => Number(left.sequenceNumber || 999) - Number(right.sequenceNumber || 999));
});

async function refresh() {
  if (carrierStore.getCurrent?.partyId) await carrierStore.fetchCarrierDetail(carrierStore.getCurrent.partyId);
}

async function mutate(operation: () => Promise<any>, successMessage: string, errorMessage: string) {
  try {
    const response = await operation();
    if (commonUtil.hasError(response)) throw response.data;
    commonUtil.showToast(translate(successMessage));
    await refresh();
  } catch (error) {
    logger.error(errorMessage, error);
    commonUtil.showToast(translate(errorMessage));
  }
}

async function editDeliveryDays(shipmentMethod: any) {
  const alert = await alertController.create({
    header: translate("Edit delivery days"),
    inputs: [{ name: "deliveryDays", value: shipmentMethod.deliveryDays || "" }],
    buttons: [
      { text: translate("Cancel"), role: "cancel" },
      {
        text: translate("Apply"),
        handler: async (data: any) => {
          const deliveryDays = String(data.deliveryDays || "").trim();
          if (deliveryDays && !commonUtil.isValidDeliveryDays(deliveryDays)) {
            commonUtil.showToast(translate("Only positive numbers are allowed."));
            return false;
          }
          await mutate(
            () => carrierStore.updateCarrierShipmentMethod(carrierStore.getCurrent!.partyId, shipmentMethod.shipmentMethodTypeId, { deliveryDays }),
            "Delivery days updated.",
            "Failed to update delivery days.",
          );
        },
      },
    ],
  });
  await alert.present();
}

async function editCarrierCode(shipmentMethod: any) {
  const alert = await alertController.create({
    header: translate("Edit carrier code"),
    inputs: [{ name: "carrierServiceCode", value: shipmentMethod.carrierServiceCode || "" }],
    buttons: [
      { text: translate("Cancel"), role: "cancel" },
      {
        text: translate("Apply"),
        handler: async (data: any) => {
          const carrierServiceCode = String(data.carrierServiceCode || "").trim();
          if (carrierServiceCode && !commonUtil.isValidCarrierCode(carrierServiceCode)) {
            commonUtil.showToast(translate("Only alphanumeric characters are allowed."));
            return false;
          }
          await mutate(
            () => carrierStore.updateCarrierShipmentMethod(carrierStore.getCurrent!.partyId, shipmentMethod.shipmentMethodTypeId, { carrierServiceCode }),
            "Carrier code updated.",
            "Failed to update carrier code.",
          );
        },
      },
    ],
  });
  await alert.present();
}

async function updateCarrierShipmentMethodAssociation(event: Event, shipmentMethod: any) {
  event.preventDefault();
  event.stopImmediatePropagation();
  const enabled = !shipmentMethod.isChecked;

  await mutate(async () => {
    if (!enabled) {
      const associations = (carrierStore.getProductStoreShipmentMethods || [])
        .filter((method: any) => method.shipmentMethodTypeId === shipmentMethod.shipmentMethodTypeId);
      for (const association of associations) {
        const response = await carrierStore.setProductStoreShipmentMethod(association.productStoreId, association, false);
        if (commonUtil.hasError(response)) throw response.data;
      }
    }
    return carrierStore.setCarrierShipmentMethod(carrierStore.getCurrent!.partyId, shipmentMethod.shipmentMethodTypeId, enabled);
  }, enabled ? "Shipment method associated with carrier successfully" : "Shipment method disassociated from carrier successfully", enabled ? "Failed to associate shipment method with carrier" : "Failed to disassociate shipment method from carrier");
}

async function openShipmentMethodActionsPopover(event: Event, shipmentMethod: any) {
  const popover = await popoverController.create({
    component: CarrierShipmentMethodActionsPopover,
    componentProps: { shipmentMethod },
    showBackdrop: false,
    event,
  });
  await popover.present();
}
</script>

<style scoped>
.list-item {
  --columns-desktop: 5;
}
.list-item:hover {
  cursor: default;
}
.tablet {
  display: block;
  text-align: center;
}
.config-label {
  display: block;
  text-align: center;
}
</style>
