# Shopify Batch Order Sync API reuse matrix

Status: intake gate complete; Moqui Architect redesign and safe-error security review incorporated before delivery

This matrix records the verified reuse decision for every datum and action in
`shopify-batch-order-sync-scope.md`. It is intentionally biased toward existing
Company, Maarg, and connector contracts. A backend change is allowed only where
the existing contract cannot produce a truthful, shop-scoped result.

| Requirement | Existing Company surface | Existing server contract | Safe client composition | Proven gap | Smallest accepted change |
| --- | --- | --- | --- | --- | --- |
| Selected shop and Product Store | Connection route `:id`; existing stores remain mapping-only dependencies | Authenticated `GET shopify/order-sync/:shopId/job` safe context | Yes, from the exact response envelope with explicit loading/error/missing states | Generic shop/store endpoints expose a broader, independently loaded context that can cross during route changes | Connector safe context returns only the exact shop and linked Product Store projection; Company rejects stale/cross-shop responses |
| Shopify SystemMessage remote | Product Sync remote resolver established the required fields | Authenticated `GET shopify/order-sync/:shopId/job` safe context | Yes, from a credential-free allowlisted projection | Generic remote responses can contain transport/authentication configuration; modern Shopify setup owns the relationship through `ShopifyShopRemote`, while `SystemMessageRemote.internalId` is only a legacy fallback | One shared internal resolver treats a unique `SsctShopifyDefaultApp` link as authoritative, falls back only to compatible legacy metadata when no canonical link exists, rejects ambiguous/conflicting/no-access remotes, and projects the derived `remote.ownerShopId` without credentials; Company requires exact selected-shop equality |
| Suitable shop job detection | `useServiceJob` and onboarding status derivation | Authenticated `GET shopify/order-sync/:shopId/job` backed by `ShopifyOrderSyncJob` | Yes for presentation; the same semantic contract remains mutation authority | Exact-name lookup misses equivalent jobs; per-job parameter lookups are wasteful and race-prone | Connector adds a bounded ServiceJob/required-parameter view and explicit missing/configured/conflict/error states |
| Clone standard job | Existing service-job clone helper | `POST admin/serviceJobs/queue_ShopifyOrderSync/clone` | Partly | Clone inherits cron and starts paused, but prevents only the exact requested name; the generic service does not check the caller's permission | Explicit connector configure service requires `COMMON_ADMIN`, resolves the selected shop/remote, uses a shop-keyed native semaphore plus the job view, and delegates only to clone `queue_ShopifyOrderSync` |
| Inherited schedule | Product Sync schedule presentation | Clone service copies the job definition; job detail returns cron | Yes | Inheritance is not asserted today | Compare template/clone cron after clone and fail setup truthfully if they differ |
| Schedule edit and dirty guard | Product Sync cron parser/preview/modal pattern; `useServiceJob` | Generic ServiceJob update, job runs, and audit endpoints | Partly | Existing update validation is reusable, but its permission check inspects permissions configured on the job group rather than the current caller | UI reuses the interaction; explicit connector update service requires `COMMON_ADMIN`, validates ownership through the job view, accepts only cron/paused, then delegates to native validation |
| Explicit activation | User permission store | `PUT admin/serviceJobs/:jobName` with `paused=N` | Yes for presentation; server remains authority | No Order Sync warning acknowledgement | UI confirmation lists warnings; backend status-update permission remains required |
| Sales Channel readiness | Sales Channel mapping view/store | `oms/shopifyShops/typeMappings`, `mappedTypeId=SHOPIFY_ORDER_SOURCE` | Yes, bounded by selected shop | Mapping store can collapse transport failure to empty | Order store preserves error separately from a genuine missing warning |
| Payment Method readiness | Payment Method mapping view/store | `oms/shopifyShops/typeMappings`, `mappedTypeId=SHOPIFY_PAYMENT_TYPE` | Yes, bounded by selected shop | Same error/missing ambiguity | Same request-state treatment |
| Shipping Method readiness | Shipping Method mapping view/store | `oms/shopifyShops/carrierShipments` | Yes, bounded by selected shop/carrier mappings | Same error/missing ambiguity | Same request-state treatment |
| Latest batch and pending work | `useSystemMessage`, Product Sync bounded query pattern | `admin/systemMessages`, `oms/dataDocumentView` | Yes when remote/type/status/page size are fixed | No Order Sync state derivation | Order store queries only `ShopifyOrderSync` for the selected remote and derives active/latest states |
| Zero/one/two imports | `useDataManagerLog` low-level requests | `DataManagerLog.systemMessageId`, `admin/dataManager/details` | Yes after connector repair | Scheduled staging omits `systemMessageId`; the sender stages once per 250-order Shopify page, so a batch can create more than two logs; current helper returns only the first log | Connector accumulates actionable IDs across every Shopify page and stages once, propagating the originating ID into the zero/one/two MDM uploads; Company aggregates both config IDs |
| Overall status and processed count | None Order-specific; pure derivation is appropriate | Correlated DataManager log statuses/counts | Yes | No zero/one/two or partial state model | Pure tested utility derives Completed/Partially completed/Failed/active and successful count |
| No-change Completed, count 0 | Same SystemMessage/log snapshot | Completed `ShopifyOrderSync` with no correlated MDM logs | Yes | Must distinguish no imports from failed/missing correlation | Pure state derivation treats completed request plus zero imports as Completed/0 |
| Shop job next run and history | `useServiceJob` | Job detail, runs, active lock, and audit endpoints | Yes | None | Direct reuse |
| Run now | `useServiceJob.runServiceJob` | Generic job runner returns `jobRunId`; Moqui has parameter-segmented database-backed service semaphores | UI guard alone is race-prone | Existing endpoint has no shop-batch overlap guard and does not verify the current caller | Explicit connector run service requires `COMMON_ADMIN`, validates job/remote/shop, performs an early check, then invokes the job; the queue service uses a remote-keyed native semaphore around its authoritative active-work check and message creation |
| Latest 100 successful orders | No truthful Company source | `ShopifyOrderHistory` advances for unchanged orders and lacks batch/result correlation | No | Existing history cannot prove DataManager success | Append-only `ShopifyOrderSyncAudit` rows written only after successful MDM record processing; bounded shop query (100 max) |
| Latest 100 errors | Product Sync loading/empty/refresh/download interaction only | DataManager logs/files for both order config IDs plus authenticated `GET shopify/order-sync/:shopId/errors` | No safe direct client composition | `downloadDataManagerFile` returns the complete failed record artifact; Order Sync JSON errors contain the original nested Shopify order payload, including customer/address/line-item data, before any client projection; it also does not prove content-to-log/shop ownership | Dedicated connector monitoring service validates shop/remote/type/config/log/SystemMessage correlation, reads error content only server-side, projects/redacts exact safe fields, walks a hard-bounded newest-first log set, and returns at most 100 rows |
| Client-side search | Existing searchbar/list patterns | None needed | Yes | None | Filter only the loaded success/error arrays; tests assert zero transport calls |
| Adaptive refresh | `useLiveDashboard` visibility/in-flight/stale-data mechanics | None needed | Yes | Existing Product Sync cadence/lifecycle differs | Small Order Sync polling composable: 10s active, 60s idle, manual refresh, Ionic leave stop |
| Monitoring permission | Authenticated Shopify integration routes | Existing authenticated read endpoints | Yes | None if responses remain safe | Both pages remain authenticated but not admin-route-gated |
| Administrative mutations | `useUserStore.hasPermission` | Existing `COMMON_ADMIN`; generic ServiceJob services | UI visibility only; backend must enforce | Existing ServiceJob services inspect permissions assigned to the job's group but do not verify the current caller; no separate Integration Administrator permission exists | Reuse established `COMMON_ADMIN` in UI and every connector management action; do not add OMS seed data or a generic Order Sync permission |
| Individual retry | No Order retry action | Existing `OrderUnifiedMegaQuery.ftl`, SystemMessage queue, indexed `SystemMessage.messageId`, and native semaphores | No: must be server-side for remote/shop/auth/idempotency | No shop-scoped fresh-fetch retry contract | Explicit connector retry service accepts only shop, numeric Shopify order ID, and UUID request ID; it semaphores on the UUID, stores it in `SystemMessage.messageId`, returns the existing message on replay, and queues a standalone targeted message |
| Fresh-fetch failure truth | None | Current stage flow warns/logs when Shopify returns no payload or GraphQL fails | No | Missing or failed upstream fetches can currently fall through to an empty upload/Completed 0, which is indistinguishable from a truthful no-change batch | Make requested-order fetch failures service/DataManager-visible errors and upload only after requested payload preparation succeeds |
| Job-run correlation | Existing job and SystemMessage records | ServiceJob runner returns `_jobRunId`; DataManager supports `createdByJobRunId` | No until propagated | Connector queue/stage calls currently drop the job-run identifier | Propagate `_jobRunId` through the connector queue and staging contracts without changing framework or maarg-util |
| Retry during active batch | None | Targeted retry service is independent of scheduled job | Yes once server contract exists | General run and retry must have different overlap policy | Do not apply scheduled overlap guard to targeted retry; keep permission/idempotency checks |
| Retry response/link | None | New retry service returns `systemMessageId` | Yes | None after service exists | Keep error list mounted, render canonical SystemMessage link, refresh stale-while-visible |
| Immutable original error | Existing DataManager records are read-only in this workflow | No retry update/delete of the original log/content | Yes | UI could accidentally filter/remove it | Treat errors as immutable input and re-fetch without acknowledgement/resolution writes |
| Shopify and HotWax links | Existing app URL helpers and shop domain | Shop/audit contains validated identity and internal order ID | Yes | Synthetic Shopify IDs must never get Shopify links | Link only validated real-shop IDs; internal links use audited OMS order ID |
| Safe operational response | Order store validates exact envelopes and never retains raw payloads | Safe job/audit/error connector queries | Yes, only after server projection | Broad generic remote data and raw DataManager error artifacts can contain credentials, PII, content paths, and unrelated fields | New services output explicit fields only; error rows contain only stable correlation, allowlisted order identity, sanitized/truncated error text, time/config/result, and retryability |

## Server-change gate verdict

The frontend can safely compose shop context, mapping readiness, job detail,
schedule, SystemMessage state, and DataManager summaries from existing bounded
contracts. No dashboard facade is approved.

The following connector deltas are unavoidable and independently proven:

1. Accumulate actionable order IDs across all Shopify pages and invoke staging
   once, so one scheduled batch produces zero, one, or two MDM imports rather
   than another pair for every 250-order page.
2. Propagate `SystemMessage.systemMessageId` and `_jobRunId` through the queue
   and `stage#ShopifyOrder` into each DataManager log and per-record import
   parameters.
3. Turn a requested-order GraphQL/no-payload failure into a real service/MDM
   error; it cannot be reported as a successful no-change batch.
4. Record a bounded, append-only successful-order audit only after a
   DataManager record succeeds; `ShopifyOrderHistory.processedDate` is not a
   valid substitute.
5. Expose a bounded shop-scoped audit query (hard maximum 100).
6. Add one internal canonical-link-first shop/remote resolver, a narrow
   `ShopifyOrderSyncJob` view, and separate `COMMON_ADMIN` configure, update,
   and run services. Use native parameter-keyed semaphores for duplicate
   configuration and authoritative remote-scoped overlap checks; do not add a
   lock table or a string-dispatched management facade.
7. Add a permissioned, shop-scoped individual retry that uses a UUID request
   ID in indexed `SystemMessage.messageId` under a native semaphore, creates a
   standalone SystemMessage, and reuses the current mega-query staging path.
8. Add an authenticated, non-admin monitoring read for the latest safe error
   projections. It validates the selected shop's remote and every
   SystemMessage/DataManager/config/log relationship, reads `DmcntError`
   content only inside the connector, redacts and truncates the allowlisted
   identity/error fields, and returns at most 100 rows. This replaces unsafe
   browser-side download of full failed Shopify order payloads; it is not a
   dashboard facade and performs no acknowledgement, retry, or history write.

All eight change groups belong to the canonical
`hotwax/mantle-shopify-connector` checkout. No change is approved for the
dirty framework, `maarg-util`, or `oms` checkouts.
