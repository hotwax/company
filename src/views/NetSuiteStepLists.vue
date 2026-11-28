<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button :default-href="`/netsuite/stores/${productStoreId}/orders`" />
        </ion-buttons>
        <ion-title>
          {{ translate("{step} · {productStoreName}", { step: translate(orderStep.label), productStoreName: seed.productStoreName(productStoreId) }) }}
        </ion-title>
      </ion-toolbar>
      <ion-toolbar>
        <ion-segment :value="list" @ion-change="showList(String($event.detail.value))">
          <ion-segment-button v-for="listTab in listTabs" :key="listTab.list" :value="listTab.list">
            <ion-label>{{ translate(listTab.label) }}</ion-label>
          </ion-segment-button>
        </ion-segment>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-card v-if="!hasList" data-testid="netsuite-step-list-not-kept">
        <ion-card-content>
          {{ translate("{step} has no {list} list.", { step: translate(orderStep.label), list: translate(listLabels[list] ?? list) }) }}
        </ion-card-content>
      </ion-card>
      <NetSuiteStepFailedList
        v-else-if="list === 'failed'"
        :key="step"
        :product-store-id="productStoreId"
        :step="step"
        :selected-error-message="selectedErrorMessage"
        @select-error="selectError"
        @load-more="loadMore"
      />
      <NetSuiteStepRecordList v-else :key="`${step}-${list}`" :product-store-id="productStoreId" :step="step" :list="list" @load-more="loadMore" />
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import {
  IonBackButton, IonButtons, IonCard, IonCardContent, IonContent, IonHeader, IonLabel, IonPage, IonSegment, IonSegmentButton, IonTitle, IonToolbar,
  onIonViewDidLeave, onIonViewWillEnter,
} from "@ionic/vue";
import { translate } from "@common";
import { useSeedData } from "@common/db";
import { activateSyncDomains, createSyncDomainOwner, deactivateSyncDomains } from "@/db/appDbSync";
import { NETSUITE_STEP_FAILURES_DOMAIN, NETSUITE_STEP_LIST_DOMAIN, NETSUITE_STEP_LIST_PAGE } from "@/config/appSyncConfig";
import { NETSUITE_ORDER_STEPS, NETSUITE_STEP_LISTS } from "@/config/netSuiteOrderSteps";
import NetSuiteStepFailedList from "@/components/netsuite-orders-flow/NetSuiteStepFailedList.vue";
import NetSuiteStepRecordList from "@/components/netsuite-orders-flow/NetSuiteStepRecordList.vue";

const props = defineProps<{ productStoreId: string; step: string; list: string }>();

const router = useRouter();
const seed = useSeedData();

const SYNC_OWNER = createSyncDomainOwner("netSuiteStepLists");
const isActive = ref(false);
const selectedErrorMessage = ref("");
const limit = ref(NETSUITE_STEP_LIST_PAGE);

const orderStep = computed(() => NETSUITE_ORDER_STEPS[props.step]);

const listLabels: Record<string, string> = { failed: "Failed", stuck: "Stuck", pending: ">1 day", "not-picked": "Not picked" };

const listTabs = computed(() => (orderStep.value.stepLists ?? NETSUITE_STEP_LISTS).map((list) => ({ list, label: listLabels[list] })));

const hasList = computed(() => listTabs.value.some((listTab) => listTab.list === props.list));

const shownListDomain = () => props.list === "failed"
  ? {
    name: NETSUITE_STEP_FAILURES_DOMAIN,
    args: { productStoreId: props.productStoreId, step: props.step, selectedErrorMessage: selectedErrorMessage.value, limit: limit.value },
  }
  : {
    name: NETSUITE_STEP_LIST_DOMAIN,
    args: { productStoreId: props.productStoreId, step: props.step, list: props.list, limit: limit.value },
  };

const activate = () => activateSyncDomains(hasList.value ? [shownListDomain()] : [], SYNC_OWNER);

const showList = (list: string) => {
  if (list !== props.list) void router.replace(`/netsuite/stores/${props.productStoreId}/orders/${props.step}/${list}`);
};

const selectError = (errorMessage: string) => {
  selectedErrorMessage.value = errorMessage;
  limit.value = NETSUITE_STEP_LIST_PAGE;
  void activate();
};

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

watch(() => [props.productStoreId, props.step, props.list], (_, [, previousStep]) => {
  if (props.step !== previousStep) selectedErrorMessage.value = "";
  limit.value = NETSUITE_STEP_LIST_PAGE;
  if (isActive.value) void activate();
});
</script>
