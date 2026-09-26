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
  /**
   * What `internalId` refers to — `HOTWAX_SHOP_ID` on a Shopify shop remote.
   *
   * Load-bearing: it is what distinguishes a shop remote from an AWS/SFTP/NiFi remote that happens to
   * carry a colliding `internalId`, which is why the OMS-side match requires it.
   */
  internalIdType?: string;
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

/** May this OMS write to the shop? Only the canonical scope counts; the publishing services compare
 *  against SHOP_RW_ACCESS exactly, so the deprecated long form is read-only here too. */
export function isWritableAccessScope(accessScopeEnumId: string | null | undefined): boolean {
  return String(accessScopeEnumId ?? "").trim() === SHOPIFY_RW_ACCESS_SCOPE;
}

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
/** `internalIdType` a Shopify shop remote carries — verified live on every Shopify remote. */
const HOTWAX_SHOP_ID_TYPE = "HOTWAX_SHOP_ID";

export function shopRemoteCandidates(
  remotes: SystemMessageRemote[] | null | undefined,
  shop: ShopRemoteMatchTarget | null | undefined,
): SystemMessageRemote[] {
  const shopifyShopId = String(shop?.shopifyShopId ?? "");
  const shopId = String(shop?.shopId ?? "");
  if (!shopifyShopId && !shopId) return [];

  return (remotes ?? []).filter((remote) => {
    const remoteId = String(remote?.remoteId ?? "");
    const internalId = String(remote?.internalId ?? "");

    /**
     * TWO ways to match, because either side's id may be the one we have.
     *
     * `internalId` + `internalIdType: HOTWAX_SHOP_ID` is the OMS-side key and the canonical link — it
     * is always present on a Shopify remote. `remoteId === shopifyShopId` is the Shopify-side key.
     *
     * ⚠️ Requiring `shopifyShopId` (the previous behaviour) made this unusable for the case it is most
     * needed in: a connection whose cached shop row has no `shopifyShopId` yet resolved to NO remote,
     * so the credentials modal could not pre-fill the id and the access-scope modal reported "no remote
     * found" — for a shop whose remote exists and is findable by `internalId`. It also made
     * `remote.remoteId` tautologically equal to `shop.shopifyShopId`, so reading the remote added
     * nothing.
     *
     * `internalIdType` is required on the internalId path so a non-Shopify remote (AWS, SFTP, NiFi …)
     * that happens to carry a colliding `internalId` cannot match.
     */
    const matchesOmsSide = Boolean(shopId) && internalId === shopId &&
      String(remote?.internalIdType ?? "") === HOTWAX_SHOP_ID_TYPE;
    const matchesShopifySide = Boolean(shopifyShopId) && remoteId === shopifyShopId;

    if (!matchesOmsSide && !matchesShopifySide) return false;

    /**
     * When BOTH ids are known they must agree — this is what stops one shop claiming another's remote.
     *
     * Deliberately NOT gated on `internalIdType`: a remote whose `remoteId` matches but whose
     * `internalId` names a different shop must be rejected whether or not it declares a type. Gating it
     * would let a mistyped remote through on the Shopify-side match alone.
     */
    if (shopId && internalId) return internalId === shopId;
    return true;
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
