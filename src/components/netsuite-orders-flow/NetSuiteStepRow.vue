<template>
  <ion-row class="ion-align-items-center netsuite-row" :data-testid="`netsuite-orders-step-${step}-row`">
    <ion-col size="12" size-md="4">
      <NetSuiteJobSummary
        v-if="!isLoading && !isLocationCustomerStep && counts?.jobName"
        edit-label="Edit schedule and limits"
        :kind-label="label"
        :job-name="counts.jobName"
        :is-on="isOn"
        :last-run-time="counts.lastRunTime"
        @open-job="emit('openJob', $event)"
      >
        <p v-if="NETSUITE_ORDER_STEPS[step].isSharedByAllStores">{{ translate("Shared by all stores") }}</p>
        <p :data-testid="`netsuite-orders-step-${step}-open-batches`">{{ openBatchesLine }}</p>
        <p v-if="isAtLimit"><ion-text color="warning">{{ translate("Waits for NetSuite to answer a batch.") }}</ion-text></p>
      </NetSuiteJobSummary>
      <ion-item v-else lines="none" :disabled="isLocationCustomerStep">
        <ion-label class="ion-text-wrap">
          {{ translate(label) }}
          <p v-if="isLoading"><ion-skeleton-text animated :data-testid="`netsuite-orders-step-${step}-loading`" /></p>
          <p v-else-if="isLocationCustomerStep"><ion-badge color="medium">{{ translate("Not used") }}</ion-badge></p>
          <p v-else>{{ translate("No job") }}</p>
        </ion-label>
      </ion-item>
    </ion-col>
    <ion-col v-if="isLocationCustomerStep" size="12" size-md="8" :data-testid="`netsuite-orders-step-${step}-location-customer`">
      <ion-item lines="none" disabled>
        <ion-label class="ion-text-wrap">
          <p>{{ translate("Used only when each buyer gets a NetSuite customer.") }}</p>
        </ion-label>
      </ion-item>
    </ion-col>
    <ion-col v-for="column in countColumns" v-else :key="column.field" size="6" size-md="2">
      <ion-label class="ion-hide-md-up ion-padding-start">{{ translate(column.label) }}</ion-label>
      <ion-item lines="none">
        <ion-skeleton-text v-if="isLoading" animated />
        <ion-label v-else-if="column.count == null">-</ion-label>
        <ion-button
          v-else-if="column.count > 0"
          size="small"
          :color="column.color"
          :router-link="column.listPath"
          :data-testid="`netsuite-orders-step-${step}-${column.orderList}-link`"
        >
          {{ column.count }}
        </ion-button>
        <ion-label v-else>{{ column.count }}</ion-label>
      </ion-item>
    </ion-col>
  </ion-row>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IonBadge, IonButton, IonCol, IonItem, IonLabel, IonRow, IonSkeletonText, IonText } from "@ionic/vue";
import { translate } from "@common";
import { useNetSuiteCustomerPolicy, useNetSuiteStepCounts } from "@/composables/useNetSuiteOrdersFlow";
import { NETSUITE_ORDER_STEPS, NETSUITE_STEP_OPEN_BATCHES } from "@/config/netSuiteOrderSteps";
import { useCachedServiceJob } from "@/composables/useServiceJobs";
import NetSuiteJobSummary from "@/components/netsuite-orders-flow/NetSuiteJobSummary.vue";

const props = defineProps<{ productStoreId: string; step: string; label: string }>();
const emit = defineEmits<{ openJob: [jobName: string] }>();

const { counts, isLoading, isOn } = useNetSuiteStepCounts(() => props.productStoreId, () => props.step);

const { usesLocationCustomer } = useNetSuiteCustomerPolicy(() => props.productStoreId);
const isLocationCustomerStep = computed(() => props.step === "customer" && usesLocationCustomer.value);

const openBatchesConfig = computed(() => NETSUITE_STEP_OPEN_BATCHES[props.step]);
const { parameters: jobParameters } = useCachedServiceJob(() => counts.value?.jobName);
const openBatchCount = computed(() => (counts.value?.openBatches ?? [])
  .filter((openBatch: any) => !jobParameters.value.systemMessageRemoteId || openBatch.systemMessageRemoteId === jobParameters.value.systemMessageRemoteId)
  .filter((openBatch: any) => openBatchesConfig.value.isCountedAcrossStores || openBatch.productStoreId === props.productStoreId)
  .reduce((total: number, openBatch: any) => total + Number(openBatch.openCount ?? 0), 0));
const openBatchLimit = computed(() => (openBatchesConfig.value.isLimitFixed ? 1 : Number(jobParameters.value.maxBatchesInFlight ?? 1)));
const isAtLimit = computed(() => openBatchCount.value >= openBatchLimit.value);
const openBatchesLine = computed(() => {
  const config = openBatchesConfig.value;
  const limitNotes = [
    config.isLimitFixed ? translate("fixed") : "",
    config.sharedWithStep ? translate("shared with {step}", { step: translate(NETSUITE_ORDER_STEPS[config.sharedWithStep].label) }) : "",
    config.isCountedAcrossStores ? translate("all stores") : "",
  ].filter(Boolean);
  const openPart = [translate("Open batches: {open} of {limit}", { open: openBatchCount.value, limit: openBatchLimit.value }), ...limitNotes].join(", ");
  const batchSize = jobParameters.value.batchSize;
  return [openPart, batchSize ? translate("{count} per batch", { count: batchSize }) : ""].filter(Boolean).join(" · ");
});


const countColumns = computed(() => [
  { field: "failedCount", label: "Failed", color: "danger", orderList: "failed" },
  { field: "stuckCount", label: "Stuck", color: "warning", orderList: "stuck" },
  { field: "pendingOverOneDayCount", label: ">1 day", color: "warning", orderList: "pending" },
  { field: "notPickedCount", label: "Not picked", color: "warning", orderList: "not-picked" },
].map((column) => ({
  ...column,
  count: counts.value?.[column.field] as number | undefined,
  listPath: `/netsuite/stores/${props.productStoreId}/orders/${props.step}/${column.orderList}`,
})));
</script>

<style scoped>
.netsuite-row {
  border-bottom: 1px solid var(--ion-item-border-color, var(--ion-color-step-150, var(--ion-color-light-shade)));
}
</style>
