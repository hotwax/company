<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button :default-href="`/shopify-connection-details/${id}/inventory-sync`" />
        </ion-buttons>
        <ion-title>{{ translate("Product activation") }}</ion-title>
        <ion-buttons slot="end">
          <ion-button :disabled="loading" @click="load()">{{ translate("Refresh") }}</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ translate("Shopify activation confirmations") }}</ion-card-title>
          <ion-card-subtitle>{{ shop?.name || shop?.myshopifyDomain || id }}</ion-card-subtitle>
        </ion-card-header>
        <ion-card-content>
          <p>{{ translate("The first physical inventory event activates a mapped product at its Shopify location before adjusting inventory. Scheduled reconciliation covers pairs without an event.") }}</p>
          <p>{{ translate("Each row shows the latest recorded confirmation for a current product/location pair, not every past attempt or a live check of Shopify. Products without a Shopify product mapping are not included.") }}</p>
          <p v-if="checkedAt">{{ translate("Last refreshed") }}: {{ formatDateTime(checkedAt) }}</p>
        </ion-card-content>
      </ion-card>

      <ion-list lines="full">
        <ion-item>
          <ion-select v-model="status" :label="translate('Activation status')" interface="popover">
            <ion-select-option value="all">{{ translate("All product locations") }}</ion-select-option>
            <ion-select-option value="pending">{{ translate("Pending confirmation") }}</ion-select-option>
            <ion-select-option value="confirmed">{{ translate("Confirmed activations") }}</ion-select-option>
            <ion-select-option value="unmapped">{{ translate("Missing mapping") }}</ion-select-option>
          </ion-select>
        </ion-item>
        <ion-item>
          <ion-input v-model="productId" :label="translate('Product ID')" :placeholder="translate('Exact product ID')" :clear-input="true" @keyup.enter="applyFilters" />
        </ion-item>
        <ion-item>
          <ion-input v-model="facilityId" :label="translate('Facility ID')" :placeholder="translate('Exact facility ID')" :clear-input="true" @keyup.enter="applyFilters" />
          <ion-button slot="end" :disabled="loading" @click="applyFilters">{{ translate("Apply") }}</ion-button>
          <ion-button slot="end" fill="clear" :disabled="loading" @click="clearFilters">{{ translate("Clear") }}</ion-button>
        </ion-item>
      </ion-list>

      <ion-card v-if="error" color="warning">
        <ion-card-header><ion-card-title>{{ translate("Activation data could not be loaded") }}</ion-card-title></ion-card-header>
        <ion-card-content>
          <p>{{ error }}</p>
          <p>{{ translate("No activation status can be inferred from this failed request.") }}</p>
          <ion-button fill="outline" @click="load()">{{ translate("Retry") }}</ion-button>
        </ion-card-content>
      </ion-card>
      <ion-item v-else-if="loading" lines="none" role="status">
        <ion-spinner slot="start" name="crescent" />
        <ion-label>{{ translate("Loading activation records") }}</ion-label>
      </ion-item>
      <template v-else-if="loaded">
        <ion-card v-if="!itemSpecificConfirmation" color="warning">
          <ion-card-content>{{ translate("This OMS records legacy product/location confirmations. It cannot verify that a confirmation belongs to the current Shopify inventory item. Deploy the inventory-item activation upgrade before relying on confirmations after a product remap.") }}</ion-card-content>
        </ion-card>
        <ion-list lines="full">
          <ion-list-header>
            <ion-label>{{ translate("Product locations") }} ({{ totalCount }})</ion-label>
          </ion-list-header>
          <ion-item v-if="!rows.length" lines="none">
            <ion-label class="ion-text-wrap">
              <h2>{{ translate("No matching activation records") }}</h2>
              <p>{{ translate("Try another status or clear the product and facility filters. Only current product/facility associations with a Shopify product mapping appear here.") }}</p>
            </ion-label>
          </ion-item>
          <ion-item v-for="row in rows" :key="activationKey(row)">
            <ion-label class="ion-text-wrap">
              <h2>{{ row.productName || row.productId }}</h2>
              <p>{{ translate("Product") }}: {{ row.productId }} / {{ translate("Facility") }}: {{ row.facilityName || row.facilityId }} ({{ row.facilityId }})</p>
              <p>{{ translate("Shopify inventory item") }}: {{ row.shopifyInventoryItemId || translate("Missing") }} / {{ translate("Shopify location") }}: {{ row.shopifyLocationId || translate("Missing") }}</p>
              <p v-if="row.activatedAt">{{ translate("Last confirmed") }}: {{ formatDateTime(row.activatedAt) }}</p>
              <p v-else-if="row.activationStatus === 'pending'">{{ translate("No successful confirmation recorded. Waiting for an inventory event or scheduled reconciliation.") }}</p>
              <p v-else>{{ translate("Complete the missing inventory-item or location mapping before activation can proceed.") }}</p>
            </ion-label>
            <ion-badge slot="end" :color="row.activationStatus === 'confirmed' ? 'success' : 'warning'">
              {{ translate(activationLabel(row.activationStatus, itemSpecificConfirmation)) }}
            </ion-badge>
          </ion-item>
        </ion-list>
        <ion-toolbar>
          <ion-buttons slot="start">
            <ion-button :disabled="pageIndex === 0" @click="changePage(-1)">{{ translate("Previous") }}</ion-button>
          </ion-buttons>
          <ion-title size="small">{{ translate("Page") }} {{ pageIndex + 1 }} / {{ Math.max(1, Math.ceil(totalCount / PAGE_SIZE)) }}</ion-title>
          <ion-buttons slot="end">
            <ion-button :disabled="(pageIndex + 1) * PAGE_SIZE >= totalCount" @click="changePage(1)">{{ translate("Next") }}</ion-button>
          </ion-buttons>
        </ion-toolbar>
      </template>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonBackButton, IonBadge, IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader,
  IonCardSubtitle, IonCardTitle, IonContent, IonHeader, IonInput, IonItem, IonLabel, IonList,
  IonListHeader, IonPage, IonSelect, IonSelectOption, IonSpinner, IonTitle, IonToolbar,
  onIonViewWillEnter, onIonViewWillLeave,
} from "@ionic/vue";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { translate } from "@common";
import { formatDateTime, getResponseErrorMessage } from "@/utils";
import { fetchProductFacilityActivations, useShopifyShops } from "@/composables/useShopify";
import { activationKey, activationLabel, type ProductFacilityActivation } from "@/utils/shopifyActivation";

const props = defineProps<{ id: string }>();
const { shops } = useShopifyShops();
const shop = computed(() => shops.value.find((row: any) => row.shopId === props.id));
const PAGE_SIZE = 25;
const rows = ref<ProductFacilityActivation[]>([]);
const status = ref("all");
const productId = ref("");
const facilityId = ref("");
const appliedFilters = ref({ productId: "", facilityId: "" });
const pageIndex = ref(0);
const totalCount = ref(0);
const checkedAt = ref<unknown>();
const itemSpecificConfirmation = ref(true);
const loading = ref(false);
const loaded = ref(false);
const error = ref("");
let generation = 0;

async function load() {
  const request = ++generation;
  loading.value = true;
  error.value = "";
  rows.value = [];
  totalCount.value = 0;
  checkedAt.value = undefined;
  try {
    const result = await fetchProductFacilityActivations(props.id, {
      ...appliedFilters.value, activationStatus: status.value, pageIndex: pageIndex.value, pageSize: PAGE_SIZE,
    });
    if (request !== generation) return;
    rows.value = result.activations;
    totalCount.value = result.totalCount;
    checkedAt.value = result.checkedAt;
    itemSpecificConfirmation.value = result.itemSpecificConfirmation;
    loaded.value = true;
  } catch (cause) {
    if (request !== generation) return;
    error.value = getResponseErrorMessage(cause, translate("Check your connection and ensure the OMS activation-monitor endpoint is installed."));
  } finally {
    if (request === generation) loading.value = false;
  }
}
function applyFilters() {
  appliedFilters.value = { productId: productId.value.trim(), facilityId: facilityId.value.trim() };
  pageIndex.value = 0;
  void load();
}
function clearFilters() {
  productId.value = "";
  facilityId.value = "";
  applyFilters();
}
function changePage(delta: number) { pageIndex.value += delta; void load(); }
watch(status, () => { pageIndex.value = 0; void load(); });
watch(() => props.id, () => { pageIndex.value = 0; rows.value = []; loaded.value = false; void load(); });
onIonViewWillEnter(() => { void load(); });
onIonViewWillLeave(() => { generation++; loading.value = false; });
onBeforeUnmount(() => { generation++; });
</script>
