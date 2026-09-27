<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button :default-href="`/shopify-connection-details/${id}/transfer-sync`" /></ion-buttons>
        <ion-title>{{ translate('Transfer sync details') }}</ion-title>
        <ion-buttons slot="end">
          <ion-button :disabled="refreshing || mappingBusy" :aria-label="translate('Refresh')" @click="refresh"><ion-icon slot="icon-only" :icon="refreshOutline" /></ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding-horizontal">
      <ion-card class="ion-margin-top">
        <ion-card-header>
          <ion-card-title>{{ order?.orderName || translate('Transfer {id}', { id: orderId }) }}</ion-card-title>
          <ion-card-subtitle>{{ translate('Order {id}', { id: orderId }) }} / {{ shop?.name || translate('Shop {id}', { id }) }}</ion-card-subtitle>
        </ion-card-header>
        <ion-list lines="none">
          <ion-item v-if="orderLoading && !order"><ion-spinner slot="start" /><ion-label>{{ translate('Loading transfer details') }}</ion-label></ion-item>
          <ion-item v-if="orderError || summaryError || syncError" role="alert">
            <ion-icon slot="start" :icon="warningOutline" color="warning" />
            <ion-label class="ion-text-wrap">{{ translate('Some details could not be refreshed. Recheck before acting.') }}<p>{{ orderError || summaryError || syncError }}</p></ion-label>
          </ion-item>
          <div class="transfer-summary-fields">
            <ion-item><ion-label>{{ translate('From') }}<p>{{ facilityName(order?.facilityId) }}</p></ion-label></ion-item>
            <ion-item><ion-label>{{ translate('To') }}<p>{{ facilityName(order?.orderFacilityId) }}</p></ion-label></ion-item>
            <ion-item><ion-label>{{ translate('Order date') }}<p>{{ formatDateTime(summary?.orderDate) || translate('Not available') }}</p></ion-label></ion-item>
            <ion-item><ion-label>{{ translate('Created in OMS') }}<p>{{ formatDateTime(summary?.entryDate) || translate('Not available') }}</p></ion-label></ion-item>
          </div>
        </ion-list>
        <ion-card-content class="transfer-actions">
          <ion-button fill="clear" :href="transfersUrl" target="_blank" rel="noopener noreferrer">{{ translate('Open in Transfers') }}<ion-icon slot="end" :icon="openOutline" /></ion-button>
          <ion-button fill="clear" :disabled="!shopifyUrl" :href="shopifyUrl || undefined" target="_blank" rel="noopener noreferrer">{{ translate('Open in Shopify') }}<ion-icon slot="end" :icon="openOutline" /></ion-button>
          <ion-button v-for="card in stagingCards.filter(card => card.job)" :key="card.jobName" fill="outline" :disabled="mappingBusy" @click="openJob(card)">{{ translate(card.definition.key === 'create' ? 'Creation job details' : 'Update job details') }}</ion-button>
        </ion-card-content>
      </ion-card>

      <section class="transfer-status-cards">
        <ion-card>
          <ion-card-header><ion-card-title>{{ translate('Issues') }}</ion-card-title><ion-card-subtitle v-if="issueEntries.length">{{ translate('Select an issue to resolve below') }}</ion-card-subtitle></ion-card-header>
          <ion-list lines="full">
            <ion-item v-if="!checked && !issueEntries.length"><ion-spinner slot="start" /><ion-label>{{ translate('Loading staging results') }}</ion-label></ion-item>
            <ion-item v-else-if="!issueEntries.length"><ion-label class="ion-text-wrap">{{ translate(stages.some(stage => stage.run) ? 'No blocker reported for this transfer in this run.' : 'No completed staging run is available yet.') }}</ion-label></ion-item>
            <ion-radio-group v-model="selectedKey" :aria-label="translate('Transfer sync issues')">
              <ion-item v-for="entry in issueEntries" :key="entry.issue.key" :disabled="mappingBusy">
                <ion-radio :value="entry.issue.key" :disabled="mappingBusy" label-placement="end" justify="start">
                  <ion-label class="ion-text-wrap"><h2>{{ translate(issueTitle(entry.issue)) }}</h2><p>{{ itemLabel(entry.issue) || translate(entry.stage.card.definition.key === 'create' ? 'Creation' : 'Updates') }}</p></ion-label>
                </ion-radio>
              </ion-item>
            </ion-radio-group>
          </ion-list>
        </ion-card>
        <ion-card>
          <ion-card-header><ion-card-title>{{ translate('Working') }}</ion-card-title><ion-card-subtitle v-if="currentCheck">{{ translate('Checked at') }}: {{ formatDateTime(currentCheck.checkedAt) }}</ion-card-subtitle></ion-card-header>
          <ion-list lines="full">
            <ion-item v-for="fact in workingFacts" :key="fact.title">
              <ion-icon slot="start" :icon="checkmarkCircleOutline" color="success" />
              <ion-label class="ion-text-wrap"><h2>{{ translate(fact.title) }}</h2><p v-if="fact.detail">{{ fact.detail }}</p></ion-label>
            </ion-item>
            <ion-item v-if="!workingFacts.length"><ion-label>{{ translate(checkLoading ? 'Checking the affected item' : 'No successful checks confirmed yet.') }}</ion-label></ion-item>
          </ion-list>
        </ion-card>
      </section>

      <ion-card v-if="selectedEntry">
        <ion-card-header><ion-card-title>{{ translate('Resolve issue') }}</ion-card-title></ion-card-header>
        <ion-list lines="full">
          <ShopifyTransferDeliveryStatus v-if="resolutionIssue.code === 'delivery'" :shop-id="id" :order-id="orderId"
            :stage="selectedEntry.stage.card.definition.key as TransferStager" :checked="deliveryChecked" :error="failingDomains?.shopifyTransferDelivery" />
          <ShopifyTransferMappingConflict v-else-if="isMappingConflict(resolutionIssue) && resolutionIssue.productId"
            :key="`${resolutionIssue.key}:${mappingVersion}`" :shop-id="id" :product-id="resolutionIssue.productId" :domain="shop?.myshopifyDomain"
            @busy="setMappingBusy(resolutionIssue.key, $event)" @ready="mappingReady[resolutionIssue.key] = $event" />
          <ShopifyTransferUpdateBlocker v-else-if="resolutionIssue.code === 'unmapped-shipped-item'"
            :key="resolutionIssue.key" :shop-id="id" :order-id="orderId" :order-name="order?.orderName" :domain="shop?.myshopifyDomain"
            :issue="resolutionIssue" :waiting-receipts="dependentReceipts(resolutionIssue, selectedEntry.stage.issues)"
            :result="checks[resolutionIssue.key]" :loading="checkLoading" :error="checkError" @recheck="recheckSelected" />
          <ion-item v-else><ion-label class="ion-text-wrap"><h2>{{ translate(resolutionIssue.title) }}</h2><p>{{ translate(resolutionIssue.action) }}</p></ion-label><ion-button fill="clear" :disabled="refreshing" @click="refresh">{{ translate('Recheck comparison') }}</ion-button></ion-item>
          <template v-if="selectedEntry.stage.card.definition.key === 'create' && resolutionIssue.code !== 'delivery'">
            <ion-item><ion-label class="ion-text-wrap">{{ translate(readyToRetry ? 'The product mapping is ready for another creation attempt.' : 'Resolve every creation blocker above before retrying.') }}</ion-label></ion-item>
            <ion-item><ion-button :disabled="!readyToRetry || mappingBusy" @click="openJob(creationCard)">{{ translate('Review and run creation job') }}</ion-button></ion-item>
          </template>
        </ion-list>
        <ion-accordion-group>
          <ion-accordion value="technical">
            <ion-item slot="header"><ion-label>{{ translate('Technical details') }}</ion-label></ion-item>
            <ion-list slot="content" lines="none">
              <ion-item><ion-label class="ion-text-wrap">{{ translate('Reported error') }}<p>{{ selectedEntry.issue.message }}</p></ion-label></ion-item>
              <ion-item><ion-label>{{ translate('Job run') }}</ion-label><ion-note slot="end">{{ selectedEntry.stage.run?.jobRunId }}</ion-note></ion-item>
              <ion-item><ion-label>{{ translate('Latest completed run: {time}', { time: formatDateTime(selectedEntry.stage.run?.endTime) }) }}</ion-label></ion-item>
            </ion-list>
          </ion-accordion>
        </ion-accordion-group>
      </ion-card>
    </ion-content>
    <ServiceJobDetailsModal :is-open="showJob" :job-name="selectedJob?.jobName || ''"
      :allowed-parameter-names="selectedJob?.definition.key === 'update' ? ['shopId', 'configId', 'overlapMinutes'] : ['shopId', 'configId']"
      :parameter-description="selectedJob ? translate(selectedJob.definition.purpose) : ''" @close="showJob = false" @updated="refresh" />
  </ion-page>
</template>

<script setup lang="ts">
import { commonUtil, translate, useProducts } from "@common";
import { IonAccordion, IonAccordionGroup, IonBackButton, IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonNote, IonPage, IonRadio, IonRadioGroup, IonSpinner, IonTitle, IonToolbar, onIonViewDidLeave, onIonViewWillEnter } from "@ionic/vue";
import { checkmarkCircleOutline, openOutline, refreshOutline, warningOutline } from "ionicons/icons";
import { computed, ref, watch } from "vue";
import ServiceJobDetailsModal from "@/components/common/ServiceJobDetailsModal.vue";
import ShopifyTransferDeliveryStatus from "@/components/shopify/ShopifyTransferDeliveryStatus.vue";
import ShopifyTransferMappingConflict from "@/components/shopify/ShopifyTransferMappingConflict.vue";
import ShopifyTransferUpdateBlocker from "@/components/shopify/ShopifyTransferUpdateBlocker.vue";
import { useCachedList } from "@/composables/useCachedList";
import { useCacheSync } from "@/composables/useCacheSync";
import { useServiceJobRunsByJob, useServiceJobs } from "@/composables/useServiceJobs";
import { useShopifyShop } from "@/composables/useShopify";
import { type TransferSyncJobCard, useShopifyTransferSyncJobs } from "@/composables/useShopifyTransferSync";
import { fetchTransferSyncSummary, useShopifyTransferSyncEnrichment } from "@/composables/useShopifyTransferSyncEnrichment";
import { type TransferUpdateCheck, useShopifyTransferUpdateCheck } from "@/composables/useShopifyTransferUpdateCheck";
import { useShopifyTransferDelivery } from "@/composables/useShopifyTransferDelivery";
import { formatDateTime } from "@/utils";
import { facilityCache } from "@/utils/cacheEntities";
import { transferDeliveryState } from "@/utils/shopifyTransferDelivery";
import { type TransferStager, type TransferStagingIssue, latestCompletedStagingRun, transferStagingIssues } from "@/utils/shopifyTransferStagingErrors";
import { shopifyTransferAdminUrl, transfersAppOrderUrl } from "@/utils/shopifyTransferSync";

const props = defineProps<{ id: string; orderId: string }>();
const shopId = computed(() => props.id);
const { record: shop } = useShopifyShop(shopId);
const { jobs } = useServiceJobs();
const { cards } = useShopifyTransferSyncJobs(() => props.id, () => jobs.value);
const stagingCards = computed(() => cards.value.filter(card => ["create", "update"].includes(card.definition.key)));
const jobNames = computed(() => stagingCards.value.filter(card => card.job).map(card => card.jobName));
const { runsFor } = useServiceJobRunsByJob(() => jobNames.value, 5);
const stages = computed(() => stagingCards.value.map(card => {
  const run = latestCompletedStagingRun(runsFor(card.jobName));
  return { card, run, issues: transferStagingIssues(run, props.id, card.definition.key as TransferStager).filter(issue => !issue.orderId || issue.orderId === props.orderId) };
}));
const { logsFor } = useShopifyTransferDelivery(() => props.id);
const issueEntries = computed(() => stages.value.flatMap(stage => {
  const entries = displayIssues(stage.issues).map(issue => ({ stage, issue }));
  const log = logsFor(stage.card.definition.key as TransferStager, props.orderId)[0];
  if(log && transferDeliveryState(log).color !== "success") {
    const state = transferDeliveryState(log);
    entries.push({ stage, issue: { key: `delivery:${log.logId}`, code: "delivery", title: state.label,
      action: state.explanation, message: state.explanation, orderId: props.orderId, waiting: state.color !== "warning" } });
  }
  return entries;
}));
const selectedKey = ref("");
const selectedEntry = computed(() => issueEntries.value.find(entry => entry.issue.key === selectedKey.value));
watch(issueEntries, entries => {
  if(!entries.some(entry => entry.issue.key === selectedKey.value)) {selectedKey.value = entries[0]?.issue.key || "";}
}, { immediate: true });
const creationCard = computed(() => stagingCards.value.find(card => card.definition.key === "create"));
const creationIssues = computed(() => stages.value.find(stage => stage.card.definition.key === "create")?.issues || []);
const { enrichment, load, loading: orderLoading, error: orderError } = useShopifyTransferSyncEnrichment();
const order = computed(() => enrichment.value.ordersById[props.orderId]);
const { products, resolve } = useProducts();
const { records: facilities } = useCachedList<any>(facilityCache);
function facilityName(id?: string) {return facilities.value.find(row => row.facilityId === id)?.facilityName || id || translate("Not available");}
const transfersUrl = computed(() => transfersAppOrderUrl(props.orderId));
const summary = ref<Awaited<ReturnType<typeof fetchTransferSyncSummary>>>();
const summaryError = ref("");
let summaryVersion = 0;
async function loadSummary() {
  const version = ++summaryVersion;
  summary.value = undefined; summaryError.value = "";
  try {const result = await fetchTransferSyncSummary(props.id, props.orderId); if(version === summaryVersion) {summary.value = result;}}
  catch (err: any) {if(version === summaryVersion) {summaryError.value = err.message;}}
}
const { check } = useShopifyTransferUpdateCheck();
const checks = ref<Record<string, TransferUpdateCheck>>({});
const currentCheck = computed(() => checks.value[selectedKey.value]);
const checkLoading = ref(false);
const checkError = ref("");
let checkVersion = 0;
async function recheckSelected() {
  const version = ++checkVersion;
  const issue = selectedEntry.value?.issue;
  checkError.value = ""; checkLoading.value = false;
  if(!issue || issue.code !== "unmapped-shipped-item") {return;}
  delete checks.value[issue.key]; checkLoading.value = true;
  try {
    const result = await check(props.id, props.orderId, issue.shipmentId || "", issue.orderItemSeqId || "");
    if(version === checkVersion) {checks.value[issue.key] = result;}
  } catch (err: any) {if(version === checkVersion) {checkError.value = err.message;}}
  finally {if(version === checkVersion) {checkLoading.value = false;}}
}
watch(selectedKey, () => {void recheckSelected();}, { immediate: true });
const shopifyUrl = computed(() => shopifyTransferAdminUrl(shop.value?.myshopifyDomain, summary.value?.transferId || currentCheck.value?.transferId));
const workingFacts = computed(() => {
  const facts: { title: string; detail?: string }[] = [];
  const result = currentCheck.value;
  if(result) {
    facts.push({ title: "Shopify transfer exists", detail: `${result.transferId} / ${result.snapshot.status}` });
    if(result.choices.length === 1 && result.choices[0].available) {facts.push({ title: "Product mapping verified", detail: result.choices[0].sku });}
    if(Number.isInteger(Number(result.item.quantity)) && Number(result.item.quantity) > 0) {facts.push({ title: "Shipped quantity is valid", detail: translate("Quantity: {quantity}", { quantity: result.item.quantity }) });}
  }
  const creationLog = logsFor("create", props.orderId)[0];
  if(!result && creationLog && transferDeliveryState(creationLog).color === "success" && !failingDomains.value?.shopifyTransferDelivery) {
    facts.push({ title: "Creation delivered to Shopify", detail: formatDateTime(creationLog.finishDateTime) });
  }
  if(mappingReady.value[selectedKey.value]) {facts.push({ title: "One valid mapping remains" });}
  return facts;
});
function issueTitle(issue: TransferStagingIssue) {
  if(mappingReady.value[issue.key] && isMappingConflict(issue)) {return "Mapping repaired; ready to stage";}
  const result = checks.value[issue.key];
  if(result?.choices.length && result.choices.length > 1) {return "Multiple Shopify variants mapped to one product";}
  if(result?.choices.length === 1 && result.choices[0].available && !result.matches.length) {return "Item missing from Shopify transfer";}
  return issue.title;
}
const resolutionIssue = computed<TransferStagingIssue>(() => {
  const issue = selectedEntry.value?.issue;
  if(!issue) {return {} as TransferStagingIssue;}
  const result = currentCheck.value;
  if(!result) {return issue;}
  if(result.choices.length > 1) {return { ...issue, title: "Multiple Shopify variants mapped to one product", productId: result.item.productId };}
  if(result.choices.length !== 1 || !result.choices[0].available) {
    return { ...issue, code: "product-mapping", title: "The product mapping needs review", action: "Review the Shopify variant mapping for this OMS product. The comparison cannot identify the transfer line until exactly one valid mapping remains. Recheck after correcting it." };
  }
  if(!Number.isInteger(Number(result.item.quantity)) || Number(result.item.quantity) <= 0) {
    return { ...issue, code: "quantity", title: "The shipped quantity needs review", action: "Shopify requires a whole positive shipped quantity. Review this shipment item in Transfers before retrying the update job." };
  }
  return issue;
});
const mappingReady = ref<Record<string, boolean>>({});
const busyByIssue = ref<Record<string, boolean>>({});
const mappingBusy = computed(() => Object.values(busyByIssue.value).some(Boolean));
const mappingVersion = ref(0);
const readyToRetry = computed(() => checked.value && !syncError.value && creationIssues.value.length > 0 && creationIssues.value.every(issue => isMappingConflict(issue) && mappingReady.value[issue.key]));
function setMappingBusy(key: string, value: boolean) {
  const wasBusy = busyByIssue.value[key]; busyByIssue.value[key] = value;
  if(wasBusy && !value && selectedEntry.value?.issue.code === "unmapped-shipped-item") {void recheckSelected();}
}
function isMappingConflict(issue: TransferStagingIssue) {return issue.title === "Multiple Shopify variants mapped to one product";}
function displayIssues(issues: TransferStagingIssue[]) {return issues.filter(issue => !(issue.waiting && issues.some(blocker => blocker.code === "unmapped-shipped-item" && blocker.shipmentId === issue.shipmentId)));}
function dependentReceipts(issue: TransferStagingIssue, issues: TransferStagingIssue[]) {return issues.filter(row => row.waiting && row.shipmentId === issue.shipmentId && row.receiptId).map(row => row.receiptId!);}
function itemLabel(issue: TransferStagingIssue) {
  const item = checks.value[issue.key]?.item || order.value?.items?.find(item => item.orderItemSeqId === issue.orderItemSeqId);
  const productId = issue.productId || item?.productId;
  const product = products.value.get(productId || "");
  return [product?.sku || (productId ? translate("Product {id}", { id: productId }) : ""), product ? commonUtil.getFeatures(product.productFeatures) : "",
    issue.shipmentId ? translate("Shipment {id}", { id: issue.shipmentId }) : "", issue.orderItemSeqId ? translate("Item {id}", { id: issue.orderItemSeqId }) : ""].filter(Boolean).join(" — ");
}
watch(order, value => {void resolve((value?.items || []).map(item => item.productId || "").filter(Boolean));});
const { start, stop, syncNow, error: syncError, domainStatus, failingDomains } = useCacheSync();
const baseline = ref(0);
const checked = computed(() => Number(domainStatus.value.serviceJobRun?.at || 0) > baseline.value);
const deliveryChecked = computed(() => Number(domainStatus.value.shopifyTransferDelivery?.at || 0) > baseline.value);
const active = ref(false);
const refreshing = ref(false);
function startRuns() {
  baseline.value = Number(domainStatus.value.serviceJobRun?.at || 0);
  void start([{ name: "shopifyTransferDelivery", args: { shopId: props.id } }, ...(jobNames.value.length ? [{ name: "serviceJobRun", args: { jobNames: jobNames.value, total: 5, batchSize: 5 } }] : [])]).catch(() => undefined);
}
async function refresh() {
  if(mappingBusy.value) {return;}
  refreshing.value = true; mappingReady.value = {}; mappingVersion.value++;
  try {await Promise.all([load([{ orderId: props.orderId }], { refresh: true }), loadSummary(), recheckSelected(), syncNow()]);}
  catch { /* Owning read helpers expose their errors. */ } finally {refreshing.value = false;}
}
function enter() {active.value = true; startRuns(); void load([{ orderId: props.orderId }], { refresh: true }); void loadSummary(); mappingVersion.value++;}
watch(() => `${props.id}|${props.orderId}`, () => {mappingReady.value = {}; busyByIssue.value = {}; checks.value = {}; checkVersion++; summaryVersion++; if(active.value) {enter(); void recheckSelected();}});
watch(jobNames, () => {if(active.value) {startRuns();}});
onIonViewWillEnter(enter);
onIonViewDidLeave(() => {active.value = false; checkVersion++; summaryVersion++; stop();});
const showJob = ref(false);
const selectedJob = ref<TransferSyncJobCard>();
function openJob(card?: TransferSyncJobCard) {if(card?.job) {selectedJob.value = card; showJob.value = true;}}
</script>

<style scoped>
.transfer-summary-fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
}
.transfer-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacer-xs);
}
.transfer-status-cards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
}
@media (max-width: 991px) {
  .transfer-status-cards { grid-template-columns: 1fr; }
}
</style>
