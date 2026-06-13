# QuickBox 3PL Connection Config UI — Design

**Date:** 2026-06-11
**Status:** Approved (user-validated via brainstorming)
**Scope decision:** v1 = **Connection & auth only**. Architecture **B — generic OMS endpoints, zero backend changes, one repo**. Structure = Shopify-style **detail hub + credential modals** (no list-of-one).

## Problem

The QuickBox 3PL connector (Moqui component at `maarg-sd/asbeauty/runtime/component/quickbox-connector`) is a complete bidirectional integration — orders out via the PickWave pipeline, three inbound webhooks (fulfillment status / shipment confirm / inventory adjustment), and a full QBFO lifecycle. What it has **no UI for** is the per-environment configuration an admin must set to go live. Today that means editing seed `SystemMessageRemote` rows by hand (`data/QuickBoxConfigData.xml` ships them with empty values).

We want admins to configure the QuickBox connection in the **company PWA**, consistent with how they manage Shopify.

## Scope

QuickBox's full config surface spans connection/auth, warehouse `externalId` mapping, background-job enablement + tuning, SFTP batch credentials, and outbound endpoint paths. **v1 covers connection & auth only:**

1. **`QuickBoxApi`** — outbound REST connection: `sendUrl` (iQ Connect base URL) + auth, where auth is either a Bearer token (`password` only → `Authorization: Bearer <password>`) or HTTP Basic (`username` + `password`).
2. **`QuickBoxWebhookIn`** — shared inbound webhook token (`password`), plus **display** of the three receiver URLs to hand to QuickBox.

Everything else is an explicit fast-follow (see *Out of Scope*).

## Background — why this differs from Shopify and TikTok

| | Shopify | QuickBox (this work) |
|---|---|---|
| Cardinality | Many shops, each its own `{shopId}_REMOTE` | **One fixed connection** — connector hardcodes `systemMessageRemoteId="QuickBoxApi"` in its ServiceJob parameters; backend cannot address multiple QuickBox connections |
| Backend work | Dedicated `oms/shopifyShops/*` services | **None** — reuses the generic `oms/systemMessageRemotes` endpoints already used by Klaviyo's Unigate config |
| UI shape | Connections list → per-shop detail hub → modals | **Single detail hub** at `/quickbox` → credential modals (no list, no "create connection") |

Because QuickBox is a single fixed connection and reads are already secret-safe (below), the **NetSuite/Klaviyo single-integration model** is the structural reality, dressed in Shopify's hub-and-modal idioms for consistency.

## Architecture — generic OMS endpoints (Option B)

No changes to the `quickbox-connector` component or any Moqui backend. The company app talks only to endpoints that already exist and are already used by shipped company-app code:

- **Read:** `GET oms/systemMessageRemotes?systemMessageRemoteId=QuickBoxApi&systemMessageRemoteId=QuickBoxWebhookIn`
  Backed by `co.hotwax.util.UtilityServices.get#SystemMessageRemotes` (maarg-util `UtilityServices.xml`), whose `select-field` returns `systemMessageRemoteId, description, sendUrl, receiveUrl, sendServiceName, username, remoteId, remoteIdType, internalId, internalIdType, accessScopeEnumId, systemMessageTypeId` — **`password` is deliberately omitted**, so reads never leak the secret. `systemMessageRemoteId` is a `List` in-parameter, so both records come back in one call.
- **Write:** `PUT oms/systemMessageRemotes/QuickBoxApi` and `PUT oms/systemMessageRemotes/QuickBoxWebhookIn` — the generic entity `store` (createOrUpdate) operation; upserts, so it succeeds even if the connector seed data was never loaded on the target instance.

This mirrors the **shipped** Klaviyo/Unigate pattern (`klaviyo.ts` → `updateSystemMessageRemote` → `PUT oms/systemMessageRemotes/{id}`), not the still-unbuilt TikTok management-API plan.

**Secret-handling behavior:** secret fields (`QuickBoxApi.password`, `QuickBoxWebhookIn.password`) load **blank** (the GET omits them). On save, a secret is written **only if the admin typed one** — an empty field is omitted from the PUT payload so the stored value is preserved. This lets an admin correct the base URL without re-entering the token. (A deliberate softening of Shopify's mandatory "rotate credentials" re-entry, appropriate because QuickBox config is touched more for endpoints than for rotation.)

## Screens

All in the company PWA. Mirror `ShopifyConnectionDetails.vue` (hub layout: `<h1>` section + `.item-box` grid) and `EditShopifyCredentialsModal.vue` (toolbar + close, `ion-list`, stacked labels, `type="password"` fields).

### `src/views/QuickBox.vue` — hub at `/quickbox`

- Header: `ion-menu-button` + title "QuickBox 3PL".
- One **Configuration** `<h1>` section, same `.item-box` grid as Shopify, two cards:
  - **API credentials** — sub-label shows the base URL (or "Not configured") and the inferred auth mode → opens `EditQuickBoxApiCredentialsModal`.
  - **Inbound webhooks** — sub-label "Shared token and receiver URLs" → opens `EditQuickBoxWebhookModal`.
- `onIonViewWillEnter` → `quickBoxStore.fetchConnectionConfig()`.

### `src/components/EditQuickBoxApiCredentialsModal.vue`

Fields:
- **Base URL** (`sendUrl`).
- **Authentication** selector (segment or `ion-select`): **Bearer token** | **Basic auth**.
  - Bearer → single **API token** field (→ `password`).
  - Basic → **Username** (→ `username`) + **Password** (→ `password`).
- On open, mode is inferred from current config: `username` present ⇒ Basic, else Bearer. New/empty defaults to Bearer.
- Save → `quickBoxStore.updateApiCredentials(...)`:
  - Always sends `sendUrl`.
  - Bearer mode sends `username: ''` (clears any stale basic-auth username) and `password` **only if typed**.
  - Basic mode sends `username` and `password` **only if typed**.
- Secret fields blank-on-load; toast + dismiss on success (`commonUtil.showToast`, accxui error pattern).

### `src/components/EditQuickBoxWebhookModal.vue`

- **Receiver URLs** (read-only, copy buttons) — the three endpoints QuickBox posts to:
  - `{maargBase}/rest/s1/quickbox/fulfillmentStatus`
  - `{maargBase}/rest/s1/quickbox/shipmentConfirm`
  - `{maargBase}/rest/s1/quickbox/inventoryAdjustment`
  - `maargBase` from `commonUtil.getMaargURL()`; confirm at implementation whether the helper already includes the `/rest/s1` segment and compose accordingly.
- **Shared webhook token** field (write-only → `QuickBoxWebhookIn.password`); blank on load, written only if typed.
- Save → `quickBoxStore.updateWebhookToken(...)`.

## Store — `src/store/quickbox.ts` → `useQuickBoxStore()`

```
state:
  apiConfig:        { sendUrl: '', username: '' }   // from GET; never holds a secret
  fetchStatus:      { connection: '', lastFetched: 0 }   // '' | 'pending' | 'success' | 'error'

getters:
  isApiConfigured  -> !!apiConfig.sendUrl
  authMode         -> apiConfig.username ? 'basic' : 'bearer'
  webhookUrls      -> three composed URLs from commonUtil.getMaargURL()

Note: the webhook record exposes no readable indicator (it has only `password`, which the
GET omits, and no `sendUrl`), so there is no "webhook configured" flag — the Inbound webhooks
card shows the URLs + a write-only token field without a configured/not-configured state.

actions:
  fetchConnectionConfig()   // GET both records in one call; set fetchStatus pending/success/error + lastFetched
  updateApiCredentials(p)   // PUT oms/systemMessageRemotes/QuickBoxApi; refetch
  updateWebhookToken(p)     // PUT oms/systemMessageRemotes/QuickBoxWebhookIn; refetch
  clearQuickBoxState()      // $reset
```

- Uses `api`, `commonUtil`, `logger` from `@common`. `persist: true`.
- accxui rules: router-instance import (no `useRouter()` in components/guards), no `src/services/`, `fetchStatus` contract present (consumed by `Settings.vue`).

## Wiring

- **Route:** add `{ path: '/quickbox', name: 'QuickBox', component: () => import('@/views/QuickBox.vue'), beforeEnter: authGuard }` to `src/router/index.ts`.
- **Menu:** add a **QuickBox** entry to `appPages` in `src/components/Menu.vue` (icon `cubeOutline`), placed with the other integrations.
- **Logout:** add `useQuickBoxStore().clearQuickBoxState()` to `user.postLogout` (alongside the existing store-clear calls).
- **Settings:** surface the store's `fetchStatus.connection` in the Data Fetch Status card in `src/views/Settings.vue`.

## Error handling & validation

- Standard Moqui error responses → PWA toasts (the shipped `commonUtil.hasError` / `showToast` pattern).
- Client-side: Save disabled until **Base URL** is non-empty; in Basic mode, **Username** required. Token/password fields are optional on edit (blank = keep existing).
- No server-side validation is added (Option B), so the UI is the only gate; keep checks minimal and forgiving.

## Out of Scope (v1) — documented fast-follows

All reachable later via generic endpoints without revisiting this work:

1. **Warehouse mapping** — list facility group `QUICKBOX` members, set each site's real `externalId` (QuickBox warehouse code), activate/deactivate via `FacilityGroupMember.thruDate`. Endpoints: `admin/facilities`, `admin/facilityGroups`, facility-group-member CRUD.
2. **Job / pipeline controls** — enable/pause the connector ServiceJobs (`advance_QuickBoxPipeline`, `consume_ReceivedQuickBoxMessages`, `send_ProducedQuickBoxMessages`) and tune `picklistSize` / `maxInFlight`.
3. **SFTP batch** — `QuickBoxSftp` host/user/key (only if the CSV-batch path is used).
4. **Outbound endpoint paths** — editable `sendPath` on `SendQuickBoxFulfillmentOrder` / `SendQuickBoxOrderCancel`.

## Testing

No unit-test harness in this repo (Vitest was removed), so **verify-after** with exact commands:

- **Type + build:** `npx vue-tsc --noEmit -p tsconfig.json` (0 errors; the only allowed diagnostic is the pre-existing `TS5101` baseUrl deprecation) and `pnpm build` (`✓ built`).
- **Manual dogfood** against a local OMS running the asbeauty stack:
  - Set API credentials (Bearer), confirm `GET oms/systemMessageRemotes?systemMessageRemoteId=QuickBoxApi` shows the new `sendUrl` and **no** `password`.
  - Switch to Basic auth, confirm `username` is set; switch back to Bearer, confirm `username` is cleared.
  - Edit base URL only (token left blank), confirm the stored token is preserved (outbound send still authenticates).
  - Set the webhook token; confirm the three receiver URLs render and copy correctly.

## Assumptions & dependencies

1. The seed `SystemMessageRemote` rows (`QuickBoxApi`, `QuickBoxWebhookIn`) exist on the target OMS once the connector data is loaded; if not, the `store`-op PUT creates them — so the UI works regardless.
2. `commonUtil.getMaargURL()` resolves to the OMS base that also receives the QuickBox webhooks (the connector runs in that same OMS). Confirm at implementation whether the helper includes `/rest/s1`.
3. Permission gating reuses the company app's existing pattern (`authGuard` / app-level view permission); no new permission scheme in v1.
4. Single-connection assumption holds while the connector hardcodes `QuickBoxApi`; multi-connection would require backend changes and is out of scope.
