<template>
  <ion-list lines="full">
    <template v-for="group in groups" :key="group.id">
      <ion-list-header>
        <ion-label>{{ translate(group.label) }}</ion-label>
      </ion-list-header>
      <ion-item
        v-for="step in stepsByGroup(group.id)"
        :key="`${step.id}-${stepStatuses[step.id]}`"
        button
        :detail="false"
        :color="step.id === currentStepId ? 'light' : undefined"
        :aria-current="step.id === currentStepId ? 'step' : undefined"
        :aria-label="stepAriaLabel(step)"
        @click="$emit('select-step', step.id)"
      >
        <ion-note slot="start" aria-hidden="true">
          {{ stepOrdinal(step) }}
        </ion-note>
        <ion-label>
          <h3>{{ translate(step.label) }}</h3>
          <p>{{ translate(statusLabel(stepStatuses[step.id])) }}</p>
        </ion-label>
        <ion-icon
          slot="end"
          aria-hidden="true"
          :color="statusPresentation(stepStatuses[step.id]).color"
          :icon="statusPresentation(stepStatuses[step.id]).icon"
        />
      </ion-item>
    </template>
  </ion-list>
</template>

<script setup lang="ts">
import { translate } from "@common"
import { IonIcon, IonItem, IonLabel, IonList, IonListHeader, IonNote } from "@ionic/vue"
import {
  alertCircleOutline,
  checkmarkCircleOutline,
  ellipseOutline,
  timeOutline
} from "ionicons/icons"
import type {
  ProductStoreOnboardingGroup,
  ProductStoreOnboardingStep,
  ProductStoreOnboardingStepId,
  ProductStoreOnboardingStepStatus
} from "@/config/productStoreOnboarding"

const props = defineProps<{
  groups: ProductStoreOnboardingGroup[]
  steps: ProductStoreOnboardingStep[]
  currentStepId: ProductStoreOnboardingStepId
  stepStatuses: Record<ProductStoreOnboardingStepId, ProductStoreOnboardingStepStatus>
}>()

defineEmits<{
  (event: "select-step", stepId: ProductStoreOnboardingStepId): void
}>()

function stepsByGroup(groupId: ProductStoreOnboardingGroup["id"]) {
  return props.steps.filter((step) => step.group === groupId)
}

function stepOrdinal(step: ProductStoreOnboardingStep) {
  return props.steps.findIndex((candidate) => candidate.id === step.id) + 1
}

function statusLabel(status: ProductStoreOnboardingStepStatus) {
  return {
    "not-started": "Not started",
    "in-progress": "In progress",
    complete: "Complete",
    attention: "Needs attention"
  }[status]
}

function stepAriaLabel(step: ProductStoreOnboardingStep) {
  return `${stepOrdinal(step)}. ${translate(step.label)}. ${translate(statusLabel(props.stepStatuses[step.id]))}`
}

function statusPresentation(status: ProductStoreOnboardingStepStatus) {
  return {
    "not-started": { color: "medium", icon: ellipseOutline },
    "in-progress": { color: "primary", icon: timeOutline },
    complete: { color: "success", icon: checkmarkCircleOutline },
    attention: { color: "warning", icon: alertCircleOutline }
  }[status]
}
</script>
