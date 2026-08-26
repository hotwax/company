<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button :default-href="`/shopify-connection-details/${props.id}/transfer-sync`" />
        </ion-buttons>
        <ion-title>{{ headerRow?.orderName || props.orderId }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding-horizontal">
      <template v-if="loading && !detail">
        <ion-card v-for="i in 3" :key="i" class="ion-margin-top">
          <ion-card-header>
            <ion-skeleton-text :animated="true" style="width: 40%" />
          </ion-card-header>
          <ion-card-content>
            <ion-skeleton-text :animated="true" style="width: 90%" />
            <ion-skeleton-text :animated="true" style="width: 70%" />
          </ion-card-content>
        </ion-card>
      </template>

      <ion-card v-else-if="loadError && !detail" class="ion-margin-top">
        <ion-card-content class="fatal-error">
          <ion-icon :icon="warningOutline" color="danger" />
          <ion-label class="ion-text-wrap">
            <h2>{{ translate("This transfer could not be loaded") }}</h2>
            <p>{{ loadError }}</p>
          </ion-label>
          <ion-button fill="outline" :disabled="loading" @click="loadDetail()">
            <ion-spinner v-if="loading" name="crescent" />
            <template v-else>
              {{ translate("Retry") }}
            </template>
          </ion-button>
        </ion-card-content>
      </ion-card>

      <template v-else>
        <ion-card v-if="loadError" color="warning" class="ion-margin-top stale-banner">
          <ion-card-content>
            <ion-icon :icon="warningOutline" />
            <ion-label class="ion-text-wrap">
              {{ translate("The data below may be out of date") }}
              <p>{{ loadError }}</p>
            </ion-label>
          </ion-card-content>
        </ion-card>

        <!-- Header card -->
        <ion-card class="ion-margin-top">
          <ion-card-header>
            <ion-card-subtitle>{{ translate("Order") }}</ion-card-subtitle>
            <ion-card-title>
              {{ owner.orderName || owner.orderId || props.orderId }}
              <ion-badge :color="stageColor(owner.syncStage)">
                {{ stageLabel(owner.syncStage) }}
              </ion-badge>
            </ion-card-title>
          </ion-card-header>
          <ion-list lines="full">
            <ion-item>
              <ion-label>{{ translate("Order status") }}</ion-label>
              <ion-note slot="end">
                {{ owner.orderStatusId || translate("Not available") }}
              </ion-note>
            </ion-item>
            <ion-item>
              <ion-label>{{ translate("Remote transfer ID") }}</ion-label>
              <ion-note slot="end">
                {{ owner.shopifyInventoryTransferId || translate("Not created yet") }}
              </ion-note>
            </ion-item>
            <ion-item>
              <ion-label>
                {{ translate("Origin") }}
                <p>{{ originLocation }}</p>
              </ion-label>
            </ion-item>
            <ion-item>
              <ion-label>
                {{ translate("Destination") }}
                <p>{{ destinationLocation }}</p>
              </ion-label>
            </ion-item>
            <ion-item lines="none">
              <ion-label>{{ translate("Owner created") }}</ion-label>
              <ion-note slot="end">
                {{ formatDateTime(owner.orderEntryDate) || translate("Not available") }}
              </ion-note>
            </ion-item>
          </ion-list>
        </ion-card>

        <!-- Lines card -->
        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ translate("Lines") }}</ion-card-title>
          </ion-card-header>
          <ion-list v-if="lines.length" lines="full">
            <ion-item v-for="line in lines" :key="line.key">
              <ion-label class="ion-text-wrap">
                {{ line.product || line.orderItemSeqId || translate("Not available") }}
                <p>{{ translate("Order item") }} {{ line.orderItemSeqId || translate("Not available") }}</p>
              </ion-label>
              <ion-label slot="end" class="ion-text-end">
                {{ line.lineQuantity ?? translate("Not available") }}
                <p>{{ translate("Frozen quantity") }}</p>
              </ion-label>
              <ion-badge v-if="line.removed" slot="end" color="danger">
                {{ translate("Removed") }}
              </ion-badge>
              <ion-note v-else slot="end">
                {{ line.shopifyInventoryTransferLineItemId || translate("Unconfirmed") }}
              </ion-note>
            </ion-item>
          </ion-list>
          <ion-card-content v-else>
            {{ translate("Not available") }}
          </ion-card-content>
        </ion-card>

        <!-- Action bar -->
        <ion-card v-if="canAdminister">
          <ion-card-header>
            <ion-card-title>{{ translate("Actions") }}</ion-card-title>
          </ion-card-header>
          <ion-card-content class="action-bar">
            <ion-button
              fill="outline"
              :disabled="!timelineArtifacts.length || actionPending"
              @click="openSuppressModal()"
            >
              {{ translate("Suppress candidate") }}
            </ion-button>
          </ion-card-content>
        </ion-card>

        <!-- Timeline -->
        <h1>{{ translate("Timeline") }}</h1>
        <ion-card v-if="!timeline.length">
          <ion-card-content>{{ translate("No timeline activity recorded for this transfer.") }}</ion-card-content>
        </ion-card>
        <ion-list v-else lines="full">
          <ion-item v-for="entry in timeline" :key="entry.key" class="timeline-item">
            <ion-label class="ion-text-wrap">
              <ion-badge :color="entry.badgeColor">
                {{ entry.kindLabel }}
              </ion-badge>
              {{ entry.title }}
              <p v-for="line in entry.subtitleLines" :key="line">
                {{ line }}
              </p>

              <!-- DataManagerLog: source/error JSON, inline (ShopifyOrderSyncMdmLogModal has no
                   field for this, so it is shown here rather than forking that shared component). -->
              <template v-if="entry.kind === 'dm-create' || entry.kind === 'dm-update'">
                <ion-button fill="clear" size="small" @click="toggleJson(entry.key)">
                  {{ isJsonOpen(entry.key) ? translate("Hide source / error details") : translate("Show source / error details") }}
                </ion-button>
                <div v-if="isJsonOpen(entry.key)" class="accordion-content">
                  <pre><code>{{ entry.jsonText }}</code></pre>
                </div>
                <ion-button fill="clear" size="small" @click="openMdmLogModal(entry.raw)">
                  {{ translate("View Data Manager log") }}
                </ion-button>
                <span v-if="canAdminister && entry.blocked" class="log-actions">
                  <ion-button fill="outline" size="small" :disabled="actionPending" @click="confirmRetry(entry.raw)">
                    {{ translate("Retry") }}
                  </ion-button>
                  <ion-button fill="outline" size="small" color="medium" :disabled="actionPending" @click="openResolveModal(entry.raw)">
                    {{ translate("Supersede") }}
                  </ion-button>
                </span>
              </template>

              <template v-else-if="entry.kind === 'webhook'">
                <ion-button fill="clear" size="small" @click="openWebhookModal(entry.raw)">
                  {{ translate("View SystemMessage details") }}
                </ion-button>
              </template>

              <template v-else-if="entry.kind === 'suppression'">
                <span v-if="canAdminister && entry.cancelable" class="log-actions">
                  <ion-button fill="outline" size="small" color="danger" :disabled="actionPending" @click="confirmCancelSuppression(entry.raw)">
                    {{ translate("Cancel suppression") }}
                  </ion-button>
                </span>
              </template>
            </ion-label>
            <ion-note slot="end">
              {{ formatDateTime(entry.happenedAt) || translate("Not available") }}
            </ion-note>
          </ion-item>
        </ion-list>
      </template>

      <!-- Supersede reason modal -->
      <ion-modal :is-open="!!resolveTarget" @did-dismiss="resolveTarget = null">
        <ion-header>
          <ion-toolbar>
            <ion-buttons slot="start">
              <ion-button :aria-label="translate('Close')" @click="resolveTarget = null">
                <ion-icon slot="icon-only" :icon="closeOutline" />
              </ion-button>
            </ion-buttons>
            <ion-title>{{ translate("Supersede blocked log") }}</ion-title>
          </ion-toolbar>
        </ion-header>
        <ion-content class="ion-padding">
          <ion-textarea
            v-model="resolveReason"
            fill="outline"
            :label="translate('Reason') + ' *'"
            label-placement="stacked"
            :placeholder="translate('Explain why this log is being superseded instead of retried')"
            :auto-grow="true"
          />
        </ion-content>
        <ion-footer>
          <ion-toolbar>
            <ion-buttons slot="end">
              <ion-button fill="clear" @click="resolveTarget = null">
                {{ translate("Cancel") }}
              </ion-button>
              <ion-button fill="solid" :disabled="!resolveReason.trim() || actionPending" @click="confirmResolve()">
                {{ translate("Supersede") }}
              </ion-button>
            </ion-buttons>
          </ion-toolbar>
        </ion-footer>
      </ion-modal>

      <!-- Suppress candidate modal -->
      <ion-modal :is-open="showSuppressModal" @did-dismiss="showSuppressModal = false">
        <ion-header>
          <ion-toolbar>
            <ion-buttons slot="start">
              <ion-button :aria-label="translate('Close')" @click="showSuppressModal = false">
                <ion-icon slot="icon-only" :icon="closeOutline" />
              </ion-button>
            </ion-buttons>
            <ion-title>{{ translate("Suppress candidate") }}</ion-title>
          </ion-toolbar>
        </ion-header>
        <ion-content class="ion-padding">
          <ion-item lines="full">
            <ion-select
              v-model="suppressArtifactKey"
              :label="translate('Artifact')"
              label-placement="stacked"
              interface="popover"
              :placeholder="translate('Select')"
            >
              <ion-select-option v-for="artifact in timelineArtifacts" :key="artifact.key" :value="artifact.key">
                {{ artifact.eventTypeId }} / {{ artifact.eventReferenceId }}
              </ion-select-option>
            </ion-select>
          </ion-item>
          <ion-item lines="full">
            <ion-select
              v-model="suppressPurpose"
              :label="translate('Purpose')"
              label-placement="stacked"
              interface="popover"
              :placeholder="translate('Select')"
            >
              <ion-select-option v-for="purpose in SUPPRESSION_PURPOSES" :key="purpose" :value="purpose">
                {{ purpose }}
              </ion-select-option>
            </ion-select>
          </ion-item>
          <ion-textarea
            v-model="suppressReason"
            class="ion-margin-top"
            fill="outline"
            :label="translate('Reason') + ' *'"
            label-placement="stacked"
            :auto-grow="true"
          />
        </ion-content>
        <ion-footer>
          <ion-toolbar>
            <ion-buttons slot="end">
              <ion-button fill="clear" @click="showSuppressModal = false">
                {{ translate("Cancel") }}
              </ion-button>
              <ion-button
                fill="solid"
                :disabled="!suppressArtifactKey || !suppressPurpose || !suppressReason.trim() || actionPending"
                @click="confirmSuppress()"
              >
                {{ translate("Suppress") }}
              </ion-button>
            </ion-buttons>
          </ion-toolbar>
        </ion-footer>
      </ion-modal>

      <ShopifyOrderSyncMdmLogModal
        :is-open="!!mdmLogModalTarget"
        :log-id="mdmLogModalTarget?.logId || ''"
        :details="mdmLogModalDetails"
        @close="mdmLogModalTarget = null"
      />

      <SystemMessageDetailsModal
        :is-open="!!webhookModalTarget"
        :message-id="webhookModalTarget?.systemMessageId || ''"
        :details="webhookModalDetails"
        :refreshable="false"
        @close="webhookModalTarget = null"
      />
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { commonUtil, logger, translate } from "@common";
import {
  IonBackButton, IonBadge, IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader,
  IonCardSubtitle, IonCardTitle, IonContent, IonFooter, IonHeader, IonIcon, IonItem, IonLabel,
  IonList, IonModal, IonNote, IonPage, IonSelect, IonSelectOption, IonSkeletonText, IonSpinner,
  IonTextarea, IonTitle, IonToolbar, alertController, onIonViewDidLeave, onIonViewWillEnter,
} from "@ionic/vue";
import { closeOutline, warningOutline } from "ionicons/icons";
import { computed, ref } from "vue";
import Actions from "@/authorization/actions";
import SystemMessageDetailsModal from "@/components/common/SystemMessageDetailsModal.vue";
import ShopifyOrderSyncMdmLogModal from "@/components/shopify-order-sync/ShopifyOrderSyncMdmLogModal.vue";
import { useCacheSync } from "@/composables/useCacheSync";
import {
  SUPPRESSION_PURPOSES,
  type SuppressionPurpose,
  useShopifyTransferSyncDetail,
  useShopifyTransferSyncMutations,
  useShopifyTransferSyncRow,
} from "@/composables/useShopifyTransferSync";
import { useUserStore } from "@/store/user";
import { formatDateTime } from "@/utils";
import {
  normalizeTransferSyncLines,
  stageColor,
  stageLabel,
} from "@/utils/shopifyTransferSync";

const props = defineProps<{ id?: string; orderId?: string }>();

const shopId = computed(() => String(props.id ?? ""));
const orderId = computed(() => String(props.orderId ?? ""));

const userStore = useUserStore();
const canAdminister = computed(() => userStore.hasPermission(Actions.APP_SHOPIFY_TRANSFER_SYNC_ADMIN));

// The `shopifyTransferSync` domain is activated here too (not just on the list page), because
// `afterMutation` below routes through this composable's OWN worker service — without starting it
// on this page, the service is null and the post-action cache refresh would silently no-op.
const { start: startSyncDomains, stop: stopSyncDomains, afterMutation } = useCacheSync();
const { row: headerRow } = useShopifyTransferSyncRow(() => shopId.value, () => orderId.value);
const { fetchTransferSyncDetail } = useShopifyTransferSyncDetail();

const detail = ref<any>(null);
const loading = ref(false);
const loadError = ref("");
const actionPending = ref(false);
const openJsonKeys = ref<Set<string>>(new Set());

function isJsonOpen(key: string): boolean {
  return openJsonKeys.value.has(key);
}

function toggleJson(key: string) {
  const next = new Set(openJsonKeys.value);
  if(next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  openJsonKeys.value = next;
}

async function loadDetail() {
  if(!shopId.value || !orderId.value) {return;}
  loading.value = true;
  loadError.value = "";
  try {
    detail.value = await fetchTransferSyncDetail(shopId.value, orderId.value);
  } catch (error: any) {
    logger.error("Failed to load Shopify transfer sync detail", shopId.value, orderId.value, error);
    loadError.value = error?.message || translate("The OMS could not load this transfer's detail.");
  } finally {
    loading.value = false;
  }
}

function activeSyncDomains() {
  return shopId.value
    ? [{ name: "shopifyTransferSync", args: { shopId: shopId.value, total: 300 } }]
    : [];
}

onIonViewWillEnter(() => {
  void startSyncDomains(activeSyncDomains());
  void loadDetail();
});
onIonViewDidLeave(() => { stopSyncDomains(); });

// --- Owner header ---------------------------------------------------------------------------
const owner = computed<any>(() => detail.value?.owner ?? detail.value?.header ?? headerRow.value ?? {});

/** Facility name/id may each be independently null (ambiguous resolution) — never re-derive them. */
const originLocation = computed(() => owner.value.originFacilityName || owner.value.originFacilityId || translate("Not available"));
const destinationLocation = computed(() => owner.value.destinationFacilityName || owner.value.destinationFacilityId || translate("Not available"));

// --- Lines ------------------------------------------------------------------------------------
const lines = computed(() => normalizeTransferSyncLines(detail.value?.lines ?? []));

// --- Timeline -----------------------------------------------------------------------------------
interface TimelineEntry {
  key: string;
  kind: "shopify-in" | "oms-out" | "dm-create" | "dm-update" | "webhook" | "suppression";
  kindLabel: string;
  badgeColor: string;
  happenedAt: number | undefined;
  title: string;
  subtitleLines: string[];
  raw: any;
  jsonText?: string;
  blocked?: boolean;
  cancelable?: boolean;
}

/** A log carries a DataManagerParameter named `resolutionStatus` once RETRIED or SUPERSEDED. */
function resolutionStatusOf(log: any): string | undefined {
  const params: any[] = log?.dataManagerParameters ?? log?.parameters ?? [];
  const param = params.find((p) => p?.parameterName === "resolutionStatus" || p?.parameterTypeId === "resolutionStatus");

  return param?.parameterValue;
}

/** §5.5.1 block predicate — mirrored exactly, not re-derived. */
function isDmLogBlocked(log: any): boolean {
  if(resolutionStatusOf(log)) {return false;}
  const status = log?.statusId;
  if(["DmlsPending", "DmlsQueued", "DmlsRunning", "DmlsFailed", "DmlsCrashed"].includes(status)) {return true;}
  if(status === "DmlsFinished" && Number(log?.failedRecordCount ?? 0) > 0) {return true;}

  return false;
}

function dmLogStatusLabel(log: any): string {
  const resolution = resolutionStatusOf(log);
  if(resolution === "RETRIED") {return translate("Resolved - retried");}
  if(resolution === "SUPERSEDED") {return translate("Resolved - superseded");}
  if(isDmLogBlocked(log)) {return translate("Blocked - retry available");}
  if(log?.statusId === "DmlsCancelled") {return translate("Cancelled");}

  return translate("Completed");
}

function dmLogBadgeColor(log: any): string {
  if(resolutionStatusOf(log)) {return "success";}
  if(isDmLogBlocked(log)) {return "danger";}

  return "medium";
}

/** create/update DataManagerLog rows, normalized from whichever shape the bundle carries. */
function dmLogRows(bundle: any): Array<{ row: any; logKind: "create" | "update" }> {
  if(Array.isArray(bundle?.createLogs) || Array.isArray(bundle?.updateLogs)) {
    return [
      ...(bundle?.createLogs ?? []).map((row: any) => ({ row, logKind: "create" as const })),
      ...(bundle?.updateLogs ?? []).map((row: any) => ({ row, logKind: "update" as const })),
    ];
  }

  return (bundle?.dataManagerLogs ?? []).map((row: any) => ({
    row,
    logKind: /create/i.test(String(row?.logKind ?? row?.dataManagerLogType ?? "")) ? "create" : "update",
  }));
}

const timeline = computed<TimelineEntry[]>(() => {
  const bundle = detail.value;
  if(!bundle) {return [];}
  const entries: TimelineEntry[] = [];

  const activities: any[] = bundle.activities ?? [];
  activities.forEach((activity: any, index: number) => {
    const shopifyOrigin = !!activity.sourceSystemMessageId;
    entries.push({
      key: `activity-${index}`,
      kind: shopifyOrigin ? "shopify-in" : "oms-out",
      kindLabel: shopifyOrigin ? translate("Shopify -> OMS") : translate("OMS -> Shopify"),
      badgeColor: shopifyOrigin ? "tertiary" : "secondary",
      happenedAt: activity.happenedAt,
      title: activity.topic || translate("Not available"),
      subtitleLines: [
        activity.activityKey ? `${activity.activityKey}: ${activity.activityValue ?? ""}` : "",
      ].filter(Boolean),
      raw: activity,
    });
  });

  dmLogRows(bundle).forEach(({ row, logKind }, index) => {
    entries.push({
      key: `dmlog-${logKind}-${index}`,
      kind: logKind === "create" ? "dm-create" : "dm-update",
      kindLabel: logKind === "create" ? translate("Data Manager: Create") : translate("Data Manager: Update"),
      badgeColor: dmLogBadgeColor(row),
      happenedAt: row.createdDate,
      title: dmLogStatusLabel(row),
      subtitleLines: [
        row.failedRecordCount !== undefined ? `${translate("Failed records")}: ${row.failedRecordCount}` : "",
      ].filter(Boolean),
      raw: row,
      jsonText: JSON.stringify({ source: row.sourceContent, error: row.errorContent }, null, 2),
      blocked: logKind === "update" && isDmLogBlocked(row),
    });
  });

  const webhookMessages: any[] = bundle.webhookMessages ?? bundle.incomingMessages ?? [];
  webhookMessages.forEach((message: any, index: number) => {
    entries.push({
      key: `webhook-${index}`,
      kind: "webhook",
      kindLabel: translate("Webhook"),
      badgeColor: /error|fail/i.test(String(message.statusId ?? "")) ? "danger" : "medium",
      happenedAt: message.happenedAt ?? message.initDate,
      title: message.topic || message.systemMessageTypeId || translate("Not available"),
      subtitleLines: [message.errorText || ""].filter(Boolean),
      raw: message,
    });
  });

  const suppressionTasks: any[] = bundle.suppressionTasks ?? [];
  suppressionTasks.forEach((task: any, index: number) => {
    entries.push({
      key: `suppression-${index}`,
      kind: "suppression",
      kindLabel: translate("Suppression"),
      badgeColor: task.statusId === "TASK_CANCELLED" ? "medium" : "warning",
      happenedAt: task.createdDate,
      title: task.workEffortName || task.workEffortPurposeTypeId || translate("Not available"),
      subtitleLines: [task.description || "", task.statusId || ""].filter(Boolean),
      raw: task,
      cancelable: task.statusId && task.statusId !== "TASK_CANCELLED" && task.statusId !== "TASK_COMPLETED",
    });
  });

  return entries.sort((a, b) => Number(b.happenedAt ?? 0) - Number(a.happenedAt ?? 0));
});

/** Distinct {eventTypeId, eventReferenceId} artifacts seen across activities — suppress candidates. */
const timelineArtifacts = computed(() => {
  const bundle = detail.value;
  const activities: any[] = bundle?.activities ?? [];
  const seen = new Map<string, { key: string; eventTypeId: string; eventReferenceId: string }>();
  for(const activity of activities) {
    for(const artifact of activity.events ?? []) {
      const key = `${artifact.eventTypeId}|${artifact.eventReferenceId}`;
      if(!seen.has(key) && artifact.eventTypeId && artifact.eventReferenceId) {
        seen.set(key, { key, eventTypeId: artifact.eventTypeId, eventReferenceId: artifact.eventReferenceId });
      }
    }
  }

  return [...seen.values()];
});

// --- Read-only detail modals ---------------------------------------------------------------------
const mdmLogModalTarget = ref<any>(null);
const mdmLogModalDetails = computed(() => mdmLogModalTarget.value ? {
  statusId: mdmLogModalTarget.value.statusId,
  configId: mdmLogModalTarget.value.configId,
  systemMessageId: mdmLogModalTarget.value.systemMessageId,
  startedAt: mdmLogModalTarget.value.startDateTime,
  completedAt: mdmLogModalTarget.value.finishDateTime,
  totalRecordCount: mdmLogModalTarget.value.totalRecordCount,
  successRecordCount: mdmLogModalTarget.value.successRecordCount,
  failedRecordCount: mdmLogModalTarget.value.failedRecordCount,
} : {});
function openMdmLogModal(row: any) { mdmLogModalTarget.value = row; }

const webhookModalTarget = ref<any>(null);
const webhookModalDetails = computed(() => webhookModalTarget.value ? {
  statusId: webhookModalTarget.value.statusId,
  systemMessageTypeId: webhookModalTarget.value.topic || webhookModalTarget.value.systemMessageTypeId,
  requestedAt: webhookModalTarget.value.happenedAt ?? webhookModalTarget.value.initDate,
} : {});
function openWebhookModal(row: any) { webhookModalTarget.value = row; }

// --- Actions --------------------------------------------------------------------------------
const { retryUpdateLog, resolveUpdateLog, suppressActivityCandidate, cancelSuppressionTask } =
  useShopifyTransferSyncMutations();

async function afterActionSuccess(message: string) {
  commonUtil.showToast(message);
  await afterMutation("shopifyTransferSync", { shopId: shopId.value, orderId: orderId.value });
  await loadDetail();
}

async function confirmRetry(log: any) {
  const alert = await alertController.create({
    header: translate("Retry this blocked log?"),
    message: translate("The update will be re-attempted with the same data. This does not change what will be sent to Shopify."),
    buttons: [
      { text: translate("Cancel"), role: "cancel" },
      { text: translate("Retry"), role: "confirm" },
    ],
  });
  await alert.present();
  if((await alert.onDidDismiss()).role !== "confirm") {return;}

  actionPending.value = true;
  try {
    await retryUpdateLog(orderId.value, log.logId);
    await afterActionSuccess(translate("Retry started"));
  } catch (error: any) {
    logger.error("Failed to retry transfer update log", log?.logId, error);
    commonUtil.showToast(error?.message || translate("Failed to retry this log"));
  } finally {
    actionPending.value = false;
  }
}

const resolveTarget = ref<any>(null);
const resolveReason = ref("");
function openResolveModal(log: any) {
  resolveTarget.value = log;
  resolveReason.value = "";
}
async function confirmResolve() {
  if(!resolveTarget.value || !resolveReason.value.trim()) {return;}
  const alert = await alertController.create({
    header: translate("Supersede this blocked log?"),
    message: translate("This marks the log resolved without retrying it. The transfer will no longer be blocked by it."),
    buttons: [
      { text: translate("Cancel"), role: "cancel" },
      { text: translate("Supersede"), role: "confirm" },
    ],
  });
  await alert.present();
  if((await alert.onDidDismiss()).role !== "confirm") {return;}

  actionPending.value = true;
  try {
    await resolveUpdateLog(orderId.value, resolveTarget.value.logId, resolveReason.value.trim());
    resolveTarget.value = null;
    await afterActionSuccess(translate("Log superseded"));
  } catch (error: any) {
    logger.error("Failed to supersede transfer update log", error);
    commonUtil.showToast(error?.message || translate("Failed to supersede this log"));
  } finally {
    actionPending.value = false;
  }
}

const showSuppressModal = ref(false);
const suppressArtifactKey = ref("");
const suppressPurpose = ref<SuppressionPurpose | "">("");
const suppressReason = ref("");
function openSuppressModal() {
  showSuppressModal.value = true;
  suppressArtifactKey.value = "";
  suppressPurpose.value = "";
  suppressReason.value = "";
}
async function confirmSuppress() {
  const artifact = timelineArtifacts.value.find((a) => a.key === suppressArtifactKey.value);
  if(!artifact || !suppressPurpose.value || !suppressReason.value.trim()) {return;}
  const alert = await alertController.create({
    header: translate("Suppress this candidate?"),
    message: translate("This stops the selected activity from generating further sync actions. It cannot be automatically undone."),
    buttons: [
      { text: translate("Cancel"), role: "cancel" },
      { text: translate("Suppress"), role: "confirm" },
    ],
  });
  await alert.present();
  if((await alert.onDidDismiss()).role !== "confirm") {return;}

  actionPending.value = true;
  try {
    await suppressActivityCandidate({
      shopId: shopId.value,
      orderId: orderId.value,
      sourceReferenceId: artifact.eventReferenceId,
      workEffortPurposeTypeId: suppressPurpose.value,
      reason: suppressReason.value.trim(),
    });
    showSuppressModal.value = false;
    await afterActionSuccess(translate("Candidate suppressed"));
  } catch (error: any) {
    logger.error("Failed to suppress transfer activity candidate", error);
    commonUtil.showToast(error?.message || translate("Failed to suppress this candidate"));
  } finally {
    actionPending.value = false;
  }
}

async function confirmCancelSuppression(task: any) {
  const alert = await alertController.create({
    header: translate("Cancel this suppression?"),
    message: translate("The suppressed activity becomes eligible for sync again on the next pass."),
    buttons: [
      { text: translate("Cancel"), role: "cancel" },
      { text: translate("Cancel suppression"), role: "confirm" },
    ],
  });
  await alert.present();
  if((await alert.onDidDismiss()).role !== "confirm") {return;}

  actionPending.value = true;
  try {
    await cancelSuppressionTask(shopId.value, orderId.value, task.workEffortId);
    await afterActionSuccess(translate("Suppression cancelled"));
  } catch (error: any) {
    logger.error("Failed to cancel suppression task", task?.workEffortId, error);
    commonUtil.showToast(error?.message || translate("Failed to cancel this suppression"));
  } finally {
    actionPending.value = false;
  }
}
</script>

<style scoped>
.fatal-error,
.stale-banner ion-card-content {
  display: flex;
  align-items: center;
  gap: var(--spacer-sm);
}

.fatal-error {
  flex-direction: column;
  text-align: center;
  padding: var(--spacer-2xl);
}

.action-bar {
  display: flex;
  gap: var(--spacer-sm);
  flex-wrap: wrap;
}

.timeline-item ion-badge {
  margin-inline-end: var(--spacer-xs);
}

.log-actions {
  display: inline-flex;
  gap: var(--spacer-xs);
  margin-inline-start: var(--spacer-xs);
}

/* Copied verbatim from ShopifyInventoryJobRuns.vue's accordion-content pattern. */
.accordion-content {
  padding: var(--spacer-base);
}

.accordion-content pre {
  overflow: auto;
  white-space: pre-wrap;
  margin: 0;
}
</style>
