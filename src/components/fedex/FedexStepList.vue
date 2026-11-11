<template>
  <ion-list lines="full" data-testid="fedex-steps">
    <template v-for="group in FEDEX_SETUP_GROUPS" :key="group.id">
      <ion-list-header>
        <ion-label>{{ translate(group.label) }}</ion-label>
      </ion-list-header>
      <ion-item
        v-for="step in stepsByGroup(group.id)"
        :key="step.id"
        button
        :detail="false"
        :color="step.id === currentStepId ? 'light' : undefined"
        :aria-current="step.id === currentStepId ? 'step' : undefined"
        :data-testid="`fedex-step-${step.id}`"
        @click="$emit('select-step', step.id)"
      >
        <ion-note slot="start" aria-hidden="true">{{ ordinal(step.id) }}</ion-note>
        <ion-label>
          {{ translate(step.label) }}
          <p>{{ translate(STATUS[stepStatuses[step.id]].label) }}</p>
        </ion-label>
        <ion-icon slot="end" aria-hidden="true" :color="STATUS[stepStatuses[step.id]].color" :icon="STATUS[stepStatuses[step.id]].icon" />
      </ion-item>
    </template>
  </ion-list>
</template>

<script setup lang="ts">
import { translate } from "@common";
import { IonIcon, IonItem, IonLabel, IonList, IonListHeader, IonNote } from "@ionic/vue";
import { alertCircleOutline, checkmarkCircleOutline, ellipseOutline, timeOutline } from "ionicons/icons";
import {
  FEDEX_SETUP_GROUPS,
  FEDEX_SETUP_STEPS,
  type FedexSetupStepId,
  type FedexSetupStepStatus,
} from "@/config/fedexSetup";

defineProps<{
  currentStepId: FedexSetupStepId
  stepStatuses: Record<FedexSetupStepId, FedexSetupStepStatus>
}>();

defineEmits<{
  (event: "select-step", stepId: FedexSetupStepId): void
}>();

// The label and colour for each status.
const STATUS = {
  "not-started": { label: "Not started", color: "medium", icon: ellipseOutline },
  "in-progress": { label: "In progress", color: "primary", icon: timeOutline },
  complete: { label: "Complete", color: "success", icon: checkmarkCircleOutline },
  attention: { label: "Needs attention", color: "warning", icon: alertCircleOutline },
};

const stepsByGroup = (groupId: string) => FEDEX_SETUP_STEPS.filter((step) => step.group === groupId);
const ordinal = (stepId: FedexSetupStepId) => FEDEX_SETUP_STEPS.findIndex((step) => step.id === stepId) + 1;
</script>
