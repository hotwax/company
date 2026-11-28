<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/netsuite" />
        </ion-buttons>
        <ion-title>{{ translate("Orders · {productStoreName}", { productStoreName: seed.productStoreName(productStoreId) }) }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <NetSuiteOrdersMonitoringView :product-store-id="productStoreId" />
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { IonBackButton, IonButtons, IonContent, IonHeader, IonPage, IonTitle, IonToolbar, onIonViewDidLeave, onIonViewWillEnter } from "@ionic/vue";
import { translate } from "@common";
import { useSeedData } from "@common/db";
import { activateSyncDomains, createSyncDomainOwner, deactivateSyncDomains } from "@/db/appDbSync";
import { NETSUITE_ORDERS_KEY_DATES_DOMAIN, NETSUITE_ORDERS_SETUP_DOMAIN, NETSUITE_SENDING_COUNTS_DOMAIN, NETSUITE_STEP_COUNTS_DOMAIN } from "@/config/appSyncConfig";
import NetSuiteOrdersMonitoringView from "@/components/netsuite-orders-flow/NetSuiteOrdersMonitoringView.vue";

const props = defineProps<{ productStoreId: string }>();

const seed = useSeedData();
const SYNC_OWNER = createSyncDomainOwner("netSuiteOrdersFlow");
const isActive = ref(false);

const screenDomains = () => props.productStoreId
  ? [
    { name: NETSUITE_SENDING_COUNTS_DOMAIN },
    { name: "serviceJob" },
    { name: NETSUITE_STEP_COUNTS_DOMAIN, args: { productStoreId: props.productStoreId } },
    { name: NETSUITE_ORDERS_KEY_DATES_DOMAIN, args: { productStoreId: props.productStoreId } },
    { name: NETSUITE_ORDERS_SETUP_DOMAIN, args: { productStoreId: props.productStoreId } },
  ]
  : [];

const activate = () => activateSyncDomains(screenDomains(), SYNC_OWNER);

onIonViewWillEnter(() => {
  isActive.value = true;
  void activate();
});

onIonViewDidLeave(() => {
  isActive.value = false;
  void deactivateSyncDomains(SYNC_OWNER);
});

watch(() => props.productStoreId, () => {
  if(isActive.value) void activate();
});
</script>
