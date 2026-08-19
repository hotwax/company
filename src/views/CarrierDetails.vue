<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-back-button default-href="/carriers" slot="start" />
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
          <ion-button
            slot="end"
            fill="outline"
            color="light"
            :disabled="retryingDetails || hasPendingMutation"
            @click="handleRetryDetails()"
          >
            {{ translate("Retry") }}
          </ion-button>
        </ion-item>

        <ion-item v-if="!carrier && !hasDetailErrors" lines="none">
          <ion-label class="ion-text-center ion-text-wrap">
            {{ translate("Carrier not found.") }}
          </ion-label>
        </ion-item>

        <main v-if="carrier" class="carrier-detail">
          <ion-list class="items-inline">
            <ion-item lines="none">
              <ion-icon slot="start" :icon="peopleOutline" />
              <ion-label>
                <p class="overline">{{ carrier.partyId }}</p>
                {{ carrier.groupName || carrier.partyId }}
              </ion-label>
              <ion-button
                slot="end"
                :disabled="!readyForMutation || hasPendingMutation"
                @click="openRenameCarrierAlert()"
              >
                {{ translate("Edit") }}
              </ion-button>
            </ion-item>

            <ion-item lines="none">
              <ion-icon slot="start" :icon="shieldCheckmarkOutline" />
              <ion-toggle
                v-if="selectedSegment !== 'shipping-methods'"
                :checked="true"
                :disabled="true"
              >
                {{ translate("Only methods for this carrier") }}
              </ion-toggle>
              <ion-toggle
                v-else
                v-model="configuredOnly"
              >
                {{ translate("Only methods for this carrier") }}
              </ion-toggle>
            </ion-item>
          </ion-list>
          <hr />

          <ion-segment
            v-model="selectedSegment"
            scrollable
          >
            <ion-segment-button value="shipping-methods">
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

          <div class="segments">
            <template v-if="selectedSegment === 'shipping-methods'">
              <ShipmentMethods
                :methods="shipmentMethods"
                :carrier-party-id="carrier.partyId"
                :configured-only="configuredOnly"
                :disabled="!readyForMutation || hasPendingMutation"
                :pending-keys="pendingKeys"
              />
            </template>

            <template v-else-if="selectedSegment === 'facilities'">
              <CarrierFacilityList
                :facilities="facilities"
                :disabled="!readyForMutation || hasPendingMutation"
                :pending-keys="pendingKeys"
                @toggle="handleFacilityToggle"
              />
            </template>

            <template v-else-if="selectedStore">
              <CarrierStoreMethodList
                :store="selectedStore"
                :methods="configuredShipmentMethods"
                :associations="productStoreShipmentMethods"
                :disabled="!readyForMutation || hasPendingMutation"
                :pending-keys="pendingKeys"
                @toggle-association="handleStoreAssociationToggle"
                @toggle-tracking="handleStoreTrackingToggle"
                @update-gateway="handleStoreGatewayUpdate"
              />
            </template>

            <template v-else-if="selectedSegment === 'account'">
              <CarrierAccountReadiness
                :readiness="readiness"
                :remote="remote"
                @open-klaviyo="openKlaviyo"
              />
            </template>
          </div>
        </main>
      </template>
    </ion-content>

    <ion-fab
      v-if="selectedSegment === 'shipping-methods' && carrier"
      vertical="bottom"
      horizontal="end"
      slot="fixed"
    >
      <ion-fab-button
        :disabled="!readyForMutation || hasPendingMutation"
        @click="openCreateShipmentMethodModal()"
      >
        <ion-icon :icon="addOutline" />
      </ion-fab-button>
    </ion-fab>
  </ion-page>
</template>

<script setup lang="ts">
import { commonUtil, translate } from "@common";
import {
  IonBackButton,
  IonButton,
  IonCard,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonPage,
  IonSegment,
  IonSegmentButton,
  IonSkeletonText,
  IonTitle,
  IonToggle,
  IonToolbar,
  alertController,
  modalController,
} from "@ionic/vue";
import { addOutline, peopleOutline, shieldCheckmarkOutline } from "ionicons/icons";
import { computed, ref, watch } from "vue";
import CarrierAccountReadiness from "@/components/carrier/CarrierAccountReadiness.vue";
import CarrierFacilityList from "@/components/carrier/CarrierFacilityList.vue";
import CarrierStoreMethodList from "@/components/carrier/CarrierStoreMethodList.vue";
import ShipmentMethods from "@/components/carrier/ShipmentMethods.vue";
import CreateShipmentMethodModal from "@/components/carrier/CreateShipmentMethodModal.vue";
import {
  type CarrierShipmentMethod,
  type ProductStoreShipmentMethod,
  renameCarrier,
  useCarrier,
} from "@/composables/useCarriers";
import { setCarrierFacilityAssociation } from "@/composables/useFacilities";
import {
  addProductStoreShipmentMethod,
  expireProductStoreShipmentMethod,
  updateProductStoreShipmentMethod,
} from "@/composables/useProductStores";
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
  hasDetailErrors,
  detailErrorMessages,
  readyForMutation,
  refreshDetails,
} = useCarrier(props.partyId);

const selectedSegment = ref("shipping-methods");
const configuredOnly = ref(true);
const retryingDetails = ref(false);
const pendingActionKeys = ref(new Set<string>());

const hasPendingMutation = computed(() => pendingActionKeys.value.size > 0);
const pendingKeys = computed(() => Array.from(pendingActionKeys.value));

const selectedStore = computed(() => {
  if (!selectedSegment.value.startsWith("store:")) {
    return undefined;
  }
  const storeId = selectedSegment.value.slice("store:".length);
  return productStores.value.find((store) => store.productStoreId === storeId);
});

watch(productStores, (stores) => {
  if (selectedSegment.value.startsWith("store:")) {
    const storeId = selectedSegment.value.slice("store:".length);
    if (!stores.some((store) => store.productStoreId === storeId)) {
      selectedSegment.value = "shipping-methods";
    }
  }
});

function addPendingKey(key: string) {
  const next = new Set(pendingActionKeys.value);
  next.add(key);
  pendingActionKeys.value = next;
}

function removePendingKey(key: string) {
  const next = new Set(pendingActionKeys.value);
  next.delete(key);
  pendingActionKeys.value = next;
}

async function runGuardedMutation(
  key: string,
  operation: () => Promise<void>,
  successMessage?: string,
  errorMessage = "Failed to update the carrier.",
): Promise<boolean> {
  addPendingKey(key);
  try {
    await operation();
    if (successMessage) {
      commonUtil.showToast(translate(successMessage));
    }
    return true;
  } catch (error: any) {
    if (isCacheReconciliationError(error)) {
      commonUtil.showToast(translateMutationError(error, errorMessage));
      return true;
    }
    commonUtil.showToast(translateMutationError(error, errorMessage));
    return false;
  } finally {
    removePendingKey(key);
  }
}

const openCreateShipmentMethodModal = async () => {
  const modal = await modalController.create({
    component: CreateShipmentMethodModal,
    componentProps: {
      carrierPartyId: props.partyId,
    },
  });
  return modal.present();
};

const openRenameCarrierAlert = async () => {
  if (!carrier.value) return;

  const alert = await alertController.create({
    header: translate("Edit carrier detail"),
    inputs: [{
      name: "groupName",
      value: carrier.value.groupName || carrier.value.partyId,
    }],
    buttons: [
      { text: translate("Cancel"), role: "cancel" },
      {
        text: translate("Save"),
        handler: async (data) => {
          const newName = data.groupName?.trim();
          if (!newName) {
            commonUtil.showToast(translate("Carrier name can not be empty."));
            return false;
          }
          if (newName !== carrier.value?.groupName) {
            return await runGuardedMutation(
              `carrier:${carrier.value?.partyId}:rename`,
              () => renameCarrier(carrier.value!.partyId, newName),
              "Carrier name updated.",
              "Failed to rename the carrier.",
            );
          }
          return true;
        },
      },
    ],
  });
  await alert.present();
};

const handleFacilityToggle = async ({
  facility,
  enabled,
}: {
  facility: Record<string, any>;
  enabled: boolean;
}) => {
  if (!carrier.value) return;
  const key = `facility:${facility.facilityId}`;
  await runGuardedMutation(
    key,
    () =>
      setCarrierFacilityAssociation({
        partyId: carrier.value!.partyId,
        facilityId: facility.facilityId,
        enabled,
      }),
    enabled
      ? "Facility associated with carrier."
      : "Facility association removed.",
    "Failed to update the carrier facility association.",
  );
};

const handleStoreAssociationToggle = async ({
  method,
  association,
  enabled,
}: {
  method: CarrierShipmentMethod;
  association?: ProductStoreShipmentMethod;
  enabled: boolean;
}) => {
  const store = selectedStore.value;
  if (!store || !carrier.value) return;

  const key = `store:${store.productStoreId}:${method.shipmentMethodTypeId}:association`;
  await runGuardedMutation(
    key,
    async () => {
      if (enabled) {
        await addProductStoreShipmentMethod(store.productStoreId, {
          productStoreId: store.productStoreId,
          shipmentMethodTypeId: method.shipmentMethodTypeId,
          partyId: carrier.value!.partyId,
          roleTypeId: "CARRIER",
          isTrackingRequired: false,
        });
      } else if (association?.productStoreShipMethId) {
        await expireProductStoreShipmentMethod(
          store.productStoreId,
          association.productStoreShipMethId,
        );
      }
    },
    enabled
      ? "Shipment method associated with store."
      : "Store shipment method association removed.",
    "Failed to update the carrier shipment method.",
  );
};

const handleStoreTrackingToggle = async ({
  method,
  association,
  required,
}: {
  method: CarrierShipmentMethod;
  association: ProductStoreShipmentMethod;
  required: boolean;
}) => {
  const store = selectedStore.value;
  if (!store || !association.productStoreShipMethId) return;

  const key = `store:${store.productStoreId}:${method.shipmentMethodTypeId}:tracking`;
  await runGuardedMutation(
    key,
    () =>
      updateProductStoreShipmentMethod(
        store.productStoreId,
        association.productStoreShipMethId!,
        { isTrackingRequired: required ? "Y" : "N" },
      ),
    "Tracking requirement updated.",
    "Failed to update the carrier shipment method.",
  );
};

const handleStoreGatewayUpdate = async ({
  method,
  association,
  shipmentGatewayConfigId,
}: {
  method: CarrierShipmentMethod;
  association: ProductStoreShipmentMethod;
  shipmentGatewayConfigId?: string;
}) => {
  const store = selectedStore.value;
  if (!store || !association.productStoreShipMethId) return;

  const key = `store:${store.productStoreId}:${method.shipmentMethodTypeId}:gateway`;
  await runGuardedMutation(
    key,
    () =>
      updateProductStoreShipmentMethod(
        store.productStoreId,
        association.productStoreShipMethId!,
        { shipmentGatewayConfigId: shipmentGatewayConfigId || null },
      ),
    "Shipment gateway updated successfully.",
    "Failed to update the carrier shipment method.",
  );
};

const handleRetryDetails = async () => {
  if (retryingDetails.value) {
    return;
  }
  retryingDetails.value = true;
  try {
    await refreshDetails();
    commonUtil.showToast(translate("Carrier details refreshed."));
  } catch (err: any) {
    commonUtil.showToast(
      translateReferenceDataError(err?.message || "Failed to refresh carrier details."),
    );
  } finally {
    retryingDetails.value = false;
  }
};

const openKlaviyo = () => {
  router.push({ path: "/klaviyo" });
};
</script>

<style scoped>
ion-content > main {
  max-width: 1110px;
  margin-right: auto;
  margin-left: auto;
}

ion-content {
  --padding-bottom: 80px;
}

.items-inline {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(228px, 1fr));
  gap: var(--spacer-xs);
  align-items: start;
  margin-bottom: var(--spacer-lg);
}
</style>
