# Facility Detail — cache + live architecture (pilot for all detail pages)

**Status:** Plan, decisions settled — ready to implement.
**Drafted:** 2026-07-26
**Pilot page:** `src/views/FacilityDetails.vue` (the heaviest detail page: 65-action store, ~13 loads)

---

## 1. Decisions

| # | Decision |
| --- | --- |
| E1 | **No Pinia anywhere on this page.** There is no cross-route editing in this app, which was the only case that justified a store. Reads come from the cache or a live fetch; writes go through a mutations composable. |
| E2 | **One façade composable** — `useFacilityDetail(facilityId)`. The page imports exactly one thing and never knows which parts came from cache vs network. |
| E3 | **Progressive hydration.** Cached parts paint instantly; live parts stream in behind per-section skeletons. Not one global spinner. |
| E4 | **Cache the per-record associations** (class C: on-demand, parent-scoped, TTL) so re-entering the page is instant. |
| E4b | **Cache only what has reuse beyond the page.** A partly-live detail page is acceptable; per-page-only data stays live rather than earning a table, a TTL and an invalidation path. |
| E5 | **Volatile data is never trusted from cache** — order counts change constantly. Always refetched on entry, plus an explicit refresh affordance on the page. |
| E6 | Out of IDB scope permanently: **Klaviyo, agent pages, Users**. |

## 2. Data inventory — every load this page performs

### Class 1 — already cached, zero network (read via existing composables)

| Data | Cached domain |
| --- | --- |
| Facility base record | `facilities` (`useFacilityRecord`) |
| Facility types | `facilityTypes` |
| Facility group types | `facilityGroupTypes` |
| All facility groups (picker) | `facilityGroups` |
| This facility's group memberships | `groupFacilities` scoped by `facilityId` |
| Party roles | `roleTypes` |
| Product stores (picker) | `productStores` |

⚠️ **Probe first:** the list cache is the `FacilityAndType` **view**; the detail endpoint
`oms/facilities/{id}` may return fields the view omits. If so, the detail record becomes class 2
rather than a cache read. This is the single most important verification before coding.

### Class 2 — app-load cache (NOT on-demand)

**Decided 2026-07-26:** the two datasets worth caching are needed by *other* pages, so they load at
app login with everything else. No TTL, no per-parent freshness, no on-demand machinery.

| Data | Endpoint | Why cached | Shape |
| --- | --- | --- | --- |
| **Facility identifications** | `oms/facilities/identifications` | the search page will query external IDs | **global list — one call.** Verified in the Moqui REST definition: `identifications` sits OUTSIDE the `<id name="facilityId">` block, so it returns every facility's identifications, not one facility's |
| **Facility ↔ product store** | `oms/productStores/{id}/facilities` (view `ProductStoreFacilityDetail`) | the facility list will filter by product store | **per-store — small fan-out.** No global variant exists; product stores are few and already cached, so iterate them at app load |

Everything else this page reads stays **live per visit** — locations, parties (+ the `oms/users`
join, which also keeps out-of-scope user data out of the cache), contact mechs, calendar. Page-only
data does not earn a table, and a partly-live detail page is fine (E4b).

**Consequence: the class-C / on-demand factory is not needed for this page at all.** Build it only
if a later page genuinely needs per-parent lazy loading.

### Class 3 — volatile, never cached (E5)

| Data | Endpoint | Calls today | Why volatile |
| --- | --- | --- | --- |
| Order count (headline) | `admin/facilities/orderCount` | 1 — **nested inside `fetchCurrentFacility`** | changes constantly |
| Order count history | `oms/facilities/facilityOrderCounts` | 1 — **already lazy**, only on modal open | changes constantly |
| Lat/long generation | `utilStore.generateLatLong` | on demand | an action, not a read |

⚠️ **Rule this page forces: a volatile field must never be merged into a cached row.**
`fetchCurrentFacility` currently calls `fetchFacilityOrderCounts([id])` and assigns
`facility.orderCount` onto the record (`src/store/facility.ts:171-172`). If the facility record is
cached with that field attached, every revisit serves a stale order count from IndexedDB — the
cached row would silently carry live data. So:

- cache the facility record **without** `orderCount` (the list cache already lacks it — the store
  is what bolts it on);
- fetch the count separately as class 3 and merge it **in the composable**, not in the cache;
- the refresh affordance then re-runs one small call and never touches the cached record.

The history modal needs no change: it is already lazy and stays uncached.

## 3. Architecture

```
useFacilityDetail(facilityId)          ← the page imports ONLY this
├── class 1  liveQuery            → paints immediately, self-updating
├── class 2  app-load cache       → identifications, facility↔product-store (both reused elsewhere)
├── live     per-visit fetch      → locations, parties, contacts, calendar (page-only data)
└── class 3  volatile fetch       → order counts: always on entry + manual refresh
```

Returned shape — **three independent readiness signals**, which is what makes E3 work:

```ts
const {
  facility,            // merged view of all three classes
  hydrated,            // class 1 painted (cache emitted)
  loadingAssociations, // live + class-2 parts in flight
  loadingVolatile,     // class 3 in flight
  refreshVolatile,     // E5 affordance — refetch order counts only
  refreshAll,          // force everything, including class 2
} = useFacilityDetail(props.facilityId);
```

The page binds skeletons **per section** to the relevant flag, never to one global `isLoading`.

### New machinery: class C on-demand domains

The existing snapshot factory syncs whole sets at login. Class 2 needs a second factory:

```ts
// PROPOSED — src/workers/domains/onDemandDomain.ts
registerOnDemandDomain({
  name: "facilityContact",
  table: "facilityContactMechs",
  projection,
  parentField: "facilityId",
  fetch: (ctx, facilityId) => workerGet(ctx, "oms/facilityContactMechs", { facilityId, pageNoLimit: true }),
  ttlMs: 10 * 60_000,
});
```

- Harness gains `loadOnDemand(domain, parentId)`; the marker key becomes `domain:<name>:<parentId>`
  so freshness is tracked **per parent**, not per domain.
- Snapshot writes must use `scopeOnSync` on the parent field, so loading facility B never prunes
  facility A's rows (the same partition rule already used for typed enums).
- Main thread: `useOnDemand(domain, parentId)` subscribes to the parent-scoped slice and asks the
  worker to load it when the marker is missing or older than the TTL.

### Writes (no store — E1)

`useFacilityMutations(facilityId)` wraps the create/update/delete calls and, after each success,
calls `refreshAfterMutation(...)` / `resyncDomain(...)` for the affected domain — because Moqui
returns no record on update (finding F1).

## 4. Implementation steps

| Step | Work |
| --- | --- |
| **F0** | Read-only check (no live probe, no gate): compare the fields `FacilityDetails.vue` renders against the cached `facilities` projection, and extend the projection if the detail view needs more. Add `FACLOC_TYPE` + the external-mapping enum type to `TYPED_ENUM_TYPES`. |
| **F1** | ~~class-C machinery~~ **not needed** — both cached datasets are app-load (class B). Skipped. |
| **F2** | Register two class-B domains: `facilityIdentifications` (global, one call) and `productStoreFacilities` (fan-out over cached product stores — needs a small multi-call snapshot variant of the factory). |
| **F3** | Build `useFacilityDetail(facilityId)` façade + `useFacilityMutations(facilityId)`. |
| **F4** | Rewrite `FacilityDetails.vue` against the façade: per-section skeletons, volatile refresh button in the header. |
| **F5** | Delete the legacy code in §5. |
| **F6** | Apply the same shape to the remaining detail pages (`ProductStoreDetails`, `SecurityGroupDetail`, `UserDetails`, `FacilityGroupDetail`, `ShopifyShopDetails`). |

## 5. Legacy code this lets us delete

`src/store/facility.ts` has **65 actions**. Measured against every view and component:

### 5a. Dead already — delete immediately, no migration needed (5)

No component references these at all. `fetchFacilityGroupsWithSearch` became dead when
`FindGroups` migrated this session.

```
enrichGroupsWithCounts
enrichVirtualFacilitiesDetail
fetchFacilityGroupsWithSearch     ← orphaned by the FindGroups migration
fetchFacilityLogins
fetchJobData
```

### 5b. FacilityDetails-only READS — deleted by this plan (8)

| Action | Replaced by |
| --- | --- |
| `fetchCurrentFacility` | cached record (or class 2, pending the F0 probe) |
| `fetchCurrentFacilityGroups` | `groupFacilities` scoped by `facilityId` |
| `fetchExternalMappingTypes` | `typedEnums` |
| `fetchLocationTypes` | `typedEnums` (`FACLOC_TYPE`) |
| `fetchPartyRoles` | `roleTypes` (already cached) |
| `fetchFacilityIdentifications` | class 2 on-demand cache |
| `getPartyRoleAndPartyDetails` | folded into the parties class-2 domain |
| `fetchFacilityOrderCountHistory` | class 3 volatile fetch in the composable |

### 5c. FacilityDetails-only WRITES — **moved**, not deleted (10)

These leave the store for `useFacilityMutations` (E1 says no store, but the calls themselves stay):

```
createFacilityContactMech      updateFacilityContactMech      deleteFacilityContactMech
createFacilityEmailAddress     updateFacilityEmailAddress
createFacilityPostalAddress    updateFacilityTelecomNumber
createFacilityTelecomNumber    updateDefaultDaysToShip        deleteShopifyShopLocation
```

### 5d. Store state that disappears with this page

`current` (the singleton aggregate — also removes the stale-flash bug when switching facilities),
`externalMappingTypes`, `locationTypes`, `partyRoles`. `facilityTypes`, `facilityGroupTypes`,
`calendars`, `groups` are **gated** — still read by other pages.

### 5e. Gated on other pages (42 actions)

Not deletable yet. Notable blockers: `FindFacilities` (7), `Parking` (4), `AddFacilityConfig`,
`CreateUser`/`UserDetails` (party actions), and 14 facility components. `facility.ts` can only be
deleted outright once **all** of those migrate — realistically after F6.

### 5f. Elsewhere

- `utilStore.fetchFacilityGroups` / `fetchStates` calls from this page (state stays until other
  consumers migrate).
- `useServiceJob` import in `Settings.vue` was already removed; `utilStore` there is now only
  `maargInfo`.

## 6. Open questions

1. **F0 probe result** — is the detail record shape a superset of the cached list view? Decides
   class 1 vs class 2 for the main record.
2. **TTL for class 2** — 10 min proposed. Shorter for associations edited in-app (mutations already
   refresh them explicitly, so the TTL only covers out-of-app edits).
3. **Do parties need the `oms/users` join cached too**, or resolve names from a users domain? Users
   is out of IDB scope (E6), so the join result should probably be cached with the parties rows.
4. **Where does the volatile-refresh affordance live** — header icon button (matches Settings'
   cache card) vs inline next to the order-count section? Header is my recommendation.
