<template>
  <ion-list v-if="readError" lines="full">
    <ion-item color="warning">
      <ion-icon slot="start" :icon="warningOutline" />
      <ion-label class="ion-text-wrap">
        {{ translate("Staging results may be out of date. Refresh to check the latest run.") }}
        <p>{{ readError }}</p>
      </ion-label>
      <ion-button slot="end" fill="clear" @click="emit('refresh')">
        {{ translate("Refresh") }}
      </ion-button>
    </ion-item>
  </ion-list>
  <ion-card v-for="stage in stages" :key="stage.card.definition.key">
    <ion-list lines="full">
      <ion-list-header>
        <ion-label class="ion-text-wrap">
          <h2>{{ translate(stage.card.definition.key === 'create' ? "Creation" : "Updates") }}</h2>
          <p v-if="stage.run">
            {{ translate("Latest completed run: {time}", { time: formatDateTime(stage.run.endTime) }) }}
          </p>
          <p v-if="stage.run && !checked && !readError">
            {{ translate("Loading staging results") }}
          </p>
        </ion-label>
        <ion-button v-if="stage.card.job" fill="clear" @click="emit('openJob', stage.card)">
          {{ translate("View job") }}
        </ion-button>
      </ion-list-header>
      <ShopifyTransferDeliveryStatus :shop-id="shopId" :stage="stage.card.definition.key as TransferStager" direction="pending" :checked="Boolean(deliveryChecked)" :error="deliveryError" />
      <ion-item v-if="!stage.card.job">
        <ion-label class="ion-text-wrap">
          {{ translate("Configure this stager to check for transfer sync errors.") }}
        </ion-label>
      </ion-item>
      <ion-item v-else-if="!stage.run">
        <ion-label class="ion-text-wrap">
          {{ translate(!checked || !hydrated ? "Loading staging results" : stage.running ? "Staging run is in progress." : "No completed staging run is available yet.") }}
        </ion-label>
        <ion-spinner v-if="!checked || !hydrated" slot="end" name="crescent" />
      </ion-item>
      <ion-item v-if="stage.running && stage.run">
        <ion-label class="ion-text-wrap">
          {{ translate("A newer run is in progress. Showing the previous completed run.") }}
        </ion-label>
      </ion-item>
      <ion-item v-if="stage.run && !stage.issues.length">
        <ion-icon slot="start" :icon="checkmarkCircleOutline" color="success" />
        <ion-label class="ion-text-wrap">
          {{ translate("No staging blockers reported in this run.") }}
        </ion-label>
      </ion-item>
      <ion-item
        v-for="group in groupTransferStagingIssues(stage.issues)"
        :key="group.key"
        :button="Boolean(group.orderId)"
        :detail="Boolean(group.orderId)"
        lines="full"
        @click="group.orderId && emit('openTransfer', group.orderId)"
      >
        <ion-icon slot="start" :icon="group.issues.every(issue => issue.waiting) ? timeOutline : warningOutline" color="warning" />
        <ion-label class="ion-text-wrap">
          <h2>{{ group.orderId ? transferName(group.orderId) : translate(group.issues[0].title) }}</h2>
          <p>{{ [...new Set(group.issues.map(issue => translate(issue.title)))].join(', ') }}</p>
          <p v-if="group.orderId">
            {{ translate("View sync issues and next steps") }}
          </p>
          <p v-else>
            {{ translate(group.issues[0].action) }}
          </p>
        </ion-label>
        <ion-badge v-if="group.orderId" slot="end" color="warning">
          {{ group.issues.length }}
        </ion-badge>
      </ion-item>
    </ion-list>
  </ion-card>
</template>

<script setup lang="ts">
import { translate } from "@common";
import {
  IonBadge, IonButton, IonCard, IonIcon, IonItem, IonLabel, IonList, IonListHeader, IonSpinner,
} from "@ionic/vue";
import { checkmarkCircleOutline, timeOutline, warningOutline } from "ionicons/icons";
import { computed, watch } from "vue";
import { useServiceJobRunsByJob } from "@/composables/useServiceJobs";
import type { TransferSyncJobCard } from "@/composables/useShopifyTransferSync";
import { useShopifyTransferSyncEnrichment } from "@/composables/useShopifyTransferSyncEnrichment";
import { formatDateTime } from "@/utils";
import { type TransferStager, groupTransferStagingIssues, latestCompletedStagingRun, transferStagingIssues } from "@/utils/shopifyTransferStagingErrors";
import ShopifyTransferDeliveryStatus from "./ShopifyTransferDeliveryStatus.vue";

const props = defineProps<{ shopId: string; cards: TransferSyncJobCard[]; checked: boolean; readError?: string; deliveryChecked?: boolean; deliveryError?: string }>();
const emit = defineEmits<{ openJob: [card: TransferSyncJobCard]; openTransfer: [orderId: string]; refresh: [] }>();
const { runsFor, hydrated } = useServiceJobRunsByJob(() => props.cards.filter((card) => card.job).map((card) => card.jobName), 5);
const { enrichment, load } = useShopifyTransferSyncEnrichment();

const stages = computed(() => props.cards.map((card) => {
  const runs = card.job ? runsFor(card.jobName) : [];
  const run = latestCompletedStagingRun(runs);

  return {
    card, run,
    running: runs.some((entry) => !entry.endTime && (!run || Number(entry.startTime) > Number(run.startTime))),
    issues: transferStagingIssues(run, props.shopId, card.definition.key as TransferStager),
  };
}));

const issues = computed(() => stages.value.flatMap((stage) => stage.issues));
watch(issues, (rows) => {
  // No segment is supplied: only distinct transfer detail reads are needed, never receipt/history reads.
  void load(rows.filter((row) => row.orderId).map((row) => ({ orderId: row.orderId })));
}, { immediate: true });
function transferName(orderId?: string): string {
  if(!orderId) {return "";}

  return enrichment.value.ordersById[orderId]?.orderName || translate("Transfer {id}", { id: orderId });
}

</script>
