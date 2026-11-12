<template>
  <ion-modal :is-open="isOpen" :backdrop-dismiss="false" @didDismiss="emit('close')">
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button @click="emit('close')" :aria-label="translate('Close')">
            <ion-icon slot="icon-only" :icon="closeOutline" />
          </ion-button>
        </ion-buttons>
        <ion-title>{{ translate("Inventory sync mode") }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ translate("Inventory sync mode") }}</ion-card-title>
        </ion-card-header>
        <ion-list lines="full">
          <ion-item>
            <ion-segment :value="mode" @ionChange="handleModeChange($event.detail.value)" data-testid="inventory-sync-mode">
              <ion-segment-button value="first-time">
                <ion-label>{{ translate("First-time setup") }}</ion-label>
              </ion-segment-button>
              <ion-segment-button value="returning">
                <ion-label>{{ translate("Returning user") }}</ion-label>
              </ion-segment-button>
              <ion-segment-button value="auto">
                <ion-label>{{ translate("Auto") }}</ion-label>
              </ion-segment-button>
            </ion-segment>
          </ion-item>
          <ion-item>
            <ion-label>{{ translate("Configured channels") }}</ion-label>
            <ion-note slot="end">{{ channelCount }}</ion-note>
          </ion-item>
          <ion-item>
            <ion-label>{{ translate("Active view") }}</ion-label>
            <ion-badge slot="end" :color="activeMode === 'returning' ? 'primary' : 'medium'">
              {{ activeModeLabel }}
            </ion-badge>
          </ion-item>
        </ion-list>
      </ion-card>
    </ion-content>
  </ion-modal>
</template>

<script setup lang="ts">
import {
  IonBadge,
  IonButton,
  IonButtons,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonNote,
  IonSegment,
  IonSegmentButton,
  IonTitle,
  IonToolbar,
} from "@ionic/vue";
import { closeOutline } from "ionicons/icons";
import { translate } from "@common";

defineProps<{
  isOpen: boolean;
  mode: string;
  channelCount: number;
  activeMode: string;
  activeModeLabel: string;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "update:mode", mode: string): void;
}>();

function handleModeChange(value: string | number | undefined) {
  if (typeof value === "string") {
    emit("update:mode", value);
    emit("close");
  }
}
</script>
