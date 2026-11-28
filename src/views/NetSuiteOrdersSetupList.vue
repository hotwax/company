<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button :default-href="`/netsuite/stores/${productStoreId}/orders`" />
        </ion-buttons>
        <ion-title>{{ translate("{item} · {productStoreName}", { item: translate(setupList?.label ?? list), productStoreName: seed.productStoreName(productStoreId) }) }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-card :data-testid="`netsuite-orders-setup-${list}-list`">
        <ion-card-header>
          <ion-card-title>
            <ion-skeleton-text v-if="isLoading" animated class="count-skeleton" />
            <template v-else>{{ recordCount === 1 ? translate(setupList?.titleOne ?? "") : translate(setupList?.title ?? "", { count: recordCount ?? 0 }) }}</template>
          </ion-card-title>
          <ion-card-subtitle>{{ translate(setupList?.meaning ?? "") }}</ion-card-subtitle>
        </ion-card-header>
        <ion-button
          v-if="setupList?.asksNetSuiteBySku && records.length"
          class="ion-margin-horizontal"
          :disabled="isAskingNetSuite"
          data-testid="netsuite-orders-setup-ask-netsuite"
          @click="askNetSuite()"
        >
          {{ translate("Ask NetSuite now") }}
        </ion-button>
        <ion-card-content v-if="loadError">{{ loadError }}</ion-card-content>
        <ion-list lines="full">
          <ion-item v-if="!isLoading && !records.length" lines="none">
            <ion-label>{{ translate("Nothing is missing") }}</ion-label>
          </ion-item>
          <ion-item v-for="record in records" :key="record.recordId">
            <ion-label class="ion-text-wrap">
              {{ record.recordName || record.recordId }}
              <p v-if="record.recordName !== record.recordId">{{ record.recordId }}</p>
              <p v-if="record.recordDetail">{{ record.recordDetail }}</p>
              <p>{{ translate("On {count} orders, the first placed {date}", { count: record.orderCount, date: commonUtil.getDateAndTime(record.firstOrderDate) }) }}</p>
              <p v-if="netSuiteAnswers[record.recordId]" :data-testid="`netsuite-orders-setup-answer-${record.recordId}`">
                <ion-text :color="netSuiteAnswers[record.recordId].length === 1 ? undefined : 'warning'">{{ netSuiteAnswerLine(netSuiteAnswers[record.recordId]) }}</ion-text>
              </p>
            </ion-label>
            <ion-button v-if="setupList?.addNetSuiteId" slot="end" size="small" fill="outline" :data-testid="`netsuite-orders-setup-add-${record.recordId}`" @click="addNetSuiteId(record)">
              <ion-icon :icon="addOutline" />
              <ion-label>{{ translate(setupList.addNetSuiteId.label) }}</ion-label>
            </ion-button>
            <ion-button
              v-if="setupList?.picksNetSuiteLocation"
              slot="end"
              size="small"
              fill="outline"
              :disabled="!unusedNetSuiteLocations.length || isSavingLocation"
              :data-testid="`netsuite-orders-setup-pick-location-${record.recordId}`"
              @click="pickNetSuiteLocation(record)"
            >
              <ion-icon :icon="addOutline" />
              <ion-label>{{ translate("NetSuite ID") }}</ion-label>
            </ion-button>
          </ion-item>
        </ion-list>
        <ion-button v-if="!isLoading && recordCount != null && records.length < recordCount" fill="clear" expand="block" @click="loadMore()">
          {{ translate("Load more") }}
        </ion-button>
      </ion-card>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  IonBackButton, IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonContent, IonHeader, IonIcon, IonItem,
  IonLabel, IonList, IonPage, IonSkeletonText, IonText, IonTitle, IonToolbar, alertController, modalController, onIonViewDidLeave, onIonViewWillEnter,
} from "@ionic/vue";
import { addOutline } from "ionicons/icons";
import { commonUtil, emitter, logger, translate, useLiveEntity } from "@common";
import { serviceState, useSeedData } from "@common/db";
import { companyDb } from "@/db/companyDb";
import { activateSyncDomains, createSyncDomainOwner, deactivateSyncDomains } from "@/db/appDbSync";
import { NETSUITE_ORDERS_SETUP_LIST_DOMAIN, NETSUITE_REVIEW_LOCATIONS_DOMAIN, NETSUITE_STEP_LIST_PAGE } from "@/config/appSyncConfig";
import { askNetSuiteBySku, refreshSetupLists, saveSetupListNetSuiteId } from "@/composables/useNetSuiteOrdersFlow";
import { REFUSAL_REASONS, useNetSuiteSetupReview, useNetSuiteSetupReviewSave } from "@/composables/useNetSuiteSetupReview";
import SelectNetSuiteLocationModal from "@/components/netsuite-setup-review/SelectNetSuiteLocationModal.vue";
import { NETSUITE_ORDERS_SETUP_LISTS } from "@/config/netSuiteOrdersSetup";

const props = defineProps<{ productStoreId: string; list: string }>();

const seed = useSeedData();
const SYNC_OWNER = createSyncDomainOwner("netSuiteOrdersSetupList");
const isActive = ref(false);
const limit = ref(NETSUITE_STEP_LIST_PAGE);

const setupList = computed(() => NETSUITE_ORDERS_SETUP_LISTS[props.list]);

const { first: storedList, hydrated } = useLiveEntity<any>(
  companyDb.tables.netSuiteOrdersSetupLists,
  () => ({ equals: { productStoreId: props.productStoreId, list: props.list } }),
);

const loadError = computed(() => serviceState.errors[NETSUITE_ORDERS_SETUP_LIST_DOMAIN]);
const isLoading = computed(() => !loadError.value && (!hydrated.value || !storedList.value));
const recordCount = computed<number | undefined>(() => storedList.value?.recordCount);
const records = computed<any[]>(() => storedList.value?.records ?? []);

const activate = () => activateSyncDomains([
  { name: NETSUITE_ORDERS_SETUP_LIST_DOMAIN, args: { productStoreId: props.productStoreId, list: props.list, limit: limit.value } },
  ...(setupList.value?.picksNetSuiteLocation ? [{ name: NETSUITE_REVIEW_LOCATIONS_DOMAIN }] : []),
], SYNC_OWNER);

const { locationSections } = useNetSuiteSetupReview();
const { save: saveReview } = useNetSuiteSetupReviewSave();
const unusedNetSuiteLocations = computed(() => locationSections.value.unused);
const isSavingLocation = ref(false);

async function pickNetSuiteLocation(record: any) {
  const modal = await modalController.create({
    component: SelectNetSuiteLocationModal,
    componentProps: {
      facilityName: record.recordName || record.recordId,
      locations: unusedNetSuiteLocations.value.map((location: any) => ({ netSuiteLocationId: location.netSuiteLocationId, name: location.name })),
    },
  });
  modal.onDidDismiss().then(({ data }: any) => {
    if (data?.netSuiteLocationId) void saveNetSuiteLocation(record, data.netSuiteLocationId);
  });
  await modal.present();
}

async function saveNetSuiteLocation(record: any, netSuiteLocationId: string) {
  isSavingLocation.value = true;
  try {
    const { refusedRows } = await saveReview({ subsidiaryIds: [], locationIds: [], departmentIds: [], locationPicks: [{ netSuiteLocationId, facilityId: record.recordId }] });
    if (refusedRows.length) {
      commonUtil.showToast(`${translate("Nothing was saved.")} ${refusedRows.map((row: any) => translate(REFUSAL_REASONS[row.reason] ?? row.reason)).join(" ")}`);
    } else {
      commonUtil.showToast(translate("NetSuite ID updated"));
    }
    await refreshSetupLists();
  } catch (error) {
    logger.error(error);
    commonUtil.showToast(`${translate("Nothing was saved.")} ${commonUtil.getErrorMessage(error)}`);
  } finally {
    isSavingLocation.value = false;
  }
}

const netSuiteAnswers = ref<Record<string, string[]>>({});
const isAskingNetSuite = ref(false);

const netSuiteAnswerLine = (netsuiteProductIds: string[]) => (netsuiteProductIds.length === 1
  ? translate("Found NetSuite item {id}. It is being saved.", { id: netsuiteProductIds[0] })
  : netsuiteProductIds.length
    ? translate("This SKU is on {count} active NetSuite items: {ids}.", { count: netsuiteProductIds.length, ids: netsuiteProductIds.join(", ") })
    : translate("No active NetSuite item has this SKU."));

async function askNetSuite() {
  isAskingNetSuite.value = true;
  try {
    const lookups = await askNetSuiteBySku(records.value.map((record) => record.recordId));
    netSuiteAnswers.value = Object.fromEntries(lookups.map((lookup) => [lookup.productId, lookup.netsuiteProductIds ?? []]));
    const foundCount = lookups.filter((lookup) => lookup.netsuiteProductIds?.length === 1).length;
    commonUtil.showToast(translate("NetSuite found {found} of {asked} products.", { found: foundCount, asked: lookups.length }));
    await refreshSetupLists();
  } catch (error) {
    logger.error(error);
    commonUtil.showToast(`${translate("Could not ask NetSuite.")} ${commonUtil.getErrorMessage(error)}`);
  } finally {
    isAskingNetSuite.value = false;
  }
}

async function addNetSuiteId(record: any) {
  const addNetSuiteIdConfig = setupList.value?.addNetSuiteId;
  if (!addNetSuiteIdConfig) return;
  const alert = await alertController.create({
    header: translate("Add {label}", { label: translate(addNetSuiteIdConfig.label) }),
    subHeader: record.recordName || record.recordId,
    inputs: [{ name: "netSuiteId", placeholder: translate(addNetSuiteIdConfig.inputLabel) }],
    buttons: [
      { text: translate("Cancel"), role: "cancel" },
      {
        text: translate("Apply"),
        handler: (data: any) => {
          const netSuiteId = data?.netSuiteId?.trim();
          if (!netSuiteId) return false;
          void saveNetSuiteId(addNetSuiteIdConfig, record, netSuiteId);
        },
      },
    ],
  });
  await alert.present();
}

async function saveNetSuiteId(addNetSuiteIdConfig: NonNullable<typeof setupList.value>["addNetSuiteId"], record: any, netSuiteId: string) {
  if (!addNetSuiteIdConfig) return;
  emitter.emit("presentLoader");
  try {
    const saved = await saveSetupListNetSuiteId(addNetSuiteIdConfig, record.recordId, netSuiteId);
    commonUtil.showToast(translate("{label} set: {name} ({id})", { label: translate(addNetSuiteIdConfig.label), name: saved?.customerName ?? "", id: netSuiteId }));
  } catch (error) {
    logger.error(error);
    commonUtil.showToast(`${translate("Nothing was saved.")} ${commonUtil.getErrorMessage(error)}`);
  }
  emitter.emit("dismissLoader");
}

const loadMore = () => {
  limit.value += NETSUITE_STEP_LIST_PAGE;
  void activate();
};

onIonViewWillEnter(() => {
  isActive.value = true;
  void activate();
});

onIonViewDidLeave(() => {
  isActive.value = false;
  void deactivateSyncDomains(SYNC_OWNER);
});

watch(() => [props.productStoreId, props.list], () => {
  limit.value = NETSUITE_STEP_LIST_PAGE;
  if (isActive.value) void activate();
});
</script>

<style scoped>
.count-skeleton {
  width: 12rem;
}
</style>
