# Shopify Batch Order Sync: Configuration and Monitoring Scope

- Status: Draft for Expert User review
- Version: 0.29
- Date: 2026-07-22
- Sign-off: Not signed off

## Business goal

Give an Integration Operator one shop-scoped place to configure Shopify batch order sync and another to monitor whether Shopify order changes are reaching HotWax successfully.

This scope covers the scheduled `ShopifyOrderSync` path. Realtime SQS order ingest and historical bulk order import have not been requested as part of these two pages.

## Confirmed product decisions

- The configuration page presents Shopify order mappings as a readiness checklist with links to the established mapping pages. It does not create or edit mappings inline.
- The summary card's processed-order count represents orders successfully processed by DataManager in the latest completed batch.
- When a batch's new-order and update-order imports have mixed outcomes, the overall batch status is **Partially completed**. The UI retains each import's independent status and counts.
- Missing Sales Channel, Payment Method, or Shipping Method mappings produce readiness warnings but do not prevent the batch job from being considered configured.
- Monitoring is available broadly to users who can access Shopify integrations. Creating or changing the batch job and invoking **Run now** require an administrative permission; the exact permission ID remains an implementation decision.
- Monitoring refreshes every 10 seconds while a batch is active and every 60 seconds while idle. Manual refresh remains available, and polling stops when the page is not active.
- A successful batch with no actionable order changes is labeled **Completed** and shows a processed-order count of `0`.
- The v1 mapping-readiness checklist contains Sales Channel (`SHOPIFY_ORDER_SOURCE`), Payment Method (`SHOPIFY_PAYMENT_TYPE`), and Shipping Method mappings. Shipping Method mappings use the existing shop/carrier shipment mapping model rather than `ShopifyShopTypeMapping`. Product Type remains part of Product Sync.
- **Recently processed orders** shows the selected shop's latest 100 successfully processed records across create and update imports, newest first, with each row tagged **Created** or **Updated**.
- **Recent errors** shows the selected shop's latest 100 failed MDM records across as many new-order and update-order MDM files as necessary, newest first.
- **Run now** queues the selected shop's standard next batch using the existing job configuration and cursor/window. It does not accept a custom date range or create/update selector.
- A newly cloned shop-specific batch job starts **Paused**. An Integration Administrator explicitly activates it after reviewing the shop, remote, schedule, and mapping warnings.
- The Order Sync setup page edits the cloned job's schedule inline, using the same cron-expression, active/paused, validation, save, and unsaved-change behavior established by Product Sync.
- Search on the recently processed and recent-error lists filters only the 100 records already loaded for the selected shop. It is entirely client-side and does not query older MDM history.
- **Run now** is disabled while the selected shop has a pending or running batch. The UI explains which active work prevents another request.
- When **Run now** is available, it requires confirmation that names the selected Shopify shop and explains that the standard next batch window will be queued.
- If mapping warnings remain, activating the paused job requires a confirmation that lists the missing mappings and allows the Integration Administrator to proceed.
- A newly cloned job inherits the standard job's schedule as its initial value. The administrator reviews or edits that schedule while the job remains paused.
- Each recent-error row offers an administratively restricted **Retry individual order** action. The retry mechanism and backend contract must preserve shop scope, idempotency, and audit correlation.
- Individual-order retry re-fetches the order's current payload from Shopify by Shopify order ID, then sends it through the normal create/update classification and MDM staging flow. It does not replay the stored failed payload.
- `SystemMessage.systemMessageId` is the canonical batch correlation key. It is propagated into every related create/update MDM log and successful-order audit record.
- An individual-order retry creates a new `ShopifyOrderSync` SystemMessage with its own correlation ID. It does not store a parent or `retryOf` link to the original failed batch.
- Retrying an order does not alter, hide, resolve, or acknowledge the original MDM error record. The error remains immutable until it naturally falls outside the latest 100 records shown.
- Successful-order audit retention policy is outside this project. The feature consumes the latest 100 records available under the platform's existing retention behavior.
- Recently processed order rows use the user-facing tags **Created** and **Updated**. Technical DataManager config IDs remain available in supporting detail.
- Targeted individual-order retries remain available while another shop batch is pending or running. The general **Run now** action remains disabled during that active work.
- After an individual retry is submitted, the operator remains on the error list. The UI shows and links the new SystemMessage ID, refreshes monitoring, and leaves the original error unchanged.

## Actors

- **Integration Operator** — a user with Shopify integration access who monitors synchronization for a selected Shopify instance.
- **Integration Administrator** — a user with additional permission to create or change the batch job and invoke **Run now**. The exact HotWax permission group is not yet defined.
- **Shopify** — the commerce platform from which the Company receives order changes.
- **Company** — the organization that records and operates on Shopify orders.

## Business process story

### Configure batch order sync

1. The Integration Operator selects a Shopify instance.
2. The Integration Operator reviews whether that Shopify instance already has a batch order sync job.
3. When no suitable job exists, the Integration Operator creates a shop-specific batch order sync job from the standard batch order sync job.
4. The Integration Operator reviews the order-related Shopify mappings for the selected Shopify instance.
5. The Integration Operator records any missing order-related Shopify mappings.
6. The Integration Operator confirms that batch order sync is configured for the selected Shopify instance.

Alternate — a shop-specific job already exists: the Integration Operator reviews the existing job rather than creating a duplicate, then rejoins at step 4.

Alternate — a required mapping is missing: the Integration Operator records the mapping before confirming the configuration, then rejoins at step 6.

### Monitor batch order sync

1. The Integration Operator reviews the latest batch sync outcome, processed order count, next scheduled run, pending work, and selected Product Store.
2. The Integration Operator reviews the current batch request and the resulting HotWax order import.
3. The Integration Operator reviews the batch sync job's schedule, last run, current state, and failure state.
4. The Integration Operator reviews recently processed orders: Shopify order identifier, Shopify order name, processing time, create-or-update outcome, and import result.
5. The Integration Operator reviews recent failed order records and the error reported for each record.
6. When an import fails, the Integration Operator uses the failed record and its batch context to diagnose the order sync problem.

Alternate — no batch has completed: the Integration Operator reviews an empty state that identifies whether the job is missing, paused, awaiting its first run, or has run without actionable orders.

Alternate — a batch contains both new and updated orders: the Integration Operator reviews the combined batch outcome while retaining the separate new order and update import results, then rejoins at step 4.

### Time flow

- At the configured schedule, Company automatically requests Shopify orders changed during the next batch window.
- After Shopify returns the changed orders, Company automatically records actionable new and updated orders.

Monitoring uses an adaptive refresh cadence: every 10 seconds while a batch is active and every 60 seconds while idle, plus manual refresh. Polling stops when the page is not active.

## Confirmed page scope

### Page 1: Configure batch sync job

Proposed route: `/shopify-connection-details/:shopId/order-sync/configure`

The page contains:

1. **Shop context**
   - Shopify instance name and ID.
   - Linked Product Store.
   - Existing shop-specific job state, when present.

2. **Batch sync job**
   - Clone the standard `queue_ShopifyOrderSync` job for the selected Shopify instance.
   - Associate the clone with the selected shop's Shopify `SystemMessageRemote`.
   - Prevent an accidental duplicate when a suitable shop-specific job already exists.
   - Create the cloned job in a **Paused** state.
   - Prefill its schedule from the standard job being cloned.
   - Present the selected shop, remote, configured schedule, and mapping warnings for review before an Integration Administrator explicitly activates it.
   - Edit and validate the schedule inline using the Product Sync scheduling interaction rather than linking to another job editor.
   - When non-blocking mapping warnings remain, require an activation confirmation that lists them before proceeding.

3. **Shopify mappings**
   - Present the order-related mappings for the selected shop.
   - Allow the operator to add missing mappings through the established Shopify mapping experiences.
   - The v1 checklist includes Shopify order source to HotWax Sales Channel (`SHOPIFY_ORDER_SOURCE`), Shopify payment type to HotWax Payment Method (`SHOPIFY_PAYMENT_TYPE`), and Shopify Shipping Method to carrier Shipment Method mappings.
   - Product Type mappings remain part of Product Sync and are not included.

4. **Completion**
   - Confirm configuration success.
   - Continue to the monitoring page.

### Page 2: Monitor batch sync job

Proposed route: `/shopify-connection-details/:shopId/order-sync`

#### Summary

Use the same information hierarchy as the Product Sync summary card, with order-specific semantics:

- Last completed batch sync.
- Orders processed in the last completed batch.
- Next batch sync time, or a Paused state.
- Pending batch requests.
- Product Store.
- Run-now and job-detail actions when the operator has permission.

**Run now** invokes the selected shop's existing batch job for its standard next window. The action does not expose custom date-range or import-type controls.

When the selected shop already has a pending or running batch, **Run now** is disabled and explanatory text identifies the active work. The page does not queue overlapping batch windows.

When available, **Run now** first presents a confirmation naming the selected shop and stating that its standard next batch window will be queued. No batch is queued until the administrator confirms.

The displayed processed count must be derived from the relevant new-order and update-order DataManager logs. It must not be inferred from the number of orders merely inspected by the Shopify query.

#### Track sync progress

The scheduled batch path has two logical rows:

1. **Shopify order batch request** — the `ShopifyOrderSync` SystemMessage and its query/filter execution state.
2. **HotWax order import** — the resulting DataManager import state across `SYNC_SHOPIFY_ORDER` and `UPDATE_SHOPIFY_ORDER`.

The scheduled batch path does not create a Shopify bulk operation. The monitor must not show a Shopify bulk-operation row for this flow.

A single batch can create zero, one, or two DataManager imports:

- zero when Shopify returns no actionable order changes;
- one when the batch contains only new orders or only updated orders;
- two when the batch contains both new and updated orders.

The HotWax order import row may summarize both imports, but its detail view must preserve their separate statuses and record counts.

#### Batch sync job

Show the shop-specific `queue_ShopifyOrderSync` job with:

- active or paused state;
- schedule and next run;
- latest job run outcome;
- access to job details and run history.

#### Recently processed orders

Show the selected shop's latest 100 orders confirmed as processed by DataManager, newest first. Aggregate records across new-order and update-order imports, tagging each row **Created** or **Updated**. Each record includes:

- Shopify order name and ID;
- processed time;
- new-order or update classification;
- DataManager result;
- link to the related DataManager run;
- Shopify Admin order link when the shop URL is available;
- HotWax order link when the internal order ID can be resolved.

Search supports Shopify order name and Shopify order ID by filtering the 100 loaded records client-side. It does not query older history.

#### Recent errors

Reuse the Product Sync error interaction for order imports. Aggregate the selected shop's latest 100 failed records across as many MDM files as required, newest first, from:

- `SYNC_SHOPIFY_ORDER`;
- `UPDATE_SHOPIFY_ORDER`.

Each failed record retains its DataManager log ID, config ID, batch context, Shopify order identifier when present, and parsed error text. Empty, loading, refreshing, and download states follow the Product Sync behavior.

Error search filters the 100 loaded records client-side and does not query older MDM files.

Each row with a resolvable Shopify order identifier offers **Retry individual order** to an Integration Administrator. The UI confirms the selected shop and order before submitting the retry. The backend creates a new standalone `ShopifyOrderSync` SystemMessage, re-fetches the current order from Shopify, applies the normal create/update classification, stages it through MDM, and returns the new SystemMessage ID. The new request does not link back to the original failed batch. After submission, the operator remains on the error list; the UI shows the new SystemMessage ID as a link, refreshes monitoring, and does not alter or hide the original immutable error record.

Targeted retry remains enabled when another batch for the shop is pending or running; this exception does not re-enable the general **Run now** action.

## Shopify connection detail card

Add an **Order sync** card under **Orders and fulfillment** on the Shopify connection detail page. Its structure follows the Product Sync card and provides a compact entry point into the two-page flow.

Before configuration, the card identifies that batch order sync needs setup and opens the configuration page.

After configuration, the card opens the monitoring page and shows:

- last completed batch time;
- processed-order count for the latest completed batch;
- pending batch request count;
- current batch request status;
- current HotWax order import status.

The card must remain scoped to the Shopify instance represented by the connection detail page.

## Existing overlap and verified implementation facts

Verification pins:

- Company app: `db12b45d78b188cee84295162b2c62f3ab57590a`, branch `codex/company-issue-265-admin-ui-source`, clean when inspected on 2026-07-22.
- `shopify-connector`: `56f029b9cddbbbd93ef86195cb5211f754f23a6c`, branch `main`, clean but nine commits behind `origin/main` when inspected on 2026-07-22.
- Runtime configuration for shop `10010` was not verified because no local OMS listener was available on port 8080. The verdicts below are code overlaps, not proof that the reference shop is configured.

| Activity | Verdict | Verified overlap or gap |
| --- | --- | --- |
| Create a shop-specific batch job | Partial overlap | Company `useProductStore.setupProductStoreShopifyOrderImport` already clones `queue_ShopifyOrderSync` to `queue_ShopifyOrderSync_<shopId>` and records `ShopifyOrderSync`, the selected remote, batch mode, and additional parameters. A dedicated configuration page does not exist. |
| Record order-source mappings | Overlap | `ShopifySalesChannels` reads and writes `ShopifyShopTypeMapping` records with `mappedTypeId=SHOPIFY_ORDER_SOURCE`. |
| Record payment mappings | Overlap | `ShopifyPaymentMethods` reads and writes `ShopifyShopTypeMapping` records with `mappedTypeId=SHOPIFY_PAYMENT_TYPE`. |
| Record shipping-method mappings | Overlap | `ShopifyShipmentMethods` reads and writes the selected shop's carrier shipment mappings through the existing shop-carrier-shipment APIs. |
| Monitor the batch request | Partial overlap | `ShopifyOrderSync` is a SystemMessage type sent by `co.hotwax.sob.order.OrderFeedServices.send#ShopifyOrderSync`. Existing SystemMessage APIs and Product Sync presentation patterns are reusable, but no order-specific monitor exists. |
| Monitor Shopify bulk-operation progress | Not applicable | `send#ShopifyOrderSync` uses paginated live Shopify GraphQL requests. It does not create a Shopify bulk operation. |
| Monitor new and updated order imports | Partial overlap | `co.hotwax.shopify.order.SqsOrderImport.stage#ShopifyOrder` splits records between `SYNC_SHOPIFY_ORDER` and `UPDATE_SHOPIFY_ORDER`, and existing DataManager log APIs expose run and error data. The fallback service does not currently pass a job-run or SystemMessage correlation into the staging service. |
| Review recent successful orders by batch | Gap | `ShopifyOrderHistory` stores the latest hashes, order name, and processed date. The same processed date is also advanced for unchanged orders that bypass DataManager, so it cannot by itself prove which orders DataManager processed in a particular batch. |
| Review recent MDM errors | Partial overlap | Company `useDataManagerLog` already loads, parses, caches, and aggregates DataManager error files. The order page must query both new-order and update-order config IDs and retain their source context. |
| Open monitoring from a connection card | Partial overlap | `ShopifyConnectionDetails` and its Product Sync card establish the navigation and compact-status pattern. No Order Sync card or route exists. |

## Data and service gaps for the design handoff

These are gaps to resolve before the monitoring UI can make truthful claims:

1. **Batch-to-import correlation** — propagate the originating `SystemMessage.systemMessageId` from the `ShopifyOrderSync` request through `stage#ShopifyOrder` into every resulting DataManager log and successful-order audit record.
2. **Successful-order audit** — expose an append-only or otherwise batch-correlated record of the orders actually processed by DataManager. `ShopifyOrderHistory.processedDate` alone is not sufficient.
3. **Combined progress contract** — return zero, one, or two related DataManager logs for a batch without hiding a partial failure.
4. **Shop-scoped summary contract** — return summary and card metrics for the selected Shopify instance only.
5. **Safe health contract** — expose operational status without returning Shopify or AWS credentials.
6. **Individual-order retry contract** — define a shop-scoped, idempotent retry operation that creates a new standalone `ShopifyOrderSync` SystemMessage, re-fetches one current Shopify order by ID, passes it through normal create/update classification and MDM staging, returns the new SystemMessage ID, stores no parent linkage, and rejects records that cannot be safely resolved to an order.

## Design candidates, not requirements

- Reuse `AnimatedNumber`, `AnimatedDuration`, `useDataManagerLog`, service-job details, and the stale-while-refresh behavior established by Product Sync.
- Extract small reusable summary, progress-row, and parsed-error components where that reduces duplication without forcing a full Product Sync refactor.
- Keep configuration and monitoring as separate routes rather than a mode switch inside one large view.
- Use the configuration card as a readiness checklist with links to the existing Sales Channels, Payment Methods, and Shipping Methods mapping pages.

## Current scope boundaries

The Expert User has not yet requested the following for these pages:

- realtime SQS order-ingest configuration or monitoring;
- historical `BulkOrderHistoryQuery` configuration or monitoring;
- Shopify bulk-operation monitoring;
- field-level order-change comparison;
- AWS EventBridge or SQS provisioning;
- automatic repair of failed orders. Manual retry of one resolvable failed order is included.
- defining or changing successful-order audit retention policy.

These remain outside the current stated scope until explicitly added; they are not recorded as permanent non-requirements.

## Acceptance criteria

### Configuration

1. The page identifies the selected Shopify instance and linked Product Store.
2. The operator can create the shop-specific batch job from the standard job without creating a duplicate suitable job.
3. The cloned job records the selected shop's remote and the required `ShopifyOrderSync` type.
4. The operator can review and complete the confirmed order-related mapping families for the same Shopify instance.
5. The completion state distinguishes configured, paused, missing, and error conditions.
6. Missing mappings are shown as warnings and do not block a valid batch job from reaching the configured state.
7. A newly cloned job remains **Paused** until an Integration Administrator explicitly activates it after review.
8. An Integration Administrator can edit and save the job schedule on the setup page using the same schedule validation and unsaved-change safeguards as Product Sync.
9. Activation with missing mappings remains possible only after a confirmation lists the non-blocking warnings.
10. The cloned job initially inherits the standard job's schedule.

### Monitoring

1. The summary values reconcile with the underlying SystemMessage, ServiceJob, and DataManager records for the selected shop.
2. Progress contains no Shopify bulk-operation step.
3. A batch with both new and updated orders exposes both DataManager results.
4. When one related import succeeds and the other fails, the overall batch status is **Partially completed** and both outcomes remain visible.
5. A successful batch with no actionable changes is **Completed** with `0` processed orders and remains distinguishable from a failed batch.
6. Recent successful orders include only orders proven to have been processed by DataManager.
7. Recent errors include failed records from both `SYNC_SHOPIFY_ORDER` and `UPDATE_SHOPIFY_ORDER`.
8. Recently processed orders are capped at the latest 100 successful records across create and update imports and display a **Created** or **Updated** tag.
9. Recent errors are capped at the latest 100 failed records aggregated across however many relevant MDM files are needed.
10. Refresh keeps previously loaded data visible and does not replace it with a full-page loading state.
11. No credential or secret value is returned to or rendered by the page.
12. Polling uses the confirmed adaptive cadence and stops when the page is not active.
13. **Run now** queues the selected shop's standard next batch using its existing cursor/window and configuration.
14. Recent-order and error searches filter only their 100 loaded records client-side and make no historical search request.
15. **Run now** is disabled with an explanation while the selected shop has a pending or running batch.
16. An available **Run now** action requires confirmation identifying the selected shop and the standard next-window behavior.
17. A resolvable error record offers an administratively restricted, confirmed individual-order retry that fetches the current order from Shopify and runs normal classification and MDM staging; an unresolvable record does not present an unsafe retry action.
18. Every batch request, related MDM import, and successful-order audit record is traceable by the originating `SystemMessage.systemMessageId`.
19. An individual retry creates a new standalone SystemMessage and does not alter or link to the original batch correlation.
20. Submitting or completing a retry does not change the original error record; it remains in newest-first error history until displaced beyond the latest 100 records.
21. A targeted individual-order retry remains available during other active shop work, while the general **Run now** action remains disabled.
22. Successful retry submission keeps the operator on the error list, displays a link to the new SystemMessage ID, refreshes monitoring, and leaves the original error unchanged.

### Connection detail card

1. An unconfigured card routes to configuration.
2. A configured card routes to monitoring.
3. Every displayed metric is scoped to the connection page's Shopify instance.
4. Card metrics reconcile with the corresponding monitoring-page values.

## Provenance

- Expert User scope supplied in this task on 2026-07-22.
- Product Sync UI precedent: `ShopifyProductSyncReturningView`, `ShopifyProductSync`, and the Product Sync card in `ShopifyConnectionDetails`.
- Existing mapping precedent: `ShopifySalesChannels` and `ShopifyPaymentMethods`.
- Batch job and type: `queue_ShopifyOrderSync` and `ShopifyOrderSync` in `shopify-connector` seed data.
- Batch execution: `co.hotwax.sob.order.OrderFeedServices.send#ShopifyOrderSync`.
- MDM staging: `co.hotwax.shopify.order.SqsOrderImport.stage#ShopifyOrder`.
- Current sync state: `co.hotwax.shopify.ShopifyOrderHistory`.

## Change history

- **0.29, 2026-07-22** — Added a delivery-agent prompt with an evidence-driven implementation loop and a strict minimal-server-change gate.
- **0.28, 2026-07-22** — Kept operators on the error list after retry submission and exposed the new SystemMessage ID as a link before refreshing monitoring.
- **0.27, 2026-07-22** — Allowed targeted individual-order retries during another active shop batch without relaxing the **Run now** overlap guard.
- **0.26, 2026-07-22** — Confirmed **Created** and **Updated** as the recent-order row tags.
- **0.25, 2026-07-22** — Kept audit-retention policy outside project scope; the UI consumes the latest 100 records available under existing platform retention.
- **0.24, 2026-07-22** — Kept original MDM errors immutable and unchanged after standalone individual retries.
- **0.23, 2026-07-22** — Defined individual retries as new standalone SystemMessages with no parent linkage to the original failed batch.
- **0.22, 2026-07-22** — Selected `SystemMessage.systemMessageId` as the canonical correlation key across batch requests, MDM imports, and successful-order audit records.
- **0.21, 2026-07-22** — Defined individual retry as re-fetching the current Shopify order and using normal classification and MDM staging rather than replaying stale failed data.
- **0.20, 2026-07-22** — Added an administratively restricted individual-order retry action and identified the required safe backend contract.
- **0.19, 2026-07-22** — Made the cloned job inherit the standard job's schedule for review or editing before activation.
- **0.18, 2026-07-22** — Required a warning summary and confirmation before activating a job with missing non-blocking mappings.
- **0.17, 2026-07-22** — Added a shop-specific confirmation before **Run now** queues the standard next batch.
- **0.16, 2026-07-22** — Prevented overlapping manual batches by disabling **Run now** with an explanation while work is pending or running.
- **0.15, 2026-07-22** — Limited recent-order and error search to client-side filtering of each list's 100 loaded records.
- **0.14, 2026-07-22** — Put schedule editing directly on Order Sync setup using the Product Sync schedule model and interaction safeguards.
- **0.13, 2026-07-22** — Required newly cloned shop-specific jobs to start paused and receive explicit administrative activation after review.
- **0.12, 2026-07-22** — Defined **Run now** as queuing the selected shop's standard next batch with its existing configuration and cursor/window.
- **0.11, 2026-07-22** — Capped recent success and error views at 100 records; successes aggregate create/update imports with row tags, while errors aggregate across as many relevant MDM files as needed.
- **0.10, 2026-07-22** — Added Shipping Method to v1 readiness using the existing shop/carrier shipment mapping surface; Product Type remains outside Order Sync.
- **0.9, 2026-07-22** — Limited v1 mapping readiness to Sales Channel and Payment Method; Product Type remains outside Order Sync.
- **0.8, 2026-07-22** — Defined a healthy zero-change batch as **Completed** with `0` processed orders.
- **0.7, 2026-07-22** — Defined adaptive monitoring refresh: 10 seconds during active batches, 60 seconds while idle, plus manual refresh and no background polling from an inactive page.
- **0.6, 2026-07-22** — Made monitoring broadly readable while restricting job configuration and **Run now** actions to an administrative permission.
- **0.5, 2026-07-22** — Defined missing Sales Channel and Payment Method mappings as non-blocking readiness warnings.
- **0.4, 2026-07-22** — Defined mixed new-order and update-order import outcomes as **Partially completed**, with both underlying results retained.
- **0.3, 2026-07-22** — Defined the summary's processed-order count as successfully processed orders from the latest completed batch.
- **0.2, 2026-07-22** — Confirmed that mapping configuration uses a readiness checklist linking to the existing mapping pages, with no inline mapping editing.
- **0.1, 2026-07-22** — Initial scope formalized from the Expert User's configuration, monitoring, progress, recent-order, recent-error, and connection-card requirements; verified against the current Company and `shopify-connector` checkouts.

## Execution agent prompt

Use the following prompt to implement and deliver this scope:

```text
Implement and deliver the Shopify Batch Order Sync configuration and monitoring scope defined in:

/Users/adityapatel/Documents/GitHub/ionic-apps/accxui/apps/company/docs/shopify-batch-order-sync-scope.md

Treat that document as the product contract. Do not silently weaken, broaden, or reinterpret its confirmed decisions. Your goal is a working Company experience proven against a real available HotWax backend, with the smallest safe server-side change set.

Operating constraints

1. Ground yourself in the live state before changing anything:
   - Inspect the Company repository branch, status, registered worktrees, recent history, package scripts, routes, stores, and the current Product Sync implementation.
   - Inspect the actual Shopify connector/component checkout, branch, status, services, entities, REST definitions, tests, and any running OMS process before proposing backend changes.
   - Identify which checkout serves each localhost port. Preserve dirty work and unrelated changes.
   - Do not restart or reconfigure an existing OMS without first proving it is necessary and coordinating with its owner.
   - Change Moqui components only. Never commit runtime files, credentials, generated data, databases, journals, logs, or environment configuration.

2. Work in isolated, correctly based worktrees. Create a Company feature branch from the intended current base. Create a backend component worktree only after the server-change gate below proves that a backend change is required. Do not implement in a dirty canonical checkout.

3. Do not use mocked or invented HotWax APIs as delivery proof. Focused unit tests may mock transport boundaries, but final behavior must be exercised through the real available Company app and real backend. Never expose secrets in logs, screenshots, fixtures, API responses, commits, issues, or PRs.

Minimal-server-change gate

Before writing application or backend code, create an API-reuse matrix for every required datum and action:

- requirement or acceptance criterion;
- existing Company store/composable/component that may satisfy it;
- existing REST/service/entity contract;
- whether client-side composition is safe and performant;
- proven gap, if any;
- smallest proposed change.

Search current source and merged history rather than assuming an endpoint is absent. Prefer solutions in this order:

1. Reuse an existing Company store, composable, component, API, and response as-is.
2. Compose existing shop-scoped responses in the Company client when this does not expose secrets, create incorrect counts, or require unbounded requests.
3. Invoke or expose an existing Moqui service through an existing REST resource.
4. Add the smallest compatible field, filter, or action to an existing service/REST resource.
5. Add one narrow shop-scoped facade only when several existing records must be correlated server-side for correctness or security.
6. Add a new entity or broader API only when the scope cannot be truthfully implemented with existing durable data.

Do not create a generic dashboard API merely for frontend convenience. Do not duplicate Product Sync services or fork its components wholesale. Do not overload an existing field with a meaning it does not safely carry. If a server change is required, document the exact failed reuse options and keep the change backward compatible, shop-scoped, permission-checked, paginated or bounded, and free of credentials.

Some requirements may genuinely need backend support—notably propagating SystemMessage.systemMessageId into related MDM/audit records, truthfully identifying the latest 100 successfully processed orders, correlating zero/one/two imports, and re-fetching one Shopify order for retry. Prove each gap independently; do not treat this list as permission for a broad new API layer.

Delivery loop

Maintain a delivery ledger whose rows are every acceptance criterion in the scope document. Each row must contain: status (Not started, Implemented, Proven, Blocked), code owner/file, API/data source, focused automated test, live verification evidence, and remaining uncertainty.

Deliver in the smallest useful vertical slices:

A. Navigation, connection-detail card, routes, and first-time/configured states.
B. Configuration: clone safely, inherit schedule, remain paused, edit schedule inline, mapping readiness links/warnings, and explicit activation.
C. Monitoring: latest-batch summary, two-row progress, zero/one/two imports, partial completion, adaptive refresh, and overlap guard.
D. Latest 100 Created/Updated successes and latest 100 errors with client-side search.
E. Individual-order retry with confirmation, a new standalone SystemMessage, fresh Shopify fetch, returned SystemMessage link, and immutable original error.
F. Permission enforcement, responsive/accessibility behavior, error states, and regression hardening.

For each slice, repeat this loop until its ledger rows are Proven:

1. Establish the baseline and reproduce the missing behavior.
2. Add or update a focused automated test that expresses the required behavior.
3. Implement the smallest change at the lowest appropriate layer.
4. Run focused tests, type checking, linting, and build checks relevant to the changed files.
5. Start or reuse the correct Company worktree server and verify the slice in the browser against the real available backend.
6. Inspect browser console and network activity. Reconcile displayed IDs, counts, states, and permissions with the underlying SystemMessage, ServiceJob, DataManager, Shopify mapping, and audit records.
7. Exercise success, loading, empty, partial-failure, failure, retry, refresh, paused, unauthorized, and narrow/mobile states applicable to the slice.
8. Run regression checks for Product Sync and Shopify connection navigation wherever shared code changed.
9. Review the diff for accidental API expansion, credential exposure, cross-shop leakage, unbounded queries, duplicated code, or unrelated edits.
10. Update the ledger with concrete evidence. If any check fails, classify the failure as client logic, contract/data, permissions, environment, or test defect; fix the smallest responsible layer and restart the loop at step 2.

Do not mark a ledger row Proven from source inspection, a build, or a mocked test when the behavior is visible in the UI. Do not claim a percentage-complete result. The loop ends only when every in-scope row is Proven or a specific external blocker is demonstrated with the exact failed command/request and the safe work already exhausted.

Required validation

- Focused automated coverage for state derivation, zero/one/two MDM imports, Partially completed, zero-order Completed, latest-100 aggregation, Created/Updated tagging, client-side search, polling lifecycle, permissions, Run now guards/confirmation, mapping warnings, and retry behavior.
- Backend tests for every changed service, REST contract, permission check, correlation field, bounded query, and retry path.
- Company typecheck/lint/build using the repository's actual scripts.
- Real browser proof from the exact feature worktree and real available backend, including responsive and accessibility checks.
- Product Sync regression proof when shared scheduling, error, summary, or navigation code is reused or extracted.
- CI must pass for every affected repository.

GitHub delivery

Once a meaningful diff exists, confirm whether a linked issue already exists. If not, create an issue with the business problem, accepted scope, implementation boundary, and acceptance criteria before opening a PR. Keep frontend and backend changes in separate repositories/PRs, link them explicitly, and state whether one depends on the other. Do not manufacture a backend PR when the reuse matrix proves no server change is needed.

Use business-focused PR summaries, include the linked issue, list the exact API reuse and any unavoidable server delta, attach focused test/build/CI evidence, and add browser proof. Review actionable PR threads, make scoped fixes, reply inline, and resolve concluded threads. Never merge, deploy, force-push, delete worktrees, or rewrite history unless Aditya explicitly asks.

Final handoff

Report:

- delivered user behavior;
- frontend files and contracts used;
- server changes, with justification for each—or explicitly state that none were needed;
- focused tests, full checks, CI, and real-browser scenarios completed;
- issue and PR links;
- delivery-ledger status for every acceptance criterion;
- remaining environmental blockers or uncertainty;
- worktree paths, running localhost URLs, and cleanup that still requires authorization.

Stay in the delivery loop until all in-scope criteria are proven or a concrete external blocker makes further safe progress impossible.
```
