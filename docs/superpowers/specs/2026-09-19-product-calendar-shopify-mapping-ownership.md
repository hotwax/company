# Product Calendar Shopify Mapping Ownership

## Purpose

Product calendar dates are catalog data. Shopify metafield configuration is integration setup.
This design keeps those two concerns separate while preserving the operator path from an ATP
rule to the configuration that makes its calendar dates available.

## Operator flow

1. An operator editing an ATP rule in Order Routing can add a calendar-date condition and open
   the scoped Product Calendar in Products.
2. Products shows that ProductStore's calendar-date rows and a compact Shopify mapping summary:
   the number of active calendar mappings across its Shopify shops.
3. Selecting **Manage Shopify mappings** opens the selected shop's Product Sync page in Company
   in a new tab.
4. Company is the only UI that creates, changes, or retires calendar metafield mappings.

## Ownership

| Concern | Owner | Responsibility |
| --- | --- | --- |
| Product calendar dates | Products | Read and present the ProductStore's lifecycle dates. |
| Shopify metafield mappings | Company / Product Sync | Read, create, update, and retire `ShopifyShopTypeMapping` records for calendar dates. |
| ATP calendar conditions | Order Routing | Configure the date conditions on routing rules and link to Products. |
| Mapping persistence | Existing Shopify connector API | Keep the current `ShopifyShopTypeMapping` contract; no new endpoint or entity. |

## Products behavior

The Product Calendar page remains ProductStore-scoped. It no longer contains an Add Shopify
mapping action, mapping modal, or mapping write code.

It retains the lightweight mapping read only to show one native Ionic summary item:

- label: **Shopify calendar mappings**;
- detail: the count of active `SHOPIFY_PRODUCT_CALENDAR_DATE` mappings across Shopify shops linked
  to the selected ProductStore;
- action: **Manage Shopify mappings**, a clear external-link action to Company when a Shopify shop
  exists and the Company app URL is configured.

An active mapping has the calendar mapping type, belongs to one of the ProductStore's Shopify shops,
and has a non-empty `mappedValue`. Retired rows are excluded because clearing `mappedValue` is the
existing retirement behavior.

When several Shopify shops belong to a ProductStore, Products selects the first stable matching
shop (ascending local `shopId`) for the Company link. The count still covers mappings from every
linked shop. This matches the current product decision without inventing a shop-picker on the
calendar page. If no shop is linked, Products shows the count and explanatory empty detail but no
dead link.

The link is built through `buildAppUrl("company", ...)` rather than hard-coding a host. It targets:

```
/shopify-connection-details/:shopId/product-sync
```

and opens in a new tab with `rel="noopener noreferrer"`.

## Company behavior

Company Product Sync owns a Product calendar mappings card for its current shop. The card is
available from the Product Sync page regardless of whether the shop is in first-time setup or the
returning experience, because mappings are integration configuration rather than sync-run state.

The card presents the four supported calendar destination fields:

- Introduction date (`introductionDate`)
- Release date (`releaseDate`)
- Support discontinuation date (`supportDiscontinuationDate`)
- Sales discontinuation date (`salesDiscontinuationDate`)

For each field, the operator can enter the Shopify metafield selector and save it. A blank saved
value retires the field's mapping using the existing value-clearing behavior. The editor uses the
same native Ionic card/list and clear-action patterns as the other Company mapping surfaces; it
does not add a new store, polling loop, endpoint, or cache domain.

Reads use the existing `useShopifyTypeMappings(shopId, "SHOPIFY_PRODUCT_CALENDAR_DATE")` cached
slice. Writes use the existing `useShopifyShopMutations(shopId)` save/retire methods, which refresh
the affected shop's type-mapping cache after a successful server response.

## Failure and empty states

- Product Calendar with no ProductStore: retain its existing selected-store empty state.
- Product Calendar with no linked Shopify shop: report zero active mappings and omit the Company
  management action.
- Product Calendar when Company is not configured in the Fast Travel registry: show the count and
  omit the action.
- Company mapping write error: retain the current editor value, surface the returned failure, and
  do not claim the mapping changed.
- Cache reconciliation error after a committed Company write: follow Company’s existing committed
  write/reconciliation semantics; do not replay the POST.

## Scope boundaries

- No backend entity, REST resource, migration, or Shopify sync-payload change.
- No Product Calendar mapping editor or mapping mutation remains in Products.
- No shop selector is added to Products in this change.
- Order Routing retains only its ATP date-condition UI and its existing deep link to Products.
- The unrelated Company branch `fix/shopify-inventory-event-type-prefix` is not part of this work.

## Verification

Automated coverage will prove:

1. Products counts only active calendar mappings for linked shops and produces the stable Company
   Product Sync URL from the first matching shop.
2. Products omits the Company action when there is no eligible shop or Company URL.
3. Company renders the existing mapping values for the current shop and sends the exact mapping
   type, destination field, and selector through the existing mutation seam.
4. Retiring a mapping sends the existing empty-value retirement write, not a DELETE.
5. Order Routing preserves the scoped link to Products and its date-condition action styling.

Manual UAT will verify the full path: Order Routing rule → Products calendar summary → Company
Product Sync mapping editor, plus a real save/read-back against the available OMS instance without
changing unrelated server data.
