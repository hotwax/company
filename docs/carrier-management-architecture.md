# Carrier and shipment-method management architecture

**Status:** implementation design for PR #249.

**Scope:** move the existing carrier-management proposal onto the current Company app architecture
without changing the underlying OMS ownership model. Company manages carrier identity, carrier
shipment methods, facility availability, product-store shipment methods, and the observable portion
of Unigate readiness.

## 1. Product contract

Company exposes two permission-gated routes:

| Route | Purpose |
| --- | --- |
| `/carriers` | Searchable carrier catalog with configured-method counts and carrier creation |
| `/carriers/:partyId` | Carrier identity plus Methods, Facilities, product-store, and Account segments |

Both routes and the navigation entry require `CARRIER_SETUP_VIEW`. Backend authorization remains
authoritative; hiding a route or control is not authorization.

The detail route is stable so Order Manager and other internal applications can link to a carrier
without knowing which segment is active.

## 2. Architecture decision

Carrier configuration is small, reference-shaped, and changed by administrators. It therefore uses
the Company's class-B cache contract:

```text
view -> useCarriers/useFacilities/useProductStores -> Dexie liveQuery
  mutation -> @common api -> refreshAfterMutation/resyncDomain
                                -> worker refetch -> Dexie snapshot
```

The rejected alternatives are:

1. A carrier Pinia store copied from Fulfillment. This conflicts with the completed Company
   migration: Pinia is reserved for session and local workflow state, not server data.
2. View-owned fetches on every carrier route entry. This avoids a store but recreates loading
   waterfalls, duplicates reference reads, and bypasses the once-per-login cache.
3. Class-B domains plus entity composables. This is the selected design because it follows the
   current Company read/write seams and gives every mutation one explicit cache refresh.

Views never call `api()` and never hand-patch cached rows. Carrier UI state such as search text,
selected segment, modal state, and unsaved reorder state stays local to the component.

## 3. Cached domain model

### 3.1 Carrier

`carrier` is the catalog of `PARTY_GROUP` parties with the `CARRIER` role.

| Cache field | Meaning |
| --- | --- |
| `partyId` | Primary key and durable carrier identity |
| `groupName` | Operator-facing name |
| `partyTypeId` | Must be `PARTY_GROUP` |
| `roleTypeId` | Must be `CARRIER` |
| `statusId` | Preserved when supplied |

Source: `GET oms/shippingGateways/carrierParties` with `partyTypeId=PARTY_GROUP` and
`roleTypeId=CARRIER`. Method count is derived from the carrier-shipment-method cache rather than
persisted as a second source of truth.

### 3.2 Carrier shipment method

`carrierShipmentMethod` stores the methods enabled for each carrier.

The natural key is `(partyId, roleTypeId, shipmentMethodTypeId)`, represented in Dexie as
`carrierShipmentMethodKey`.

Projected fields:

- `partyId`, `roleTypeId`, `shipmentMethodTypeId`;
- `carrierServiceCode`, `deliveryDays`, `sequenceNumber`.

Source: `GET oms/shippingGateways/carrierShipmentMethods?roleTypeId=CARRIER`. A post-mutation
refetch lists one `partyId` and snapshot-replaces only that carrier's partition, which also removes
deleted methods from the view.

`CarrierShipmentMethod` is not date-effective. Its complete key is
`(partyId, roleTypeId, shipmentMethodTypeId)`, and removal is a hard `DELETE` after dependent
product-store associations have been closed. The cache does not invent `fromDate` or `thruDate`
fields for it.

The shipment-method type catalog remains the existing `shipmentMethodType` domain. Its description
is joined by `shipmentMethodTypeId`; carrier-specific fields never overwrite global type identity.

### 3.3 Carrier facility

`carrierFacility` stores the date-effective carrier role at a facility. Its synthetic key contains
`partyId`, `facilityId`, `roleTypeId`, and `fromDate`, so reactivating an association cannot collide
with its history.

The worker fans out over cached carriers because the OMS exposes the association below the carrier:

`GET oms/shippingGateways/carrierParties/{partyId}/facilities`

Rows are stamped with the URL-owned parent `partyId`, overriding stale response values as well as
filling omissions. A mutation refetches and prunes only that carrier's partition.

### 3.4 Product-store shipment method

The existing `productStoreShippingMethod` domain is currently pinned to the literal product store
`STORE`. Carrier management needs every store, and other screens must not accidentally read a
different store's methods once the cache is complete.

The read domain changes to a fan-out over cached product stores:

`GET admin/productStores/{productStoreId}/shippingMethods`

The projection adds `sequenceNumber`, `shipmentGatewayConfigId`, and `thruDate`. Consumers must
scope by `productStoreId`; carrier detail additionally filters by `partyId`.

The checked-in canonical admin resource is GET-only. Until its POST/PUT/DELETE backend replacement
is deployed and verified, writes use the still-supported legacy entity route:

`POST|PUT|DELETE oms/productStores/{productStoreId}/shipmentMethods`

This read/write split is explicit and covered by request-contract tests. Company must not post to
the GET-only admin resource or the nonexistent
`admin/productStores/{productStoreId}/shipmentMethods` path.

These regressions are part of the same change:

- Shopify shipment methods scope to the selected shop's product store;
- NetSuite shipment methods scope to the configured NetSuite product store;
- facility staff excludes `CARRIER` role rows.

## 4. Composable ownership

### `useCarriers.ts`

Owns:

- cached carrier list and record;
- carrier-to-method joins and method counts;
- carrier-to-facility joins;
- create and rename carrier;
- enable, update, delete, and resequence carrier shipment methods;
- the pure carrier/Unigate readiness derivation.

Every successful carrier mutation refreshes `carrier` or the selected carrier's
`carrierShipmentMethod` partition. A refetch failure is surfaced as a stage-aware
`CacheReconciliationError`: the server write is committed, the owning alert dismisses to prevent a
duplicate retry, and domain readiness keeps later controls locked until refresh succeeds.
Multi-call operations report the exact committed and failed IDs even if their forced reconciliation
also fails. Multi-stage create flows retain the identities of committed stages and resume after the
failed stage; they never replay an earlier POST merely because its cache refresh failed.

### `useSeed.ts`

Continues to own shipment-method types. It adds update/rename beside the existing create mutation
and re-snapshots `shipmentMethodType` after success.

### `useFacilities.ts`

Owns facility-party association writes. Enabling creates the `CARRIER` role with `fromDate`;
disabling closes the exact active association with `thruDate`. Success refreshes the selected
carrier's `carrierFacility` partition.

### `useProductStores.ts`

Owns product-store shipment-method writes. It creates, updates, and date-expires associations, then
refreshes the affected store's `productStoreShippingMethod` partition. The association partition
has a targeted refetch; the aggregate count endpoint has no per-store refetch contract, so only
count-changing create/expire mutations re-snapshot that small domain. Scalar tracking, gateway, or
sequence edits do not refresh an aggregate they cannot change. A count-changing write attempts the
partition refresh and aggregate refresh independently with `Promise.allSettled`; failure in one
cannot silently skip the other, and the resulting reconciliation error names every failed domain.

Removing a carrier shipment method loads the authoritative live product-store associations for that
carrier and method immediately before deletion, then closes every active dependency. The walk
deduplicates association PKs and fails closed on a repeated/no-progress page, its bounded paging
backstop, a response shape other than the documented bare array, or an active row that cannot be
classified and expired safely. It never treats the caller's cache snapshot or an unsupported
success envelope as deletion proof. Re-enabling the carrier method does not recreate product-store
configuration, so the UI confirms the impact and reports any partial completion.

### `useKlaviyo.ts`

Continues to own the live Unigate tenant editor. A successful `UNIGATE_CONFIG` update also calls
`refreshAfterMutation("systemMessageRemote", { systemMessageRemoteId })`, so carrier readiness and
the Klaviyo screen cannot diverge.

## 5. User experience

The carrier catalog follows current Company list conventions:

- render a skeleton only before cache hydration;
- render cached rows immediately on warm visits;
- search by carrier name or ID;
- show a genuine empty state only after hydration;
- expose manual refresh for both `carrier` and `carrierShipmentMethod`, because method counts are
  derived from the latter;
- create a carrier from an Ionic alert with validated ID and name.

Carrier detail uses a scrollable Ionic segment:

1. **Methods** — all global method types or only configured methods; enable/disable, edit carrier
   code and delivery days, rename the global type, create a type, and reorder configured methods.
2. **Facilities** — physical facilities with the selected carrier association.
3. **One segment per product store** — only methods enabled for the carrier; association,
   tracking-required, and shipment-gateway fields when the backend exposes them.
4. **Account** — Unigate tenant presence and address-validation readiness.

The detail screen exposes one combined readiness flag covering carrier, carrier method, facility
association, product store, store association, shipment-type, and system-message-remote domains.
All mutation controls stay disabled until every required domain has hydrated without a recorded
bootstrap error. An absent `UNIGATE_CONFIG` is reported as missing only after the remote cache is
trustworthy; a cold or failed remote domain is unavailable, never missing.

Only one detail mutation can be active at a time. The lock is deliberately broader than an
individual button because several writes snapshot-replace the same carrier or product-store
partition; allowing a second write before the first refetch settles can let an older response prune
newer server state. The worker also serializes targeted refetches with the same domain and canonical
PK scope while leaving unrelated scopes concurrent.

The UI uses Ionic components and existing utility classes. It adds no Ionic grid, font/color CSS,
or app-wide stylesheet changes. Narrow screens keep the segment scrollable and render each
configuration as full-width list rows.

## 6. Unigate and shipping-gateway boundary

The current backend proves these reads:

- carrier parties, methods, and counts;
- shipment-method types;
- facilities and carrier-facility associations;
- product stores and product-store shipment methods;
- `UNIGATE_CONFIG` from system-message remotes.

It does not expose Company-consumable resources for:

- `ShippingGatewayAuth` credentials;
- supported `ShippingGatewayConfig` rows;
- `ShippingCarrierConfig` product-store links.

The legacy `oms/shippingGateways/config` route is not part of the checked-in OMS REST contract.
Any deployed-environment observation belongs in the dated evidence ledger in
`carrier-credential-api-gap.md`; it must not be promoted into a durable contract. Company must not
infer that a missing resource means disconnected or ready. It renders **Verification unavailable**
and keeps credential creation, rotation, disconnect, and carrier-link management out of this PR.

FedEx is the only carrier currently selected by the automatic sales-order address-validation
backend contract. A complete observable Unigate tenant requires a non-empty tenant/internal ID and
send URL. The API key is write-only and must not be required in a read response.

## 7. Error and consistency rules

- Payload-level errors use `commonUtil.hasError`; displayed messages use the shared response helper.
- Empty cache data is not an error after hydration.
- A zero-row automatic worker response must not wipe a populated domain.
- Composite-domain refetches must carry the partition key; an undefined scope is refused.
- Global cache-open failure is recorded as `__start` and keeps empty data and mutations
  untrustworthy until a later verified startup clears it. A failed cached start promise is reset,
  so the visible Retry action genuinely starts a new worker attempt.
- Refetch failures are tracked by domain plus canonical PK scope. A scoped success clears only its
  own failure; only a successful full-domain snapshot can clear every stale scope in that domain.
- A targeted post-write refetch rejection is a committed-write/cache-reconciliation failure, not a
  failed server mutation; retryable dialogs dismiss and further controls fail closed.
- Forced/manual sync rejects on a domain failure; its last-attempt timestamp never implies success.
- Sequence save writes explicit `1..N` positions and refreshes once after every write succeeds.
- Facility and product-store associations use the shared active-row helper; string and numeric
  timestamps are both accepted. Cached date-effective lists schedule invalidation at the nearest
  `fromDate` or `thruDate`, so a long-lived screen changes at the boundary without another cache
  emission. Carrier methods do not use that helper because they are not date-effective.
- No optimistic cache patches: UI updates from the authoritative worker refetch.
- Runtime diagnostics such as IDs, page numbers, and backend messages are interpolation values
  under fixed locale keys. They are never passed to `translate()` as unbounded lookup keys.

## 8. Verification

Automated:

- pure joins, active-row filtering, readiness, and ordering;
- mutation URL/payload plus exact cache-refresh intent;
- startup failure/recovery, committed-write reconciliation errors, and forced-sync propagation;
- scoped-error isolation, same-scope refetch ordering, and whole-detail mutation locking;
- multi-stage create recovery without replaying committed type or store-association POSTs;
- destructive live-dependency paging, deduplication, malformed-row refusal, and paging backstops;
- automatic date-effective boundary invalidation;
- carrier-facility and product-store fan-out, scoped prune, and composite-key isolation;
- Shopify and NetSuite product-store scoping regressions;
- facility staff excludes carrier roles;
- full unit suite, production build, changed-file lint, typecheck baseline comparison, and
  `git diff --check`.

Authenticated browser QA against `test-maarg`:

- carrier list search, refresh, direct reload, and create validation;
- FEDEX detail across Methods, Facilities, each product store, and Account;
- configured-only filter and stable method ordering;
- reversible carrier rename, method field edit, reorder, and tracking toggle, restoring exact
  original values after each check;
- facility and store association controls are inspected read-only; closing and recreating either
  association leaves permanent date-effective history and is not a reversible QA action;
- non-FEDEX readiness state;
- warm reload, logout/login cache isolation, desktop and narrow viewport;
- console errors and every unexpected non-2xx network response.

Persistent carrier or method creation and carrier-method enable/disable are not required for QA.
Their exact request, payload-error, dependency, and refresh behavior is covered by automated tests;
the browser round does not create permanent records or destroy store configuration.

## 9. Out of scope

- exposing or storing carrier credentials in the browser;
- changing the automatic address-validation backend contract;
- deleting carriers or shipment-method types;
- modifying Shopify or NetSuite external mapping models;
- adding background polling for reference configuration;
- creating a second server-data store beside Dexie.
