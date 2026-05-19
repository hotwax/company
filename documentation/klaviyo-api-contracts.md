# Klaviyo Email Integration — API Contracts

This document is the source of truth for every API request the Klaviyo UI makes.
Backend prerequisite: the OMS REST endpoints listed below must exist (see
`oms/service/oms.rest.xml` additions for `commGatewayAuths`, `commGatewayConfigs`,
`productStoreEmailSettings`, and `emailTypes`).

All request bodies and response shapes here are what the frontend assumes. If
the backend returns something different, fix the frontend service layer
(`src/services/KlaviyoService.ts`) — do **not** silently rewrite this doc to
match a malformed response. Update the doc and the backend together.

---

## 1. Architecture in one paragraph

The OMS instance the company app talks to has a fixed `SystemMessageRemote`
called `UNIGATE_CONFIG` that holds the OMS→Unigate connection (URL, API key,
tenant ID). Every Klaviyo API call is proxied: company app → OMS REST →
`UnigateServices.send#UnigateRequest` → Unigate REST → Unigate database. So the
UI only ever sees OMS endpoints. There is **never** a direct call to Unigate
from the browser.

The data model has three pieces:

- **`CommGatewayAuth`** (Unigate) — stores Klaviyo credentials. One per
  Klaviyo account/brand.
- **`CommGatewayConfig`** (Unigate) — registry of supported gateways
  (KLAVIYO is one of them). Read-only from the UI.
- **`ProductStoreEmailSetting`** (OMS) — for each `(productStoreId, emailType)`
  pair, says which `CommGatewayAuth` should send that email.

---

## 2. Tenant readiness check (UNIGATE_CONFIG)

Before any Klaviyo screen renders content, we check whether the OMS instance
has a tenant configured. If `UNIGATE_CONFIG` is missing the user sees an
informative empty state.

### `GET /oms/systemMessageRemotes`

Lists all OMS-side system message remotes. We filter client-side for the
`UNIGATE_CONFIG` row.

**Response** (array):

```json
[
  {
    "systemMessageRemoteId": "UNIGATE_CONFIG",
    "internalId": "TENANT_PARTY_ID",
    "description": "Unigate tenant connection",
    "sendUrl": "https://dev-unigate.hotwax.io/rest/s1/unigate/",
    "publicKey": "<unigate api key>",
    "authHeaderName": "api_key"
  }
]
```

The fields the UI reads: `systemMessageRemoteId`, `internalId` (tenantPartyId),
`sendUrl`, `description`. Anything else is ignored.

---

## 3. CommGatewayAuth (Klaviyo connections)

### `GET /oms/commGatewayAuths`

Lists every `CommGatewayAuth` for the current tenant. The UI filters
client-side to `commGatewayConfigId === "KLAVIYO"`.

**Response** (array):

```json
[
  {
    "commGatewayAuthId": "AUTH_KLAVIYO_001",
    "commGatewayConfigId": "KLAVIYO",
    "tenantPartyId": "ADOC",
    "description": "Brand A — production Klaviyo",
    "baseUrl": "https://a.klaviyo.com/api/",
    "authHeaderName": "Authorization",
    "publicKey": "Klaviyo-API-Key pk_xxxxxxxxxxxxxxxxxxxx",
    "username": null,
    "password": null,
    "modeEnumId": null,
    "authTypeEnumId": null
  }
]
```

The frontend treats `publicKey` as opaque. When displaying, it strips the
`Klaviyo-API-Key ` prefix and masks all but the last 4 characters
(`Klaviyo-API-Key pk_xxxx...wxyz` → `••••••••wxyz`).

### `POST /oms/commGatewayAuths`

Creates a new `CommGatewayAuth`. The UI generates `commGatewayAuthId`
client-side (see "ID generation" below).

**Request body**:

```json
{
  "commGatewayAuthId": "KLAVIYO_BRAND_A_1730000000000",
  "commGatewayConfigId": "KLAVIYO",
  "description": "Brand A — production Klaviyo",
  "baseUrl": "https://a.klaviyo.com/api/",
  "authHeaderName": "Authorization",
  "publicKey": "Klaviyo-API-Key pk_xxxxxxxxxxxxxxxxxxxx"
}
```

**Response**: a single `CommGatewayAuth` object (same shape as the GET list
items above). If the backend returns `_ERROR_MESSAGE_`, the UI surfaces it via
toast.

### `PUT /oms/commGatewayAuths/{commGatewayAuthId}`

Updates an existing `CommGatewayAuth`. PUT was chosen to match the convention
used elsewhere in `oms.rest.xml` (`systemMessageRemotes/{id}` and the
nested `productStoreEmailSettings/{...}/emailSettings/{emailType}` updates
are also PUT). Only fields that the user actually changed are sent. The API
key field is special — see the "Updating an API key" UX rules below.

**Request body** (every field optional except `commGatewayConfigId`):

```json
{
  "commGatewayConfigId": "KLAVIYO",
  "description": "Brand A — staging Klaviyo",
  "publicKey": "Klaviyo-API-Key pk_yyyyyyyyyyyyyyyyyy"
}
```

**Response**: updated `CommGatewayAuth` object.

### `DELETE /oms/commGatewayAuths/{commGatewayAuthId}`

Deletes the auth row. The UI must warn that any `ProductStoreEmailSetting` that
references this `gatewayAuthId` will stop sending emails.

**Response**: an empty object or `{ "deleted": true }`. We treat any 2xx as
success.

---

## 4. CommGatewayConfig (read-only registry)

### `GET /oms/commGatewayConfigs`

Lists registered gateway configs. The UI does not let users create configs;
it only uses this list to confirm `KLAVIYO` exists before letting the user add
a Klaviyo connection.

**Response** (array):

```json
[
  {
    "commGatewayConfigId": "KLAVIYO",
    "description": "Klaviyo email and event gateway",
    "sendEmailServiceName": "co.hotwax.klaviyo.KlaviyoServices.send#EmailCommunication",
    "createEventServiceName": "co.hotwax.klaviyo.KlaviyoServices.create#WorkflowEvent"
  }
]
```

---

## 5. ProductStoreEmailSetting (per-store email events)

### `GET /oms/productStoreEmailSettings/{productStoreId}/emailSettings`

Lists every email event configured for one product store.

**Response** (array):

```json
[
  {
    "productStoreId": "STORE",
    "emailType": "READY_FOR_PICKUP",
    "subject": "Your order is ready for pickup",
    "fromAddress": "store@brand.com",
    "systemMessageRemoteId": "UNIGATE_CONFIG",
    "gatewayAuthId": "AUTH_KLAVIYO_001"
  }
]
```

The UI groups these by `gatewayAuthId` to show which connection handles which
events for which stores.

### `POST /oms/productStoreEmailSettings/{productStoreId}/emailSettings`

Creates or updates (entity `store` operation) the row.

**Request body**:

```json
{
  "emailType": "READY_FOR_PICKUP",
  "subject": "Your order is ready for pickup",
  "fromAddress": "store@brand.com",
  "systemMessageRemoteId": "UNIGATE_CONFIG",
  "gatewayAuthId": "AUTH_KLAVIYO_001"
}
```

`systemMessageRemoteId` is always `"UNIGATE_CONFIG"` — the UI sets this
literal, never asks the user.

**Response**: the saved `ProductStoreEmailSetting` row.

### `DELETE /oms/productStoreEmailSettings/{productStoreId}/emailSettings/{emailType}`

Removes the row. Disabling an email event in the UI calls this.

**Response**: 2xx with empty body / `{ "deleted": true }`.

---

## 6. Email type enumerations

The Klaviyo UI does **not** call a Klaviyo-specific endpoint for email types.
It reuses the existing app-wide enum-fetching path:

### `GET /admin/enums?enumTypeId=PRDS_EMAIL`

Wired through `UtilService.fetchEnums` and dispatched via the `util` Vuex
module (`util/fetchEmailTypes` action, `util/getEmailTypes` getter). The
util module already caches per session — every other enum-driven flow in
the app uses this same pattern (`fetchProductIdentifiers`,
`fetchShipmentMethodTypes`, etc.), so Klaviyo follows suit instead of
shipping a parallel endpoint.

**Response** (array):

```json
[
  { "enumId": "READY_FOR_PICKUP",     "description": "BOPIS Order Ready for Pickup",  "enumTypeId": "PRDS_EMAIL" },
  { "enumId": "REJECT_BOPIS_ORDER",   "description": "BOPIS Order Rejection",         "enumTypeId": "PRDS_EMAIL" },
  { "enumId": "CANCEL_BOPIS_ORDER",   "description": "BOPIS Order Cancellation",      "enumTypeId": "PRDS_EMAIL" },
  { "enumId": "HANDOVER_BOPIS_ORDER", "description": "BOPIS Order Handover/Completion","enumTypeId": "PRDS_EMAIL" },
  { "enumId": "CREATE_KLAVIYO_EVENT", "description": "Create Klaviyo Event",          "enumTypeId": "PRDS_EMAIL" }
]
```

---

## 7. Product stores (existing endpoint, no change)

### `GET /oms/productStores`

Already used elsewhere in the app. The Klaviyo email events screen reuses the
existing `productStore/getProductStores` Vuex getter and dispatches
`productStore/fetchProductStores` if the cache is empty. No new endpoint.

---

## 8. UX & data rules the UI enforces

These are encoded in `KlaviyoService.ts` and the modals. Backend should not
need to enforce them but should not contradict them either.

### ID generation

`commGatewayAuthId` is generated client-side as
`KLAVIYO_<slugifiedDescription>_<unixMs>`, capped at 60 characters and
uppercased. Example: `KLAVIYO_BRAND_A_1730998877123`. This guarantees
uniqueness without a backend round-trip.

### API key prefix

Klaviyo's REST API expects the `Authorization` header value to be
`Klaviyo-API-Key pk_xxxx`. The UI:

- accepts the raw `pk_xxxx` private key from the user
- prepends `Klaviyo-API-Key ` before sending to the backend
- on display, strips the prefix and masks all but the last 4 chars

### Updating an API key

API keys are write-only from the UI's perspective. To change one, the user
must:

1. open the connection's edit modal
2. click "Replace API key" (a deliberate gesture, not just typing)
3. confirm a destructive-style toast warning that prior key will stop working
4. paste the new key

We never display the existing key value in an editable input.

### Deleting a connection

Deletion shows the count of `ProductStoreEmailSetting` rows that point at this
`commGatewayAuthId`. The user has to type `DELETE` to confirm if there are
any. (Same pattern as Shopify's destructive flows.)

---

## 9. Error contract

Successful requests return either a JSON object/array (2xx) or — for legacy
OFBiz-style responses — an object with `_ERROR_MESSAGE_` / `_ERROR_MESSAGE_LIST_`
fields. The UI uses `hasError(response)` from `@/utils` and surfaces messages
via `getResponseErrorMessage(error, defaultMessage)`. Both already exist;
no new utilities needed for Klaviyo.
