<template>
  <ion-content>
    <ion-list>
      <ion-item button @click="dismiss('reschedule')">
        <ion-label>{{ translate("Reschedule") }}</ion-label>
        <ion-icon :icon="calendarOutline" slot="end" />
      </ion-item>
      <ion-item button lines="none" @click="dismiss(isPaused ? 'resume' : 'pause')">
        <ion-label>{{ isPaused ? translate("Resume") : translate("Pause") }}</ion-label>
        <ion-icon :icon="isPaused ? playOutline : pauseOutline" slot="end" />
      </ion-item>
    </ion-list>
  </ion-content>
</template>

<script setup lang="ts">
import { IonContent, IonIcon, IonItem, IonLabel, IonList, popoverController } from "@ionic/vue";
import { translate } from '@/i18n';
import { calendarOutline, pauseOutline, playOutline } from 'ionicons/icons';
import { defineProps } from "vue";

defineProps<{
  isPaused?: boolean
}>();

function dismiss(action: string) {
  popoverController.dismiss({ action });
}
</script>
