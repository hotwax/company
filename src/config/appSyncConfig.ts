/**
 * APP-LEVEL SYNC CONFIGURATION — what *this* app wants cached, and how narrowly.
 *
 * The sync machinery (worker harness, snapshot/incremental factories, cache) is generic and knows
 * nothing about Shopify, order sync, or which records matter. Everything app-specific lives here,
 * so a different app reusing the same machinery declares its own seed set and its own filters
 * instead of editing core code.
 *
 * The rule this exists to enforce: **do not poll an arbitrary window of transactional data.**
 * Polling "the newest 100 system messages" caches whatever happens to be recent, which is usually
 * not what any screen needs. Instead a live domain declares a SCOPE — for system messages, the
 * remotes belonging to the shops this app actually manages.
 */

/**
 * A message type this app needs cached, with its OWN window.
 *
 * Per-type windows exist because a single newest-N window per remote does not guarantee coverage of
 * any particular type. Verified on real data: 200 cached messages for one remote spanned just 14
 * hours and were 86% `ShopifyOrderSync`, while the `BulkQueryShopifyProductUpdates` message the
 * product-sync screen needs was seven weeks older and therefore absent. High-volume traffic starves
 * every other type out of a shared window.
 *
 * Declaring types here makes coverage deterministic: each (remote, type) pair gets its own request
 * and its own cursor, served by the `[systemMessageRemoteId+systemMessageTypeId+initDate]` index.
 */
export interface LiveMessageType {
  systemMessageTypeId: string;
  /** Messages to keep for this type per remote. Small — screens show a handful. */
  total?: number;
  batchSize?: number;
}

/** How a live (class A) domain narrows what it pulls. */
export interface LiveDomainScope {
  /**
   * Restrict system messages to the remotes of the Shopify shops in the cache.
   *
   * Resolved at sync time inside the worker by reading the cached `shopifyShops` table, so it
   * follows shops being added or removed without any code change. When no shops are cached yet the
   * domain performs no fetch at all rather than falling back to an unscoped pull.
   */
  scopeToShopifyShopRemotes?: boolean;
  /** Extra server-side query params merged into every request for the domain. */
  filters?: Record<string, unknown>;
  /** Records to keep per sync pass. */
  total?: number;
  batchSize?: number;
  /**
   * The message types this app's screens read. When present the domain syncs PER TYPE rather than
   * taking one shared newest-N window, so a noisy type cannot crowd out a quiet one.
   */
  types?: LiveMessageType[];
}

export interface AppSyncConfig {
  /** Class-A domains and their scopes, keyed by registry name. */
  live: Record<string, LiveDomainScope>;
  /**
   * Class-B seed domains excluded from the login sync for this app.
   *
   * The catalog lists everything the machinery *can* cache; an app opts out of what it does not
   * use, so it never pays for another app's seed data.
   */
  excludeSeedDomains?: string[];
}

export const appSyncConfig: AppSyncConfig = {
  live: {
    /**
     * System messages, scoped to the remotes of the shops this app manages.
     *
     * Replaces an unscoped "newest 100" poll, which pulled messages for remotes the app never
     * shows and still missed the ones a screen asked for.
     */
    systemMessage: {
      scopeToShopifyShopRemotes: true,
      total: 200,
      batchSize: 50,
      /**
       * The types the sync screens actually read. Each gets its own window per remote, so the
       * product-sync page always has its `BulkQueryShopifyProductUpdates` history even though order
       * traffic outnumbers it by ~50:1.
       *
       * Totals are deliberately small: these feed "recent runs" lists, not archives. Six types × two
       * remotes × 25 is ~300 rows, cheaper than the single 200-row window it replaces and correct.
       */
      types: [
        { systemMessageTypeId: "BulkQueryShopifyProductUpdates", total: 25 },
        { systemMessageTypeId: "BulkOperationsFinish", total: 25 },
        { systemMessageTypeId: "GenerateCreatedProductIdsFeed", total: 25 },
        { systemMessageTypeId: "GenerateUpdatedProductIdsFeed", total: 25 },
        { systemMessageTypeId: "GenerateReturnedOrderIdsFeed", total: 25 },
        { systemMessageTypeId: "ShopifyOrderSync", total: 50 },
      ],
    },

    /**
     * DataManager logs. Unscoped for now — the log tables are shared across sync types and the
     * import screens read them by `configId`, which the domain already accepts per activation.
     */
    dataManagerLog: {
      total: 100,
      batchSize: 25,
    },
  },

  excludeSeedDomains: [],
};

/** The scope an app declares for a live domain, or an empty scope when it declares none. */
export function liveScopeFor(domain: string): LiveDomainScope {
  return appSyncConfig.live[domain] ?? {};
}
