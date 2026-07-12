<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-menu-button slot="start" />
        <ion-title>{{ translate("Carriers") }}</ion-title>
        <ion-buttons slot="end">
          <ion-button :disabled="isLoading" @click="loadReadiness" :aria-label="translate('Refresh carrier readiness')">
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

      <template v-else>
        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ translate("Address validation readiness") }}</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <p>{{ translate("Order Manager uses Unigate to validate sales-order shipping addresses before they reach the Bad Address queue.") }}</p>
          </ion-card-content>
        </ion-card>

        <ion-list v-if="hasLoadError" inset>
          <ion-item color="danger">
            <ion-icon slot="start" :icon="alertCircleOutline" />
            <ion-label>
              {{ translate("Carrier readiness could not be loaded") }}
              <p>{{ translate("Check your OMS connection and try again.") }}</p>
            </ion-label>
            <ion-button slot="end" fill="outline" @click="loadReadiness">{{ translate("Try again") }}</ion-button>
          </ion-item>
        </ion-list>

        <ion-list inset>
          <ion-list-header>
            <ion-label>{{ translate("Supported carriers and capabilities") }}</ion-label>
          </ion-list-header>
          <ion-item v-for="carrier in supportedCarriers" :key="carrier.carrierPartyId">
            <ion-icon slot="start" :icon="shieldCheckmarkOutline" />
            <ion-label>
              {{ carrier.name }}
              <p>{{ translate("Automatic address validation") }}</p>
            </ion-label>
            <ion-badge slot="end" color="success">{{ translate("Supported") }}</ion-badge>
          </ion-item>
          <ion-item lines="none">
            <ion-label>
              <p>{{ translate("FedEx is the only carrier currently used by automatic sales-order address validation. Other shipping carriers are not shown as address-validation capable.") }}</p>
            </ion-label>
          </ion-item>
        </ion-list>

        <ion-list inset>
          <ion-list-header>
            <ion-label>{{ translate("Product store readiness") }}</ion-label>
          </ion-list-header>
          <ion-item v-if="productStores.length">
            <ion-select
              v-model="selectedProductStoreId"
              :label="translate('Product store')"
              label-placement="stacked"
              interface="popover"
            >
              <ion-select-option
                v-for="store in productStores"
                :key="store.productStoreId"
                :value="store.productStoreId"
              >
                {{ store.storeName || store.productStoreId }}
              </ion-select-option>
            </ion-select>
          </ion-item>
          <ion-item v-else>
            <ion-icon slot="start" :icon="storefrontOutline" />
            <ion-label>
              {{ translate("No product stores found") }}
              <p>{{ translate("Add or load a product store before checking carrier readiness.") }}</p>
            </ion-label>
          </ion-item>
        </ion-list>

        <ion-list v-if="selectedStore" inset>
          <ion-item v-for="step in checklist" :key="step.key">
            <ion-icon slot="start" :icon="statusIcon(step.status)" />
            <ion-label>
              {{ step.title }}
              <p>{{ step.description }}</p>
            </ion-label>
            <ion-badge slot="end" :color="statusColor(step.status)">{{ statusLabel(step.status) }}</ion-badge>
          </ion-item>
        </ion-list>

        <ion-card v-if="selectedStore">
          <ion-card-header>
            <ion-card-title>{{ translate("Complete carrier setup in OMS Admin") }}</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <p>{{ translate("Company can verify the Unigate tenant today. Carrier credential and product-store linkage APIs are not available yet, so those steps cannot be verified, created, rotated, or disconnected here.") }}</p>
            <p>{{ translate("In OMS Admin, open Unigate, then Shipping Gateway. Add the FedEx credential and link it to this product store. Return here and refresh after API support is added.") }}</p>
            <ion-button expand="block" fill="outline" @click="openUnigateConfigModal">
              <ion-icon slot="start" :icon="serverOutline" />
              {{ translate("Review Unigate tenant") }}
            </ion-button>
          </ion-card-content>
        </ion-card>
      </template>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
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
  IonMenuButton,
  IonPage,
  IonSelect,
  IonSelectOption,
  IonSkeletonText,
  IonTitle,
  IonToolbar,
  modalController,
  onIonViewWillEnter,
} from "@ionic/vue";
import {
  alertCircleOutline,
  checkmarkCircleOutline,
  helpCircleOutline,
  refreshOutline,
  serverOutline,
  shieldCheckmarkOutline,
  storefrontOutline,
} from "ionicons/icons";
import { translate } from "@common";
import KlaviyoUnigateConfigModal from "@/components/KlaviyoUnigateConfigModal.vue";
import { useKlaviyoStore } from "@/store/klaviyo";
import { useProductStore } from "@/store/productStore";
import {
  ADDRESS_VALIDATION_CARRIERS,
  deriveAddressValidationReadiness,
  type ReadinessStatus,
} from "@/utils/carrierReadiness";

const klaviyoStore = useKlaviyoStore();
const productStoreStore = useProductStore();
const isLoading = ref(false);
const selectedProductStoreId = ref("");

const supportedCarriers = ADDRESS_VALIDATION_CARRIERS;
const productStores = computed(() => productStoreStore.productStores || []);
const selectedStore = computed(() => productStores.value.find(
  (store: any) => store.productStoreId === selectedProductStoreId.value
));
const hasLoadError = computed(() => (
  klaviyoStore.fetchStatus.unigate === "error"
  || productStoreStore.fetchStatus.productStores === "error"
));

const readiness = computed(() => deriveAddressValidationReadiness({
  unigateConfig: klaviyoStore.getUnigateConfig,
  credentialStatus: "unavailable",
  storeLinkStatus: "unavailable",
}));

const checklist = computed(() => [
  {
    key: "tenant",
    title: translate("Unigate tenant"),
    description: readiness.value.tenant === "ready"
      ? translate("Tenant ID, URL, and API key are configured on this OMS.")
      : translate("Configure the Unigate tenant ID, URL, and API key before carrier requests can run."),
    status: readiness.value.tenant,
  },
  {
    key: "credential",
    title: translate("FedEx credential"),
    description: translate("Credential verification is unavailable in Company until the OMS carrier API is exposed."),
    status: readiness.value.credential,
  },
  {
    key: "store-link",
    title: translate("Product store linkage"),
    description: translate("Store linkage verification is unavailable in Company until the OMS carrier API is exposed."),
    status: readiness.value.storeLink,
  },
  {
    key: "validation",
    title: translate("Automatic address validation"),
    description: readiness.value.addressValidation === "action-required"
      ? translate("Complete the Unigate tenant before automatic address validation can be ready.")
      : translate("Readiness cannot be confirmed until the FedEx credential and product-store link can be verified."),
    status: readiness.value.addressValidation,
  },
]);

watch(productStores, (stores) => {
  if (!stores.length) {
    selectedProductStoreId.value = "";
    return;
  }
  if (!stores.some((store: any) => store.productStoreId === selectedProductStoreId.value)) {
    selectedProductStoreId.value = stores[0].productStoreId;
  }
}, { immediate: true });

onIonViewWillEnter(loadReadiness);

async function loadReadiness() {
  isLoading.value = true;
  try {
    await Promise.all([
      klaviyoStore.fetchUnigateConfig(),
      productStoreStore.fetchProductStores(),
    ]);
  } finally {
    isLoading.value = false;
  }
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
  modal.onDidDismiss().then(loadReadiness);
  await modal.present();
}
</script>
