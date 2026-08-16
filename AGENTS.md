# Company app — architecture and agent instructions

This is the single instruction file for this repo. Workspace-wide AccxUI rules (Ionic component
conventions, UI/CSS constraints, target preflight, validation policy) live in
[`../../AGENTS.md`](../../AGENTS.md) and still apply — everything below is what is specific to
`company`.

## 1. What this app is

The Company app is the HotWax Commerce **organization-configuration PWA**: the place an operator
stands up and administers an OMS tenant. Functional areas, each a route family:

| Area | Routes | Views |
| --- | --- | --- |
| Product stores | `/product-store`, `/product-store-details/:id`, `/create-product-store`, `/product-store-onboarding`, `/clone-product-store`, `/add-configurations/:id` | `ProductStore*`, `AddConfigurations` |
| Facilities & groups | `/facilities/*`, `/facility-details/:id`, `/facility-group-detail/:id`, `/parking`, `/create-facility/*` | `Find*`, `Facility*`, `CreateFacility`, `AddFacility*` |
| Users & security | `/users`, `/user-details/:partyId`, `/create-user`, `/user-quick-setup/:partyId`, `/security-groups`, `/app-permissions` | `User*`, `Security*`, `AppPermissions` |
| Shopify integration | `/shopify`, `/shopify-connection-details/:id/**` (locations, shipment/payment methods, sales channels, product types, product-sync, order-sync) | `Shopify*` |
| Klaviyo integration | `/klaviyo`, `/klaviyo/:id` | `Klaviyo*` |
| NetSuite integration | `/netsuite/*` (shipment methods, payment methods, inventory variances, sales channel, departments) | `NetSuite`, `ShipmentMethods`, `PaymentMethods`, `InventoryVariances`, `SalesChannel`, `Departments` |
| AI agent surface | `/composer`, `/workforce` | `views/agent/*` |
| App shell | `/login`, `/reset-password`, `/settings` | `Settings`, `ResetPassword`, `Login` (from `@common`) |

The two heaviest, most actively developed surfaces are **Shopify product sync** and **Shopify batch
order sync** (`/shopify-connection-details/:id/product-sync|order-sync`). Both are compositions over
four backend entities — `ShopifyShop`, `ServiceJob`, `SystemMessage`, `DataManagerConfig`/`Log` — not
bespoke features. Treat them that way: shared behavior belongs in the entity layer, not duplicated
per feature.

## 2. Workspace context and commands

`apps/company` is its own git repo, checked out inside the **AccxUI pnpm workspace** at
`ionic-apps/accxui`. It is not a standalone project:

- `@common` → `../../common` (Vite alias). Shared auth, HTTP client, i18n, logger, worker factory,
  `Login`/`FastTravel` components. `@` → `src`.
- Dependency versions come from the workspace **pnpm catalog** (`catalog:` in `package.json`).
  `node_modules` is a symlink to the workspace root.
- ESLint config is the workspace `eslint.config.js`.
- Vitest is a workspace dev dependency; **there is no vitest config file** in this app (see §9).

```bash
pnpm dev          # vite dev server on :8100
pnpm build        # production build
pnpm test:unit    # vitest run --no-cache
pnpm typecheck    # vue-tsc --noEmit
pnpm lint         # eslint .
```

Env config comes from `.env` (see `.env.example`): `VITE_OMS_TYPE` (`MOQUI`), locale, view size,
`VITE_APP_PERMISSION_ID`, `VITE_NETSUITE_INTEGRATION_TYPE_MAPPING`. Deployment is Firebase Hosting
(`firebase.json`, targets `company` / `company-dev`) — see [`README.md`](README.md).

## 3. Runtime shape

- **Stack:** Vue 3 (`<script setup>`) · Ionic 8 (`mode: 'md'`) · Vite · TypeScript · Pinia (with
  `pinia-plugin-persistedstate`) · vue-i18n · Dexie (IndexedDB) · Comlink web worker · Luxon.
- [`src/main.ts`](src/main.ts) — creates the app, registers Ionic/i18n/pinia/router, and calls
  `initialiseConfig()` from `@common` to hand the shared layer the user store's session getters,
  `postLogin`/`postLogout` hooks, and the router. Also defines the legacy `$filters.formatDate`
  global used by older views.
- [`src/App.vue`](src/App.vue) — split-pane shell (`Menu` + router outlet), `FastTravel` app
  switcher, `presentLoader`/`dismissLoader` emitter bridge, and the **class-B cache bootstrap**:
  it *watches* `useAuth().isAuthenticated` and calls `startReferenceSync()` on login (a one-time
  mount check missed the boot-at-`/login` case).
- [`src/router/index.ts`](src/router/index.ts) — `@ionic/vue-router`, every view lazily imported,
  `/` → `/product-store`. Guards: `authGuard` and `requirePermission("A OR B OR C")`, which toasts
  and redirects to `/product-store` when the permission expression fails.
- i18n: `createDxpI18n(localeMessages)` over [`src/locales/en.json`](src/locales/en.json); use
  `translate()` from `@common` in code and `$t` in templates. **Every new user-facing string goes in
  `en.json`.**
- Theme: [`src/theme/variables.css`](src/theme/variables.css) plus `@common/css/{settings,theme}.css`.

## 4. The data layer — read this before touching screen data

This app has moved off "view calls store, store fetches, view renders". **Server data is read from
IndexedDB through Dexie `liveQuery`; a single web worker is the only thing that fetches cached
domains.** Getting this wrong (adding an `onMounted` fetch, adding a Pinia store for server data)
re-introduces exactly the load waterfalls this layer exists to remove.

### 4.1 The rule

```
                      main thread                    │        worker thread
 view ── useCachedList(entity) ──▶ Dexie liveQuery   │  syncRegistry domains
   │                                  ▲              │        │  fetch via workerRemoteApi
   │ mutation (composable)            │ live emit    │        ▼
   └── api() POST/PUT ──▶ refreshAfterMutation ──────┼──▶ transactional upsert into IndexedDB
                          / resyncDomain            │
```

- **Reads:** `useCachedList(entity, options)` / `useCachedRecord(...)`. No fetch, no loading race —
  the view re-renders on every cache write, including writes made in the worker thread.
- **Writes:** the owning composable calls `api()` directly, then `refreshAfterMutation(domain, pk)`
  (re-reads that one record) or `resyncDomain(domain)` (re-snapshots the domain). Never hand-patch
  cached rows.
- **Cadence:** owned entirely by the worker. Nothing on the main thread polls.
- The cache is durable across reloads and **cleared on logout only** (`postLogout` →
  `clearAllCaches()`); it is *not* shared cross-tab or cross-session by design.

### 4.2 Three sync classes

Declared per domain in [`src/utils/cacheDomainCatalog.ts`](src/utils/cacheDomainCatalog.ts) — one
list shared by the bootstrap and the Settings "Data Fetch Status" card so they cannot disagree.

| Class | Character | When it syncs | Examples |
| --- | --- | --- | --- |
| **B** | reference / config, whole-set | **once per login**, then only on mutation. Never on an interval, never per page load. | product stores, facilities, facility groups, service jobs, permissions, statuses, enums, all type tables, Shopify shops/locations/type mappings |
| **A** | live, append-mostly | polled on a cadence *while a view that needs it is open* | `dataManagerLog`, `systemMessage` |
| **C** | on-demand, parent-scoped | fetched when a parent record asks for it | `shopifyBulkOperation` |

Class B runs in an **app-lifetime** worker started by `appCacheBootstrap`; class A runs in a
**view-scoped** worker started by `useCacheSync`. Two workers is a known, bounded deviation from the
one-worker principle (their lifecycles differ); consolidating them is a candidate cleanup, not a bug
to "fix" incidentally.

### 4.3 Layer map

| File | Role |
| --- | --- |
| [`src/utils/appCacheDb.ts`](src/utils/appCacheDb.ts) | The Dexie database `CompanyCacheDB`: schema, `defineCachedEntity()`, `live()` queries, `ensureCacheReady()`, login markers, `clearAllCaches()` |
| [`src/utils/cacheProjection.ts`](src/utils/cacheProjection.ts) | Row projection/normalization (`text`/`date`/`count` field kinds), staleness diffing. Every cached row also carries the untouched server object in `raw` |
| [`src/utils/cacheEntities.ts`](src/utils/cacheEntities.ts) | The entity definitions — the shared read/write contract between worker and views |
| [`src/utils/cacheDomainCatalog.ts`](src/utils/cacheDomainCatalog.ts) | Domain → table → label → sync class |
| [`src/config/appSyncConfig.ts`](src/config/appSyncConfig.ts) | **App-specific** sync policy: which class-A domains to run, their scope/filters/windows, and which seed domains to exclude |
| [`src/services/appCacheBootstrap.ts`](src/services/appCacheBootstrap.ts) | Class-B once-per-login bootstrap; `refreshAfterMutation`, `resyncDomain`, `resyncReferenceData` |
| [`src/services/pollingService.ts`](src/services/pollingService.ts) | Main-thread half: spawns/terminates the worker, pushes the bearer token over `BroadcastChannel`, routes `auth-error` |
| [`src/workers/appSync.worker.ts`](src/workers/appSync.worker.ts) | The worker entry — importing a domain module registers it; the harness must be imported **last** |
| [`src/workers/pollingWorkerHarness.ts`](src/workers/pollingWorkerHarness.ts) | Worker-side harness: the tick loop, held token, 401 detection, teardown |
| [`src/workers/syncRegistry.ts`](src/workers/syncRegistry.ts) | `SyncDomain` contract + the pure `dueDomains()` scheduling rule (unit-tested without a worker) |
| [`src/workers/domains/*`](src/workers/domains/) | The domains: `snapshotDomain` (class-B factory), `referenceDomains`, `systemMessageDomain`, `dataManagerLogDomain`, `serviceJobRunDomain`, `productUpdateHistoryDomain`, `workerFetch` |
| [`src/composables/useCachedList.ts`](src/composables/useCachedList.ts) | The read seam for views |
| [`src/composables/useCacheSync.ts`](src/composables/useCacheSync.ts) | View-scoped class-A lifecycle (`start`/`stop`/`syncNow`) |
| [`src/composables/useCacheStatus.ts`](src/composables/useCacheStatus.ts) | Live row counts / last-sync times for the Settings diagnostics card |

`pollingService`, `pollingWorkerHarness`, and `syncRegistry` are **framework-shaped, app-local**:
they are written to be promoted into `@common` later. Keep app specifics out of them — those belong
in `appSyncConfig.ts` or a domain module.

### 4.4 Recipes

**Read cached data in a view**

```ts
const { records, rows, hydrated } = useCachedList<Facility>(facilityCache, {
  scope: { productStoreId },     // resolves through a compound index when one is declared
  filter: (row) => !row.isVirtual,
})
```

Respect `hydrated` — the cache is durable, so a warm visit paints instantly and must never flash a
skeleton or an empty state:

- `!hydrated` → skeleton (`ion-skeleton-text`)
- `hydrated && !length` → the genuine empty state

**Mutate**

```ts
await api({ url: `admin/facilities/${facilityId}`, method: "put", data })
await refreshAfterMutation("facility", { facilityId })   // or resyncDomain("facility")
```

Domains with no by-PK read route (`facilityGroup`, `facilityGroupMember`, `shopifyShop`) use a
scoped re-list so deletions inside the scope get pruned. A record that comes back empty is
**removed** from the cache.

**Add a cached domain**

1. Add the table + indexes to `CACHE_SCHEMA` in `appCacheDb.ts` (primary key first, then indexes —
   *not* columns).
2. Define the projection in `cacheEntities.ts`.
3. Register it in `cacheDomainCatalog.ts` with its sync class.
4. Add the worker domain (usually one `createSnapshotDomain(...)` entry in `referenceDomains.ts`)
   and, for class A, its scope/window in `appSyncConfig.ts`.
5. Import the domain module in `appSync.worker.ts` if it is a new file.
6. Expose reads through the owning `use*` composable — never let a view import cache internals.

### 4.5 Hard-won rules (do not undo these)

- **The Dexie schema is single-version on purpose.** Version bumps were actively harmful: Dexie
  accepted `version(2)` but silently did not create the added store, so writes failed while fetches
  kept succeeding. Just edit `CACHE_SCHEMA`; `ensureCacheReady()` compares declared tables to the
  database's real `objectStoreNames` and rebuilds on mismatch. Never add `version(2)`.
- **Worker query params must expand arrays into repeated keys.** `workerRemoteApi` builds its query
  with `URLSearchParams`, which comma-joins arrays (`id=A%2CB`); Moqui reads that as one literal
  value and returns an empty list — a **silent** zero-row failure. Use `workerGet`'s serializer in
  [`workerFetch.ts`](src/workers/domains/workerFetch.ts). Axios (main thread) does not have this
  problem, which is why the same query works from a composable and fails from the worker.
- **`workerRemoteApi` returns the parsed body directly** — `resp.<key>`, not `resp.data.<key>`.
- **Never poll an arbitrary window of transactional data.** A class-A domain declares a *scope*.
  System messages are scoped to the remotes of the shops in the cache
  (`scopeToShopifyShopRemotes`), and each message **type gets its own window and cursor** — a shared
  newest-N window let high-volume `ShopifyOrderSync` traffic (86% of 200 rows, 14 hours) starve out
  the `BulkQueryShopifyProductUpdates` message a screen needed. With no shops cached, the domain
  fetches nothing rather than falling back to an unscoped pull.
- **Cache-miss ≠ absence for "no rows" results.** `systemMessageErrorCache` can only hold errors
  that exist, so a cache-first read of a clean message misses forever and re-requests per row.
  `useSystemMessage` keeps a session-level "confirmed clean" set for exactly this.
- Cached-row projections must tolerate real backend payloads — several fields the schema declares are
  absent live (e.g. `systemMessages` carries no `lastUpdatedStamp`; `initDate` is the usable cursor).

## 5. Composables — one module per master entity

`src/composables/` is the **application-logic layer**: one file per master entity, holding both the
cached reads and the mutations for that entity. A screen importing three modules to describe one
concept is the smell this rule prevents.

| Composable | Owns |
| --- | --- |
| [`useShopify.ts`](src/composables/useShopify.ts) (~3.1k lines) | The whole Shopify integration: shops, locations, type mappings, carrier shipments, the shared sync core, **product sync** (message ⋈ bulk op ⋈ MDM log), **order sync** (entities, derivations, view model, mutations), cron schedule validation/preview, and worker activation. Sectioned 1–7 by a header comment — keep that structure |
| [`useFacilities.ts`](src/composables/useFacilities.ts) | Facilities, facility types, and facility **groups** with their memberships (a group is part of the facility aggregate) |
| [`useOrganizations.ts`](src/composables/useOrganizations.ts) | Internal organizations (`PARTY_GROUP` + `INTERNAL_ORGANIZATIO`), hierarchy derivation/anomalies, primary-org read, owned-facility read, and create/rename/reparent mutations |
| [`useProductStores.ts`](src/composables/useProductStores.ts) | Product stores and the config hanging off them (shipment-method counts, shipping methods, settings, facilities, and the onboarding/setup surface). Merged `useProductStoreData` |
| [`useSeed.ts`](src/composables/useSeed.ts) | Reference sets no single entity owns: statuses, enumerations, type tables, maarg config. Replaced `utilStore` |
| [`useServiceJobs.ts`](src/composables/useServiceJobs.ts) | Job definitions (cached) **and** the live detail/history surface — the two read paths are deliberately separate |
| [`useSystemMessage.ts`](src/composables/useSystemMessage.ts) | System messages, remotes, and error lookups |
| [`useDataManager.ts`](src/composables/useDataManager.ts) | DataManager configs/logs — the newest imports for a config, live from cache |
| [`useSecurity.ts`](src/composables/useSecurity.ts) | User groups and the permission catalog |
| [`useNetSuite.ts`](src/composables/useNetSuite.ts) | The NetSuite surface: cached reads + direct REST writes with a domain resync |
| [`useProductUpdateHistory.ts`](src/composables/useProductUpdateHistory.ts) | Product-update history rows |
| [`useProductStoreOnboardingWizard.ts`](src/composables/useProductStoreOnboardingWizard.ts) | Wizard step/draft state only — no server data. Persisted to `localStorage` by hand (key `company.productStoreOnboarding`), so a half-finished draft survives a reload. Replaced `store/productStoreOnboarding` |
| [`useShopifyProductSyncMigration.ts`](src/composables/useShopifyProductSyncMigration.ts) | The Upgrade Assistant: eligibility, legacy teardown state, and the legacy-sync retirement writes |
| [`useKlaviyo.ts`](src/composables/useKlaviyo.ts) | The Klaviyo surface. Deliberately LIVE reads — Klaviyo has no cached domain; email types are a load-once memo |
| [`useAppPermissions.ts`](src/composables/useAppPermissions.ts) | App permissions over the cached permission + user-group sets |
| [`useCachedList` / `useCacheSync` / `useCacheStatus`](src/composables/) | Data-layer seams (§4.3) |
| [`sessionScope.ts`](src/composables/sessionScope.ts) | The logout story for module-level composable state: a composable holding session data registers a reset, and logout calls `clearSessionScopedState()` once. Module state survives an SPA logout, so without this user B sees user A's data |

## 6. Pinia stores — what survives

Stores are **not** the place for server data any more. **Three remain, and that is the whole list:**

- Session and identity: [`user.ts`](src/store/user.ts) (also the `postLogin`/`postLogout` hooks).
- The AI agent surface: [`composer.ts`](src/store/composer.ts), [`workforce.ts`](src/store/workforce.ts).

Everything else is gone. `facility.ts`, `netSuite.ts` and `shopifyOrderSync.ts` went first; then
`shopify.ts`, `shopifyProductSync.ts`, `shopifyProductSyncMigration.ts`, `productStore.ts`,
`productStoreOnboarding.ts`, `klaviyo.ts`, `appPermissions.ts`, `authorization.ts` and `util.ts` — see
§5 for where each one's logic now lives. Wizard state did NOT need a store to survive: it moved to a
composable with explicit `localStorage` persistence.

Logout no longer imports stores in order to `$reset()` them; it calls `clearSessionScopedState()`
once, and each composable holding module-level session state registers its own reset (§5,
`sessionScope.ts`). That indirection is what allowed the stores to be deleted at all.

**Do not add a new store for server data** — add or extend the entity composable.

## 7. Views, components, routing

- One view per route in `src/views/`; `src/views/agent/` for the agent surface.
- Components are grouped by domain: `components/{common,facility,product-store,shopify,
  shopify-product-sync,shopify-order-sync,klaviyo,security,shipping-payment,
  product-store-onboarding,chat}/`. Put a new component in its domain folder; `common/` is for
  genuinely cross-domain pieces (`Menu`, `FilterMenu`, `SearchFilterCard`, `UniformFilterLayout`,
  `TimezoneModal`, `Image`, `Logo`, animated number/duration).
- Modals and popovers live with their domain and are opened from the view that owns the interaction.
- Add a route by adding a lazy `() => import(...)` plus the right guard. Permission-gated routes use
  `requirePermission` with an `"A OR B"` expression matching the backend permission ids.

## 8. Backend contract

- All HTTP goes through `api()` from `@common` ([`common/core/remoteApi.ts`](../../common/core/remoteApi.ts)):
  axios + `axios-cache-adapter`, `Authorization: Bearer` from `commonUtil.getToken()`, a pre-flight
  session check (multi-tab logout safety), `401` → `useAuth().logout()`, and Moqui-compatible param
  serialization.
- URLs are **relative paths against the resolved instance base**, e.g. `admin/productStores`,
  `admin/serviceJobs/${jobName}`, `oms/facilities/${id}/groups`, `oms/shopifyShops/shops`,
  `oms/systemMessageRemotes`. `admin/*` and `oms/*` are the two families in use; Shopify-connector
  endpoints appear as `shopify/*`.
- Check payload-level failures with `hasError(response)` from [`src/utils/index.ts`](src/utils/index.ts);
  surface messages with `getResponseErrorMessage` / `showToast`.
- Environment awareness for Unigate/maarg hosts is in [`src/utils/maarg.ts`](src/utils/maarg.ts)
  (prod / UAT / dev host map, plus a warning when a configured URL points at the wrong environment).
- Validate against a **real backend**. Mocked-API validation is not equivalent — state the blocker
  instead.

## 9. Tests

`tests/` mirrors `src/`: `tests/{utils,composables,store,components,views}`. Layers:

- **L1/L2 (pure logic)** — projections, derivations, scheduling rules, FSMs. Default node
  environment, no DOM. These are the bulk of the suite (`cacheProjection`, `syncRegistry`,
  `syncProgress`, `systemMessage`, `serviceJob`, `shopifyBulkOperation`, `deriveSync*`, …). Keep pure
  rules pure and exported so they can be tested without a worker, a timer, or a component.
- **L3 (component)** — jsdom + `@vue/test-utils`. There is **no global vitest config**, so each such
  file opts in with a first-line `// @vitest-environment jsdom` directive; L1/L2 stay fast in node.
  Real `@ionic/vue` components mount fine. To make Ionic's view-enter lifecycle fire on mount, mock
  `@ionic/vue` mapping `onIonViewWillEnter`/`onIonViewDidEnter` to `onMounted`. Mock the store/
  composable **module** (no `@pinia/testing`) via `vi.hoisted` + `vi.mock`, and mock `@common`
  (`translate` passthrough, `logger`, `commonUtil`) and `vue-router` when the view imports them.
  Async views that clear a flag in a `finally` need **two** `await flushPromises()`.
- Assert visible facts and delegated intents. Never assert source text or CSS.

## 10. State of the migration (as of 2026-07-28)

The cache/worker data layer is built and in use, and **the screen conversion is done.**

- **No view reads server data from a store.** 16 view/component files still import a store: 14 the
  session store (`user`), one `workforce`, one `composer` — all three are the stores that legitimately
  survive (§6), so every one of those imports is correct rather than debt.
- `store/util.ts` is deleted. Its reference reads live in `useSeed`/`useFacilities` and
  `bootstrapOrganization` in `useOrganization`; `ProductStoreOnboarding.vue` was its last consumer.
- `ShopifyProductSync.vue` no longer polls from the main thread. Its 5s `loadProgress` interval is
  gone — progress is derived from cached messages, bulk operations and MDM logs that the worker
  refreshes. **Vestigial scaffolding remains** and is worth removing: `startProgressPolling()` is now a
  documented no-op, `progressPoll` is declared but never assigned, and nine call sites still invoke
  the pair. The only surviving interval on that page is a 15s clock for relative-time labels, which
  loads no data.
- Organization management phases 1 and 2 are implemented at `/organizations` and
  `/organization-details/:partyId`. The `organization` and `organizationRelationship` class-B
  domains feed a cycle-safe forest; writes use the existing party/group/role/relationship endpoints
  and refresh their exact cache domains. Those multi-call writes are not backend-transactional, so
  errors explicitly report partial commits. Facility owner editing remains phase 3.
- Explicitly **out of scope** for now: offline write queue / mutation replay, cross-tab and
  cross-session cache persistence, class-A retention/pruning, service-worker background sync, and
  converting Solr-backed relevance search (`Users.vue`) to a client-side snapshot.

Per-screen state, the store retirement ledger, open questions, and the `@common` promotion plan live
in [`docs/cache-sync-remaining-work.md`](docs/cache-sync-remaining-work.md).

When you convert a screen: read through the entity composable, delete the store path it replaces
(don't leave both), and keep the `hydrated` skeleton contract.

## 11. Docs

[`docs/`](docs/) holds product scope, backend-contract research, and feature specs; it is indexed by
[`docs/README.md`](docs/README.md). Architecture lives **here**, in this file — if you change the
data layer, update §4 rather than starting a new plan document. Cross-app AccxUI architecture
(`ACCXUI_ARCHITECTURE.md`, `AUTHENTICATION_LOGIN_FLOW.md`, `SHOPIFY_EMBEDDED_APPS.md`,
`ESLINT_RULES.md`, `PNPM_CATALOG_DESIGN.md`) lives in the workspace [`../../docs/`](../../docs/).
