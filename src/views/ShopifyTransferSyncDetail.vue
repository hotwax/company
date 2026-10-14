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
          <ion-item v-if="ownerChecked && !owner">
            <ion-label class="ion-text-wrap">{{ translate('Not synced as a Shopify transfer') }}<p>{{ translate('This transfer has no native sync owner, so its inventory movements reach Shopify as inventory events.') }}</p></ion-label>
          </ion-item>
        </ion-list>
        <ion-card-content class="transfer-actions">
          <ion-button fill="clear" :href="transfersUrl" target="_blank" rel="noopener noreferrer">{{ translate('Open in Transfers') }}<ion-icon slot="end" :icon="openOutline" /></ion-button>
          <ion-button fill="clear" :disabled="!shopifyUrl" :href="shopifyUrl || undefined" target="_blank" rel="noopener noreferrer">{{ translate('Open in Shopify') }}<ion-icon slot="end" :icon="openOutline" /></ion-button>
          <ion-button v-for="card in stagingCards.filter(card => card.job)" :key="card.jobName" fill="outline" :disabled="mappingBusy" @click="openJob(card)">{{ translate(card.definition.key === 'create' ? 'Creation job details' : 'Update job details') }}</ion-button>
          <ion-button v-if="canDetach" fill="outline" color="danger" :disabled="mappingBusy || refreshing" @click="showDetach = true">{{ translate('Detach from native sync') }}</ion-button>
        </ion-card-content>
      </ion-card>

      <!-- With native sync off the stagers skip this shop, so their results say nothing about this transfer. -->
      <ion-card v-if="nativeSyncOff">
        <ion-card-header>
          <ion-card-title>{{ translate('Native Inventory Transfer Sync is off') }}</ion-card-title>
          <ion-card-subtitle>{{ translate('This transfer will not be created or updated in Shopify while it is off.') }}</ion-card-subtitle>
        </ion-card-header>
        <ion-list lines="full">
          <ion-item>
            <ion-label class="ion-text-wrap">
              {{ translate('Its stock changes reach Shopify as inventory updates instead, so nothing here is waiting on a staging job.') }}
            </ion-label>
          </ion-item>
          <ion-item>
            <ion-label class="ion-text-wrap">
              <h2>{{ translate('Next steps') }}</h2>
              <p v-if="summary?.transferId">{{ translate('Its Shopify transfer is only updated through native sync. To send its shipments and receipts to it, turn native sync back on from the transfer sync page; every transfer queued for this shop would then sync too.') }}</p>
              <p v-else>{{ translate(canDetach ? 'To stop listing it as outstanding, use Detach from native sync above. To send it to Shopify as a transfer, turn native sync back on from the transfer sync page; every transfer queued for this shop would then be created in Shopify.' : 'To stop listing it as outstanding, detach it from native sync. To send it to Shopify as a transfer, turn native sync back on from the transfer sync page; every transfer queued for this shop would then be created in Shopify.') }}</p>
            </ion-label>
            <ion-button slot="end" fill="outline" :router-link="`/shopify-connection-details/${id}/transfer-sync`">{{ translate('Open transfer sync') }}</ion-button>
          </ion-item>
        </ion-list>
      </ion-card>

      <section v-else class="transfer-status-cards">
        <ion-card>
          <ion-card-header><ion-card-title>{{ translate('Issues') }}</ion-card-title><ion-card-subtitle v-if="issueEntries.length">{{ translate('Select an issue to resolve below') }}</ion-card-subtitle></ion-card-header>
          <ion-list lines="full">
            <ion-item v-if="!checked && !issueEntries.length"><ion-spinner slot="start" /><ion-label>{{ translate('Loading staging results') }}</ion-label></ion-item>
            <ion-item v-else-if="!issueEntries.length"><ion-label class="ion-text-wrap">{{ translate(stages.some(stage => stage.run) ? 'No blocker reported for this transfer in this run.' : 'No completed staging run is available yet.') }}</ion-label></ion-item>
            <ion-radio-group v-model="selectedKey" :aria-label="translate('Transfer sync issues')">
              <ion-item v-for="entry in issueEntries" :key="entry.issue.key" :disabled="mappingBusy">
                <ion-radio :value="entry.issue.key" :disabled="mappingBusy" label-placement="end" justify="start">
                  <ion-label class="ion-text-wrap"><h2>{{ translate(resolvedIssue(entry.issue).title) }}</h2><p>{{ itemLabel(entry.issue) || translate(entry.stage.card.definition.key === 'create' ? 'Creation' : 'Updates') }}</p></ion-label>
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

      <ion-card v-if="selectedEntry && !nativeSyncOff">
        <ion-card-header><ion-card-title>{{ translate('Resolve issue') }}</ion-card-title></ion-card-header>
        <ion-list lines="full">
          <ShopifyTransferDeliveryStatus v-if="resolutionIssue.code === 'delivery'" :shop-id="id" :order-id="orderId"
            :stage="selectedEntry.stage.card.definition.key as TransferStager" :checked="deliveryChecked" :error="failingDomains?.shopifyTransferDelivery" />
          <ShopifyTransferMappingConflict v-else-if="isMappingConflict(resolutionIssue) && resolutionIssue.productId"
            :key="`${resolutionIssue.key}:${mappingVersion}`" :shop-id="id" :product-id="resolutionIssue.productId" :domain="shop?.myshopifyDomain"
            @busy="setMappingBusy(resolutionIssue.key, $event)" @ready="mappingReady[resolutionIssue.key] = $event" />
          <ShopifyTransferMissingMapping
            v-else-if="resolutionIssue.code === 'missing-product-mapping' && resolutionIssue.productId"
            :key="`${resolutionIssue.key}:${mappingVersion}`"
            :shop-id="id"
            :product-id="resolutionIssue.productId"
            :product-store-id="shop?.productStoreId"
            :domain="shop?.myshopifyDomain"
            @busy="setMappingBusy(resolutionIssue.key, $event)"
            @ready="mappingReady[resolutionIssue.key] = $event"
          />
          <ShopifyTransferUpdateBlocker v-else-if="resolutionIssue.code === 'unmapped-shipped-item'"
            :key="resolutionIssue.key" :shop-id="id" :order-id="orderId" :order-name="order?.orderName" :domain="shop?.myshopifyDomain"
            :issue="resolutionIssue" :waiting-receipts="dependentReceipts(resolutionIssue, selectedEntry.stage.issues)"
            :result="checks[resolutionIssue.key]" :loading="checkLoading" :error="checkError" @recheck="recheckSelected" />
          <ion-item v-else><ion-label class="ion-text-wrap"><h2>{{ translate(resolutionIssue.title) }}</h2><p>{{ translate(resolutionIssue.action) }}</p></ion-label><ion-button fill="clear" :disabled="refreshing" @click="refresh">{{ translate('Recheck comparison') }}</ion-button></ion-item>
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
    <ShopifyTransferDetachModal
      :is-open="showDetach"
      :shop-id="id"
      :order-id="orderId"
      :order-name="order?.orderName"
      @close="showDetach = false"
      @detached="onDetached"
    />
  </ion-page>
</template>

<script setup lang="ts">
import { commonUtil, translate, useProducts } from "@common";
import { IonAccordion, IonAccordionGroup, IonBackButton, IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonNote, IonPage, IonRadio, IonRadioGroup, IonSpinner, IonTitle, IonToolbar, onIonViewDidLeave, onIonViewWillEnter } from "@ionic/vue";
import { checkmarkCircleOutline, openOutline, refreshOutline, warningOutline } from "ionicons/icons";
import { computed, ref, watch } from "vue";
import ServiceJobDetailsModal from "@/components/common/ServiceJobDetailsModal.vue";
import ShopifyTransferDeliveryStatus from "@/components/shopify/ShopifyTransferDeliveryStatus.vue";
import ShopifyTransferDetachModal from "@/components/shopify/ShopifyTransferDetachModal.vue";
import ShopifyTransferMappingConflict from "@/components/shopify/ShopifyTransferMappingConflict.vue";
import ShopifyTransferMissingMapping from "@/components/shopify/ShopifyTransferMissingMapping.vue";
import ShopifyTransferUpdateBlocker from "@/components/shopify/ShopifyTransferUpdateBlocker.vue";
import { serviceState } from "@common/db";
import { type TransferDetachResult, type TransferOwner, useShopifyTransferDetach } from "@/composables/useShopifyTransferDetach";
import { activateSyncDomains, createSyncDomainOwner, deactivateSyncDomains, syncDomainsError as syncError, syncNow } from "@/services/appDbSync";
import { useFacilities } from "@/composables/useFacilities";
import { useServiceJobRunsByJob, useServiceJobs } from "@/composables/useServiceJobs";
import { useShopifyShop } from "@/composables/useShopify";
import { type TransferSyncJobCard, useShopifyNativeTransferSync, useShopifyTransferSyncJobs } from "@/composables/useShopifyTransferSync";
import { fetchTransferSyncSummary, useShopifyTransferSyncEnrichment } from "@/composables/useShopifyTransferSyncEnrichment";
import { type TransferUpdateCheck, useShopifyTransferUpdateCheck } from "@/composables/useShopifyTransferUpdateCheck";
import { useShopifyTransferDelivery } from "@/composables/useShopifyTransferDelivery";
import { formatDateTime } from "@/utils";
import { transferDeliveryState } from "@/utils/shopifyTransferDelivery";
import { type TransferStager, type TransferStagingIssue, latestCompletedStagingRun, resolveTransferStagingIssue, transferStagingIssues } from "@/utils/shopifyTransferStagingErrors";
import { shopifyTransferAdminUrl, transfersAppOrderUrl } from "@/utils/shopifyTransferSync";

const props = defineProps<{ id: string; orderId: string }>();
const shopId = computed(() => props.id);
const { record: shop } = useShopifyShop(shopId);
const { jobs, hydrated: jobsHydrated } = useServiceJobs();
const { cards } = useShopifyTransferSyncJobs(() => props.id, () => jobs.value);
const stagingCards = computed(() => cards.value.filter(card => ["create", "update"].includes(card.definition.key)));
const jobNames = computed(() => stagingCards.value.filter(card => card.job).map(card => card.jobName));
const { runsFor } = useServiceJobRunsByJob(() => jobNames.value, 5);
const summary = ref<Awaited<ReturnType<typeof fetchTransferSyncSummary>>>();
const { enabled: nativeSyncEnabled, load: loadNativeSync } = useShopifyNativeTransferSync();
const nativeSyncOff = computed(() => nativeSyncEnabled.value === false);
const stages = computed(() => stagingCards.value.map(card => {
  const run = latestCompletedStagingRun(runsFor(card.jobName));
  // A run-wide creation result says nothing about a transfer Shopify already has.
  const created = card.definition.key === "create" && !!summary.value?.transferId;
  return { card, run, issues: transferStagingIssues(run, props.id, card.definition.key as TransferStager)
    .filter(issue => issue.orderId ? issue.orderId === props.orderId : !created) };
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
const { enrichment, load, loading: orderLoading, error: orderError } = useShopifyTransferSyncEnrichment();
const order = computed(() => enrichment.value.ordersById[props.orderId]);
const { products, resolve } = useProducts();
const { records: facilities } = useFacilities();
function facilityName(id?: string) {return facilities.value.find(row => row.facilityId === id)?.facilityName || id || translate("Not available");}
const transfersUrl = computed(() => transfersAppOrderUrl(props.orderId));
const summaryError = ref("");
let summaryVersion = 0;
async function loadSummary() {
  const version = ++summaryVersion;
  summary.value = undefined; summaryError.value = "";
  try {const result = await fetchTransferSyncSummary(props.id, props.orderId); if(version === summaryVersion) {summary.value = result;}}
  catch (err: any) {if(version === summaryVersion) {summaryError.value = err.message;}}
}
const { fetchOwner } = useShopifyTransferDetach();
const owner = ref<TransferOwner>();
const ownerChecked = ref(false);
let ownerVersion = 0;
async function loadOwner() {
  const version = ++ownerVersion;
  ownerChecked.value = false;
  try {
    const result = await fetchOwner(props.id, props.orderId);
    if(version === ownerVersion) {owner.value = result; ownerChecked.value = true;}
  } catch (err: any) {
    // A 404 is an OMS whose connector predates the owner resource: detach is unavailable there, not broken.
    if(version === ownerVersion && err?.response?.status !== 404) {summaryError.value = summaryError.value || err.message;}
  }
}
// Only a transfer never created in Shopify can be detached without a Shopify-side cleanup.
const canDetach = computed(() => ownerChecked.value && !!owner.value && !owner.value.shopifyInventoryTransferId);
const showDetach = ref(false);
function onDetached(result: TransferDetachResult & { published: boolean }) {
  showDetach.value = false;
  commonUtil.showToast(result.published
    ? translate("Detached. {created} inventory events recorded, {existing} already recorded.", { created: result.createdDetailCount, existing: result.existingDetailCount })
    : translate("Detached from native sync."));
  void loadOwner(); void refresh();
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
function resolvedIssue(issue: TransferStagingIssue) {
  const resolved = resolveTransferStagingIssue(issue, checks.value[issue.key]);
  if(!mappingReady.value[issue.key]) {return resolved;}
  if(isMappingConflict(resolved)) {return { ...resolved, title: "Mapping repaired; ready to stage" };}

  return resolved.code === "missing-product-mapping" ? { ...resolved, title: "Mapped to Shopify; ready to stage" } : resolved;
}
const resolutionIssue = computed(() => resolvedIssue(selectedEntry.value!.issue));
const mappingReady = ref<Record<string, boolean>>({});
const busyByIssue = ref<Record<string, boolean>>({});
const mappingBusy = computed(() => Object.values(busyByIssue.value).some(Boolean));
const mappingVersion = ref(0);
function setMappingBusy(key: string, value: boolean) {
  const wasBusy = busyByIssue.value[key]; busyByIssue.value[key] = value;
  if(wasBusy && !value && selectedEntry.value?.issue.code === "unmapped-shipped-item") {void recheckSelected();}
}
function isMappingConflict(issue: TransferStagingIssue) {return issue.code === "multiple-product-mappings";}
function displayIssues(issues: TransferStagingIssue[]) {return issues.filter(issue => !(issue.waiting && issues.some(blocker => blocker.code === "unmapped-shipped-item" && blocker.shipmentId === issue.shipmentId)));}
function dependentReceipts(issue: TransferStagingIssue, issues: TransferStagingIssue[]) {return issues.filter(row => row.waiting && row.shipmentId === issue.shipmentId && row.receiptId).map(row => row.receiptId!);}
function itemLabel(issue: TransferStagingIssue) {
  const item = checks.value[issue.key]?.item || (!issue.shipmentId ? order.value?.items?.find(item => item.orderItemSeqId === issue.orderItemSeqId) : undefined);
  const productId = issue.productId || item?.productId;
  const product = products.value.get(productId || "");
  return [product?.sku || (productId ? translate("Product {id}", { id: productId }) : ""), product ? commonUtil.getFeatures(product.productFeatures) : "",
    issue.shipmentId ? translate("Shipment {id}", { id: issue.shipmentId }) : "", issue.orderItemSeqId ? translate("Item {id}", { id: issue.orderItemSeqId }) : ""].filter(Boolean).join(" — ");
}
watch(order, value => {void resolve((value?.items || []).map(item => item.productId || "").filter(Boolean));});
const SYNC_OWNER = createSyncDomainOwner("shopifyTransferSyncDetail");
const failingDomains = computed<Record<string, string>>(() => serviceState.errors);
const baseline = ref(0);
// With no configured stager there is no `serviceJobRun` to activate (see `startRuns`), so waiting for
// one would spin forever: once the job cache has loaded, an empty job list is itself the answer.
const checked = computed(() => (jobsHydrated.value && !jobNames.value.length)
  || (serviceState.syncedAt.serviceJobRun ?? 0) > baseline.value);
const deliveryChecked = computed(() => (serviceState.syncedAt.shopifyTransferDelivery ?? 0) > baseline.value);
const active = ref(false);
const refreshing = ref(false);
function startRuns() {
  baseline.value = serviceState.syncedAt.serviceJobRun ?? 0;
  void activateSyncDomains([{ name: "shopifyTransferDelivery", args: { shopId: props.id } }, ...(jobNames.value.length ? [{ name: "serviceJobRun", args: { jobNames: jobNames.value, total: 5, batchSize: 5 } }] : [])], SYNC_OWNER).catch(() => undefined);
}
async function refresh() {
  if(mappingBusy.value) {return;}
  refreshing.value = true; mappingReady.value = {}; mappingVersion.value++;
  try {await Promise.all([load([{ orderId: props.orderId }], { refresh: true }), loadSummary(), loadOwner(), recheckSelected(), syncNow()]);}
  catch { /* Owning read helpers expose their errors. */ } finally {refreshing.value = false;}
}
function enter() {active.value = true; startRuns(); void load([{ orderId: props.orderId }], { refresh: true }); void loadSummary(); void loadNativeSync(props.id); void loadOwner(); mappingVersion.value++;}
watch(() => `${props.id}|${props.orderId}`, () => {mappingReady.value = {}; busyByIssue.value = {}; checks.value = {}; checkVersion++; summaryVersion++; ownerVersion++; owner.value = undefined; if(active.value) {enter(); void recheckSelected();}});
watch(jobNames, () => {if(active.value) {startRuns();}});
onIonViewWillEnter(enter);
onIonViewDidLeave(() => {active.value = false; checkVersion++; summaryVersion++; ownerVersion++; void deactivateSyncDomains(SYNC_OWNER);});
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
