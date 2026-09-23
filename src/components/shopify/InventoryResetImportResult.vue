<template>
  <ion-list lines="full">
    <ion-item-divider>
      <ion-label>{{ translate('Shopify inventory publication') }}</ion-label>
      <ion-button slot="end" fill="clear" :disabled="loading || repairing" @click="load">
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
      <ion-item v-if="result.importServiceName && result.importServiceName !== expectedImporter" role="alert">
        <ion-label class="ion-text-wrap">{{ translate('Reset import configuration needs updating') }}<p>{{ result.importServiceName }}</p>
          <p v-if="configId === 'RESET_INV_CHANNEL'">{{ translate('Repair updates the shared aggregate reset importer for every shop on this OMS. It does not retry imports or change schedules.') }}</p>
        </ion-label>
        <ion-button v-if="configId === 'RESET_INV_CHANNEL' && result.importServiceName === 'co.hotwax.sob.product.InventoryServices.import#InventoryChannelInventory'" slot="end" :disabled="repairing" @click="repair">
          {{ translate('Repair configuration') }}
        </ion-button>
      </ion-item>
      <ion-item><ion-label>{{ translate('Import status') }}</ion-label><ion-label slot="end">{{ statusLabel }}</ion-label></ion-item>
      <ion-item><ion-label>{{ translate('Batch records processed') }}</ion-label><ion-label slot="end">{{ result.totalRecordCount ?? translate('Not available') }}</ion-label></ion-item>
      <ion-item><ion-label>{{ translate('Failed batch records') }}</ion-label><ion-label slot="end">{{ result.failedRecordCount ?? translate('Not available') }}</ion-label></ion-item>
      <ion-item v-if="result.finishDateTime"><ion-label>{{ translate('Finished') }}</ion-label><ion-label slot="end">{{ formatDateTime(result.finishDateTime) }}</ion-label></ion-item>
      <ion-accordion-group v-if="verifiedErrors.length">
        <ion-accordion value="errors">
          <ion-item slot="header"><ion-label>{{ translate('Import errors') }}</ion-label></ion-item>
          <ion-accordion-group slot="content">
            <InventoryResetBatchDetails v-for="(record, index) in verifiedErrors" :key="`${logId}:${index}`"
              :record="record" :index="index" :remote-id="remoteId" :channels="channels" />
          </ion-accordion-group>
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
import { repairInventoryResetImportConfig } from '@/composables/useShopify';
import { formatDateTime } from '@/utils';
import InventoryResetBatchDetails from './InventoryResetBatchDetails.vue';
const props = withDefaults(defineProps<{ logId: string; remoteId?: string; channels?: any[]; configId?: 'RESET_INV_CHANNEL' | 'RESET_PHYSICAL_LOC_INV' }>(), { configId: 'RESET_INV_CHANNEL' });
const expectedImporter = computed(() => props.configId === 'RESET_PHYSICAL_LOC_INV' ? 'co.hotwax.sob.product.InventoryServices.import#PhysicalLocationInventory' : 'co.hotwax.sob.product.InventoryServices.push#InventoryChannelInventory');
const { errorLogs, fetchLogDetails } = useDataManager();
const verifiedErrors = ref<any[]>([]);
const result = ref<any>(null);
const loading = ref(false);
const error = ref('');
const repairing = ref(false);
let generation = 0;
watch(() => [props.logId, props.configId], () => { generation++; result.value = null; verifiedErrors.value = []; error.value = ''; loading.value = false; });
const statusLabel = computed(() => {
  const labels: Record<string, string> = { DmlsPending: 'Pending', DmlsQueued: 'Queued', DmlsRunning: 'Running', DmlsFinished: 'Finished', DmlsFailed: 'Failed', DmlsCrashed: 'Crashed', DmlsCancelled: 'Cancelled' };
  return translate(labels[result.value?.statusId] || result.value?.statusId || 'Not available');
});
async function load() {
  if (loading.value) return;
  const request = ++generation;
  const id = props.logId;
  loading.value = true; result.value = null; verifiedErrors.value = []; error.value = '';
  try {
    const record = await fetchLogDetails(id);
    if (request !== generation) return;
    if (!record || String(record.logId) !== id || record.configId !== props.configId) throw new Error('unverified import');
    result.value = record;
    verifiedErrors.value = [...errorLogs.value];
  } catch {
    if (request === generation) error.value = translate('The reset import could not be verified. Check again before retrying the reset.');
  } finally {
    if (request === generation) loading.value = false;
  }
}
async function repair() {
  if (repairing.value) return;
  repairing.value = true; error.value = '';
  try {
    await repairInventoryResetImportConfig();
    await load();
  } catch (failure: any) {
    error.value = failure?.message || translate('Could not verify the reset import configuration.');
  } finally {
    repairing.value = false;
  }
}
</script>
