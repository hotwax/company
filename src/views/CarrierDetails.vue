<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-back-button slot="start" default-href="/carriers" />
        <ion-title>{{ translate("Carrier details") }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <main v-if="!hydrated" class="carrier-detail">
        <ion-card>
          <ion-item lines="none">
            <ion-label>
              <ion-skeleton-text animated style="width: 30%" />
              <ion-skeleton-text animated style="width: 55%" />
            </ion-label>
          </ion-item>
        </ion-card>
        <ion-list>
          <ion-item v-for="index in 4" :key="`carrier-detail-skeleton-${index}`">
            <ion-label>
              <ion-skeleton-text animated style="width: 45%" />
              <ion-skeleton-text animated style="width: 70%" />
            </ion-label>
          </ion-item>
        </ion-list>
      </main>

      <template v-else>
        <ion-item v-if="hasDetailErrors" color="danger">
          <ion-label class="ion-text-wrap">
            <h2>{{ translate("Unable to load the complete carrier details.") }}</h2>
            <p v-for="message in detailErrorMessages" :key="message">
              {{ translateReferenceDataError(message) }}
            </p>
          </ion-label>
        </ion-item>

        <ion-item v-if="!carrier && !hasDetailErrors" lines="none">
          <ion-label class="ion-text-center ion-text-wrap">
            {{ translate("Carrier not found.") }}
          </ion-label>
        </ion-item>

        <main v-if="carrier" class="carrier-detail">
          <ion-card>
            <ion-item lines="none">
              <ion-label class="ion-text-wrap">
                <p class="overline">
                  {{ carrier.partyId }}
                </p>
                <h1>{{ carrier.groupName || carrier.partyId }}</h1>
              </ion-label>
              <ion-button
                slot="end"
                fill="outline"
                :disabled="!readyForMutation || hasPendingMutation"
                @click="openRenameCarrierAlert()"
              >
                {{ translate("Edit name") }}
              </ion-button>
            </ion-item>
          </ion-card>

          <ion-segment
            v-model="segment"
            class="carrier-segments"
            scrollable
            @ion-change="handleSegmentChange($event)"
          >
            <ion-segment-button value="methods">
              <ion-label>{{ translate("Methods") }}</ion-label>
            </ion-segment-button>
            <ion-segment-button value="facilities">
              <ion-label>{{ translate("Facilities") }}</ion-label>
            </ion-segment-button>
            <ion-segment-button
              v-for="store in productStores"
              :key="store.productStoreId"
              :value="`store:${store.productStoreId}`"
            >
              <ion-label>
                {{ store.storeName || store.productStoreName || store.productStoreId }}
              </ion-label>
            </ion-segment-button>
            <ion-segment-button value="account">
              <ion-label>{{ translate("Account") }}</ion-label>
            </ion-segment-button>
          </ion-segment>

          <CarrierMethodList
            v-if="segment === 'methods'"
            v-model:configured-only="configuredOnly"
            :methods="shipmentMethods"
            :disabled="!readyForMutation || hasPendingMutation"
            :pending-keys="pendingKeys"
            @enable="handleEnableMethod"
            @delete="openDeleteMethodAlert"
            @edit="openEditMethodAlert"
            @rename-type="openRenameTypeAlert"
            @create-type="openCreateTypeAlert"
            @save-order="handleSaveOrder"
          />

          <CarrierFacilityList
            v-else-if="segment === 'facilities'"
            :facilities="facilities"
            :disabled="!readyForMutation || hasPendingMutation"
            :pending-keys="pendingKeys"
            @toggle="handleFacilityToggle"
          />

          <CarrierStoreMethodList
            v-else-if="selectedStore"
            :store="selectedStore"
            :methods="configuredShipmentMethods"
            :associations="productStoreShipmentMethods"
            :disabled="!readyForMutation || hasPendingMutation"
            :pending-keys="pendingKeys"
            @toggle-association="handleStoreAssociationToggle"
            @toggle-tracking="handleStoreTrackingToggle"
          />

          <CarrierAccountReadiness
            v-else-if="segment === 'account'"
            :readiness="readiness"
            :remote="remote"
            @open-klaviyo="openKlaviyo"
          />
        </main>
      </template>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { commonUtil, translate } from "@common";
import {
  IonBackButton,
  IonButton,
  IonCard,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonPage,
  IonSegment,
  IonSegmentButton,
  IonSkeletonText,
  IonTitle,
  IonToolbar,
  alertController,
} from "@ionic/vue";
import { computed, ref, watch } from "vue";
import CarrierAccountReadiness from "@/components/carrier/CarrierAccountReadiness.vue";
import CarrierFacilityList from "@/components/carrier/CarrierFacilityList.vue";
import CarrierMethodList from "@/components/carrier/CarrierMethodList.vue";
import CarrierStoreMethodList from "@/components/carrier/CarrierStoreMethodList.vue";
import {
  CARRIER_ROLE_TYPE_ID,
  type CarrierShipmentMethod,
  type ProductStoreShipmentMethod,
  deleteCarrierShipmentMethod,
  enableCarrierShipmentMethod,
  renameCarrier,
  resequenceCarrierShipmentMethods,
  updateCarrierShipmentMethod,
  useCarrier,
} from "@/composables/useCarriers";
import { setCarrierFacilityAssociation } from "@/composables/useFacilities";
import { useProductStoreMutations } from "@/composables/useProductStores";
import { useShipmentMethodTypeMutations } from "@/composables/useSeed";
import {
  translateMutationError,
  translateReferenceDataError,
} from "@/utils/errorPresentation";
import { isCacheReconciliationError } from "@/utils/cacheReconciliationError";
import router from "@/router";

const props = defineProps<{
  partyId: string;
}>();

const {
  carrier,
  shipmentMethods,
  configuredShipmentMethods,
  facilities,
  productStores,
  productStoreShipmentMethods,
  readiness,
  remote,
  hydrated,
  detailErrors,
  readyForMutation,
} = useCarrier(props.partyId);
const {
  createShipmentMethodType,
  renameShipmentMethodType,
} = useShipmentMethodTypeMutations();

const segment = ref("methods");
const configuredOnly = ref(false);
const pendingActions = ref<Set<string>>(new Set());
const pendingKeys = computed(() => [...pendingActions.value]);
const hasPendingMutation = computed(() => pendingActions.value.size > 0);
const validSegments = computed(() => [
  "methods",
  "facilities",
  ...productStores.value.map((store) => `store:${store.productStoreId}`),
  "account",
]);
const selectedStore = computed(() => {
  if(!segment.value.startsWith("store:")) {
    return undefined;
  }

  const productStoreId = segment.value.slice("store:".length);

  return productStores.value.find((store) =>
    String(store.productStoreId) === productStoreId);
});
const detailErrorMessages = computed(() => [...new Set(Object.values(detailErrors.value)
  .map((message) => String(message).trim())
  .filter(Boolean))]);
const hasDetailErrors = computed(() => detailErrorMessages.value.length > 0);

watch(validSegments, (segments) => {
  if(!segments.includes(segment.value)) {
    segment.value = "methods";
  }
}, { immediate: true });

function addPending(key: string) {
  pendingActions.value = new Set([...pendingActions.value, key]);
}

function removePending(key: string) {
  const next = new Set(pendingActions.value);
  next.delete(key);
  pendingActions.value = next;
}

async function runAction(
  key: string,
  action: () => Promise<unknown>,
  successMessage: string,
  failureMessage: string,
) {
  if(!readyForMutation.value || hasPendingMutation.value) {
    return false;
  }

  addPending(key);
  try {
    await action();
    commonUtil.showToast(translate(successMessage));

    return true;
  } catch (error) {
    commonUtil.showToast(translateMutationError(error, failureMessage));

    // A cache-stage failure follows a committed server write. Dismiss an owning alert and never
    // invite a retry; readiness is already fail-closed on the worker's recorded domain error.
    return isCacheReconciliationError(error);
  } finally {
    removePending(key);
  }
}

function handleSegmentChange(event: CustomEvent<{ value?: string | number }>) {
  const value = String(event.detail.value ?? "");
  if(validSegments.value.includes(value)) {
    segment.value = value;
  }
}

async function openRenameCarrierAlert() {
  if(!readyForMutation.value || hasPendingMutation.value) {
    return;
  }

  const alert = await alertController.create({
    header: translate("Rename carrier"),
    inputs: [
      {
        name: "groupName",
        type: "text",
        value: carrier.value?.groupName || "",
        placeholder: translate("Carrier name"),
      },
    ],
    buttons: [
      {
        text: translate("Cancel"),
        role: "cancel",
      },
      {
        text: translate("Save"),
        handler: (data: Record<string, unknown>) => {
          const groupName = String(data.groupName ?? "").trim();
          if(!groupName) {
            commonUtil.showToast(translate("Carrier name is required."));

            return false;
          }

          return runAction(
            "carrier:rename",
            () => renameCarrier(props.partyId, groupName),
            "Carrier name updated.",
            "Failed to rename the carrier.",
          );
        },
      },
    ],
  });

  await alert.present();
}

function handleEnableMethod(method: CarrierShipmentMethod) {
  return runAction(
    `method:${method.shipmentMethodTypeId}:enable`,
    () => enableCarrierShipmentMethod(props.partyId, method.shipmentMethodTypeId),
    "Carrier shipment method enabled.",
    "Failed to enable the carrier shipment method.",
  );
}

async function openEditMethodAlert(method: CarrierShipmentMethod) {
  const key = `method:${method.shipmentMethodTypeId}:edit`;
  if(!readyForMutation.value || hasPendingMutation.value) {
    return;
  }

  const alert = await alertController.create({
    header: translate("Edit carrier shipment method"),
    subHeader: method.description || method.shipmentMethodTypeId,
    inputs: [
      {
        name: "carrierServiceCode",
        type: "text",
        value: method.carrierServiceCode ?? "",
        placeholder: translate("Carrier service code"),
      },
      {
        name: "deliveryDays",
        type: "number",
        value: method.deliveryDays ?? "",
        placeholder: translate("Delivery days"),
        min: 0,
      },
    ],
    buttons: [
      {
        text: translate("Cancel"),
        role: "cancel",
      },
      {
        text: translate("Save"),
        handler: (data: Record<string, unknown>) => {
          const rawDeliveryDays = String(data.deliveryDays ?? "").trim();
          const deliveryDays = rawDeliveryDays === "" ? "" : Number(rawDeliveryDays);
          if(deliveryDays !== "" && (!Number.isFinite(deliveryDays) || deliveryDays < 0)) {
            commonUtil.showToast(translate("Delivery days must be zero or greater."));

            return false;
          }

          return runAction(
            key,
            () => updateCarrierShipmentMethod(
              props.partyId,
              method.shipmentMethodTypeId,
              {
                carrierServiceCode: String(data.carrierServiceCode ?? "").trim(),
                deliveryDays,
              },
            ),
            "Carrier shipment method updated.",
            "Failed to update the carrier shipment method.",
          );
        },
      },
    ],
  });

  await alert.present();
}

async function openDeleteMethodAlert(method: CarrierShipmentMethod) {
  const key = `method:${method.shipmentMethodTypeId}:delete`;
  if(!readyForMutation.value || hasPendingMutation.value) {
    return;
  }

  const alert = await alertController.create({
    header: translate("Disable carrier shipment method"),
    message: translate("Any active product-store associations will be expired before this carrier method is permanently deleted. This cannot be undone."),
    buttons: [
      {
        text: translate("Cancel"),
        role: "cancel",
      },
      {
        text: translate("Disable method"),
        role: "destructive",
        handler: () => runAction(
          key,
          () => deleteCarrierShipmentMethod(
            props.partyId,
            method.shipmentMethodTypeId,
          ),
          "Carrier shipment method disabled.",
          "Failed to disable the carrier shipment method.",
        ),
      },
    ],
  });

  await alert.present();
}

async function openCreateTypeAlert() {
  const key = "method-type:create";
  if(!readyForMutation.value || hasPendingMutation.value) {
    return;
  }

  const alert = await alertController.create({
    header: translate("Create shipment method type"),
    inputs: [
      {
        name: "shipmentMethodTypeId",
        type: "text",
        placeholder: translate("Shipment method type ID"),
      },
      {
        name: "description",
        type: "text",
        placeholder: translate("Description"),
      },
    ],
    buttons: [
      {
        text: translate("Cancel"),
        role: "cancel",
      },
      {
        text: translate("Create"),
        handler: (data: Record<string, unknown>) => {
          const shipmentMethodTypeId =
            String(data.shipmentMethodTypeId ?? "").trim().toUpperCase();
          const description = String(data.description ?? "").trim();
          if(!shipmentMethodTypeId || !description) {
            commonUtil.showToast(translate("Shipment method type ID and description are required."));

            return false;
          }

          return runAction(
            key,
            () => createShipmentMethodType({ shipmentMethodTypeId, description }),
            "Shipment method type created.",
            "Failed to create the shipment method type.",
          );
        },
      },
    ],
  });

  await alert.present();
}

async function openRenameTypeAlert(method: CarrierShipmentMethod) {
  const key = `method:${method.shipmentMethodTypeId}:rename-type`;
  if(!readyForMutation.value || hasPendingMutation.value) {
    return;
  }

  const alert = await alertController.create({
    header: translate("Rename shipment method type"),
    subHeader: method.shipmentMethodTypeId,
    inputs: [
      {
        name: "description",
        type: "text",
        value: method.description ?? "",
        placeholder: translate("Description"),
      },
    ],
    buttons: [
      {
        text: translate("Cancel"),
        role: "cancel",
      },
      {
        text: translate("Save"),
        handler: (data: Record<string, unknown>) => {
          const description = String(data.description ?? "").trim();
          if(!description) {
            commonUtil.showToast(translate("Shipment method description is required."));

            return false;
          }

          return runAction(
            key,
            () => renameShipmentMethodType(method.shipmentMethodTypeId, description),
            "Shipment method type renamed.",
            "Failed to rename the shipment method type.",
          );
        },
      },
    ],
  });

  await alert.present();
}

function handleSaveOrder(methods: CarrierShipmentMethod[]) {
  return runAction(
    "methods:reorder",
    () => resequenceCarrierShipmentMethods(props.partyId, methods),
    "Carrier shipment method order saved.",
    "Failed to save the carrier shipment method order.",
  );
}

function handleFacilityToggle(payload: {
  facility: Record<string, any>;
  enabled: boolean;
}) {
  const { facility, enabled } = payload;

  return runAction(
    `facility:${facility.facilityId}`,
    () => setCarrierFacilityAssociation({
      partyId: props.partyId,
      facilityId: facility.facilityId,
      enabled,
      ...(!enabled ? { fromDate: facility.fromDate } : {}),
    }),
    enabled ? "Carrier associated with facility." : "Carrier removed from facility.",
    "Failed to update the carrier facility association.",
  );
}

function handleStoreAssociationToggle(payload: {
  method: CarrierShipmentMethod;
  association?: ProductStoreShipmentMethod;
  enabled: boolean;
}) {
  const store = selectedStore.value;
  if(!store) {
    return Promise.resolve(false);
  }

  const { method, association, enabled } = payload;
  const key =
    `store:${store.productStoreId}:${method.shipmentMethodTypeId}:association`;
  const mutations = useProductStoreMutations(store.productStoreId);

  return runAction(
    key,
    () => {
      if(enabled) {
        return mutations.addShipmentMethod({
          shipmentMethodTypeId: method.shipmentMethodTypeId,
          partyId: props.partyId,
          roleTypeId: CARRIER_ROLE_TYPE_ID,
        });
      }
      if(!association?.productStoreShipMethId) {
        throw new Error("The active product-store shipment method was not found.");
      }

      return mutations.expireShipmentMethod(association.productStoreShipMethId);
    },
    enabled
      ? "Carrier shipment method associated with store."
      : "Carrier shipment method removed from store.",
    "Failed to update the product-store shipment method.",
  );
}

function handleStoreTrackingToggle(payload: {
  method: CarrierShipmentMethod;
  association: ProductStoreShipmentMethod;
  required: boolean;
}) {
  const store = selectedStore.value;
  if(!store) {
    return Promise.resolve(false);
  }

  const { method, association, required } = payload;
  const key = `store:${store.productStoreId}:${method.shipmentMethodTypeId}:tracking`;
  const mutations = useProductStoreMutations(store.productStoreId);

  return runAction(
    key,
    () => mutations.updateShipmentMethod(
      association.productStoreShipMethId,
      { isTrackingRequired: required ? "Y" : "N" },
    ),
    "Tracking requirement updated.",
    "Failed to update the tracking requirement.",
  );
}

function openKlaviyo() {
  return router.push("/klaviyo");
}
</script>

<style scoped>
.carrier-detail,
.carrier-segments {
  width: 100%;
}
</style>
