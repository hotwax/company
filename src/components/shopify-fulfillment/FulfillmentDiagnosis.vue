<template>
  <section aria-label="Shipment comparison">
    <ion-item-divider>
      <ion-label class="ion-text-wrap">{{ diagnosis?.checkedAt ? `${translate("Shopify reconciled at")} ${formatDateTime(diagnosis.checkedAt)}` : translate("Shopify reconciliation") }}</ion-label>
      <ion-badge v-if="diagnosis?.lines?.length" slot="end" :color="attentionCount ? 'warning' : 'success'">{{ attentionCount ? `${attentionCount} ${translate(attentionCount === 1 ? 'item needs review' : 'items need review')}` : translate('No item blockers found') }}</ion-badge>
      <ion-button slot="end" fill="clear" :disabled="loading" @click="refresh">{{ translate('Check again') }}</ion-button>
    </ion-item-divider>
    <ion-item v-if="loading"><ion-label>{{ translate("Comparing this shipment with Shopify…") }}</ion-label><ion-spinner slot="end" /></ion-item>
    <ion-item v-else-if="!diagnosis"><ion-label class="ion-text-wrap"><h2>{{ translate("Current state could not be verified") }}</h2><p>{{ translate("Check again. Ask your administrator to check the connection and order identifiers if this continues. You can retry this check or manually attempt sending.") }}</p></ion-label></ion-item>
    <ion-list v-if="!diagnosis?.lines?.length">
      <ion-item v-for="item in items" :key="item.orderItemSeqId"><ion-thumbnail slot="start"><Image :src="item.imageUrl" /></ion-thumbnail><ion-label class="ion-text-wrap">{{ item.primary }}<p>{{ item.secondary }}</p><p>{{ item.features }}</p><p>{{ translate('Ordered quantity') }}: {{ item.orderedQuantity }}</p><p>{{ translate('Shipped quantity') }}: {{ item.quantity }}</p></ion-label></ion-item>
    </ion-list>
    <template v-if="diagnosis">
      <ion-list v-for="line in diagnosis.lines" :key="line.lineItemId" :aria-label="line.name">
        <div class="comparison-row">
          <ion-item lines="none" class="comparison-product">
            <ion-thumbnail slot="start"><Image :src="productFor(line)?.imageUrl || ''" /></ion-thumbnail>
            <ion-label class="ion-text-wrap"><h2>{{ productFor(line)?.primary || line.name }}</h2><p>{{ line.sku }}</p><p>{{ productFor(line)?.features }}</p></ion-label>
          </ion-item>
          <ion-item lines="none" aria-label="OMS shipped"><ion-label><p>{{ translate('OMS shipped') }}</p><h2>{{ line.shippedQty ?? '—' }}</h2></ion-label></ion-item>
          <ion-item lines="none" aria-label="Shopify comparison">
            <ion-label class="ion-text-wrap">
              <p>{{ translate('Shopify fulfillable') }}</p>
              <h2>{{ line.availableAtShipmentLocationQty ?? translate('Unknown') }}</h2>
              <p>{{ translate('At shipment location') }}<template v-if="facility">: {{ facility }}</template></p>
              <p v-if="mode === 'synced'">{{ translate('Shopify linked') }}: {{ line.linkedQty ?? translate('Unknown') }}</p>
              <ion-button v-if="line.code === 'HOLD' || holdsFor(line).length" fill="clear" color="warning" @click="openHolds(line)">{{ translate('On hold') }}<template v-if="holdsFor(line).length"> ({{ holdsFor(line).length }})</template></ion-button>
              <p v-else-if="['EXISTING', 'RECONCILE', 'HOLD', 'MATCHED', 'UNVERIFIED'].includes(line.code)"><ion-text :color="needsReview(line) ? 'warning' : undefined">{{ shopifyValue(line) }}</ion-text></p>
              <p v-for="fact in stateFacts(line)" :key="fact.key" :title="fact.at ? formatDateTime(fact.at) : undefined">{{ fact.quantity != null ? `${fact.quantity} ${translate('fulfilled')}: ` : '' }}{{ elapsed(fact.at) }} / {{ fact.actor ? `${translate('By')} ${fact.actor.name} (${translate(fact.actor.type)})` : translate('Who: unavailable') }}</p>
              <p v-if="shortfall(line) > 0"><ion-text color="warning">{{ translate('Short by') }} {{ shortfall(line) }}</ion-text></p>
            </ion-label>
            <ion-icon slot="end" :icon="needsReview(line) ? informationCircleOutline : checkmarkCircleOutline" :color="needsReview(line) ? 'warning' : 'success'" :aria-label="translate(resultLabel(line))" />
          </ion-item>
        </div>
      </ion-list>

    </template>
      <ion-item v-if="shopifyOrderUrl || retryLabel" lines="none" aria-label="Shopify order action"><ion-button v-if="shopifyOrderUrl" fill="clear" :href="shopifyOrderUrl" target="_blank" rel="noopener noreferrer">{{ translate('Open in Shopify') }}</ion-button><ion-button v-if="retryLabel" slot="end" :disabled="busy" @click="retry">{{ translate(busy ? 'Sending…' : retryLabel) }}</ion-button></ion-item>
    <ion-modal :is-open="!!holdLineId" :can-dismiss="!releasingHold" @didDismiss="holdLineId = ''">
      <ion-header><ion-toolbar><ion-buttons slot="start"><ion-button :aria-label="translate('Close')" :disabled="!!releasingHold" @click="holdLineId = ''"><ion-icon slot="icon-only" :icon="closeOutline" /></ion-button></ion-buttons><ion-title>{{ translate('Shopify fulfillment holds') }}</ion-title></ion-toolbar></ion-header>
      <ion-content>
        <ion-list>
          <ion-item><ion-label class="ion-text-wrap">{{ translate('Dismiss only resolved holds. Each hold applies to its entire fulfillment order, including other items. Automatic fulfillment may resume.') }}</ion-label></ion-item>
          <ion-item v-if="holdNotice"><ion-label class="ion-text-wrap" role="status">{{ holdNotice }}</ion-label></ion-item>
          <ion-item v-for="hold in displayedHolds" :key="hold.id">
            <ion-checkbox label-placement="end" justify="start" class="ion-text-wrap" :aria-label="holdReason(hold.reason)" :checked="selectedHoldIds.includes(hold.id)" :disabled="!!releasingHold || hold.dismissed || loading || !diagnosis" @ionChange="toggleHold(hold.id, $event.detail.checked)">
              <div>{{ holdReason(hold.reason) }}</div>
              <div v-if="hold.reasonNotes"><ion-note>{{ hold.reasonNotes }}</ion-note></div>
              <div><ion-note>{{ hold.locationName }} / {{ translate('Fulfillment order') }} {{ hold.fulfillmentOrderId }}</ion-note></div>
              <div v-if="holdErrors[hold.id]"><ion-text color="danger">{{ holdErrors[hold.id] }}</ion-text></div>
            </ion-checkbox>
            <ion-badge v-if="hold.dismissed" slot="end" color="medium">{{ translate('Dismissed') }}</ion-badge>
          </ion-item>
          <ion-item v-if="diagnosis && !loading && !modalHolds.length"><ion-label>{{ translate('No active holds') }}</ion-label></ion-item>
          <ion-item v-if="!diagnosis && !loading"><ion-label>{{ translate('Current state could not be verified') }}</ion-label></ion-item>
          <ion-item v-if="loading"><ion-spinner /><ion-label>{{ translate('Checking Shopify…') }}</ion-label></ion-item>
        </ion-list>
      </ion-content>
      <ion-footer><ion-toolbar><ion-button slot="end" :disabled="!selectedHoldIds.length || !!releasingHold || busy || loading" @click="dismissSelectedHolds">{{ translate(releasingHold ? 'Dismissing…' : 'Dismiss selected holds') }}<template v-if="!releasingHold"> ({{ selectedHoldIds.length }})</template></ion-button></ion-toolbar></ion-footer>
    </ion-modal>
  </section>
</template>
<script setup lang="ts">
import { ref, watch, onBeforeUnmount, computed } from "vue";
import { IonItem, IonItemDivider, IonLabel, IonList, IonButton, IonIcon, IonSpinner, IonBadge, IonThumbnail, IonText, IonNote, IonModal, IonHeader, IonToolbar, IonTitle, IonButtons, IonContent, IonCheckbox, IonFooter } from "@ionic/vue";
import { checkmarkCircleOutline, informationCircleOutline, closeOutline } from "ionicons/icons";
import { api, translate, commonUtil } from "@common";
import { formatDateTime } from "@/utils";
import Image from "@/components/common/Image.vue";
import type { FulfillmentOrderItem } from "./FulfillmentShipmentCard.types";
import { scheduleDiagnosis } from "./diagnosisQueue";
const props = defineProps<{ shopId: string; shipmentId: string; mode?: 'pending' | 'queued' | 'synced'; items?: FulfillmentOrderItem[]; facility?: string; messageId?: string; version?: string; retryLabel?: string; busy?: boolean }>();
const emit = defineEmits<{ (event: 'retry'): void; (event: 'diagnosed', diagnosis: any): void }>();
const diagnosis = ref<any>();
const loading = ref(false);
const releasingHold = ref('');
const holdErrors = ref<Record<string, string>>({});
function holdsFor(line: any) {
  return (line.workAllocations || []).filter((work: any) => work.status === 'ON_HOLD').flatMap((work: any) => (work.holds || []).map((hold: any) => ({ ...hold, fulfillmentOrderId: work.fulfillmentOrderId, locationName: work.locationName })));
}
function holdReason(reason: string) {
  return translate(({ INVENTORY_OUT_OF_STOCK: 'Inventory out of stock', AWAITING_PAYMENT: 'Awaiting payment', HIGH_RISK_OF_FRAUD: 'High risk of fraud', INCORRECT_ADDRESS: 'Incorrect address', OTHER: 'Fulfillment on hold' } as Record<string, string>)[reason] || reason?.replaceAll('_', ' ').toLowerCase() || 'Fulfillment on hold');
}
const dismissedHolds = ref<any[]>([]);
const holdLineId = ref('');
const selectedHoldIds = ref<string[]>([]);
const holdNotice = ref('');
const modalHolds = computed(() => holdsFor(diagnosis.value?.lines?.find((line: any) => line.lineItemId === holdLineId.value) || {}));
const displayedHolds = computed(() => [...modalHolds.value.filter((hold: any) => !dismissedHolds.value.some(done => done.id === hold.id)), ...dismissedHolds.value]);
function openHolds(line: any) { dismissedHolds.value = []; holdLineId.value = line.lineItemId; selectedHoldIds.value = []; holdErrors.value = {}; holdNotice.value = ''; if (!holdsFor(line).length) { refresh(true); } }
function toggleHold(id: string, checked: boolean) { selectedHoldIds.value = checked ? [...new Set([...selectedHoldIds.value, id])] : selectedHoldIds.value.filter(value => value !== id); }
async function dismissSelectedHolds() {
  if (releasingHold.value || props.busy || loading.value || !diagnosis.value) { return; }
  const selected = modalHolds.value.filter((hold: any) => selectedHoldIds.value.includes(hold.id) && !dismissedHolds.value.some(done => done.id === hold.id));
  if (!selected.length) { return; }
  releasingHold.value = 'selected';
  holdNotice.value = '';
  let dismissed = 0;
  for (const hold of selected) {
    delete holdErrors.value[hold.id];
    try {
      const response: any = await api({ url: 'sob/shopify/fulfillmentHold', method: 'post', data: { shopId: props.shopId, shipmentId: props.shipmentId, fulfillmentOrderId: hold.fulfillmentOrderId, holdId: hold.id } });
      if (commonUtil.hasError(response) || !response.data?.released) { throw new Error(response.data?.errors || response.data?.error || translate('Shopify did not confirm the hold release. Check again.')); }
      dismissed++;
      dismissedHolds.value.push({ ...hold, dismissed: true });
      selectedHoldIds.value = selectedHoldIds.value.filter(id => id !== hold.id);
    } catch (error: any) {
      holdErrors.value[hold.id] = error.response?.data?.errors || error.response?.data?.error || error.message || translate('Could not release hold');
    }
  }
  holdNotice.value = `${dismissed} ${translate(dismissed === 1 ? 'hold dismissed' : 'holds dismissed')}. ${Object.values(holdErrors.value).join(' ')}`;
  await refresh(true);
  selectedHoldIds.value = selectedHoldIds.value.filter(id => modalHolds.value.some((hold: any) => hold.id === id));
  releasingHold.value = '';
}
const shopifyOrderUrl = computed(() => {
  const d = diagnosis.value;
  return /^[a-z0-9-]+\.myshopify\.com$/.test(d?.shopDomain || '') && /^\d+$/.test(d?.shopifyOrderId || '') ? `https://${d.shopDomain}/admin/orders/${d.shopifyOrderId}` : undefined;
});
let generation = 0;
async function refresh(inspectHolds = false) {
  const current = ++generation;
  diagnosis.value = undefined;
  if(!props.shipmentId) {return;}
  loading.value = true;
  try {
    const response: any = await scheduleDiagnosis(() => api({ url: "sob/shopify/fulfillmentDiagnosis", method: "get", params: { shopId: props.shopId, shipmentId: props.shipmentId, ...(props.messageId ? { systemMessageId: props.messageId } : {}), ...(inspectHolds === true ? { inspectHolds: true } : {}) } }));
    if(current === generation && response.data?.lines) {diagnosis.value = response.data; emit("diagnosed", response.data);}
  } catch { /* Keep unknown quantities explicit; manual sending is a separate action. */ }
  finally {if(current === generation) {loading.value = false;}}
}
function retry() { if (props.retryLabel && !props.busy) { emit('retry'); } }

const attentionCount = computed(() => diagnosis.value?.lines?.filter((line: any) => !['MATCHED', 'READY'].includes(line.code)).length || 0);
function resultLabel(line: any) {
  return ({ MATCHED: 'Matched', READY: 'Ready to sync', HOLD: 'Blocked by hold', RECONCILE: 'Needs reconciliation', EXISTING: 'Match needs confirmation' } as Record<string, string>)[line.code] || 'Needs review';
}
function needsReview(line: any) { return !['MATCHED', 'READY'].includes(line.code); }
function shopifyValue(line: any) {
  if (line.code === 'UNVERIFIED') { return translate('Unknown'); }
  if (props.mode === 'synced') { return line.linkedQty > 0 ? line.linkedQty : translate('Not linked'); }
  if (line.code === 'MATCHED') { return translate('Already linked'); }
  if (line.code === 'EXISTING') { return translate(Number(line.quantities?.unfulfilledQty) > 0 ? 'Partially fulfilled in Shopify' : 'Already fulfilled in Shopify'); }
  if (line.code === 'HOLD') { return translate('On hold'); }
  if (line.code === 'RECONCILE') { return translate(line.cancelledAt ? 'Order canceled in Shopify' : 'Quantity no longer fulfillable'); }
  return line.availableAtShipmentLocationQty ?? translate('Unknown');
}
function stateFacts(line: any) {
  if (line.code === 'RECONCILE') { return [{ key: 'cancel', at: line.cancelledAt, actor: line.cancelledAt ? line.cancellationActor : null }]; }
  if (line.code !== 'EXISTING') { return []; }
  return (line.allocations || []).filter((allocation: any) => allocation.status === 'SUCCESS').map((allocation: any) => ({ key: allocation.fulfillmentId, quantity: allocation.quantity, at: allocation.createdAt, actor: allocation.actor }));
}
function elapsed(value?: string) {
  const time = value ? Date.parse(value) : NaN;
  if (!Number.isFinite(time)) { return translate('Time unavailable'); }
  const seconds = Math.max(0, (Date.now() - time) / 1000);
  const [unit, divisor] = seconds >= 86400 ? ['day', 86400] : seconds >= 3600 ? ['hour', 3600] : seconds >= 60 ? ['minute', 60] : ['second', 1];
  return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(-Math.floor(seconds / Number(divisor)), unit as Intl.RelativeTimeFormatUnit);
}
function shortfall(line: any) {
  if (props.mode === 'synced' || !['READY', 'LOCATION_REVIEW', 'REVIEW', 'SEND_REVIEW'].includes(line.code) || line.availableAtShipmentLocationQty == null || line.shippedQty == null) { return 0; }
  return Math.max(0, Number(line.shippedQty) - Number(line.linkedQty || 0) - Number(line.availableAtShipmentLocationQty));
}
function productFor(line: any) { return props.items?.find(item => item.secondary === line.sku); }
onBeforeUnmount(() => { generation++; });
watch(() => [props.shopId, props.shipmentId, props.messageId, props.version], () => refresh(), { immediate: true });
</script>
<style scoped>
.comparison-row { display: flex; flex-wrap: wrap; align-items: center; }
.comparison-row > ion-item { flex: 1 1 18ch; min-inline-size: 0; }
.comparison-row > .comparison-product { flex: 2 1 30ch; }
</style>
