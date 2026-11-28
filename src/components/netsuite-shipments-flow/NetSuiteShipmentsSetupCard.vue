<template>
  <ion-card data-testid="netsuite-shipments-setup-card">
    <ion-card-header>
      <ion-card-title>{{ translate("Setup") }}</ion-card-title>
      <ion-card-subtitle>{{ translate("Check these before you switch the steps on.") }}</ion-card-subtitle>
    </ion-card-header>
    <ion-card-content v-if="isLoading">
      <ion-skeleton-text animated />
    </ion-card-content>
    <ion-list v-else lines="full">
      <ion-item v-for="item in setupItems" :key="item.id" :data-testid="`netsuite-shipments-setup-${item.id}`">
        <ion-label class="ion-text-wrap">
          {{ translate(item.label) }}
          <p v-if="item.detail">{{ item.detail }}</p>
        </ion-label>
        <ion-badge slot="end" :color="STATE_BADGES[item.state].color">{{ translate(STATE_BADGES[item.state].label) }}</ion-badge>
      </ion-item>
    </ion-list>
  </ion-card>
</template>

<script setup lang="ts">
import { IonBadge, IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonItem, IonLabel, IonList, IonSkeletonText } from "@ionic/vue";
import { translate } from "@common";
import { useNetSuiteShipmentsSetupItems } from "@/composables/useNetSuiteShipmentsFlow";

const props = defineProps<{ productStoreId: string }>();

const STATE_BADGES: Record<string, { label: string; color: string }> = {
  done: { label: "Done", color: "success" },
  missing: { label: "Missing", color: "warning" },
  unknown: { label: "Not checked", color: "medium" },
};

const { isLoading, setupItems } = useNetSuiteShipmentsSetupItems(() => props.productStoreId);
</script>
