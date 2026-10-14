/**
 * PRODUCT SYNC MIGRATION (Upgrade Assistant) — composable module.
 *
 * Moved wholesale from `store/shopifyProductSyncMigration.ts`, which — like the retired
 * `shopifyProductSync` store — was a Pinia store in name only: `state: () => ({})` and an actions
 * block of one-line delegates to these module functions. Nothing here holds state; every function is
 * a live read or mutation against the OMS, which is correct for a one-shot migration assistant.
 *
 * Kept as its OWN composable rather than folded into `useShopify`: the assistant is a bounded,
 * removable feature (it dies when every shop is on the new sync), and burying 1,100 lines of legacy
 * teardown logic in the everyday Shopify composable would outlive its usefulness.
 *
 * Message types, service jobs and remotes are synced tables, so nothing here reads them: the screen
 * hands its live rows in as a `MigrationCatalog`, and recomputes what depends on them as they change
 * (`withCatalog`). What only the server knows — eligibility, configs, documents, legacy messages —
 * is still asked for.
 */
import { useMaargConfig } from "@/composables/useSeed";
import { refreshAfterMutation, resyncDomain } from "@/services/appDbSync";
import { api, logger } from '@common'
import { PRODUCT_SYNC_MIGRATION_CONFIG, isProductSyncMigrationEligibleRelease } from "@/config/productSyncMigration";
// Both moved to the Shopify composable when `store/shopifyProductSync` was retired; the `*Internal`
// suffix went with it, since these are no longer a store's private helpers.
import { fetchShopSystemMessageRemoteId, fetchSyncJobConfig } from "@/composables/useShopify";
import { DateTime } from "luxon";

export type ProductSyncMigrationEntryAction = "current" | "setup" | "request-upgrade";

export interface ProductSyncMigrationTeardownStep {
  kind: "type" | "job" | "message";
  id: string;
  label: string;
  status: "processing" | "done" | "skipped" | "failed";
  error?: string;
}

/** The synced rows the migration reads, as the screen's live reads hold them. */
export interface MigrationCatalog {
  systemMessageTypes: any[];
  serviceJobs: any[];
  systemMessageRemotes: any[];
}

/** Read on every use, so a step taken after a write sees the rows the write's refresh stored. */
export type MigrationCatalogSource = () => MigrationCatalog;

export interface ProductSyncMigrationTeardownResult {
  failedSteps: ProductSyncMigrationTeardownStep[];
  legacySystemMessageTypes: ProductSyncMigrationLegacyItem[];
  legacyServiceJobs: ProductSyncMigrationLegacyItem[];
  legacySystemMessages: ProductSyncMigrationLegacyItem[];
  legacySystemMessagesTotalCount: number;
  legacySystemMessageRemoteIds: string[];
  legacyDynamicServiceJobNames: string[];
}

export interface ProductSyncMigrationEligibility {
  componentRelease: string;
  minimumComponentRelease: string;
  isEligible: boolean;
}

export interface ProductSyncMigrationArtifactCheck {
  id: string;
  label: string;
  status: "verified" | "missing" | "checking";
  note: string;
  isPaused?: boolean;
  jobDetail?: any;
}

export interface ProductSyncMigrationLegacyItem {
  id: string;
  label: string;
  status: "active" | "partial" | "deprecated" | "deactivated" | "cancelled" | "terminal" | "missing" | "failed" | "checking";
  note: string;
  systemMessageTypeId?: string;
  remoteMessageId?: string;
  systemMessageRemoteId?: string;
}

export interface ProductSyncMigrationAssistantState {
  componentRelease: string;
  minimumComponentRelease: string;
  isEligible: boolean | null;
  hasNewProductSyncMessages: boolean | null;
  systemMessageRemoteId: string;
  legacySystemMessageRemoteIds: string[];
  legacySystemMessagesTotalCount: number;
  syncJobConfigured: boolean | null;
  syncJobName: string;
  artifactChecks: ProductSyncMigrationArtifactCheck[];
  legacySystemMessageTypes: ProductSyncMigrationLegacyItem[];
  legacyServiceJobs: ProductSyncMigrationLegacyItem[];
  legacySystemMessages: ProductSyncMigrationLegacyItem[];
  /** This shop's per-shop legacy jobs, found on the server; their state is read from the catalog. */
  legacyDynamicServiceJobNames: string[];
}

export function isActionableLegacyItem(item: ProductSyncMigrationLegacyItem, kind: "type" | "job" | "message") {
  if (kind === "message") {
    return item.status === "active";
  }

  return item.status === "active" || item.status === "partial";
}

function getShopId(payload: any) {
  return String(payload?.shopId || payload?.id || payload?.shop?.shopId || "").trim();
}

function buildDeprecatedLabel(value: string, fallback: string) {
  const normalizedValue = String(value || fallback || "").trim();
  if (!normalizedValue) return "Deprecated";
  if (/deprecated/i.test(normalizedValue)) return normalizedValue;
  return `${normalizedValue} [Deprecated]`;
}

function hasDeprecatedLabel(value: string) {
  return /deprecated/i.test(String(value || "").trim());
}

function getDisplayLabel(fallback: string, description: string) {
  return String(description || fallback || "").trim() || fallback;
}

function normalizeStatusId(value: string) {
  return String(value || "").trim().toLowerCase();
}

function isTerminalLegacyMessageStatus(statusId: string) {
  const normalizedStatusId = normalizeStatusId(statusId);
  return normalizedStatusId === "smsgconfirmed" ||
    normalizedStatusId === "confirmed" ||
    normalizedStatusId === "smsgconsumed" ||
    normalizedStatusId === "consumed" ||
    normalizedStatusId === "smsgsent" ||
    normalizedStatusId === "sent";
}

function getLegacySystemMessageLabel(message: any) {
  return String(message?.systemMessageTypeId || message?.systemMessageId || "Legacy system message").trim();
}

function formatLegacyDateTime(value: any) {
  if (value === undefined || value === null || value === "") return "";

  const normalizedValue = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  const candidates = [
    typeof normalizedValue === "number" ? DateTime.fromMillis(normalizedValue) : DateTime.invalid("unsupported"),
    DateTime.fromISO(String(value)),
    DateTime.fromSQL(String(value)),
    DateTime.fromJSDate(new Date(value))
  ];
  const dateTime = candidates.find((candidate) => candidate.isValid);

  return dateTime ? dateTime.toLocaleString(DateTime.DATETIME_MED) : "";
}

export function describeLegacySystemMessageTypeState(systemMessageTypeId: string, systemMessageType: any): ProductSyncMigrationLegacyItem {
  if (!systemMessageType?.systemMessageTypeId) {
    return {
      id: systemMessageTypeId,
      label: systemMessageTypeId,
      status: "missing",
      note: "This legacy system message type is not present."
    };
  }

  const label = getDisplayLabel(systemMessageTypeId, systemMessageType.description);
  const sendServiceName = String(systemMessageType.sendServiceName || "").trim();
  const consumeServiceName = String(systemMessageType.consumeServiceName || "").trim();
  const fileHandlingFields = [
    systemMessageType.sendPath,
    systemMessageType.receivePath,
    systemMessageType.receiveMovePath,
    systemMessageType.receiveFilePattern,
    systemMessageType.receiveResponseEnumId
  ].filter((value: string) => String(value || "").trim());
  const hasExecutionFields = !!(sendServiceName || consumeServiceName || fileHandlingFields.length);
  const nameDeprecated = hasDeprecatedLabel(systemMessageType.description);

  let status: ProductSyncMigrationLegacyItem["status"] = "active";
  if (!hasExecutionFields && nameDeprecated) {
    status = "deprecated";
  } else if (!hasExecutionFields || nameDeprecated) {
    status = "partial";
  }

  const stateParts = [
    sendServiceName ? `Send service still points to ${sendServiceName}.` : "Send service cleared.",
    consumeServiceName ? `Consume service still points to ${consumeServiceName}.` : "Consume service cleared.",
    fileHandlingFields.length ? "File handling is still configured." : "File handling cleared.",
    nameDeprecated ? "Name is marked deprecated." : "Name still needs a deprecated label."
  ];

  return {
    id: systemMessageTypeId,
    label,
    status,
    note: stateParts.join(" ")
  };
}

export function describeLegacyServiceJobState(jobDetail: any): ProductSyncMigrationLegacyItem {
  const jobName = String(jobDetail?.jobName || "").trim();
  if (!jobName) {
    return {
      id: "",
      label: "",
      status: "missing",
      note: "This legacy service job is not present."
    };
  }

  const label = getDisplayLabel(jobName, jobDetail.description);
  const paused = String(jobDetail.paused || "").toUpperCase() === "Y";
  const serviceName = String(jobDetail.serviceName || "").trim();
  const serviceConfigured = !!serviceName && serviceName !== "_NA_";

  let status: ProductSyncMigrationLegacyItem["status"] = "active";
  if (paused && !serviceConfigured) {
    status = "deactivated";
  } else if (paused || !serviceConfigured) {
    status = "partial";
  }

  const stateParts = [
    paused ? "Job is paused." : "Job is still scheduled.",
    serviceConfigured ? `Service still points to ${serviceName}.` : "Service is cleared."
  ];

  return {
    id: jobName,
    label,
    status,
    note: stateParts.join(" ")
  };
}

export function buildLegacySystemMessageItem(systemMessage: any): ProductSyncMigrationLegacyItem | null {
  const statusId = String(systemMessage?.statusId || "").trim();
  const normalizedStatusId = normalizeStatusId(statusId);

  if (normalizedStatusId.includes("cancel") || isTerminalLegacyMessageStatus(statusId)) {
    return null;
  }

  const formattedInitDate = formatLegacyDateTime(systemMessage?.initDate);

  return {
    id: String(systemMessage?.systemMessageId || "").trim(),
    label: getLegacySystemMessageLabel(systemMessage),
    status: "active",
    note: `${statusId || "Unknown status"}${formattedInitDate ? `, ${formattedInitDate}` : ""}`,
    systemMessageTypeId: systemMessage?.systemMessageTypeId,
    remoteMessageId: systemMessage?.remoteMessageId,
    systemMessageRemoteId: systemMessage?.systemMessageRemoteId
  };
}

async function fetchMaargInfo() {
  // Server config properties, held in localStorage — read once per session, not per check.
  const maarg = useMaargConfig();
  await maarg.load();
  if (!maarg.config.value) throw new Error("Maarg version response is unavailable.");
  return maarg.config.value;
}

export async function fetchEligibility(): Promise<ProductSyncMigrationEligibility> {
  const maargInfo = await fetchMaargInfo();
  const componentRelease = String(maargInfo?.instanceInfo?.componentRelease || "").trim();

  return {
    componentRelease,
    minimumComponentRelease: PRODUCT_SYNC_MIGRATION_CONFIG.minimumComponentRelease,
    isEligible: isProductSyncMigrationEligibleRelease(componentRelease)
  };
}

const findSystemMessageType = (catalog: MigrationCatalog, systemMessageTypeId: string) =>
  catalog.systemMessageTypes.find((row: any) => row.systemMessageTypeId === systemMessageTypeId);

/** The job as the `serviceJob` domain stores it: `jobName`, `paused`, service and parameters. */
const findServiceJob = (catalog: MigrationCatalog, jobName: string) =>
  catalog.serviceJobs.find((row: any) => row.jobName === jobName);

async function fetchDataManagerConfigEntity(configId: string) {
  const response = await api({
    url: `admin/dataManager/${encodeURIComponent(configId)}`,
    method: "GET"
  }) as any;

  return response?.data;
}

/** A required job: verified when the catalog holds it. The catalog is a full snapshot, so a miss is real. */
function serviceJobCheck(catalog: MigrationCatalog, jobName: string, label: string, note: string): ProductSyncMigrationArtifactCheck {
  const jobDetail = findServiceJob(catalog, jobName);

  return {
    id: jobName,
    label,
    status: jobDetail?.jobName ? "verified" : "missing",
    note,
    isPaused: jobDetail?.paused === "Y",
    jobDetail
  };
}

function systemMessageTypeCheck(catalog: MigrationCatalog, systemMessageTypeId: string, label: string, note: string): ProductSyncMigrationArtifactCheck {
  return {
    id: systemMessageTypeId,
    label,
    status: findSystemMessageType(catalog, systemMessageTypeId)?.systemMessageTypeId ? "verified" : "missing",
    note
  };
}

async function fetchDataManagerConfigCheck(configId: string, label: string, note: string): Promise<ProductSyncMigrationArtifactCheck> {
  try {
    const config = await fetchDataManagerConfigEntity(configId);

    return {
      id: configId,
      label,
      status: config?.configId ? "verified" : "missing",
      note
    };
  } catch (error) {
    logger.warn(`Failed to verify data manager config ${configId}`, error);
    return {
      id: configId,
      label,
      status: "missing",
      note
    };
  }
}

async function fetchDataDocumentCheck(dataDocumentId: string, label: string, note: string): Promise<ProductSyncMigrationArtifactCheck> {
  try {
    // Attempt a minimal query to verify document existence
    await api({
      url: "oms/dataDocumentView",
      method: "POST",
      data: {
        dataDocumentId,
        pageSize: 0
      }
    });

    return {
      id: dataDocumentId,
      label,
      status: "verified",
      note
    };
  } catch (error) {
    logger.warn(`Failed to verify data document ${dataDocumentId}`, error);
    return {
      id: dataDocumentId,
      label,
      status: "missing",
      note
    };
  }
}

async function fetchLegacySystemMessageRemoteIds(payload: any, catalog: MigrationCatalog) {
  try {
    const systemMessageRemoteIds = await fetchShopSystemMessageRemoteId({
      shopId: payload?.shopId,
      shop: payload?.shop,
      remotes: catalog.systemMessageRemotes,
      returnAllSystemMessageRemoteIds: true
    });

    return Array.isArray(systemMessageRemoteIds) ? systemMessageRemoteIds : [];
  } catch (error) {
    logger.warn("Failed to resolve legacy system message remotes for product sync migration", error);
    return [];
  }
}

const LEGACY_BULK_QUERY_TYPE_TERM = "BulkProductAndVariantsByIdQuery";

/** The shared artifacts the new sync needs. Job and type checks read the catalog; the rest ask the server. */
const ARTIFACT_CHECK_DEFINITIONS: Array<{ id: string; type: "job" | "systemMessageType" | "dataManagerConfig" | "dataDocument"; label: string; note: string }> = [
  { id: PRODUCT_SYNC_MIGRATION_CONFIG.incoming.serviceJobs.baseSync, type: "job", label: "Base sync job", note: "Shared template job required before the app can configure a per-shop sync." },
  { id: PRODUCT_SYNC_MIGRATION_CONFIG.incoming.serviceJobs.send, type: "job", label: "Send produced messages job", note: "Shared sender for new product sync system messages." },
  { id: PRODUCT_SYNC_MIGRATION_CONFIG.incoming.serviceJobs.poll, type: "job", label: "Poll bulk operation results job", note: "Shared poller for completed Shopify bulk query results." },
  { id: PRODUCT_SYNC_MIGRATION_CONFIG.incoming.systemMessageTypes.productSync, type: "systemMessageType", label: "New product sync message type", note: "Required message type for the bulk-query product sync flow." },
  { id: PRODUCT_SYNC_MIGRATION_CONFIG.incoming.dataManagerConfig, type: "dataManagerConfig", label: "Data manager config", note: "Required config for processing imported Shopify product sync files." },
  { id: PRODUCT_SYNC_MIGRATION_CONFIG.incoming.dataDocuments[0], type: "dataDocument", label: "Service job parameters document", note: "Required for verifying per-shop sync job configuration via Data Document." },
  { id: PRODUCT_SYNC_MIGRATION_CONFIG.incoming.dataDocuments[1], type: "dataDocument", label: "Data manager logs document", note: "Required for tracking sync progress and error counts via Data Document." },
  { id: PRODUCT_SYNC_MIGRATION_CONFIG.incoming.dataDocuments[2], type: "dataDocument", label: "Product store counts document", note: "Required for preflight checks and catalog metrics via Data Document." }
];

/** The legacy bulk-query types: a contains match over the catalog, as the server's bare `like` is. */
function legacySystemMessageTypeIds(catalog: MigrationCatalog): string[] {
  const dynamicTypes = catalog.systemMessageTypes
    .map((row: any) => String(row.systemMessageTypeId || "").trim())
    .filter((typeId: string) => typeId.includes(LEGACY_BULK_QUERY_TYPE_TERM));

  return [...new Set([...PRODUCT_SYNC_MIGRATION_CONFIG.outgoing.systemMessageTypes, ...dynamicTypes])];
}

function legacySystemMessageTypeState(catalog: MigrationCatalog): ProductSyncMigrationLegacyItem[] {
  return legacySystemMessageTypeIds(catalog).map((systemMessageTypeId) =>
    describeLegacySystemMessageTypeState(systemMessageTypeId, findSystemMessageType(catalog, systemMessageTypeId)));
}

/** This shop's per-shop legacy jobs: the server document is the only place their parameters are searchable. */
async function fetchDynamicLegacyServiceJobNames(systemMessageRemoteIds: string[]): Promise<string[]> {
  try {
    const response = await api({
      url: "oms/dataDocumentView",
      method: "post",
      data: {
        dataDocumentId: "SERVICE_JOB_PARAMETER",
        customParametersMap: {
          jobName: "%queue_BulkQuerySystemMessage_BulkProductAndVariantsById%",
          jobName_op: "like"
        },
        pageSize: 250
      }
    }) as any;

    const rows = Array.isArray(response?.data?.entityValueList) ? response.data.entityValueList : [];

    const jobsMap: Record<string, any[]> = {};
    for (const row of rows) {
      const name = String(row?.jobName || "").trim();
      if (!name) continue;
      if (!jobsMap[name]) jobsMap[name] = [];
      jobsMap[name].push(row);
    }

    const matchedJobNames: string[] = [];

    for (const [jobName, jobRows] of Object.entries(jobsMap)) {
      const params: Record<string, string> = {};
      for (const row of jobRows) {
        const paramName = String(row?.parameterName || "").trim();
        const paramValue = String(row?.parameterValue || "").trim();
        if (paramName) {
          params[paramName] = paramValue;
        }
      }

      const typeValue = params["systemMessageTypeId"] || "";
      const remoteValue = params["systemMessageRemoteId"] || "";

      const matchesType = typeValue && typeValue.includes("BulkProductAndVariantsByIdQuery");
      const matchesRemote = remoteValue && systemMessageRemoteIds.includes(remoteValue);

      if (matchesType && matchesRemote) matchedJobNames.push(jobName);
    }

    return matchedJobNames;
  } catch (error) {
    logger.error("Failed to fetch dynamic legacy service jobs", error);
    return [];
  }
}

function legacyServiceJobState(catalog: MigrationCatalog, dynamicJobNames: string[]): ProductSyncMigrationLegacyItem[] {
  const staticJobs = PRODUCT_SYNC_MIGRATION_CONFIG.outgoing.serviceJobs.map((jobName) => {
    const jobDetail = findServiceJob(catalog, jobName);
    if (!jobDetail?.jobName) {
      return {
        id: jobName,
        label: jobName,
        status: "missing",
        note: "This legacy service job is not present."
      } as ProductSyncMigrationLegacyItem;
    }

    return describeLegacyServiceJobState(jobDetail);
  });

  const dynamicJobs = dynamicJobNames.map((jobName) => {
    const jobDetail = findServiceJob(catalog, jobName);
    return jobDetail
      ? describeLegacyServiceJobState(jobDetail)
      : { id: jobName, label: jobName, status: "missing", note: "Could not retrieve details for this dynamic job." } as ProductSyncMigrationLegacyItem;
  });

  return [...staticJobs, ...dynamicJobs];
}

/**
 * Recompute everything the catalog decides — the required types and jobs, and the legacy types and
 * jobs — from the catalog as it is now. A screen calls this whenever its live rows change, so a
 * teardown or setup step shows as soon as the worker stores its result.
 */
export function withCatalog<T extends Partial<ProductSyncMigrationAssistantState>>(state: T, catalog: MigrationCatalog): T {
  const updated: T = {
    ...state,
    legacySystemMessageTypes: legacySystemMessageTypeState(catalog),
    legacyServiceJobs: legacyServiceJobState(catalog, state.legacyDynamicServiceJobNames ?? []),
  };
  if (state.artifactChecks) {
    updated.artifactChecks = state.artifactChecks.map((check) => {
      const definition = ARTIFACT_CHECK_DEFINITIONS.find((def) => def.id === check.id);
      if (definition?.type === "job") return serviceJobCheck(catalog, check.id, check.label, check.note);
      if (definition?.type === "systemMessageType") return systemMessageTypeCheck(catalog, check.id, check.label, check.note);
      return check;
    });
  }

  return updated;
}

async function fetchLegacySystemMessages(payload: any, catalog: MigrationCatalog): Promise<{ items: ProductSyncMigrationLegacyItem[]; totalCount: number }> {
  const shopId = getShopId(payload);
  if (!shopId) {
    logger.warn("Shop ID is missing. Cannot fetch legacy system messages.");
    return {
      items: [],
      totalCount: 0
    };
  }
  const systemMessageRemoteIds = payload?.legacySystemMessageRemoteIds?.length ?
    payload.legacySystemMessageRemoteIds :
    await fetchLegacySystemMessageRemoteIds(payload, catalog);

  if (!systemMessageRemoteIds.length) {
    logger.warn("No legacy system message remote IDs found for this shop.");
    return {
      items: [],
      totalCount: 0
    };
  }

  const systemMessages: any[] = [];
  const previewLimit = payload?.previewLimit || 25;
  const pageSize = payload?.includeAllSystemMessages ? 250 : 50; // Increased to 50 for better coverage in fewer calls
  const maxPages = 3; // Strict hard stop to prevent infinite pagination loops

  const allTypes = legacySystemMessageTypeIds(catalog);

  let pageIndex = 0;
  let shouldContinue = true;

  while (shouldContinue && pageIndex < maxPages) {
    const response = await api({
      url: "oms/dataDocumentView",
      method: "post",
      data: {
        dataDocumentId: "SYSTEM_MESSAGE_DATA_MANAGER_LOG",
        customParametersMap: {
          systemMessageTypeId: allTypes,
          remoteInternalId: shopId,
          remoteInternalIdType: "HOTWAX_SHOP_ID",
          statusId: ["SmsgSent", "SmsgConsumed", "SmsgConfirmed", "SmsgCancelled", "SmsgRejected"],
          statusId_not: "true",
          orderByField: "-initDate"
        },
        fieldsToSelect: "systemMessageId,systemMessageTypeId,statusId,initDate,remoteMessageId,systemMessageRemoteId",
        pageIndex,
        pageSize
      }
    }) as any;

    const pageMessages = Array.isArray(response?.data?.entityValueList) ? response.data.entityValueList : [];

    const matchedMessages = pageMessages.filter((systemMessage: any) => {
      const remoteId = String(systemMessage?.systemMessageRemoteId || "").trim();

      if (!systemMessageRemoteIds.includes(remoteId)) {
        return false;
      }

      const typeId = String(systemMessage?.systemMessageTypeId || "");
      const isLegacy = (PRODUCT_SYNC_MIGRATION_CONFIG.outgoing.systemMessageTypes as readonly string[]).includes(typeId) ||
                       typeId.includes("BulkProductAndVariantsByIdQuery");
      return isLegacy;
    });

    systemMessages.push(...matchedMessages);
    pageIndex++;

    if (!payload?.includeAllSystemMessages && systemMessages.length >= previewLimit) {
      shouldContinue = false;
    } else if (pageMessages.length < pageSize) {
      shouldContinue = false;
    }
  }

  const dedupedSystemMessages = systemMessages.filter((systemMessage: any, index: number, list: any[]) => {
    const systemMessageId = String(systemMessage?.systemMessageId || "").trim();
    return !!systemMessageId && list.findIndex((item: any) => String(item?.systemMessageId || "").trim() === systemMessageId) === index;
  });

  const actionableSystemMessages = dedupedSystemMessages
    .map((systemMessage: any) => buildLegacySystemMessageItem(systemMessage))
    .filter((item: ProductSyncMigrationLegacyItem | null): item is ProductSyncMigrationLegacyItem => !!item);
  return {
    items: actionableSystemMessages,
    totalCount: actionableSystemMessages.length
  };
}

/** `payload.catalog` is the screen's live rows, read once its tables have loaded. */
export async function fetchLegacyTeardownState(payload: { catalog: MigrationCatalogSource } & Record<string, any>) {
  const legacySystemMessageRemoteIds = await fetchLegacySystemMessageRemoteIds(payload, payload.catalog());
  const [legacyDynamicServiceJobNames, legacySystemMessageState] = await Promise.all([
    legacySystemMessageRemoteIds.length ? fetchDynamicLegacyServiceJobNames(legacySystemMessageRemoteIds) : [],
    fetchLegacySystemMessages({
      ...payload,
      legacySystemMessageRemoteIds
    }, payload.catalog())
  ]);
  const catalog = payload.catalog();

  return {
    legacySystemMessageRemoteIds,
    legacyDynamicServiceJobNames,
    legacySystemMessageTypes: legacySystemMessageTypeState(catalog),
    legacyServiceJobs: legacyServiceJobState(catalog, legacyDynamicServiceJobNames),
    legacySystemMessages: legacySystemMessageState.items,
    legacySystemMessagesTotalCount: legacySystemMessageState.totalCount
  };
}

/**
 * A write's local refresh failing does not undo the write, and the teardown reports a step as failed
 * only when the server rejected it — so a failed refresh is logged, and the next sync corrects the row.
 */
async function reconcile(refresh: () => Promise<unknown>, what: string) {
  try {
    await refresh();
  } catch (error) {
    logger.warn(`Saved ${what}, but its stored row could not be refreshed`, error);
  }
}

export async function deprecateLegacySystemMessageType(systemMessageTypeId: string, catalog: MigrationCatalog): Promise<void> {
  const systemMessageType = findSystemMessageType(catalog, systemMessageTypeId);
  if (!systemMessageType?.systemMessageTypeId) return;

  await api({
    url: `admin/systemMessages/types/${encodeURIComponent(systemMessageTypeId)}`,
    method: "PUT",
    data: {
      systemMessageTypeId,
      description: buildDeprecatedLabel(systemMessageType.description, systemMessageTypeId),
      parentTypeId: systemMessageType.parentTypeId || "",
      sendServiceName: "",
      consumeServiceName: "",
      sendPath: "",
      receivePath: "",
      receiveMovePath: "",
      receiveFilePattern: "",
      receiveResponseEnumId: ""
    }
  });
  // The type lookup has no by-key route, so its whole (small) snapshot is re-read.
  await reconcile(() => resyncDomain("systemMessageType"), `system message type ${systemMessageTypeId}`);
}

export async function deactivateLegacyServiceJob(jobName: string, catalog: MigrationCatalog): Promise<void> {
  const jobDetail = findServiceJob(catalog, jobName);
  if (!jobDetail?.jobName) return;

  await api({
    url: `admin/serviceJobs/${encodeURIComponent(jobName)}`,
    method: "PUT",
    data: {
      jobName,
      description: jobDetail.description || "",
      paused: "Y",
      serviceName: "_NA_",
      cronExpression: jobDetail.cronExpression || "",
      serviceJobParameters: Array.isArray(jobDetail.serviceJobParameters) ? jobDetail.serviceJobParameters : []
    }
  });
  await reconcile(() => refreshAfterMutation("serviceJob", { jobName }), `service job ${jobName}`);
}

export async function enableServiceJob(jobName: string, jobDetail: any): Promise<void> {
  if (!jobDetail || !jobDetail.jobName) {
    throw new Error(`Job details missing for ${jobName}`);
  }

  await api({
    url: `admin/serviceJobs/${encodeURIComponent(jobName)}`,
    method: "PUT",
    data: {
      jobName: jobDetail.jobName,
      description: jobDetail.description || "",
      paused: "N",
      serviceName: jobDetail.serviceName || "",
      cronExpression: jobDetail.cronExpression || "",
      serviceJobParameters: Array.isArray(jobDetail.serviceJobParameters) ? jobDetail.serviceJobParameters : []
    }
  });
  await reconcile(() => refreshAfterMutation("serviceJob", { jobName }), `service job ${jobName}`);
}

export async function cancelLegacySystemMessage(systemMessage: any): Promise<void> {
  const systemMessageId = typeof systemMessage === "string" ? systemMessage : systemMessage.id;

  if (typeof systemMessage === "object" && systemMessage !== null) {
    const systemMessageTypeId = String(systemMessage.systemMessageTypeId || "").trim();
    const remoteMessageId = String(systemMessage.remoteMessageId || "").trim();
    const systemMessageRemoteId = String(systemMessage.systemMessageRemoteId || "").trim();

    if (systemMessageTypeId.includes("BulkProductAndVariantsByIdQuery") && remoteMessageId && systemMessageRemoteId) {
      try {
        const cancelMutation = `
          mutation {
            bulkOperationCancel(id: "${remoteMessageId}") {
              bulkOperation {
                id
                status
              }
              userErrors {
                field
                message
              }
            }
          }
        `;
        const response = await api({
          url: "shopify/graphql",
          method: "post",
          data: {
            systemMessageRemoteId,
            queryText: cancelMutation
          }
        }) as any;

        const result = response?.response || response?.data || response;
        if (result?.errors?.length || result?.data?.bulkOperationCancel?.userErrors?.length) {
          logger.warn(`Shopify bulkOperationCancel returned errors: ${JSON.stringify(result?.errors || result?.data?.bulkOperationCancel?.userErrors)}`);
        }
      } catch (shopifyError) {
        logger.error(`Error encountered while cancelling Shopify bulk operation ${remoteMessageId}`, shopifyError);
      }
    }
  }

  await api({
    url: `admin/systemMessages/${encodeURIComponent(systemMessageId)}/cancel`,
    method: "POST"
  });
}

export async function teardownLegacySync(
  payload: { catalog: MigrationCatalogSource } & Record<string, any>,
  onProgress?: (step: ProductSyncMigrationTeardownStep) => void
): Promise<ProductSyncMigrationTeardownResult> {
  const legacyTeardownState = await fetchLegacyTeardownState({
    ...payload,
    includeAllSystemMessages: true
  });

  const failedSteps: ProductSyncMigrationTeardownStep[] = [];

  // Step 1: deprecate legacy system message types
  for (const systemMessageType of legacyTeardownState.legacySystemMessageTypes) {
    if (systemMessageType.status !== "active") {
      onProgress?.({
        kind: "type",
        id: systemMessageType.id,
        label: systemMessageType.label || systemMessageType.id,
        status: "skipped"
      });
      continue;
    }

    onProgress?.({
      kind: "type",
      id: systemMessageType.id,
      label: systemMessageType.label || systemMessageType.id,
      status: "processing"
    });

    try {
      await deprecateLegacySystemMessageType(systemMessageType.id, payload.catalog());
      onProgress?.({
        kind: "type",
        id: systemMessageType.id,
        label: systemMessageType.label || systemMessageType.id,
        status: "done"
      });
    } catch (error: any) {
      const errorMessage = error?.message || `Failed to deprecate ${systemMessageType.id}`;
      logger.warn(`Failed to deprecate legacy system message type ${systemMessageType.id}`, error);
      const step: ProductSyncMigrationTeardownStep = {
        kind: "type",
        id: systemMessageType.id,
        label: systemMessageType.label || systemMessageType.id,
        status: "failed",
        error: errorMessage
      };
      failedSteps.push(step);
      onProgress?.(step);
    }
  }

  // Step 2: deactivate legacy service jobs
  for (const serviceJob of legacyTeardownState.legacyServiceJobs) {
    if (serviceJob.status !== "active") {
      onProgress?.({
        kind: "job",
        id: serviceJob.id,
        label: serviceJob.label || serviceJob.id,
        status: "skipped"
      });
      continue;
    }

    onProgress?.({
      kind: "job",
      id: serviceJob.id,
      label: serviceJob.label || serviceJob.id,
      status: "processing"
    });

    try {
      await deactivateLegacyServiceJob(serviceJob.id, payload.catalog());
      onProgress?.({
        kind: "job",
        id: serviceJob.id,
        label: serviceJob.label || serviceJob.id,
        status: "done"
      });
    } catch (error: any) {
      const errorMessage = error?.message || `Failed to deactivate ${serviceJob.id}`;
      logger.warn(`Failed to deactivate legacy service job ${serviceJob.id}`, error);
      const step: ProductSyncMigrationTeardownStep = {
        kind: "job",
        id: serviceJob.id,
        label: serviceJob.label || serviceJob.id,
        status: "failed",
        error: errorMessage
      };
      failedSteps.push(step);
      onProgress?.(step);
    }
  }

  // Step 3: cancel legacy system messages (skip already-terminal ones)
  for (const systemMessage of legacyTeardownState.legacySystemMessages) {
    if (systemMessage.status !== "active") {
      onProgress?.({
        kind: "message",
        id: systemMessage.id,
        label: systemMessage.label || systemMessage.id,
        status: "skipped"
      });
      continue;
    }

    onProgress?.({
      kind: "message",
      id: systemMessage.id,
      label: systemMessage.label || systemMessage.id,
      status: "processing"
    });

    try {
      await cancelLegacySystemMessage(systemMessage);
      onProgress?.({
        kind: "message",
        id: systemMessage.id,
        label: systemMessage.label || systemMessage.id,
        status: "done"
      });
    } catch (error: any) {
      const errorMessage = error?.message || `Failed to cancel message ${systemMessage.id}`;
      logger.warn(`Failed to cancel legacy system message ${systemMessage.id}`, error);
      const step: ProductSyncMigrationTeardownStep = {
        kind: "message",
        id: systemMessage.id,
        label: systemMessage.label || systemMessage.id,
        status: "failed",
        error: errorMessage
      };
      failedSteps.push(step);
      onProgress?.(step);
    }
  }

  const refreshedState = await fetchLegacyTeardownState(payload);
  return {
    failedSteps,
    ...refreshedState
  };
}

/** `payload.catalog` is the screen's live rows, read once its tables have loaded. */
export async function fetchAssistantState(
  payload: { catalog: MigrationCatalogSource } & Record<string, any>,
  onProgress?: (state: Partial<ProductSyncMigrationAssistantState>) => void
): Promise<ProductSyncMigrationAssistantState> {
  const shopId = getShopId(payload);
  const state: ProductSyncMigrationAssistantState = {
    componentRelease: "",
    minimumComponentRelease: PRODUCT_SYNC_MIGRATION_CONFIG.minimumComponentRelease,
    isEligible: null,
    hasNewProductSyncMessages: null,
    systemMessageRemoteId: "",
    legacySystemMessageRemoteIds: [],
    legacySystemMessagesTotalCount: 0,
    syncJobConfigured: null,
    syncJobName: "",
    artifactChecks: [],
    legacySystemMessageTypes: [],
    legacyServiceJobs: [],
    legacySystemMessages: [],
    legacyDynamicServiceJobNames: []
  };

  // 1. Eligibility Check
  try {
    const eligibility = await fetchEligibility();
    state.componentRelease = eligibility.componentRelease;
    state.isEligible = eligibility.isEligible;
    onProgress?.({
      componentRelease: state.componentRelease,
      isEligible: state.isEligible
    });
  } catch (error) {
    logger.warn("Failed to verify eligibility", error);
    state.isEligible = false;
    onProgress?.({ isEligible: false });
  }

  // 2. Artifact Checks (Base infrastructure)

  state.artifactChecks = ARTIFACT_CHECK_DEFINITIONS.map(def => ({ id: def.id, label: def.label, note: def.note, status: "checking" }));
  onProgress?.({ artifactChecks: [...state.artifactChecks] });

  // Process artifact checks concurrently and update state piece by piece
  await Promise.all(ARTIFACT_CHECK_DEFINITIONS.map(async (def, index) => {
    let result: ProductSyncMigrationArtifactCheck;
    if (def.type === "systemMessageType") {
      result = systemMessageTypeCheck(payload.catalog(), def.id, def.label, def.note);
    } else if (def.type === "dataManagerConfig") {
      result = await fetchDataManagerConfigCheck(def.id, def.label, def.note);
    } else if (def.type === "dataDocument") {
      result = await fetchDataDocumentCheck(def.id, def.label, def.note);
    } else {
      result = serviceJobCheck(payload.catalog(), def.id, def.label, def.note);
    }
    state.artifactChecks[index] = result;
    onProgress?.({ artifactChecks: [...state.artifactChecks] });
  }));

  // 3. Per-shop sync job configuration
  if (shopId) {
    try {
      const syncJobConfig = await fetchSyncJobConfig({ shopId });
      state.syncJobConfigured = syncJobConfig.isConfigured;
      state.syncJobName = syncJobConfig.jobName || "";
      onProgress?.({
        syncJobConfigured: state.syncJobConfigured,
        syncJobName: state.syncJobName
      });
    } catch (error) {
      logger.warn("Failed to verify per-shop product sync job configuration", error);
      state.syncJobConfigured = false;
      onProgress?.({ syncJobConfigured: false });
    }
  }

  // 4. Resolve system message remote id (needed for upgrade setup)
  if (shopId) {
    try {
      state.systemMessageRemoteId = await fetchShopSystemMessageRemoteId({
        shopId,
        shop: payload?.shop,
        remotes: payload.catalog().systemMessageRemotes
      });
      onProgress?.({
        systemMessageRemoteId: state.systemMessageRemoteId
      });
    } catch (error) {
      logger.warn("Failed to resolve system message remote id for migration assistant", error);
    }
  }

  // 5. Legacy Teardown State
  try {
    state.legacySystemMessageRemoteIds = await fetchLegacySystemMessageRemoteIds({
      shopId,
      shop: payload?.shop
    }, payload.catalog());
    onProgress?.({ legacySystemMessageRemoteIds: state.legacySystemMessageRemoteIds });

    // Fetch legacy items in parallel blocks
    const [legacyDynamicServiceJobNames, legacyMessages] = await Promise.all([
      state.legacySystemMessageRemoteIds.length ? fetchDynamicLegacyServiceJobNames(state.legacySystemMessageRemoteIds) : [],
      fetchLegacySystemMessages({
        shopId,
        shop: payload?.shop,
        legacySystemMessageRemoteIds: state.legacySystemMessageRemoteIds,
        includeAllSystemMessages: false
      }, payload.catalog())
    ]);

    const catalog = payload.catalog();
    state.legacyDynamicServiceJobNames = legacyDynamicServiceJobNames;
    state.legacySystemMessageTypes = legacySystemMessageTypeState(catalog);
    state.legacyServiceJobs = legacyServiceJobState(catalog, legacyDynamicServiceJobNames);
    state.legacySystemMessages = legacyMessages.items;
    state.legacySystemMessagesTotalCount = legacyMessages.totalCount;

    onProgress?.({
      legacyDynamicServiceJobNames: state.legacyDynamicServiceJobNames,
      legacySystemMessageTypes: state.legacySystemMessageTypes,
      legacyServiceJobs: state.legacyServiceJobs,
      legacySystemMessages: state.legacySystemMessages,
      legacySystemMessagesTotalCount: state.legacySystemMessagesTotalCount
    });
  } catch (error) {
    logger.warn("Failed to inspect legacy product sync teardown state", error);
  }

  return state;
}

export function resolveEntryAction(state: ProductSyncMigrationAssistantState): ProductSyncMigrationEntryAction {
  // If we know it's not eligible, request upgrade
  if (state.isEligible === false) {
    return "request-upgrade";
  }

  // If still checking, default to setup
  if (state.isEligible === null) {
    return "setup";
  }

  // Check if everything is done based on current configuration
  const hasMissingArtifacts = state.artifactChecks.some(check => check.status === "missing");
  const hasActionableLegacyItems =
    state.legacySystemMessageTypes.some(item => isActionableLegacyItem(item, "type")) ||
    state.legacyServiceJobs.some(item => isActionableLegacyItem(item, "job")) ||
    state.legacySystemMessages.some(item => isActionableLegacyItem(item, "message"));
  const hasPendingSetup = state.syncJobConfigured !== true || state.artifactChecks.some(check => check.isPaused);

  if (!hasMissingArtifacts && !hasActionableLegacyItems && !hasPendingSetup) {
    return "current";
  }

  return "setup";
}

