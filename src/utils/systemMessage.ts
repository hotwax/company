/**
 * SystemMessage — domain model + behaviors (pure, Vue-free).
 *
 * The reusable logic for one Moqui `SystemMessage`. Kept as plain functions so any
 * composable / store / view can import them and so their tests need no reactive
 * harness. The reactive loader lives in `@/composables/useSystemMessage` and
 * imports these. This module must stay a leaf — it imports nothing from the app.
 */

/** The states a single message can be in. Never "partial" — that is a composition outcome. */
export type SystemMessageState = "pending" | "active" | "completed" | "failed";

/**
 * A SystemMessage exactly as the OMS REST layer serializes it
 * (moqui.service.message.SystemMessage). Field set and semantics come from the
 * moqui-framework entity definition; EDI/OAGIS doc fields (docType, senderId, …)
 * are omitted because HotWax integration flows never populate them. Date-time
 * fields arrive as an ISO string or epoch-millis number depending on serialization.
 */
export interface SystemMessage {
  systemMessageId: string;
  systemMessageTypeId: string;
  systemMessageRemoteId: string;
  statusId: string;
  isOutgoing?: string;
  initDate?: string | number; // incoming: received date; outgoing: produced date
  processedDate?: string | number; // incoming: consumed date; outgoing: sent date
  lastAttemptDate?: string | number;
  failCount?: number;
  parentMessageId?: string;
  ackMessageId?: string;
  remoteMessageId?: string;
  messageId?: string;
  messageDate?: string | number;
  messageText?: string;
  createdByJobRunId?: string;
  lastUpdatedStamp?: string | number;
}

/**
 * Authoritative SystemMessage status → progress state. Source of truth: the
 * maarg-oms StatusItem seed (statusTypeId="SystemMessage"), 11 statuses.
 *
 * A direct map of the exact server-side status id — no normalization, no fuzzy
 * matching. "active" = a transfer is in progress (Sending/Consuming); staged states
 * are "pending"; Sent/Consumed/Confirmed are terminal success; Rejected/Cancelled/
 * Error are terminal failure. A new backend status is added here deliberately.
 */
const MESSAGE_STATES: Record<string, SystemMessageState> = {
  SmsgTriggered: "pending",
  SmsgProduced: "pending",
  SmsgReceived: "pending",
  SmsgSending: "active",
  SmsgConsuming: "active",
  SmsgSent: "completed",
  SmsgConsumed: "completed",
  SmsgConfirmed: "completed",
  SmsgRejected: "failed",
  SmsgCancelled: "failed",
  SmsgError: "failed",
};

/** The status ids this module recognizes — useful for tests and exhaustiveness checks. */
export const SYSTEM_MESSAGE_STATUS_IDS = Object.keys(MESSAGE_STATES);

/**
 * The progress state for a SystemMessage status id. An absent or unrecognized
 * status resolves to "pending" — add new backend statuses to MESSAGE_STATES
 * rather than relying on that default.
 */
export function messageState(statusId: string | null | undefined): SystemMessageState {
  if (!statusId) return "pending";
  return MESSAGE_STATES[statusId] ?? "pending";
}

/** True once the message has reached a terminal state (success or failure). */
export function isTerminal(statusId: string | null | undefined): boolean {
  const state = messageState(statusId);
  return state === "completed" || state === "failed";
}

/** True when the message reached HotWax successfully. */
export function isSuccess(statusId: string | null | undefined): boolean {
  return messageState(statusId) === "completed";
}

/** True when the message failed terminally. */
export function isFailure(statusId: string | null | undefined): boolean {
  return messageState(statusId) === "failed";
}

/** Scope guard: does this message belong to the given SystemMessageRemote? */
export function belongsToRemote(
  message: SystemMessage | null | undefined,
  remoteId: string | null | undefined,
): boolean {
  if (!message || !remoteId) return false;
  return message.systemMessageRemoteId === remoteId;
}

/**
 * A SystemMessageRemote — the remote system a SystemMessage is exchanged with, and
 * the anchor that scopes a shop's messages and jobs (moqui.service.message.SystemMessageRemote).
 */
export interface SystemMessageRemote {
  systemMessageRemoteId: string;
  remoteId?: string;
  internalId?: string;
  ownerShopId?: string;
  accessScopeEnumId?: string;
  description?: string;
}

/** Resolve the SystemMessageRemote id from a remote record or a raw id string. */
export function resolveRemoteId(remote: SystemMessageRemote | string | null | undefined): string {
  if (remote == null) return "";
  if (typeof remote === "string") return remote;
  return remote.systemMessageRemoteId ?? "";
}

/**
 * Shopify access-scope enums, ranked. `SHOP_RW_ACCESS` is the canonical read/write scope;
 * `SHOP_READ_WRITE_ACCESS` is the deprecated long form, still honoured so a shop on it surfaces
 * "update required" rather than looking broken.
 */
export const SHOPIFY_RW_ACCESS_SCOPE = "SHOP_RW_ACCESS";
export const SHOPIFY_LEGACY_RW_ACCESS_SCOPE = "SHOP_READ_WRITE_ACCESS";
export const SHOPIFY_NO_ACCESS_SCOPE = "SHOP_NO_ACCESS";

/** The shop fields the remote match needs — a subset of `ShopifyShop`. */
export interface ShopRemoteMatchTarget {
  shopId?: string;
  shopifyShopId?: string;
}

/**
 * The remotes belonging to one shop.
 *
 * A `SystemMessageRemote` is linked to a shop by TWO ids and neither lives on the shop record:
 *   - `remote.remoteId`   === `shop.shopifyShopId`  (remoteIdType   = SHOPIFY_SHOP_ID)
 *   - `remote.internalId` === `shop.shopId`         (internalIdType = HOTWAX_SHOP_ID)
 *
 * `remoteId` is the primary match; `internalId` only narrows further when the remote carries one,
 * because some remotes legitimately omit it. This is why a shop's messages cannot be scoped from
 * the shop row alone — `oms/shopifyShops/shops` returns no remote id at all, and an earlier
 * attempt to read `shop.systemMessageRemoteId` silently matched nothing.
 */
export function shopRemoteCandidates(
  remotes: SystemMessageRemote[] | null | undefined,
  shop: ShopRemoteMatchTarget | null | undefined,
): SystemMessageRemote[] {
  const shopifyShopId = String(shop?.shopifyShopId ?? "");
  const shopId = String(shop?.shopId ?? "");
  if (!shopifyShopId) return [];

  return (remotes ?? []).filter((remote) => {
    if (String(remote?.remoteId ?? "") !== shopifyShopId) return false;
    if (!shopId || !remote?.internalId) return true;
    return String(remote.internalId) === shopId;
  });
}

/** Best-access-first, so the chosen remote reflects the strongest scope the shop actually has. */
export function sortRemotesByAccess(candidates: SystemMessageRemote[]): SystemMessageRemote[] {
  const rank = (scope: string | undefined) => {
    const normalized = String(scope ?? "").trim().toUpperCase();
    if (normalized === SHOPIFY_RW_ACCESS_SCOPE) return 3;
    if (normalized === SHOPIFY_LEGACY_RW_ACCESS_SCOPE) return 2;
    if (normalized === SHOPIFY_NO_ACCESS_SCOPE) return 0;
    return 1;
  };
  return [...candidates].sort((first, second) => rank(second.accessScopeEnumId) - rank(first.accessScopeEnumId));
}

/**
 * Every remote id belonging to the given shops — the scope a live system-message poll needs.
 *
 * Returns an EMPTY array when nothing matches, which callers must treat as "poll nothing" rather
 * than "poll everything": an unscoped poll caches whatever traffic happens to be recent, for
 * remotes this app does not manage.
 */
export function resolveShopRemoteIds(
  shops: ShopRemoteMatchTarget[] | null | undefined,
  remotes: SystemMessageRemote[] | null | undefined,
): string[] {
  const ids = (shops ?? []).flatMap((shop) =>
    sortRemotesByAccess(shopRemoteCandidates(remotes, shop))
      .map((remote) => String(remote.systemMessageRemoteId ?? "").trim())
      .filter(Boolean));
  return [...new Set(ids)];
}
