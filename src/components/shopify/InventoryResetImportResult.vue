<template>
  <ion-list lines="full">
    <ion-item-divider>
      <ion-label>{{ translate('Shopify inventory publication') }}</ion-label>
      <ion-button slot="end" fill="clear" :disabled="loading" @click="load">
        <ion-spinner v-if="loading" name="crescent" />
        <template v-else>{{ translate('Check now') }}</template>
      </ion-button>
    </ion-item-divider>
    <ion-item>
      <ion-label class="ion-text-wrap">
        {{ translate('Import') }} {{ logId }}
        <p>{{ translate('Feed generation is complete. Check this import before treating the inventory reset as complete.') }}</p>
      </ion-label>
    </ion-item>
    <ion-item v-if="error" role="alert"><ion-label class="ion-text-wrap">{{ error }}</ion-label></ion-item>
    <template v-if="result">
      <ion-item v-if="result.importServiceName && result.importServiceName !== 'co.hotwax.sob.product.InventoryServices.push#InventoryChannelInventory'" role="alert">
        <ion-label class="ion-text-wrap">{{ translate('Reset import configuration needs updating') }}<p>{{ result.importServiceName }}</p></ion-label>
      </ion-item>
      <ion-item><ion-label>{{ translate('Import status') }}</ion-label><ion-label slot="end">{{ statusLabel }}</ion-label></ion-item>
      <ion-item><ion-label>{{ translate('Batch records processed') }}</ion-label><ion-label slot="end">{{ result.totalRecordCount ?? translate('Not available') }}</ion-label></ion-item>
      <ion-item><ion-label>{{ translate('Failed batch records') }}</ion-label><ion-label slot="end">{{ result.failedRecordCount ?? translate('Not available') }}</ion-label></ion-item>
      <ion-item v-if="result.finishDateTime"><ion-label>{{ translate('Finished') }}</ion-label><ion-label slot="end">{{ formatDateTime(result.finishDateTime) }}</ion-label></ion-item>
      <ion-accordion-group v-if="errorLogs.length">
        <ion-accordion value="errors">
          <ion-item slot="header"><ion-label>{{ translate('Import errors') }}</ion-label></ion-item>
          <ion-list slot="content"><ion-item v-for="(record, index) in errorLogs" :key="index"><ion-label class="ion-text-wrap">{{ JSON.stringify(record) }}</ion-label></ion-item></ion-list>
        </ion-accordion>
      </ion-accordion-group>
    </template>
  </ion-list>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { IonAccordion, IonAccordionGroup, IonButton, IonItem, IonItemDivider, IonLabel, IonList, IonSpinner } from '@ionic/vue';
import { translate } from '@common';
import { useDataManager } from '@/composables/useDataManager';
import { formatDateTime } from '@/utils';
const props = defineProps<{ logId: string }>();
const { errorLogs, fetchLogDetails } = useDataManager();
const result = ref<any>(null);
const loading = ref(false);
const error = ref('');
let generation = 0;
watch(() => props.logId, () => { generation++; result.value = null; error.value = ''; loading.value = false; });
const statusLabel = computed(() => {
  const labels: Record<string, string> = { DmlsPending: 'Pending', DmlsQueued: 'Queued', DmlsRunning: 'Running', DmlsFinished: 'Finished', DmlsFailed: 'Failed', DmlsCrashed: 'Crashed', DmlsCancelled: 'Cancelled' };
  return translate(labels[result.value?.statusId] || result.value?.statusId || 'Not available');
});
async function load() {
  if (loading.value) return;
  const request = ++generation;
  const id = props.logId;
  loading.value = true; result.value = null; error.value = '';
  try {
    const record = await fetchLogDetails(id);
    if (request !== generation) return;
    if (!record || String(record.logId) !== id || record.configId !== 'RESET_INV_CHANNEL') throw new Error('unverified import');
    result.value = record;
  } catch {
    if (request === generation) error.value = translate('The reset import could not be verified. Check again before retrying the reset.');
  } finally {
    if (request === generation) loading.value = false;
  }
}
</script>
