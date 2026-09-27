<template>
  <ion-list v-if="visible" lines="full">
    <ion-list-header v-if="orderId"><ion-label>{{ translate(stage === 'create' ? 'Creation delivery' : 'Update delivery') }}</ion-label></ion-list-header>
    <ion-item v-if="error" role="alert">
      <ion-label class="ion-text-wrap">
        {{ translate('Delivery status could not be refreshed. Check again before retrying.') }}
      </ion-label>
    </ion-item>
    <ion-item v-else-if="!checked && !log">
      <ion-spinner slot="start" /><ion-label>{{ translate('Checking Shopify delivery') }}</ion-label>
    </ion-item>
    <template v-if="log">
      <ion-item>
        <ion-icon slot="start" :icon="state.color === 'success' ? checkmarkCircleOutline : timeOutline" :color="state.color" />
        <ion-label class="ion-text-wrap">
          <h2>{{ translate(orderId ? state.label : stage === 'create' ? 'Latest creation file' : 'Latest update file') }}</h2>
          <p v-if="!orderId">{{ translate(state.label) }}</p>
          <p v-if="orderId || state.color !== 'success'">{{ translate(state.explanation) }}</p>
          <p>{{ translate('{count} record(s) in this file.', { count: log.totalRecordCount }) }}</p>
          <p v-if="!orderId">{{ translate(log.finishDateTime ? 'Completed' : 'Queued') }}: {{ formatDateTime(log.finishDateTime || log.createdDate, 'MMM d, h:mm:ss a') }}</p>
        </ion-label>
        <ion-button slot="end" fill="clear" @click="showLog = true">
          {{ translate('View delivery log') }}
        </ion-button>
      </ion-item>
      <ion-item v-if="orderId"><ion-label>{{ translate('Queued') }}<p>{{ formatDateTime(log.createdDate, 'MMM d, h:mm:ss a') }}</p></ion-label><ion-label>{{ translate('Processing started') }}<p>{{ formatDateTime(log.startDateTime, 'MMM d, h:mm:ss a') || translate('Waiting') }}</p></ion-label><ion-label>{{ translate('Completed') }}<p>{{ formatDateTime(log.finishDateTime, 'MMM d, h:mm:ss a') || translate('Waiting') }}</p></ion-label></ion-item>
    </template>
  </ion-list>
  <DataManagerLogModal :is-open="showLog" :log-id="String(log?.logId || '')" :details="{ ...log, startedAt: log?.startDateTime, completedAt: log?.finishDateTime }" @close="showLog = false" />
</template>
<script setup lang="ts">
import { translate } from "@common";
import { IonButton, IonIcon, IonItem, IonLabel, IonList, IonListHeader, IonSpinner } from "@ionic/vue";
import { checkmarkCircleOutline, timeOutline } from "ionicons/icons";
import { computed, ref } from "vue";
import DataManagerLogModal from "@/components/shopify-order-sync/ShopifyOrderSyncMdmLogModal.vue";
import { useShopifyTransferDelivery } from "@/composables/useShopifyTransferDelivery";
import { formatDateTime } from "@/utils";
import { transferDeliveryState } from "@/utils/shopifyTransferDelivery";

defineOptions({ inheritAttrs: false });
const props = defineProps<{ shopId: string; stage: "create" | "update"; orderId?: string; checked: boolean; error?: string; direction?: "pending" | "synced" }>();
const { logsFor } = useShopifyTransferDelivery(() => props.shopId);
const log = computed(() => logsFor(props.stage, props.orderId)[0]);
const state = computed(() => transferDeliveryState(log.value || {}));
const visible = computed(() => {
  if(props.error || !props.checked) {return true;}
  if(!log.value) {return false;}
  if(props.direction === "pending") {return state.value.color !== "success";}
  if(props.direction === "synced") {return state.value.color === "success";}
  return true;
});
const showLog = ref(false);
</script>
