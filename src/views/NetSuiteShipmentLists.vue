<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button :default-href="`/netsuite/stores/${productStoreId}/shipments`" />
        </ion-buttons>
        <ion-title>{{ translate("{step} · {productStoreName}", { step: translate(shipmentStep.label), productStoreName: seed.productStoreName(productStoreId) }) }}</ion-title>
      </ion-toolbar>
      <ion-toolbar>
        <ion-segment :value="list" @ion-change="showList(String($event.detail.value))">
          <ion-segment-button v-for="stepList in shipmentStep.lists" :key="stepList" :value="stepList">
            <ion-label>{{ translate(NETSUITE_SHIPMENT_LIST_LABELS[stepList]) }}</ion-label>
          </ion-segment-button>
        </ion-segment>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-card v-if="!hasList" data-testid="netsuite-shipment-list-not-kept">
        <ion-card-content>
          {{ translate("{step} has no {list} list.", { step: translate(shipmentStep.label), list: translate(NETSUITE_SHIPMENT_LIST_LABELS[list]) }) }}
        </ion-card-content>
      </ion-card>
      <NetSuiteShipmentStepList v-else :key="`${step}-${list}`" :product-store-id="productStoreId" :step="step" :list="list" @load-more="loadMore" />
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
import { NETSUITE_SHIPMENT_STEP_LIST_DOMAIN, NETSUITE_STEP_LIST_PAGE } from "@/config/appSyncConfig";
import { NETSUITE_SHIPMENT_LIST_LABELS, NETSUITE_SHIPMENT_STEPS } from "@/config/netSuiteShipmentSteps";
import NetSuiteShipmentStepList from "@/components/netsuite-shipments-flow/NetSuiteShipmentStepList.vue";

const props = defineProps<{ productStoreId: string; step: string; list: string }>();

const router = useRouter();
const seed = useSeedData();
const SYNC_OWNER = createSyncDomainOwner("netSuiteShipmentLists");
const isActive = ref(false);
const limit = ref(NETSUITE_STEP_LIST_PAGE);

const shipmentStep = computed(() => NETSUITE_SHIPMENT_STEPS[props.step]);
const hasList = computed(() => shipmentStep.value.lists.includes(props.list));

const activate = () => activateSyncDomains(hasList.value
  ? [{ name: NETSUITE_SHIPMENT_STEP_LIST_DOMAIN, args: { productStoreId: props.productStoreId, step: props.step, list: props.list, limit: limit.value } }]
  : [], SYNC_OWNER);

const showList = (list: string) => {
  if (list !== props.list) void router.replace(`/netsuite/stores/${props.productStoreId}/shipments/${props.step}/${list}`);
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

watch(() => [props.productStoreId, props.step, props.list], () => {
  limit.value = NETSUITE_STEP_LIST_PAGE;
  if (isActive.value) void activate();
});
</script>
