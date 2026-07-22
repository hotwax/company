<template>
  <ion-modal :is-open="isOpen" @didDismiss="close">
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button :aria-label="translate('Close')" @click="close">{{ translate("Close") }}</ion-button>
        </ion-buttons>
        <ion-title>{{ translate("SystemMessage details") }}</ion-title>
        <ion-buttons slot="end">
          <ion-button :disabled="!messageId" :aria-label="translate('Refresh')" @click="$emit('refresh')">
            <ion-icon slot="icon-only" :icon="refreshOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-list lines="full">
          <ion-item>
            <ion-label>
              {{ translate("SystemMessage") }}
              <p>{{ messageId }}</p>
            </ion-label>
            <ion-badge v-if="details.statusId" slot="end" :color="statusColor(details.statusId)">{{ statusLabel(details.statusId) }}</ion-badge>
          </ion-item>
          <ion-item v-if="details.systemMessageTypeId">
            <ion-label>{{ translate("Message type") }}</ion-label>
            <ion-note slot="end">{{ details.systemMessageTypeId }}</ion-note>
          </ion-item>
          <ion-item v-if="details.systemMessageRemoteId">
            <ion-label>{{ translate("Remote") }}</ion-label>
            <ion-note slot="end">{{ details.systemMessageRemoteId }}</ion-note>
          </ion-item>
          <ion-item v-if="details.requestedAt">
            <ion-label>
              {{ translate("Requested") }}
              <p>{{ formatDate(details.requestedAt) }}</p>
            </ion-label>
          </ion-item>
          <ion-item v-if="details.completedAt">
            <ion-label>
              {{ translate("Completed") }}
              <p>{{ formatDate(details.completedAt) }}</p>
            </ion-label>
          </ion-item>
          <ion-item v-if="details.totalRecordCount !== undefined">
            <ion-label>{{ translate("Records") }}</ion-label>
            <ion-note slot="end">{{ details.totalRecordCount }}</ion-note>
          </ion-item>
          <ion-item v-if="details.failureCount !== undefined">
            <ion-label>{{ translate("Failures") }}</ion-label>
            <ion-note slot="end">{{ details.failureCount }}</ion-note>
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
import { refreshOutline } from "ionicons/icons";
import { translate } from "@common";
import { formatDateTime } from "@/utils";

interface SafeShopifyOrderSyncSystemMessageDetails {
  statusId?: string;
  systemMessageTypeId?: string;
  systemMessageRemoteId?: string;
  requestedAt?: string | number;
  completedAt?: string | number;
  totalRecordCount?: number;
  failureCount?: number;
}

withDefaults(defineProps<{
  isOpen: boolean;
  messageId: string;
  details?: SafeShopifyOrderSyncSystemMessageDetails;
}>(), { details: () => ({}) });
const emit = defineEmits<{ close: []; refresh: [] }>();

function close() {
  emit("close");
}

function formatDate(value: unknown): string {
  return formatDateTime(value) || translate("Not available");
}

function statusLabel(status: unknown): string {
  const value = String(status || "").toLowerCase();
  if (value.includes("complete") || value.includes("consume") || value.includes("success") || value.includes("sent") || value.includes("confirm")) return translate("Completed");
  if (value.includes("error") || value.includes("fail") || value.includes("reject")) return translate("Failed");
  if (value.includes("process") || value.includes("running")) return translate("In progress");
  return status ? String(status) : translate("Not available");
}

function statusColor(status: unknown): string {
  const label = statusLabel(status);
  if (label === translate("Completed")) return "success";
  if (label === translate("Failed")) return "danger";
  if (label === translate("In progress")) return "primary";
  return "medium";
}

</script>

<style scoped>
</style>
