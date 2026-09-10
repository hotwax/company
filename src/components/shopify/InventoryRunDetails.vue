<template>
  <!-- One row per figure, because that is how these get read: an operator scans for the one number
       that moved, and a comma-joined sentence makes them parse the whole line to find it. -->
  <ion-item-divider>
    <ion-label>{{ translate("Parameters") }}</ion-label>
  </ion-item-divider>
  <ion-item v-for="row in scope" :key="row.key">
    <ion-label class="ion-text-wrap">{{ row.label }}</ion-label>
    <ion-note slot="end">{{ row.value }}</ion-note>
  </ion-item>
  <!-- Runs whose parameters are not structured JSON: the configured-parameter fallback is a
       "name: value" string, and an unparameterised run says so in prose. -->
  <ion-item v-if="!scope.length">
    <ion-label class="ion-text-wrap">
      <p>{{ parametersFallback }}</p>
    </ion-label>
  </ion-item>

  <ion-accordion-group v-if="tuning.length">
    <ion-accordion value="tuning">
      <ion-item slot="header">
        <ion-label>{{ translate("Tuning") }}</ion-label>
      </ion-item>
      <div slot="content">
        <ion-item v-for="row in tuning" :key="row.key">
          <ion-label class="ion-text-wrap">{{ row.label }}</ion-label>
          <ion-note slot="end">{{ row.value }}</ion-note>
        </ion-item>
      </div>
    </ion-accordion>
  </ion-accordion-group>

  <ion-item-divider>
    <ion-label>{{ translate("Result") }}</ion-label>
  </ion-item-divider>
  <ion-item v-for="row in result" :key="row.key">
    <ion-label class="ion-text-wrap">{{ row.label }}</ion-label>
    <ion-note slot="end">{{ row.value }}</ion-note>
  </ion-item>
  <!-- A run that failed or is still going answers in prose, not figures. -->
  <ion-item v-if="!result.length" lines="none">
    <ion-label class="ion-text-wrap">
      <p>{{ resultFallback }}</p>
    </ion-label>
  </ion-item>
</template>

<script setup lang="ts">
import { translate } from "@common";
import { IonAccordion, IonAccordionGroup, IonItem, IonItemDivider, IonLabel, IonNote } from "@ionic/vue";

import type { RunDetailRow } from "@/utils/serviceJobRun";

defineProps<{
  /** What the run covered. Empty when its parameters are not structured JSON. */
  scope: RunDetailRow[];
  /** How it was tuned. Collapsed, because it is never the reason someone opened the card. */
  tuning: RunDetailRow[];
  /** The figures it reported. Empty when it failed or is still running. */
  result: RunDetailRow[];
  parametersFallback: string;
  resultFallback: string;
}>();
</script>
