# Carrier credential and gateway API gap

**Status:** source-contract review complete; authenticated `test-maarg` evidence pending.

**Reviewed:** 2026-07-29 against Company carrier-management design, OMS commit `3001129`,
and `maarg-util` commit `a4f2701`.

## Purpose

Company can manage carrier identity, shipment methods, facility availability, product-store
shipment-method associations, and the observable portion of the OMS-to-Unigate connection.
It cannot safely manage shipping credentials, the supported gateway registry, or carrier-to-gateway
links until bounded Company-facing REST resources are added.

This document distinguishes three different kinds of evidence:

1. a REST resource that Company can call;
2. an internal OMS service or server-rendered screen action that is not a browser API;
3. authenticated environment evidence, which remains explicitly pending below.

Paths in this document are relative to `/rest/s1` unless shown otherwise.

## Supported Company reads and writes

| Capability | Supported read | Supported write | Boundary |
| --- | --- | --- | --- |
| Carrier identity | `GET oms/shippingGateways/carrierParties` | `POST oms/shippingGateways/carrierParties`; rename with `POST admin/organizations/{partyId}` | No carrier-delete product contract. |
| Carrier shipment methods | `GET oms/shippingGateways/carrierShipmentMethods`; nested carrier read and count resources also exist | `POST`, `PUT`, and `DELETE oms/shippingGateways/carrierShipmentMethods` | The assignment key is carrier party, `CARRIER` role, and shipment-method type. |
| Shipment-method types | `GET oms/shippingGateways/shipmentMethodTypes` | Company uses `POST` and `PUT`; checked-in REST also declares `DELETE` | Deleting a global type is outside the carrier-management product scope. |
| Carrier-facility associations | `GET oms/shippingGateways/carrierParties/{partyId}/facilities` | `POST` and `PUT oms/facilities/{facilityId}/parties` | Company closes an active date-effective row with `thruDate`; it does not hard-delete history. |
| Product-store shipment methods | `GET admin/productStores/{productStoreId}/shippingMethods` | `POST` and `PUT oms/productStores/{productStoreId}/shipmentMethods`; checked-in legacy REST also declares `DELETE` | The canonical read and currently proven write resources are different. See the next section. |
| Observable Unigate tenant readiness | `GET oms/systemMessageRemotes`, filtered to `UNIGATE_CONFIG` | `PUT oms/systemMessageRemotes/{systemMessageRemoteId}` | Carrier readiness may use only allowlisted, non-secret fields such as `internalId` and `sendUrl`. This generic resource is not a shipping-credential API. |

These are source-supported contracts, not a claim that every route has been exercised in the current
`test-maarg` session.

## Canonical product-store read and proven legacy write

The checked-in `maarg-util` admin resource declares only:

```http
GET /rest/s1/admin/productStores/{productStoreId}/shippingMethods
```

That is the canonical Company read. It returns the product-store shipment-method view and is the
source used by the all-store cache fan-out.

The checked-in OMS resource still declares:

```http
POST   /rest/s1/oms/productStores/{productStoreId}/shipmentMethods
PUT    /rest/s1/oms/productStores/{productStoreId}/shipmentMethods
DELETE /rest/s1/oms/productStores/{productStoreId}/shipmentMethods
```

The parent `oms/productStores` resource is marked deprecated in favor of `admin/productStores`, but
the admin replacement currently has no shipment-method write methods. Company therefore uses the
legacy OMS route for create, scalar update, and date-expiry until a replacement is implemented and
verified. Current removal behavior sends a `thruDate` with `PUT`, preserving date-effective history.

Company must not:

- write to `admin/productStores/{productStoreId}/shippingMethods`, because it is GET-only;
- invent `admin/productStores/{productStoreId}/shipmentMethods`, which is not declared;
- switch away from the OMS write resource until an admin write contract preserves
  `productStoreShipMethId`, date-effectivity, tracking, gateway, and sequence semantics.

## Internal backend support that is not a Company API

| Model | Checked-in backend support | Company-facing REST status | Required boundary |
| --- | --- | --- | --- |
| `ShippingGatewayAuth` | `UnigateServices.xml` defines internal list, create, update, and delete services that proxy Unigate. The OMS shipping-gateway server screen invokes them. | No shipping-auth REST resource is declared in `oms.rest.xml`. | Add a tenant-scoped, redacted metadata read plus write-only create/rotate and dependency-safe delete operations. |
| `ShippingGatewayConfig` | `UnigateServices.xml` defines a supported internal `get#ShippingGatewayConfigs` adapter for the Unigate `shippingGatewayConfig` registry. | No Company-consumable REST resource is declared. No checked-in create/update/delete adapter was found. | Expose a bounded, normally read-only registry to Company. Gateway-definition administration is a separate privileged backend concern. |
| `ShippingCarrierConfig` | The OMS shipping-gateway screen reads the entity by tenant and invokes entity create, update, and delete services. | No bounded REST resource is declared for Company. Server-screen transitions and generic entity services are not SPA contracts. | Add tenant-scoped list and mutation operations with a stable link ID and explicit store, carrier, optional facility, gateway-config, and auth-reference semantics. |

The legacy-looking path `oms/shippingGateways/config` is not declared in the checked-in OMS REST
file. That source fact does not establish what any currently deployed environment returns. Company
must not call the path or interpret an empty, missing, or failed response as connected,
disconnected, or ready.

The adjacent plural path `oms/shippingGateways/configs` **is** declared and lists the OFBiz core
entity `ShipmentGatewayConfig`. That does not close the `ShippingGatewayConfig` row above: the
Unigate registry named there is a different entity, declared only in `UnigateServices.xml` and its
OMS server screen, with no REST resource of its own. Do not treat the plural route as a substitute.

## Minimum backend contracts

Endpoint names below are proposed contract shapes, not existing routes. The backend may choose
different names, but it must preserve the security and scoping rules.

### 1. Shipping credential metadata and mutations

```http
GET    /rest/s1/oms/shippingGatewayAuths
POST   /rest/s1/oms/shippingGatewayAuths
POST   /rest/s1/oms/shippingGatewayAuths/{shippingGatewayAuthId}/rotate
DELETE /rest/s1/oms/shippingGatewayAuths/{shippingGatewayAuthId}
POST   /rest/s1/oms/shippingGatewayAuths/{shippingGatewayAuthId}/test
```

The list and mutation responses should expose an allowlist such as:

- stable auth ID and gateway-config ID;
- safe description and tenant ownership;
- `secretConfigured` or per-field configured booleans;
- last-updated and optional last-tested status/timestamps;
- a sanitized test result with no raw provider response.

Create and rotate requests may accept secret material. Responses must return metadata only. Delete
must reject an in-use auth with a stable conflict code and the count of dependent links, not leak
their configuration.

### 2. Supported shipping-gateway registry

```http
GET /rest/s1/oms/shippingGatewayConfigs
```

The response should contain only operator-safe registry fields: stable config ID, description,
provider/type, enabled status, and declared capabilities or required credential-field descriptors.
It must not contain a tenant's credential values. The existing internal
`get#ShippingGatewayConfigs` service is the backend adapter precedent; it is not itself callable
from Company.

### 3. Carrier-to-gateway links

```http
GET    /rest/s1/oms/shippingCarrierConfigs
POST   /rest/s1/oms/shippingCarrierConfigs
PUT    /rest/s1/oms/shippingCarrierConfigs/{shippingCarrierConfigId}
DELETE /rest/s1/oms/shippingCarrierConfigs/{shippingCarrierConfigId}
```

The list must be bounded and filterable by the authenticated tenant, product store, carrier, and
facility. Mutations must:

- derive or validate tenant ownership on the server;
- validate referenced carrier, store, facility, gateway config, and auth records;
- define whether facility-specific rows override store defaults;
- define hard-delete versus date-effective close semantics;
- return the authoritative, redacted link row.

### 4. Shared API behavior

All three resources need:

- backend permission checks and tenant isolation on reads and writes;
- bounded pagination and a documented response envelope;
- stable `400`, `403`, `404`, `409`, and validation error shapes;
- payload-level errors compatible with Company's shared error handling;
- idempotency or duplicate-key behavior for retried create/rotate calls;
- audit metadata for credential and link changes;
- contract tests proving secrets never appear in reads, mutation responses, errors, or logs.

Until these contracts exist, Company should render **Verification unavailable** for credential and
carrier-link readiness and keep credential create, rotate, disconnect, test, and link controls out
of the UI.

## Secrets are write-only

Credential values include passwords, API keys, access tokens, private keys, and any provider field
classified as authentication material. They must never be:

- returned by a GET or echoed by a mutation response;
- used to prefill an edit form;
- stored in Pinia, Dexie, `localStorage`, session storage, or service-worker caches;
- placed in a URL, query string, analytics event, application log, or user-visible error;
- retained after a create or rotate request completes.

The existing internal `ShippingGatewayAuth` service accepts fields such as `password` and
`publicKey`. That internal input shape does not authorize a Company read model containing those
fields. The server-facing REST wrapper must redact the response before it crosses the browser
boundary.

For `UNIGATE_CONFIG`, the carrier surface needs only the remote ID, non-empty tenant/internal ID,
and send URL. If an API key is written through the existing remote update, the UI must treat it as
a one-way replacement value and must not require it in the subsequent readiness read. The generic
system-message-remote list is not a substitute for a safe shipping-auth metadata contract.

## Authenticated `test-maarg` evidence — pending browser QA

**Do not treat this table as a current environment assertion.** Every observed field is deliberately
`Pending` until an authenticated browser pass records the date, request, status, response shape,
and restoration evidence. Never paste response bodies or credential values into this document.

| Check | Request | Source-based expectation | Observed UTC | HTTP/result | Evidence |
| --- | --- | --- | --- | --- | --- |
| Carrier catalog read | `GET oms/shippingGateways/carrierParties` | Route is declared; response should be a carrier list. | Pending | Pending | Pending |
| Canonical store-method read | `GET admin/productStores/{verifiedProductStoreId}/shippingMethods` | GET is declared in `maarg-util`; record the envelope and paging shape. | Pending | Pending | Pending |
| Reversible store-method write | `PUT oms/productStores/{verifiedProductStoreId}/shipmentMethods` | Legacy PUT is declared; browser QA may toggle and restore tracking on the exact same row. | Pending | Pending | Pending record ID and restoration proof |
| Observable Unigate readiness | `GET oms/systemMessageRemotes` and select `UNIGATE_CONFIG` | Record only whether required non-secret fields are present and whether unexpected secret field names are exposed. | Pending | Pending | Pending; no values captured |
| Undeclared legacy route | `GET oms/shippingGateways/config` | No route is declared in checked-in OMS source; record the deployed result without promoting it to a durable contract. | Pending | Pending | Pending |
| Shipping-gateway config registry | Final agreed Company REST path | Internal read adapter exists, but no Company route is declared. | Blocked on backend contract | Not tested | Pending backend issue/PR |
| Shipping-auth redaction | Final agreed Company REST path | No Company route is declared; when added, assert metadata-only reads and responses. | Blocked on backend contract | Not tested | Pending backend issue/PR |
| Carrier-link CRUD | Final agreed Company REST path | No Company route is declared; use no generic entity or server-screen transition from the SPA. | Blocked on backend contract | Not tested | Pending backend issue/PR |

## Checked-in source evidence

- `oms/service/oms.rest.xml` at `3001129`: Company-supported carrier, facility-party,
  product-store shipment-method, and system-message-remote resources; no shipping auth, gateway
  config, or carrier config REST resources.
- `oms/service/co/hotwax/unigate/UnigateServices.xml` at `3001129`: internal
  `ShippingGatewayAuth` list/create/update/delete and `ShippingGatewayConfig` list adapters.
- `oms/screen/Oms/Unigate/ShippingGateway.xml` at `3001129`: server-screen use of the internal auth
  and config services plus direct `ShippingCarrierConfig` entity reads and mutations.
- `maarg-util/service/admin.rest.xml` at `a4f2701`: GET-only
  `admin/productStores/{productStoreId}/shippingMethods`.
- `docs/carrier-management-architecture.md`: Company route, cache, mutation, readiness, and browser
  QA design.
- `src/workers/domains/referenceDomains.ts`, `src/composables/useCarriers.ts`,
  `src/composables/useFacilities.ts`, `src/composables/useProductStores.ts`,
  `src/composables/useSeed.ts`, and `src/composables/useKlaviyo.ts`: current Company reads, writes,
  and refresh ownership.
