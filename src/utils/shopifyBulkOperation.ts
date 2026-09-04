import type { SystemMessage } from "@/utils/systemMessage";

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

/** The states a Shopify bulk operation moves through, mapped to our progress vocabulary. */
export type BulkOperationState = "pending" | "active" | "completed" | "failed";

/**
 * A Shopify BulkOperation as the Admin GraphQL API returns it. `status` is Shopify's
 * BulkOperationStatus enum; `type` is QUERY | MUTATION.
 */
export interface ShopifyBulkOperation {
  id: string;
  status: string;
  type?: string;
  objectCount?: number;
  createdAt?: string;
  completedAt?: string;
  errorCode?: string;
  url?: string;
}

/**
 * Shopify BulkOperationStatus → progress state. Source of truth: the Shopify Admin
 * GraphQL BulkOperationStatus enum (7 values). Exact map, no fuzzy matching; an
 * unrecognized status resolves to "pending". CANCELING is still in flight (active);
 * CANCELED / EXPIRED / FAILED are terminal failures.
 */
const BULK_OPERATION_STATES: Record<string, BulkOperationState> = {
  CREATED: "pending",
  RUNNING: "active",
  CANCELING: "active",
  COMPLETED: "completed",
  CANCELED: "failed",
  EXPIRED: "failed",
  FAILED: "failed",
};

/** The status ids this module recognizes — useful for tests and exhaustiveness checks. */
export const BULK_OPERATION_STATUS_IDS = Object.keys(BULK_OPERATION_STATES);

/** The progress state for a Shopify bulk operation status. */
export function bulkOperationState(status: string | null | undefined): BulkOperationState {
  if (!status) return "pending";
  return BULK_OPERATION_STATES[status] ?? "pending";
}

/**
 * Whether a SystemMessage references a Shopify bulk operation — the presence-driven
 * signal a caller uses to decide whether to fetch/join one. True only when the
 * message's remote id resolves to a bulk-operation id; a bare sibling M-id or an
 * empty field yields false, so a flow with no bulk op (e.g. Order Sync) is
 * structurally excluded.
 */
export function expectsBulkOperation(message: SystemMessage | null | undefined): boolean {
  return getSystemMessageBulkOperationId(message) !== "";
}
