<template>
  <ion-modal :is-open="isOpen" @didDismiss="close">
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button :aria-label="translate('Close')" @click="close">
            <ion-icon slot="icon-only" :icon="closeOutline" />
          </ion-button>
        </ion-buttons>
        <ion-title>{{ translate("Data Manager Log") }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <ion-list lines="full">
        <ion-item>
          <ion-label>{{ translate("Log ID") }}</ion-label>
          <ion-note slot="end">{{ logId }}</ion-note>
        </ion-item>
        <ion-item v-if="details.statusId">
          <ion-label>{{ translate("Status") }}</ion-label>
          <ion-badge slot="end" :color="statusColor">{{ statusLabel }}</ion-badge>
        </ion-item>
        <ion-item v-if="details.configId">
          <ion-label>{{ translate("Import configuration") }}</ion-label>
          <ion-note slot="end">{{ details.configId }}</ion-note>
        </ion-item>
        <ion-item v-if="details.systemMessageId">
          <ion-label>{{ translate("SystemMessage") }}</ion-label>
          <ion-note slot="end">{{ details.systemMessageId }}</ion-note>
        </ion-item>
        <ion-item v-if="details.startedAt">
          <ion-label>{{ translate("Started") }}</ion-label>
          <ion-note slot="end">{{ formatDate(details.startedAt) }}</ion-note>
        </ion-item>
        <ion-item v-if="details.completedAt">
          <ion-label>{{ translate("Completed") }}</ion-label>
          <ion-note slot="end">{{ formatDate(details.completedAt) }}</ion-note>
        </ion-item>
        <ion-item v-if="details.totalRecordCount !== undefined">
          <ion-label>{{ translate("Total Records") }}</ion-label>
          <ion-note slot="end">{{ details.totalRecordCount }}</ion-note>
        </ion-item>
        <ion-item v-if="details.successRecordCount !== undefined">
          <ion-label>{{ translate("Success Records") }}</ion-label>
          <ion-note slot="end">{{ details.successRecordCount }}</ion-note>
        </ion-item>
        <ion-item v-if="details.failedRecordCount !== undefined">
          <ion-label>{{ translate("Failed Records") }}</ion-label>
          <ion-note slot="end">{{ details.failedRecordCount }}</ion-note>
        </ion-item>
      </ion-list>
    </ion-content>
  </ion-modal>
</template>

<script setup lang="ts">
import {
  IonBadge,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonNote,
  IonTitle,
  IonToolbar,
} from "@ionic/vue";
import { closeOutline } from "ionicons/icons";
import { computed } from "vue";
import { translate } from "@common";
import { formatDateTime } from "@/utils";

interface SafeShopifyOrderSyncMdmLogDetails {
  statusId?: string;
  configId?: string;
  systemMessageId?: string;
  startedAt?: string | number;
  completedAt?: string | number;
  totalRecordCount?: number;
  successRecordCount?: number;
  failedRecordCount?: number;
}

const props = withDefaults(defineProps<{
  isOpen: boolean;
  logId: string;
  details?: SafeShopifyOrderSyncMdmLogDetails;
}>(), { details: () => ({}) });
const emit = defineEmits<{ close: [] }>();

const statusLabel = computed(() => {
  const status = String(props.details.statusId || "").trim();
  const normalized = status.toLocaleLowerCase();
  if (normalized.includes("finish") || normalized.includes("complete") || normalized.includes("success")) return translate("Completed");
  if (normalized.includes("fail") || normalized.includes("crash") || normalized.includes("cancel")) return translate("Failed");
  if (normalized.includes("run") || normalized.includes("process") || normalized.includes("pending")) return translate("In progress");
  return status;
});
const statusColor = computed(() => statusLabel.value === translate("Completed")
  ? "success"
  : statusLabel.value === translate("Failed") ? "danger" : statusLabel.value === translate("In progress") ? "primary" : "medium");

function formatDate(value: unknown): string {
  return formatDateTime(value) || "";
}

function close() {
  emit("close");
}
</script>
