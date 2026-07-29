# Company app docs

Architecture is **not** here — it lives in [`../AGENTS.md`](../AGENTS.md) (app structure, the
cache/sync data layer, composable and store conventions, backend contract, test layers). Cross-app
AccxUI architecture lives in the workspace [`../../../docs/`](../../../docs/).

This folder holds product scope, verified backend-contract research, and feature specs. Every doc
below is live; superseded material is in [`archive/`](archive/).

## Active work

| Doc | What it is |
| --- | --- |
| [carrier-management-architecture.md](carrier-management-architecture.md) | Active architecture and verified backend boundary for carrier identity, shipment methods, facility/store associations, and observable Unigate readiness |
| [carrier-credential-api-gap.md](carrier-credential-api-gap.md) | Source-backed carrier credential/config/link boundary plus the dated, secret-free ledger for authenticated environment evidence |
| [2026-07-29-carrier-management.md](superpowers/plans/2026-07-29-carrier-management.md) | Active execution plan for rebuilding carrier management on the cache/composable architecture, including focused tests and authenticated verification |
| [shopify-batch-order-sync-scope.md](shopify-batch-order-sync-scope.md) | Requirements and acceptance criteria for shop-scoped order-sync configuration + monitoring. **Not signed off** — the source of the `C*/M*/K*/X*` acceptance rows |
| [shopify-batch-order-sync-delivery-ledger.md](shopify-batch-order-sync-delivery-ledger.md) | Per-criterion delivery status keyed to the scope doc. A behavior is **Proven** only after reconciliation in the real UI against a live OMS |
| [shopify-batch-order-sync-api-reuse.md](shopify-batch-order-sync-api-reuse.md) | The verified reuse decision for every datum and action in the scope doc — existing contract vs smallest accepted backend change |
| [order-sync-test-plan.md](order-sync-test-plan.md) | The four-entity domain model behind order sync and the test strategy over it. The rebuild it describes has largely landed, so some file paths predate the `utils/` → `composables/` split |
| [cache-sync-remaining-work.md](cache-sync-remaining-work.md) | What is left in the cache/sync migration: unconverted screens, the store retirement ledger, open questions, promotion to `@common` |

## Shopify product sync

| Doc | What it is |
| --- | --- |
| [shopify-product-sync-first-time-wizard.md](shopify-product-sync-first-time-wizard.md) | Feature spec + screen logic for the first-run wizard (Figma-backed) |
| [shopify-product-sync-routing-fsm.md](shopify-product-sync-routing-fsm.md) | Routing and view-selection logic from `/shopify-connection-details/:id` into the sync experience, and where predicates disagree |
| [shopify-product-sync-migration-scope.md](shopify-product-sync-migration-scope.md) | Legacy → bulk-query migration: the concrete ids, job names, seed-vs-runtime ownership, and version gates the upgrade assistant checks |
| [shopify-product-sync-shopify-api-calls.md](shopify-product-sync-shopify-api-calls.md) | The Shopify Admin GraphQL reads the app makes through the Moqui passthrough (excludes the backend bulk lifecycle Moqui owns) |
| [shopify-product-sync-live-dashboard.md](shopify-product-sync-live-dashboard.md) | Intended live-dashboard behavior for the product-sync page: data tiers, no-skeleton-on-refresh, zero layout shift. Predates the cache layer, which now delivers much of it |
| [shopify-product-sync-message-selection.md](shopify-product-sync-message-selection.md) | How the "latest run" system message is chosen. Describes the retired `ShopifyProductSyncService`; the current implementation is `useShopify.ts` §4 |

## Onboarding and configuration research

| Doc | What it is |
| --- | --- |
| [product-store-onboarding-rest-endpoint-gaps.md](product-store-onboarding-rest-endpoint-gaps.md) | Running tracker of REST endpoints onboarding needs, each marked existing / gap / candidate / composite until verified against the live backend |
| [product-store-settings-study.md](product-store-settings-study.md) | The product-store setting universe: direct fields vs `ProductStoreSetting` records vs settings with no UI home yet |
| [product-store-onboarding-discovery-flow.md](product-store-onboarding-discovery-flow.md) | The discovery-conversation question flow the onboarding wizard models, and which settings each answer drives |
| [retailer-onboarding-discovery-to-oms-config.md](retailer-onboarding-discovery-to-oms-config.md) | Real discovery-call evidence mapped to OMS configuration signals |

## Backend / connector specs owned elsewhere

Kept here because Company depends on these pipelines; the code changes land in the backend repos.

| Doc | What it is |
| --- | --- |
| [product-store-onboarding-inventory-import-fix.md](product-store-onboarding-inventory-import-fix.md) | The Shopify → OMS bulk inventory import stranding silently: root cause (a swallowed download failure skipping the status transition) and the fix in `mantle-shopify-connector` |
| [product-store-onboarding-order-history-newpath-migration.md](product-store-onboarding-order-history-newpath-migration.md) | Moving Shopify order history onto the proven bulk processors and deprecating the legacy poller without breaking the ~10 other `ShopifyBulkQuery` types |
| [klaviyo-api-contracts.md](klaviyo-api-contracts.md) | Source of truth for every request the Klaviyo UI makes, and the OMS endpoints it requires. If the backend disagrees, fix both together — don't silently rewrite this doc |

## archive/

Superseded, kept for the reasoning trail — not maintained, and safe to ignore when building:

- `cache-sync-rollout-plan.md`, `list-pages-cache-conversion.md`, `facility-detail-plan.md`,
  `worker-polling-service-design.md` — the four plans that produced today's data layer. Their design
  content is now in [`../AGENTS.md`](../AGENTS.md) §4; the open items are in
  [cache-sync-remaining-work.md](cache-sync-remaining-work.md).
- `ACCXUI_MIGRATION_GUIDE.md` — legacy Vue CLI/Vuex → AccxUI migration. This app is migrated; the
  workspace docs own cross-app architecture.
- `archive/superpowers/` — completed May–June 2026 implementation plans (AccxUI migration + Moqui
  login, add Shopify connection, agent UX wiring, cold-start product-store onboarding). Active plans
  remain under [`superpowers/`](superpowers/) and are indexed above.
