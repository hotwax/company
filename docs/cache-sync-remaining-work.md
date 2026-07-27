# Cache + sync — remaining work

**Status:** live tracker. Last reconciled against the code 2026-07-27.

The **architecture** of the cache/sync layer lives in [`../AGENTS.md`](../AGENTS.md) §4 — classes,
layer map, recipes, and the hard-won rules. This document holds only what is **not yet done**.

It consolidates four planning docs whose design content is now either implemented or in `AGENTS.md`;
the originals are kept for their reasoning trail in
[`archive/`](archive/): `cache-sync-rollout-plan.md`, `list-pages-cache-conversion.md`,
`facility-detail-plan.md`, `worker-polling-service-design.md`.

---

## 1. Built and in use

Every phase of the original rollout except promotion to `@common` has landed: the Dexie cache with
`defineCachedEntity`, the worker registry + harness, class-B snapshot sync with once-per-login
markers and `refreshAfterMutation`, class-A scoped polling (per-type windows for system messages),
class-C on-demand (`shopifyBulkOperation`), and the composable read layer. The Tier 2 lookup domains
(statuses, enums, facility/facility-group/user-group/product/shipment-method/payment-method/role
types, geos, enum types) and the shop-scoped Tier 3 domains (`shopifyLocations`,
`shopifyTypeMappings`) all exist. `store/facility.ts`, `store/netSuite.ts`, and
`store/shopifyOrderSync.ts` are gone.

Converted list/detail pages: `ProductStore`, `ShopifyConnections`, `FindFacilities`, `FindGroups`,
`FacilityGroupDetail`, `FacilityDetails`, `Parking`, `SecurityGroups`, the four Shopify mapping
pages, the five NetSuite mapping pages, and `ShopifyOrderSyncHistory`.

## 2. Screens still off the cache layer

| Page | Still reads from | Needs |
| --- | --- | --- |
| `AppPermissions.vue` | `store/appPermissions` | Tier 1 conversion over cached `permissions` + `userGroups`; **fixes the `fetchGroupUsers` N+1** (one request per group) |
| `SecurityGroupDetail.vue` | `store/authorization`, `store/util` | `useSecurity` + `useSeed` |
| `Users.vue` | `store/user` (Solr), `store/util` | **Deliberately not converting** the Solr-backed search (decided 2026-07-26). Only its `util` lookups move to `useSeed` |
| `UserDetails.vue`, `CreateUser.vue`, `UserQuickSetup.vue`, `UserConfirmation.vue` | `store/user`, `store/util` | party/user reads still need a decision on the cached shape (§5.1); `util` lookups move to `useSeed` |
| `ShopifyProductSync.vue` | `store/productStore`, `store/shopifyProductSync` | the largest remaining pre-cache view; still runs its own `progressPoll` interval instead of worker-driven class-A polling |
| `ShopifyProductSyncHistory.vue` | `store/shopifyProductSync` | correlate cached `systemMessages` ⋈ `dataManagerLogs` ⋈ `shopifyBulkOperations` (the class-C domain now exists, so this is unblocked) |
| `ShopifyProductSyncUpgradeAssistant.vue`, `ShopifyConnectionDetails.vue` | `store/shopifyProductSync`, `store/shopifyProductSyncMigration`, `store/shopify` | fold into `useShopify` §4 |
| `ProductStoreOnboarding.vue` | `store/productStore`, `store/shopify`, `store/shopifyProductSync`, `store/util` | wizard state legitimately stays in `store/productStoreOnboarding`; its **data** reads should come from the entity composables |
| `Klaviyo.vue`, `KlaviyoConnectionDetails.vue` | `store/klaviyo`, `store/util` | **open question** — Klaviyo has no cached domain and was never scoped into the sweep (§5.4) |
| `Settings.vue` | `store/user`, `store/util` (`maargInfo` only) | `maargInfo` → `useMaargConfig` in `useSeed` |

`store/user.ts` imports in `ShopifyOrderSync.vue` and `ShopifyOrderSyncConfigure.vue` are session
reads and are **correct as-is** — not conversion debt.

## 3. Store retirement ledger

| Store | Disposition |
| --- | --- |
| `util.ts` | **Should already be gone** — `useSeed` replaced it. Still imported by 9 views for lookups + `maargInfo`. Retiring it is the single highest-leverage cleanup left |
| `appPermissions.ts` | retire with `AppPermissions.vue` |
| `klaviyo.ts` | pending the Klaviyo scoping decision |
| `productStore.ts` | shrink to nothing as onboarding + product-sync convert (`useProductStores` owns the reads) |
| `shopify.ts` | fold into `useShopify` |
| `shopifyProductSync.ts` (1.7k lines), `shopifyProductSyncMigration.ts` (1.1k lines) | the big one: becomes a thin view-model over `useShopify` §2–4, mirroring what order sync already did |
| `authorization.ts` | fold into `useSecurity` |
| `user.ts`, `productStoreOnboarding.ts`, `composer.ts`, `workforce.ts` | **keep** — session, wizard state, agent surface |

## 4. Known deviations and cleanups

1. **Two workers, not one.** Class B runs in an app-lifetime worker (`appCacheBootstrap`), class A in
   a view-scoped one (`useCacheSync`), because their lifecycles differ. Bounded and intentional;
   consolidating behind one long-lived worker with per-domain activation is the candidate cleanup.
2. **`useLiveDashboard.ts` has no consumers.** The cache layer took over most of its job. Either wire
   `ShopifyProductSync.vue` to it during that conversion, or delete it.
3. **Bootstrap request burst.** Every class-B domain snapshots at once on login. Staggering has not
   been implemented; confirm the load profile with backend owners.
4. **Class-A registration lifetime.** Which screens activate `systemMessage` / `dataManagerLog` is
   still ad hoc per view; there is no single declaration of "this route needs these live domains".

## 5. Open questions

1. **Cached shape for users/parties** — party vs user-login vs a joined row, and whether the
   `oms/users` name join is cached alongside. Gates the four user pages.
2. **Volume at production scale** for facilities and permissions. Client-side filtering is the
   default for these sets on the evidence available (test instance: 25 facilities, 21 facility
   groups, 79 permissions, 156 service jobs; 500 facilities is already a sky-high number for this
   app), but production counts have not been measured.
3. **TTL for on-demand (class C) associations** — 10 minutes proposed. Mutations already refresh
   explicitly, so the TTL only covers edits made outside the app.
4. **Klaviyo** — in or out of the cache sweep?
5. **Volatile-refresh affordance placement** on detail pages — header icon button (matches the
   Settings cache card) vs inline beside the section. Header is the standing recommendation.

## 6. Promotion to `@common`

`pollingService.ts`, `pollingWorkerHarness.ts`, and `syncRegistry.ts` are written as framework code
but live in this app. Promotion is deliberately last, gated on the pattern being proven across
enough domains here.

- Already in `@common`: `core/workerFactory.ts` (Comlink worker spawn) and `core/workerRemoteApi.ts`
  (bare-`fetch` client for worker realms). What is missing there is worker *policy*, not plumbing.
- **Blast radius:** the token-publish hook belongs in `@common`'s auth layer, which **every** AccxUI
  app depends on (`company`, `inventory-count`, `order-routing`, …). Upside: other apps adopt a
  correct polling service and shed snapshot-token bugs. Cost: a wider review surface, and the review
  must confirm the token is never logged or persisted in plaintext.
- Open decisions carried over: BroadcastChannel push only vs push + an IndexedDB bootstrap mirror
  (matters if a worker can start before the first push); and where the interval lives for polls light
  enough that cadence isolation is not the deciding factor.
- Fix `workerRemoteApi`'s array-param serialization at the same time — the app currently works around
  it in [`workerFetch.ts`](../src/workers/domains/workerFetch.ts) because the shared package is used
  by other apps (see `AGENTS.md` §4.5).

## 7. Deliberately out of scope

- Offline write queue / mutation replay.
- Cross-tab and cross-session cache persistence (the cache clears on logout).
- Retention / age-based pruning of class-A tables.
- Service Worker or background sync while the tab is closed.
- Converting Solr-backed, relevance-ranked search (`Users.vue`) to a client-side snapshot.
