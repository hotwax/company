<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-back-button default-href="/carriers" slot="start" />
        <ion-title>{{ translate("Carrier details") }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <template v-if="currentCarrier">
        <ion-list class="items-inline">
          <ion-item lines="none">
            <ion-icon slot="start" :icon="peopleOutline" />
            <ion-label>
              <p class="overline">{{ currentCarrier.partyId }}</p>
              {{ currentCarrier.groupName }}
            </ion-label>
            <ion-button slot="end" @click="updateCarrierName">{{ translate("Edit") }}</ion-button>
          </ion-item>
          <ion-item lines="none">
            <ion-icon slot="start" :icon="shieldCheckmarkOutline" />
            <ion-toggle v-if="selectedSegment !== 'shipping-methods'" :checked="true" disabled>
              {{ translate("Only methods for this carrier") }}
            </ion-toggle>
            <ion-toggle v-else v-model="showSelectedMethods">
              {{ translate("Only methods for this carrier") }}
            </ion-toggle>
          </ion-item>
        </ion-list>
        <hr />

        <ion-segment scrollable v-model="selectedSegment">
          <ion-segment-button value="shipping-methods">
            <ion-label>{{ translate("Methods") }}</ion-label>
          </ion-segment-button>
          <ion-segment-button value="facilities">
            <ion-label>{{ translate("Facilities") }}</ion-label>
          </ion-segment-button>
          <ion-segment-button v-for="productStore in productStores" :key="productStore.productStoreId" :value="productStore.productStoreId">
            <ion-label>{{ productStore.storeName || productStore.productStoreId }}</ion-label>
          </ion-segment-button>
          <ion-segment-button value="account">
            <ion-label>{{ translate("Account") }}</ion-label>
          </ion-segment-button>
        </ion-segment>

        <div class="segments">
          <template v-if="selectedSegment === 'shipping-methods'">
            <CarrierShipmentMethods :show-selected="showSelectedMethods" />
          </template>

          <template v-else-if="selectedSegment === 'facilities'">
            <section v-if="facilities.length">
              <ion-card v-for="facility in facilities" :key="facility.facilityId">
                <ion-card-header>
                  <div>
                    <ion-card-title>{{ facility.facilityName }}</ion-card-title>
                    <ion-card-subtitle>{{ facility.facilityId }}</ion-card-subtitle>
                  </div>
                  <ion-checkbox :checked="facility.isChecked" @click="updateCarrierFacilityAssociation($event, facility)" />
                </ion-card-header>
              </ion-card>
            </section>
            <div v-else class="empty-state">
              <p>{{ translate("No data found") }}</p>
            </div>
          </template>

          <template v-for="productStore in productStores" :key="productStore.productStoreId">
            <template v-if="selectedSegment === productStore.productStoreId">
              <template v-if="carrierShipmentMethodsByProductStore[productStore.productStoreId]?.length">
                <div class="list-item ion-padding" v-for="shipmentMethod in carrierShipmentMethodsByProductStore[productStore.productStoreId]" :key="shipmentMethod.shipmentMethodTypeId">
                  <ion-item lines="none">
                    <ion-label>
                      {{ shipmentMethod.description || shipmentMethod.shipmentMethodTypeId }}
                      <p>{{ shipmentMethod.shipmentMethodTypeId }}</p>
                    </ion-label>
                  </ion-item>
                  <div class="tablet">
                    <ion-chip v-if="shipmentMethod.shipmentGatewayConfigId" outline @click.stop="updateShipmentGatewayConfigId(shipmentMethod)">
                      <ion-label>{{ getGatewayConfigDescription(shipmentMethod.shipmentGatewayConfigId) }}</ion-label>
                    </ion-chip>
                    <ion-chip v-else :disabled="!shipmentMethod.isChecked || !gatewayConfigAvailable" outline @click.stop="updateShipmentGatewayConfigId(shipmentMethod)">
                      <ion-icon :icon="addCircleOutline" />
                      <ion-label>{{ translate("gateway") }}</ion-label>
                    </ion-chip>
                    <ion-note class="config-label">{{ translate("gateway") }}</ion-note>
                  </div>
                  <div class="tablet">
                    <ion-toggle :checked="shipmentMethod.isTrackingRequired" :disabled="!shipmentMethod.isChecked" @ionChange="updateTrackingRequired($event, shipmentMethod)" />
                    <ion-note class="config-label">{{ translate("require tracking code") }}</ion-note>
                  </div>
                  <div class="tablet">
                    <ion-checkbox :checked="shipmentMethod.isChecked" @click="updateProductStoreShipmentMethodAssociation($event, shipmentMethod, productStore)" />
                  </div>
                </div>
                <ion-item v-if="!gatewayConfigAvailable" lines="none">
                  <ion-icon slot="start" :icon="alertCircleOutline" />
                  <ion-label>
                    {{ translate("Shipment gateway configuration unavailable") }}
                    <p>{{ translate("The OMS shipment-gateway configuration API is not available on this instance.") }}</p>
                  </ion-label>
                </ion-item>
              </template>
              <div v-else class="empty-state">
                <p>{{ translate("No data found") }}</p>
              </div>
            </template>
          </template>

          <template v-if="selectedSegment === 'account'">
            <ion-list inset>
              <ion-list-header>
                <ion-label>{{ translate("Unigate account") }}</ion-label>
              </ion-list-header>
              <ion-item>
                <ion-icon slot="start" :icon="statusIcon(unigateTenantStatus)" />
                <ion-label>
                  {{ translate("Unigate tenant") }}
                  <p>{{ unigateTenantDescription }}</p>
                </ion-label>
                <ion-badge slot="end" :color="statusColor(unigateTenantStatus)">{{ statusLabel(unigateTenantStatus) }}</ion-badge>
              </ion-item>
              <ion-item>
                <ion-icon slot="start" :icon="isAddressValidationCarrier ? helpCircleOutline : closeCircleOutline" />
                <ion-label>
                  {{ translate("Carrier credentials") }}
                  <p>{{ credentialDescription }}</p>
                </ion-label>
                <ion-badge slot="end" :color="isAddressValidationCarrier ? 'medium' : 'light'">
                  {{ isAddressValidationCarrier ? translate("Verification unavailable") : translate("Not applicable") }}
                </ion-badge>
              </ion-item>
              <ion-item v-if="isAddressValidationCarrier">
                <ion-icon slot="start" :icon="helpCircleOutline" />
                <ion-label>
                  {{ translate("Product store linkage") }}
                  <p>{{ translate("Linkage verification is unavailable until the OMS carrier API is exposed.") }}</p>
                </ion-label>
                <ion-badge slot="end" color="medium">{{ translate("Verification unavailable") }}</ion-badge>
              </ion-item>
              <ion-item>
                <ion-icon slot="start" :icon="isAddressValidationCarrier ? statusIcon(addressValidationStatus) : closeCircleOutline" />
                <ion-label>
                  {{ translate("Automatic address validation") }}
                  <p>{{ addressValidationDescription }}</p>
                </ion-label>
                <ion-badge slot="end" :color="isAddressValidationCarrier ? statusColor(addressValidationStatus) : 'light'">
                  {{ isAddressValidationCarrier ? statusLabel(addressValidationStatus) : translate("Not supported") }}
                </ion-badge>
              </ion-item>
              <ion-item lines="none">
                <ion-button fill="outline" @click="openUnigateConfigModal">
                  <ion-icon slot="start" :icon="serverOutline" />
                  {{ translate("Review Unigate tenant") }}
                </ion-button>
              </ion-item>
            </ion-list>
          </template>
        </div>
      </template>

      <div v-else-if="hasError" class="empty-state">
        <p>{{ translate("Carrier configuration could not be loaded") }}</p>
        <ion-button fill="outline" @click="loadDetail">{{ translate("Try again") }}</ion-button>
      </div>
    </ion-content>

    <ion-fab v-if="selectedSegment === 'shipping-methods'" vertical="bottom" horizontal="end" slot="fixed">
      <ion-fab-button @click="openCreateShipmentMethodModal">
        <ion-icon :icon="addOutline" />
      </ion-fab-button>
    </ion-fab>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import {
  IonBackButton,
  IonBadge,
  IonButton,
  IonCard,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonCheckbox,
  IonChip,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonNote,
  IonPage,
  IonSegment,
  IonSegmentButton,
  IonTitle,
  IonToggle,
  IonToolbar,
  alertController,
  modalController,
  onIonViewWillEnter,
} from "@ionic/vue";
import {
  addCircleOutline,
  addOutline,
  alertCircleOutline,
  checkmarkCircleOutline,
  closeCircleOutline,
  helpCircleOutline,
  peopleOutline,
  serverOutline,
  shieldCheckmarkOutline,
} from "ionicons/icons";
import { commonUtil, logger, translate } from "@common";
import CarrierShipmentMethods from "@/components/CarrierShipmentMethods.vue";
import CreateCarrierShipmentMethodModal from "@/components/CreateCarrierShipmentMethodModal.vue";
import KlaviyoUnigateConfigModal from "@/components/KlaviyoUnigateConfigModal.vue";
import { useCarrierStore } from "@/store/carrier";
import { useKlaviyoStore } from "@/store/klaviyo";
import { mergeCarrierShipmentMethods, mergeProductStoreShipmentMethods } from "@/utils/carrierManagement";
import { deriveAddressValidationReadiness, hasCompleteUnigateConfig, type ReadinessStatus } from "@/utils/carrierReadiness";

const props = defineProps<{ partyId: string }>();
const carrierStore = useCarrierStore();
const klaviyoStore = useKlaviyoStore();
const selectedSegment = ref("shipping-methods");
const showSelectedMethods = ref(false);

const currentCarrier = computed(() => carrierStore.getCurrent);
const hasError = computed(() => carrierStore.fetchStatus.detail === "error");
const productStores = computed(() => carrierStore.getProductStores || []);
const gatewayConfigAvailable = computed(() => carrierStore.gatewayConfigAvailable);
const facilities = computed(() => (carrierStore.getFacilities || []).map((facility: any) => ({
  ...facility,
  isChecked: carrierStore.getFacilityAssociationIds.has(facility.facilityId),
})));
const mergedShipmentMethods = computed(() => mergeCarrierShipmentMethods(
  carrierStore.getShipmentMethodTypes || [],
  carrierStore.getCarrierShipmentMethods || [],
));
const carrierShipmentMethodsByProductStore = computed(() => productStores.value.reduce((methodsByStore: Record<string, any[]>, productStore: any) => {
  methodsByStore[productStore.productStoreId] = mergeProductStoreShipmentMethods(
    carrierStore.getCarrierShipmentMethods || [],
    carrierStore.getProductStoreShipmentMethods || [],
    mergedShipmentMethods.value,
    productStore.productStoreId,
  ).map((method: any) => ({ ...method, isChecked: method.isConfigured }));
  return methodsByStore;
}, {}));

const isAddressValidationCarrier = computed(() => currentCarrier.value?.partyId === "FEDEX");
const readiness = computed(() => deriveAddressValidationReadiness({
  unigateConfig: klaviyoStore.getUnigateConfig,
  credentialStatus: "unavailable",
  storeLinkStatus: "unavailable",
}));
const unigateTenantStatus = computed<ReadinessStatus>(() => hasCompleteUnigateConfig(klaviyoStore.getUnigateConfig) ? "ready" : "action-required");
const addressValidationStatus = computed<ReadinessStatus>(() => readiness.value.addressValidation);
const unigateTenantDescription = computed(() => unigateTenantStatus.value === "ready"
  ? translate("Tenant ID, URL, and API key are configured on this OMS.")
  : translate("Configure the Unigate tenant ID, URL, and API key before carrier requests can run."));
const credentialDescription = computed(() => isAddressValidationCarrier.value
  ? translate("Credential verification and rotation are unavailable in Company until the OMS carrier API is exposed.")
  : translate("No address-validation credential is required for this carrier today."));
const addressValidationDescription = computed(() => {
  if (!isAddressValidationCarrier.value) return translate("Automatic sales-order address validation currently uses FedEx only.");
  if (addressValidationStatus.value === "action-required") return translate("Complete the Unigate tenant before automatic address validation can be ready.");
  return translate("Readiness cannot be confirmed until the credential and product-store link can be verified.");
});

onIonViewWillEnter(loadDetail);

async function loadDetail() {
  await Promise.all([
    carrierStore.fetchCarrierDetail(props.partyId),
    klaviyoStore.fetchUnigateConfig(),
  ]);
}

async function mutate(operation: () => Promise<any>, successMessage: string, errorMessage: string) {
  try {
    const response = await operation();
    if (commonUtil.hasError(response)) throw response.data;
    commonUtil.showToast(translate(successMessage));
    await carrierStore.fetchCarrierDetail(props.partyId);
  } catch (error) {
    logger.error(errorMessage, error);
    commonUtil.showToast(translate(errorMessage));
  }
}

async function updateCarrierName() {
  const alert = await alertController.create({
    header: translate("Edit carrier detail"),
    inputs: [{ name: "groupName", value: currentCarrier.value?.groupName || "" }],
    buttons: [
      { text: translate("Cancel"), role: "cancel" },
      {
        text: translate("Confirm"),
        handler: async (data: any) => {
          const groupName = String(data.groupName || "").trim();
          if (!groupName) return false;
          await mutate(
            () => carrierStore.updateCarrierName(props.partyId, groupName),
            "Carrier name updated successfully.",
            "Carrier configuration could not be updated",
          );
        },
      },
    ],
  });
  await alert.present();
}

async function openCreateShipmentMethodModal() {
  const modal = await modalController.create({ component: CreateCarrierShipmentMethodModal });
  await modal.present();
}

async function updateCarrierFacilityAssociation(event: Event, facility: any) {
  event.preventDefault();
  event.stopImmediatePropagation();
  const enabled = !facility.isChecked;
  await mutate(
    () => carrierStore.setFacilityAssociation(props.partyId, facility, enabled),
    "Facility carrier association updated successfully.",
    "Failed to update facility carrier association.",
  );
}

function getGatewayConfigDescription(shipmentGatewayConfigId: string) {
  const config = (carrierStore.getShipmentGatewayConfigs || []).find((item: any) => item.shipmentGatewayConfigId === shipmentGatewayConfigId);
  return config?.description || shipmentGatewayConfigId;
}

async function updateShipmentGatewayConfigId(shipmentMethod: any) {
  if (!gatewayConfigAvailable.value) return;
  const alert = await alertController.create({
    header: translate("Edit gateway"),
    inputs: (carrierStore.getShipmentGatewayConfigs || []).map((config: any) => ({
      type: "radio",
      label: config.description || config.shipmentGatewayConfigId,
      value: config.shipmentGatewayConfigId,
      checked: config.shipmentGatewayConfigId === shipmentMethod.shipmentGatewayConfigId,
    })),
    buttons: [
      { text: translate("Cancel"), role: "cancel" },
      {
        text: translate("Confirm"),
        handler: (shipmentGatewayConfigId: string) => mutate(
          () => carrierStore.updateProductStoreShipmentMethod(shipmentMethod.productStoreId, shipmentMethod, { shipmentGatewayConfigId }),
          "Shipment gateway updated successfully.",
          "Failed to update shipment gateway.",
        ),
      },
    ],
  });
  await alert.present();
}

async function updateTrackingRequired(event: CustomEvent, shipmentMethod: any) {
  event.stopPropagation();
  await mutate(
    () => carrierStore.updateProductStoreShipmentMethod(shipmentMethod.productStoreId, shipmentMethod, { isTrackingRequired: event.detail.checked ? "Y" : "N" }),
    "Tracking code settings updated successfully.",
    "Failed to update tracking code settings.",
  );
}

async function updateProductStoreShipmentMethodAssociation(event: Event, shipmentMethod: any, productStore: any) {
  event.preventDefault();
  event.stopImmediatePropagation();
  const enabled = !shipmentMethod.isChecked;
  await mutate(
    () => carrierStore.setProductStoreShipmentMethod(productStore.productStoreId, { ...shipmentMethod, partyId: props.partyId }, enabled),
    enabled ? "Shipment method associated with product store successfully" : "Shipment method disassociated from product store successfully",
    enabled ? "Failed to associate shipment method with product store" : "Failed to disassociate shipment method from product store",
  );
}

function statusColor(status: ReadinessStatus) {
  if (status === "ready") return "success";
  if (status === "action-required") return "warning";
  return "medium";
}

function statusLabel(status: ReadinessStatus) {
  if (status === "ready") return translate("Ready");
  if (status === "action-required") return translate("Action needed");
  return translate("Verification unavailable");
}

function statusIcon(status: ReadinessStatus) {
  if (status === "ready") return checkmarkCircleOutline;
  if (status === "action-required") return alertCircleOutline;
  return helpCircleOutline;
}

async function openUnigateConfigModal() {
  const modal = await modalController.create({
    component: KlaviyoUnigateConfigModal,
    componentProps: { context: "shipping" },
  });
  modal.onDidDismiss().then(() => klaviyoStore.fetchUnigateConfig());
  await modal.present();
}
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
ion-card-header {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
}
ion-card-header > ion-checkbox {
  flex-shrink: 0;
}
section {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
}
</style>
