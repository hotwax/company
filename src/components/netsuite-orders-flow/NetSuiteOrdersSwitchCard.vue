<template>
  <NetSuiteFlowSwitchCard
    flow-label="Orders flow"
    test-id-prefix="netsuite-orders"
    :is-loading="isLoading"
    :flow-state="flowState"
    :jobs-to-switch-on="jobsToSwitchOn"
    :jobs-to-pause="jobsToPause"
    :is-changing="isChanging"
    :last-change="lastChange"
    :missing-items="missingItems"
    missing-items-title="Setup not done. Orders that need it will wait:"
    switch-on-note="Send, poll and the shared steps serve every store."
    :pause-notes="['Send, poll and the shared steps keep running for every store.']"
    switched-on-message="Orders flow switched on."
    paused-message="Orders flow paused."
    :switch-on="switchOn"
    :pause="pause"
    :load-last-change="loadLastChange"
  />
</template>

<script setup lang="ts">
import { useNetSuiteOrdersSwitch } from "@/composables/useNetSuiteOrdersSwitch";
import { useNetSuiteOrdersSetupItems } from "@/composables/useNetSuiteOrdersFlow";
import NetSuiteFlowSwitchCard from "@/components/netsuite-flows/NetSuiteFlowSwitchCard.vue";

const props = defineProps<{ productStoreId: string }>();

const { isLoading, flowState, jobsToSwitchOn, jobsToPause, isChanging, lastChange, loadLastChange, switchOn, pause } =
  useNetSuiteOrdersSwitch(() => props.productStoreId);
const { missingItems } = useNetSuiteOrdersSetupItems(() => props.productStoreId);
</script>
