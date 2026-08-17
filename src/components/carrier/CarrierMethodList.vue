<template>
  <section data-testid="carrier-method-list">
    <ion-list>
      <ion-item>
        <ion-toggle
          justify="space-between"
          :aria-label="translate('Show configured methods only')"
          :checked="configuredOnly"
          @ion-change="emitConfiguredOnly($event)"
        >
          {{ translate("Configured methods only") }}
        </ion-toggle>
      </ion-item>

      <ion-item lines="full">
        <ion-label class="ion-text-wrap">
          <h2>{{ translate("Carrier shipment methods") }}</h2>
          <p>
            {{ translate("Enable global shipment method types for this carrier, then configure their carrier fields.") }}
          </p>
        </ion-label>
        <ion-button
          slot="end"
          fill="outline"
          :disabled="disabled || isPending('method-type:create')"
          @click="emit('create-type')"
        >
          {{ translate("Create shipment method type") }}
        </ion-button>
      </ion-item>

      <ion-item
        v-for="method in visibleMethods"
        :key="method.shipmentMethodTypeId"
      >
        <ion-label class="ion-text-wrap">
          <h2>{{ method.description || method.shipmentMethodTypeId }}</h2>
          <p>{{ method.shipmentMethodTypeId }}</p>
          <p v-if="method.isConfigured">
            {{ translate("Carrier service code") }}:
            {{ method.carrierServiceCode || translate("Not set") }}
          </p>
          <p v-if="method.isConfigured">
            {{ translate("Delivery days") }}:
            {{ method.deliveryDays ?? translate("Not set") }}
          </p>
        </ion-label>

        <ion-buttons slot="end">
          <template v-if="method.isConfigured">
            <ion-button
              :aria-label="translate('Move {method} up', {
                method: method.description || method.shipmentMethodTypeId,
              })"
              :disabled="isPending('methods:reorder') || !canMoveUp(method)"
              @click="move(method, -1)"
            >
              <ion-icon slot="icon-only" :icon="chevronUpOutline" />
            </ion-button>
            <ion-button
              :aria-label="translate('Move {method} down', {
                method: method.description || method.shipmentMethodTypeId,
              })"
              :disabled="isPending('methods:reorder') || !canMoveDown(method)"
              @click="move(method, 1)"
            >
              <ion-icon slot="icon-only" :icon="chevronDownOutline" />
            </ion-button>
            <ion-button
              fill="clear"
              :disabled="disabled || isPending(methodKey(method, 'edit'))"
              @click="emit('edit', method)"
            >
              {{ translate("Edit") }}
            </ion-button>
            <ion-button
              fill="clear"
              color="danger"
              :disabled="disabled || isPending(methodKey(method, 'delete'))"
              @click="emit('delete', method)"
            >
              {{ translate("Disable") }}
            </ion-button>
          </template>
          <ion-button
            v-else
            fill="clear"
            :disabled="disabled || isPending(methodKey(method, 'enable'))"
            @click="emit('enable', method)"
          >
            {{ translate("Enable") }}
          </ion-button>
          <ion-button
            fill="clear"
            :disabled="disabled || isPending(methodKey(method, 'rename-type'))"
            @click="emit('rename-type', method)"
          >
            {{ translate("Rename type") }}
          </ion-button>
        </ion-buttons>
      </ion-item>

      <ion-item v-if="!visibleMethods.length" lines="none">
        <ion-label class="ion-text-center ion-text-wrap">
          {{ translate("No shipment methods to display.") }}
        </ion-label>
      </ion-item>
    </ion-list>

    <div class="ion-padding ion-text-end">
      <ion-button
        fill="outline"
        :disabled="disabled || isPending('methods:reorder') || !orderChanged"
        @click="emitSavedOrder()"
      >
        {{ translate("Save order") }}
      </ion-button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { translate } from "@common";
import {
  IonButton,
  IonButtons,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonToggle,
} from "@ionic/vue";
import { chevronDownOutline, chevronUpOutline } from "ionicons/icons";
import { computed, ref, watch } from "vue";
import type { CarrierShipmentMethod } from "@/composables/useCarriers";

const props = withDefaults(defineProps<{
  methods: CarrierShipmentMethod[];
  configuredOnly?: boolean;
  disabled?: boolean;
  pendingKeys?: string[];
}>(), {
  configuredOnly: false,
  disabled: false,
  pendingKeys: () => [],
});

const emit = defineEmits<{
  (event: "update:configuredOnly", value: boolean): void;
  (event: "enable", method: CarrierShipmentMethod): void;
  (event: "delete", method: CarrierShipmentMethod): void;
  (event: "edit", method: CarrierShipmentMethod): void;
  (event: "rename-type", method: CarrierShipmentMethod): void;
  (event: "create-type"): void;
  (event: "save-order", methods: CarrierShipmentMethod[]): void;
}>();

const orderedConfiguredMethods = ref<CarrierShipmentMethod[]>([]);

const configuredSource = computed(() =>
  props.methods.filter((method) => method.isConfigured));
const configuredSignature = computed(() =>
  configuredSource.value
    .map((method) =>
      `${method.shipmentMethodTypeId}:${method.sequenceNumber ?? ""}`)
    .join("|"));

watch(configuredSignature, () => {
  orderedConfiguredMethods.value = configuredSource.value.map((method) => ({ ...method }));
}, { immediate: true });

const sourceOrder = computed(() =>
  configuredSource.value.map((method) => method.shipmentMethodTypeId));
const draftOrder = computed(() =>
  orderedConfiguredMethods.value.map((method) => method.shipmentMethodTypeId));
const orderChanged = computed(() =>
  sourceOrder.value.join("|") !== draftOrder.value.join("|"));
const refreshedDraftMethods = computed(() => {
  const currentById = new Map(configuredSource.value.map((method) => [
    method.shipmentMethodTypeId,
    method,
  ]));

  return orderedConfiguredMethods.value
    .map((draft) => currentById.get(draft.shipmentMethodTypeId))
    .filter((method): method is CarrierShipmentMethod => Boolean(method));
});
const visibleMethods = computed(() => {
  if(props.configuredOnly) {
    return refreshedDraftMethods.value;
  }

  const unconfigured = props.methods.filter((method) => !method.isConfigured);

  return [...refreshedDraftMethods.value, ...unconfigured];
});

function methodKey(method: CarrierShipmentMethod, action: string) {
  return `method:${method.shipmentMethodTypeId}:${action}`;
}

function isPending(key: string) {
  return props.pendingKeys.includes(key);
}

function configuredIndex(method: CarrierShipmentMethod) {
  return orderedConfiguredMethods.value.findIndex((candidate) =>
    candidate.shipmentMethodTypeId === method.shipmentMethodTypeId);
}

function canMoveUp(method: CarrierShipmentMethod) {
  return configuredIndex(method) > 0;
}

function canMoveDown(method: CarrierShipmentMethod) {
  const index = configuredIndex(method);

  return index >= 0 && index < orderedConfiguredMethods.value.length - 1;
}

function move(method: CarrierShipmentMethod, offset: number) {
  if(isPending("methods:reorder")) {
    return;
  }

  const currentIndex = configuredIndex(method);
  const destination = currentIndex + offset;
  if(currentIndex < 0 || destination < 0 || destination >= orderedConfiguredMethods.value.length) {
    return;
  }

  const draft = [...orderedConfiguredMethods.value];
  const [moved] = draft.splice(currentIndex, 1);
  draft.splice(destination, 0, moved);
  orderedConfiguredMethods.value = draft;
}

function emitConfiguredOnly(event: CustomEvent<{ checked: boolean }>) {
  emit("update:configuredOnly", Boolean(event.detail.checked));
}

function emitSavedOrder() {
  if(props.disabled || !orderChanged.value || isPending("methods:reorder")) {
    return;
  }

  emit("save-order", refreshedDraftMethods.value.map((method) => ({ ...method })));
}
</script>
