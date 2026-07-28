/**
 * Shape of one Shopify product-sync run.
 *
 * Lives here rather than in the Pinia store so the views and composables that only need the TYPE
 * do not import the store module to get it — a type-only import still couples the file to a store
 * that is being retired.
 *
 * The run is a JOIN of three records, which is why it is shaped as three nested objects plus a
 * rolled-up status:
 *   - `systemMessage`   — the OMS message that triggered the sync (+ its errors)
 *   - `bulkOperation`   — what Shopify did, keyed by the message's `remoteMessageId`
 *   - `mdmLog`          — what the OMS imported, keyed by `systemMessageId`
 *
 * Fields are optional because a run is observable at every stage: a message exists before Shopify
 * has an operation, and an operation completes before any log exists. Every consumer must tolerate
 * the partial states — that is the normal case while a sync is in flight, not an edge case.
 * `useShopifyProductSyncRun` builds this from the cache.
 */

/** Ionic colour name used for the status chips. */
export type SyncStatusColor = "success" | "danger" | "primary" | "warning" | "medium";

export interface ShopifyProductSyncRunSystemMessage extends Record<string, any> {
  systemMessageId?: string;
  systemMessageTypeId?: string;
  systemMessageRemoteId?: string;
  statusId?: string;
  statusLabel?: string;
  statusColor?: SyncStatusColor | string;
  /** Raw SystemMessageError rows for this message; empty unless it failed. */
  systemMessageErrors?: any[];
  /** First non-empty `errorText` across those errors — what the run header shows. */
  errorText?: string;
  /** The produced request body; for Shopify bulk queries, the whole GraphQL mutation. */
  messageText?: string;
  initDate?: string | number;
  processedDate?: string | number;
  remoteMessageId?: string;
}

export interface ShopifyProductSyncRunBulkOperation {
  /** The Shopify gid, e.g. `gid://shopify/BulkOperation/7001295421693`. */
  id?: string;
  status?: string;
  statusLabel?: string;
  statusColor?: SyncStatusColor | string;
  /**
   * True when no operation record is available and the message's own status is standing in for it —
   * consumers use this to avoid presenting a message status as a Shopify status.
   */
  isStatusUnavailable?: boolean;
  objectCount?: number;
  rootObjectCount?: number;
  createdAt?: string | number;
  completedAt?: string | number;
  query?: string;
}

export interface ShopifyProductSyncRunMdmLog {
  /** `logId` of the DataManagerLog, absent until the import starts. */
  id?: string;
  statusId?: string;
  statusLabel?: string;
  statusColor?: SyncStatusColor | string;
  startDate?: string | number;
  endDate?: string | number;
  finishDateTime?: string | number;
  /** Both spellings occur across callers; the cache supplies whichever the log carried. */
  completedDate?: string | number;
  completedAt?: string | number;
  createdDate?: string | number;
  createdStamp?: string | number;
  lastUpdatedStamp?: string | number;
  totalRecordCount?: number;
  failedRecordCount?: number;
  successRecordCount?: number;
  configId?: string;
  logContentId?: string;
  fileName?: string;
}

export interface ShopifyProductSyncRun {
  systemMessageId?: string;
  systemMessage?: ShopifyProductSyncRunSystemMessage;
  bulkOperation?: ShopifyProductSyncRunBulkOperation;
  mdmLog?: ShopifyProductSyncRunMdmLog;
  /** The rolled-up status label: MDM log status wins, then bulk operation, then message. */
  status?: string;
  statusColor?: SyncStatusColor | string;
  /** Terminal: the import succeeded, failed, or was skipped as an empty operation. */
  completed?: boolean;
}
