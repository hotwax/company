<template>
  <ion-list lines="full">
    <template v-for="group in groups" :key="group.id">
      <ion-list-header>
        <ion-label>{{ translate(group.label) }}</ion-label>
        <ion-badge v-if="group.id === COMING_LATER_GROUP" slot="end" color="medium">
          {{ translate("Coming later") }}
        </ion-badge>
      </ion-list-header>
      <ion-item
        v-for="step in stepsByGroup(group.id)"
        :key="step.id"
        :button="group.id !== COMING_LATER_GROUP"
        :detail="false"
        :disabled="group.id === COMING_LATER_GROUP"
        :color="step.id === currentStepId ? 'light' : undefined"
        @click="group.id === COMING_LATER_GROUP ? null : $emit('select-step', step.id)"
      >
        <ion-label>{{ translate(step.label) }}</ion-label>
        <template v-if="group.id !== COMING_LATER_GROUP">
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
        </template>
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

// Workflow steps are deferred — shown in the rail but non-navigable and flagged "Coming later".
const COMING_LATER_GROUP = "workflows"

const inProgressStepIds = computed<string[]>(() => props.inProgressStepIds ?? [])

function stepsByGroup(groupId: string) {
  return props.steps.filter((step) => step.group === groupId)
}
</script>
