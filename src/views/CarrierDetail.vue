<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/carriers" />
        </ion-buttons>
        <ion-title>{{ translate("Carrier details") }}</ion-title>
        <ion-buttons slot="end">
          <ion-button :disabled="isLoading" @click="loadDetail" :aria-label="translate('Refresh carrier')">
            <ion-icon slot="icon-only" :icon="refreshOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-list v-if="isLoading" inset>
        <ion-item v-for="item in 4" :key="item">
          <ion-label>
            <ion-skeleton-text animated />
            <p><ion-skeleton-text animated /></p>
          </ion-label>
        </ion-item>
      </ion-list>

      <ion-list v-else-if="hasError" inset>
        <ion-item color="danger">
          <ion-icon slot="start" :icon="alertCircleOutline" />
          <ion-label>
            {{ translate("Carrier configuration could not be loaded") }}
            <p>{{ translate("Check your OMS connection and try again.") }}</p>
          </ion-label>
          <ion-button slot="end" fill="outline" @click="loadDetail">{{ translate("Try again") }}</ion-button>
        </ion-item>
      </ion-list>

      <template v-else-if="carrier">
        <ion-list inset>
          <ion-item>
            <ion-icon slot="start" :icon="airplaneOutline" />
            <ion-label>
              {{ carrier.groupName || carrier.partyId }}
              <p>{{ carrier.partyId }}</p>
            </ion-label>
            <ion-button slot="end" fill="outline" @click="editCarrierName">{{ translate("Edit name") }}</ion-button>
          </ion-item>
        </ion-list>

        <ion-segment v-model="section" scrollable>
          <ion-segment-button value="methods"><ion-label>{{ translate("Methods") }}</ion-label></ion-segment-button>
          <ion-segment-button value="facilities"><ion-label>{{ translate("Facilities") }}</ion-label></ion-segment-button>
          <ion-segment-button value="stores"><ion-label>{{ translate("Product stores") }}</ion-label></ion-segment-button>
          <ion-segment-button value="unigate"><ion-label>{{ translate("Unigate") }}</ion-label></ion-segment-button>
        </ion-segment>

        <template v-if="section === 'methods'">
          <ion-list inset>
            <ion-list-header>
              <ion-label>{{ translate("Carrier shipment methods") }}</ion-label>
            </ion-list-header>
            <ion-item>
              <ion-toggle v-model="showConfiguredMethods" justify="space-between">
                {{ translate("Only methods configured for this carrier") }}
              </ion-toggle>
            </ion-item>
            <ion-item v-for="method in visibleCarrierMethods" :key="method.shipmentMethodTypeId">
              <ion-label>
                {{ method.description || method.shipmentMethodTypeId }}
                <p>{{ method.shipmentMethodTypeId }}</p>
                <p v-if="method.isConfigured">
                  {{ translate("Service code") }}: {{ method.carrierServiceCode || translate("Not set") }}
                  {{ translate("Delivery days") }}: {{ method.deliveryDays || translate("Not set") }}
                </p>
              </ion-label>
              <ion-button
                v-if="method.isConfigured"
                slot="end"
                fill="clear"
                :disabled="isBusy(`method-${method.shipmentMethodTypeId}`)"
                @click="editCarrierMethod(method)"
              >
                {{ translate("Configure") }}
              </ion-button>
              <ion-toggle
                slot="end"
                :checked="method.isConfigured"
                :disabled="isBusy(`method-${method.shipmentMethodTypeId}`)"
                :aria-label="translate('Enable shipment method')"
                @ionChange="toggleCarrierMethod(method, $event.detail.checked)"
              />
            </ion-item>
            <ion-item v-if="!visibleCarrierMethods.length" lines="none">
              <ion-label>{{ translate("No shipment methods configured for this carrier") }}</ion-label>
            </ion-item>
          </ion-list>
        </template>

        <template v-else-if="section === 'facilities'">
          <ion-card>
            <ion-card-content>
              <ion-searchbar v-model="facilityQuery" :placeholder="translate('Search facilities')" :debounce="200" />
            </ion-card-content>
          </ion-card>
          <ion-list inset>
            <ion-list-header><ion-label>{{ translate("Facility availability") }}</ion-label></ion-list-header>
            <ion-item v-for="facility in filteredFacilities" :key="facility.facilityId">
              <ion-label>
                {{ facility.facilityName || facility.facilityId }}
                <p>{{ facility.facilityId }}</p>
              </ion-label>
              <ion-toggle
                slot="end"
                :checked="facilityAssociationIds.has(facility.facilityId)"
                :disabled="isBusy(`facility-${facility.facilityId}`)"
                :aria-label="translate('Enable carrier at facility')"
                @ionChange="toggleFacility(facility, $event.detail.checked)"
              />
            </ion-item>
            <ion-item v-if="!filteredFacilities.length" lines="none">
              <ion-label>{{ translate("No facilities match your search") }}</ion-label>
            </ion-item>
          </ion-list>
        </template>

        <template v-else-if="section === 'stores'">
          <ion-list inset>
            <ion-list-header><ion-label>{{ translate("Product-store configuration") }}</ion-label></ion-list-header>
            <ion-item v-if="productStores.length">
              <ion-select v-model="selectedProductStoreId" :label="translate('Product store')" label-placement="stacked" interface="popover">
                <ion-select-option v-for="store in productStores" :key="store.productStoreId" :value="store.productStoreId">
                  {{ store.storeName || store.productStoreId }}
                </ion-select-option>
              </ion-select>
            </ion-item>
            <ion-item v-else>
              <ion-label>{{ translate("No product stores found") }}</ion-label>
            </ion-item>
          </ion-list>

          <ion-list v-if="selectedProductStoreId" inset>
            <ion-item v-if="!carrierMethods.length" lines="none">
              <ion-label>
                {{ translate("Configure a carrier shipment method first") }}
                <p>{{ translate("Product stores can only use shipment methods enabled on this carrier.") }}</p>
              </ion-label>
            </ion-item>
            <template v-for="method in productStoreMethods" :key="method.shipmentMethodTypeId">
              <ion-item>
                <ion-label>
                  {{ method.description || method.shipmentMethodTypeId }}
                  <p>{{ method.shipmentMethodTypeId }}</p>
                </ion-label>
                <ion-toggle
                  slot="end"
                  :checked="method.isConfigured"
                  :disabled="isBusy(`store-${selectedProductStoreId}-${method.shipmentMethodTypeId}`)"
                  :aria-label="translate('Enable method for product store')"
                  @ionChange="toggleProductStoreMethod(method, $event.detail.checked)"
                />
              </ion-item>
              <ion-item v-if="method.isConfigured">
                <ion-toggle
                  :checked="method.isTrackingRequired"
                  :disabled="isBusy(`store-${selectedProductStoreId}-${method.shipmentMethodTypeId}`)"
                  justify="space-between"
                  @ionChange="updateTrackingRequired(method, $event.detail.checked)"
                >
                  {{ translate("Require tracking code") }}
                </ion-toggle>
              </ion-item>
              <ion-item v-if="method.isConfigured && gatewayConfigAvailable">
                <ion-select
                  :value="method.shipmentGatewayConfigId || ''"
                  :label="translate('Shipment gateway')"
                  label-placement="stacked"
                  interface="popover"
                  @ionChange="updateShipmentGateway(method, $event.detail.value)"
                >
                  <ion-select-option value="">{{ translate("None") }}</ion-select-option>
                  <ion-select-option v-for="config in shipmentGatewayConfigs" :key="config.shipmentGatewayConfigId" :value="config.shipmentGatewayConfigId">
                    {{ config.description || config.shipmentGatewayConfigId }}
                  </ion-select-option>
                </ion-select>
              </ion-item>
            </template>
            <ion-item v-if="carrierMethods.length && !gatewayConfigAvailable" color="warning">
              <ion-icon slot="start" :icon="alertCircleOutline" />
              <ion-label>
                {{ translate("Shipment gateway configuration unavailable") }}
                <p>{{ translate("The OMS shipment-gateway configuration API is not available on this instance.") }}</p>
              </ion-label>
            </ion-item>
          </ion-list>
        </template>

        <template v-else>
          <ion-card>
            <ion-card-header>
              <ion-card-title>{{ translate("Unigate configuration") }}</ion-card-title>
            </ion-card-header>
            <ion-card-content>
              <p v-if="isAddressValidationCarrier">{{ translate("FedEx is currently used for automatic sales-order address validation through Unigate.") }}</p>
              <p v-else>{{ translate("This carrier is not currently used by automatic sales-order address validation.") }}</p>
            </ion-card-content>
          </ion-card>

          <ion-list inset>
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
                <p>{{ isAddressValidationCarrier
                  ? translate("Credential verification and rotation are unavailable in Company until the OMS carrier API is exposed.")
                  : translate("No address-validation credential is required for this carrier today.")
                }}</p>
              </ion-label>
              <ion-badge slot="end" :color="isAddressValidationCarrier ? 'medium' : 'light'">
                {{ isAddressValidationCarrier ? translate("Verification unavailable") : translate("Not applicable") }}
              </ion-badge>
            </ion-item>
            <ion-item v-if="isAddressValidationCarrier">
              <ion-icon slot="start" :icon="helpCircleOutline" />
              <ion-label>
                {{ translate("Product store linkage") }}
                <p>{{ selectedStoreName }}: {{ translate("Linkage verification is unavailable until the OMS carrier API is exposed.") }}</p>
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
          </ion-list>

          <ion-list inset>
            <ion-item v-if="productStores.length">
              <ion-select v-model="selectedProductStoreId" :label="translate('Product store scope')" label-placement="stacked" interface="popover">
                <ion-select-option v-for="store in productStores" :key="store.productStoreId" :value="store.productStoreId">
                  {{ store.storeName || store.productStoreId }}
                </ion-select-option>
              </ion-select>
            </ion-item>
            <ion-item lines="none">
              <ion-button expand="block" fill="outline" @click="openUnigateConfigModal">
                <ion-icon slot="start" :icon="serverOutline" />
                {{ translate("Review Unigate tenant") }}
              </ion-button>
            </ion-item>
          </ion-list>
        </template>
      </template>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  IonBackButton,
  IonBadge,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonPage,
  IonSearchbar,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonSkeletonText,
  IonTitle,
  IonToggle,
  IonToolbar,
  alertController,
  modalController,
  onIonViewWillEnter,
} from "@ionic/vue";
import {
  airplaneOutline,
  alertCircleOutline,
  checkmarkCircleOutline,
  closeCircleOutline,
  helpCircleOutline,
  refreshOutline,
  serverOutline,
} from "ionicons/icons";
import { commonUtil, logger, translate } from "@common";
import KlaviyoUnigateConfigModal from "@/components/KlaviyoUnigateConfigModal.vue";
import { useCarrierStore } from "@/store/carrier";
import { useKlaviyoStore } from "@/store/klaviyo";
import {
  deriveAddressValidationReadiness,
  hasCompleteUnigateConfig,
  type ReadinessStatus,
} from "@/utils/carrierReadiness";
import {
  mergeCarrierShipmentMethods,
  mergeProductStoreShipmentMethods,
} from "@/utils/carrierManagement";

const props = defineProps<{ partyId: string }>();
const carrierStore = useCarrierStore();
const klaviyoStore = useKlaviyoStore();
const section = ref("methods");
const facilityQuery = ref("");
const showConfiguredMethods = ref(false);
const selectedProductStoreId = ref("");
const busyKeys = ref(new Set<string>());

const carrier = computed(() => carrierStore.getCurrent);
const isLoading = computed(() => carrierStore.fetchStatus.detail === "pending");
const hasError = computed(() => carrierStore.fetchStatus.detail === "error");
const carrierMethods = computed(() => carrierStore.getCarrierShipmentMethods || []);
const shipmentMethods = computed(() => mergeCarrierShipmentMethods(
  carrierStore.getShipmentMethodTypes || [],
  carrierMethods.value,
));
const visibleCarrierMethods = computed(() => showConfiguredMethods.value
  ? shipmentMethods.value.filter((method: any) => method.isConfigured)
  : shipmentMethods.value
);
const facilityAssociationIds = computed(() => carrierStore.getFacilityAssociationIds);
const filteredFacilities = computed(() => {
  const normalized = facilityQuery.value.trim().toLowerCase();
  const facilities = carrierStore.getFacilities || [];
  if (!normalized) return facilities;
  return facilities.filter((facility: any) => (
    String(facility.facilityId || "").toLowerCase().includes(normalized)
    || String(facility.facilityName || "").toLowerCase().includes(normalized)
  ));
});
const productStores = computed(() => carrierStore.getProductStores || []);
const productStoreMethods = computed(() => mergeProductStoreShipmentMethods(
  carrierMethods.value,
  carrierStore.getProductStoreShipmentMethods || [],
  shipmentMethods.value,
  selectedProductStoreId.value,
));
const gatewayConfigAvailable = computed(() => carrierStore.gatewayConfigAvailable);
const shipmentGatewayConfigs = computed(() => carrierStore.getShipmentGatewayConfigs || []);
const isAddressValidationCarrier = computed(() => carrier.value?.partyId === "FEDEX");
const readiness = computed(() => deriveAddressValidationReadiness({
  unigateConfig: klaviyoStore.getUnigateConfig,
  credentialStatus: "unavailable",
  storeLinkStatus: "unavailable",
}));
const unigateTenantStatus = computed<ReadinessStatus>(() => hasCompleteUnigateConfig(klaviyoStore.getUnigateConfig) ? "ready" : "action-required");
const addressValidationStatus = computed<ReadinessStatus>(() => readiness.value.addressValidation);
const selectedStoreName = computed(() => productStores.value.find((store: any) => store.productStoreId === selectedProductStoreId.value)?.storeName || translate("Selected product store"));
const unigateTenantDescription = computed(() => unigateTenantStatus.value === "ready"
  ? translate("Tenant ID, URL, and API key are configured on this OMS.")
  : translate("Configure the Unigate tenant ID, URL, and API key before carrier requests can run."));
const addressValidationDescription = computed(() => {
  if (!isAddressValidationCarrier.value) return translate("Automatic sales-order address validation currently uses FedEx only.");
  if (addressValidationStatus.value === "action-required") return translate("Complete the Unigate tenant before automatic address validation can be ready.");
  return translate("Readiness cannot be confirmed until the credential and product-store link can be verified.");
});

watch(productStores, (stores) => {
  if (!stores.length) {
    selectedProductStoreId.value = "";
  } else if (!stores.some((store: any) => store.productStoreId === selectedProductStoreId.value)) {
    selectedProductStoreId.value = stores[0].productStoreId;
  }
}, { immediate: true });

onIonViewWillEnter(loadDetail);

async function loadDetail() {
  await Promise.all([
    carrierStore.fetchCarrierDetail(props.partyId),
    klaviyoStore.fetchUnigateConfig(),
  ]);
}

function isBusy(key: string) {
  return busyKeys.value.has(key);
}

async function runMutation(key: string, operation: () => Promise<any>, successMessage: string) {
  busyKeys.value = new Set([...busyKeys.value, key]);
  try {
    const response = await operation();
    if (commonUtil.hasError(response)) throw response.data;
    commonUtil.showToast(translate(successMessage));
    await carrierStore.fetchCarrierDetail(props.partyId);
  } catch (error) {
    logger.error(error);
    commonUtil.showToast(translate("Carrier configuration could not be updated"));
  } finally {
    const next = new Set(busyKeys.value);
    next.delete(key);
    busyKeys.value = next;
  }
}

async function editCarrierName() {
  const alert = await alertController.create({
    header: translate("Edit carrier name"),
    inputs: [{ name: "groupName", value: carrier.value?.groupName || "", placeholder: translate("Carrier name") }],
    buttons: [
      { text: translate("Cancel"), role: "cancel" },
      {
        text: translate("Save"),
        handler: async (data: any) => {
          const groupName = String(data.groupName || "").trim();
          if (!groupName) return false;
          await runMutation("carrier-name", () => carrierStore.updateCarrierName(props.partyId, groupName), "Carrier name updated");
        },
      },
    ],
  });
  await alert.present();
}

async function toggleCarrierMethod(method: any, enabled: boolean) {
  const key = `method-${method.shipmentMethodTypeId}`;
  await runMutation(key, async () => {
    if (!enabled) {
      const associations = (carrierStore.getProductStoreShipmentMethods || []).filter((item: any) => item.shipmentMethodTypeId === method.shipmentMethodTypeId);
      for (const association of associations) {
        await carrierStore.setProductStoreShipmentMethod(association.productStoreId, association, false);
      }
    }
    return carrierStore.setCarrierShipmentMethod(props.partyId, method.shipmentMethodTypeId, enabled);
  }, enabled ? "Shipment method enabled" : "Shipment method disabled");
}

async function editCarrierMethod(method: any) {
  const alert = await alertController.create({
    header: translate("Configure shipment method"),
    inputs: [
      { name: "carrierServiceCode", value: method.carrierServiceCode || "", placeholder: translate("Carrier service code") },
      { name: "deliveryDays", value: method.deliveryDays || "", type: "number", min: 1, placeholder: translate("Delivery days") },
    ],
    buttons: [
      { text: translate("Cancel"), role: "cancel" },
      {
        text: translate("Save"),
        handler: async (data: any) => {
          const carrierServiceCode = String(data.carrierServiceCode || "").trim();
          const deliveryDays = String(data.deliveryDays || "").trim();
          if (carrierServiceCode && !commonUtil.isValidCarrierCode(carrierServiceCode)) {
            commonUtil.showToast(translate("Carrier service code must be alphanumeric."));
            return false;
          }
          if (deliveryDays && !commonUtil.isValidDeliveryDays(deliveryDays)) {
            commonUtil.showToast(translate("Delivery days must be a positive number."));
            return false;
          }
          await runMutation(
            `method-${method.shipmentMethodTypeId}`,
            () => carrierStore.updateCarrierShipmentMethod(props.partyId, method.shipmentMethodTypeId, { carrierServiceCode, deliveryDays }),
            "Shipment method updated",
          );
        },
      },
    ],
  });
  await alert.present();
}

async function toggleFacility(facility: any, enabled: boolean) {
  await runMutation(
    `facility-${facility.facilityId}`,
    () => carrierStore.setFacilityAssociation(props.partyId, facility, enabled),
    enabled ? "Carrier enabled at facility" : "Carrier disabled at facility",
  );
}

async function toggleProductStoreMethod(method: any, enabled: boolean) {
  await runMutation(
    `store-${selectedProductStoreId.value}-${method.shipmentMethodTypeId}`,
    () => carrierStore.setProductStoreShipmentMethod(selectedProductStoreId.value, { ...method, partyId: props.partyId }, enabled),
    enabled ? "Shipment method enabled for product store" : "Shipment method disabled for product store",
  );
}

async function updateTrackingRequired(method: any, enabled: boolean) {
  await runMutation(
    `store-${selectedProductStoreId.value}-${method.shipmentMethodTypeId}`,
    () => carrierStore.updateProductStoreShipmentMethod(selectedProductStoreId.value, method, { isTrackingRequired: enabled ? "Y" : "N" }),
    "Tracking requirement updated",
  );
}

async function updateShipmentGateway(method: any, shipmentGatewayConfigId: string) {
  await runMutation(
    `store-${selectedProductStoreId.value}-${method.shipmentMethodTypeId}`,
    () => carrierStore.updateProductStoreShipmentMethod(selectedProductStoreId.value, method, { shipmentGatewayConfigId }),
    "Shipment gateway updated",
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
