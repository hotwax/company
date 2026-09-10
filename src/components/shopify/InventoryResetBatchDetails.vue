<template>
  <ion-accordion :value="String(index)">
    <ion-item slot="header">
      <ion-label>{{ translate('Batch {number}', { number: record._recordNumber ?? index + 1 }) }}</ion-label>
      <ion-note slot="end">{{ products.length }} {{ translate('items') }}</ion-note>
    </ion-item>
    <ion-list slot="content">
      <ion-item><ion-label class="ion-text-wrap">{{ record._ERROR_MESSAGE_ || record.error || translate('No error detail returned') }}</ion-label></ion-item>
      <template v-if="target && remoteId && products.length">
        <ion-item><ion-label class="ion-text-wrap">
          {{ translate('Check an item at the current channel target') }}
          <p>{{ record.inventoryChannelId }} / {{ target.shopifyLocationId }}</p>
          <p>{{ translate('This checks current inventory only. It does not prove which items this reset published or resend the batch.') }}</p>
        </ion-label></ion-item>
        <ion-item>
          <ion-select :label="translate('Inventory item')" :value="selectedId" interface="alert" @ion-change="selectedId = $event.detail.value">
            <ion-select-option v-for="product in products" :key="product.shopifyInventoryItemId" :value="product.shopifyInventoryItemId">
              {{ product.productId }} / {{ product.shopifyInventoryItemId }}
            </ion-select-option>
          </ion-select>
        </ion-item>
        <ShopifyInventorySnapshot v-if="selectedId" :remote-id="remoteId" :inventory-item-id="selectedId" :location-id="String(target.shopifyLocationId)" />
      </template>
      <ion-item v-else><ion-label class="ion-text-wrap">{{ translate('The item or channel target could not be identified for this connection.') }}</ion-label></ion-item>
    </ion-list>
  </ion-accordion>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { IonAccordion, IonItem, IonLabel, IonList, IonNote, IonSelect, IonSelectOption } from '@ionic/vue';
import { translate } from '@common';
import ShopifyInventorySnapshot from './ShopifyInventorySnapshot.vue';
const props = defineProps<{ record: any; index: number; remoteId?: string; channels?: any[] }>();
const selectedId = ref('');
const target = computed(() => props.channels?.find(channel =>
  channel.inventoryChannelId && String(channel.inventoryChannelId) === String(props.record.inventoryChannelId) && channel.shopifyLocationId));
const products = computed(() => {
  if (!Array.isArray(props.record.products)) return [];
  const items = new Map<string, { productId: string; shopifyInventoryItemId: string }>();
  for (const product of props.record.products) {
    if (typeof product?.productId !== 'string' || typeof product?.shopifyInventoryItemId !== 'string' || !/^\d+$/.test(product.shopifyInventoryItemId)) continue;
    items.set(product.shopifyInventoryItemId, product);
  }
  return [...items.values()];
});
watch(() => [props.record, props.remoteId, target.value?.shopifyLocationId], () => { selectedId.value = ''; });
</script>
