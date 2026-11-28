<template>
  <ion-row class="ion-align-items-center netsuite-row" :data-testid="`netsuite-shipments-step-${step}-row`">
    <ion-col size="12" size-md="6">
      <NetSuiteJobSummary
        v-if="!isLoading && counts?.jobName"
        :kind-label="NETSUITE_SHIPMENT_STEPS[step].label"
        :job-name="counts.jobName"
        :is-on="isOn"
        :last-run-time="counts.lastRunTime"
        @open-job="emit('openJob', $event)"
      >
        <p>{{ translate(NETSUITE_SHIPMENT_STEPS[step].meaning) }}</p>
        <p v-if="NETSUITE_SHIPMENT_STEPS[step].isSharedByAllStores">{{ translate("Shared by all stores") }}</p>
        <p v-if="counts.readUpTo" :data-testid="`netsuite-shipments-step-${step}-read-up-to`">{{ translate("Read up to {time}, NetSuite time", { time: counts.readUpTo }) }}</p>
      </NetSuiteJobSummary>
      <ion-item v-else lines="none">
        <ion-label class="ion-text-wrap">
          {{ translate(NETSUITE_SHIPMENT_STEPS[step].label) }}
          <p>{{ translate(NETSUITE_SHIPMENT_STEPS[step].meaning) }}</p>
          <p v-if="isLoading"><ion-skeleton-text animated :data-testid="`netsuite-shipments-step-${step}-loading`" /></p>
          <p v-else>{{ translate("No job") }}</p>
        </ion-label>
      </ion-item>
    </ion-col>
    <ion-col v-for="column in countColumns" :key="column.field" size="4" size-md="2">
      <ion-label class="ion-hide-md-up ion-padding-start">{{ translate(column.label) }}</ion-label>
      <ion-item lines="none">
        <ion-skeleton-text v-if="isLoading" animated />
        <ion-button
          v-else-if="column.count"
          size="small"
          :color="column.color"
          :router-link="`/netsuite/stores/${productStoreId}/shipments/${step}/${column.list}`"
          :data-testid="`netsuite-shipments-step-${step}-${column.field}`"
        >
          {{ column.count }}
        </ion-button>
        <ion-label v-else :data-testid="`netsuite-shipments-step-${step}-${column.field}`">{{ column.count ?? "-" }}</ion-label>
      </ion-item>
    </ion-col>
  </ion-row>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IonButton, IonCol, IonItem, IonLabel, IonRow, IonSkeletonText } from "@ionic/vue";
import { translate } from "@common";
import { useNetSuiteShipmentStepCounts } from "@/composables/useNetSuiteShipmentsFlow";
import { NETSUITE_SHIPMENT_STEPS } from "@/config/netSuiteShipmentSteps";
import NetSuiteJobSummary from "@/components/netsuite-orders-flow/NetSuiteJobSummary.vue";

const props = defineProps<{ productStoreId: string; step: string }>();
const emit = defineEmits<{ openJob: [jobName: string] }>();

const { counts, isLoading, isOn } = useNetSuiteShipmentStepCounts(() => props.productStoreId, () => props.step);

const countColumns = computed(() => [
  { field: "failedCount", label: "Failed", list: "failed", color: "danger" },
  { field: "stuckCount", label: "Stuck", list: "stuck", color: "warning" },
  { field: "waitingCount", label: "Waiting", list: "waiting", color: "warning" },
].map((column) => ({ ...column, count: counts.value?.[column.field] as number | undefined })));
</script>

<style scoped>
.netsuite-row {
  border-bottom: 1px solid var(--ion-item-border-color, var(--ion-color-step-150, var(--ion-color-light-shade)));
}
</style>
