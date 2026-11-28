<template>
  <ion-modal :is-open="Boolean(failure)" @didDismiss="emit('close')">
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button :aria-label="translate('Close')" @click="emit('close')">
            <ion-icon slot="icon-only" :icon="closeOutline" />
          </ion-button>
        </ion-buttons>
        <ion-title>{{ failure?.recordName || failure?.recordId }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <ion-list lines="full">
        <ion-item>
          <ion-label>{{ translate(orderStep.recordKindLabel) }}</ion-label>
          <ion-note slot="end">{{ failure?.recordId }}</ion-note>
        </ion-item>
        <ion-item v-if="failure?.recordDetail">
          <ion-label>{{ failure.recordDetail }}</ion-label>
        </ion-item>
        <ion-item v-if="failure?.recordDate">
          <ion-label>{{ translate(orderStep.recordDateLabel) }}</ion-label>
          <ion-note slot="end">{{ commonUtil.getDateAndTime(failure?.recordDate) }}</ion-note>
        </ion-item>
        <ion-item v-if="failure?.claimedDate">
          <ion-label>{{ translate("Sent") }}</ion-label>
          <ion-note slot="end">{{ commonUtil.getDateAndTime(failure?.claimedDate) }}</ion-note>
        </ion-item>
        <ion-item v-if="failure?.attemptCount != null">
          <ion-label class="ion-text-wrap">{{ describeStepTries(failure) }}</ion-label>
        </ion-item>
        <ion-item lines="none">
          <ion-label class="ion-text-wrap">
            {{ translate("Error") }}
            <p class="full-error">{{ failure?.errorMessage || translate(orderStep.failureReason ?? "") }}</p>
          </ion-label>
        </ion-item>
        <ion-item v-if="orderStep.isResentByJob" lines="none">
          <ion-label class="ion-text-wrap">{{ translate("The job sends it again on every run.") }}</ion-label>
        </ion-item>
      </ion-list>
      <ion-button v-if="!orderStep.isResentByJob" class="ion-margin" expand="block" :data-testid="`netsuite-${step}-send-again`" @click="emit('sendAgain', failure)">
        {{ translate("Send again") }}
      </ion-button>
    </ion-content>
  </ion-modal>
</template>

<script setup lang="ts">
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonModal, IonNote, IonTitle, IonToolbar } from "@ionic/vue";
import { computed } from "vue";
import { closeOutline } from "ionicons/icons";
import { commonUtil, translate } from "@common";
import { NETSUITE_ORDER_STEPS } from "@/config/netSuiteOrderSteps";
import { describeStepTries } from "@/utils/netSuiteStepTries";

const props = defineProps<{ failure?: any; step: string }>();
const orderStep = computed(() => NETSUITE_ORDER_STEPS[props.step]);
const emit = defineEmits<{ close: []; sendAgain: [failure: any] }>();
</script>

<style scoped>
.full-error {
  white-space: pre-wrap;
  user-select: text;
}
</style>
