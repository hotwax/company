<template>
  <ion-item lines="none">
    <ion-label class="ion-text-wrap">
      <template v-if="kindLabel">{{ translate(kindLabel) }}</template>
      <p><ion-badge :color="isOn ? 'success' : 'medium'">{{ isOn ? translate("On") : translate("Off") }}</ion-badge></p>
      <p>{{ translate("Last run") }}: {{ commonUtil.getDateAndTime(lastRunTime) }}</p>
      <p>{{ scheduleText ? translate("Runs {cron}", { cron: scheduleText.toLowerCase() }) : translate("Not scheduled") }}</p>
      <p v-if="isOn && nextRunTime">{{ translate("Next run {at}", { at: formatDateTime(nextRunTime) }) }}</p>
      <slot />
      <p class="job-name">{{ jobName }}</p>
    </ion-label>
    <ion-button
      slot="end"
      fill="clear"
      :title="translate(editLabel)"
      :aria-label="translate(editLabel)"
      :data-testid="`netsuite-job-schedule-${jobName}`"
      @click="emit('openJob', jobName)"
    >
      <ion-icon slot="icon-only" :icon="calendarOutline" />
    </ion-button>
  </ion-item>
</template>

<script setup lang="ts">
import { IonBadge, IonButton, IonIcon, IonItem, IonLabel } from "@ionic/vue";
import { calendarOutline } from "ionicons/icons";
import { commonUtil, translate } from "@common";
import { formatDateTime } from "@/utils";
import { useCachedServiceJob } from "@/composables/useServiceJobs";

const props = withDefaults(defineProps<{ jobName: string; isOn: boolean; lastRunTime?: unknown; kindLabel?: string; editLabel?: string }>(), { editLabel: "Edit schedule" });
const emit = defineEmits<{ openJob: [jobName: string] }>();

const { scheduleText, nextRunTime } = useCachedServiceJob(() => props.jobName);
</script>

<style scoped>
.job-name {
  overflow-wrap: anywhere;
}
</style>
