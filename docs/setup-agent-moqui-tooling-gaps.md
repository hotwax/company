# Setup Agent Moqui Status

The setup agent now has a live path for creating a target `ProductStore`, capturing retailer discovery answers, and applying eligible `ProductStore` / `ProductStoreSetting` values after an explicit UI action.

## Verified live behavior

- `/setup-agent` is authenticated and available from the Agents menu.
- The visual setup shell can create a new `ProductStore` from the Live OMS target card.
- The conversation starts against `/rest/s1/onboarding/conversations` and stores the target product store on the onboarding session.
- When no configured LLM provider is available, the Moqui fallback responder maps retailer language to onboarding topics and config slots.
- The Package panel shows an explicit `Apply captured settings` action.
- `POST /rest/s1/onboarding/conversations/{conversationId}/apply` applies eligible captured values to the live store.

## Verified REST proof

Fresh local verification against `http://127.0.0.1:8080` with `HotWax.user`:

- `GET /rest/s1/onboarding/topics` returned 18 onboarding topics.
- A new ProductStore `CXONBMQ8SBFQY` was created through onboarding.
- A Shopify + ship-from-store + BOPIS discovery answer produced topics for platform, footprint, routing, BOPIS, carriers, and roles.
- Applying the package wrote:
  - `ProductStore.enableBrokering=Y`
  - `ProductStore.reserveInventory=Y`
  - `ProductStoreSetting SAVE_BILL_TO_INF=Y`
  - `ProductStoreSetting DEFULT_PKG_BOPIS_ORD=Y`
  - `ProductStoreSetting SHOW_SHIPPING_ORDERS=Y`

## Checklist-only surfaces

These are still intentionally captured as setup requirements, not automatically written by the ProductStore apply endpoint:

| Area | Current output | Why not applied here |
| --- | --- | --- |
| Facilities and Shopify locations | Checklist slots for facility creation and Shopify location mapping | Requires facility topology creation before values can be written safely. |
| Pickup and facility brokering | Checklist/setup-required when the runtime field is not on `ProductStore` | `allowPickup` and `allowBrokering` are facility-owned in this runtime. |
| Routing rule groups | Checklist | Requires order-routing rule construction, not a single store field. |
| Security groups and permissions | Checklist | Needs a separate group/permission assignment service with preview. |
| Shopify shop connection | Checklist | Needs credential/token generation and Shopify app install handoff. |
| Carrier, Klaviyo, and Unigate integrations | Checklist | Requires external gateway credentials and connection-specific validation. |
| Service job bundles | Checklist | Needs workflow-specific cloning/scheduling semantics. |

## Local runtime

- Company dev server: `http://localhost:8110/setup-agent`
- Moqui backend: `http://localhost:8080`
- Moqui was started in detached screen session `moqui-onboarding-agent`.
- Stop it with `screen -S moqui-onboarding-agent -X quit`.
