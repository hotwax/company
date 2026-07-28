# Cache + sync — remaining work

**Status:** live tracker. Last reconciled against the code 2026-07-27.

§3a is the **single target** for the Shopify sync migration; §3b records the endpoint constraints
that shape it, so they are not re-derived.

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

**This section is closed (2026-07-27).** Every page below is converted; the only Pinia stores left
in the app are `user.ts`, `composer.ts`, and `workforce.ts` (session, agent surface — kept by
decision). The table is preserved with final dispositions.

| Page | Was reading from | Outcome |
| --- | --- | --- |
| `AppPermissions.vue` | `store/appPermissions` | **done** — `useAppPermissions` over cached `permissions` + `userGroups`; the `fetchGroupUsers` N+1 (one request per group) is gone |
| `SecurityGroupDetail.vue` | `store/authorization`, `store/util` | **done** — `useSecurity` (artifact groups/authorizations, `updateUserGroup` with `resyncDomain("userGroup")`) + `useSeed` |
| `Users.vue` | `store/user` (Solr), `store/util` | **done** — Solr search stays on `store/user` by decision (2026-07-26); `util` lookups moved to `useSeed` |
| `UserDetails.vue`, `CreateUser.vue`, `UserQuickSetup.vue`, `UserConfirmation.vue` | `store/user`, `store/util` | **done** — `util` lookups moved to `useSeed`; party/user reads stay on `store/user` session surface (§5.1 remains open only as a future cached-shape decision) |
| `ShopifyProductSync.vue` | `store/user` (session — correct) | **done.** Run state/pending counts are spine computeds (same source as the connection-details card, ending their disagreement); the two hand-rolled domain lists collapsed into one `productSyncPageDomains` built from `syncFeatureDomains` + `productSyncExtraDomains` at `PRODUCT_SYNC_RUN_WINDOW` depth; only the three genuinely-live counts (running bulk op, unsynced count, DataManager backlog) are fetched |
| `ShopifyProductSyncHistory.vue` | — | **done.** Store dependency removed; reads cached remotes via `useShopifySyncContext` and the run join. Its per-row `/errors` N+1 is gone (status gate + negative-result memo) |
| `ShopifyProductSyncUpgradeAssistant.vue` | `store/shopifyProductSync`, `store/shopifyProductSyncMigration`, `store/shopify` | **done** — repointed to `useShopifyProductSyncMigration` (the migration store moved wholesale; it was stateless delegates) |
| `ShopifyConnectionDetails.vue` | `store/shopifyProductSync`, `store/shopifyProductSyncMigration`, `store/shopify` | **done** — both cards on the shared sync session; migration/eligibility reads via `useShopifyProductSyncMigration`, access scopes via `useShopifyAccessScopes` |
| `ProductStoreOnboarding.vue` | `store/productStore`, `store/shopify`, `store/shopifyProductSync`, `store/util` | **done** — wizard state in `useProductStoreOnboardingWizard` (persisted), data in `useProductStoreData` + entity composables (`useSeed`, `useFacilities`, `useShopify` wizard fetchers) |
| `Klaviyo.vue`, `KlaviyoConnectionDetails.vue` | `store/klaviyo`, `store/util` | **done** — `useKlaviyo` (live reads by design: no cached Klaviyo domain; email types are a load-once memo) |
| `Settings.vue` | `store/user`, `store/util` (`maargInfo` only) | **done** — `maargInfo` → `useMaargConfig` in `useSeed` |

`store/user.ts` imports in `ShopifyOrderSync.vue` and `ShopifyOrderSyncConfigure.vue` are session
reads and are **correct as-is** — not conversion debt.

## 3. Store retirement ledger

**Closed 2026-07-27** — final state:

| Store | Disposition |
| --- | --- |
| ~~`util.ts`~~ | **deleted.** Reference reads live in `useSeed`/`useFacilities`; `bootstrapOrganization` moved to `useOrganization`; the stale persisted `util` localStorage key is removed once at `useSeed` module init |
| ~~`appPermissions.ts`~~ | **deleted** → `useAppPermissions` |
| ~~`klaviyo.ts`~~ | **deleted** → `useKlaviyo` |
| ~~`productStore.ts`~~ | **deleted** → `useProductStoreData` (module reactive + `sessionScope` reset; not persisted — the view re-derives on entry) |
| ~~`productStoreOnboarding.ts`~~ | **deleted** → `useProductStoreOnboardingWizard` (hand-rolled localStorage persistence, key `company.productStoreOnboarding`, with one-time migration off the Pinia key) |
| ~~`shopify.ts`~~ | **deleted** → `useShopify` §7b (connection create, remote update, locations, wizard mapping fetchers, access scopes) |
| ~~`shopifyProductSync.ts`~~ | **deleted.** Its 1,698 lines moved into `useShopify.ts` §8; it held no state and its actions were one-line delegates |
| ~~`shopifyProductSyncMigration.ts`~~ | **deleted** → `useShopifyProductSyncMigration` (wholesale move; it was `state: () => ({})` + delegate actions) |
| ~~`authorization.ts`~~ | **deleted** → `useSecurity` |
| `user.ts`, `composer.ts`, `workforce.ts` | **keep** — session, agent surface. Logout now calls `clearSessionScopedState()` (see `composables/sessionScope.ts`) instead of importing per-store `$reset()`s |

---

## 3a. Shopify sync stores — read/write ledger

One row per store member still reachable from a Shopify sync page, with its destination. This is the
**target**: when every row is ✅, 🔵 or ⚫, `shopifyProductSync.ts` and `shopify.ts` are gone.

Status key — ✅ done · 🟢 next · 🟡 to migrate · 🔵 delete (no endpoint; pure local computation)
· ⚫ dead (zero references) · 🔴 permanently live

### Reads

| Store member | Endpoint / DataDocument | → | Destination | IDB entity |
| --- | --- | --- | --- | --- |
| `fetchProductUpdateSyncRunState` | `SYSTEM_MESSAGE_DATA_MANAGER_LOG` | ✅ | `useShopifyProductSyncRunState` | `syncRuns` spine + `systemMessages` + `dataManagerLogs` |
| `fetchPendingProductUpdateRequests` | same doc, `statusId=SmsgProduced` | ✅ | `pendingRequests` on the same composable | `syncRuns` |
| `fetchShopSystemMessageRemoteId` | `admin/systemMessages` | ✅ | `useShopifySyncContext.remoteId` / `.remoteIds` | `systemMessageRemotes` ⋈ `shopifyShops` |
| `fetchSyncJobConfig` | `SERVICE_JOB_PARAMETER` | ✅ | `useShopifySyncJob` + `findSuitableSyncJob` | `serviceJobs` (params projected) |
| `fetchUnsyncedProductUpdates` | `shopify/graphql` | ✅ | `fetchUnsyncedProductUpdateCount` | 🔴 live — Shopify truth |
| `fetchShopifyAccessState` | `oms/systemMessageRemotes` | ✅ | cache-first already; server only on empty cache | `systemMessageRemotes` |
| `shopifyStore.fetchSystemMessageRemote` | `oms/systemMessageRemotes?pageSize=250` | ✅ | `.remote` (credentials pre-fill) and `.remoteId` (access scopes); store fn deleted | `systemMessageRemotes` |
| `fetchUpdateFilesToProcessCount` | `DATA_MANAGER_LOG_AND_PARAMETER` | ✅ | count over cached logs where `statusId ∉ terminal` | `dataManagerLogs` |
| `shopifyStore.getAccessScopes` | Pinia getter, **in-memory only** | 🟡 | needs a real home — scopes are lost on reload today | new table or composable state |
| `migrationStore.fetchEligibility` | `admin/dataManager/{configId}` + `admin/systemMessages/types` | 🟡 | `systemMessageTypes` is **already a cache table** | `systemMessageTypes` |
| `migrationStore.fetchLegacyTeardownState` | `admin/systemMessages/types/{id}` + doc | 🟡 | partly cacheable; Upgrade Assistant concern | `systemMessageTypes` |
| `fetchSetupState` | composes run-state + access-state | ✅ | composable assembly, no fetch of its own | derived |
| `fetchDashboardSummary` | composes 5; the page reads 2 | ✅ | composable assembly | derived |
| `fetchProductStoreContext` | **none** — filtered `payload.shops` | ✅ | store fn + helpers deleted; `relatedShops` is a computed over the cached shop list | — |
| `fetchRunningBulkOperation` | `shopify/graphql` | ✅ | class-C write-through (exists for terminal ops) | `shopifyBulkOperations` |
| `fetchWebhookSubscriptions` | `shopify/webhook-subscription` | 🔴 | move into `useShopify`, stays live | — |
| `fetchRecentlyUpdatedShopifyProducts` | `shopify/graphql` | 🔴 | move into `useShopify`, stays live | — |
| `searchShopifyProducts` | `shopify/graphql` | 🔴 | move into `useShopify`, stays live | — |
| `fetchLiveCatalogCounts` | `shopify/graphql` | 🔴 | move into `useShopify`, stays live | — |
| `fetchReviewStats`, `fetchPreflight` | `PRODUCT_STORE_PRODUCT` | 🔴 | **stay live by decision** — no product-store caching | — |
| `fetchErrorRecordCount` | `DATA_MANAGER_LOG_AND_PARAMETER` | ⚫ | still to delete (zero refs, confirmed) | — |

### Writes

| Store member | Endpoint | → | Write-through target |
| --- | --- | --- | --- |
| `configureSyncJob` | `POST …/clone` + `PUT admin/serviceJobs/{new}` | ✅ | `serviceJobs` via `refreshAfterMutation` |
| `cancelSystemMessage` | `PUT admin/systemMessages/{id}` | ✅ | `systemMessages` |
| `syncShopifyProducts` | `POST shopify/products/sync` | 🔴 | live trigger; refresh `syncRuns` after |
| `syncShopifyProductsOnDemand` | `POST sob/shopify/syncShopifyProductsOnDemand` | 🔴 | as above |
| `subscribeWebhook` / `unsubscribeWebhook` | `shopify/webhook-subscription` | 🔴 | Shopify-side state — nothing to cache |
| `shopifyStore.updateShopifyRemote` | remote PUT | ✅ | `systemMessageRemotes` via `refreshAfterMutation` |
| `shopifyStore.refreshAccessScopes` | `POST sob/shop/remote/{id}/accessScopes` | 🔴 | live, but the result must persist (see `getAccessScopes`) |
| `productStoreStore.updateCurrent` | **none** — local state | ✅ | call removed from ProductSync; store kept for onboarding |
| `pollBulkOperationResult`, `sendShopifyBulkQueryMessage` | — | ⚫ | delete |

**Tally:** every product-sync and order-sync store member has moved. `store/shopifyProductSync.ts`
(1,698 lines) is **deleted**. The 🔴 rows are still permanently live calls — they just live in
`useShopify.ts` now instead of a store, which was the point: a view should not import a store to reach
Shopify.

### Mutations — all in the composable

| Mutation | Endpoint | Home |
| --- | --- | --- |
| `configureProductSyncJob` | `POST …/clone` + `PUT admin/serviceJobs/{new}` | `useShopify` + `serviceJob` write-through |
| `syncShopifyProducts` | `POST shopify/products/sync` | `useShopify` |
| `syncShopifyProductsOnDemand` | `POST sob/shopify/syncShopifyProductsOnDemand` | `useShopify` |
| `cancelSystemMessage` | `PUT admin/systemMessages/{id}` | `useShopify` |
| `subscribeWebhook` / `unsubscribeWebhook` | `shopify/webhook-subscription` | `useShopify` |
| order sync: `updateSchedule`, `updateJobStatus`, `runNow`, `setLandmarkDate`, `searchShopifyOrders`, `requestSelectedOrders`, `retryIndividualOrder`, `configure` | various | `useShopifyOrderSync` (already) |

The store was a Pinia store in name only — `state: () => ({})`, with actions that were one-line
delegates to module functions. So this was a relocation, not a rewrite, and behaviour is unchanged
except where the composable version is strictly better (`configureProductSyncJob` also refreshes the
cached `serviceJob` row, which the store version did not).

**Remaining store imports on these pages:** `store/user` on the two order-sync views and ProductSync
(session permissions — correct, not debt) and `store/shopifyProductSyncMigration` on ConnectionDetails
and UpgradeAssistant (out of scope by decision).

### Composable surface — reviewed and shrunk

An adversarial review of the sync-core surface found **five exports with zero callers anywhere in
`src/`**, since deleted: `useShopifySyncCapabilities`, `useShopifyProductSync`,
`useShopifyProductSyncSession`, `useShopifyProductSyncRuns`, `getSyncPollingDelay` (~150 lines, no
behaviour change). `useShopifyProductSyncRuns` had been superseded by the shop-scoped
`useShopifySyncRuns` spine; its spec was rewritten against the spine so the scoping properties it
guarded stayed covered rather than being deleted with it.

Still recommended, not yet done — each verified against real call sites:

1. **One session function, not three.** `useShopifySyncSession` (engine) is real; give it a multi-feature
   signature and `useShopifyConnectionSyncSession` + `useShopifyOrderSyncPolling` collapse into it.
   `OrderSyncSessionOptions.remoteIds` and `ConnectionSyncSessionOptions.productSyncJobNames` are dead
   fields — neither is ever passed, and `remoteIds` is not even forwarded.
2. **One shop-scoped summary, not two.** `useShopifyProductSyncRunState` and `useShopifyOrderSyncCard`
   are the same shape and mount on the SAME page, so `ShopifyConnectionDetails` currently opens two full
   `useShopifySyncContext` subscription sets. `useShopifySyncSummary(feature, shopIdSource)` with one
   shared context replaces both; each caller uses only 2 of the ~12 keys returned today.
3. **`useShopifyProductSyncRun` should be recomposed, not rewritten.** Its `errorText`, `bulkOperation`
   and `mdmLog` blocks are near-identical to `useSystemMessageErrors`, `useBulkOperationForMessage`
   (both `useSystemMessage.ts`) and `useDataManagerLogForMessages` (`useDataManager.ts`). Keep the
   exported entry point — three views bind to it — and drop four hand-rolled subscriptions.
4. **Un-export the internals** (`useShopifySyncJob`, `useShopifySyncMessages`, `useShopifySyncImports`,
   `useShopifySyncRuns`, `syncFeatureDomains`, `syncFeatureInterval`); inline `useShopifySyncMappings`
   into its single caller.
5. **`ShopifyProductSync.vue` hand-rolls the class-A domain list TWICE** (two near-identical blocks) and
   calls `useCacheSync()` directly, with `total: 25` for messages while the page's read expects
   `PRODUCT_SYNC_RUN_WINDOW`. Same fetch-depth-vs-read-limit mismatch documented in §4.6 — fix when that
   page converts.

⚠️ **`useCachedList` does not dedupe subscriptions** — one Dexie `liveQuery` per call. `systemMessageCache`
currently has 5 independent subscribers and `dataManagerLogCache` 7. Merges 2–4 reduce this; worth
measuring before adding another.

## 3b. Verified endpoint constraints — do not re-attempt

Probed live against the local OMS 2026-07-27. Each of these was reached by trying the obvious thing
first; they are recorded so the next attempt starts from the answer.

| Question | Answer | How it was proven |
| --- | --- | --- |
| Can `dataManagerLogs` be scoped by shop? | **No.** `admin/dataManager/details` ignores every shop filter | passing a **nonexistent** shop (`99999`) returned the full unfiltered set, identical to the control |
| Can `dataManagerLogs` be scoped by product store? | **No.** `productStoreId` silently ignored | same unfiltered result as config-only |
| Does `DATA_MANAGER_LOG_AND_PARAMETER` solve it? | **No.** It *does* scope by shop (`parameterName: "shopId"`) but returns no `systemMessageId`, so it cannot be joined to a message. Also no `createdDate`, and ordering is ignored | field list is `logId, parameterName, parameterValue, failedRecordCount, totalRecordCount, finishDateTime, configId`; shop 10000 → 0 rows, 10010 → 25 |
| Can logs be fetched for many messages at once? | **No.** Multi-value `systemMessageId_op=in` returns **0 rows** — same failure as `admin/systemMessages` | single-value works, multi-value returns nothing |
| Can a log be fetched by id? | **Yes** — this is why per-id enrichment is the strategy | `?logId=` and `?systemMessageId=` both return the full record |
| Are system messages shop-scopable? | **Yes, already.** `systemMessageRemoteId` → remote → `internalId` = shopId, and a remote belongs to exactly one shop, so `(remote, type)` partitions *within* shop | live: 5 rows for shop 10000 vs 200 for 10010 in one table |
| Does `SYSTEM_MESSAGE_DATA_MANAGER_LOG` honour a date cursor? | **Yes** — `initDate_from` inside `customParametersMap` | 4 rows vs 50 unfiltered |
| Where does `orderByField` go on `oms/dataDocumentView`? | **Inside `customParametersMap`.** At the top level it is ignored and rows come back oldest-first | top-level `-initDate` returned a June row; the same request with it nested returned the newest July row |
| Does the cursor see a late-attaching import? | **No.** `initDate` is stamped at production and never moves | hence the spine re-reads its newest page each tick rather than cursoring on `initDate` |
| Does `POST shopify/order-sync/{shopId}/job` work? | **No.** 400 `Cannot get property 'hotwax' on null object` (backend defect) | replaced by the generic clone: `POST admin/serviceJobs/queue_ShopifyOrderSync/clone` + `PUT` the clone's `serviceJobParameters` (`configureOrderSyncJob`) |
| Does `POST shopify/order-sync/{shopId}/retry` work? | **No.** Same 400 | replaced by the fromDate window replay (next rows) |
| Can a SystemMessage be produced generically? | **No.** `POST admin/systemMessages` and `admin/systemMessages/produce` both **405** | probed live 2026-07-27 |
| Does `runNow` accept parameter overrides in the body? | **No.** 200 + jobRunId, but the run records `fromDate:null` — the body is ignored | run M2399236's recorded parameters |
| Can a job's `fromDate` parameter drive a targeted window import? | **Yes** — swap the parameter, `runNow`, restore. This is the retry alternate | run M2399240 (`hasError: N`) produced message M228628 with window `[2026-07-23T02:40Z, now]` |
| What timestamp format does the job runner take? | `yyyy-MM-dd HH:mm:ss`, read as **UTC**. ISO fails the run | run M2399238 errored `Timestamp format must be yyyy-mm-dd hh:mm:ss[.fffffffff]`; the SQL-format retry recorded the intended UTC window |
| What envelope does `shopify/graphql` return? | The body is under **`response`** (`resp.data.response.orders`), not `data` | every live order search returned 0 results while `data`-shaped unit fixtures passed; fixed in `searchShopifyOrders` |
| Can a Shopify type mapping be deleted? | **No.** `DELETE oms/shopifyShops/typeMappings` → 405; `…/typeMappings/{key}`, `oms/shopifyShops/{shopId}/typeMappings/{key}` and `admin/shopifyShops/typeMappings` → 404 | so a RENAME retires the old key by re-posting it with an empty `mappedValue` (`retireTypeMapping`), and readers treat a value-less row as unmapped |
| Is there a by-PK read for a SystemMessageRemote? | **No.** `GET oms/systemMessageRemotes/{id}` → 405 for every id, including ones the list returns | the domain uses `refetchScope` (list filtered by `systemMessageRemoteId`) instead; the misconfigured `byPk` had silently broken every remote write-through |
| What does `GET admin/serviceJobs/{jobName}` return? | A **single-record envelope** `{ jobDetail: … }` — the list route uses `serviceJobList` | the domain declares `byPkRecordKey: "jobDetail"`; without it the refresh stored a key-less envelope and every serviceJob write-through was silently dropped |

## 3c. Cross-shop scope leaks outside the sync pages — nondeterminism fixed

Found by an audit for the two bug classes that shipped on the sync pages (projected-field-off-`records`,
and a non-reactive scope that omits itself and reads the whole table). **The sync path is clean** — zero
remaining instances. These four are the same class in other views, verified by reading the code:

The cross-shop READ is deliberate on all four: these are NetSuite mapping screens with no shop context,
showing Shopify values as reference. Each passes `undefined` explicitly. The defect was narrower and
worse than "arbitrary" — the single winner depended on IndexedDB iteration order, so it was
**nondeterministic between reloads**.

| file:line | Entity | Failure | Status |
| --- | --- | --- | --- |
| `ShipmentMethods.vue:108` | `shopifyCarrierShipments` | `byCarrierAndMethod` keys on `${carrierPartyId}_${shipmentMethodTypeId}` with **no shop in the key**, so two shops mapping the same carrier+method collapse and one is silently dropped — invisible, since a collapse renders as a normal single value | ✅ order stabilised; `allByCarrierAndMethod` added so a caller can see `length > 1` |
| `Departments.vue:88` | `shopifyLocations` | `find(l => l.facilityId === …)` picked a shop at random for a facility mapped in more than one | ✅ order stabilised |
| `PaymentMethods.vue:88` | `shopifyTypeMappings` | `find(m => m.mappedValue === …)` returned the first match across shops | ✅ order stabilised |
| `SalesChannel.vue:88` | `shopifyTypeMappings` | Same shape; the cross-shop read **is** documented as deliberate at `:83-84` | ✅ order stabilised |

Fixed by `stableByShop` in `useShopify.ts`, applied where these three composables read UNSCOPED. Verified
live: the rendered Shopify columns on `/netsuite/shipment-methods` are byte-identical across remounts.

⚠️ **Stable is not correct.** Where two shops map the same thing, one value is still a lie — the honest
display is the set. `allByCarrierAndMethod` exposes it; deciding what these screens should render is a
product question, deliberately left at the call site rather than guessed.

Also: `useFacilities.ts:199/219/305` do numeric date math on `thruDate` read from `records` (raw) rather
than `rows` (where `date` coercion has run). Two composables over the same table can therefore disagree
about whether one membership is active — `:199` over-counts on a non-numeric value, `:219` drops the row.
One-word fix each. And `useFacilities.ts:309` hoists `Date.now()` outside its `computed`, so a membership
expiring mid-session never disappears.

**Structural note:** `warnOnScopeMiss` (`useCachedList.ts:56-74`) cannot catch this class — it returns
early when `scope` is absent, which is exactly the whole-table case. Signatures typed
`string | undefined` rather than `MaybeRefOrGetter` invite it; the ones carrying a `limit` are the most
dangerous, since the whole-table read becomes "newest N across all tenants" — byte-for-byte the shipped
10000/10010 bug. The riskiest with no caller today: `useLatestSystemMessage`, `useSystemMessages`,
`useServiceJobRuns`, `useProductUpdateHistories`.

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
   `useShopifyConnectionSyncSession` is the first per-route declaration and the shape to copy: a page
   that renders two features composes both domain lists into ONE session, because every
   `useCacheSync()` owns its own worker.
5. **Order sync still reads two independent windows**, not the shop-scoped `syncRun` spine product
   sync uses, so it inherits the window-overlap gap documented at `useShopifyProductSyncRunState`.
   The card matches the monitoring screen deliberately; moving order sync onto the spine should move
   both together.
6. **Window depth is a per-scope setting that only recently became honoured.** Class-A domains stopped
   paging at the first already-cached row, so `total` applied only to an EMPTY scope — a window first
   synced shallow stayed shallow and raising the number did nothing. Both domains now page deep while
   short of target and incrementally once full (one `pageNewestFirst` per scope either way, so the tick
   budget is unchanged). Consequence to remember: **the fetch depth and the read limit must be one
   number** — they had drifted to 200/100 and every matching row sat in 101–200, so the summary
   reported no completed sync from a cache that held the answer. `PRODUCT_SYNC_RUN_WINDOW` is that
   number for product sync; order sync has no equivalent constant yet.
7. **`deriveSyncProgress` reports a completed batch with zero import logs as import "Completed"**,
   which renders the contradictory pair "Completed" + "No HotWax import has been produced yet" (live
   on shop 10000). Pre-existing and shared by the card and the monitoring screen — "waiting" or
   "skipped" is probably the honest state. **Partially fixed:** `orderSyncSummary` no longer lets a
   zero-log batch win the `latestCompletedBatch` pick (observed live: one queued run returning zero
   orders made the card claim "No completed batch recorded" over a cached, days-old real import).
   The progress-row semantics themselves are unchanged.
8. **Cold-cache hydration race in `cachedSyncMessageHistory` (fixed).** An empty SCOPED result is now
   "cannot answer", deferring to the server document. Observed live on a fresh profile: the first-ever
   product-sync visit read the cache after another remote's tick had committed, got zero rows for the
   route's shop, and dropped a shop with months of history into the first-time wizard; a reload
   "fixed" it. Cost of the fix: one document request per visit only for shops with genuinely no runs.

## 4a. Flaky test

`tests/views/CreateFacility.coldCache.spec.ts` (jsdom, `// @vitest-environment jsdom`) failed 2 of its 4
cases once in a full-suite run and passed 4/4 in isolation and on two subsequent full runs. Order- or
timing-sensitive, not caused by the change under test at the time. It will bite CI intermittently —
worth pinning before it is blamed on something else.

## 4b. Scheduler: per-activation clocks (fixed)

The worker's last-run clock was keyed on the domain **name**. One page can activate the same domain
several times with different args and cadences — connection details activates `systemMessage` for
product-sync types and again for order-sync types, and `dataManagerLog` three times for three configs.
All wrote `lastRunAt["systemMessage"]`.

Trace: on the first tick neither has run, so both go. After that the faster activation restamps the
shared clock, the slower one's interval never elapses, and it runs **exactly once per page entry and
then never again**. Silent, because the first tick does run it — the screen is right on arrival and
quietly stops updating. The session's own comment claimed per-feature cadence, which is not what the
scheduler did.

Fixed by keying the clock on `activationKey(entry)` = name + stable-stringified args
(`src/workers/syncRegistry.ts`), applied in `dueDomains`, both stamp sites, `setDomains` retention, and
`syncDomainNow`'s read-back. Identical activations still share one clock (same work); cadence is
excluded from the key so escalating 60s → 10s keeps the clock rather than resetting it.

Verified live on connection details: three consecutive cycles each fetch **both** features' message
types and all three log configs. 9 unit tests in `syncRegistry.activationClock.spec.ts`, including one
that reproduces the old shared-clock symptom so the keying cannot be silently lost.

⚠️ Not verified: the observed cycle gap looked shorter than the 60s idle cadence, which may mean
something re-invokes `start()` more often than expected. Worth measuring before trusting the interval
numbers.

## 4c. Shop↔remote matching now accepts the OMS-side key (fixed)

`shopRemoteCandidates` hard-required `shop.shopifyShopId` and matched `remote.remoteId === shopifyShopId`.
Two consequences: a shop row without a cached `shopifyShopId` resolved to **no remote at all** — the exact
connection the credentials modal is opened to repair — and `remote.remoteId` was tautologically equal to
`shop.shopifyShopId`, so reading the remote added nothing.

Now matches on either side: `internalId` + `internalIdType: HOTWAX_SHOP_ID` (the canonical OMS-side key,
always present on a real Shopify remote) **or** `remoteId === shopifyShopId`. When both ids are known they
must still agree, so one shop cannot claim another's remote. `internalIdType` is required on the
internalId path so a non-Shopify remote (AWS, SFTP, NiFi) with a colliding `internalId` cannot match.

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
