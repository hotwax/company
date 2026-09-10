<template>
  <ion-item-divider>
    <ion-label>{{ translate('Current Shopify transfer') }}</ion-label>
    <ion-button slot="end" fill="clear" :disabled="loading" @click="load">{{ translate('Check now') }}</ion-button>
  </ion-item-divider>
  <ion-item v-if="loading"><ion-spinner name="crescent" /><ion-label>{{ translate('Loading') }}</ion-label></ion-item>
  <ion-item v-else-if="error"><ion-label class="ion-text-wrap" color="danger">{{ translate('Unable to read the current Shopify transfer. Check again.') }}</ion-label></ion-item>
  <template v-else-if="snapshot">
    <ion-item><ion-label>{{ translate('Checked at') }}</ion-label><ion-note slot="end">{{ formatDateTime(snapshot.checkedAt) }}</ion-note></ion-item>
    <ion-item><ion-label>{{ translate('Shopify status') }}</ion-label><ion-note slot="end">{{ snapshot.status }}</ion-note></ion-item>
    <ion-item><ion-label>{{ translate('Origin') }}</ion-label><ion-label slot="end">{{ snapshot.origin?.name || translate('Unavailable') }}<p>{{ snapshot.origin?.location?.id }}</p></ion-label></ion-item>
    <ion-item><ion-label>{{ translate('Destination') }}</ion-label><ion-label slot="end">{{ snapshot.destination?.name || translate('Unavailable') }}<p>{{ snapshot.destination?.location?.id }}</p></ion-label></ion-item>
    <ion-item><ion-label>{{ translate('Shopify lines and units') }}</ion-label><ion-note slot="end">{{ snapshot.lines.length }} / {{ totalUnits }}</ion-note></ion-item>
    <ion-item v-for="line in snapshot.lines" :key="line.id">
      <ion-label class="ion-text-wrap"><h3>{{ line.inventoryItem?.sku || translate('No SKU') }}</h3><p>{{ line.inventoryItem?.id }}</p></ion-label>
      <ion-label slot="end">{{ translate('Shopify quantity') }}<p>{{ line.totalQuantity }}</p></ion-label>
    </ion-item>
  </template>
</template>
<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import { IonItemDivider, IonItem, IonLabel, IonButton, IonNote, IonSpinner } from '@ionic/vue';
import { translate } from '@common';
import { formatDateTime } from '@/utils';
import { fetchCurrentShopifyTransfer } from '@/composables/useShopifyTransferSync';
const props = defineProps<{ shopId: string; transferId: string }>();
const loading = ref(false);
const error = ref(false);
const snapshot = ref<Awaited<ReturnType<typeof fetchCurrentShopifyTransfer>> | null>(null);
const totalUnits = computed(() => snapshot.value?.lines.reduce((sum: number, line: any) => sum + line.totalQuantity, 0) ?? 0);
let generation = 0;
async function load() {
  const request = ++generation;
  loading.value = true; error.value = false; snapshot.value = null;
  try {
    const result = await fetchCurrentShopifyTransfer(props.shopId, props.transferId);
    if (request === generation) snapshot.value = result;
  } catch {
    if (request === generation) error.value = true;
  } finally { if (request === generation) loading.value = false; }
}
watch(() => [props.shopId, props.transferId], () => { generation++; snapshot.value = null; error.value = false; loading.value = false; });
onBeforeUnmount(() => generation++);
</script>
