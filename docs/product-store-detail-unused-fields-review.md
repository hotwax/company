# Product Store Detail Unused Fields Review

Generated: 2026-06-12

This document lists the Product Store Detail page functions that were not found in active code after narrowing the audit scope. Use it to decide whether each item should be hidden from the Company app UI or wired into current Moqui/Ionic logic.

## Source UI

- Page: `/product-store-details/ANILDUKAAN`
- Company source: `src/views/product-store/ProductStoreDetails.vue`
- Inventory source: fields rendered by `productStoreSections` and ProductStoreSetting IDs rendered by `productStoreSettingSections`

## Audit Scope

Counted as usage only when an exact key was found in functional code under:

- Active local Moqui component code, including the current `moqui-runtime/component` symlink targets and local Moqui component repos.
- Non-Company Ionic app source/config code.

Excluded from usage proof:

- `hotwax-oms`, because it is legacy/OFBiz-heavy and was producing misleading matches for this review.
- Seed data, demo data, upgrade data, entity definitions, entity model XML, labels, docs, logs, and migration files.
- Hidden legacy admin forms that only expose schema fields.
- Company app self-reference, including this detail page and related Company configuration screens.

Important interpretation: "unused" means no active functional reference was found in the narrowed scope above. It does not mean the field is absent from schema, seed data, legacy code, or historical admin screens.

## Summary

- Total rendered entries reviewed: 111
- Entries not found in active Moqui/non-Company Ionic logic: 75
- ProductStore fields not found: 60
- ProductStoreSetting IDs not found: 15

Default review rule after this pass:

- Keep fields/settings that are verified in current code or explicitly retained as product decisions.
- Hide unverified, unmentioned fields behind the super-only advanced reveal.
- Add logic only when there is a current service, app flow, or operator workflow that should read or update the value.

## Review Decisions

Keep visible or wire into current logic:

| Key | Decision |
| --- | --- |
| `defaultTimeZoneString` | Keep. User referred to this as `defaultTimeZone`; the ProductStore field key is `defaultTimeZoneString`. |
| `orderNumberPrefix` | Keep. |
| `prodSearchExcludeVariants` | Keep. |
| `autoInvoiceDigitalItems` | Keep. |
| `SAVE_BILL_TO_INF` | Keep. Verified in Shopify bridge and OMS create order. No OMS issue created because the setting is honored. |
| `RETURN_DEADLINE_DAYS` | Keep. Should be used in the returns app, but no exact current-code hit was found. |
| `AUTO_REJ_IDLE_ORD` | Keep. Should drive an OMS fulfillment-group job that auto rejects idle orders, but no exact current-code hit was found. |
| `PRE_ORDER_GROUP_ID` | Keep. Should be used in the pre-order app, but no exact current-code hit was found. |
| `REL_PREORD_ROUGRP_ID` | Keep. Should be used in the pre-order app, but no exact current-code hit was found. |
| `PRE_SLCTD_FAC_TAG` | Keep. Verified in Shopify order ingestion logic. |
| `ORD_ITM_PICKUP_FAC` | Keep. Verified in Shopify order ingestion logic. |
| `ORD_ITM_SHIP_FAC` | Keep. Verified in Shopify order ingestion logic. |
| `ORD_ITM_SHIP_METH` | Keep. Verified in Shopify order ingestion logic. |
| `RTN_RSTCK_FAC` | Keep. Verified in Shopify bridge return/refund logic. |
| `FULFILL_NOTIF` | Keep. Verified in Shopify bridge fulfillment notification logic. |
| `explodeOrderItems` | Keep. Verified in Shopify bridge order ingestion logic. |
| `DEFULT_PKG_BOPIS_ORD` | Keep. Should be used in Poorti, and should probably map to the carrier shipment method table instead. No exact current-code hit was found. |
| `RATE_SHOPPING` | Keep pending Poorti wiring. Poorti has rate-shopping services, but the exact setting key was not found there. |
| `REJ_ITM_CC_CRT` | Keep as roadmap. This should become a Cycle Count app screen, not just a Product Store setting. |

Legacy behavior needing review before hiding or porting:

| Key | Decision |
| --- | --- |
| `reserveOrderEnumId` | Review legacy behavior before deciding whether to port or hide. |
| `requireInventory` | Review legacy behavior before deciding whether to port or hide. |
| `daysToCancelNonPay` | Review legacy behavior before deciding whether to port or hide. |
| `headerApprovedStatus` | Review legacy behavior before deciding whether to port or hide. |

Hide everything else by default. Hidden fields should only be reachable through a secret/advanced reveal control, and that control should only appear for users with a super-admin security permission tied to the super security group.

## Current-Code Investigation Results

Verified active usage:

| Key | Current behavior found |
| --- | --- |
| `SAVE_BILL_TO_INF` | Shopify bridge reads this setting in `prepareTransformedShopifyOrderPayload.groovy`. When `Y`, it maps Shopify `billingAddress` into `orderMap.billTo`. OMS `OrderServices.create#SalesOrder` accepts `billTo` and creates `BILLING_LOCATION`, `BILLING_EMAIL`, and `PHONE_BILLING` order contact mechs. |
| `PRE_SLCTD_FAC_TAG` | Shopify bridge reads this setting and checks Shopify order tags. When the configured tag is present, the bridge reads the item pickup/shipping facility and shipment method settings. |
| `ORD_ITM_PICKUP_FAC` | Shopify bridge reads this setting when `PRE_SLCTD_FAC_TAG` matched the Shopify order tags. |
| `ORD_ITM_SHIP_FAC` | Shopify bridge reads this setting when `PRE_SLCTD_FAC_TAG` matched the Shopify order tags. |
| `ORD_ITM_SHIP_METH` | Shopify bridge reads this setting when `PRE_SLCTD_FAC_TAG` matched the Shopify order tags. |
| `RTN_RSTCK_FAC` | Shopify bridge return/refund scripts read this setting as the fallback destination facility when Shopify location mapping is `_NA_` or unavailable. |
| `FULFILL_NOTIF` | Shopify bridge shipment service reads this setting to populate Shopify fulfillment `notifyCustomer`. |
| `explodeOrderItems` | Shopify bridge reads `ProductStore.explodeOrderItems`; when `Y`, it calls `ShopifyOrderHelperServices.explode#ShopifyOrderItems` before order creation. |

Keep, but no exact current-code hit was found:

| Key | Current conclusion |
| --- | --- |
| `defaultTimeZoneString` | Keep by product decision; no exact active code reference found in the narrowed search. |
| `orderNumberPrefix` | Keep by product decision; no exact active code reference found in the narrowed search. |
| `prodSearchExcludeVariants` | Keep by product decision; no exact active code reference found in the narrowed search. |
| `autoInvoiceDigitalItems` | Keep by product decision; no exact active code reference found in the narrowed search. |
| `RETURN_DEADLINE_DAYS` | Should be used in the returns app; no exact active code reference found. |
| `AUTO_REJ_IDLE_ORD` | Should drive an OMS fulfillment-group auto-reject job; no exact active code reference found. |
| `PRE_ORDER_GROUP_ID` | Should be used in the pre-order app; no exact active code reference found. |
| `REL_PREORD_ROUGRP_ID` | Should be used in the pre-order app; no exact active code reference found. |
| `DEFULT_PKG_BOPIS_ORD` | Should be used in Poorti or mapped through carrier shipment method; no exact active code reference found. |
| `RATE_SHOPPING` | Poorti has rate-shopping services, but the exact ProductStoreSetting key was not found. |
| `REJ_ITM_CC_CRT` | Roadmap item for Cycle Count app screen; no exact active code reference found. |

Hide after investigation:

| Key | Current conclusion |
| --- | --- |
| `requireCustomerRole` | No exact active code reference found. Hide behind the super-only advanced reveal. |
| `orderDecimalQuantity` | No exact active code reference found. Hide behind the super-only advanced reveal. |
| `autoApproveInvoice` | No exact active code reference found. Hide behind the super-only advanced reveal. |
| `balanceResOnOrderCreation` | No exact active code reference found. Hide behind the super-only advanced reveal. |
| `requirementMethodEnumId` | No exact active code reference found. Hide behind the super-only advanced reveal. |
| `isImmediatelyFulfilled` | No exact active code reference found. Hide behind the super-only advanced reveal. |
| `managedByLot` | No exact active code reference found. Hide behind the super-only advanced reveal. |
| `setOwnerUponIssuance` | No exact active code reference found. Hide behind the super-only advanced reveal. |
| `reqReturnInventoryReceive` | No exact active code reference found. Hide behind the super-only advanced reveal. |
| `EX_INV_BY_PRD_TYPE` | No exact active code reference found. Hide behind the super-only advanced reveal. |

## Legacy `hotwax-oms` Behavior Notes

These notes intentionally come from `hotwax-oms`, which was excluded from the active-use audit. They explain what the old code did, not what the current Moqui/Ionic stack already does.

| Key | Legacy behavior found |
| --- | --- |
| `reserveOrderEnumId` | Controls inventory reservation/issuance ordering. `ProductStoreServices.xml` passes `productStore.reserveOrderEnumId` into reservation services. `InventoryReserveServices.xml` converts it into inventory sort order: highest/lowest unit cost, FIFO/LIFO by expiration date, or FIFO/LIFO by received date, defaulting to `INVRO_FIFO_REC`. The selected value is also stored on `OrderItemShipGrpInvRes`. `InventoryIssueServices.xml` also reads `productStore.reserveOrderEnumId` when choosing inventory issue order. |
| `requireInventory` | Controls whether reservation requires available stock. The legacy service description says that when `requireInventory` is `Y`, unreserved quantity is returned; when `N`, negative ATP can be used to track orders beyond stock. Fulfillment code also skips reservation for virtual facilities when the store requires inventory. Catalog validation treats product-level `requireInventory` as overriding the store-level default, and if the product is blank but the store is `Y`, it validates facility/inventory setup. |
| `daysToCancelNonPay` | Drives auto-cancel date behavior for unpaid/non-pay orders. Legacy order code defaults to 30 days, overrides that from `ProductStore.daysToCancelNonPay`, treats `0` as no auto-cancel, and uses the date to cancel order items or set `OrderItem.autoCancelDate`. Some Shopify/API usages were commented out, but CSR/buy-now/order service paths still show the intended behavior. |
| `headerApprovedStatus` | Controls the order header status selected during approval. `OrderChangeHelper.approveOrder` defaults held orders to `ORDER_PROCESSING`, but for non-held orders uses `ProductStore.headerApprovedStatus` when present. `OrderServices` also checks this value to avoid redundant header status changes when all items become approved. |

## Poorti Rate-Shopping Check

Poorti has active rate-shopping behavior, but not an exact reference to the `RATE_SHOPPING` ProductStoreSetting key.

- `co.hotwax.poorti.shipping.ShippingServices.do#RateShop` and `do#NewRateShop` perform rate shopping for shipments.
- `co.hotwax.poorti.FulfillmentServices.handle#OrderFulfillmentWave` calls the Poorti rate-shop service during fulfillment wave handling.
- `retry#ShippingLabel` and `retry#NewShippingLabel` expose `forceRateShop`, which can force rate shopping during label retry.

Conclusion: `RATE_SHOPPING` should stay in the review set, but it looks like a missing wiring decision rather than already-wired Poorti configuration.

## ProductStore Fields Not Found

| Key | Display label | Review question | Suggested disposition |
| --- | --- | --- | --- |
| `visualThemeId` | Visual theme ID | Is the Company app expected to configure any current visual theme logic? | Hide unless a current theme service is introduced. |
| `defaultTimeZoneString` | Default time zone | Should downstream order/store logic read a store-specific timezone? | Keep. |
| `orderNumberPrefix` | Order number prefix | Does current order creation still support store-level order prefixes? | Keep. |
| `viewCartOnAdd` | View cart on add | Is there any current storefront cart flow controlled by this? | Hide as legacy storefront behavior unless reintroduced. |
| `autoSaveCart` | Auto save cart | Is there any current cart persistence flow controlled by this? | Hide as legacy storefront behavior unless reintroduced. |
| `allowPassword` | Allow password | Is the store expected to control customer password behavior? | Hide unless a current customer-auth flow needs it. |
| `defaultPassword` | Default password | Should new users ever receive a configured default password? | Hide; this is risky unless there is explicit modern auth logic. |
| `usePrimaryEmailUsername` | Use primary email username | Does current customer account creation use this flag? | Hide unless current auth provisioning needs it. |
| `requireCustomerRole` | Require customer role | Does current ordering/login require a store-specific customer role check? | Hide behind super-only advanced reveal. |
| `retryFailedAuths` | Retry failed authorizations | Does current payment retry logic read this flag? | Hide unless payment retry logic is ported. |
| `allowComment` | Allow comments | Does any current order/customer flow read this flag? | Hide unless comments are made configurable. |
| `orderDecimalQuantity` | Allow decimal order quantity | Should current order entry permit fractional quantities by store? | Hide behind super-only advanced reveal. |
| `manualAuthIsCapture` | Manual authorization is capture | Does current payment capture logic read this flag? | Hide unless payment logic is wired to it. |
| `autoApproveInvoice` | Auto approve invoice | Should invoice approval be controlled per store? | Hide behind super-only advanced reveal. |
| `shipIfCaptureFails` | Ship if capture fails | Does fulfillment currently allow shipping after failed capture? | Hide unless payment/fulfillment logic is wired to it. |
| `checkGcBalance` | Check gift card balance | Is gift card balance validation supported in current flows? | Hide unless gift card logic is active. |
| `selectPaymentTypePerItem` | Select payment type per item | Does current checkout/order logic support item-level payment type? | Hide as legacy checkout behavior unless reintroduced. |
| `splitPayPrefPerShpGrp` | Split payment preference per ship group | Does current checkout/order logic split payment preferences by ship group? | Hide as legacy checkout behavior unless reintroduced. |
| `storeCreditAccountEnumId` | Store credit account enum ID | Does current store credit accounting read this enum? | Hide unless store credit logic is wired. |
| `storeCreditValidDays` | Store credit valid days | Does current credit issuance/expiration logic read this value? | Hide unless store credit logic is wired. |
| `reserveOrderEnumId` | Reserve order enum ID | Does current reservation behavior need a store-level enum? | Review legacy behavior before deciding whether to port or hide. |
| `requireInventory` | Require inventory | Should current ordering/fulfillment block when inventory is missing? | Review legacy behavior before deciding whether to port or hide. |
| `balanceResOnOrderCreation` | Balance reservations on order creation | Does current reservation balancing need this store flag? | Hide behind super-only advanced reveal. |
| `requirementMethodEnumId` | Requirement method enum ID | Does current replenishment/requirement creation read this enum? | Hide behind super-only advanced reveal. |
| `isImmediatelyFulfilled` | Immediately fulfilled | Does any current order flow auto-fulfill by store setting? | Hide behind super-only advanced reveal. |
| `explodeOrderItems` | Explode order items | Does current order creation explode product associations/kits by store setting? | Keep. Verified in Shopify bridge order ingestion logic. |
| `prodSearchExcludeVariants` | Exclude variants from product search | Does current product search read a store-level variant exclusion flag? | Keep. |
| `showOutOfStockProducts` | Show out of stock products | Does current product browsing/search read this storefront setting? | Hide unless storefront/PIM search is wired. |
| `managedByLot` | Managed by lot | Does current inventory/fulfillment logic require store-level lot management? | Hide behind super-only advanced reveal. |
| `setOwnerUponIssuance` | Set owner upon issuance | Does current inventory issuance set owner by store setting? | Hide behind super-only advanced reveal. |
| `autoInvoiceDigitalItems` | Auto invoice digital items | Does current digital item fulfillment/invoicing exist? | Keep. |
| `reqShipAddrForDigItems` | Require ship address for digital items | Does current digital item checkout need shipping address rules? | Hide unless digital item logic is active. |
| `showCheckoutGiftOptions` | Show checkout gift options | Does any current checkout expose gift options? | Hide as legacy storefront behavior unless reintroduced. |
| `showPricesWithVatTax` | Show prices with VAT tax | Does current pricing/tax display use VAT-inclusive pricing by store? | Hide unless current tax display logic is wired. |
| `showTaxIsExempt` | Show tax is exempt | Does current pricing/tax display expose tax-exempt state by store? | Hide unless current tax display logic is wired. |
| `vatTaxAuthGeoId` | VAT tax auth geo ID | Does current tax calculation read store VAT authority geo? | Hide unless current tax logic is wired. |
| `vatTaxAuthPartyId` | VAT tax auth party ID | Does current tax calculation read store VAT authority party? | Hide unless current tax logic is wired. |
| `reqReturnInventoryReceive` | Require return inventory receive | Does current returns logic require inventory receipt by store? | Hide behind super-only advanced reveal. |
| `daysToCancelNonPay` | Days to cancel non-pay orders | Does current order cancellation automation read this value? | Review legacy behavior before deciding whether to port or hide. |
| `enableAutoSuggestionList` | Enable auto suggestion list | Does current product/search UI read this flag? | Hide unless product suggestion logic is wired. |
| `enableDigProdUpload` | Enable digital product upload | Does current product management support digital uploads? | Hide unless digital upload logic is active. |
| `digProdUploadCategoryId` | Digital product upload category ID | Does current digital upload routing read this category? | Hide unless digital upload logic is active. |
| `headerApprovedStatus` | Header approved status | Does current order approval map store-specific header statuses? | Review legacy behavior before deciding whether to port or hide. |
| `itemApprovedStatus` | Item approved status | Does current order approval map store-specific item statuses? | Hide unless status mapping logic is wired. |
| `digitalItemApprovedStatus` | Digital item approved status | Does current digital fulfillment map store-specific statuses? | Hide unless digital item logic is active. |
| `headerDeclinedStatus` | Header declined status | Does current order decline map store-specific header statuses? | Hide unless status mapping logic is wired. |
| `itemDeclinedStatus` | Item declined status | Does current order decline map store-specific item statuses? | Hide unless status mapping logic is wired. |
| `headerCancelStatus` | Header cancel status | Does current cancellation logic map store-specific header statuses? | Hide unless status mapping logic is wired. |
| `itemCancelStatus` | Item cancel status | Does current cancellation logic map store-specific item statuses? | Hide unless status mapping logic is wired. |
| `authDeclinedMessage` | Authorization declined message | Does current payment UI/API return this configured message? | Hide unless payment messaging is wired. |
| `authFraudMessage` | Authorization fraud message | Does current payment UI/API return this configured message? | Hide unless payment messaging is wired. |
| `authErrorMessage` | Authorization error message | Does current payment UI/API return this configured message? | Hide unless payment messaging is wired. |
| `autoOrderCcTryExp` | Auto order try card expiration | Does current recurring/auto order payment retry read this flag? | Hide as legacy payment behavior unless reintroduced. |
| `autoOrderCcTryOtherCards` | Auto order try other cards | Does current recurring/auto order payment retry read this flag? | Hide as legacy payment behavior unless reintroduced. |
| `autoOrderCcTryLaterNsf` | Auto order try later for NSF | Does current recurring/auto order payment retry read this flag? | Hide as legacy payment behavior unless reintroduced. |
| `autoOrderCcTryLaterMax` | Auto order try later max | Does current recurring/auto order payment retry read this count? | Hide as legacy payment behavior unless reintroduced. |
| `oldStyleSheet` | Old style sheet | Is any current UI expected to load this legacy stylesheet? | Hide. |
| `oldHeaderLogo` | Old header logo | Is any current UI expected to load this legacy header logo? | Hide. |
| `oldHeaderMiddleBackground` | Old header middle background | Is any current UI expected to load this legacy header background? | Hide. |
| `oldHeaderRightBackground` | Old header right background | Is any current UI expected to load this legacy header background? | Hide. |

## ProductStoreSetting IDs Not Found

| Key | Display label | Review question | Suggested disposition |
| --- | --- | --- | --- |
| `SAVE_BILL_TO_INF` | Save bill to information | Should current order/customer flows persist billing information from this setting? | Keep. Verified in Shopify bridge and OMS create order. |
| `RETURN_DEADLINE_DAYS` | Return deadline days | Should current returns eligibility use this configured deadline? | Keep. Should be used in the returns app; no exact current-code hit found. |
| `RTN_RSTCK_FAC` | Restock returns facility | Should current return receiving/restock logic use a configured facility? | Keep. Verified in Shopify bridge return/refund logic. |
| `AUTO_REJ_IDLE_ORD` | Auto reject idle orders | Should current automation reject idle orders using this setting? | Keep. Should drive an OMS fulfillment-group job; no exact current-code hit found. |
| `PRE_ORDER_GROUP_ID` | Pre-order group ID | Should current preorder logic use this product group? | Keep. Should be used in the pre-order app; no exact current-code hit found. |
| `REL_PREORD_ROUGRP_ID` | Release preorder routing group ID | Should preorder release routing use this configured routing group? | Keep. Should be used in the pre-order app; no exact current-code hit found. |
| `EX_INV_BY_PRD_TYPE` | Exclude inventory by product type | Should current inventory logic exclude products by type using this setting? | Hide behind super-only advanced reveal. |
| `PRE_SLCTD_FAC_TAG` | Pre-selected facility tag | Should current fulfillment/facility selection use this tag? | Keep. Used by Shopify order ingestion logic. |
| `ORD_ITM_PICKUP_FAC` | Order item pickup facility | Should order item pickup facility assignment use this setting? | Keep. Used by Shopify order ingestion logic. |
| `ORD_ITM_SHIP_FAC` | Order item ship facility | Should order item ship facility assignment use this setting? | Keep. Used by Shopify order ingestion logic. |
| `ORD_ITM_SHIP_METH` | Order item shipment method | Should order item shipment method assignment use this setting? | Keep. Used by Shopify order ingestion logic. |
| `FULFILL_NOTIF` | Fulfillment notifications | Should current fulfillment notification behavior be configured by this setting? | Keep. Verified in Shopify bridge fulfillment notification logic. |
| `DEFULT_PKG_BOPIS_ORD` | Default package for BOPIS orders | Should current BOPIS packaging logic use this setting? | Keep. Should be used in Poorti; consider mapping through carrier shipment method instead. No exact current-code hit found. |
| `RATE_SHOPPING` | Rate shopping | Should current shipping/rate selection logic read this flag? | Keep pending Poorti wiring. Poorti has rate-shopping services, but this exact setting key was not found. |
| `REJ_ITM_CC_CRT` | Create cycle count for rejected items | Should rejected item handling create cycle counts using this setting? | Keep as roadmap. Should become a Cycle Count app screen. |

## Recommended Next Review Pass

1. For each `keep` row, identify the exact Moqui service, bridge flow, or Ionic workflow that should read it.
2. For the four legacy-review fields, decide whether the old behavior should be ported to current Moqui logic or hidden with the advanced-only fields.
3. Hide every unmentioned row by default.
4. Add a secret/advanced reveal control for hidden rows that is itself hidden unless the user has the super-admin security permission.
