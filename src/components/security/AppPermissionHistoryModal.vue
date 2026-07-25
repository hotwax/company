<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button @click="close()">
            <ion-icon slot="icon-only" :icon="closeOutline" />
          </ion-button>
        </ion-buttons>
        <ion-title>{{ translate("Security group history") }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-list v-if="records.length">
        <ion-item v-for="record in records" :key="`${record.groupId}-${record.fromDate || ''}-${record.thruDate || ''}`">
          <ion-label>
            {{ record.groupName || record.groupId }}
            <p>{{ record.groupId }}</p>
          </ion-label>
          <ion-note slot="end">
            {{ getDateTime(record.fromDate) }}
            -
            {{ record.thruDate ? getDateTime(record.thruDate) : translate("Current") }}
          </ion-note>
        </ion-item>
      </ion-list>

      <div v-else class="empty-state">
        <p>{{ translate("No history found.") }}</p>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { translate } from "@common";
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonPage,
  IonTitle,
  IonToolbar,
  modalController
} from "@ionic/vue";
import { closeOutline } from "ionicons/icons";
import { DateTime } from "luxon";
import { PropType } from "vue";
import { toEpochMillis } from "@/utils/appPermissionTime";

defineProps({
  records: {
    type: Array as PropType<any[]>,
    default: () => []
  }
});

const close = () => {
  modalController.dismiss(null, "cancel");
};

const getDateTime = (time: any) => {
  if(!time) {return "";}
  const millis = toEpochMillis(time);
  if(millis === undefined) {return "";}

  return DateTime.fromMillis(millis).toLocaleString(DateTime.DATETIME_MED);
};
</script>

<style scoped>
.empty-state {
  padding: 16px;
  text-align: center;
}
</style>
