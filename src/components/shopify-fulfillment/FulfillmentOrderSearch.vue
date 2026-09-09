<template>
  <ion-card>
    <ion-card-header><ion-card-title>{{ translate('Find order sync history') }}</ion-card-title></ion-card-header>
    <ion-searchbar :value="query" :placeholder="translate('Order name or customer name')" :debounce="350" @ionInput="search($event.detail.value || '')" />
    <ion-item v-if="modelValue.length" lines="none">
      <ion-label class="ion-text-wrap"><ion-chip v-for="order in modelValue" :key="order.orderId" @click="remove(order.orderId)"><ion-label>{{ order.orderName || order.orderId }}</ion-label><ion-icon :icon="closeCircle" /></ion-chip></ion-label>
      <ion-button slot="end" fill="clear" @click="clear">{{ translate('Show all orders') }}</ion-button>
    </ion-item>
    <ion-list v-if="query">
      <ion-item v-if="loading"><ion-label><ion-skeleton-text animated /></ion-label></ion-item>
      <ion-item v-if="error"><ion-label>{{ translate('Order search could not be loaded. Try again.') }}</ion-label><ion-button slot="end" fill="clear" @click="search(query)">{{ translate('Retry') }}</ion-button></ion-item>
      <ion-item v-for="order in results.slice(0, 1)" :key="order.orderId" button detail @click="selectFirst(order)">
        <ion-label class="ion-text-wrap"><h2>{{ order.orderName || order.orderId }}</h2><p>{{ order.customerPartyName || order.customerName || translate('No customer name') }}</p><p>{{ order.orderId }} / {{ formatDateTime(order.orderDate) }}</p></ion-label>
        <ion-note slot="end">{{ order.orderStatusDesc }}</ion-note>
      </ion-item>
      <ion-item v-if="!loading && !error && !results.length"><ion-label>{{ translate('No matching orders in this shop.') }}</ion-label></ion-item>
      <ion-item v-if="results.length > 1 || hasMore" lines="none"><ion-button fill="clear" @click="openModal">{{ translate('More results') }}</ion-button></ion-item>
    </ion-list>
  </ion-card>
  <ion-modal :is-open="modalOpen" @didDismiss="modalOpen = false" @didPresent="resetScroll">
    <ion-header><ion-toolbar><ion-buttons slot="start"><ion-button :aria-label="translate('Close')" @click="modalOpen = false"><ion-icon slot="icon-only" :icon="closeOutline" /></ion-button></ion-buttons><ion-title>{{ translate('Select orders') }}</ion-title></ion-toolbar>
      <ion-toolbar><ion-searchbar :value="query" :placeholder="translate('Order name or customer name')" :debounce="350" @ionInput="search($event.detail.value || '')" /></ion-toolbar>
    </ion-header>
    <ion-content ref="modalContent">
      <ion-list>
        <ion-item v-if="loading"><ion-label><ion-skeleton-text animated /></ion-label></ion-item>
        <ion-item v-if="error"><ion-label>{{ translate('Order search could not be loaded. Try again.') }}</ion-label><ion-button slot="end" fill="clear" @click="search(query)">{{ translate('Retry') }}</ion-button></ion-item>
      <ion-item v-for="order in results" :key="order.orderId" button :detail="false" @click="toggle(order)">
        <ion-checkbox slot="start" :checked="draft.some(row => row.orderId === order.orderId)" :aria-label="order.orderName || order.orderId" @click.stop @ionChange="toggle(order)" />
        <ion-label class="ion-text-wrap"><h2>{{ order.orderName || order.orderId }}</h2><p>{{ order.customerPartyName || order.customerName || translate('No customer name') }}</p><p>{{ order.orderId }} / {{ formatDateTime(order.orderDate) }}</p></ion-label>
        <ion-note slot="end">{{ order.orderStatusDesc }}</ion-note>
      </ion-item>
        <ion-item v-if="!loading && !error && query && !results.length"><ion-label>{{ translate('No matching orders in this shop.') }}</ion-label></ion-item>
        <ion-item v-if="hasMore"><ion-label class="ion-text-wrap">{{ translate('Showing the top 20 matches. Refine your search to find another order.') }}</ion-label></ion-item>
      </ion-list>
    </ion-content>
    <ion-footer><ion-toolbar><ion-buttons slot="end"><ion-button :disabled="!draft.length" @click="apply">{{ translate('View sync history') }} ({{ draft.length }})</ion-button></ion-buttons></ion-toolbar></ion-footer>
  </ion-modal>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue';
import { api, translate } from '@common';
import { IonCard, IonCardHeader, IonCardTitle, IonSearchbar, IonItem, IonList, IonLabel, IonCheckbox, IonNote, IonButton, IonChip, IonIcon, IonSkeletonText, IonModal, IonHeader, IonToolbar, IonTitle, IonButtons, IonContent, IonFooter } from '@ionic/vue';
import { closeCircle, closeOutline } from 'ionicons/icons';
import { formatDateTime, hasError } from '@/utils';
export interface SearchOrder { orderId: string; orderName?: string; customerPartyName?: string; customerName?: string; orderDate?: string; orderStatusDesc?: string }
const props = defineProps<{ shopId: string; modelValue: SearchOrder[] }>();
const emit = defineEmits<{ (e: 'update:modelValue', rows: SearchOrder[]): void }>();
const query = ref('');
const results = ref<SearchOrder[]>([]);
const draft = ref<SearchOrder[]>([]);
const loading = ref(false);
const error = ref(false);
const hasMore = ref(false);
const modalOpen = ref(false);
const modalContent = ref<any>();
function resetScroll() { void modalContent.value?.$el?.scrollToTop(0); }
function openModal() { draft.value = [...props.modelValue]; modalOpen.value = true; }
function selectFirst(order: SearchOrder) { draft.value = [...props.modelValue.filter(row => row.orderId !== order.orderId), order]; apply(); }
let request = 0;
watch(() => props.modelValue, rows => { draft.value = [...rows]; }, { immediate: true });
watch(() => props.shopId, () => { request++; query.value = ''; results.value = []; loading.value = false; clear(); });
async function fetchPage(term: string) {
  const id = ++request;
  loading.value = true;
  error.value = false;
  try {
    const matches: SearchOrder[] = [];
    let more = true;
    let nextPage = 0;
    while (more && matches.length < 20) {
      const response: any = await api({ url: 'sob/shopify/fulfillmentOrderSearch', method: 'GET', params: { shopId: props.shopId, query: term, pageIndex: nextPage } });
      if (id !== request) return;
      const body = response.data;
      if (hasError(response) || !Array.isArray(body?.orders)) throw new Error('Invalid order search');
      matches.push(...body.orders);
      more = body.hasMore;
      if (more && !(body.nextPageIndex > nextPage)) throw new Error('Invalid search cursor');
      nextPage = body.nextPageIndex;
    }
    results.value = [...new Map(matches.map(row => [row.orderId, row])).values()].slice(0, 20);
    hasMore.value = more || matches.length > 20;
    resetScroll();
  } catch { if (id === request) error.value = true; }
  finally { if (id === request) loading.value = false; }
}
function search(value: string) { query.value = value.trim(); results.value = []; hasMore.value = false; request++; if (!query.value) { loading.value = false; return; } void fetchPage(query.value); }
function toggle(order: SearchOrder) { draft.value = draft.value.some(row => row.orderId === order.orderId) ? draft.value.filter(row => row.orderId !== order.orderId) : [...draft.value, order]; }
function apply() { modalOpen.value = false; emit('update:modelValue', [...draft.value]); request++; query.value = ''; results.value = []; loading.value = false; }
function remove(id: string) { emit('update:modelValue', props.modelValue.filter(row => row.orderId !== id)); }
function clear() { emit('update:modelValue', []); }
</script>
