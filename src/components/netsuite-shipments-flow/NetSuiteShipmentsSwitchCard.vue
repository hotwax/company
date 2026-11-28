<template>
  <NetSuiteFlowSwitchCard
    flow-label="Shipments from NetSuite"
    test-id-prefix="netsuite-shipments"
    :is-loading="isLoading"
    :flow-state="flowState"
    :jobs-to-switch-on="jobsToSwitchOn"
    :jobs-to-pause="jobsToPause"
    :is-changing="isChanging"
    :last-change="lastChange"
    :missing-items="missingItems"
    missing-items-title="Setup not done:"
    switch-on-note="Harvest, Boxes and Shipments serve every store."
    :pause-notes="['Harvest, Boxes and Shipments keep running for every store.', 'This store\'s shipments still arrive from NetSuite.']"
    switched-on-message="Shipments from NetSuite switched on."
    paused-message="Shipments from NetSuite paused."
    :switch-on="switchOn"
    :pause="pause"
    :load-last-change="loadLastChange"
  />
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useNetSuiteShipmentsSetupItems, useNetSuiteShipmentsSwitch } from "@/composables/useNetSuiteShipmentsFlow";
import NetSuiteFlowSwitchCard from "@/components/netsuite-flows/NetSuiteFlowSwitchCard.vue";

const props = defineProps<{ productStoreId: string }>();

const { isLoading, flowState, jobsToSwitchOn, jobsToPause, isChanging, lastChange, loadLastChange, switchOn, pause } =
  useNetSuiteShipmentsSwitch(() => props.productStoreId);
const { setupItems } = useNetSuiteShipmentsSetupItems(() => props.productStoreId);
const missingItems = computed(() => setupItems.value.filter((item) => item.state === "missing" || item.state === "unknown"));
</script>
