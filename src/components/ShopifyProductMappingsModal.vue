<template>
  <ion-modal :is-open="!!product" @didDismiss="$emit('close')">
    <ion-header><ion-toolbar>
      <ion-buttons slot="start"><ion-button aria-label="Close" @click="$emit('close')"><ion-icon slot="icon-only" :icon="closeOutline" /></ion-button></ion-buttons>
      <ion-title>{{ translate('Product mappings') }}</ion-title>
    </ion-toolbar></ion-header>
    <ion-content>
      <ion-list>
        <ion-item><ion-label><h2>{{ product?.title }}</h2><p>{{ translate('Current mappings in HotWax') }}</p></ion-label></ion-item>
        <ion-item v-if="loading"><ion-spinner /><ion-label>{{ translate('Loading') }}</ion-label></ion-item>
        <ion-item v-else-if="error"><ion-label class="ion-text-wrap" color="danger">{{ error }}</ion-label><ion-button slot="end" @click="load">{{ translate('Check again') }}</ion-button></ion-item>
        <template v-else>
          <ion-item><ion-label>{{ translate('Mapped variants') }}</ion-label><ion-note slot="end">{{ mappedCount }} / {{ rows.length }}</ion-note></ion-item>
          <ion-item v-for="row in rows" :key="row.id">
            <ion-label class="ion-text-wrap">
              <h2>{{ row.title }} · {{ row.sku || translate('No SKU') }}</h2>
              <p>{{ translate('Shopify variant ID') }}: {{ row.id }}</p>
              <p>{{ translate('Shopify inventory item ID') }}: {{ row.inventoryItemId }}</p>
              <p>{{ row.tracked ? translate('Inventory tracked') : translate('Inventory not tracked') }}</p>
              <p v-for="mapping in row.mappings" :key="mapping.productId">{{ translate('OMS product ID') }}: {{ mapping.productId }} · {{ mapping.internalName }}</p>
              <template v-if="row.mappings.length === 1">
                <ion-button fill="clear" :disabled="!!indexingProductId" @click="refreshIndex(row.mappings[0].productId)">
                  <ion-spinner v-if="indexingProductId === row.mappings[0].productId" name="crescent" />
                  {{ translate('Refresh search index') }}
                </ion-button>
                <p v-if="indexMessages[row.mappings[0].productId]">{{ indexMessages[row.mappings[0].productId] }}</p>
              </template>
            </ion-label>
            <ion-badge slot="end" :color="row.mappings.length === 1 ? 'success' : 'warning'">{{ row.mappings.length === 1 ? translate('Mapped') : row.mappings.length ? translate('Multiple mappings') : translate('Not mapped') }}</ion-badge>
          </ion-item>
        </template>
      </ion-list>
    </ion-content>
  </ion-modal>
</template>
<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { IonModal, IonHeader, IonToolbar, IonButtons, IonButton, IonIcon, IonTitle, IonContent, IonList, IonItem, IonLabel, IonNote, IonBadge, IonSpinner } from '@ionic/vue';
import { closeOutline } from 'ionicons/icons';
import { translate } from '@common';
import { fetchProductMappings, refreshMappedProductSearchIndex } from '@/composables/useShopify';
const props = defineProps<{product: {id: string; title: string} | null; systemMessageRemoteId: string; productStoreId: string}>();
defineEmits(['close']);
const rows = ref<any[]>([]);
const loading = ref(false);
const error = ref('');
const indexingProductId = ref('');
const indexMessages = ref<Record<string, string>>({});
let version = 0;
async function refreshIndex(productId: string) {
  if (indexingProductId.value) return;
  const token = version;
  indexingProductId.value = productId;
  indexMessages.value[productId] = '';
  try {
    await refreshMappedProductSearchIndex(productId);
    if (token === version) indexMessages.value[productId] = translate('Index refresh request completed. Check product search.');
  } catch {
    if (token === version) indexMessages.value[productId] = translate('Search index refresh was not confirmed');
  } finally {
    indexingProductId.value = '';
  }
}
const mappedCount = computed(() => rows.value.filter(row => row.mappings.length === 1).length);
async function load() {
  const token = ++version;
  rows.value = []; error.value = '';
  indexMessages.value = {};
  if (!props.product) { loading.value = false; return; }
  loading.value = true;
  try {
    const result = await fetchProductMappings({productId: props.product.id, systemMessageRemoteId: props.systemMessageRemoteId, productStoreId: props.productStoreId});
    if (token === version) rows.value = result;
  } catch (cause: any) {
    if (token === version) error.value = cause.message || translate('Unable to load product mappings');
  } finally { if (token === version) loading.value = false; }
}
watch(() => [props.product?.id, props.systemMessageRemoteId, props.productStoreId], load);
</script>
