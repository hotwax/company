export const PRODUCT_SYNC_IDS = {
  systemMessageType: {
    productUpdates: "BulkQueryShopifyProductUpdates",
    bulkOperationsFinish: "BulkOperationsFinish",
    shopifyWebhook: "ShopifyWebhook"
  },
  serviceJob: {
    productUpdates: "sync_ShopifyProductUpdates",
    sendBulkQuery: "send_ProducedBulkOperationSystemMessage_ShopifyBulkQuery",
    pollBulkOperation: "poll_ShopifyBulkOperationResult"
  },
  dataManagerConfig: {
    productSync: "SYNC_SHOPIFY_PRODUCT"
  },
  dataDocument: {
    systemMessageDataManagerLog: "SYSTEM_MESSAGE_DATA_MANAGER_LOG",
    dataManagerLogAndParameter: "DATA_MANAGER_LOG_AND_PARAMETER",
    productStoreProduct: "PRODUCT_STORE_PRODUCT",
    serviceJobParameter: "SERVICE_JOB_PARAMETER"
  },
  shopifyAccessScope: {
    none: "SHOP_NO_ACCESS",
    legacyReadWrite: "SHOP_RW_ACCESS",
    readWrite: "SHOP_READ_WRITE_ACCESS"
  },
  webhookTopic: {
    bulkOperationsFinish: "BULK_OPERATIONS_FINISH"
  }
} as const;

export type ProductSyncRunStatus =
  | "queued"
  | "running"
  | "importing"
  | "completed"
  | "cancelled"
  | "error";

export type ProductSyncDecisionReason =
  | "needs-initial-import"
  | "has-unsynced-updates"
  | "pending-request-exists"
  | "run-in-progress"
  | "blocked-by-access"
  | "blocked-by-paused-job"
  | "blocked-by-legacy-teardown"
  | "blocked-by-missing-artifact"
  | "up-to-date";

export interface ProductSyncStatusSnapshot {
  status?: string;
  systemMessageState?: string;
  logStatusId?: string;
  logId?: string;
  completed?: boolean;
}

export interface ProductSyncDecisionInput {
  hasWriteAccess?: boolean;
  lastSyncedAt?: string;
  unsyncedUpdateCount?: number | string;
  pendingRequestCount?: number | string;
  latestRunStatus?: ProductSyncRunStatus | string;
  syncJobPaused?: boolean;
  legacyTeardownRequired?: boolean;
  missingArtifactCount?: number | string;
}

export interface ProductSyncDecision {
  shouldSync: boolean;
  primaryReason: ProductSyncDecisionReason;
  reasons: ProductSyncDecisionReason[];
}

const COMPLETED_DATA_MANAGER_STATUSES = new Set([
  "dmlsfinished",
  "dmlsuccess",
  "dmlssuccess",
  "dmlfinished",
  "finished",
  "success"
]);

const ERROR_DATA_MANAGER_STATUSES = new Set([
  "dmlserror",
  "dmlerror",
  "error",
  "failed"
]);

const ACTIVE_DATA_MANAGER_STATUSES = new Set([
  "dmlsrunning",
  "dmlrunning",
  "dmlspending",
  "dmlpending",
  "running",
  "pending"
]);

const ACTIVE_RUN_STATUSES = new Set<ProductSyncRunStatus>(["queued", "running", "importing"]);

export function normalizeProductSyncStatusId(value = "") {
  return String(value || "").trim().toLowerCase().replace(/[_\-\s]/g, "");
}

export function getProductSyncJobName(shopId: string) {
  return `${PRODUCT_SYNC_IDS.serviceJob.productUpdates}_${String(shopId || "").trim()}`;
}

export function hasProductSyncWriteAccess(accessScopeEnumId: string) {
  return String(accessScopeEnumId || "").trim().toUpperCase() === PRODUCT_SYNC_IDS.shopifyAccessScope.readWrite;
}

export function getProductSyncRunStatus(snapshot: ProductSyncStatusSnapshot = {}): ProductSyncRunStatus {
  const explicitStatus = normalizeProductSyncStatusId(snapshot.status);
  if (explicitStatus === "queued") return "queued";
  if (explicitStatus === "running") return "running";
  if (explicitStatus === "importing") return "importing";
  if (explicitStatus === "error") return "error";
  if (explicitStatus === "cancelled" || explicitStatus === "canceled") return "cancelled";
  if (explicitStatus === "completed" || explicitStatus === "complete") return "completed";

  const logStatusId = normalizeProductSyncStatusId(snapshot.logStatusId);
  const systemMessageState = normalizeProductSyncStatusId(snapshot.systemMessageState);
  const hasLog = !!String(snapshot.logId || "").trim();

  if (ERROR_DATA_MANAGER_STATUSES.has(logStatusId)) return "error";
  if (COMPLETED_DATA_MANAGER_STATUSES.has(logStatusId)) return "completed";
  if (ACTIVE_DATA_MANAGER_STATUSES.has(logStatusId)) return "importing";

  if (systemMessageState === "smsgerror" || systemMessageState === "error") return "error";
  if (systemMessageState === "smsgcancelled" || systemMessageState === "smsgcanceled" || systemMessageState === "cancelled" || systemMessageState === "canceled") return "cancelled";
  if (hasLog && (systemMessageState === "smsgconfirmed" || systemMessageState === "smsgconsumed" || systemMessageState === "confirmed" || systemMessageState === "consumed")) {
    return "importing";
  }
  if (systemMessageState === "smsgconfirmed" || systemMessageState === "smsgconsumed" || systemMessageState === "confirmed" || systemMessageState === "consumed") {
    return "completed";
  }
  if (systemMessageState === "smsgreceived" || systemMessageState === "smsgconsuming" || systemMessageState === "received" || systemMessageState === "consuming") {
    return "importing";
  }
  if (systemMessageState === "smsgsent" || systemMessageState === "smsgsending" || systemMessageState === "sent" || systemMessageState === "sending") {
    return "running";
  }

  return "queued";
}

export function isProductSyncRunActive(status: ProductSyncRunStatus | string | undefined) {
  if (!status) return false;
  return ACTIVE_RUN_STATUSES.has(getProductSyncRunStatus({ status }));
}

function addReason(reasons: ProductSyncDecisionReason[], reason: ProductSyncDecisionReason, condition = true) {
  if (condition && !reasons.includes(reason)) reasons.push(reason);
}

export function getProductSyncDecision(input: ProductSyncDecisionInput = {}): ProductSyncDecision {
  const reasons: ProductSyncDecisionReason[] = [];
  const latestRunStatus = input.latestRunStatus ? getProductSyncRunStatus({ status: input.latestRunStatus }) : "";
  const pendingRequestCount = Number(input.pendingRequestCount || 0);
  const unsyncedUpdateCount = Number(input.unsyncedUpdateCount || 0);
  const missingArtifactCount = Number(input.missingArtifactCount || 0);

  addReason(reasons, "needs-initial-import", !input.lastSyncedAt && pendingRequestCount <= 0 && !latestRunStatus);
  addReason(reasons, "has-unsynced-updates", unsyncedUpdateCount > 0);
  addReason(reasons, "pending-request-exists", pendingRequestCount > 0);
  addReason(reasons, "run-in-progress", !!latestRunStatus && isProductSyncRunActive(latestRunStatus));
  addReason(reasons, "blocked-by-access", input.hasWriteAccess === false);
  addReason(reasons, "blocked-by-paused-job", !!input.syncJobPaused);
  addReason(reasons, "blocked-by-legacy-teardown", !!input.legacyTeardownRequired);
  addReason(reasons, "blocked-by-missing-artifact", missingArtifactCount > 0);

  if (!reasons.length) reasons.push("up-to-date");

  const primaryReason = [
    "blocked-by-access",
    "blocked-by-paused-job",
    "blocked-by-legacy-teardown",
    "blocked-by-missing-artifact",
    "pending-request-exists",
    "run-in-progress",
    "has-unsynced-updates",
    "needs-initial-import",
    "up-to-date"
  ].find((reason) => reasons.includes(reason as ProductSyncDecisionReason)) as ProductSyncDecisionReason;

  return {
    shouldSync: primaryReason === "has-unsynced-updates" || primaryReason === "needs-initial-import",
    primaryReason,
    reasons
  };
}
