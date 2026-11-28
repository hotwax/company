<template>
  <ion-card :data-testid="`${testIdPrefix}-switch-card`">
    <ion-item lines="none">
      <ion-label class="ion-text-wrap">
        <h2>{{ translate(flowLabel) }}</h2>
        <ion-skeleton-text v-if="isLoading" animated class="history-skeleton" />
        <p v-else-if="lastChange" :data-testid="`${testIdPrefix}-switch-history`">
          {{ translate(lastChange.isSwitchOn ? "Switched on by {username}, {date}" : "Paused by {username}, {date}", { username: lastChange.username, date: commonUtil.getDateAndTime(lastChange.changedDate) }) }}
        </p>
        <p v-else-if="flowState === 'no-jobs'">{{ translate("The store has no jobs for this flow yet.") }}</p>
      </ion-label>
      <ion-badge v-if="!isLoading" slot="end" :color="STATE_COLORS[flowState]" :data-testid="`${testIdPrefix}-switch-state`">
        {{ translate(STATE_LABELS[flowState]) }}
      </ion-badge>
      <template v-if="!isLoading && !confirming">
        <ion-button v-if="jobsToPause.length" slot="end" fill="outline" color="medium" :disabled="isChanging" :data-testid="`${testIdPrefix}-pause`" @click="confirming = 'pause'">
          {{ translate("Pause") }}
        </ion-button>
        <ion-button v-if="jobsToSwitchOn.length && flowState !== 'no-jobs'" slot="end" :disabled="isChanging" :data-testid="`${testIdPrefix}-switch-on`" @click="confirming = 'switch-on'">
          {{ translate("Switch on") }}
        </ion-button>
      </template>
    </ion-item>

    <ion-card-content v-if="confirming === 'switch-on'" :data-testid="`${testIdPrefix}-switch-on-confirm`">
      <p>{{ translate(jobsToSwitchOn.length === 1 ? "1 job starts, in the order the flow needs." : "{count} jobs start, in the order the flow needs.", { count: jobsToSwitchOn.length }) }}</p>
      <p>{{ translate(switchOnNote) }}</p>
      <template v-if="missingItems.length">
        <p class="warning-title">{{ translate(missingItemsTitle) }}</p>
        <ul>
          <li v-for="item in missingItems" :key="item.id">{{ translate(item.label) }}</li>
        </ul>
      </template>
      <ion-button fill="clear" color="medium" :disabled="isChanging" @click="confirming = undefined">{{ translate("Cancel") }}</ion-button>
      <ion-button :disabled="isChanging" :data-testid="`${testIdPrefix}-switch-on-confirm-button`" @click="change(switchOn, switchedOnMessage)">
        {{ translate("Switch on") }}
      </ion-button>
    </ion-card-content>

    <ion-card-content v-if="confirming === 'pause'" :data-testid="`${testIdPrefix}-pause-confirm`">
      <p>{{ translate(jobsToPause.length === 1 ? "1 job of this store stops." : "{count} jobs of this store stop.", { count: jobsToPause.length }) }}</p>
      <p v-for="pauseNote in pauseNotes" :key="pauseNote">{{ translate(pauseNote) }}</p>
      <ion-button fill="clear" color="medium" :disabled="isChanging" @click="confirming = undefined">{{ translate("Cancel") }}</ion-button>
      <ion-button color="warning" :disabled="isChanging" :data-testid="`${testIdPrefix}-pause-confirm-button`" @click="change(pause, pausedMessage)">
        {{ translate("Pause") }}
      </ion-button>
    </ion-card-content>
  </ion-card>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { IonBadge, IonButton, IonCard, IonCardContent, IonItem, IonLabel, IonSkeletonText } from "@ionic/vue";
import { commonUtil, logger, translate } from "@common";
import type { FlowJob } from "@/composables/useNetSuiteFlowSwitch";

const props = defineProps<{
  flowLabel: string;
  testIdPrefix: string;
  isLoading: boolean;
  flowState: string;
  jobsToSwitchOn: FlowJob[];
  jobsToPause: FlowJob[];
  isChanging: boolean;
  lastChange?: { isSwitchOn: boolean; changedDate: number; username: string };
  missingItems: { id: string; label: string }[];
  missingItemsTitle: string;
  switchOnNote: string;
  pauseNotes: string[];
  switchedOnMessage: string;
  pausedMessage: string;
  switchOn: () => Promise<void>;
  pause: () => Promise<void>;
  loadLastChange: () => Promise<void>;
}>();

const STATE_LABELS: Record<string, string> = { on: "On", off: "Off", "partly-on": "Partly on", "no-jobs": "No jobs" };
const STATE_COLORS: Record<string, string> = { on: "success", off: "medium", "partly-on": "warning", "no-jobs": "medium" };

const confirming = ref<"switch-on" | "pause" | undefined>();

const showLastChange = () => props.loadLastChange().catch((error) => logger.error(`Could not read who switched the ${props.flowLabel}`, error));

watch(() => props.isLoading, (loading) => { if (!loading) void showLastChange(); }, { immediate: true });

const change = async (action: () => Promise<void>, doneMessage: string) => {
  try {
    await action();
    commonUtil.showToast(translate(doneMessage));
  } catch (error) {
    logger.error(error);
    commonUtil.showToast(`${translate("Some jobs did not change.")} ${commonUtil.getErrorMessage(error)}`);
  }
  confirming.value = undefined;
  await showLastChange();
};
</script>

<style scoped>
.history-skeleton {
  width: 40%;
}

.warning-title {
  color: var(--ion-color-warning-shade);
}
</style>
