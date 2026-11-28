<template>
  <ion-item detail class="item-box" lines="none" button :data-testid="`netsuite-store-orders-${productStoreId}`" @click="router.push(`/netsuite/stores/${productStoreId}/orders`)">
    <ion-label class="ion-text-wrap">
      {{ translate("Orders") }}
      <ion-skeleton-text v-if="isSummaryLoading" :animated="true" />
      <p v-else><ion-text :color="needsAttention ? 'warning' : undefined">{{ summary }}</ion-text></p>
      <p v-if="setupWarning" :data-testid="`netsuite-store-orders-setup-warning-${productStoreId}`"><ion-text color="warning">{{ translate(setupWarning) }}</ion-text></p>
    </ion-label>
    <ion-badge v-if="!isSwitchLoading" slot="end" :color="STATE_COLORS[flowState]">{{ translate(STATE_LABELS[flowState]) }}</ion-badge>
  </ion-item>
</template>

<script setup lang="ts">
import { IonBadge, IonItem, IonLabel, IonSkeletonText, IonText } from "@ionic/vue";
import { translate } from "@common";
import router from "@/router";
import { useNetSuiteOrdersSwitch } from "@/composables/useNetSuiteOrdersSwitch";
import { useNetSuiteOrdersSummary } from "@/composables/useNetSuiteOrdersFlow";

const props = defineProps<{ productStoreId: string; setupWarning?: string }>();

const STATE_LABELS: Record<string, string> = { on: "On", off: "Off", "partly-on": "Partly on", "no-jobs": "No jobs" };
const STATE_COLORS: Record<string, string> = { on: "success", off: "medium", "partly-on": "warning", "no-jobs": "medium" };

const { isLoading: isSwitchLoading, flowState } = useNetSuiteOrdersSwitch(() => props.productStoreId);
const { isLoading: isSummaryLoading, summary, needsAttention } = useNetSuiteOrdersSummary(() => props.productStoreId);
</script>

<style scoped>
.item-box::part(native) {
  --border-radius: var(--spacer-xs);
  border: var(--border-medium);
}

</style>
