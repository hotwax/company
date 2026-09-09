<template>
  <ion-card>
    <ion-card-header><ion-card-title>{{ translate('Find order sync history') }}</ion-card-title></ion-card-header>
    <ion-list lines="full">
      <ion-item>
        <ion-select v-model="field" :label="translate('Search by')" interface="popover">
          <ion-select-option v-for="option in fieldOptions" :key="option.value" :value="option.value">{{ translate(option.label) }}</ion-select-option>
        </ion-select>
      </ion-item>
      <ion-item>
        <ion-select v-model="statusId" :label="translate('Order status')" interface="popover">
          <ion-select-option value="">{{ translate('Any status') }}</ion-select-option>
          <ion-select-option v-for="status in orderStatuses" :key="status.statusId" :value="status.statusId">{{ status.description || status.statusId }}</ion-select-option>
        </ion-select>
      </ion-item>
      <ion-item>
        <ion-input v-model="dateFrom" type="date" :label="translate('Ordered from')" label-placement="stacked" />
        <ion-input v-model="dateThru" type="date" :label="translate('Ordered to')" label-placement="stacked" />
      </ion-item>
    </ion-list>
    <ion-searchbar :value="query" :placeholder="translate(activeField.placeholder)" :debounce="350" @ionInput="search($event.detail.value || '')" />
    <ion-item v-if="modelValue.length" lines="none">
      <ion-label class="ion-text-wrap"><ion-chip v-for="order in modelValue" :key="order.orderId" @click="remove(order.orderId)"><ion-label>{{ order.orderName || order.orderId }}</ion-label><ion-icon :icon="closeCircle" /></ion-chip></ion-label>
      <ion-button slot="end" fill="clear" @click="clear">{{ translate('Show all orders') }}</ion-button>
    </ion-item>
    <ion-list v-if="query">
      <ion-item v-if="loading"><ion-label><ion-skeleton-text animated /></ion-label></ion-item>
      <ion-item v-if="error"><ion-label>{{ translate('Order search could not be loaded. Try again.') }}</ion-label><ion-button slot="end" fill="clear" @click="search(query)">{{ translate('Retry') }}</ion-button></ion-item>
      <ion-item v-for="order in results.slice(0, 1)" :key="order.orderId" button detail @click="selectFirst(order)">
        <ion-label class="ion-text-wrap"><h2>{{ order.orderName || order.orderId }}</h2><p>{{ translate('Shopify order {id}', { id: order.shopifyOrderId || translate('not mapped') }) }}</p><p>{{ order.orderId }}</p></ion-label>
        <ion-note slot="end">{{ statusLabel(order) }}</ion-note>
      </ion-item>
      <ion-item v-if="!loading && !error && !results.length"><ion-label>{{ translate('No matching orders in this shop.') }}</ion-label></ion-item>
      <ion-item v-if="results.length > 1 || hasMore" lines="none"><ion-button fill="clear" @click="openModal">{{ translate('More results') }}</ion-button></ion-item>
    </ion-list>
  </ion-card>
  <ion-modal :is-open="modalOpen" @didDismiss="modalOpen = false" @didPresent="resetScroll">
    <ion-header><ion-toolbar><ion-buttons slot="start"><ion-button :aria-label="translate('Close')" @click="modalOpen = false"><ion-icon slot="icon-only" :icon="closeOutline" /></ion-button></ion-buttons><ion-title>{{ translate('Select orders') }}</ion-title></ion-toolbar>
      <ion-toolbar><ion-searchbar :value="query" :placeholder="translate(activeField.placeholder)" :debounce="350" @ionInput="search($event.detail.value || '')" /></ion-toolbar>
    </ion-header>
    <ion-content ref="modalContent">
      <ion-list>
        <ion-item v-if="loading"><ion-label><ion-skeleton-text animated /></ion-label></ion-item>
        <ion-item v-if="error"><ion-label>{{ translate('Order search could not be loaded. Try again.') }}</ion-label><ion-button slot="end" fill="clear" @click="search(query)">{{ translate('Retry') }}</ion-button></ion-item>
        <ion-item v-for="order in results" :key="order.orderId" button :detail="false" @click="toggle(order)">
          <ion-checkbox slot="start" :checked="draft.some(row => row.orderId === order.orderId)" :aria-label="order.orderName || order.orderId" @click.stop @ionChange="toggle(order)" />
          <ion-label class="ion-text-wrap"><h2>{{ order.orderName || order.orderId }}</h2><p>{{ translate('Shopify order {id}', { id: order.shopifyOrderId || translate('not mapped') }) }}</p><p>{{ order.orderId }} {{ formatDateTime(order.orderDate) }}</p></ion-label>
          <ion-note slot="end">{{ statusLabel(order) }}</ion-note>
        </ion-item>
        <ion-item v-if="!loading && !error && query && !results.length"><ion-label>{{ translate('No matching orders in this shop.') }}</ion-label></ion-item>
        <ion-item v-if="hasMore"><ion-label class="ion-text-wrap">{{ translate('Showing the top 20 matches. Refine your search to find another order.') }}</ion-label></ion-item>
      </ion-list>
    </ion-content>
    <ion-footer><ion-toolbar><ion-buttons slot="end"><ion-button :disabled="!draft.length" @click="apply">{{ translate('View sync history') }} ({{ draft.length }})</ion-button></ion-buttons></ion-toolbar></ion-footer>
  </ion-modal>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { api, translate } from '@common';
import { IonCard, IonCardHeader, IonCardTitle, IonSearchbar, IonSelect, IonSelectOption, IonInput, IonItem, IonList, IonLabel, IonCheckbox, IonNote, IonButton, IonChip, IonIcon, IonSkeletonText, IonModal, IonHeader, IonToolbar, IonTitle, IonButtons, IonContent, IonFooter } from '@ionic/vue';
import { closeCircle, closeOutline } from 'ionicons/icons';
import { useStatuses } from '@/composables/useSeed';
import { formatDateTime, hasError } from '@/utils';

export interface SearchOrder { orderId: string; orderName?: string; shopifyOrderId?: string; orderDate?: number; statusId?: string }

/**
 * The operator picks ONE field to search. The OMS side is a plain entity resource over
 * ShopifyShopOrderSearchView, so the query is expressed entirely in Moqui's own search parameters
 * (`<field>_op=contains`, `<field>_ic=Y`, `orderDate_from/_thru`, an exact `statusId`) and there is
 * no search service to keep in step. One field at a time is also what makes this possible:
 * searchFormMap ANDs its conditions, so it cannot OR a term across three columns.
 */
const FIELDS = [
  { value: 'orderName', label: 'Order name', placeholder: 'Order name', ignoreCase: true },
  { value: 'shopifyOrderId', label: 'Shopify order ID', placeholder: 'Shopify order ID', ignoreCase: false },
  { value: 'orderId', label: 'HotWax order ID', placeholder: 'HotWax order ID', ignoreCase: false },
] as const;

const props = defineProps<{ shopId: string; modelValue: SearchOrder[] }>();
const emit = defineEmits<{ (e: 'update:modelValue', rows: SearchOrder[]): void }>();

const PAGE = 20;
const field = ref<string>(FIELDS[0].value);
const statusId = ref('');
const dateFrom = ref('');
const dateThru = ref('');
const query = ref('');
const results = ref<SearchOrder[]>([]);
const draft = ref<SearchOrder[]>([]);
const loading = ref(false);
const error = ref(false);
const hasMore = ref(false);
const modalOpen = ref(false);
const modalContent = ref<any>();

const { ofType, labelFor } = useStatuses();
const orderStatuses = computed(() => ofType('ORDER_STATUS'));
const fieldOptions = computed(() => FIELDS.map(option => ({ value: option.value, label: option.label })));
const activeField = computed(() => FIELDS.find(option => option.value === field.value) ?? FIELDS[0]);
const statusLabel = (order: SearchOrder) => labelFor(order.statusId);

function resetScroll() { void modalContent.value?.$el?.scrollToTop(0); }
function openModal() { draft.value = [...props.modelValue]; modalOpen.value = true; }
function selectFirst(order: SearchOrder) { draft.value = [...props.modelValue.filter(row => row.orderId !== order.orderId), order]; apply(); }

let request = 0;
watch(() => props.modelValue, rows => { draft.value = [...rows]; }, { immediate: true });
watch(() => props.shopId, () => { request++; query.value = ''; results.value = []; loading.value = false; clear(); });
// Changing a field or filter re-runs the search the operator already typed.
watch([field, statusId, dateFrom, dateThru], () => { if (query.value) { search(query.value); } });

async function fetchPage(term: string) {
  const id = ++request;
  loading.value = true;
  error.value = false;
  try {
    const params: Record<string, any> = {
      shopId: props.shopId,
      [`${activeField.value.value}_op`]: 'contains',
      [activeField.value.value]: term,
      orderByField: '-orderDate',
      // One over the page so a full page tells us there is more, without a count call.
      pageSize: PAGE + 1,
    };
    if (activeField.value.ignoreCase) { params[`${activeField.value.value}_ic`] = 'Y'; }
    if (statusId.value) { params.statusId = statusId.value; }
    if (dateFrom.value) { params.orderDate_from = `${dateFrom.value} 00:00:00`; }
    if (dateThru.value) { params.orderDate_thru = `${dateThru.value} 23:59:59`; }

    const response: any = await api({ url: 'sob/shopify/fulfillmentOrderSearch', method: 'GET', params });
    if (id !== request) return;
    // The entity resource answers with a bare list.
    const rows = Array.isArray(response?.data) ? response.data : undefined;
    if (hasError(response) || !rows) throw new Error('Invalid order search');
    hasMore.value = rows.length > PAGE;
    results.value = rows.slice(0, PAGE);
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
