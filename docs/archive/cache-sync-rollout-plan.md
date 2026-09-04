# Cache + sync rollout plan v2 — applying the DataManagerLog architecture to the rest of the app

**Status:** Plan, decisions settled — ready to implement.
**Drafted:** 2026-07-26 (v2 — supersedes v1 after review)
**Scope:** the `company` app (app-local; promotes to `@common` later per
[worker-polling-service-design.md](./worker-polling-service-design.md))

---

## 1. Settled decisions (from review)

| # | Decision |
| --- | --- |
| D1 | **Class B does not self-poll on an interval.** It syncs (a) once at app load, and (b) on mutation from the app. |
| D2 | **Class B syncs app-wide from app load** — not view-scoped. This is what makes navigation instant. |
| D3 | **All domain-specific Pinia stores get wiped** as step one. Keep only what login/session needs. Stores are rewritten over the new data layer afterwards, with product store as the first test case. |
| D4 | **Retention policy deferred.** Class A tables grow for now; revisit when age-based pruning matters. |
| D5 | **No cross-session persistence yet** — clear IndexedDB on logout. Cross-session and cross-tab DBs are later-stage work. |
| D6 | **Offline reads are in scope by consequence** (the data is local); **offline mutation is not**. No write queue. |
| D7 | Class A polling cadences as charted (10–15 s) are acceptable. |

## 2. Backend findings that change the design — VERIFIED from source

Three findings from `moqui-framework` source (`~/Documents/GitHub/moqui/maarg-oms`). These
overturn assumptions in v1 and in the review, so read them before coding.

### F1 — Moqui mutations do NOT return the updated record ⚠️

The review assumed a 200 response would carry the updated PK object. It does not.
`RestApi.groovy:401-403` routes `create`/`update`/`store`/`delete` to Moqui's implicit
entity-auto services, and `EntityAutoServiceRunner.groovy` shows what those put in the result:

- **`create`** → **PK fields only** (`checkAllPkFields` → result), plus `fromDate` for
  date-effective entities, plus nested related results.
- **`update`** → **effectively empty**. Only `oldStatusId` / `statusChanged`, and only when the
  entity has a `statusId` field (`checkStatus`, `:444-447`). The updated record is **not** returned.
- **`store`** → same PK-only shape as create.
- **`delete`** → nothing useful.

**Consequence:** re-pull-by-PK is the **rule, not the fallback**. The mutation-sync path is
always `mutate → refetch by PK → upsert cache`. Do not build an "if the response has the object,
clone it" optimistic path for auto-entity endpoints — it will never fire.

Custom services (e.g. `co.hotwax.job.JobServices.update#ServiceJob`) return whatever their
out-parameters declare and **must be checked individually** (§6 checklist) — a few may return the
record, in which case the refetch can be skipped for that endpoint only.

### F2 — There is no `jobName`-free route to ServiceJobRun ⚠️

Answering the review question directly: **no.** Every REST route to job runs is nested under the
job (`admin.rest.xml:234-243`):

```
admin/serviceJobs/{jobName}/runs                  → ServiceJobRun, operation="list"
admin/serviceJobs/{jobName}/runs/{jobRunId}       → ServiceJobRun, operation="one"
admin/serviceJobs/{jobName}/runs/activeJobRun     → ServiceJobRunLock, operation="one"
```

There is no top-level `serviceJobRuns` resource anywhere, no DataDocument for `ServiceJobRun`
(so `oms/dataDocumentView` can't serve it), and no generic entity REST path. A cross-job feed
would require a new Moqui API — **excluded** by the no-new-APIs constraint.

**Three ways to live with it, in order of preference:**

1. **Scope to the jobs you actually monitor.** Order-sync monitoring needs the 1–3 jobs behind
   that sync, not all ~250. N polls where N is small is fine. Register one class-A domain
   instance *per watched job*, cursor per job.
2. **Ride the FKs you already poll.** `SystemMessage` has a `ServiceJobRun` relationship
   (`ServiceEntities.xml:29`, `SYS_MSG_JOB_RUN_ID`) and `DataManagerLog` has
   `DM_LOG_CRT_JOB_RUN_ID` (`:56`). The messages/logs you poll anyway *carry* the relevant
   `jobRunId`s — resolve those specific runs on demand (class C) instead of streaming all runs.
3. **`activeJobRun` for "is it running right now"** — one cheap call per watched job, which is
   the actual question the monitoring UI asks. Cheaper than listing run history.

**Recommended:** (3) + (2) for the monitoring UI, and (1) only where real run *history* is needed.
Do **not** fan out across every job name.

### F3 — Read shape ≠ write shape (view-entities) ⚠️

Several GETs return **view-entities** while the mutation targets the **base entity**:

| Read (view) | Write (base) |
| --- | --- |
| `oms/facilities` → `co.hotwax.facility.FacilityAndType` | `Facility` |
| `oms/groupFacilities` → `co.hotwax.facility.FacilityGroupAndMember` | `FacilityGroupMember` |
| `oms/productStores/{id}/facilities` → `ProductStoreFacilityDetail` | `ProductStoreFacility` |
| `oms/productStores/{id}/facilityGroups` → `ProductStoreFacilityGroup` | (assoc entity) |

**Consequence:** after a mutation, refetch through the **read/view endpoint**, not the base
entity, or the cached row will have a different shape than the rows the snapshot sync wrote.
The cache is shaped by the read contract.

## 3. Three sync classes

Unchanged from v1 in substance; class B's trigger is now mutation + app-load (D1/D2).

| Class | Shape | Strategy | Trigger |
| --- | --- | --- | --- |
| **A — Live / append-mostly** | grows continuously in the background | incremental cursor + refresh-unfinished | worker interval, 10–15 s, view-scoped |
| **B — Reference / config** | small, bounded, changes on human edit | full snapshot replace (upsert + prune) | **app load**, then **per-mutation refetch by PK** |
| **C — On-demand detail** | per-record drill-down | fetch by id, cache, TTL | explicit call |

## 4. Domain chart

`admin/serviceJobs` returns the **definition** only (`jobName`, `cronExpression`, `paused`,
parameters — `src/utils/serviceJob.ts:20-30`), with no run timestamps. So definitions are class B
and runs are the churning stream — what actually "moves" is **system messages** and **service job
runs**.

| # | Domain | Read endpoint | Cache key | Class | Refetch-after-mutation |
| --- | --- | --- | --- | --- | --- |
| 0 | Data manager log | `admin/dataManager/details` | `logId` | **A** ✅ built | n/a |
| 1 | System message | `admin/systemMessages` | `systemMessageId` | **A** | n/a |
| 2 | Service job run | `admin/serviceJobs/{jobName}/runs` (+ `activeJobRun`) | `jobRunId` * | **A/C** — see F2 | n/a |
| 3 | Service job (definition) | `admin/serviceJobs`, `admin/serviceJobs/{jobName}` | `jobName` | **B** | by-PK GET ✅ |
| 4 | System message remote | `oms/systemMessageRemotes` | `systemMessageRemoteId` | **B** | by-PK GET ✅ |
| 5 | Product store | `admin/productStores`, `admin/productStores/{id}` | `productStoreId` | **B** | by-PK GET ✅ |
| 6 | Shopify shop | `oms/shopifyShops/shops` | `shopId` | **B** | filtered list * |
| 7 | Facility | `oms/facilities` (view: `FacilityAndType`) | `facilityId` | **B** | by-PK GET ✅ (view shape — F3) |
| 8 | User | `admin/users/...`, `oms/parties/{partyId}` | `partyId` * | **B** | by-PK GET ✅ |
| 9 | Facility group | `oms/facilityGroups` | `facilityGroupId` | **B** | filtered list * |
| 10 | Facility group member | `oms/groupFacilities` (view: `FacilityGroupAndMember`) | synthetic — §5 | **B** | **filtered list** (no id route) |
| 11 | Permissions | `admin/userPermissions`, `admin/userGroups/{id}/permissions` | `permissionId` / `userPermissionId` * | **B** | **filtered list** (no id route seen *) |
| 12 | Integration type mapping | `admin/integrationTypeMappings` | `integrationMappingId` | **B** | by-PK GET ✅ |
| — | Entity audit log ("who edited it") | `admin/entityAuditLogs` (`pkPrimaryValue`) | n/a | **C** | n/a |

`*` = confirm against a live response before coding (§6).

## 5. Architecture to build

### 5.1 One worker, domain registry (unchanged from v1)

Twelve workers = twelve threads. One sync worker holds domain descriptors; one base tick runs
whichever are due. Class B entries have no interval — they run at app load and on demand.

```ts
// PROPOSED — src/workers/syncRegistry.ts
interface SyncDomain {
  name: string;
  intervalMs?: number;                                  // class A only; absent = on-demand
  sync: (ctx: PollOnceContext) => Promise<{ written: number }>;
  refetchOne?: (ctx: PollOnceContext, pk: any) => Promise<{ written: number }>;  // class B mutation path
}
```

`pollingWorkerHarness.ts` grows from "call one `pollOnce`" to "run due domains + serve
`refetchOne` requests." The `pollingService` / composable contract is unchanged.

### 5.2 The mutation-sync path (the new piece — per D1 + F1)

```ts
// PROPOSED — src/services/cacheSync.ts
// Call AFTER any successful mutation. Refetches the record by PK through the READ endpoint
// (F3) and upserts it, so the UI updates from the cache via liveQuery.
await cacheSync.afterMutation("productStore", { productStoreId });
await cacheSync.afterMutation("facilityGroupMember", { facilityGroupId, facilityId });  // filtered list
```

Routing: `afterMutation` → worker `refetchOne` → read endpoint → upsert → liveQuery → UI.
Where a domain has **no by-PK read route** (#10, #11), `refetchOne` falls back to a
**scoped list** re-fetch for just that parent (e.g. all members of one facility group), not a
full snapshot.

**Deletes** need explicit handling: a delete mutation must remove the row from the cache — a
refetch returns nothing and would otherwise leave the stale row in place.

### 5.3 Cache shape

One Dexie DB, one table per domain, replacing the single-purpose `DataManagerLogCacheDB`:

```ts
// PROPOSED — src/utils/appCacheDb.ts   (DB name: CompanyCacheDB)
this.version(1).stores({
  dataManagerLogs: "logId, configId, systemMessageId, statusId, createdDate, finishDateTime, lastUpdatedStamp",
  systemMessages:  "systemMessageId, systemMessageTypeId, systemMessageRemoteId, statusId, initDate, processedDate, lastUpdatedStamp",
  serviceJobRuns:  "jobRunId, jobName, startTime, endTime, hasError",
  serviceJobs:     "jobName, serviceName, paused, cronExpression",
  productStores:   "productStoreId, storeName",
  shopifyShops:    "shopId, productStoreId, systemMessageRemoteId, shopifyShopId",
  facilities:      "facilityId, facilityTypeId, parentFacilityId",
  facilityGroups:  "facilityGroupId, facilityGroupTypeId",
  groupFacilities: "memberKey, facilityGroupId, facilityId, fromDate, thruDate",
  users:           "partyId, userLoginId",
  permissions:     "permissionId",
  integrationTypeMappings: "integrationMappingId, integrationTypeId",
});
```

Rows keep indexed fields + `raw` + `cachedAt`, as `CachedDataManagerLog` does today.
**Migration:** new DB name; delete `DataManagerLogCacheDB` by name on first run (pure cache, re-seeds).

**Special cases**
- **#10 composite key.** `FacilityGroupAndMember` is date-effective with a natural key of
  `facilityGroupId` + `facilityId` + `fromDate`. Store synthetic
  `memberKey = "${facilityGroupId}|${facilityId}|${fromDate}"`, index the parts. (Dexie compound
  PK `"[a+b]"` exists; verify in the Capacitor WKWebView before preferring it.) The app already
  queries with `filterByDate: "Y"`, so honor `thruDate` expiry in projections too.
- **Class B must prune.** Snapshot sync deletes cached rows absent from the fresh set, in one
  Dexie transaction (`bulkPut(fresh)` then delete missing keys) — otherwise deleted
  facilities/stores linger forever. Class A never needs this (append-only).
- **#8 users** span `admin/users*` and `oms/parties/*`. Decide the cached shape (party record vs
  user-login vs joined projection) **before** coding, and key accordingly.
- **Logout (D5):** wipe all tables. Wire into `src/store/user.ts` `postLogout()`, which already
  resets the Pinia stores.

## 6. Per-domain verification checklist — probe, do not assume

Before writing each domain's sync, confirm against the live backend and **append the result to
this doc** so nobody re-probes:

1. **Response envelope** — collection key, and `resp.data.X` (axios) vs `resp.X` (workerRemoteApi).
2. **Primary key field** — exact name, unique and stable.
3. **Paging** — `pageSize`/`pageIndex`, or `pageNoLimit: true` (several reference endpoints
   already use it).
4. **Ordering** — is `orderByField` honored, with `-` for descending?
5. **Cursor (class A only)** — which time field advances (`initDate`? `processedDate`?
   `lastUpdatedStamp`?) and is `<field>_from` honored?
   ⚠️ `createdDate_from` is proven **only** on `admin/dataManager/details`; that endpoint also
   silently ignores `createdDate_op`. Auto-entity `list` endpoints go through a different code
   path and may behave differently — probe both forms. With no working cursor, fall back to a
   bounded newest-first page + client-side cutoff and **document it** rather than over-fetching.
6. **Mutation return (per F1)** — for **custom-service** endpoints only, check the service's
   out-parameters; if it returns the record, skip the refetch for that endpoint. Auto-entity
   endpoints never do.
7. **By-PK read route exists?** If not (#10, #11), define the scoped-list fallback.
8. **Volume** — a "reference" set that turns out to hold 50k rows is not class B.

### 6.1 Probe results log — append every finding here so nobody re-probes

| Date | Endpoint | Finding |
| --- | --- | --- |
| 2026-07-26 | `admin/dataManager/details` | ✅ **honors `createdDate_from`** (ISO string, inclusive of the boundary). ❌ **ignores `createdDate_op=greaterThan`**. Verified live: filtered = 1 row / 476 B vs unfiltered 25 rows / 2979 B. `pageSize`/`pageIndex` and `orderByField=-createdDate` honored. Collection key `dataManagerLogs`. |
| 2026-07-26 | `admin/systemMessages` | ❌ **NO server-side date cursor exists.** Both `initDate_from` (ISO) **and** `initDate_op=greaterThan` (millis) are silently ignored — all three responses (either param, or neither) were byte-identical: 2386 B, 25 rows, max `initDate` exactly equal to the cursor, 0 rows newer. `pageSize`/`pageIndex` and `orderByField=-initDate` **are** honored. Collection key `systemMessages`. → incremental scoping is **client-side**, bounded to one 25-row page per tick; a quiet tick writes 0 rows. |

**Class-B endpoints — all verified live 2026-07-26.** Note the envelope convention differs per
endpoint, so `collectionKey` must be explicit per domain (never inferred):

| Endpoint | Envelope | PK | Rows cached |
| --- | --- | --- | --- |
| `admin/serviceJobs` | `{ serviceJobList, serviceJobCount }` | `jobName` | 156 |
| `oms/systemMessageRemotes` | `{ systemMessageRemoteList }` | `systemMessageRemoteId` | 10 |
| `admin/productStores` | **bare array** | `productStoreId` | 1 |
| `oms/shopifyShops/shops` | **bare array** | `shopId` | 2 |
| `oms/facilities` | **bare array** | `facilityId` | 25 |
| `oms/facilityGroups` | **bare array** | `facilityGroupId` | 21 |
| `oms/groupFacilities` | **bare array** | composite → synthetic `memberKey` | 110 |
| `admin/userPermissions` | **bare array** | `userPermissionId` | 79 |
| `admin/integrationTypeMappings` | **bare array** | `integrationMappingId` | 21 |

Corrections this probe forced: the facility read shape exposes **`parentTypeId`**, not
`parentFacilityId`; the permission PK is **`userPermissionId`**, not `permissionId`;
`admin/serviceJobs` **does** return computed `nextExecutionDateTime` + `cronDescription`, so "when
does it run next" is answerable from the definition (the app's `ServiceJob` TS interface in
`src/utils/serviceJob.ts` is narrower than the real response — do not treat it as the contract).

⚠️ **Generalization to avoid:** date-filter support is **per-endpoint**, and the two endpoints
probed so far are exact mirror images (`dataManager/details` honors `_from` / ignores `_op`;
`systemMessages` ignores both). Non-date `_op` support implies nothing about date `_op` support.
Always probe **both** forms and compare payload bytes against an unfiltered request.

## 7. Phasing

| Phase | Work | Gate |
| --- | --- | --- |
| **P0** | **Wipe domain-specific Pinia stores** (D3), keeping only login/session essentials. Inventory what each view loses so P6 can rebuild it. | app boots + login works |
| **P1** | Generalize the cache: `appCacheDb.ts` + `defineCachedEntity()` (key, indexes, `toCached`); migrate DataManagerLog onto it, no behavior change. Wire cache-wipe into `postLogout()` (D5). | DataManagerLog demo still green |
| **P2** | Registry in the harness (§5.1) + re-land DataManagerLog as a registered domain. | multi-domain cadence proven on a verified domain |
| **P3** | **Class-B snapshot sync** (fetch-all → transactional upsert + prune) + `cacheSync.afterMutation` (§5.2) + app-load bootstrap (D2). Land **product store** end-to-end incl. one mutation round-trip. | mutation → cache → UI updates without a manual reload |
| **P4** | **System message** (class A) — needs the §6.5 cursor probe. | live monitoring of the sync process |
| **P5** | **Service job (B)** + **run/active-run (C per F2)** — the pair behind "is it paused / last run / next run". | order-sync monitoring objectives ①② |
| **P6** | **Delete** the emptied domain stores. Decided 2026-07-26: list pages take the **composable route** — a page calls a read composable directly; no store is rebuilt as a projection. No store use case has been found for list pages at all. | pages read from cache, single source |
| **P7** | Remaining class B in batches: shopify shop + system message remote → facility + facility group + member → users + permissions + integration type mapping. | mechanical |
| **P8** | Class C `entityAuditLogs` helper ("who edited it"). | order-sync audit panel |
| **P9** | Promote framework layers to `@common` (separate doc). | ≥6 domains proven |

**If order-sync is the priority:** P1 → P2 → P4 → P5 → P8 delivers objectives ①② without waiting
on the store rewrite. P0/P3/P6/P7 are the app-wide data-layer track. Note P0 (wiping stores) will
break views until P6 rebuilds them — sequence it deliberately against what needs to keep working.

## 7.1 Implementation notes (as built)

- **Dexie schema is single-version by design.** Version bumps proved actively harmful: Dexie
  accepted a `version(2)` bump but silently did NOT create the added store, after which every
  write to it failed while fetches kept succeeding — a silent data-loss mode. The cache now
  declares ONE schema, and `ensureCacheReady()` compares the declared tables against the backing
  database's actual `objectStoreNames` and **rebuilds on mismatch**. Deterministic, not
  exception-driven (the failure was silent, so catching errors was not enough). Verified live: a
  planted stale 12-store DB self-healed to 13 stores and repopulated, discarding stale rows.
- **Two workers, not one.** Class B runs in an app-lifetime worker (`appCacheBootstrap`), class A
  in a view-scoped worker (`useCacheSync`), because their lifecycles differ. Bounded and
  intentional, but it is a deviation from the one-worker principle — consolidating them behind a
  single long-lived worker with per-domain activation is a candidate cleanup.
- **Class-B mutation path** is `refreshAfterMutation(domain, pk)` in `appCacheBootstrap`, which
  routes to the worker's `refetchOne`. Domains without a by-PK read route
  (`facilityGroupMember`, `facilityGroup`, `shopifyShop`) use a scoped re-list so removals inside
  the scope are pruned. A record that returns nothing is **removed** from the cache (delete path).

## 8. Remaining open items

1. **P0 blast radius.** Wiping domain stores breaks every view that reads them until P6. Decide
   whether to wipe all at once (fast, broad breakage) or per-domain alongside its P7 batch
   (slower, always-working app). **Recommend per-domain** unless a clean break is wanted.
2. **#8 users cached shape** — party vs user-login vs joined (§5.3).
3. **Server load** — many app-load snapshot fetches at once; confirm with backend owners, and
   consider staggering the bootstrap.
4. **Class-A registration lifetime** — view-scoped per D1's spirit; confirm which screens
   register which domains.

## 9. Not in scope

- Offline write queue / mutation replay (D6).
- Cross-session and cross-tab cache persistence (D5).
- Retention/pruning of class-A tables (D4).
- Service Worker / background sync while the tab is closed.
- Promotion to `@common` (P9, separate doc).
