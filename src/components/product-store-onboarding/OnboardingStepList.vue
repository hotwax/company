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
        <ion-spinner
          v-if="!completedStepIds.includes(step.id) && inProgressStepIds.includes(step.id)"
          slot="end"
          name="crescent"
          color="primary"
        />
        <ion-icon
          v-else
          slot="end"
          :color="completedStepIds.includes(step.id) ? 'success' : 'medium'"
          :icon="completedStepIds.includes(step.id) ? checkmarkCircleOutline : radioButtonOffOutline"
        />
      </ion-item>
    </template>
  </ion-list>
</template>

<script setup lang="ts">
import { IonBadge, IonIcon, IonItem, IonLabel, IonList, IonListHeader, IonSpinner } from "@ionic/vue"
import { checkmarkCircleOutline, radioButtonOffOutline } from "ionicons/icons"
import { computed } from "vue"
import { translate } from "@common"
import type { ProductStoreOnboardingGroup, ProductStoreOnboardingStep } from "@/config/productStoreOnboarding"

const props = defineProps<{
  groups: ProductStoreOnboardingGroup[]
  steps: ProductStoreOnboardingStep[]
  currentStepId: string
  completedStepIds: string[]
  inProgressStepIds?: string[]
}>()

defineEmits<{
  (event: "select-step", stepId: string): void
}>()

const inProgressStepIds = computed<string[]>(() => props.inProgressStepIds ?? [])

function stepsByGroup(groupId: string) {
  return props.steps.filter((step) => step.group === groupId)
}
</script>
