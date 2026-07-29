<template>
  <section data-testid="carrier-store-method-list">
    <ion-list>
      <ion-item lines="full">
        <ion-label class="ion-text-wrap">
          <h2>{{ store.storeName || store.productStoreName || store.productStoreId }}</h2>
          <p>{{ store.productStoreId }}</p>
          <p>
            {{ translate("Only shipment methods enabled for this carrier can be associated with the store.") }}
          </p>
        </ion-label>
      </ion-item>

      <ion-item
        v-for="method in methods"
        :key="method.shipmentMethodTypeId"
      >
        <ion-label class="ion-text-wrap">
          <h2>{{ method.description || method.shipmentMethodTypeId }}</h2>
          <p>{{ method.shipmentMethodTypeId }}</p>
          <p v-if="associationFor(method)?.shipmentGatewayConfigId">
            {{ translate("Shipment gateway ID") }}:
            {{ associationFor(method)?.shipmentGatewayConfigId }}
          </p>
        </ion-label>

        <div slot="end">
          <ion-toggle
            :aria-label="translate('Associate {method} with {store}', {
              method: method.description || method.shipmentMethodTypeId,
              store: store.storeName || store.productStoreId,
            })"
            :checked="Boolean(associationFor(method))"
            :disabled="disabled || associationPending(method)"
            @ion-change="emitAssociation(method, $event)"
          >
            {{ translate("Associated") }}
          </ion-toggle>
          <ion-toggle
            v-if="associationFor(method)"
            :aria-label="translate('Require tracking for {method}', {
              method: method.description || method.shipmentMethodTypeId,
            })"
            :checked="trackingRequired(associationFor(method))"
            :disabled="disabled || trackingPending(method)"
            @ion-change="emitTracking(method, $event)"
          >
            {{ translate("Tracking required") }}
          </ion-toggle>
        </div>
      </ion-item>

      <ion-item v-if="!methods.length" lines="none">
        <ion-label class="ion-text-center ion-text-wrap">
          {{ translate("Enable a carrier shipment method before configuring this store.") }}
        </ion-label>
      </ion-item>
    </ion-list>
  </section>
</template>

<script setup lang="ts">
import { translate } from "@common";
import {
  IonItem,
  IonLabel,
  IonList,
  IonToggle,
} from "@ionic/vue";
import type {
  CarrierShipmentMethod,
  ProductStoreShipmentMethod,
} from "@/composables/useCarriers";

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
}>();

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
  event: CustomEvent<{ checked: boolean }>,
) {
  if(props.disabled || associationPending(method)) {
    return;
  }

  emit("toggle-association", {
    method,
    association: associationFor(method),
    enabled: Boolean(event.detail.checked),
  });
}

function emitTracking(
  method: CarrierShipmentMethod,
  event: CustomEvent<{ checked: boolean }>,
) {
  const association = associationFor(method);
  if(!association || props.disabled || trackingPending(method)) {
    return;
  }

  emit("toggle-tracking", {
    method,
    association,
    required: Boolean(event.detail.checked),
  });
}
</script>
