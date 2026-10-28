<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button :default-href="'/shopify-connection-details/' + id + '/product-sync'" />
        </ion-buttons>
        <ion-title>{{ translate("Product sync history") }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-list lines="full">
        <ion-list-header>
          <ion-label>{{ translate("Filters") }}</ion-label>
        </ion-list-header>
        <ion-item>
          <ion-select
            :label="translate('System message status')"
            :value="filters.statusId"
            interface="popover"
            @ionChange="handleStatusFilterChange($event.detail.value)"
          >
            <ion-select-option value="">{{ translate("All statuses") }}</ion-select-option>
            <ion-select-option v-for="status in statusFilterOptions" :key="status.value" :value="status.value">
              {{ status.label }}
            </ion-select-option>
          </ion-select>
        </ion-item>
        <ion-item>
          <ion-select
            :label="translate('Sort')"
            :value="filters.sortOrder"
            interface="popover"
            @ionChange="handleSortOrderChange($event.detail.value)"
          >
            <ion-select-option v-for="sortOption in sortOptions" :key="sortOption.value" :value="sortOption.value">
              {{ sortOption.label }}
            </ion-select-option>
          </ion-select>
        </ion-item>
        <ion-item>
          <ion-input
            :label="translate('Created after')"
            type="datetime-local"
            :value="filters.createdAfter"
            @ionChange="handleCreatedAfterFilterChange($event.detail.value)"
          />
        </ion-item>
        <ion-item>
          <ion-input
            :label="translate('Created before')"
            type="datetime-local"
            :value="filters.createdBefore"
            @ionChange="handleCreatedBeforeFilterChange($event.detail.value)"
          />
        </ion-item>
      </ion-list>
      <ion-card v-if="isLoading">
        <ion-card-header>
          <ion-card-title>{{ translate("Loading product sync") }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-spinner name="crescent" />
        </ion-card-content>
      </ion-card>

      <ion-card v-else-if="loadErrorMessage">
        <ion-card-header>
          <ion-card-title>{{ translate("Product sync history could not load") }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <p>{{ loadErrorMessage }}</p>
          <ion-button fill="outline" @click="loadHistory">{{ translate("Retry") }}</ion-button>
        </ion-card-content>
      </ion-card>

      <shopify-product-sync-history-view
        v-else
        :runs="displayedRuns"
        @download-raw-file="downloadRawShopifyFile"
        @download-failed-records-file="downloadFailedRecordsFile"
      />

      <ion-infinite-scroll
        :disabled="!hasMoreHistory || isLoadingMore"
        @ionInfinite="loadMoreHistory"
      >
        <ion-infinite-scroll-content
          loading-spinner="crescent"
          :loading-text="translate('Loading more history')"
        />
      </ion-infinite-scroll>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonInfiniteScroll,
  IonInfiniteScrollContent,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  onIonViewWillEnter,
  IonPage,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTitle,
  IonToolbar
} from "@ionic/vue";
import { commonUtil, logger, translate } from '@common'
import { computed, defineProps, reactive, ref, watch } from "vue";
import ShopifyProductSyncHistoryView from "@/components/shopify-product-sync/ShopifyProductSyncHistoryView.vue";
import {
  isTerminalBulkOperation,
  systemMessageMayHaveErrors,
  useShopifyBulkOperations,
  useSystemMessage,
  useSystemMessageErrors,
  useSystemMessages,
} from "@/composables/useSystemMessage";
import { useShopifySyncContext, useShopifyShop } from "@/composables/useShopify";
import { useStatuses } from "@/composables/useSeed";
import { useDataManager } from "@/composables/useDataManager";
import { downloadTextFile, getDownloadFileContent, parseDateTimeValue } from '@/utils';
import {
  getSystemMessageTime,
  hasMoreForwardSystemMessagePages,
  shouldReadSystemMessagePagesBackwards,
  sortSystemMessagesNewestFirst
} from "@/utils/systemMessageHistory";
import { getSystemMessageBulkOperationId } from "@/utils/shopifyBulkOperation";

import { getRawShopifyFileName } from "@/utils/shopifyProductSyncWizard";
const props = defineProps(["id"]);
const { fetchSystemMessageLogDetailsPage, requestShopifyBulkOperation, requestSystemMessageErrors } = useSystemMessage();
const { downloadDataManagerFile, fetchLogDetails } = useDataManager();

const PAGE_SIZE = 25;
const PRODUCT_SYNC_MDM_CONFIG_ID = "SYNC_SHOPIFY_PRODUCT";
const PRODUCT_SYNC_MESSAGE_TYPE_ID = "BulkQueryShopifyProductUpdates";
/** Runs whose missing detail is requested at once, as the page's paging used to bound it. */
const DETAIL_REQUESTS_IN_FLIGHT = 3;

const isLoading = ref(true);
const isLoadingMore = ref(false);
const loadErrorMessage = ref("");
const pageIndex = ref(0);
const reversePageIndex = ref(-1);
const backendHistoryCount = ref(0);
const hasMoreBackendHistory = ref(false);
const historyPageMode = ref<"unknown" | "forward" | "reverse">("unknown");
const bufferedSystemMessages = ref<any[]>([]);
const systemMessageRemoteIds = ref<string[]>([]);
let historyLoadToken = 0;

interface ShopifyProductSyncHistoryRun {
  id: string;
  createdTime: any;
  systemMessageStatusId: string;
  systemMessageStatus: string;
  systemMessageStatusColor: string;
  systemMessageMessageText: string;
  systemMessageErrorText: string;
  bulkOperationId: string;
  bulkOperationStatus: string;
  bulkOperationStatusLabel: string;
  bulkOperationStatusColor: string;
  queryContent: string;
  objectCount: number;
  rootObjectCount: number;
  mdmImportId: string;
  mdmStatus: string;
  mdmStatusLabel: string;
  mdmStatusColor: string;
  totalRecordCount: number;
  failedRecordCount: number;
  mdmLogContentId: string;
  mdmErrorLogContentId: string;
  mdmLogConfigId: string;
  mdmLogFileName: string;
  loading?: boolean;
  /** The message as the history page returned it: what the run shows until a stored copy is read. */
  serverMessage?: any;
}

/** The runs the server's history pages returned, in page order. Their detail is joined below. */
const historyRuns = ref<ShopifyProductSyncHistoryRun[]>([]);
const filters = reactive({
  statusId: "",
  createdAfter: "",
  createdBefore: "",
  sortOrder: "newest"
});
const statusFilterOptions = [
  { value: "SmsgProduced", label: translate("Produced") },
  { value: "SmsgSent", label: translate("Sent") },
  { value: "SmsgReceived", label: translate("Received") },
  { value: "SmsgConsumed", label: translate("Consumed") },
  { value: "SmsgConfirmed", label: translate("Confirmed") },
  { value: "SmsgError", label: translate("Error") }
];
const sortOptions = [
  { value: "newest", label: translate("Newest first") },
  { value: "oldest", label: translate("Oldest first") }
];

const { record: shopRecord } = useShopifyShop(props.id);
const shop = computed<any>(() => shopRecord.value ?? {});
/**
 * The shop's remotes, resolved from the CACHE — no request, and no dependence on load order.
 *
 * This used to call `fetchShopSystemMessageRemoteId({ shopifyShopId: shop.value.shopifyShopId })`,
 * which threw "Shopify shop id is required to resolve SystemMessageRemote.remoteId" whenever the
 * view entered before the shop cache had hydrated — i.e. on every cold entry, leaving the page stuck
 * on an error card. The shop↔remote join is a local computation over two cached tables, so the only
 * thing to wait for is hydration.
 */
const { remoteIds: cachedRemoteIds, hydrated: shopContextHydrated } = useShopifySyncContext(() => props.id);
const { statusItems } = useStatuses();
const hasMoreHistory = computed(() => bufferedSystemMessages.value.length > 0 || hasMoreBackendHistory.value);

onIonViewWillEnter(() => {
  // Load as soon as the shop cache has emitted — instantly on a revisit, within a tick on a cold one.
  // NOT `watch(..., { immediate: true })` with a self-referencing `stop`: when the source is already
  // true the callback runs before `stop` is assigned and throws. See the same fix in ShopifyProductSync.
  if (shopContextHydrated.value) {
    void loadHistory();
  } else {
    const stop = watch(shopContextHydrated, (ready) => {
      if (!ready) return;
      stop();
      void loadHistory();
    });
  }
});

async function loadHistory() {
  const loadToken = ++historyLoadToken;
  isLoading.value = true;
  loadErrorMessage.value = "";
  try {
    if (isStaleHistoryLoad(loadToken)) return;

    systemMessageRemoteIds.value = cachedRemoteIds.value;
    if (!systemMessageRemoteIds.value.length) {
      throw new Error("Could not resolve systemMessageRemoteIds");
    }

    historyRuns.value = [];
    // A reloaded list asks again for what is still missing or unfinished; stored, finished detail asks nothing.
    requestedRunIds.clear();
    detailQueue.length = 0;
    settledRunIds.value = new Set();
    pageIndex.value = 0;
    reversePageIndex.value = -1;
    backendHistoryCount.value = 0;
    hasMoreBackendHistory.value = true;
    historyPageMode.value = "unknown";
    bufferedSystemMessages.value = [];
    await fetchHistoryPage(loadToken);
  } catch (error: any) {
    if (isStaleHistoryLoad(loadToken)) return;
    logger.error(error);
    loadErrorMessage.value = getErrorMessage(error, translate("Failed to load product sync history"));
    commonUtil.showToast(translate("Failed to load product sync history"));
    historyRuns.value = [];
    hasMoreBackendHistory.value = false;
  } finally {
    if (!isStaleHistoryLoad(loadToken)) isLoading.value = false;
  }
}

async function fetchHistoryPage(loadToken = historyLoadToken) {
  if (isStaleHistoryLoad(loadToken)) return;

  const systemMessages: any[] = [];

  bufferedSystemMessages.value = appendSystemMessagesToHistoryPage(systemMessages, bufferedSystemMessages.value);

  while (systemMessages.length < PAGE_SIZE && hasMoreBackendHistory.value) {
    if (isStaleHistoryLoad(loadToken)) return;

    const response = await fetchNextSystemMessagesResponse(loadToken);
    if (!response || isStaleHistoryLoad(loadToken)) return;

    const page = getSystemMessagesPage(response).filter(matchesCreatedDateFilters);

    bufferedSystemMessages.value = appendSystemMessagesToHistoryPage(systemMessages, page);
  }

  if (isStaleHistoryLoad(loadToken)) return;

  const nextRuns = systemMessages.map(getInitialHistoryRun);
  historyRuns.value = historyRuns.value.concat(nextRuns);
}

async function fetchNextSystemMessagesResponse(loadToken = historyLoadToken) {
  if (historyPageMode.value === "reverse") return fetchReverseSystemMessagesResponse(loadToken);

  const response = await fetchSystemMessagesResponse(pageIndex.value);
  if (isStaleHistoryLoad(loadToken)) return null;

  const page = getSystemMessagesPage(response);
  backendHistoryCount.value = getSystemMessagesCount(response, page);

  if (historyPageMode.value === "unknown") {
    historyPageMode.value = shouldReadPagesBackwards(page, backendHistoryCount.value) ? "reverse" : "forward";
    if (historyPageMode.value === "reverse") {
      reversePageIndex.value = Math.max(Math.ceil(backendHistoryCount.value / PAGE_SIZE) - 1, 0);
      return fetchReverseSystemMessagesResponse(loadToken);
    }
  }

  pageIndex.value += 1;
  hasMoreBackendHistory.value = hasMoreForwardSystemMessagePages(page, pageIndex.value, backendHistoryCount.value, PAGE_SIZE);

  return {
    ...response,
    systemMessageLogDetails: sortSystemMessagesBySelectedOrder(page)
  };
}

async function fetchReverseSystemMessagesResponse(loadToken = historyLoadToken) {
  const response = await fetchSystemMessagesResponse(reversePageIndex.value);
  if (isStaleHistoryLoad(loadToken)) return null;

  const page = getSystemMessagesPage(response);
  backendHistoryCount.value = getSystemMessagesCount(response, page);
  reversePageIndex.value -= 1;
  hasMoreBackendHistory.value = page.length > 0 && reversePageIndex.value >= 0;

  return {
    ...response,
    systemMessageLogDetails: sortSystemMessagesBySelectedOrder(page)
  };
}

async function fetchSystemMessagesResponse(index: number) {
  return fetchSystemMessageLogDetailsPage({
    ...getSystemMessageParams(),
    pageSize: PAGE_SIZE,
    pageIndex: Math.max(index, 0)
  });
}

function getSystemMessagesPage(response: any) {
  return response?.systemMessageLogDetails || [];
}

function getSystemMessagesCount(response: any, page: any[]) {
  return Number(response?.systemMessageLogDetailsCount || historyRuns.value.length + page.length);
}

function getSystemMessageParams() {
  const payload: any = {
    dataDocumentId: "SYSTEM_MESSAGE_DATA_MANAGER_LOG",
    customParametersMap: {
      systemMessageTypeId: PRODUCT_SYNC_MESSAGE_TYPE_ID,
      remoteInternalId: props.id,
      remoteInternalIdType: "HOTWAX_SHOP_ID",
      orderByField: getSystemMessageOrderByField()
    }
  };

  if (filters.statusId) payload.customParametersMap.statusId = filters.statusId;

  return payload;
}

function getSystemMessageOrderByField() {
  return filters.sortOrder === "oldest" ? "initDate" : "-initDate";
}

function sortSystemMessagesBySelectedOrder(systemMessages: any[]) {
  const sortedMessages = sortSystemMessagesNewestFirst(systemMessages);
  return filters.sortOrder === "oldest" ? sortedMessages.reverse() : sortedMessages;
}

function appendSystemMessagesToHistoryPage(target: any[], source: any[]) {
  if (!source.length) return [];

  const existingSystemMessageIds = new Set([
    ...historyRuns.value.map((run) => run.id),
    ...target.map((systemMessage) => systemMessage.systemMessageId)
  ]);
  const uniqueSource = source.filter((systemMessage) => {
    const systemMessageId = systemMessage?.systemMessageId;
    if (!systemMessageId || existingSystemMessageIds.has(systemMessageId)) return false;
    existingSystemMessageIds.add(systemMessageId);
    return true;
  });

  const remainingCount = PAGE_SIZE - target.length;
  if (remainingCount <= 0) return uniqueSource;

  target.push(...uniqueSource.slice(0, remainingCount));
  return uniqueSource.slice(remainingCount);
}

function isStaleHistoryLoad(loadToken: number) {
  return loadToken !== historyLoadToken;
}

function shouldReadPagesBackwards(page: any[], totalCount: number) {
  if (filters.sortOrder === "newest") {
    return shouldReadSystemMessagePagesBackwards(page, totalCount, PAGE_SIZE);
  }
  if (totalCount <= PAGE_SIZE || page.length < 2) return false;
  return getSystemMessageTime(page[0]) >= getSystemMessageTime(page[page.length - 1]);
}

function matchesCreatedDateFilters(systemMessage: any) {
  const createdTime = getSystemMessageTime(systemMessage);
  const createdAfter = getFilterTimestamp(filters.createdAfter);
  const createdBefore = getFilterTimestamp(filters.createdBefore);

  if (createdAfter && createdTime < createdAfter) return false;
  if (createdBefore && createdTime > createdBefore) return false;
  return true;
}

function getFilterTimestamp(value: string) {
  if (!value) return 0;
  return parseDateTimeValue(value)?.toMillis() || 0;
}

function getInitialHistoryRun(msg: any) {
  const bulkOperationId = getSystemMessageBulkOperationId(msg);
  return {
    id: msg.systemMessageId,
    createdTime: msg.initDate,
    systemMessageStatusId: msg.statusId || "",
    systemMessageStatus: getStatusLabel(msg.statusId),
    systemMessageStatusColor: getStatusColor(msg.statusId),
    systemMessageMessageText: String(msg.messageText || "").trim(),
    systemMessageErrorText: "",
    bulkOperationId,
    bulkOperationStatus: bulkOperationId ? "pending" : "",
    bulkOperationStatusLabel: bulkOperationId ? translate("Pending") : translate("Not started"),
    bulkOperationStatusColor: "medium",
    queryContent: getRunQueryContent(msg),
    objectCount: 0,
    rootObjectCount: 0,
    mdmImportId: msg.logId || '',
    mdmStatus: msg.logStatusId || "pending",
    mdmStatusLabel: getStatusLabel(msg.logStatusId),
    mdmStatusColor: getStatusColor(msg.logStatusId),
    totalRecordCount: Number(msg.totalRecordCount || 0),
    failedRecordCount: Number(msg.failedRecordCount || 0),
    mdmLogContentId: msg.logContentId || msg.logFileContentId || msg.uploadFileContentId || msg.exportFileContentId || "",
    mdmErrorLogContentId: msg.errorLogContentId || "",
    mdmLogConfigId: msg.configId || PRODUCT_SYNC_MDM_CONFIG_ID,
    mdmLogFileName: msg.fileName || msg.logFileName || msg.configDescription || "",
    serverMessage: msg
  };
}

// ---------------------------------------------------------------------------------------------
// Run detail — joined live from the stored message, its errors and its Shopify bulk operation, so a
// run still in flight when the page opened shows its result once the worker stores it.
// ---------------------------------------------------------------------------------------------

const { records: storedMessages } = useSystemMessages(undefined, { systemMessageTypeId: PRODUCT_SYNC_MESSAGE_TYPE_ID });
const { errors: storedErrors, hydrated: errorsHydrated } = useSystemMessageErrors();
const { records: storedOperations, hydrated: operationsHydrated } = useShopifyBulkOperations();

const messagesById = computed(() => new Map(storedMessages.value.map((message: any) => [String(message.systemMessageId), message])));
const operationsById = computed(() => new Map(storedOperations.value.map((operation: any) => [String(operation.id), operation])));
const errorsByMessageId = computed(() => {
  const byMessage = new Map<string, any[]>();
  for (const error of storedErrors.value) {
    const systemMessageId = String(error?.systemMessageId ?? "");
    if (systemMessageId) byMessage.set(systemMessageId, [...(byMessage.get(systemMessageId) ?? []), error]);
  }
  return byMessage;
});

/** Runs whose missing detail has been asked for and answered (or failed), or needed none: their spinner stops. */
const settledRunIds = ref(new Set<string>());

const displayedRuns = computed<ShopifyProductSyncHistoryRun[]>(() => historyRuns.value.map((run) => {
  if (!run.bulkOperationId) return run;

  const message = messagesById.value.get(run.id) ?? run.serverMessage;
  const operation: any = operationsById.value.get(run.bulkOperationId);
  const errors = systemMessageMayHaveErrors(message) ? errorsByMessageId.value.get(run.id) ?? [] : [];
  const isSkipped = operation?.status === "COMPLETED" && Number(operation?.objectCount || 0) === 0;
  const mdmStatus = run.mdmStatus === "pending" && isSkipped ? "skipped" : run.mdmStatus;

  return {
    ...run,
    systemMessageStatusId: message?.statusId || run.systemMessageStatusId,
    systemMessageStatus: getStatusLabel(message?.statusId),
    systemMessageStatusColor: getStatusColor(message?.statusId),
    systemMessageMessageText: String(message?.messageText || run.systemMessageMessageText || "").trim(),
    systemMessageErrorText: getSystemMessageErrorText(errors),
    bulkOperationId: operation?.id || run.bulkOperationId,
    bulkOperationStatus: operation?.status || run.bulkOperationStatus,
    bulkOperationStatusLabel: operation?.status ? getStatusLabel(operation.status) : run.bulkOperationStatusLabel,
    bulkOperationStatusColor: operation?.status ? getStatusColor(operation.status) : run.bulkOperationStatusColor,
    queryContent: operation?.query || run.queryContent,
    objectCount: Number(operation?.objectCount || 0),
    rootObjectCount: Number(operation?.rootObjectCount || 0),
    mdmStatus,
    mdmStatusLabel: getStatusLabel(mdmStatus),
    mdmStatusColor: getStatusColor(mdmStatus),
    loading: !settledRunIds.value.has(run.id),
  };
}));

/** Runs already queued for their missing detail, so a re-render or a reload of the list asks nothing. */
const requestedRunIds = new Set<string>();
const detailQueue: ShopifyProductSyncHistoryRun[] = [];
let detailRequestsInFlight = 0;

function drainDetailQueue() {
  while (detailRequestsInFlight < DETAIL_REQUESTS_IN_FLIGHT && detailQueue.length) {
    const run = detailQueue.shift()!;
    detailRequestsInFlight++;
    void requestRunDetail(run).finally(() => {
      detailRequestsInFlight--;
      settledRunIds.value = new Set(settledRunIds.value).add(run.id);
      drainDetailQueue();
    });
  }
}

/** Ask for what the stored rows lack: the errors of a message that may have some, and an unfinished operation. */
async function requestRunDetail(run: ShopifyProductSyncHistoryRun) {
  const message = messagesById.value.get(run.id) ?? run.serverMessage;
  const operation: any = operationsById.value.get(run.bulkOperationId);
  const systemMessageRemoteId = message?.systemMessageRemoteId;

  await Promise.all([
    systemMessageMayHaveErrors(message) && !errorsByMessageId.value.get(run.id)?.length
      ? requestSystemMessageErrors(run.id).catch(() => undefined)
      : undefined,
    systemMessageRemoteId && !isTerminalBulkOperation(operation?.status)
      ? requestShopifyBulkOperation(run.bulkOperationId, systemMessageRemoteId).catch((error) => {
        logger.error(`Failed to load the Shopify bulk operation for product sync history run ${run.id}`, error);
      })
      : undefined,
  ]);
}

// Before a table's first read every row looks missing; deciding then would request them all.
watch([historyRuns, errorsHydrated, operationsHydrated], ([runs, errorsReady, operationsReady]) => {
  if (!errorsReady || !operationsReady) return;
  for (const run of runs) {
    if (!run.bulkOperationId || requestedRunIds.has(run.id)) continue;
    requestedRunIds.add(run.id);
    detailQueue.push(run);
  }
  drainDetailQueue();
}, { immediate: true });

function getSystemMessageErrorText(systemMessageErrors: any[]) {
  const errors = Array.isArray(systemMessageErrors) ? systemMessageErrors : [];

  for (const error of errors) {
    const errorText = String(error?.errorText || "").trim();
    if (errorText) return errorText;
  }

  return "";
}

function getStatusColor(status: string) {
  if (!status) return "medium";
  const normalizedStatus = String(status).toLowerCase();
  if (normalizedStatus.includes("success") ||
    normalizedStatus.includes("complete") ||
    normalizedStatus.includes("finished") ||
    normalizedStatus.includes("confirmed") ||
    normalizedStatus.includes("consumed") ||
    normalizedStatus === "dmlsfinished") return "success";
  if (normalizedStatus.includes("error") ||
    normalizedStatus.includes("failed") ||
    normalizedStatus.includes("crashed") ||
    normalizedStatus.includes("cancel")) return "danger";
  if (normalizedStatus.includes("running") ||
    normalizedStatus.includes("sent") ||
    normalizedStatus.includes("produced") ||
    normalizedStatus.includes("queued") ||
    normalizedStatus.includes("smsg") ||
    normalizedStatus.includes("dmls")) return "primary";
  if (normalizedStatus.includes("skipped")) return "warning";
  return "medium";
}

function getRunQueryContent(systemMessage: any) {
  return systemMessage?.messageText ||
    systemMessage?.messageJson ||
    systemMessage?.messageData ||
    systemMessage?.payload ||
    "";
}

function getStatusLabel(status: string) {
  if (!status) return translate("Pending");
  // Cached `statusItems` maps statusId → description directly (the store held objects).
  const description = statusItems.value[status];
  if (description) return description;

  const normalizedStatus = String(status).toLowerCase();
  if (normalizedStatus === "completed") return translate("Complete");
  if (normalizedStatus === "failed") return translate("Failed");
  if (normalizedStatus === "canceled" || normalizedStatus === "cancelled") return translate("Cancelled");
  if (normalizedStatus === "skipped") return translate("Skipped");
  return status;
}

/** Keeps a file's details fetched on download, so a second download does not ask again. */
function updateHistoryRun(runId: string, updates: Partial<ShopifyProductSyncHistoryRun>) {
  const runIndex = historyRuns.value.findIndex((run) => run.id === runId);
  if (runIndex === -1) return;
  historyRuns.value[runIndex] = {
    ...historyRuns.value[runIndex],
    ...updates
  };
}

async function loadMoreHistory(event: CustomEvent) {
  if (!hasMoreHistory.value || isLoadingMore.value) {
    await completeInfiniteScroll(event);
    return;
  }

  isLoadingMore.value = true;
  const loadToken = historyLoadToken;
  const previousRunCount = historyRuns.value.length;
  try {
    await fetchHistoryPage(loadToken);
  } catch (error: any) {
    if (isStaleHistoryLoad(loadToken)) return;
    logger.error(error);
    historyRuns.value = historyRuns.value.slice(0, previousRunCount);
    commonUtil.showToast(translate("Failed to load product sync history"));
    hasMoreBackendHistory.value = false;
  } finally {
    isLoadingMore.value = false;
    await completeInfiniteScroll(event);
  }
}

async function completeInfiniteScroll(event: CustomEvent) {
  const target = event.target as any;
  await target.complete();
}

async function downloadRawShopifyFile(run: ShopifyProductSyncHistoryRun) {
  try {
    const downloadableRun = await getDownloadableHistoryRun(run);
    if (!downloadableRun?.mdmLogConfigId || !downloadableRun?.mdmLogContentId) {
      commonUtil.showToast(translate("Raw Shopify file is not available"));
      return;
    }

    const response = await downloadDataManagerFile(downloadableRun.mdmLogConfigId, downloadableRun.mdmLogContentId);
    const fileContent = getDownloadFileContent(response?.data);

    if (!fileContent) {
      throw new Error("No Data Manager file content returned");
    }

    downloadTextFile(fileContent, getRawShopifyFileName(downloadableRun));
    commonUtil.showToast(translate("File downloaded successfully"));
  } catch (error) {
    logger.error(`Failed to download raw Shopify file for message ${run.id}`, error);
    commonUtil.showToast(translate("Failed to download raw Shopify file"));
  }
}

async function downloadFailedRecordsFile(run: ShopifyProductSyncHistoryRun) {
  try {
    const downloadableRun = await getDownloadableHistoryRun(run);
    if (!downloadableRun?.mdmLogConfigId || !downloadableRun?.mdmErrorLogContentId) {
      commonUtil.showToast(translate("Failed records file is not available"));
      return;
    }

    const response = await downloadDataManagerFile(downloadableRun.mdmLogConfigId, downloadableRun.mdmErrorLogContentId);
    const fileContent = getDownloadFileContent(response?.data);

    if (!fileContent) {
      throw new Error("No failed records file content returned");
    }

    downloadTextFile(fileContent, getFailedRecordsFileName(downloadableRun));
    commonUtil.showToast(translate("File downloaded successfully"));
  } catch (error) {
    logger.error(`Failed to download failed records file for message ${run.id}`, error);
    commonUtil.showToast(translate("Failed to download failed records file"));
  }
}

async function getDownloadableHistoryRun(run: ShopifyProductSyncHistoryRun) {
  if (run?.mdmLogConfigId && (run?.mdmLogContentId || run?.mdmErrorLogContentId)) return run;
  if (!run?.mdmImportId) return run;

  const logDetails = await fetchLogDetails(run.mdmImportId);
  const updatedRun = {
    ...run,
    mdmLogConfigId: logDetails?.configId || run.mdmLogConfigId,
    mdmLogContentId: logDetails?.logContentId ||
      logDetails?.logFileContentId ||
      logDetails?.uploadFileContentId ||
      logDetails?.exportFileContentId ||
      run.mdmLogContentId,
    mdmErrorLogContentId: logDetails?.errorLogContentId || run.mdmErrorLogContentId,
    mdmLogFileName: logDetails?.fileName || logDetails?.logFileName || run.mdmLogFileName
  };
  updateHistoryRun(run.id, updatedRun);
  return updatedRun;
}

function getFailedRecordsFileName(run: ShopifyProductSyncHistoryRun) {
  const baseName = String(run?.mdmLogFileName || run?.id || "failed-records").trim();
  const sanitizedBaseName = baseName.replace(/\.(json|jsonl|csv|txt)$/i, "");
  return `${sanitizedBaseName}-failed-records.csv`;
}

function getErrorMessage(error: any, defaultMessage: string) {
  const message = error?.response?.data?.error ||
    error?.response?.data?.errors ||
    error?.data?.error ||
    error?.message ||
    defaultMessage;
  return typeof message === "string" ? message : JSON.stringify(message);
}

async function handleStatusFilterChange(value: string) {
  filters.statusId = value || "";
  await loadHistory();
}

async function handleCreatedAfterFilterChange(value: any) {
  filters.createdAfter = String(value || "");
  await loadHistory();
}

async function handleCreatedBeforeFilterChange(value: any) {
  filters.createdBefore = String(value || "");
  await loadHistory();
}

async function handleSortOrderChange(value: string) {
  filters.sortOrder = value === "oldest" ? "oldest" : "newest";
  await loadHistory();
}
</script>
