const SHOPIFY_BULK_OPERATION_GID_PREFIX = "gid://shopify/BulkOperation/";
const SYSTEM_MESSAGE_ID_PATTERN = /^M\d+$/i;

export function normalizeShopifyBulkOperationId(value: any, allowNumericId = true) {
  const operationId = String(value || "").trim();
  if (!operationId) return "";

  if (operationId.startsWith(SHOPIFY_BULK_OPERATION_GID_PREFIX)) return operationId;

  const bulkOperationMatch = operationId.match(/(?:^|\/)BulkOperation\/(\d+)$/);
  if (bulkOperationMatch?.[1]) {
    return `${SHOPIFY_BULK_OPERATION_GID_PREFIX}${bulkOperationMatch[1]}`;
  }

  if (allowNumericId && /^\d+$/.test(operationId)) {
    return `${SHOPIFY_BULK_OPERATION_GID_PREFIX}${operationId}`;
  }

  return "";
}

export function getSystemMessageBulkOperationId(systemMessage: any) {
  return normalizeShopifyBulkOperationId(systemMessage?.remoteMessageId) ||
    normalizeShopifyBulkOperationId(systemMessage?.bulkOperationId) ||
    normalizeShopifyBulkOperationId(systemMessage?.shopifyBulkOperationId) ||
    normalizeShopifyBulkOperationId(systemMessage?.remoteId, false);
}

export function getReferencedBulkOperationSystemMessageId(systemMessage: any) {
  return getReferencedBulkOperationSystemMessageIds(systemMessage)[0] || "";
}

export function getReferencedBulkOperationSystemMessageIds(systemMessage: any) {
  const currentSystemMessageId = String(systemMessage?.systemMessageId || "");
  const candidates = [
    systemMessage?.parentMessageId,
    systemMessage?.remoteMessageId
  ];

  return candidates
    .map((candidate) => String(candidate || "").trim())
    .filter((candidate, index, list) => {
      return candidate &&
        list.indexOf(candidate) === index &&
        candidate !== currentSystemMessageId &&
        SYSTEM_MESSAGE_ID_PATTERN.test(candidate);
    });
}

export function getSystemMessageCandidateIds(systemMessage: any, relatedSystemMessages: any[] = []) {
  const candidateIds = [
    systemMessage?.systemMessageId,
    ...getReferencedBulkOperationSystemMessageIds(systemMessage),
    ...relatedSystemMessages.flatMap((relatedSystemMessage) => [
      relatedSystemMessage?.systemMessageId,
      ...getReferencedBulkOperationSystemMessageIds(relatedSystemMessage)
    ])
  ];

  return candidateIds
    .map((candidate) => String(candidate || "").trim())
    .filter((candidate, index, list) => candidate && list.indexOf(candidate) === index);
}
