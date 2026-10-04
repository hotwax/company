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
        :disabled="disabledStepIds?.includes(step.id)"
        :color="step.id === currentStepId ? 'light' : undefined"
        :aria-current="step.id === currentStepId ? 'step' : undefined"
        :aria-label="stepAriaLabel(step)"
        @click="$emit('select-step', step.id)"
      >
        <ion-note slot="start" aria-hidden="true">
          {{ stepOrdinal(step) }}
        </ion-note>
        <ion-label>
          {{ translate(step.label) }}
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

<script setup lang="ts" generic="StepId extends string, GroupId extends string">
import { translate } from "@common"
import { IonIcon, IonItem, IonLabel, IonList, IonListHeader, IonNote } from "@ionic/vue"
import {
  alertCircleOutline,
  checkmarkCircleOutline,
  ellipseOutline,
  timeOutline
} from "ionicons/icons"
import type { ProductStoreOnboardingStepStatus } from "@/config/productStoreOnboarding"

type Step = { id: StepId; group: GroupId; label: string }
const props = defineProps<{
  groups: { id: GroupId; label: string }[]
  steps: Step[]
  currentStepId: StepId
  stepStatuses: Record<StepId, ProductStoreOnboardingStepStatus>
  disabledStepIds?: StepId[]
}>()

defineEmits<{
  (event: "select-step", stepId: StepId): void
}>()

function stepsByGroup(groupId: GroupId) {
  return props.steps.filter((step) => step.group === groupId)
}

function stepOrdinal(step: Step) {
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

function stepAriaLabel(step: Step) {
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
