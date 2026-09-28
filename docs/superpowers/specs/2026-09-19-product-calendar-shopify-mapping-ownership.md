# Product Calendar Shopify Mapping Ownership

## Purpose

Product calendar dates are catalog data. Shopify metafield configuration is integration setup.
Company Product Sync is the only UI that creates, changes, or removes the `ShopifyShopTypeMapping`
rows (type `SHOPIFY_PRODUCT_CALENDAR_DATE`) that tell the connector which Shopify metafield feeds
each calendar date.

## Cross-app path

Order Routing links an ATP calendar-date condition to the ProductStore's Product Calendar in
Products. Products shows a count of active calendar mappings and a **Manage Shopify mappings** link
to `/shopify-connection-details/:shopId/product-sync` in Company, so that route must keep showing
the mappings card whichever Product Sync experience the shop is in. Products and Order Routing own
their own behavior in their repositories.

## Company behavior

Product Sync shows a Product calendar mappings card for its current shop in both experiences: in
the first-time setup wizard's tracker column, and as one of the Sync monitor cards in the returning
experience.

The card presents the four supported calendar destination fields:

- Introduction date (`introductionDate`)
- Release date (`releaseDate`)
- Support discontinuation date (`supportDiscontinuationDate`)
- Sales discontinuation date (`salesDiscontinuationDate`)

Each field opens a picker instead of a free-text input. The connector reads a calendar mapping only
as `namespace:key` split at the first colon, and only from a `date` or `date_time` metafield; it
drops any other value without an error. The picker therefore:

- lists the shop's product and variant metafield definitions of those two types, read live through
  the existing `shopify/graphql` proxy (`metafieldDefinitions`), with a search over name, namespace,
  and key;
- saves the chosen definition as `namespace:key`;
- offers manual entry for a metafield without a definition. A typed value must be checked against
  Shopify before it can be saved. An exact date-type match can be saved directly. A value with no
  matching definition, a non-date definition, or an unreachable Shopify can be saved only after the
  operator acknowledges that the dates may not be populated. A value the connector cannot parse
  cannot be saved;
- removes a mapping with an explicit action, which deletes the key, as every Company mapping surface
  does since clearing moved from an empty-value write to `DELETE oms/shopifyShops/typeMappings`.

The picker adds no store, polling loop, endpoint, or cache domain; metafield definitions are a live
read because Shopify owns them.

Reads use the existing `useShopifyTypeMappings(shopId, "SHOPIFY_PRODUCT_CALENDAR_DATE")` cached
slice. Writes use the existing `useShopifyShopMutations(shopId)` save/delete methods, which refresh
the shop's whole type-mapping partition after a successful server response. The picker stays open
and cannot be dismissed while a save is pending, so saves never overlap. Until the cached slice
hydrates, the fields render skeletons.

## Failure states

- Write error: keep the picker open with the operator's choice, surface the failure, and do not
  claim the mapping changed.
- Cache reconciliation error after a committed write: treat the mapping as saved, warn that the view
  could not be refreshed, and never replay the write.

## Scope boundaries

- No backend entity, REST resource, migration, or Shopify sync-payload change.

## Verification

Automated coverage proves:

1. The card renders the shop's current mappings and sends the exact mapping type, destination field,
   and selector through the existing mutation seam.
2. Removing a mapping sends the existing type-mapping DELETE for that key.
3. The picker lists only date and date-time definitions, and a typed selector is saveable only after
   a check matches it or the operator acknowledges the warning.
