<template>
  <ion-list lines="full">
    <template v-for="group in groups" :key="group.id">
      <ion-list-header>
        <ion-label>{{ translate(group.label) }}</ion-label>
      </ion-list-header>
      <ion-item
        v-for="step in stepsByGroup(group.id)"
        :key="step.id"
        button
        :detail="false"
        :color="step.id === currentStepId ? 'light' : undefined"
        @click="$emit('select-step', step.id)"
      >
        <ion-label>{{ translate(step.label) }}</ion-label>
        <ion-badge v-if="step.capability === 'backend-gap'" slot="end" color="warning">
          {{ translate("Gap") }}
        </ion-badge>
        <ion-icon
          slot="end"
          :color="completedStepIds.includes(step.id) ? 'success' : 'medium'"
          :icon="completedStepIds.includes(step.id) ? checkmarkCircleOutline : radioButtonOffOutline"
        />
      </ion-item>
    </template>
  </ion-list>
</template>

<script setup lang="ts">
import { IonBadge, IonIcon, IonItem, IonLabel, IonList, IonListHeader } from "@ionic/vue"
import { checkmarkCircleOutline, radioButtonOffOutline } from "ionicons/icons"
import { translate } from "@common"
import type { ProductStoreOnboardingGroup, ProductStoreOnboardingStep } from "@/config/productStoreOnboarding"

const props = defineProps<{
  groups: ProductStoreOnboardingGroup[]
  steps: ProductStoreOnboardingStep[]
  currentStepId: string
  completedStepIds: string[]
}>()

defineEmits<{
  (event: "select-step", stepId: string): void
}>()

function stepsByGroup(groupId: string) {
  return props.steps.filter((step) => step.group === groupId)
}
</script>
