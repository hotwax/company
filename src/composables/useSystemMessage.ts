import { reactive, toRefs } from 'vue';
import api from '@/api';
import logger from '@/logger';
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

      return response?.data || [];
    } catch (err) {
      logger.error(`Failed to fetch system message errors for ${systemMessageId}`, err);
      throw err;
    } finally {
      state.loading = false;
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

  const getGraphqlPayload = (response: any) => {
    const responseData = response?.data || response;
    return responseData?.response?.data ||
      responseData?.data ||
      responseData?.response ||
      responseData;
  };

  const fetchShopifyBulkOperation = async (bulkOperationId: string, systemMessageRemoteId: string) => {
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
    const systemMessageErrors = await fetchSystemMessageErrors(systemMessageId).catch(() => []);
    
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
    fetchSystemMessageErrors,
    fetchShopifyBulkOperation,
    fetchShopifyBulkOperationBySystemMessageId,
    fetchSystemMessageLogDetailsPage,
    fetchSystemMessages,
    fetchSystemMessagesPage
  };
}
