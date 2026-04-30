<template>
  <ion-list>
    <ion-list-header>
      <ion-label>{{ translate("A list of previous product sync runs") }}</ion-label>
    </ion-list-header>

    <ion-accordion-group>
      <ion-accordion v-for="run in runs" :key="run.id" :value="run.id">
        <div class="list-item" slot="header">
          <ion-item lines="none">
            <ion-icon slot="start" :icon="getRunIcon(run)" :color="getRunIconColor(run)" />
            <ion-label>
              {{ run.id }}
              <p>{{ translate("Created") }}: {{ run.createdTime ? formatTime(run.createdTime) : translate("Unavailable") }}</p>
              <p>{{ translate("System message status") }}: {{ run.systemMessageStatus }}</p>
            </ion-label>
          </ion-item>

          <ion-label class="stat">
            <ion-chip outline :color="run.bulkOperationStatusColor">
              <ion-label>{{ run.bulkOperationStatusLabel }}</ion-label>
              <ion-icon :icon="getStatusIcon(run.bulkOperationStatus)" />
            </ion-chip>
            <p>{{ translate("Shopify bulk operation") }}</p>
          </ion-label>
          <ion-label class="stat">
            <ion-chip outline :color="run.mdmStatusColor">
              <ion-label>{{ run.mdmStatusLabel }}</ion-label>
              <ion-icon :icon="getStatusIcon(run.mdmStatus)" />
            </ion-chip>
            <p>{{ translate("Bulk import") }}</p>
          </ion-label>
          <div>
            <ion-spinner v-if="run.loading" name="crescent" size="small" />
          </div>
        </div>

        <ion-list slot="content" lines="full">
          <ion-item v-if="isProducedSystemMessage(run)">
            <ion-label>
              {{ translate("Waiting to be sent") }}
              <p>{{ translate("Produced messages wait for the send job to post them to Shopify. The Shopify bulk operation ID appears after Shopify accepts the request.") }}</p>
            </ion-label>
          </ion-item>
          <div class="shopify-bulk-operation list-item">
            <ion-item lines="none">
              <ion-label>
                {{ translate("Shopify bulk operation") }}
                <p>{{ run.bulkOperationId || "N/A" }}</p>
              </ion-label>
            </ion-item>
            <ion-label class="stat">
              <p>{{ translate("object count") }}: {{ run.objectCount }}</p>
              <p>{{ translate("root object count") }}: {{ run.rootObjectCount }}</p>
            </ion-label>
            <div>
              <ion-chip v-if="canViewQuery(run)" outline :color="getQueryChipColor(run)" :disabled="!run.queryContent" @click.stop="openQueryModal(run)">
                <ion-icon :icon="codeSlashOutline" />
                <ion-label>{{ getQueryChipLabel(run) }}</ion-label>
              </ion-chip>
            </div>
            <div></div>
          </div>
          <div class="hotwax-bulk-import list-item">
            <ion-item lines="none">
              <ion-label>
                {{ translate("Bulk import") }}
                <p>{{ run.mdmImportId || "N/A" }}</p>
              </ion-label>
            </ion-item>
            <ion-label class="stat">
              <ion-chip outline :color="getDownloadChipColor(run)" :disabled="!canDownloadRawFile(run)" @click.stop="emitDownloadRawFile(run)">
                <ion-icon :icon="downloadOutline" />
                <ion-label>{{ run.totalRecordCount }}</ion-label>
              </ion-chip>
              <p>{{ translate("total record count") }}</p>
            </ion-label>
            <ion-label class="stat">
              {{ run.failedRecordCount }}
              <p>{{ translate("failed record count") }}</p>
            </ion-label>
            <div></div>
          </div>
        </ion-list>
      </ion-accordion>
    </ion-accordion-group>
  </ion-list>

  <ion-card v-if="!runs.length">
    <ion-list lines="full">
      <ion-item>
        <ion-label>{{ translate("No product sync history found") }}</ion-label>
      </ion-item>
    </ion-list>
  </ion-card>

  <ion-modal :is-open="isQueryModalOpen" @didDismiss="closeQueryModal">
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button @click="closeQueryModal" :aria-label="translate('Close')">
            <ion-icon slot="icon-only" :icon="closeOutline" />
          </ion-button>
        </ion-buttons>
        <ion-title>{{ translate("Requested query") }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <ion-list lines="full">
        <ion-item>
          <ion-label>
            {{ translate("System message id") }}
            <p>{{ selectedQueryRun?.id }}</p>
          </ion-label>
        </ion-item>
        <ion-item>
          <ion-label>
            {{ translate("Shopify bulk operation Id") }}
            <p>{{ selectedQueryRun?.bulkOperationId || "N/A" }}</p>
          </ion-label>
        </ion-item>
        <ion-item>
          <ion-label>{{ translate("Requested query") }}</ion-label>
        </ion-item>
        <ion-item>
          <ion-textarea :value="selectedQueryContent" readonly auto-grow />
        </ion-item>
      </ion-list>
    </ion-content>
  </ion-modal>
</template>

<script setup lang="ts">
import {
  IonAccordion,
  IonAccordionGroup,
  IonButtons,
  IonButton,
  IonCard,
  IonChip,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonModal,
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToolbar
} from "@ionic/vue";
import { translate } from "@/i18n";
import { computed, defineEmits, defineProps, ref } from "vue";
import {
  alertCircleOutline,
  checkmarkCircleOutline,
  cloudDoneOutline,
  closeOutline,
  codeSlashOutline,
  downloadOutline,
  helpCircleOutline,
  serverOutline,
  syncCircleOutline
} from "ionicons/icons";
import { parseSystemMessageDateTime } from "@/utils/systemMessageHistory";

defineProps<{
  runs: any[]
}>();
const emit = defineEmits<{
  (event: "downloadRawFile", run: any): void
}>();

const isQueryModalOpen = ref(false);
const selectedQueryRun = ref<any>(null);

const selectedQueryContent = computed(() => {
  return formatQueryContent(selectedQueryRun.value);
});

function formatTime(time: any) {
  const dateTime = parseSystemMessageDateTime(time);
  return dateTime ? dateTime.toFormat("LLL d, yyyy HH:mm") : translate("Unavailable");
}

function openQueryModal(run: any) {
  if (!run?.queryContent) return;
  selectedQueryRun.value = run;
  isQueryModalOpen.value = true;
}

function closeQueryModal() {
  isQueryModalOpen.value = false;
  selectedQueryRun.value = null;
}

function emitDownloadRawFile(run: any) {
  if (!canDownloadRawFile(run)) return;
  emit("downloadRawFile", run);
}

function canDownloadRawFile(run: any) {
  return !!run?.mdmLogConfigId && (!!run?.mdmLogContentId || !!run?.mdmImportId);
}

function getDownloadChipColor(run: any) {
  return canDownloadRawFile(run) ? "primary" : "medium";
}

function formatQueryContent(run: any) {
  const content = run?.queryContent || "";

  try {
    return JSON.stringify(JSON.parse(content), null, 2);
  } catch {
    return content;
  }
}

function getQueryChipColor(run: any) {
  return run?.queryContent ? "primary" : "medium";
}

function getQueryChipLabel(run: any) {
  return run?.queryContent ? translate("View query") : translate("No query found");
}

function canViewQuery(run: any) {
  return !!run?.bulkOperationId || !!run?.queryContent;
}

function getStatusIcon(status: string) {
  const normalizedStatus = normalizeStatus(status);
  if (["completed", "finished", "success", "confirmed", "consumed", "smsgconfirmed", "smsgconsumed", "dmlsuccess", "dmlsfinished"].includes(normalizedStatus)) return checkmarkCircleOutline;
  if (["completedwitherrors", "error", "failed", "cancelled", "canceled", "crashed", "smsgerror", "dmlerror", "dmlsfailed", "dmlscrashed", "dmlscancelled"].includes(normalizedStatus)) return alertCircleOutline;
  if (["running", "sent", "pending", "produced", "queued", "smsgsent", "smsgproduced", "dmlsrunning", "dmlspending", "dmlsqueued"].includes(normalizedStatus)) return syncCircleOutline;
  return helpCircleOutline;
}

function getRunIcon(run: any) {
  if (hasRunError(run)) return alertCircleOutline;
  if (isCompleteStatus(run?.mdmStatus)) return serverOutline;
  if (isCompleteStatus(run?.bulkOperationStatus)) return cloudDoneOutline;

  return helpCircleOutline;
}

function getRunIconColor(run: any) {
  if (hasRunError(run)) return "danger";
  if (isCompleteStatus(run?.mdmStatus)) return "success";
  if (isCompleteStatus(run?.bulkOperationStatus)) return "success";

  return "medium";
}

function isProducedSystemMessage(run: any) {
  return ["produced", "system-msg-produced", "smsgproduced"].includes(normalizeStatus(run?.systemMessageStatus));
}

function hasRunError(run: any) {
  if (!run) return false;
  if (Number(run.failedRecordCount) > 0) return true;
  return [
    run.systemMessageStatus,
    run.systemMessageStatusColor,
    run.bulkOperationStatus,
    run.bulkOperationStatusColor,
    run.mdmStatus,
    run.mdmStatusColor
  ].some((status) => {
    const normalizedStatus = normalizeStatus(status);
    return ["danger", "error", "failed", "cancelled", "canceled", "completed-with-errors", "dml-error", "dmlerror"].includes(normalizedStatus);
  });
}

function isCompleteStatus(status: string) {
  return ["completed", "finished", "success", "confirmed", "consumed", "smsgconfirmed", "smsgconsumed", "dmlsuccess", "dmlsfinished"].includes(normalizeStatus(status));
}

function normalizeStatus(status: string) {
  return String(status || "").toLowerCase().replace(/[_\-\s]/g, "");
}
</script>

<style scoped>
.list-item {
  --columns-desktop: 4;
  border-top: 1px solid var(--ion-color-medium);
}

.list-item .item-key {
  padding-inline-start: var(--spacer-sm);
}

@media (min-width: 991px) {
  .list-item {
    padding-block: var(--spacer-sm);
    padding-inline-end: var(--spacer-sm);
  }
}
</style>
