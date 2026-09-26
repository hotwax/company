<template>
  <template v-if="visibleMethods?.length > 0">
    <div
      v-for="shipmentMethod in visibleMethods"
      :key="shipmentMethod.shipmentMethodTypeId"
      class="list-item ion-padding"
    >
      <ion-item lines="none">
        <ion-label>
          {{ shipmentMethod.description || shipmentMethod.shipmentMethodTypeId }}
          <p>{{ shipmentMethod.shipmentMethodTypeId }}</p>
        </ion-label>
      </ion-item>

      <div class="tablet">
        <ion-chip
          v-if="shipmentMethod.deliveryDays !== undefined && shipmentMethod.deliveryDays !== null && shipmentMethod.deliveryDays !== ''"
          outline
          :disabled="disabled || isPending(shipmentMethod)"
          @click.stop="editDeliveryDays(shipmentMethod)"
        >
          <ion-label>{{ shipmentMethod.deliveryDays }}</ion-label>
        </ion-chip>
        <ion-chip
          v-else
          :disabled="!shipmentMethod.isConfigured || disabled || isPending(shipmentMethod)"
          outline
          @click.stop="editDeliveryDays(shipmentMethod)"
        >
          <ion-icon :icon="addCircleOutline" />
          <ion-label>{{ translate("delivery days") }}</ion-label>
        </ion-chip>
        <ion-note class="config-label">{{ translate("delivery days") }}</ion-note>
      </div>

      <div class="tablet">
        <ion-chip
          v-if="shipmentMethod.carrierServiceCode"
          outline
          :disabled="disabled || isPending(shipmentMethod)"
          @click.stop="editCarrierCode(shipmentMethod)"
        >
          <ion-label>{{ shipmentMethod.carrierServiceCode }}</ion-label>
        </ion-chip>
        <ion-chip
          v-else
          :disabled="!shipmentMethod.isConfigured || disabled || isPending(shipmentMethod)"
          outline
          @click.stop="editCarrierCode(shipmentMethod)"
        >
          <ion-icon :icon="addCircleOutline" />
          <ion-label>{{ translate("carrier code") }}</ion-label>
        </ion-chip>
        <ion-note class="config-label">{{ translate("carrier code") }}</ion-note>
      </div>

      <div class="tablet">
        <ion-checkbox
          :checked="Boolean(shipmentMethod.isConfigured)"
          :disabled="disabled || isPending(shipmentMethod)"
          @click="toggleCarrierMethodAssociation($event, shipmentMethod)"
        />
      </div>

      <ion-button
        fill="clear"
        color="medium"
        :disabled="disabled || isPending(shipmentMethod)"
        @click="openShipmentMethodActionsPopover($event, shipmentMethod)"
      >
        <ion-icon slot="icon-only" :icon="ellipsisVerticalOutline" />
      </ion-button>
    </div>
  </template>
  <div v-else class="empty-state">
    <p>{{ translate("No data found") }}</p>
  </div>
</template>

<script setup lang="ts">
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
import { computed, ref } from "vue";
import { addCircleOutline, ellipsisVerticalOutline } from "ionicons/icons";
import { commonUtil, logger, translate } from "@common";
import type { CarrierShipmentMethod } from "@/composables/useCarriers";
import {
  deleteCarrierShipmentMethod,
  enableCarrierShipmentMethod,
  updateCarrierShipmentMethod,
} from "@/composables/useCarriers";
import ShipmentMethodActionsPopover from "./ShipmentMethodActionsPopover.vue";

const props = withDefaults(defineProps<{
  methods: CarrierShipmentMethod[];
  carrierPartyId: string;
  configuredOnly?: boolean;
  disabled?: boolean;
  pendingKeys?: string[];
}>(), {
  configuredOnly: false,
  disabled: false,
  pendingKeys: () => [],
});

const emit = defineEmits<{
  (event: "mutation-complete"): void;
}>();

const localPendingMethods = ref<Set<string>>(new Set());

const visibleMethods = computed(() => {
  if (props.configuredOnly) {
    return props.methods.filter((m) => m.isConfigured);
  }
  return props.methods;
});

const configuredMethods = computed(() =>
  props.methods.filter((m) => m.isConfigured),
);

function isPending(method: CarrierShipmentMethod) {
  return (
    localPendingMethods.value.has(method.shipmentMethodTypeId) ||
    props.pendingKeys.includes(`method:${method.shipmentMethodTypeId}`) ||
    props.pendingKeys.includes(`carrier:${props.carrierPartyId}`)
  );
}

const editDeliveryDays = async (shipmentMethod: CarrierShipmentMethod) => {
  if (isPending(shipmentMethod)) return;
  const alert = await alertController.create({
    header: translate("Edit delivery days"),
    inputs: [{
      name: "deliveryDays",
      type: "number",
      value: shipmentMethod.deliveryDays !== undefined ? String(shipmentMethod.deliveryDays) : "",
    }],
    buttons: [
      { text: translate("Cancel"), role: "cancel" },
      {
        text: translate("Apply"),
        handler: async (data) => {
          const rawValue = data.deliveryDays?.trim();
          const deliveryDays = rawValue ? Number(rawValue) : undefined;
          if (deliveryDays !== shipmentMethod.deliveryDays) {
            localPendingMethods.value.add(shipmentMethod.shipmentMethodTypeId);
            try {
              await updateCarrierShipmentMethod(
                props.carrierPartyId,
                shipmentMethod.shipmentMethodTypeId,
                { deliveryDays },
              );
              commonUtil.showToast(translate("Delivery days updated."));
              emit("mutation-complete");
            } catch (err) {
              logger.error("Failed to update delivery days", err);
              commonUtil.showToast(translate("Failed to update delivery days."));
            } finally {
              localPendingMethods.value.delete(shipmentMethod.shipmentMethodTypeId);
            }
          }
        },
      },
    ],
  });
  await alert.present();
};

const editCarrierServiceCode = async (shipmentMethod: CarrierShipmentMethod) => {
  if (isPending(shipmentMethod)) return;
  const alert = await alertController.create({
    header: translate("Edit carrier service code"),
    inputs: [{
      name: "carrierServiceCode",
      type: "text",
      value: shipmentMethod.carrierServiceCode || "",
    }],
    buttons: [
      { text: translate("Cancel"), role: "cancel" },
      {
        text: translate("Apply"),
        handler: async (data) => {
          const carrierServiceCode = data.carrierServiceCode?.trim();
          if (carrierServiceCode !== (shipmentMethod.carrierServiceCode || "")) {
            localPendingMethods.value.add(shipmentMethod.shipmentMethodTypeId);
            try {
              await updateCarrierShipmentMethod(
                props.carrierPartyId,
                shipmentMethod.shipmentMethodTypeId,
                { carrierServiceCode },
              );
              commonUtil.showToast(translate("Carrier code updated."));
              emit("mutation-complete");
            } catch (err) {
              logger.error("Failed to update carrier code", err);
              commonUtil.showToast(translate("Failed to update carrier code."));
            } finally {
              localPendingMethods.value.delete(shipmentMethod.shipmentMethodTypeId);
            }
          }
        },
      },
    ],
  });
  await alert.present();
};

const toggleCarrierMethodAssociation = async (
  event: any,
  shipmentMethod: CarrierShipmentMethod,
) => {
  event.preventDefault();
  event.stopImmediatePropagation();

  const typeId = shipmentMethod.shipmentMethodTypeId;
  if (isPending(shipmentMethod) || props.disabled) return;

  localPendingMethods.value.add(typeId);
  try {
    if (shipmentMethod.isConfigured) {
      await deleteCarrierShipmentMethod(
        props.carrierPartyId,
        typeId,
      );
      commonUtil.showToast(translate("Shipment method removed from carrier."));
    } else {
      await enableCarrierShipmentMethod(
        props.carrierPartyId,
        typeId,
      );
      commonUtil.showToast(translate("Shipment method associated with carrier."));
    }
    emit("mutation-complete");
  } catch (err) {
    logger.error("Failed to toggle carrier shipment method association", err);
    commonUtil.showToast(translate("Failed to update shipment method."));
  } finally {
    localPendingMethods.value.delete(typeId);
  }
};

const openShipmentMethodActionsPopover = async (
  event: Event,
  shipmentMethod: CarrierShipmentMethod,
) => {
  const popover = await popoverController.create({
    component: ShipmentMethodActionsPopover,
    componentProps: {
      shipmentMethod,
      carrierPartyId: props.carrierPartyId,
      configuredMethods: configuredMethods.value,
    },
    showBackdrop: false,
    event,
  });
  await popover.present();
};
</script>

<style scoped>
.list-item {
  --columns-desktop: 5;
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 60px 48px;
  align-items: center;
  gap: var(--spacer-sm);
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
  font-size: 11px;
}
</style>
