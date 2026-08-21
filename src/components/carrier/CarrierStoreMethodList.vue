<template>
  <div data-testid="carrier-store-method-list">
    <template v-if="methods.length">
      <div
        v-for="method in methods"
        :key="method.shipmentMethodTypeId"
        class="list-item ion-padding"
      >
        <ion-item lines="none">
          <ion-label>
            {{ method.description || method.shipmentMethodTypeId }}
            <p>{{ method.shipmentMethodTypeId }}</p>
          </ion-label>
        </ion-item>

        <div class="tablet">
          <ion-chip
            v-if="associationFor(method)?.shipmentGatewayConfigId"
            outline
            :disabled="disabled || associationPending(method)"
            @click.stop="updateShipmentGatewayConfigId(method)"
          >
            <ion-label>{{ getGatewayConfigDescription(associationFor(method)?.shipmentGatewayConfigId) }}</ion-label>
          </ion-chip>
          <ion-chip
            v-else
            :disabled="!associationFor(method) || disabled || associationPending(method)"
            outline
            @click.stop="updateShipmentGatewayConfigId(method)"
          >
            <ion-icon :icon="addCircleOutline" />
            <ion-label>{{ translate("gateway") }}</ion-label>
          </ion-chip>
          <ion-note class="config-label">{{ translate("gateway") }}</ion-note>
        </div>

        <div class="tablet">
          <ion-toggle
            :aria-label="translate('Require tracking for {method}', {
              method: method.description || method.shipmentMethodTypeId,
            })"
            :checked="trackingRequired(associationFor(method))"
            :disabled="!associationFor(method) || disabled || trackingPending(method)"
            @ion-change="emitTracking(method, $event)"
          />
          <ion-note class="config-label">{{ translate("require tracking code") }}</ion-note>
        </div>

        <div class="tablet">
          <ion-checkbox
            :aria-label="translate('Associate {method} with {store}', {
              method: method.description || method.shipmentMethodTypeId,
              store: store.storeName || store.productStoreId,
            })"
            :checked="Boolean(associationFor(method))"
            :disabled="disabled || associationPending(method)"
            @click="emitAssociation(method, $event)"
          />
        </div>
      </div>
    </template>
    <div v-else class="empty-state">
      <p>{{ translate("No data found") }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { translate } from "@common";
import {
  IonCheckbox,
  IonChip,
  IonIcon,
  IonItem,
  IonLabel,
  IonNote,
  IonToggle,
  alertController,
} from "@ionic/vue";
import { addCircleOutline } from "ionicons/icons";
import type {
  CarrierShipmentMethod,
  ProductStoreShipmentMethod,
} from "@/composables/useCarriers";
import { useShipmentGatewayConfigs } from "@/composables/useCarriers";

const props = withDefaults(defineProps<{
  store: Record<string, any>;
  methods: CarrierShipmentMethod[];
  associations: ProductStoreShipmentMethod[];
  disabled?: boolean;
  pendingKeys?: string[];
}>(), {
  disabled: false,
  pendingKeys: () => [],
});

const emit = defineEmits<{
  (event: "toggle-association", payload: {
    method: CarrierShipmentMethod;
    association?: ProductStoreShipmentMethod;
    enabled: boolean;
  }): void;
  (event: "toggle-tracking", payload: {
    method: CarrierShipmentMethod;
    association: ProductStoreShipmentMethod;
    required: boolean;
  }): void;
  (event: "update-gateway", payload: {
    method: CarrierShipmentMethod;
    association: ProductStoreShipmentMethod;
    shipmentGatewayConfigId?: string;
  }): void;
}>();

const { configs, getGatewayConfigDescription } = useShipmentGatewayConfigs();

function associationFor(method: CarrierShipmentMethod) {
  return props.associations.find((association) =>
    association.productStoreId === props.store.productStoreId &&
    association.shipmentMethodTypeId === method.shipmentMethodTypeId);
}

function actionKey(method: CarrierShipmentMethod, action: string) {
  return `store:${props.store.productStoreId}:${method.shipmentMethodTypeId}:${action}`;
}

function associationPending(method: CarrierShipmentMethod) {
  return props.pendingKeys.includes(actionKey(method, "association"));
}

function trackingPending(method: CarrierShipmentMethod) {
  return associationPending(method) ||
    props.pendingKeys.includes(actionKey(method, "tracking"));
}

function trackingRequired(association: ProductStoreShipmentMethod | undefined) {
  return association?.isTrackingRequired === true ||
    association?.isTrackingRequired === "Y";
}

function emitAssociation(
  method: CarrierShipmentMethod,
  event: any,
) {
  event.preventDefault();
  event.stopImmediatePropagation();

  if (props.disabled || associationPending(method)) {
    return;
  }

  emit("toggle-association", {
    method,
    association: associationFor(method),
    enabled: !associationFor(method),
  });
}

function emitTracking(
  method: CarrierShipmentMethod,
  event: CustomEvent<{ checked: boolean }>,
) {
  const association = associationFor(method);
  if (!association || props.disabled || trackingPending(method)) {
    return;
  }

  emit("toggle-tracking", {
    method,
    association,
    required: Boolean(event.detail.checked),
  });
}

const updateShipmentGatewayConfigId = async (method: CarrierShipmentMethod) => {
  const association = associationFor(method);
  if (!association) return;

  const currentConfigId = association.shipmentGatewayConfigId;
  const configOptions = configs.value.map((config) => ({
    type: "radio" as const,
    label: config.description || config.shipmentGatewayConfigId,
    value: config.shipmentGatewayConfigId,
    checked: config.shipmentGatewayConfigId === currentConfigId,
  }));

  const alert = await alertController.create({
    header: translate("Edit gateway"),
    inputs: configOptions,
    buttons: [
      {
        text: translate("Clear"),
        handler: () => {
          emit("update-gateway", {
            method,
            association,
            shipmentGatewayConfigId: "",
          });
        },
      },
      { text: translate("Cancel"), role: "cancel" },
      {
        text: translate("Confirm"),
        handler: (data) => {
          if (data && data !== currentConfigId) {
            emit("update-gateway", {
              method,
              association,
              shipmentGatewayConfigId: data,
            });
          }
        },
      },
    ],
  });
  await alert.present();
};
</script>

<style scoped>
.list-item {
  --columns-desktop: 5;
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 60px;
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
