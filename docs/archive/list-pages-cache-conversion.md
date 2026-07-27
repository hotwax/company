# List pages → cache-backed reads: inventory + implementation plan

**Status:** Plan. Depends on the cache/sync layer already built (see
[cache-sync-rollout-plan.md](./cache-sync-rollout-plan.md)).
**Drafted:** 2026-07-26

Architecture decision this implements: **server data is read from IndexedDB via `liveQuery`, never
from a Pinia store.** Stores survive only for session/UI state and in-flight operations. A list
page becomes: read composable (liveQuery + projection) → presentational component.

---

## 1. Inventory — the list pages

Grouped by how much work conversion takes, which is determined by whether the domain is already
cached. "Lookups needed" matters because a page is only instant if its *lookup* data is cached too.

### Tier 1 — domain already cached, convert now (6 pages)

| Page | Current source | Cached domain | Lookups also needed |
| --- | --- | --- | --- |
| `ProductStore.vue` | `productStore.fetchProductStores({fetchCounts:true})` | `productStores` ✅ | shipment-method counts (derived, see §5.3) |
| `ShopifyConnections.vue` | `shopify.fetchShopifyShops()` | `shopifyShops` ✅ | — |
| `FindFacilities.vue` | `facility.fetchFacilities…` + `facility.fetchFacilityTypes()` + `util.fetchFacilityGroups()` | `facilities` ✅ | facilityTypes ❌, facilityGroups ✅ |
| `FindGroups.vue` | `facility.fetchFacilityGroupsWithSearch()` + `fetchFacilityGroupTypes()` | `facilityGroups` ✅ + `groupFacilities` ✅ (counts) | facilityGroupTypes ❌ |
| `FacilityGroupDetail.vue` | `oms/facilityGroups/{id}/facilities` | `groupFacilities` ✅ (scope by `facilityGroupId`) | facilities ✅ |
| `AppPermissions.vue` | `appPermissions.fetchAssignments()` + `fetchGroupUsers(g)` **per group (N+1)** | `permissions` ✅ | userGroups ❌ |

### Tier 2 — needs new "lookup / type" cache domains first (5 pages + unblocks Tier 1 gaps)

This is the family that makes every page feel instant, and the reason `utilStore` currently exists
as a data holder. All are small, bounded, class B.

| New domain | Endpoint | Consumed by |
| --- | --- | --- |
| `statuses` | `oms/statuses?pageSize=1000` | sync pages, order pages (currently `utilStore.statusItems`) |
| `enums` | `admin/enums` (9 call sites) | many |
| `facilityTypes` | facility store action | FindFacilities, Parking |
| `facilityGroupTypes` | facility store action | FindGroups |
| `userGroups` | `admin/userGroups` (PK `userGroupId`, verified) | SecurityGroups, Users, AppPermissions |
| `productTypes` | `utilStore.fetchProductTypes()` | ShopifyProductTypes |
| `shipmentMethodTypes` | `oms/shippingGateways/shipmentMethodTypes` | ShipmentMethods, ShopifyShipmentMethods |
| `paymentMethodTypes` | `oms/paymentMethodTypes` | PaymentMethods, ShopifyPaymentMethods |
| `roleTypes` | `oms/roleTypes` | user pages |

Pages unlocked: `SecurityGroups.vue`, `ShipmentMethods.vue`, `PaymentMethods.vue`,
`SalesChannel.vue`, `Departments.vue`, `InventoryVariances.vue` (the NetSuite mapping family, all
reading `integrationTypeMappings` ✅ + a type lookup ❌).

### Tier 3 — shop-scoped domains (4 pages)

Need a new cached domain **scoped by `shopId`**, which the snapshot factory already supports via
`refetchScope`/`snapshotReplace(rows, scope)`.

| Page | Endpoint | New domain |
| --- | --- | --- |
| `ShopifyLocations.vue` | `oms/shopifyShops/locations` | `shopifyLocations` (scope `shopId`) |
| `ShopifyProductTypes.vue` | `oms/shopifyShops/typeMappings?mappedTypeId=SHOPIFY_PRODUCT_TYPE` | `shopifyTypeMappings` (scope `shopId` + `mappedTypeId`) |
| `ShopifySalesChannels.vue` | same, `mappedTypeId=SHOPIFY_SALES_CHANNEL` | ↑ same table |
| `ShopifyShipmentMethods.vue` / `ShopifyPaymentMethods.vue` | same, other `mappedTypeId`s | ↑ same table |

One table serves all four; `mappedTypeId` is an index, not a separate domain.

### Tier 4 — deferred (1 page)

| Page | Decision |
| --- | --- |
| `Users.vue` | **Not migrating for now** (decided 2026-07-26). It is Solr-backed (`userStore.fetchUsers` builds a Solr payload with query + relevance + paging), which a client-side snapshot cannot reproduce. `user.ts` and its Solr search stay exactly as they are. |

`SecurityGroups.vue` and `Parking.vue` **do** convert (they were previously parked here on a
volume worry that does not apply at real scale — see §5.2). Their server-side filter/page calls are
replaced by client-side filtering over the cached set.

### Tier 5 — sync history (2 pages, separate work)

`ShopifyProductSyncHistory.vue`, `ShopifyOrderSyncHistory.vue`. These correlate
`systemMessages` ✅ + `dataManagerLogs` ✅ + **Shopify bulk operation ❌ (uncached, fetched per run
via `shopify/graphql` — an N+1 against a rate-limited remote)**. Needs a `shopifyBulkOperations`
cache domain (class C: on-demand by id + TTL) before the list is worth converting. Tracked
separately; do **not** bundle into the list-page sweep.

## 2. The pattern (applies to every Tier 1–3 page)

Three layers, no store:

```
cache table (worker writes)  →  read composable (liveQuery + projection)  →  component (presentational)
```

**Layer 1 — cache entity + sync domain.** Already exists for Tier 1; Tier 2/3 add a projection to
`src/utils/cacheEntities.ts` and a `registerSnapshotDomain({...})` entry in
`src/workers/domains/referenceDomains.ts` (~10 lines each), plus the domain name in
`appCacheBootstrap.REFERENCE_DOMAINS`.

**Layer 2 — read composable** (NEW, one per domain, ~5 lines each on top of a shared helper):

```ts
// PROPOSED — src/composables/useCachedList.ts (the shared helper)
export function useCachedList(entity: CachedEntity, options?: {
  dateField?: string;
  scope?: { field: string; value: unknown };
}) {
  const rows = ref<CachedRow[]>([]);
  const hydrated = ref(false);          // has the cache emitted at least once?
  let sub: Subscription | null = null;
  onMounted(() => {
    sub = entity.live(options).subscribe({
      next: (r) => { rows.value = r; hydrated.value = true; },
    });
  });
  onUnmounted(() => sub?.unsubscribe());
  return { rows, hydrated };
}

// PROPOSED — src/composables/useFacilityList.ts
export function useFacilityList() {
  const { rows, hydrated } = useCachedList(facilityCache);
  const facilities = computed(() => rows.value.map((r) => r.raw));   // or a typed projection
  return { facilities, hydrated };
}
```

**Layer 3 — component.** Replace the store call + `onMounted` fetch with the composable; keep only
presentation and local UI state:

```diff
- const facilityStore = useFacilityStore();
- onIonViewWillEnter(async () => { await facilityStore.fetchFacilities(...) });
- const facilities = computed(() => facilityStore.getFacilities);
+ const { facilities, hydrated } = useFacilityList();
```

**Layer 4 — store deletion.** Remove the domain's fetch action + state. **Decided 2026-07-26: the
list pages take the composable route — no store is involved in a list page at all.** Not for the
list, not for the selected record, not for lookups. No store use case has been found for these
pages: the route carries the selected id, and a single record is read with `useCachedRecord`
(which replaces getters like `shopifyStore.getShopById`). Delete each store once its last consumer
is migrated.

## 3. Store changes, concretely

| Store | Action |
| --- | --- |
| `util.ts` | **Gutted.** It is currently the lookup holder (`statusItems`, `facilityGroups`, `productTypes`, `shipmentMethodTypes`, …) — all of it becomes Tier 2 cache domains. Likely deleted entirely. |
| `facility.ts` | Remove `fetchFacilities`/`fetchFacilityTypes`/`fetchFacilityGroups*`/`fetchVirtualFacilities`/`fetchArchivedFacilities`. Keep nothing unless a facility *wizard* needs step state. |
| `productStore.ts` | Remove list fetching. Keep only onboarding/wizard session state if any. |
| `shopify.ts` | Remove `fetchShopifyShops`/`fetchShopifyShopLocations`/`fetchShopifyTypeMappings`. `updateCurrentShop`/`getShopById` also go: the route already carries `shopId` and `useShopifyShop(id)` reads the record from the cache. Verified on `ShopifyConnections.vue` — the page now imports no store. |
| `netSuite.ts` | Remove mapping list fetches (they read `integrationTypeMappings`). |
| `appPermissions.ts` | Remove `fetchAssignments`/`fetchGroupUsers`; keep assignment-editing UI state. |
| `authorization.ts` | Remove `fetchUserPermissions`; keep group-editing state. |
| `user.ts` | **Keep** — session/profile/permissions are auth state, plus the Solr search list (Tier 4). |
| `klaviyo.ts` | Defer (its own connector shape; not in this sweep). |

## 4. Sequencing

| Step | Work | Why here |
| --- | --- | --- |
| **L0** | Build `useCachedList` + the hydration convention (§5.1). Convert **`ShopifyConnections.vue`** first — smallest page, domain already cached, 2 shops. | proves the 3-layer pattern end to end on one page |
| **L1** | Convert `ProductStore.vue` (the app's landing page — biggest perceived-speed win) | validates it on the page users hit first |
| **L2** | Add Tier 2 lookup domains (9 small domains, mechanical), gut `util.ts` | unblocks everything else; removes the store-as-data-holder |
| **L3** | Convert remaining Tier 1: `FindFacilities`, `FindGroups`, `FacilityGroupDetail`, `AppPermissions` (+ fix its N+1) | the facility/permission cluster |
| **L4** | Tier 3 shop-scoped domain + the 4 Shopify mapping pages | one new table, four pages |
| **L5** | NetSuite mapping family (5 pages) once their type lookups exist | mechanical |
| **L6** | Tier 4 review: decide per page whether the set is small enough to convert (§5.2) | needs real volume data |
| **L7** | Tier 5 sync history — after `shopifyBulkOperations` caching exists | separate track |

## 5. Cross-cutting concerns to settle before L0

### 5.1 Hydration state — the thing that will look like a bug if skipped
Cache-first means a first-ever visit renders an **empty** list while the bootstrap is still in
flight. Without a hydration flag, every list page flashes "No records found" before data appears.
Every read composable must expose `hydrated` (has the cache emitted?) and pages must distinguish:

- not hydrated → skeleton/spinner
- hydrated + empty → genuine "no records"

`appCacheBootstrap.bootstrapState` already tracks per-domain completion and can back this.

### 5.2 Client-side filtering is the default for these sets
Converting a list to cache-backed moves filtering/sorting client-side. That is correct here:
these are small reference sets — **500 facilities is already a sky-high number** for this app, and
verified counts on the test instance are far below it (facilities 25, facilityGroups 21,
permissions 79, serviceJobs 156). So client-side filtering is the default for every Tier 1–3 page,
and server-side search is retained only for the genuinely unbounded, relevance-ranked case
(`Users.vue`, Tier 4 — deferred).

**Loading strategy (decided):** class B and C load the **complete** set by paging until exhausted
— no 100-record cap. It happens once per app load, so completeness beats truncation.
Implemented as `pageAll()` in `src/workers/domains/workerFetch.ts`: pages at 250/request, stops on
a short page, and guards against an endpoint that ignores `pageIndex` (a page contributing no new
keys stops the walk) plus a 40-page backstop. Both guards `console.warn` rather than truncate
silently. Verified live: all 9 class-B domains load identically to before, with no warnings.

### 5.3 Derived counts
`ProductStore.vue` fetches shipment-method counts alongside stores, and `FindGroups.vue` derives
facility counts per group. Both become **pure derivations** over cached tables (`groupFacilities`
grouped by `facilityGroupId`) — put them in `src/utils/` as pure functions and unit-test them, not
in a store, not inline in the component.

### 5.4 N+1s to fix while converting
- `AppPermissions.vue` — `fetchGroupUsers(group.groupId)` per group.
- Sync history — one `shopify/graphql` per run (Tier 5).

### 5.5 Mutations on these pages
Every create/edit/delete on a list page must call
`refreshAfterMutation(domain, pk)` after success (Moqui returns no record — see F1). For deletes,
the refetch finds nothing and the row is removed from the cache. Without this the list won't
update after an edit.

### 5.6 Scoped lists and pruning
For scoped snapshots (group members, shop mappings) always pass the `scope` so
`snapshotReplace` prunes **within** the scope. Pruning globally on a scoped fetch would delete
every other scope's rows.

## 6. Open questions

1. **Volume at production scale** for facilities / users / permissions (gates §5.2 per page).
2. **`Parking.vue`** — is the virtual/archived facility set bounded enough to convert, or does it
   stay paged?
3. **Klaviyo** — in or out of this sweep?
4. **Tier 2 endpoint probes** — each new lookup domain still needs its envelope key + PK verified
   per the §6 checklist (three different envelope conventions already found).
