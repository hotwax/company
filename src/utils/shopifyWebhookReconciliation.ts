/**
 * Pure reconciliation of a shop's Shopify webhook wiring.
 *
 * Everything is derived from data the page already fetches — no dedicated health endpoint:
 *   - REQUIRED  the OMS's own consumable vocabulary: `moqui.basic.Enumeration` rows of type
 *               ShopifyMessageTypeEnum, whose `enumCode` is the topic `receive#WebhookPayload`
 *               resolves an inbound payload against, narrowed to this page's topic prefixes.
 *   - SUBSCRIBED what Shopify actually has registered.
 *   - BACKLOG   messages of that type still sitting in received status.
 *
 * Two failure modes are only visible by joining those:
 *   - `noConsumer`  Shopify sends a topic with no Enumeration row. `receive#WebhookPayload` returns
 *                   `<return message=.../>` with no error, so the payload is ACKed and dropped —
 *                   silent data loss, hence a danger state.
 *   - `elsewhere`   the subscription is registered, but its callback points at a different host
 *                   than the OMS being viewed. "Subscribed" is not "arriving here".
 */

export interface WebhookReconciliationRow {
  topic: string;
  enumCode?: string;
  subscriptionId?: string;
  uri?: string;
  /** Host of `uri`, for the "delivers elsewhere" case. */
  uriHost?: string;
  systemMessageTypeId?: string;
  systemMessageTypeDescription?: string;
  receivedCount: number;
  subscribed: boolean;
  status: "subscribed" | "missing" | "duplicate" | "elsewhere" | "noConsumer";
}

export interface ReconciliationSummary {
  /** Topics this OMS can consume, in scope. */
  requiredCount: number;
  /** Of those, how many Shopify has registered. */
  subscribedCount: number;
  missingCount: number;
  duplicateCount: number;
  elsewhereCount: number;
  noConsumerCount: number;
  /** False when no OMS host was supplied, so callback URLs could not be checked. */
  endpointAsserted: boolean;
}

export interface ReconciliationInput {
  /** `webhookSubscriptions` edges, or bare nodes. */
  subscriptions?: any[];
  /** Enumeration rows of type ShopifyMessageTypeEnum (enumId = systemMessageTypeId). */
  enumRows?: any[];
  /** One page of received-status SystemMessageAndType rows. */
  receivedRows?: any[];
  /** Authoritative total behind `receivedRows`; a larger value means the page truncated. */
  receivedTotal?: number;
  /** Subscription-topic prefixes this page owns; empty means every topic. */
  topicPrefixes?: string[];
  /** Base URL of the OMS being viewed. Callback URLs are only asserted when this is supplied. */
  omsBaseUrl?: string;
}

/** `inventory_transfers/add_items` -> `INVENTORY_TRANSFERS_ADD_ITEMS`, the form subscriptions use. */
export function topicToSubscriptionTopic(enumCode: string) {
  return String(enumCode ?? "").replace(/\//g, "_").toUpperCase();
}

export function hostOf(url?: string) {
  if(!url) { return undefined; }
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}

export function reconcileWebhookTopics(input: ReconciliationInput) {
  const { subscriptions = [], enumRows = [], receivedRows = [], topicPrefixes = [], omsBaseUrl } = input;
  const receivedTotal = Number(input.receivedTotal ?? receivedRows.length) || 0;
  const omsHost = hostOf(omsBaseUrl);

  const inScope = (topic: string) =>
    !topicPrefixes.length || topicPrefixes.some((prefix) => topic.startsWith(prefix));

  const typeByTopic = new Map<string, any>();
  for(const row of enumRows) {
    const enumCode = String(row?.enumCode ?? "");
    if(!enumCode) { continue; }
    typeByTopic.set(topicToSubscriptionTopic(enumCode), row);
  }

  const receivedByType = new Map<string, number>();
  for(const row of receivedRows) {
    const typeId = String(row?.systemMessageTypeId ?? "");
    if(!typeId) { continue; }
    receivedByType.set(typeId, (receivedByType.get(typeId) ?? 0) + 1);
  }

  const nodes = subscriptions.map((edge: any) => edge?.node ?? edge).filter(Boolean);
  const scoped = nodes.filter((node: any) => inScope(String(node?.topic ?? "")));

  // Duplicates are counted per topic across the whole subscription list, not per row.
  const occurrences = new Map<string, number>();
  for(const node of scoped) {
    const topic = String(node?.topic ?? "");
    occurrences.set(topic, (occurrences.get(topic) ?? 0) + 1);
  }

  const rows: WebhookReconciliationRow[] = [];
  const seen = new Set<string>();

  for(const node of scoped) {
    const topic = String(node?.topic ?? "");
    if(seen.has(topic)) { continue; }
    seen.add(topic);

    const enumRow = typeByTopic.get(topic);
    const typeId = enumRow ? String(enumRow.enumId ?? "") : undefined;
    const uriHost = hostOf(node?.uri);

    let status: WebhookReconciliationRow["status"] = "subscribed";
    if(!typeId) {
      status = "noConsumer";
    } else if((occurrences.get(topic) ?? 0) > 1) {
      status = "duplicate";
    } else if(omsHost && uriHost && uriHost !== omsHost) {
      status = "elsewhere";
    }

    rows.push({
      topic,
      enumCode: enumRow?.enumCode,
      subscriptionId: node?.id,
      uri: node?.uri,
      uriHost,
      systemMessageTypeId: typeId,
      systemMessageTypeDescription: enumRow?.description,
      receivedCount: typeId ? (receivedByType.get(typeId) ?? 0) : 0,
      subscribed: true,
      status,
    });
  }

  // Required but not subscribed: everything in the OMS's own vocabulary Shopify is not sending.
  const required = Array.from(typeByTopic.keys()).filter(inScope);
  for(const topic of required) {
    if(seen.has(topic)) { continue; }
    const enumRow = typeByTopic.get(topic);
    const typeId = enumRow ? String(enumRow.enumId ?? "") : undefined;
    rows.push({
      topic,
      enumCode: enumRow?.enumCode,
      systemMessageTypeId: typeId,
      systemMessageTypeDescription: enumRow?.description,
      receivedCount: typeId ? (receivedByType.get(typeId) ?? 0) : 0,
      subscribed: false,
      status: "missing",
    });
  }

  rows.sort((a, b) => a.topic.localeCompare(b.topic));

  const summary: ReconciliationSummary = {
    requiredCount: required.length,
    subscribedCount: required.filter((topic) => seen.has(topic)).length,
    missingCount: rows.filter((row) => row.status === "missing").length,
    duplicateCount: rows.filter((row) => row.status === "duplicate").length,
    elsewhereCount: rows.filter((row) => row.status === "elsewhere").length,
    noConsumerCount: rows.filter((row) => row.status === "noConsumer").length,
    endpointAsserted: !!omsHost,
  };

  return {
    rows,
    summary,
    otherSubscriptionCount: nodes.length - scoped.length,
    receivedTotal,
    receivedTruncated: receivedTotal > receivedRows.length,
  };
}
