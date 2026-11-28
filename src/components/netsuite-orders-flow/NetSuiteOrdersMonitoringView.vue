<template>
  <NetSuiteOrdersSwitchCard :product-store-id="productStoreId" />
  <NetSuiteOrdersSetupCard :product-store-id="productStoreId" />
  <NetSuiteSendingCard @open-job="openJob" />
  <ion-card data-testid="netsuite-orders-steps-card">
    <ion-card-header>
      <ion-card-title>{{ translate("Steps") }}</ion-card-title>
    </ion-card-header>
    <ion-grid>
      <ion-row class="ion-align-items-center ion-hide-md-down">
        <ion-col size="4"><ion-item lines="none"><ion-label>{{ translate("Step") }}</ion-label></ion-item></ion-col>
        <ion-col size="2"><ion-item lines="none"><ion-label>{{ translate("Failed") }}</ion-label></ion-item></ion-col>
        <ion-col size="2"><ion-item lines="none"><ion-label>{{ translate("Stuck") }}</ion-label></ion-item></ion-col>
        <ion-col size="2"><ion-item lines="none"><ion-label>{{ translate(">1 day") }}</ion-label></ion-item></ion-col>
        <ion-col size="2"><ion-item lines="none"><ion-label>{{ translate("Not picked") }}</ion-label></ion-item></ion-col>
      </ion-row>
      <NetSuiteStepRow
        v-for="step in NETSUITE_ORDER_STEP_ORDER"
        :key="step"
        :product-store-id="productStoreId"
        :step="step"
        :label="NETSUITE_ORDER_STEPS[step].label"
        @open-job="openJob"
      />
    </ion-grid>
  </ion-card>
  <ion-grid class="ion-no-padding">
    <ion-row>
      <ion-col size="12" size-md="6" class="ion-no-padding">
        <NetSuiteOrdersKeyDatesCard :product-store-id="productStoreId" />
      </ion-col>
      <ion-col size="12" size-md="6" class="ion-no-padding">
        <NetSuiteOrdersRulesCard :product-store-id="productStoreId" />
      </ion-col>
    </ion-row>
  </ion-grid>
  <ServiceJobDetailsModal
    :is-open="Boolean(openJobName)"
    :job-name="openJobName"
    :can-run-now="flowState === 'on'"
    :run-now-disabled-reason="translate('Switch on the Orders flow first.')"
    :pause-locked-reason="translate('Use the Orders flow switch.')"
    are-parameters-read-only
    :editable-parameter-names="['batchSize', 'maxBatchesInFlight']"
    :parameter-description="translate('Settings of this job. Only the batch size and the open-batch limit can be changed.')"
    @updated="refreshJobs"
    @close="openJobName = ''"
  />
</template>

<script setup lang="ts">
import { ref } from "vue";
import { IonCard, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonItem, IonLabel, IonRow } from "@ionic/vue";
import { translate } from "@common";
import NetSuiteOrdersKeyDatesCard from "@/components/netsuite-orders-flow/NetSuiteOrdersKeyDatesCard.vue";
import NetSuiteOrdersRulesCard from "@/components/netsuite-orders-flow/NetSuiteOrdersRulesCard.vue";
import NetSuiteOrdersSetupCard from "@/components/netsuite-orders-flow/NetSuiteOrdersSetupCard.vue";
import NetSuiteOrdersSwitchCard from "@/components/netsuite-orders-flow/NetSuiteOrdersSwitchCard.vue";
import NetSuiteSendingCard from "@/components/netsuite-orders-flow/NetSuiteSendingCard.vue";
import NetSuiteStepRow from "@/components/netsuite-orders-flow/NetSuiteStepRow.vue";
import ServiceJobDetailsModal from "@/components/common/ServiceJobDetailsModal.vue";
import { NETSUITE_ORDER_STEP_ORDER, NETSUITE_ORDER_STEPS } from "@/config/netSuiteOrderSteps";
import { NETSUITE_SENDING_COUNTS_DOMAIN, NETSUITE_STEP_COUNTS_DOMAIN } from "@/config/appSyncConfig";
import { resyncDomain } from "@/db/appDbSync";
import { useNetSuiteOrdersSwitch } from "@/composables/useNetSuiteOrdersSwitch";

const props = defineProps<{ productStoreId: string }>();

const { flowState } = useNetSuiteOrdersSwitch(() => props.productStoreId);
const openJobName = ref("");

const openJob = (jobName: string) => {
  openJobName.value = jobName;
};

const refreshJobs = () => Promise.all([resyncDomain(NETSUITE_STEP_COUNTS_DOMAIN), resyncDomain(NETSUITE_SENDING_COUNTS_DOMAIN)]);
</script>
