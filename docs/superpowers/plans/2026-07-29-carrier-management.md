# Carrier and Shipment-Method Management Implementation Plan

> **For Codex:** Execute this plan test-first against the current AccxUI `origin/main`.

**Goal:** Rebuild PR #249 so Company can manage carriers, carrier shipment methods, carrier
facilities, and product-store shipment methods without reintroducing a server-data Pinia store or
view-owned fetch waterfalls.

**Architecture:** Add four class-B cache domains (`carrier`, `carrierShipmentMethod`,
`carrierFacility`, and the existing `productStoreShippingMethod` expanded to all stores), expose
their data and mutations through entity composables, and keep the two permission-gated views thin.
Every successful write is followed by a scoped worker refetch. A refetch failure is a typed,
committed-write reconciliation error rather than a write failure; partial multi-write failures
preserve exact committed/failed IDs while attempting a forced resync.

**Tech stack:** Vue 3 composition API, Ionic Vue, Dexie/liveQuery, AccxUI worker domains, Vitest,
TypeScript, and the shared `@common` API utilities.

---

## Task 1: Add carrier class-B cache domains

**Files:**

- Modify: `src/utils/appCacheDb.ts`
- Modify: `src/utils/cacheEntities.ts`
- Modify: `src/utils/cacheDomainCatalog.ts`
- Modify: `src/workers/domains/referenceDomains.ts`
- Test: `tests/utils/carrierCacheProjection.spec.ts`
- Test: `tests/workers/carrierReferenceDomains.spec.ts`

### Step 1: Write failing projection tests

Cover:

- `carrierProjection` keyed by `partyId`;
- `carrierShipmentMethodProjection` keyed by
  `partyId|roleTypeId|shipmentMethodTypeId`;
- `carrierFacilityProjection` keyed by
  `partyId|facilityId|roleTypeId|fromDate`;
- product-store projection retaining `sequenceNumber`, `shipmentGatewayConfigId`, and `thruDate`;
- composite keys remaining distinct across carriers and stores.

Run:

```bash
pnpm --filter company exec vitest run tests/utils/carrierCacheProjection.spec.ts --no-cache
```

Expected: FAIL because the carrier projections and exported cache entities do not exist.

### Step 2: Implement schemas and projections

Add:

- `carriers: "partyId, groupName, roleTypeId"`
- `carrierShipmentMethods:
  "carrierShipmentMethodKey, partyId, roleTypeId, shipmentMethodTypeId, sequenceNumber"`
- `carrierFacilities:
  "carrierFacilityKey, partyId, facilityId, roleTypeId, fromDate, thruDate"`

Export `carrierCache`, `carrierShipmentMethodCache`, and `carrierFacilityCache`. Remove
`PRODUCT_STORE_ID_FOR_SHIPPING_METHODS`; product-store identity must come from each response's
scope, never a literal.

### Step 3: Write failing worker-domain tests

Exercise registered domain behavior with the existing snapshot-domain test harness:

- carrier list GET uses `partyTypeId=PARTY_GROUP` and `roleTypeId=CARRIER`;
- carrier-method list uses `roleTypeId=CARRIER`;
- carrier facilities fan out over cached carrier IDs and stamp `partyId`;
- store methods fan out over cached product stores and stamp `productStoreId`;
- a scoped refetch prunes only the selected carrier/store partition;
- a missing partition key is refused.

Run:

```bash
pnpm --filter company exec vitest run tests/workers/carrierReferenceDomains.spec.ts --no-cache
```

Expected: FAIL because the domains are not registered.

### Step 4: Register and catalog the domains

Register:

- `carrier` -> `GET oms/shippingGateways/carrierParties`
- `carrierShipmentMethod` ->
  `GET oms/shippingGateways/carrierShipmentMethods?roleTypeId=CARRIER`
- `carrierFacility` -> fan-out
  `GET oms/shippingGateways/carrierParties/{partyId}/facilities`
- `productStoreShippingMethod` -> fan-out
  `GET admin/productStores/{productStoreId}/shippingMethods`

Order the catalog so `carrierFacility` follows `carrier` and store methods follow `productStore`.
Use the existing fan-out and scoped snapshot contracts instead of adding a carrier-specific worker.

### Step 5: Verify and commit

```bash
pnpm --filter company exec vitest run tests/utils/carrierCacheProjection.spec.ts tests/workers/carrierReferenceDomains.spec.ts --no-cache
git diff --check
git add src/utils/appCacheDb.ts src/utils/cacheEntities.ts src/utils/cacheDomainCatalog.ts src/workers/domains/referenceDomains.ts tests/utils/carrierCacheProjection.spec.ts tests/workers/carrierReferenceDomains.spec.ts
git commit -m "feat: cache carrier configuration domains"
```

## Task 2: Add carrier reads, readiness, and mutations

**Files:**

- Create: `src/composables/useCarriers.ts`
- Modify: `src/composables/useFacilities.ts`
- Modify: `src/composables/useProductStores.ts`
- Modify: `src/composables/useSeed.ts`
- Test: `tests/composables/useCarriers.spec.ts`
- Test: `tests/composables/carrierMutations.spec.ts`

### Step 1: Write failing pure-behavior tests

Test exported pure helpers:

```ts
mergeCarrierShipmentMethods(types, configured): CarrierShipmentMethodView[]
deriveCarrierReadiness(carrier, unigateRemote, remoteDataState): CarrierReadiness
orderedCarrierMethods(rows): CarrierShipmentMethodView[]
```

Required behavior:

- facility/store association filters reuse `isEffectiveNow`, which accepts numeric and string
  timestamps;
- method joins never mutate global types;
- readiness requires observable Unigate `internalId` and `sendUrl`, not a hidden API key;
- only FedEx is marked automatic-address-validation capable;
- missing gateway resources resolve to `verification-unavailable`, not disconnected;
- a cold or failed remote domain resolves to unavailable, not a missing-tenant action;
- sequence sort is stable and puts unsequenced rows last.

Run:

```bash
pnpm --filter company exec vitest run tests/composables/useCarriers.spec.ts --no-cache
```

Expected: FAIL because `useCarriers.ts` does not exist.

### Step 2: Implement cache-backed reads

Expose:

- `useCarriers()`
- `useCarrier(partyId)`
- `useCarrierShipmentMethods(partyId)`
- `useCarrierFacilities(partyId)`
- `useCarrierReadiness(partyId)`
- a combined detail hydration flag spanning carrier, method, facility association, product store,
  store association, shipment type, and system-message-remote reads; a recorded bootstrap error in
  any required domain keeps mutation readiness false even after the bootstrap stops

All reads use `defineCachedEntity(...).live()` or existing cache-backed composables. Do not call
`api()` from a computed getter or lifecycle hook.

### Step 3: Write failing mutation-contract tests

Mock `@common` API and cache-sync seams, then assert exact method, URL, payload, and refresh intent
for:

- create and rename carrier;
- enable/update/delete/resequence carrier method;
- rename shipment-method type;
- enable/disable carrier facility;
- create/update/expire product-store method.

Also prove:

- payload-level errors reject;
- every success refreshes the exact affected partition;
- multi-write remove/resequence refreshes after completion;
- a partial commit triggers a forced resync and reports which writes committed;
- removing a carrier method loads and closes authoritative live store associations first;
- paging deduplicates associations and fails closed on no-progress/backstop conditions;
- malformed active target dependencies block the hard delete;
- a committed write plus failed cache refetch returns a stage-aware error;
- worker cache-open failures gate readiness globally and forced resync failures propagate.
- a Unigate tenant update refreshes the cached `systemMessageRemote`.

Run:

```bash
pnpm --filter company exec vitest run tests/composables/carrierMutations.spec.ts --no-cache
```

Expected: FAIL until the mutation methods exist.

### Step 4: Implement the mutation seams

Keep ownership aligned:

- carrier and carrier-method writes in `useCarriers.ts`;
- shipment-type rename in `useSeed.ts`;
- carrier-facility writes in `useFacilities.ts`;
- product-store association writes in `useProductStores.ts`.

Use `commonUtil.hasError` and the shared response error helper. Do not optimistically mutate Dexie.
Delete a carrier method by its three-part PK. Date-expire the exact active facility/store
association and refresh the selected carrier/store partition. Product-store association writes
must use the backend-proven `oms/productStores/{productStoreId}/shipmentMethods` route; the admin
`shippingMethods` resource remains the canonical read and is GET-only on backend main.
Re-snapshot `productStoreShipmentCount` only for count-changing create/expire operations, not for
tracking, gateway, or sequence edits.

The deletion preflight must page the nested live OMS association resource, stamp the URL-owned
`partyId`, deduplicate by `productStoreShipMethId`, and refuse deletion if a full page repeats, the
bounded backstop is reached, or an active target row lacks enough identity to expire safely. A
post-write refetch rejection becomes `CacheReconciliationError`; the UI dismisses retryable alerts
and domain readiness remains locked until a successful reconciliation clears the error.

Update `useKlaviyo.ts` so its successful Unigate remote write also refreshes the cached
`systemMessageRemote`.

### Step 5: Verify and commit

```bash
pnpm --filter company exec vitest run tests/composables/useCarriers.spec.ts tests/composables/carrierMutations.spec.ts --no-cache
git diff --check
git add src/composables/useCarriers.ts src/composables/useFacilities.ts src/composables/useProductStores.ts src/composables/useSeed.ts src/composables/useKlaviyo.ts tests/composables/useCarriers.spec.ts tests/composables/carrierMutations.spec.ts
git commit -m "feat: add carrier configuration composables"
```

## Task 3: Fix consumers exposed by the all-store cache

**Files:**

- Modify: `src/views/ShopifyShipmentMethods.vue`
- Modify: `src/views/ShipmentMethods.vue`
- Modify: `src/views/FacilityDetails.vue`
- Test: `tests/views/ShopifyShipmentMethods.storeScope.spec.ts`
- Test: `tests/views/ShipmentMethods.storeScope.spec.ts`
- Test: `tests/views/FacilityDetails.carrierRole.spec.ts`

### Step 1: Write failing regression tests

Seed mixed-store and mixed-role rows, then prove:

- Shopify shows only the selected shop's `productStoreId`;
- NetSuite shows only its configured product store;
- Facility Details staff omits `CARRIER` role rows.

Run:

```bash
pnpm --filter company exec vitest run tests/views/ShopifyShipmentMethods.storeScope.spec.ts tests/views/ShipmentMethods.storeScope.spec.ts tests/views/FacilityDetails.carrierRole.spec.ts --no-cache
```

Expected: at least one assertion fails against the current unscoped consumers.

### Step 2: Add explicit scope at each read

Make `useProductStoreShippingMethods` accept a reactive ref/getter or perform a computed filter
over the all-store cache; a scope captured while the store ID is still undefined is not sufficient.
Pass each asynchronously resolved `productStoreId` from Shopify and NetSuite Shipment Methods.
Filter facility party rows by the staff role contract before rendering. Do not change external
mapping identities. Include a cold-cache test where the store ID arrives after setup.

### Step 3: Verify and commit

```bash
pnpm --filter company exec vitest run tests/views/ShopifyShipmentMethods.storeScope.spec.ts tests/views/ShipmentMethods.storeScope.spec.ts tests/views/FacilityDetails.carrierRole.spec.ts --no-cache
git diff --check
git add src/views/ShopifyShipmentMethods.vue src/views/ShipmentMethods.vue src/views/FacilityDetails.vue src/composables/useProductStores.ts tests/views/ShopifyShipmentMethods.storeScope.spec.ts tests/views/ShipmentMethods.storeScope.spec.ts tests/views/FacilityDetails.carrierRole.spec.ts
git commit -m "fix: scope shipping methods and facility staff"
```

## Task 4: Build permission-gated carrier management UI

**Files:**

- Create: `src/views/Carriers.vue`
- Create: `src/views/CarrierDetails.vue`
- Create: `src/components/carrier/CarrierMethodList.vue`
- Create: `src/components/carrier/CarrierFacilityList.vue`
- Create: `src/components/carrier/CarrierStoreMethodList.vue`
- Create: `src/components/carrier/CarrierAccountReadiness.vue`
- Modify: `src/router/index.ts`
- Modify: `src/components/common/Menu.vue`
- Modify: `src/locales/en.json`
- Test: `tests/views/Carriers.spec.ts`
- Test: `tests/views/CarrierDetails.spec.ts`
- Test: `tests/router/carrierRoutes.spec.ts`
- Test: `tests/components/common/Menu.carrierPermission.spec.ts`
- Test: `tests/components/carrier/CarrierMethodList.spec.ts`
- Test: `tests/components/carrier/CarrierAccountReadiness.spec.ts`

### Step 1: Write failing route and view-contract tests

Prove:

- `/carriers` and `/carriers/:partyId` use `requirePermission("CARRIER_SETUP_VIEW")`;
- the menu entry is hidden without permission;
- cold cache shows a skeleton, hydrated empty cache shows the empty state, and warm cache renders
  rows immediately;
- search matches ID and name;
- the detail view renders Methods, Facilities, one segment per product store, and Account;
- action controls lock while their mutation is pending and until every required detail domain has
  hydrated;
- Account uses the three-state readiness contract, including `Verification unavailable`.

Run:

```bash
pnpm --filter company exec vitest run tests/views/Carriers.spec.ts tests/views/CarrierDetails.spec.ts tests/router/carrierRoutes.spec.ts --no-cache
```

Expected: FAIL because routes and views do not exist.

### Step 2: Implement routes, navigation, and catalog view

Use existing Ionic list/search/alert patterns. Validate carrier ID and name before calling
`createCarrier`. Keep search, modal, and pending state local. Delegate manual catalog refresh to a
carrier composable façade that refreshes both the carrier and carrier-method domains; the view does
not import cache services.

### Step 3: Implement the detail segments

Compose the entity composables without direct API calls. Use stable segment values `methods`,
`facilities`, `store:{productStoreId}`, and `account`, resetting to `methods` if a live store update
removes the selected segment. Methods support enable, edit, global type rename/create,
configured-only filtering, safe disable confirmation, and explicit sequence save. Facilities and
store segments use date-effective toggles. Product-store gateway IDs may be displayed, but are not
editable without a proven gateway catalog. Account exposes only observable Unigate readiness and
links to the existing `/klaviyo` surface when relevant.

Use existing Ionic components and utility classes; do not add app-global CSS, Ionic grid, custom
font, or new color tokens.

### Step 4: Localize every user string

Add all strings to `src/locales/en.json`; tests should query stable roles/labels rather than
implementation-only class names.

### Step 5: Verify and commit

```bash
pnpm --filter company exec vitest run tests/views/Carriers.spec.ts tests/views/CarrierDetails.spec.ts tests/router/carrierRoutes.spec.ts tests/components/common/Menu.carrierPermission.spec.ts tests/components/carrier/CarrierMethodList.spec.ts tests/components/carrier/CarrierAccountReadiness.spec.ts --no-cache
pnpm --filter company exec eslint src/views/Carriers.vue src/views/CarrierDetails.vue src/components/carrier src/composables/useCarriers.ts
git diff --check
git add src/views/Carriers.vue src/views/CarrierDetails.vue src/components/carrier src/router/index.ts src/components/common/Menu.vue src/locales/en.json tests/views/Carriers.spec.ts tests/views/CarrierDetails.spec.ts tests/router/carrierRoutes.spec.ts tests/components/common/Menu.carrierPermission.spec.ts tests/components/carrier
git commit -m "feat: add carrier management screens"
```

## Task 5: Reconcile documentation and API boundaries

**Files:**

- Modify: `AGENTS.md`
- Modify: `docs/README.md`
- Modify: `docs/carrier-management-architecture.md`
- Create: `docs/superpowers/plans/2026-07-29-carrier-management.md`
- Create: `docs/carrier-credential-api-gap.md`

### Step 1: Verify architecture boundaries through behavior tests

The focused composable, route, and view tests from Tasks 1–4 must prove:

- carrier reads are delegated to cache-backed composables;
- no request to legacy `oms/shippingGateways/config`;
- no readable API-key field in readiness;
- stable routes are `/carriers` and `/carriers/:partyId`.

Do not add source-text or CSS assertion tests; `AGENTS.md` requires tests to assert visible behavior
and delegated intents.

### Step 2: Document the proven backend gap

Record supported reads/writes, the missing credential/config/link resources, the deployed result
of the undeclared legacy route if the authenticated pass exercises it, and the backend contracts
required before credential or carrier-link management can be safely added. Keep environment
observations dated and separate from the checked-in contract. Link both carrier documents from
`docs/README.md`.

Update `AGENTS.md` cache architecture documentation with the three new domains, the all-store
shipping-method fan-out, composable ownership, and required consumer scoping.

### Step 3: Verify and commit

```bash
git diff --check
git add AGENTS.md docs/README.md docs/carrier-management-architecture.md docs/carrier-credential-api-gap.md docs/superpowers/plans/2026-07-29-carrier-management.md
git commit -m "docs: define carrier API boundary"
```

## Task 6: Full static, build, and authenticated browser verification

**Files:**

- Create locally only: `.env` (ignored; `VITE_OMS_TYPE=MOQUI`, no secrets)
- Update if defects are found: the smallest owning production file and a regression test

### Step 1: Run the complete automated gate

```bash
pnpm --filter company test:unit
pnpm --filter company build
pnpm --filter company typecheck
pnpm --filter company lint
git diff --check
git status --short
```

Compare typecheck/lint failures against a fresh `origin/main` baseline. Fix every new failure and
rerun the exact failing command.

### Step 2: Start Company inside the current AccxUI workspace

```bash
pnpm --filter company dev -- --host 127.0.0.1
```

Use the signed-in Chrome profile so the saved `https://test-maarg.hotwax.io/` credential remains
available for an explicit native password-manager fill. Do not assume Chrome will automatically
match that credential to the localhost origin. Never read or copy the password into source,
terminal output, or `VITE_*`.

### Step 3: Execute browser QA on test-maarg

Verify:

- login, permission-gated menu/routes, list search/refresh/direct reload;
- FEDEX Methods, Facilities, every product-store segment, and Account;
- configured-only filtering and ordering;
- reversible rename, carrier-method edit, reorder, and tracking toggle, restoring each exact
  original value before moving on;
- facility and product-store association controls read-only; toggling either leaves permanent
  date-effective history and is not restoration-safe;
- date-effective lists crossing a `fromDate`/`thruDate` boundary without a cache write;
- a non-FedEx readiness state;
- warm reload, logout/login cache isolation;
- desktop and narrow viewport;
- console errors and unexpected non-2xx requests.

Do not create persistent carrier/method records, disable a carrier method, or toggle a
facility/product-store association. Those mutation contracts are automated; the authenticated
browser round must not leave historical rows or destroy store configuration.

### Step 4: Fix browser-found defects test-first

For each defect, add the smallest reproducing Vitest test, observe it fail, implement the fix, rerun
the focused test, then repeat the full automated gate and affected browser path.

### Step 5: Publish the rebuilt PR branch

Fetch the current remote head and verify the force-with-lease target. Then push the reviewed branch
to `origin/codex/carrier-credential-readiness`, preserving the open PR while replacing its obsolete
history:

```bash
git fetch origin codex/carrier-credential-readiness
git push --force-with-lease=refs/heads/codex/carrier-credential-readiness:<verified-remote-sha> origin HEAD:codex/carrier-credential-readiness
```

Re-read PR #249 and report its new head SHA, mergeability/check status, exact automated results, and
the browser mutation/restore evidence. Do not post a PR comment or send email/chat.
