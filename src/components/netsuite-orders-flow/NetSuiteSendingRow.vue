<template>
  <ion-row class="ion-align-items-center netsuite-row" :data-testid="`netsuite-sending-${way}-row`">
    <ion-col size="12" size-md="6">
      <ion-item v-if="isLoading" lines="none">
        <ion-label><ion-skeleton-text animated /></ion-label>
      </ion-item>
      <template v-for="job in jobs" v-else :key="job.kind">
        <NetSuiteJobSummary v-if="job.jobName" :kind-label="job.kindLabel" :job-name="job.jobName" :is-on="job.isOn" :last-run-time="job.lastRunTime" @open-job="emit('openJob', $event)" />
        <ion-item v-else lines="none">
          <ion-label>{{ translate(job.kindLabel) }}<p>{{ translate("No job") }}</p></ion-label>
        </ion-item>
      </template>
    </ion-col>
    <ion-col v-for="column in countColumns" :key="column.list" size="6" size-md="2">
      <ion-label class="ion-hide-md-up ion-padding-start">{{ translate(column.label) }}</ion-label>
      <ion-item lines="none">
        <ion-skeleton-text v-if="isLoading" animated />
        <ion-label v-else-if="column.count == null">-</ion-label>
        <ion-button
          v-else-if="column.count > 0"
          size="small"
          :color="column.color"
          :router-link="`/netsuite/sending/${way}/${column.list}`"
          :data-testid="`netsuite-sending-${way}-${column.list}-link`"
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
import { IonButton, IonCol, IonItem, IonLabel, IonRow, IonSkeletonText } from "@ionic/vue";
import { translate } from "@common";
import { useNetSuiteSendingCounts } from "@/composables/useNetSuiteSending";
import { NETSUITE_SENDING_LISTS } from "@/config/netSuiteSending";
import NetSuiteJobSummary from "@/components/netsuite-orders-flow/NetSuiteJobSummary.vue";

const props = defineProps<{ way: string; sendJobLabel: string; pollJobLabel: string }>();
const emit = defineEmits<{ openJob: [jobName: string] }>();

const { counts, isLoading } = useNetSuiteSendingCounts(() => props.way);

const jobs = computed(() => [
  { kind: "send", kindLabel: props.sendJobLabel, jobName: counts.value?.sendJobName, isOn: counts.value?.sendIsOn === "Y", lastRunTime: counts.value?.sendLastRunTime },
  { kind: "poll", kindLabel: props.pollJobLabel, jobName: counts.value?.pollJobName, isOn: counts.value?.pollIsOn === "Y", lastRunTime: counts.value?.pollLastRunTime },
]);

const countColumns = computed(() => NETSUITE_SENDING_LISTS.map((sendingList) => ({
  list: sendingList.list,
  label: sendingList.label,
  color: sendingList.color,
  count: counts.value?.[sendingList.countField] as number | undefined,
})));
</script>

<style scoped>
.netsuite-row {
  border-bottom: 1px solid var(--ion-item-border-color, var(--ion-color-step-150, var(--ion-color-light-shade)));
}
</style>
