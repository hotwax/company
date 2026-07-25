<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button :aria-label="translate('Close')" @click="close">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate("Select orders") }}</ion-title>
      <ion-buttons slot="end" v-if="isLoading">
        <ion-spinner name="crescent" />
      </ion-buttons>
    </ion-toolbar>
    <ion-toolbar>
      <ion-searchbar
        v-model="queryString"
        :placeholder="translate('Search order name or Shopify ID')"
        @keyup.enter="searchOrders()"
        @ionInput="handleInput"
      />
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <ion-list v-if="orders.length" lines="full">
      <ion-list-header v-if="!queryString.trim()">
        <ion-label>{{ translate("Recently created orders from Shopify") }}</ion-label>
      </ion-list-header>
      <ion-item button @click="toggleAll">
        <ion-label>
          {{ translate("Select all") }}
          <p>{{ selectedOrders.length }} {{ translate("selected") }}</p>
        </ion-label>
        <ion-checkbox slot="end" :checked="allSelected" @click.stop="toggleAll" />
      </ion-item>
      <ion-item v-for="order in orders" :key="order.legacyResourceId" button @click="toggleOrder(order)">
        <ion-label>
          <h2>{{ order.name }}</h2>
          <p>{{ translate("Shopify ID") }}: {{ order.legacyResourceId }}</p>
          <p>{{ order.customerName || translate("No customer") }} · {{ order.displayFinancialStatus || translate("Status unavailable") }}</p>
          <p>{{ formatDate(order.createdAt) }}</p>
        </ion-label>
        <ion-note slot="end">{{ order.totalAmount || translate("No total") }} {{ order.currencyCode || "" }}</ion-note>
        <ion-checkbox slot="end" :checked="isSelected(order.legacyResourceId)" @click.stop="toggleOrder(order)" />
      </ion-item>
    </ion-list>
    <ion-list v-else-if="isLoading" lines="none"><ion-item><ion-spinner name="crescent" /></ion-item></ion-list>
    <ion-list v-else-if="queryString" lines="none"><ion-item><ion-label>{{ translate("No orders found") }}</ion-label></ion-item></ion-list>
    <ion-list v-else lines="none"><ion-item><ion-label>{{ translate("No recent Shopify orders found") }}</ion-label></ion-item></ion-list>
    <ion-infinite-scroll v-if="hasNextPage" @ionInfinite="loadMore">
      <ion-infinite-scroll-content loading-spinner="crescent" :loading-text="translate('Loading')" />
    </ion-infinite-scroll>
  </ion-content>

  <ion-footer>
    <ion-toolbar>
      <ion-buttons slot="start"><ion-button fill="clear" :disabled="!selectedOrders.length" @click="selectedOrdersById = {}">{{ translate("Clear") }}</ion-button></ion-buttons>
      <ion-buttons slot="end"><ion-button fill="solid" color="primary" :disabled="!selectedOrders.length" @click="submit">{{ translate("Download selected orders") }} ({{ selectedOrders.length }})</ion-button></ion-buttons>
    </ion-toolbar>
  </ion-footer>
</template>

<script setup lang="ts">
import {
  IonButton, IonButtons, IonCheckbox, IonContent, IonFooter, IonHeader, IonIcon, IonInfiniteScroll,
  IonInfiniteScrollContent, IonItem, IonLabel, IonList, IonListHeader, IonNote, IonSearchbar, IonSpinner, IonTitle, IonToolbar,
  modalController
} from "@ionic/vue";
import { closeOutline } from "ionicons/icons";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { commonUtil, logger, translate } from "@common";
import { formatDateTime } from "@/utils";
import { useShopifyOrderSyncStore, type ShopifyOrderSyncSearchResult } from "@/store/shopifyOrderSync";

const store = useShopifyOrderSyncStore();
const queryString = ref("");
const orders = ref<ShopifyOrderSyncSearchResult[]>([]);
const selectedOrdersById = ref<Record<string, ShopifyOrderSyncSearchResult>>({});
const isLoading = ref(false);
const hasNextPage = ref(false);
const endCursor = ref("");
let debounceTimer: number | undefined;
let requestId = 0;

const selectedOrders = computed(() => Object.values(selectedOrdersById.value));
const allSelected = computed(() => orders.value.length > 0 && orders.value.every((order) => selectedOrdersById.value[order.legacyResourceId]));

onMounted(() => { void searchOrders(); });
onBeforeUnmount(() => { if (debounceTimer) window.clearTimeout(debounceTimer); });

async function searchOrders(after?: string) {
  isLoading.value = true;
  const currentRequestId = ++requestId;
  try {
    const result = await store.searchShopifyOrders({ queryString: queryString.value.trim(), after, pageSize: 20 });
    if (currentRequestId !== requestId) return;
    orders.value = after ? orders.value.concat(result.orders) : result.orders;
    hasNextPage.value = result.hasNextPage;
    endCursor.value = result.endCursor;
  } catch (error) {
    if (currentRequestId !== requestId) return;
    logger.error(error);
    commonUtil.showToast(translate("Failed to search Shopify orders."));
    orders.value = [];
    hasNextPage.value = false;
  } finally {
    if (currentRequestId === requestId) isLoading.value = false;
  }
}

function handleInput() {
  if (debounceTimer) window.clearTimeout(debounceTimer);
  requestId++;
  debounceTimer = window.setTimeout(() => void searchOrders(), 600);
}

async function loadMore(event: any) {
  if (hasNextPage.value && endCursor.value) await searchOrders(endCursor.value);
  await event.target.complete();
}

function toggleOrder(order: ShopifyOrderSyncSearchResult) {
  const next = { ...selectedOrdersById.value };
  if (next[order.legacyResourceId]) delete next[order.legacyResourceId];
  else next[order.legacyResourceId] = order;
  selectedOrdersById.value = next;
}

function toggleAll() {
  selectedOrdersById.value = allSelected.value
    ? {}
    : Object.fromEntries(orders.value.map((order) => [order.legacyResourceId, order]));
}

function isSelected(id: string) { return Boolean(selectedOrdersById.value[id]); }
function formatDate(value?: string) { return value ? formatDateTime(value) : translate("Date unavailable"); }

async function submit() {
  await modalController.dismiss({ legacyResourceIds: selectedOrders.value.map((order) => order.legacyResourceId) });
}

function close() { void modalController.dismiss(null, "cancel"); }
</script>
