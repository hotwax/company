# TikTok Shop Config Management UI — Design

**Date:** 2026-06-11
**Status:** Approved (user-validated via brainstorming)
**Scope decision:** v1 = "Connect + configure (core)". Onboarding via **manual auth_code paste**. Architecture **A — mirror Shopify**.

## Problem

The TikTok Shop connector (Moqui component at `maarg-sd/asbeauty/runtime/component/tiktok`) is a complete direct integration (orders, cancellations, fulfillment, inventory), but it has **no management UI and no management API** — its only REST endpoint is the inbound webhook. Onboarding and configuration today mean running services by hand (`exchange#TikTokAuthCode`) and editing `TikTokShop` rows directly.

We want admins to manage TikTok connections in the **company PWA** the same way they manage Shopify connections.

## Goals (v1)

1. One-time app setup: store Partner Center app credentials (`app_key` / `app_secret`).
2. Onboarding: paste a Partner Center `auth_code` → exchange + auto-import authorized shops.
3. Connections list + per-shop detail hub.
4. Per-shop settings: `productStoreId`, `holdMinutes`, `autoApproveBuyerCancel`, `facilityGroupId`, `tiktokWarehouseId`, `sellerCancelReason`, active/disabled.
5. Shipping-provider mappings (`TIKTOK_SHIP_PROVIDER`, `_DEFAULT_` row required; optional `TIKTOK_SHIP_METHOD`).

**Out of scope for v1** (documented fast-follows): service-job enable/disable UI, product SKU sync (`sync#TikTokProducts`) UI + unmatched-SKU report, order-sync monitoring (TikTokShopOrder funnel), full OAuth redirect flow, fetching warehouses/shipping providers from TikTok for dropdowns.

## Background — key differences from Shopify

| | Shopify | TikTok |
|---|---|---|
| Onboarding | Manual form (domain, token, client id/secret) per shop | OAuth: app creds set once on shared remote; seller authorizes in Partner Center → `auth_code` → `exchange#TikTokAuthCode` imports shops (id, name, cipher, tokens) automatically. Shops cannot be hand-created. |
| Credentials | Per-shop `SystemMessageRemote` | One shared `SystemMessageRemote TikTokShopApi` (username=app_key, password=app_secret) for all shops |
| Mappings | payment / sales-channel / product-type / location / carrier-shipment | shipping-provider (+ optional ship-method) only |
| Per-shop settings | name, timezone, processRefund | holdMinutes, autoApproveBuyerCancel, facilityGroupId, tiktokWarehouseId, sellerCancelReason, status |

Reference pattern: company PWA Shopify screens (`ShopifyConnections` → `ShopifyConnectionDetails` → sub-screens) backed by `oms/shopifyShops/*` endpoints and `src/store/shopify.ts`.

## Part 1 — Backend: management API in the `tiktok` component

New service file: `service/co/hotwax/tiktok/TikTokShopManagementServices.xml`.
New REST resources in `service/tiktok.rest.xml` — **authenticated** (the webhook resource stays `anonymous-all`; nothing else does).

| Method + path | Service | Behavior |
|---|---|---|
| `GET tiktok/appCredentials` | `get#TikTokAppCredentials` | Returns `{appKey, sendUrl, receiveUrl, configured}`. **Never returns the secret** — only whether one is set. |
| `PUT tiktok/appCredentials` | `update#TikTokAppCredentials` | Sets `username`/`password` (+ optional `sendUrl`/`receiveUrl` overrides) on `SystemMessageRemote TikTokShopApi`. |
| `POST tiktok/authorize` | wraps existing `exchange#TikTokAuthCode` | Body `{authCode}`. Exchanges for tokens, imports `TikTokShop` rows. Returns `{shopIds}`. Errors (expired/used code — 30-min single-use TTL) surface as standard Moqui errors. |
| `GET tiktok/shops` | `get#TikTokShops` | List of shops enriched with: productStore name, `shopStatusId`, region, token health (`accessTokenExpireDate` → ok/expiring/expired). |
| `GET tiktok/shops/{shopId}` | `get#TikTokShop` | Full settings for one shop (tokens excluded; expiry dates included). |
| `PUT tiktok/shops/{shopId}` | `update#TikTokShop` | Updates only the editable fields listed in Goals §4. Token/cipher/identity fields not updatable through this endpoint. |
| `GET tiktok/shops/{shopId}/mappings?mappedTypeId=` | `get#TikTokShopMappings` | List `TikTokShopMapping` rows for the shop, optional type filter. |
| `POST tiktok/shops/{shopId}/mappings` | `store#TikTokShopMapping` | Upsert `{mappedTypeId, mappedKey, mappedValue}`. |
| `DELETE tiktok/shops/{shopId}/mappings` | `delete#TikTokShopMapping` | Delete by `{mappedTypeId, mappedKey}`. |

Conventions: mirror `oms/shopifyShops/*` response shapes (list + pagination params `pageSize`/`pageIndex` where applicable); reuse existing entities (`TikTokShop`, `TikTokShopMapping`) — **no schema changes**.

## Part 2 — PWA: routes, screens, store (company app)

Routes (added to `src/router/index.ts`, all behind `authGuard`):

| Route | Component | Purpose |
|---|---|---|
| `/tiktok` | `TikTokConnections.vue` | Shop list. Header actions: **App Setup** (credentials modal) and **Authorize** (auth_code modal; disabled until `configured`). |
| `/tiktok-connection-details/:id` | `TikTokConnectionDetails.vue` | Hub: shop identity, status, token health; links to Settings and Shipping Providers. |
| `/tiktok-connection-details/:id/settings` | `TikTokShopSettings.vue` | Editable settings form. |
| `/tiktok-connection-details/:id/shipping-providers` | `TikTokShippingProviders.vue` | Mapping table. |

Modals (in `src/components/`): `TikTokAppCredentialsModal.vue` (mirrors `EditShopifyCredentialsModal`), `AuthorizeTikTokModal.vue` (instructions + paste field → shows imported shops on success).

Store `src/store/tiktok.ts` → `useTikTokStore()` with actions:
`fetchAppCredentials`, `updateAppCredentials`, `authorizeTikTok`, `fetchTikTokShops`, `fetchTikTokShop`, `updateTikTokShop`, `fetchTikTokShopMappings`, `createTikTokShopMapping`, `deleteTikTokShopMapping`.
Must include the **`fetchStatus` contract** (`{ shops: '', lastFetched: 0 }` pattern) consumed by `Settings.vue`, and `persist: true` + a `clear` action wired into `user.postLogout`. Uses `api()` from `@common` with the same base-URL convention as `src/store/shopify.ts`. Accxui rules apply: router instance import (no `useRouter()` in components), no service files — store actions only.

Navigation: add a **TikTok** menu entry alongside Shopify in the app menu.

## Part 3 — Flows

**App setup (once):** App Setup → modal → enter app_key/app_secret → `PUT tiktok/appCredentials` → list header shows "App configured"; Authorize button enables.

**Authorize / import shops:** Authorize → modal explains: authorize the seller in TikTok Partner Center, copy the `auth_code` from the redirect, paste here → `POST tiktok/authorize` → on success show imported shop names → refresh list. On error, show the message and remind about the 30-minute / single-use TTL of auth codes.

**Configure a shop:** list → detail hub → Settings. Save → `PUT tiktok/shops/{shopId}` → refetch. The hub shows a visible warning when `productStoreId` is unset (orders cannot import without it).

**Shipping providers:** detail hub → Shipping Providers. Table: left = OMS carrier (from existing carrier fetch used by `ShopifyShipmentMethods`), right = free-text TikTok `shipping_provider_id`. A `_DEFAULT_` row is required — the screen shows an error state until one exists. Upsert/delete per row.

## Part 4 — Error handling & validation

- All management endpoints authenticated; standard Moqui error responses → PWA toasts (Shopify pattern).
- UI gates: Authorize disabled until app credentials configured; warning badges for missing `productStoreId` and missing `_DEFAULT_` shipping mapping; token-health badge (ok / expiring <7d / expired) on list + hub.
- `holdMinutes` validated as integer ≥ 0; `autoApproveBuyerCancel` and `shopStatusId` constrained to their enum/indicator values server-side.

## Part 5 — Testing

- **Backend:** extend the component's sandbox e2e + `moqui-verification` audit to cover: credentials get/update (secret never echoed), authorize flow against the sandbox auth host, shops list/get/update, mappings CRUD.
- **PWA:** `vue-tsc --noEmit` (strict) and `vite build` green; manual dogfood of the full onboarding flow against the local OMS + bundled TikTok sandbox (`node sandbox/server.js`).

## Assumptions & dependencies

1. **One Partner Center app** for the org → app credentials are a single global setting (`TikTokShopApi` remote). If multi-app is ever needed, the API already passes `systemMessageRemoteId` through.
2. **Facility-group picker:** assumed an existing OMS endpoint can list facility groups for the Settings picker. **To confirm during planning**; if absent, add `GET tiktok/facilityGroups` (or reuse an `oms/` endpoint) to the backend work.
3. `tiktokWarehouseId` and `shipping_provider_id` are **free-text** in v1; dropdowns fed from TikTok APIs are a fast-follow.
4. The two repos ship independently: backend (asbeauty/tiktok component) must land and be deployed before the PWA screens are useful; the PWA degrades gracefully (errors toast) if endpoints are missing.
5. Permission gating reuses the company app's existing pattern (`hasPermission` / app-level view permission); no new permission scheme in v1.
