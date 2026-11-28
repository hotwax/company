<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/netsuite" />
        </ion-buttons>
        <ion-title>{{ translate("Shipments from NetSuite · {productStoreName}", { productStoreName: seed.productStoreName(productStoreId) }) }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <NetSuiteShipmentsSwitchCard :product-store-id="productStoreId" />
      <NetSuiteShipmentsSetupCard :product-store-id="productStoreId" />
      <ion-card data-testid="netsuite-shipments-steps-card">
        <ion-card-header>
          <ion-card-title>{{ translate("Steps") }}</ion-card-title>
          <ion-card-subtitle>{{ translate("A warehouse ships in NetSuite. These steps create the shipment on the OMS order.") }}</ion-card-subtitle>
        </ion-card-header>
        <ion-grid>
          <ion-row class="ion-align-items-center ion-hide-md-down">
            <ion-col size="6"><ion-item lines="none"><ion-label>{{ translate("Step") }}</ion-label></ion-item></ion-col>
            <ion-col size="2"><ion-item lines="none"><ion-label>{{ translate("Failed") }}</ion-label></ion-item></ion-col>
            <ion-col size="2"><ion-item lines="none"><ion-label>{{ translate("Stuck") }}</ion-label></ion-item></ion-col>
            <ion-col size="2"><ion-item lines="none"><ion-label>{{ translate("Waiting") }}</ion-label></ion-item></ion-col>
          </ion-row>
          <NetSuiteShipmentStepRow
            v-for="step in NETSUITE_SHIPMENT_STEP_ORDER"
            :key="step"
            :product-store-id="productStoreId"
            :step="step"
            @open-job="openJobName = $event"
          />
        </ion-grid>
      </ion-card>
      <ServiceJobDetailsModal
        :is-open="Boolean(openJobName)"
        :job-name="openJobName"
        :can-run-now="flowState === 'on'"
        :run-now-disabled-reason="translate('Switch on Shipments from NetSuite first.')"
        :pause-locked-reason="translate('Use the Shipments from NetSuite switch.')"
        are-parameters-read-only
        :editable-parameter-names="['batchSize']"
        :parameter-description="translate('Settings of this job. Only the batch size can be changed.')"
        @updated="resyncDomain(NETSUITE_SHIPMENT_STEP_COUNTS_DOMAIN)"
        @close="openJobName = ''"
      />
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import {
  IonBackButton, IonButtons, IonCard, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonContent, IonGrid, IonHeader, IonItem, IonLabel, IonPage, IonRow, IonTitle,
  IonToolbar, onIonViewDidLeave, onIonViewWillEnter,
} from "@ionic/vue";
import { translate } from "@common";
import { useSeedData } from "@common/db";
import { activateSyncDomains, createSyncDomainOwner, deactivateSyncDomains, resyncDomain } from "@/db/appDbSync";
import {
  NETSUITE_ORDERS_SETUP_DOMAIN, NETSUITE_SENDING_COUNTS_DOMAIN, NETSUITE_SHIPMENT_STEP_COUNTS_DOMAIN, NETSUITE_SHIPMENTS_SETUP_DOMAIN, NETSUITE_STEP_COUNTS_DOMAIN,
} from "@/config/appSyncConfig";
import { NETSUITE_SHIPMENT_STEP_ORDER } from "@/config/netSuiteShipmentSteps";
import NetSuiteShipmentStepRow from "@/components/netsuite-shipments-flow/NetSuiteShipmentStepRow.vue";
import NetSuiteShipmentsSetupCard from "@/components/netsuite-shipments-flow/NetSuiteShipmentsSetupCard.vue";
import NetSuiteShipmentsSwitchCard from "@/components/netsuite-shipments-flow/NetSuiteShipmentsSwitchCard.vue";
import { useNetSuiteShipmentsSwitch } from "@/composables/useNetSuiteShipmentsFlow";
import ServiceJobDetailsModal from "@/components/common/ServiceJobDetailsModal.vue";

const props = defineProps<{ productStoreId: string }>();

const seed = useSeedData();
const SYNC_OWNER = createSyncDomainOwner("netSuiteShipmentsFlow");
const isActive = ref(false);
const openJobName = ref("");
const { flowState } = useNetSuiteShipmentsSwitch(() => props.productStoreId);

const activate = () => activateSyncDomains([
  { name: "serviceJob" },
  { name: NETSUITE_SHIPMENT_STEP_COUNTS_DOMAIN, args: { productStoreId: props.productStoreId } },
  { name: NETSUITE_SHIPMENTS_SETUP_DOMAIN },
  { name: NETSUITE_SENDING_COUNTS_DOMAIN },
  { name: NETSUITE_STEP_COUNTS_DOMAIN, args: { productStoreId: props.productStoreId } },
  { name: NETSUITE_ORDERS_SETUP_DOMAIN, args: { productStoreId: props.productStoreId } },
], SYNC_OWNER);

onIonViewWillEnter(() => {
  isActive.value = true;
  void activate();
});

onIonViewDidLeave(() => {
  isActive.value = false;
  void deactivateSyncDomains(SYNC_OWNER);
});

watch(() => props.productStoreId, () => {
  if (isActive.value) void activate();
});
</script>
