<template>
  <ion-item v-if="loading">
    <ion-spinner slot="start" /><ion-label>{{ translate('Checking the affected item') }}</ion-label>
  </ion-item>
  <ion-item v-else-if="error" role="alert">
    <ion-label class="ion-text-wrap">
      {{ translate('The comparison could not be verified. Check again before making changes.') }}<p>{{ error }}</p>
    </ion-label>
  </ion-item>
  <template v-else-if="result">
    <ion-item>
      <ion-label class="ion-text-wrap">
        <h2>{{ itemTitle }}</h2>
        <p>{{ translate('Shipment {shipment}, item {item}, quantity {quantity}', { shipment: issue.shipmentId, item: issue.orderItemSeqId, quantity: result.item.quantity }) }}</p>
      </ion-label>
    </ion-item>
    <ion-item>
      <ion-label class="ion-text-wrap">
        <h2>{{ translate(result.matches.length ? 'Transfer-line mapping needs repair' : 'Add this item to the Shopify transfer') }}</h2>
        <p>{{ translate(result.matches.length
          ? 'The item exists in Shopify. Ask your integration administrator to verify its OMS line mapping before retrying.'
          : 'The item is mapped, but is absent from this transfer. Ask your integration administrator to reconcile the transfer line before retrying.') }}</p>
      </ion-label>
    </ion-item>
    <ion-item v-if="waitingReceipts.length">
      <ion-icon slot="start" :icon="timeOutline" />
      <ion-label class="ion-text-wrap">
        <h2>{{ translate('Waiting for this item') }}</h2>
        <p>{{ translate('Shipment {shipment} and receipts {receipts}', { shipment: issue.shipmentId, receipts: waitingReceipts.join(', ') }) }}</p>
      </ion-label>
    </ion-item>
    <ion-item>
      <ion-button fill="outline" @click="copyDetails">{{ translate(copied ? 'Repair details copied' : 'Copy repair details') }}</ion-button>
      <ion-button fill="clear" :disabled="loading" @click="emit('recheck')">{{ translate('Recheck comparison') }}</ion-button>
    </ion-item>
    <ion-item v-if="copyError" role="alert"><ion-label>{{ translate('Copy failed. Use the technical details below.') }}</ion-label></ion-item>
  </template>
  <ion-item v-if="error"><ion-button @click="emit('recheck')">{{ translate('Recheck comparison') }}</ion-button></ion-item>
</template>
<script setup lang="ts">
import { translate } from "@common";
import { IonButton, IonIcon, IonItem, IonLabel, IonSpinner } from "@ionic/vue";
import { timeOutline } from "ionicons/icons";
import { computed, ref, watch } from "vue";
import type { TransferUpdateCheck } from "@/composables/useShopifyTransferUpdateCheck";
import type { TransferStagingIssue } from "@/utils/shopifyTransferStagingErrors";

const props = defineProps<{ shopId: string; orderId: string; orderName?: string; domain?: string; issue: TransferStagingIssue; waitingReceipts: string[]; result?: TransferUpdateCheck; loading: boolean; error?: string }>();
const emit = defineEmits<{ recheck: [] }>();
const copied = ref(false);
const copyError = ref(false);
const itemTitle = computed(() => {
  const choice = props.result?.choices[0];
  return choice ? [choice.title, choice.variantTitle, choice.sku].filter(Boolean).join(" — ") : translate("Product {id}", { id: props.result?.item.productId });
});
async function copyDetails() {
  if(!props.result) {return;}
  const { item, choices, snapshot, transferId, checkedAt } = props.result;
  const details = [
    `Transfer sync repair: ${props.orderName || props.orderId}`,
    `Shop: ${props.shopId} (${props.domain || ""})`, `OMS order: ${props.orderId}`,
    `OMS shipment: ${props.issue.shipmentId}, shipment item: ${props.issue.orderItemSeqId}, order item: ${item.orderItemSeqId}, product: ${item.productId}, shipped quantity: ${item.quantity}`,
    `Shopify transfer: ${transferId} (${snapshot.status})`,
    `Product mappings: ${choices.map(choice => `${choice.sku || ""} variant ${choice.variantId}, inventory item ${choice.inventoryItemId}`).join("; ")}`,
    `Shopify transfer lines: ${snapshot.lines.map((line: any) => `${line.inventoryItem?.sku || ""}, inventory item ${line.inventoryItem?.id}, quantity ${line.totalQuantity}`).join("; ")}`,
    `Waiting receipts: ${props.waitingReceipts.join(", ")}`, `Staging error: ${props.issue.message}`, `Checked: ${checkedAt}`,
  ].join("\n");
  try {await navigator.clipboard.writeText(details); copied.value = true; copyError.value = false;} catch {copyError.value = true;}
}
watch(() => props.result, () => {copied.value = false; copyError.value = false;});
</script>
