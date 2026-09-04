# Shopify Batch Order Sync delivery ledger

This ledger is keyed one-to-one to the acceptance criteria in
`shopify-batch-order-sync-scope.md`. A visible behavior becomes **Proven** only
after focused automated coverage and reconciliation in the real Company UI
against the local OMS. Source inspection, a build, or a mocked transport test
alone is insufficient.

Status values: **Not started**, **Implemented**, **Proven**, **Blocked**.

Current validation snapshot (2026-07-23): Company focused coverage is 163/163
green and the production build passes; connector focused coverage is 43/43
green. Independent backend re-review is clean, with all P1/P2 staging,
idempotency, and cleanup findings resolved. These checks support implementation
status but do not replace the live proof required below. Tracking issues exist
as Company #278 and connector #435.

## Configuration

| ID | Status | Code owner / file | API or data source | Focused automated evidence | Required live evidence | Remaining uncertainty |
| --- | --- | --- | --- | --- | --- | --- |
| C1 | Implemented | Company configure view/store | Shopify shop + Product Store APIs | route, selected-shop, stale-response, and error-state coverage in the 152-test Company run | open setup for a real shop and reconcile the displayed shop and linked Product Store with OMS | setup page was not exercised in the final browser pass |
| C2 | Implemented | Company store | ServiceJob clone/detail | equivalent-job, exact payload, duplicate response, and submit-lock cases | clone one unconfigured shop, repeat after reload, and reconcile exactly one suitable job | concurrent live callers remain unproven |
| C3 | Implemented | Company store | ServiceJob parameters + selected remote | remote/type/cross-shop envelope and payload cases | reconcile the persisted remote and `ShopifyOrderSync` type for a live clone | no live clone was created in this pass |
| C4 | Implemented | Company configure view/store | two type mappings + carrier shipment mappings | exactly three families, same-shop return links, and no Product Type | compare the live checklist with Sales Channel, Payment Method, and Shipping Method records for one shop | no live missing-family fixture was exercised |
| C5 | Implemented | Company state utility/view | job/detail request state | configured, paused, missing, loading, and error derivation table | exercise each state against real OMS responses | only the configured monitoring route was exercised live |
| C6 | Implemented | Company state utility/view | mapping readiness + valid job | warnings remain non-blocking in focused utility/view coverage | show a valid live job with at least one missing mapping and a configured-with-warning state | suitable live missing-mapping shop not yet verified |
| C7 | Implemented | Company store/view | clone/update job + `COMMON_ADMIN` permission | forced-paused clone and exact admin/operator mutation coverage | prove a new live clone cannot run before explicit activation with admin and monitor-only sessions | second permission persona and fresh clone remain unproven |
| C8 | Implemented | Company schedule UI | ServiceJob detail/update/audit | valid/invalid Quartz cron, timezone, save, dirty, and active/paused coverage | edit, save, reload, reject invalid input, and exercise discard/route-leave behavior live | route-leave safeguard and persisted cron not browser-proven |
| C9 | Implemented | Company activation modal | mapping warnings + job update | warning list, acknowledgement gate, activation, and no-admin coverage | cancel once and confirm once for a paused job with real missing mappings | no live activation was performed |
| C10 | Implemented | Company store | template and clone job details | inherited schedule equality and forced-paused coverage | compare persisted template and clone cron after a live clone | non-default template cron remains unproven |

## Monitoring

| ID | Status | Code owner / file | API or data source | Focused automated evidence | Required live evidence | Remaining uncertainty |
| --- | --- | --- | --- | --- | --- | --- |
| M1 | Implemented | Company order-sync store/view | selected-shop SystemMessages, job, MDM, audit | shop-scoped, cross-shop, active-versus-terminal, and shared-snapshot coverage | reconcile every summary value together: last completed, processed count, next/paused, pending, and Product Store | final UI showed outstanding=1 and recently processed=1, but the outstanding inclusive-boundary semantic remains unresolved |
| M2 | Proven | Company monitor view | scheduled request + MDM only | exact two-row/no-bulk assertions in focused view/card tests | final desktop monitor and real connector trace showed only the Shopify request and HotWax import model; no bulk-operation row | narrow/mobile parity remains a cross-cutting gate, not an M2 semantic gap |
| M3 | Implemented | Company utility/store | two correlated MDM logs | zero/one/two matrix and deduplication coverage | run one real batch containing both create and update imports under one correlation | no live mixed create/update batch yet |
| M4 | Implemented | Company utility/view | correlated log outcomes | both mixed permutations and terminal-state coverage | create one controlled real partial outcome and retain both details | no controlled partial batch yet |
| M5 | Implemented | Company utility/view | completed SystemMessage, zero logs | sent/consumed zero-log Completed/0 versus failure/missing/active coverage | run a real no-action window and reconcile Completed with 0 | no suitable live zero-change run yet |
| M6 | Proven | connector audit + Company list | successful-order audit | bounded audit allowlist plus exclusion/correlation coverage; connector audit tests included in 43/43 | HC#2690 reconciled M228520 -> M101225 `DmlsFinished` total 1/failed 0 -> audit M100000 `Created`/fetchVerified=Y -> HotWax M102908 and the visible recent-order row | prior failed imports remained in errors and were not presented as successful records |
| M7 | Implemented | Company error aggregator | both order config logs/files | dual-config aggregation, source context, safe projection, and ordering coverage | show at least one real failed record from each of `SYNC_SHOPIFY_ORDER` and `UPDATE_SHOPIFY_ORDER` | six immutable live errors were safe, but their evidence does not establish both config families |
| M8 | Implemented | Company utility/list | bounded success audit | global sort/cap/tag across more than 100 fixtures | reconcile visible count and first/last row against more than 100 safe live audits | live data contained one recent success, not a cap boundary |
| M9 | Implemented | Company error aggregator | paged MDM logs/files | multi-file traversal, sort, dedupe, and cap coverage | reconcile traversal and visible 100 against more than 100 live errors | live UI contained six errors only |
| M10 | Implemented | Company store/view | current snapshot + refresh | deferred/failed refresh retains the last successful snapshot | introduce controlled live latency/failure and prove no full-page flash | final reload was clean, but stale-while-refresh was not observed under controlled failure |
| M11 | Implemented | Company allowlist + connector service | explicit safe response fields | exact-key, forbidden-field, secret-shaped text, length, ID, and DOM assertions; connector safety tests included in 43/43 | inspect authenticated response bodies as well as DOM for secrets | final desktop pass had clean console/network, fixed text for four request and two import failures, and a complete safe M228520 modal; a durable raw-response secret-scan artifact is still not recorded |
| M12 | Implemented | Order polling composable | page activity + batch state | fake-timer 10s/60s/manual/hidden/leave/in-flight/error coverage | collect timestamped active and idle requests and prove silence while hidden/after leave | no long browser timing run yet |
| M13 | Proven | Company action + connector guard | existing job configuration/window | exact selected-job request with no custom range/type fields plus backend guard coverage | live Run now queued M2399182, which completed to M228469 using the selected shop's existing job configuration | its downstream M101174 failure was the now-fixed audit defect and does not invalidate the queue action |
| M14 | Implemented | Company list utility/views | loaded arrays only | name/ID client filtering with zero transport calls | search representative live name and ID while confirming no network request | browser search/network silence not yet recorded |
| M15 | Implemented | Company state + connector guard | selected-shop active work | pending/running/other-shop and failed-terminal overlap matrices | capture the disabled explanation against the exact active record | live Run now disabled during M2399182, but the final evidence does not record the explanatory copy/ID |
| M16 | Implemented | Company confirmation | guarded run action | confirmation copy and one-submit mutation guard coverage | cancel once with no record, then confirm once with exactly one record | live run succeeded, but cancel/no-record proof was not captured |
| M17 | Implemented | Company retry UI + connector service | error identity + Shopify fetch/stage | permission, shop, bounded ID, idempotency, fresh-fetch, and unsafe-target coverage in Company/connector tests | invoke Retry individual order from a real resolvable error row and verify an unresolvable row has no action | M228520 proves the real fresh-fetch/classify/stage path through the same narrow backend contract, but it was submitted from custom selected-order UI rather than an error row |
| M18 | Implemented | connector correlation/audit + Company links | canonical SystemMessage ID | create/update/audit propagation and exact correlation coverage in connector 43/43 | run a post-fix actionable standard batch and match its SystemMessage through every MDM log, audit, and UI link | M228520/M101225/M100000 proves standalone correlation; scheduled M228469 predates the audit fix and has no success audit |
| M19 | Implemented | connector retry | new SystemMessage | unique request ID, retry idempotency, and no parent/retry contract coverage | submit from an original error and compare original/new records, including absence of parent/retryOf linkage | standalone M228520 exists, but the required original-error comparison was not captured |
| M20 | Proven | Company immutable error list | original DataManager record | refresh/retry failure/success paths preserve every source error | after successful M228520/M101225, original M228418/M101123 and M228469/M101174 remained visible with fixed safe text in the six-row immutable history | only natural displacement beyond 100 remains outside the exercised data volume |
| M21 | Implemented | Company action policy + connector | active batch plus retry | view/store coverage keeps retry enabled while Run now is disabled | submit a retry while a real shop batch is concurrently active | live batch and selected-order requests were sequential, not simultaneous |
| M22 | Implemented | Company retry result/list | returned SystemMessage ID | result-link, refresh, route/list retention, and immutable-source state coverage | invoke from an error row and capture linked new SystemMessage plus retained route/scroll/original row | M228520 was linked in final monitoring, but not as the result state of the original error-row action |

## Connection-detail card

| ID | Status | Code owner / file | API or data source | Focused automated evidence | Required live evidence | Remaining uncertainty |
| --- | --- | --- | --- | --- | --- | --- |
| K1 | Implemented | Order Sync card + details view | missing suitable job | unconfigured routing and actionable-card coverage | click a real unconfigured shop card and land on that shop's setup route | no unconfigured card was exercised live |
| K2 | Implemented | Order Sync card + details view | configured/paused job | configured/paused routing and card-state coverage | click the configured and paused card states into monitoring | final browser opened the monitor route directly; card click was not captured |
| K3 | Implemented | shared Order Sync snapshot | shop-scoped summary sources | exact-shop envelopes, stale-shop rejection, and cross-shop fixtures | reconcile card metrics for two differentiated live shops | only shop 10010 was exercised |
| K4 | Implemented | shared selectors/card/monitor | one snapshot/derivation | card/monitor shared-snapshot equality coverage | capture card and monitor side by side from the same refresh and reconcile every value | final viewport covered monitoring, not card-to-page equality |

## Cross-cutting delivery gates

| ID | Status | Gate | Evidence required |
| --- | --- | --- | --- |
| X1 | Proven | Scope boundary | 36 rows above; realtime SQS, historical bulk import, Shopify bulk operation, field diff, AWS provisioning, auto-repair, and retention changes excluded |
| X2 | Proven | Intake Agency review | Product Manager: pass to build with scope-integrity findings; Product Analyst: formal catalog-silence GAP plus independent code overlap/partial/gap assessment |
| X3 | Proven | API reuse before code | `shopify-batch-order-sync-api-reuse.md`; no dashboard facade; eight narrowly grouped connector deltas only, including the independently proven multi-page, false-zero, and safe-error transport repairs |
| X4 | Proven | Repository/runtime preflight | isolated Company worktree, canonical connector checkout, Company-to-local-OMS authenticated browser session, `demo` database, and live shop 10010 remote path were exercised without recording credentials |
| X5 | Proven | Canonical component branch discipline | `hotwax/mantle-shopify-connector` fetched 2026-07-22, clean `main` fast-forwarded `03c0884..0aea1af`, then canonical checkout switched directly to `codex/shopify-batch-order-sync`; no component worktree/runtime commit |
| X6 | Implemented | Runtime register/recovery | Earlier recovery lanes distinguished sandbox loopback isolation from a real outage; the current refreshed OMS and Company app were independently exercised, but runtime health remains a per-slice obligation |
| X7 | Implemented | Product Sync design parity | final desktop monitor uses Product Sync sibling selectors, cards, progress/error flow, density, and modal interaction; narrow/mobile and connection-card side-by-side proof remain missing |
| X8 | Not started | Responsive/accessibility | keyboard/focus/modal/status/touch/narrow evidence |
| X9 | Implemented | Permission enforcement | focused Company and connector tests cover `COMMON_ADMIN`, monitor-only rendering, and mutation rejection; two live personas/direct allowed-forbidden requests remain missing |
| X10 | Proven | Backend safety | connector 43/43 focused tests cover shop scope, bounded projections, retry idempotency, correlation, failed lifecycle, compatibility, and the private bounded cleanup lifecycle; independent backend re-review is clean and all P1/P2 findings are resolved |
| X11 | Implemented | Frontend automated quality | Company focused suite 163/163 and production build pass; repository-script typecheck/lint evidence still needs final recording |
| X12 | Implemented | Real-browser scenario matrix | final desktop pass rendered four request failures, two import failures, the complete safe M228520 modal, and clean console/network; configured/success/failure/active/run/custom-request/modal/link/refresh paths passed, while empty, paused, zero, two-import, partial, error-row retry, unauthorized, narrow, and synthetic-row UI scenarios remain |
| X13 | Proven | Real Shopify upstream | approved hotwax-demo HC#2690 was first seen by the connector's direct GraphQL order picker, then the existing fresh-fetch service path produced M228520/M101225/M100000/M102908; no test write-back to Shopify was performed by the connector flow |
| X14 | Implemented | Synthetic downstream | backend proof: post-fetch local-only staging produced M101327 `DmlsFinished` total 2/failed 0, distinct HotWax orders M102959/M102960, and audits M100051/M100052 `Created` with fetchVerified=N; the real source M100000/M101225/M228520 remained unchanged with fetchVerified=Y; no fabricated Shopify call occurred and temporary artifacts were cleaned. UI proof is Blocked by the cleared Company session and credential authority boundary, so this gate is not Proven |
| X15 | Implemented | Real retry upstream | M228520 proves a real resolvable Shopify ID was freshly fetched and passed through classification/MDM; the required error-row retry initiation remains unproven |
| X16 | Implemented | No writes/leakage | safe fixed error projections, final clean console/network, no raw GraphQL error in UI, no payload/PII committed, no synthetic Shopify call, synthetic temporary artifacts cleaned, and the cleanup lifecycle is private and bounded; full final method/response secret-scan evidence remains required |
| X17 | Implemented | Slice/final reviews | intake Product Analyst/Product Manager verdicts are recorded; independent backend re-review is clean with every P1/P2 resolved, while clean completion Product and PWA re-reviews remain required |
| X18 | Implemented | Product Sync regression | Product Sync sibling selectors and focused Company tests/build are green; explicit live Product Sync regression and narrow comparison remain |
| X19 | Implemented | GitHub delivery | owning-repository issues exist before PRs: Company #278 and connector #435; PR creation, CI, linked dependencies, and review-thread resolution remain |
| X20 | Implemented | Final evidence package | real-order/browser/test/build/runtime facts are now captured incrementally; all remaining acceptance rows, synthetic trace, final reviews, CI, and PR links are still required |

## Runtime register

| Service | Expected checkout/branch | Port / PID | Health | Last primary proof |
| --- | --- | --- | --- | --- |
| Company feature | this isolated worktree, `codex/company-shopify-batch-order-sync` | `localhost:8101`, PID not recorded | HTTP 200; final authenticated shop 10010 pass completed with clean console/network, then the Company session was cleared; credentials were not available for reauthentication, blocking synthetic-row UI proof | 2026-07-23 final desktop browser pass and subsequent session boundary |
| Company reference | canonical Company, prepared reference branch | `localhost:8100`, PID 64633 | HTTP 200; preserve | 2026-07-22 21:15 IST |
| Maarg OMS | `.../maarg-oms/moqui-framework`, local `demo` database | `localhost:8080`, PID not recorded | final runtime refreshed and HTTP 200; backend and database verification remain available, including real HC#2690 and synthetic M101327 records; Company browser session is currently cleared | 2026-07-23 final 8080/demo refresh |
| MySQL | local MySQL | `127.0.0.1:3306`, PID 2388 | alive; OMS sockets established | intake |
| Solr | `.../maarg-oms/solr/server` | `localhost:8983`, PID 12170 | responsive, auth-protected; authenticated health pending | intake |
| Shopify connector | canonical `runtime/component/shopify-connector`, `codex/shopify-batch-order-sync` from current `origin/main` `0aea1af` | loaded by OMS on `localhost:8080`; PID not recorded | feature branch hot-loaded; 43/43 focused tests and clean independent backend re-review pass with all P1/P2 resolved; no component worktree | 2026-07-23 final runtime refresh and re-review |

## Outage ledger

| Time | Service | Symptom | Cause | Recovery | Independent proof | Impact |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-07-22 20:54 IST | OMS 8080 | 4-second probes accepted TCP but returned no bytes | development metadata refresh plus lazy REST-definition reload; sandbox-local probes can also false-refuse | dedicated recovery lane; no restart or mutation | same PID/cwd/DB sockets and primary host-visible HTTP 200 BASIC in 2.17s | about 19 minutes; no product/runtime changes |
| 2026-07-22 23:27 IST | OMS 8080 | sandboxed localhost, 127.0.0.1, and ::1 probes returned immediate connection refusal while `lsof` showed the expected listener | managed sandbox loopback isolation; OMS stayed healthy and its log continued advancing | mandatory dedicated recovery audit; no process/file/database/session change | primary approved outside-sandbox probes returned HTTP 200 on localhost and 127.0.0.1; recovery lane independently proved ::1, PID 23224/cwd/Java 21, live `maarg_oms_local` connections, Solr auth gate, component checkout and BASIC `maarg_local` | about 2 minutes of affected health-check work; implementation continued independently |
| 2026-07-23 final pass | Company session | `localhost:8101` remained reachable but the authenticated Company session had been cleared | session state changed after the final authenticated desktop pass; credentials are outside the available authority boundary | no credential was requested, logged, or recovered; backend proof continued against local `demo` | real monitoring evidence was already complete; only synthetic recent-row UI reconciliation is blocked | synthetic UI gate remains unproven pending authorized reauthentication |
