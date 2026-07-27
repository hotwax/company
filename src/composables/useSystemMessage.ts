import { computed, reactive, toRefs, type Ref } from 'vue';
import { api, logger } from '@common'
import {
  shopifyBulkOperationCache,
  systemMessageCache,
  systemMessageErrorCache,
  systemMessageRemoteCache,
} from '@/utils/cacheEntities';
import { useCachedList, useCachedRecord } from './useCachedList';
import {
  getReferencedBulkOperationSystemMessageIds,
  getSystemMessageBulkOperationId,
  getSystemMessageCandidateIds
} from "@/utils/shopifyBulkOperation";

const BULK_OPERATION_QUERY = `
  query BulkOperation($id: ID!) {
    node(id: $id) {
      ... on BulkOperation {
        id
        status
        errorCode
        createdAt
        completedAt
        objectCount
        rootObjectCount
        fileSize
        url
        query
      }
    }
  }
`;

/**
 * Messages confirmed this session to have ZERO errors.
 *
 * `systemMessageErrorCache` can only remember errors that exist — an empty result writes no row, so
 * a cache-first read of a clean message misses every time and re-requests forever. That is what made
 * the product sync history page cost one `/errors` request PER ROW on every entry. Errors are
 * append-only against a terminal message, so "none" stays true for the session.
 */
const messagesKnownToHaveNoErrors = new Set<string>();

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
   * Errors for one message, WRITE-THROUGH to the cache (class C: on demand, never polled).
   *
   * Errors only exist for messages that failed, and only a run being inspected needs them, so
   * polling every message's errors would be almost entirely wasted requests. Fetch once, cache, and
   * let `useSystemMessageErrors` serve every later render reactively.
   */
  const fetchSystemMessageErrors = async (systemMessageId: string) => {
    if (!systemMessageId) return [];

    state.loading = true;
    try {
      const response = await api({
        url: `admin/systemMessages/${encodeURIComponent(systemMessageId)}/errors`,
        method: "GET",
        params: {
          pageSize: 50
        }
      }) as any;

      // Bare array response (verified live: `[ ]` for a message with no errors).
      const errors: any[] = Array.isArray(response?.data) ? response.data : [];
      if (errors.length) {
        // `systemMessageId` is not echoed on each row — the id is only in the URL — so stamp it in,
        // otherwise the synthetic key cannot be built and the join has nothing to match on.
        void systemMessageErrorCache.upsertMany(errors.map((error) => ({ ...error, systemMessageId })));
      }
      return errors;
    } catch (err) {
      logger.error(`Failed to fetch system message errors for ${systemMessageId}`, err);
      throw err;
    } finally {
      state.loading = false;
    }
  };

  /** Fetch only if this message's errors are not cached yet — the on-demand entry point. */
  const ensureSystemMessageErrors = async (systemMessageId: string) => {
    if (!systemMessageId) return [];

    // A confirmed-empty result is an answer, and re-asking for it is the whole N+1.
    if (messagesKnownToHaveNoErrors.has(systemMessageId)) return [];

    try {
      const cached = (await systemMessageErrorCache.all())
        .filter((row: any) => row.systemMessageId === systemMessageId);
      if (cached.length) return cached.map((row: any) => row.raw);
    } catch {
      // cache unavailable — fall through to the network
    }

    const errors = await fetchSystemMessageErrors(systemMessageId).catch(() => []);
    if (!errors.length) messagesKnownToHaveNoErrors.add(systemMessageId);
    return errors;
  };

  /**
   * One message by id, CACHE-FIRST and WRITE-THROUGH.
   *
   * `fetchSystemMessageById` only populates local state, so a caller that needed the row in IndexedDB
   * got nothing durable. This is the read path the sync screens use: try the cache, and on a miss fetch
   * exactly one record, persist it, and return it. Terminal messages are immutable, so a hit is
   * permanent and this decays to zero requests.
   */
  const ensureSystemMessageById = async (systemMessageId: string) => {
    if (!systemMessageId) return null;
    try {
      const cached = (await systemMessageCache.all())
        .find((row: any) => String(row.systemMessageId) === String(systemMessageId));
      if (cached) return cached.raw ?? cached;
    } catch {
      // cache unavailable — fall through to the network
    }

    const fetched = await fetchSystemMessageById(systemMessageId).catch(() => null);
    if (fetched) await systemMessageCache.upsertMany([fetched]);
    return fetched;
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

  const getGraphqlPayload = (response: any) => {
    const responseData = response?.data || response;
    return responseData?.response?.data ||
      responseData?.data ||
      responseData?.response ||
      responseData;
  };

  /**
   * Terminal bulk-operation statuses. Once an operation reaches one of these it is immutable, so a
   * cached copy is valid forever and Shopify never needs to be asked again.
   */
  const isTerminalBulkOperation = (status: string | undefined) =>
    ["COMPLETED", "FAILED", "CANCELED", "EXPIRED"].includes(String(status || "").toUpperCase());

  const fetchShopifyBulkOperation = async (bulkOperationId: string, systemMessageRemoteId: string) => {
    // Cache-first: a finished operation is immutable, so serve it locally and skip the remote call.
    try {
      const cached = (await shopifyBulkOperationCache.all())
        .find((row: any) => row.id === bulkOperationId);
      if (cached && isTerminalBulkOperation(cached.status as string)) {
        state.currentShopifyBulkOperation = cached.raw;
        return cached.raw;
      }
    } catch {
      // cache miss or read failure — fall through to the live call
    }

    state.loading = true;
    state.currentShopifyBulkOperation = {};
    try {
      const response = await api({
        url: "shopify/graphql",
        method: "post",
        data: {
          systemMessageRemoteId,
          queryText: BULK_OPERATION_QUERY,
          variables: {
            id: bulkOperationId
          }
        }
      }) as any;

      const graphQlPayload = getGraphqlPayload(response);
      const payload = graphQlPayload?.node;
      if (payload) {
        state.currentShopifyBulkOperation = payload;
        // Cache it so a later visit needs no Shopify round-trip once it has finished.
        void shopifyBulkOperationCache.upsertMany([{ ...payload, systemMessageRemoteId }]);
        return payload;
      }
    } catch (err) {
      logger.error(`Failed to fetch Shopify Bulk Operation ${bulkOperationId}`, err);
      throw err;
    } finally {
      state.loading = false;
    }
    return null;
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

  const fetchShopifyBulkOperationBySystemMessageId = async (systemMessageId: string, systemMessageData?: any) => {
    const systemMessage = systemMessageData || await fetchSystemMessageById(systemMessageId);
    // Cache-first, and skipped entirely for a message whose status rules errors out — see
    // `systemMessageMayHaveErrors`. This was an unconditional request per row.
    const systemMessageErrors = systemMessageMayHaveErrors(systemMessage)
      ? await ensureSystemMessageErrors(systemMessageId)
      : [];
    
    if (systemMessageData) state.currentSystemMessage = systemMessageData;

    let shopifyBulkOperation = {};
    const bulkOperationSource = await getBulkOperationSource(systemMessage);
    const systemMessageRemoteId = bulkOperationSource.systemMessage?.systemMessageRemoteId || systemMessage?.systemMessageRemoteId;
    if (systemMessage && bulkOperationSource.bulkOperationId && systemMessageRemoteId) {
      try {
        const result = await fetchShopifyBulkOperation(bulkOperationSource.bulkOperationId, systemMessageRemoteId);
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

  return {
    ...toRefs(state),
    fetchSystemMessageById,
    ensureSystemMessageById,
    fetchSystemMessageErrors,
    ensureSystemMessageErrors,
    fetchShopifyBulkOperation,
    fetchShopifyBulkOperationBySystemMessageId,
    fetchSystemMessageLogDetailsPage,
    fetchSystemMessages,
    fetchSystemMessagesPage
  };
}


// ---------------------------------------------------------------------------------------------
// Cached reads — the local-first half of the system-message function.
//
// `useSystemMessage()` above wraps the live api() operations (fetch one, errors, Shopify bulk
// operation). The composables below read what the sync worker has already cached, so a view can
// render system-message state with no request at all. Both halves live in this file because they
// serve the same function.
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

  const { records, hydrated } = useCachedList<any>(systemMessageCache, {
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

export const useSystemMessageRecord = (systemMessageId: string | undefined) =>
  useCachedRecord(systemMessageCache, 'systemMessageId', systemMessageId);

/** Cached errors for one message. Populated on demand — see `ensureSystemMessageErrors`. */
export function useSystemMessageErrors(systemMessageId?: string) {
  const { records, hydrated } = useCachedList<any>(systemMessageErrorCache, {
    dateField: 'errorDate',
    ...(systemMessageId ? { scope: { field: 'systemMessageId', value: systemMessageId } } : {}),
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
export const useShopifyBulkOperationRecord = (bulkOperationId: string | undefined) =>
  useCachedRecord(shopifyBulkOperationCache, 'id', bulkOperationId);

/**
 * The bulk operation for a message, resolved through the id chain the message carries
 * (`remoteMessageId` → `bulkOperationId` → `parentMessageId`) — reusing the tested resolver rather
 * than re-deriving it.
 */
export function useBulkOperationForMessage(message: Ref<any> | (() => any)) {
  const source = computed<any>(() => (typeof message === 'function' ? message() : message.value));
  const bulkOperationId = computed<string>(() => getSystemMessageBulkOperationId(source.value) || '');
  const { records, hydrated } = useCachedList<any>(shopifyBulkOperationCache);

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
  const { records, hydrated } = useCachedList<any>(systemMessageRemoteCache);
  return { remotes: records, records, hydrated };
}

export const useSystemMessageRemoteRecord = (systemMessageRemoteId: string | undefined) =>
  useCachedRecord(systemMessageRemoteCache, 'systemMessageRemoteId', systemMessageRemoteId);
