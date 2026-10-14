import { computed, reactive, toRefs, type Ref } from 'vue';
import { api, commonUtil, logger, useLiveEntity } from '@common'
import { companyDb } from '@/db/companyDb';
import { refreshRecord } from "@/services/appDbSync";
import {
  getReferencedBulkOperationSystemMessageIds,
  getSystemMessageBulkOperationId,
  getSystemMessageCandidateIds
} from "@/utils/shopifyBulkOperation";
import { onSessionCleared } from "./sessionScope";

/**
 * Messages confirmed this session to have ZERO errors.
 *
 * The `systemMessageErrors` table can only remember errors that exist — an empty result writes no
 * row, so "no rows" for a clean message looks the same as "never asked" and would re-request forever.
 * That is what made the product sync history page cost one `/errors` request PER ROW on every entry.
 * Errors are append-only against a terminal message, so "none" stays true for the session.
 */
const messagesKnownToHaveNoErrors = new Set<string>();
let noErrorMemoGeneration = 0;

onSessionCleared(() => {
  noErrorMemoGeneration += 1;
  messagesKnownToHaveNoErrors.clear();
});

/**
 * Whether a message could carry errors at all.
 *
 * `SystemMessageError` rows are written on failure, so a message that reached a successful terminal
 * status has none — and the UI shows no error text for a successful row regardless, which makes the
 * request pure waste. Anything unrecognised is treated as "might", so a new status never silently
 * hides a real error.
 */
export function systemMessageMayHaveErrors(systemMessage: any): boolean {
  const status = String(systemMessage?.statusId ?? "").toLowerCase();
  if (!status) return true;
  return !(status.includes("consumed") || status.includes("confirmed") || status.includes("sent"));
}

/**
 * Terminal bulk-operation statuses. Once an operation reaches one of these it is immutable, so a
 * stored copy is valid forever and Shopify never needs to be asked again.
 */
export const isTerminalBulkOperation = (status: string | undefined) =>
  ["COMPLETED", "FAILED", "CANCELED", "EXPIRED"].includes(String(status || "").toUpperCase());

/**
 * A Shopify bulk operation, as this app reads it.
 *
 * Fields mirror `shopifyBulkOperations` entity schema; every one is optional because
 * the value legitimately starts as `{}` before a run has one, and `isStatusUnavailable` is the
 * synthetic marker set when Shopify cannot be reached (rendered as "status unavailable", not as a
 * failure).
 */
export interface ShopifyBulkOperationLike {
  id?: string;
  status?: string;
  errorCode?: string;
  systemMessageRemoteId?: string;
  objectCount?: number | string;
  rootObjectCount?: number | string;
  fileSize?: number | string;
  url?: string;
  query?: string;
  createdAt?: string | number;
  completedAt?: string | number;
  /** Set when the operation exists but Shopify could not be asked for its current state. */
  isStatusUnavailable?: boolean;
  [key: string]: unknown;
}

export function useSystemMessage() {
  const state = reactive({
    currentSystemMessage: {} as Record<string, any>,
    currentShopifyBulkOperation: {} as Record<string, any>,
    loading: false
  });

  const fetchSystemMessageById = async (systemMessageId: string) => {
    state.loading = true;
    state.currentSystemMessage = {};
    try {
      const response = await api({
        url: "admin/systemMessages",
        method: "GET",
        params: {
          systemMessageId: encodeURIComponent(systemMessageId),
          pageSize: 1
        }
      }) as any;

      if (response?.data?.systemMessages?.length) {
        const systemMessage = response.data.systemMessages[0];
        state.currentSystemMessage = systemMessage;
        return systemMessage;
      }
    } catch (err) {
      logger.error(`Failed to fetch system message ${systemMessageId}`, err);
      throw err;
    } finally {
      state.loading = false;
    }
    return null;
  };

  /**
   * Ask the systemMessageError domain (class C: on demand, never polled) for one message's errors.
   *
   * Errors only exist for messages that failed, and only a run being inspected needs them, so
   * polling every message's errors would be almost entirely wasted requests. Screens read them live
   * through `useSystemMessageErrors`; this only fetches. Always asks — for a message that can still
   * gain an error (a retryable batch, a failed attempt that changed). Rejects when the fetch fails.
   */
  const refreshSystemMessageErrors = async (systemMessageId: string) => {
    if (!systemMessageId) return;
    const requestGeneration = noErrorMemoGeneration;

    state.loading = true;
    try {
      const written = await refreshRecord("systemMessageError", { systemMessageId });
      if (written) {
        // A retry appended an error, so an earlier "has no errors" answer is stale.
        messagesKnownToHaveNoErrors.delete(systemMessageId);
      } else if (requestGeneration === noErrorMemoGeneration) {
        messagesKnownToHaveNoErrors.add(systemMessageId);
      }
    } catch (err) {
      logger.error(`Failed to fetch system message errors for ${systemMessageId}`, err);
      throw err;
    } finally {
      state.loading = false;
    }
  };

  /**
   * Ask for one message's errors unless this session already knows it has none.
   *
   * Call it only when the live rows hold none for the message: rows that are there are the answer,
   * and a confirmed-empty result is an answer too — re-asking for it is the whole N+1.
   */
  const requestSystemMessageErrors = async (systemMessageId: string) => {
    if (!systemMessageId || messagesKnownToHaveNoErrors.has(systemMessageId)) return;
    await refreshSystemMessageErrors(systemMessageId);
  };

  /**
   * Ask the systemMessage domain to fetch one message by id, and return nothing.
   *
   * Screens read messages live, and call this only when their live rows show one missing. Terminal
   * messages are immutable, so once fetched a message is never asked for again.
   */
  const requestSystemMessage = async (systemMessageId: string) => {
    if (!systemMessageId) return;
    try {
      await refreshRecord("systemMessage", { systemMessageId: String(systemMessageId) });
    } catch (err) {
      logger.error(`Failed to fetch system message ${systemMessageId}`, err);
    }
  };

  const fetchSystemMessages = async (params: any) => {
    state.loading = true;
    try {
      const response = await api({
        url: "admin/systemMessages",
        method: "GET",
        params
      }) as any;

      if (response?.data?.systemMessages) {
        return response.data.systemMessages;
      }
    } catch (err) {
      logger.error(`Failed to fetch system messages`, err);
      throw err;
    } finally {
      state.loading = false;
    }
    return [];
  };

  const fetchSystemMessagesPage = async (params: any) => {
    state.loading = true;
    try {
      const response = await api({
        url: "admin/systemMessages",
        method: "GET",
        params
      }) as any;

      return response?.data || { systemMessages: [], systemMessagesCount: 0 };
    } catch (err) {
      logger.error(`Failed to fetch system messages`, err);
      throw err;
    } finally {
      state.loading = false;
    }
    return { systemMessages: [], systemMessagesCount: 0 };
  };

  const fetchSystemMessageLogDetailsPage = async (payload: any) => {
    state.loading = true;
    try {
      const response = await api({
        url: "oms/dataDocumentView",
        method: "POST",
        data: payload
      }) as any;

      const data = response?.data;
      return {
        systemMessageLogDetails: data?.entityValueList || [],
        systemMessageLogDetailsCount: Number(data?.entityValueListCount || 0)
      };
    } catch (err) {
      logger.error(`Failed to fetch system message log details`, err);
      throw err;
    } finally {
      state.loading = false;
    }
    return { systemMessageLogDetails: [], systemMessageLogDetailsCount: 0 };
  };

  /**
   * Ask the shopifyBulkOperation domain to fetch one operation from Shopify, and return nothing.
   *
   * Screens read operations live, and call this only when the live row is missing or not yet
   * terminal (`isTerminalBulkOperation`): a finished operation never changes. Rejects when Shopify
   * cannot be asked, which screens show as "status unavailable".
   */
  const requestShopifyBulkOperation = async (bulkOperationId: string, systemMessageRemoteId: string) => {
    state.loading = true;
    try {
      await refreshRecord("shopifyBulkOperation", { id: bulkOperationId, systemMessageRemoteId });
    } catch (err) {
      logger.error(`Failed to fetch Shopify Bulk Operation ${bulkOperationId}`, err);
      throw err;
    } finally {
      state.loading = false;
    }
  };

  const getBulkOperationSource = async (systemMessage: any, visitedSystemMessageIds = new Set<string>()): Promise<{
    bulkOperationId: string;
    systemMessage: any;
    relatedSystemMessages: any[];
    relatedSystemMessageIds: string[];
  }> => {
    const systemMessageId = String(systemMessage?.systemMessageId || "");
    if (systemMessageId) visitedSystemMessageIds.add(systemMessageId);

    const bulkOperationId = getSystemMessageBulkOperationId(systemMessage);
    if (bulkOperationId) {
      return {
        bulkOperationId,
        systemMessage,
        relatedSystemMessages: [],
        relatedSystemMessageIds: getSystemMessageCandidateIds(systemMessage)
      };
    }

    const referencedSystemMessageIds = getReferencedBulkOperationSystemMessageIds(systemMessage)
      .filter((referencedSystemMessageId) => !visitedSystemMessageIds.has(referencedSystemMessageId));
    if (!referencedSystemMessageIds.length) {
      return {
        bulkOperationId: "",
        systemMessage,
        relatedSystemMessages: [],
        relatedSystemMessageIds: getSystemMessageCandidateIds(systemMessage)
      };
    }

    for (const referencedSystemMessageId of referencedSystemMessageIds) {
      const referencedSystemMessage = await fetchSystemMessageById(referencedSystemMessageId);
      if (!referencedSystemMessage) continue;

      const referencedSource = await getBulkOperationSource(referencedSystemMessage, visitedSystemMessageIds);
      if (referencedSource.bulkOperationId) {
        const relatedSystemMessages = [referencedSystemMessage, ...referencedSource.relatedSystemMessages];
        return {
          ...referencedSource,
          relatedSystemMessages,
          relatedSystemMessageIds: getSystemMessageCandidateIds(systemMessage, relatedSystemMessages)
        };
      }
    }

    return {
      bulkOperationId: "",
      systemMessage,
      relatedSystemMessages: [],
      relatedSystemMessageIds: getSystemMessageCandidateIds(systemMessage)
    };
  };

  /**
   * The two reads below answer `fetchShopifyBulkOperationBySystemMessageId` with values, because its
   * one caller (the product sync history page) still copies them into its rows. They go when that
   * page reads the tables live.
   */
  const readSystemMessageErrors = async (systemMessageId: string) => {
    const errors = companyDb.entity(companyDb.tables.systemMessageErrors);
    const query = { equals: { systemMessageId }, dateField: "errorDate" };
    const stored = await errors.query(query).catch(() => []);
    if (stored.length) return stored;
    try {
      await requestSystemMessageErrors(systemMessageId);
    } catch {
      // A failed request is not proof that the message has no errors; a later read asks again.
      return [];
    }
    return errors.query(query);
  };

  const readShopifyBulkOperation = async (bulkOperationId: string, systemMessageRemoteId: string) => {
    const operations = companyDb.entity(companyDb.tables.shopifyBulkOperations);
    const stored = await operations.get(bulkOperationId).catch(() => undefined);
    if (stored && isTerminalBulkOperation(stored.status as string)) return stored;
    await requestShopifyBulkOperation(bulkOperationId, systemMessageRemoteId);
    return (await operations.get(bulkOperationId)) ?? null;
  };

  /**
   * A Shopify bulk operation as this app handles it.
   *
   * Mirrors `shopifyBulkOperations` entity schema, plus `isStatusUnavailable` — the
   * synthetic marker set when Shopify cannot be reached for a run, which callers render as "status
   * unavailable" rather than as a failure.
   *
   * Typed rather than left as the inferred `{}`: every consumer reads `.status`/`.objectCount` off
   * this, and `{}` made all eleven of those reads type errors in `ShopifyProductSyncHistory.vue`
   * while still compiling everywhere the value was passed through untyped.
   */
  const fetchShopifyBulkOperationBySystemMessageId = async (systemMessageId: string, systemMessageData?: any) => {
    const systemMessage = systemMessageData || await fetchSystemMessageById(systemMessageId);
    // Cache-first, and skipped entirely for a message whose status rules errors out — see
    // `systemMessageMayHaveErrors`. This was an unconditional request per row.
    const systemMessageErrors = systemMessageMayHaveErrors(systemMessage)
      ? await readSystemMessageErrors(systemMessageId)
      : [];
    
    if (systemMessageData) state.currentSystemMessage = systemMessageData;

    let shopifyBulkOperation: ShopifyBulkOperationLike = {};
    const bulkOperationSource = await getBulkOperationSource(systemMessage);
    const systemMessageRemoteId = bulkOperationSource.systemMessage?.systemMessageRemoteId || systemMessage?.systemMessageRemoteId;
    if (systemMessage && bulkOperationSource.bulkOperationId && systemMessageRemoteId) {
      try {
        const result = await readShopifyBulkOperation(bulkOperationSource.bulkOperationId, systemMessageRemoteId);
        shopifyBulkOperation = result || { isStatusUnavailable: true };
      } catch (err) {
        shopifyBulkOperation = { isStatusUnavailable: true };
      }
    } else {
      state.currentShopifyBulkOperation = {};
    }
    
    return {
      systemMessage: systemMessage || state.currentSystemMessage,
      systemMessageErrors,
      shopifyBulkOperation: shopifyBulkOperation || state.currentShopifyBulkOperation,
      bulkOperationId: bulkOperationSource.bulkOperationId,
      relatedSystemMessageIds: bulkOperationSource.relatedSystemMessageIds
    };
  };

  /**
   * Re-attempt delivery of a message that has already been produced.
   *
   * Re-sends the SAME stored message: the payload and its frozen Shopify idempotency key are never
   * rebuilt, so a batch that did reach Shopify before failing cannot double-apply.
   */
  const resendSystemMessage = async (systemMessageId: string) => {
    if (!systemMessageId) throw new Error("A system message is required to resend.");
    const response = await api({
      url: `admin/systemMessages/${encodeURIComponent(systemMessageId)}/send`,
      method: "POST",
      data: { systemMessageId }
    }) as any;
    if (commonUtil.hasError(response)) {
      logger.error("Resend rejected for system message", systemMessageId, response);
      throw new Error("The OMS rejected the resend request.");
    }
    return response?.data ?? {};
  };

  /**
   * Clear a message's error state so the sweep picks it up again.
   *
   * This is the recovery for SmsgError, which is TERMINAL to the sweep: it stops retrying once
   * `failCount` reaches the limit, and only resetting the message puts it back in the queue. The
   * stored payload is untouched — like `resendSystemMessage`, nothing is rebuilt, so a delivery
   * that already landed cannot double-apply.
   */
  const resetSystemMessageError = async (systemMessageId: string) => {
    if(!systemMessageId) {throw new Error("A system message is required to reset.");}
    const response = await api({
      url: `admin/systemMessages/${encodeURIComponent(systemMessageId)}/resetError`,
      method: "POST",
      data: { systemMessageId }
    }) as any;
    if(commonUtil.hasError(response)) {
      logger.error("Reset rejected for system message", systemMessageId, response);
      throw new Error("The OMS rejected the reset request.");
    }

    return response?.data ?? {};
  };

  /**
   * Force a message to an explicit status.
   *
   * Exists for the one state neither send nor reset can reach: a message stranded in SmsgSending
   * (a crashed send never rolled it back), which the sweep skips because it only picks up
   * SmsgProduced and SmsgError. Setting it back to SmsgProduced is the documented unstick.
   */
  const forceSystemMessageStatus = async (systemMessageId: string, statusId: string) => {
    if(!systemMessageId) {throw new Error("A system message is required to update.");}
    if(!statusId) {throw new Error("A status is required to update a system message.");}
    const response = await api({
      url: `admin/systemMessages/${encodeURIComponent(systemMessageId)}/update`,
      method: "POST",
      data: { systemMessageId, statusId }
    }) as any;
    if(commonUtil.hasError(response)) {
      logger.error("Status update rejected for system message", systemMessageId, response);
      throw new Error("The OMS rejected the status update.");
    }

    return response?.data ?? {};
  };

  return {
    ...toRefs(state),
    fetchSystemMessageById,
    requestSystemMessage,
    refreshSystemMessageErrors,
    requestSystemMessageErrors,
    resendSystemMessage,
    resetSystemMessageError,
    forceSystemMessageStatus,
    requestShopifyBulkOperation,
    fetchShopifyBulkOperationBySystemMessageId,
    fetchSystemMessageLogDetailsPage,
    fetchSystemMessages,
    fetchSystemMessagesPage
  };
}


// ---------------------------------------------------------------------------------------------
// Cached reads — the local-first half of the system-message function.
//
// `useSystemMessage()` above wraps the server operations: writes, and the `request*` calls that ask
// a domain to fetch a record the screen's live rows show missing. The composables below read what
// the sync worker has stored, so a view renders system-message state with no request at all. Both
// halves live in this file because they serve the same function.
// ---------------------------------------------------------------------------------------------

export interface SystemMessageQuery {
  /** Narrow to one message type, e.g. `BulkQueryShopifyProductUpdates`. Index-backed. */
  systemMessageTypeId?: string;
  /** Keep only these statuses. Not index-backed (a set, not an equality) — applied as a filter. */
  statusIds?: string[];
  /** Newest N only. */
  limit?: number;
}

/**
 * Cached system messages, newest first.
 *
 * Scoping by remote + type + `initDate` resolves through the
 * `[systemMessageRemoteId+systemMessageTypeId+initDate]` compound index, so this is an index range
 * read already in date order — no table scan and no sort, which is what makes the sync screens cheap
 * enough to re-render on every worker write.
 */
export function useSystemMessages(systemMessageRemoteId?: string, query: SystemMessageQuery = {}) {
  const statusSet = query.statusIds?.length ? new Set(query.statusIds) : undefined;

  const { records, hydrated } = useLiveEntity<any>(companyDb.tables.systemMessages, {
    dateField: 'initDate',
    ...(systemMessageRemoteId
      ? { scope: { field: 'systemMessageRemoteId', value: systemMessageRemoteId } }
      : {}),
    ...(query.systemMessageTypeId
      ? { equals: { systemMessageTypeId: query.systemMessageTypeId } }
      : {}),
    ...(statusSet ? { filter: (row: any) => statusSet.has(row.statusId) } : {}),
    ...(query.limit ? { limit: query.limit } : {}),
  });

  /** Messages that have not reported a processed date yet — still in flight. */
  const inFlight = computed(() => records.value.filter((msg: any) => !msg.processedDate));

  return { messages: records, inFlight, records, hydrated };
}

/**
 * The newest message for a remote + type — the anchor a sync card reads as "the current run".
 *
 * `limit: 1` over the compound index, so this costs one index seek regardless of how many messages
 * are cached.
 */
export function useLatestSystemMessage(systemMessageRemoteId?: string, systemMessageTypeId?: string) {
  const { records, hydrated } = useSystemMessages(systemMessageRemoteId, { systemMessageTypeId, limit: 1 });
  return { message: computed<any>(() => records.value[0]), hydrated };
}

/** One message by id. A getter follows a changing id; with no id it matches nothing. */
export function useSystemMessageRecord(systemMessageId: string | undefined | (() => string | undefined)) {
  const { first: record, hydrated } = useLiveEntity<any>(companyDb.tables.systemMessages, () => {
    const id = typeof systemMessageId === 'function' ? systemMessageId() : systemMessageId;
    return id ? { equals: { systemMessageId: id } } : { filter: () => false };
  });
  return { record, hydrated };
}

/**
 * Cached errors, filled on demand — see `requestSystemMessageErrors`.
 *
 * A fixed id scopes to that message, and no id reads every stored error (a screen of many cards). A
 * getter follows a changing id, and matches nothing while it is empty.
 */
export function useSystemMessageErrors(systemMessageId?: string | (() => string | undefined)) {
  const { records, hydrated } = useLiveEntity<any>(companyDb.tables.systemMessageErrors, () => {
    const id = typeof systemMessageId === 'function' ? systemMessageId() : systemMessageId;
    if (typeof systemMessageId === 'function' && !id) return { filter: () => false };
    return {
      dateField: 'errorDate',
      ...(id ? { scope: { field: 'systemMessageId', value: id } } : {}),
    };
  });

  /** The first non-empty error text — what the run header shows. */
  const errorText = computed<string>(() => {
    for (const error of records.value) {
      const text = String(error?.errorText ?? '').trim();
      if (text) return text;
    }
    return '';
  });

  return { errors: records, errorText, hydrated };
}

/** A cached Shopify bulk operation by its gid. */
export function useShopifyBulkOperationRecord(bulkOperationId: string | undefined) {
  const { first: record, hydrated } = useLiveEntity<any>(companyDb.tables.shopifyBulkOperations, () => bulkOperationId ? { equals: { id: bulkOperationId } } : { filter: () => false });
  return { record, hydrated };
}

/**
 * The bulk operation for a message, resolved through the id chain the message carries
 * (`remoteMessageId` → `bulkOperationId` → `parentMessageId`) — reusing the tested resolver rather
 * than re-deriving it.
 */
export function useBulkOperationForMessage(message: Ref<any> | (() => any)) {
  const source = computed<any>(() => (typeof message === 'function' ? message() : message.value));
  const bulkOperationId = computed<string>(() => getSystemMessageBulkOperationId(source.value) || '');
  const { records, hydrated } = useLiveEntity<any>(companyDb.tables.shopifyBulkOperations);

  const bulkOperation = computed<any>(() =>
    bulkOperationId.value
      ? records.value.find((row: any) => row.id === bulkOperationId.value)
      : undefined);

  return { bulkOperation, bulkOperationId, hydrated };
}

/**
 * The remote endpoints the OMS exchanges messages with.
 *
 * These sit with the system-message function rather than under a connector: a remote is the
 * addressable endpoint a message is produced for or consumed from, and several connectors
 * (Shopify, Klaviyo, NetSuite) merely reference it.
 */
export function useSystemMessageRemotes() {
  const { records, hydrated } = useLiveEntity<any>(companyDb.tables.systemMessageRemotes);
  return { remotes: records, records, hydrated };
}

export function useSystemMessageRemoteRecord(systemMessageRemoteId: string | undefined) {
  const { first: record, hydrated } = useLiveEntity<any>(companyDb.tables.systemMessageRemotes, () => systemMessageRemoteId ? { equals: { systemMessageRemoteId } } : { filter: () => false });
  return { record, hydrated };
}
