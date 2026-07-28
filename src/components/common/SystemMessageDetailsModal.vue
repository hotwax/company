<template>
  <ion-modal :is-open="isOpen" :backdrop-dismiss="false" @didDismiss="close">
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button :aria-label="translate('Close')" @click="close">
            <ion-icon slot="icon-only" :icon="closeOutline" />
          </ion-button>
        </ion-buttons>
        <ion-title>{{ modalTitle }}</ion-title>
        <ion-buttons slot="end">
          <ion-button v-if="refreshable" :disabled="!messageId || loading" :aria-label="translate('Refresh')" @click="$emit('refresh')">
            <ion-icon slot="icon-only" :icon="refreshOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div v-if="loading" class="loading-state" role="status" :aria-label="translate('Loading SystemMessage details')">
        <ion-spinner name="crescent" />
      </div>

      <ion-list v-else-if="details.requestFailedBeforeImport" lines="full">
        <ion-item>
          <ion-label class="ion-text-wrap">
            {{ translate("Shopify order request") }}
            <p v-if="details.requestedAt">{{ translate("Requested") }} · {{ formatDate(details.requestedAt) }}</p>
            <p>{{ translate(details.requestFailureText || "Shopify order request failed before import.") }}</p>
          </ion-label>
          <ion-badge slot="end" color="danger">{{ translate("Failed") }}</ion-badge>
        </ion-item>
        <ion-item>
          <ion-label class="ion-text-wrap">
            {{ translate("HotWax order import") }}
            <p>{{ translate("The request failed before import, so no DataManager import was created.") }}</p>
          </ion-label>
          <ion-badge slot="end" color="medium">{{ translate("Not started") }}</ion-badge>
        </ion-item>
      </ion-list>

      <ion-list v-if="!loading" lines="full">
          <ion-item>
            <ion-label>
              {{ translate("SystemMessage") }}
              <p>{{ messageId }}</p>
            </ion-label>
            <ion-badge v-if="details.statusId || details.statusLabel" slot="end" :color="statusColor(details.statusId, details.statusLabel)">
              {{ details.statusLabel || statusLabel(details.statusId) }}
            </ion-badge>
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
          <ion-item v-if="details.bulkOperationId">
            <ion-label>
              {{ translate("Bulk operation ID") }}
              <p>{{ translate("Shopify returns this after it accepts the bulk operation.") }}</p>
            </ion-label>
            <ion-note slot="end">{{ details.bulkOperationId }}</ion-note>
          </ion-item>
          <ion-item v-if="details.nextStepReason || details.nextJobLabel">
            <ion-label class="ion-text-wrap">
              {{ translate("Next step") }}
              <p v-if="details.nextStepReason">{{ details.nextStepReason }}</p>
              <p v-if="details.nextJobLabel">
                {{ details.nextJobLabel }}<template v-if="details.nextJobRunLabel"> · {{ details.nextJobRunLabel }}</template>
              </p>
            </ion-label>
            <ion-buttons v-if="primaryAction || secondaryActions.length" slot="end">
              <ion-button
                v-if="primaryAction"
                fill="clear"
                :disabled="!!actionLoadingId"
                @click="$emit('action', primaryAction.id)"
              >
                <ion-spinner v-if="actionLoadingId === primaryAction.id" slot="start" name="crescent" />
                <span v-else>{{ primaryAction.label }}</span>
              </ion-button>
              <ion-button
                v-for="action in secondaryActions"
                :key="action.id"
                fill="clear"
                color="medium"
                :disabled="!!actionLoadingId"
                @click="$emit('action', action.id)"
              >
                <ion-spinner v-if="actionLoadingId === action.id" slot="start" name="crescent" />
                <span v-else>{{ action.label }}</span>
              </ion-button>
            </ion-buttons>
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
  IonSpinner,
  IonTitle,
  IonToolbar,
} from "@ionic/vue";
import { closeOutline, refreshOutline } from "ionicons/icons";
import { computed } from "vue";
import { translate } from "@common";
import { formatDateTime } from "@/utils";

interface SafeSystemMessageDetails {
  statusId?: string;
  statusLabel?: string;
  systemMessageTypeId?: string;
  systemMessageRemoteId?: string;
  requestedAt?: string | number;
  completedAt?: string | number;
  totalRecordCount?: number;
  failureCount?: number;
  requestFailedBeforeImport?: boolean;
  requestFailureText?: string;
  bulkOperationId?: string;
  nextStepReason?: string;
  nextJobLabel?: string;
  nextJobRunLabel?: string;
}

const props = withDefaults(defineProps<{
  isOpen: boolean;
  messageId: string;
  details?: SafeSystemMessageDetails;
  refreshable?: boolean;
  loading?: boolean;
  primaryAction?: { id: string; label: string } | null;
  secondaryActions?: Array<{ id: string; label: string }>;
  actionLoadingId?: string;
}>(), {
  details: () => ({}),
  refreshable: true,
  loading: false,
  primaryAction: null,
  secondaryActions: () => [],
  actionLoadingId: "",
});
const emit = defineEmits<{ close: []; refresh: []; action: [actionId: string] }>();
const modalTitle = computed(() => props.details.requestFailedBeforeImport
  ? translate("Order sync request details")
  : translate("SystemMessage details"));

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

function statusColor(status: unknown, explicitLabel?: string): string {
  const label = explicitLabel || statusLabel(status);
  if (label === translate("Completed")) return "success";
  if (label === translate("Failed")) return "danger";
  if (label === translate("In progress")) return "primary";
  return "medium";
}

</script>

<style scoped>
.loading-state {
  display: grid;
  min-height: 12rem;
  place-items: center;
}
</style>
