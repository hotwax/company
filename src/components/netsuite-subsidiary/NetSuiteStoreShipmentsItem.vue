<template>
  <ion-item detail class="item-box" lines="none" button :data-testid="`netsuite-store-shipments-${productStoreId}`" @click="router.push(`/netsuite/stores/${productStoreId}/shipments`)">
    <ion-label class="ion-text-wrap">
      {{ translate("Shipments from NetSuite") }}
      <ion-skeleton-text v-if="isLoading" :animated="true" />
      <p v-else><ion-text :color="needsAttention ? 'warning' : undefined">{{ summary }}</ion-text></p>
    </ion-label>
    <ion-badge v-if="!isLoading" slot="end" :color="STATE_COLORS[flowState]">{{ translate(STATE_LABELS[flowState]) }}</ion-badge>
  </ion-item>
</template>

<script setup lang="ts">
import { IonBadge, IonItem, IonLabel, IonSkeletonText, IonText } from "@ionic/vue";
import { translate } from "@common";
import router from "@/router";
import { useNetSuiteShipmentsSummary } from "@/composables/useNetSuiteShipmentsFlow";

const props = defineProps<{ productStoreId: string }>();

const STATE_LABELS: Record<string, string> = { on: "On", off: "Off", "partly-on": "Partly on", "no-jobs": "No jobs" };
const STATE_COLORS: Record<string, string> = { on: "success", off: "medium", "partly-on": "warning", "no-jobs": "medium" };

const { isLoading, flowState, summary, needsAttention } = useNetSuiteShipmentsSummary(() => props.productStoreId);
</script>

<style scoped>
.item-box::part(native) {
  --border-radius: var(--spacer-xs);
  border: var(--border-medium);
}
</style>
