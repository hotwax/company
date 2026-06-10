# Product Store Onboarding Discovery Flow

## Purpose

Model product store onboarding after a HotWax discovery conversation. The user should answer business process questions, and the app should translate those answers into the product store settings that matter while skipping irrelevant settings.

This is a working discovery log. It is intended to become a Mermaid flow diagram later.

## Discovery Questions

### 1. Solution Interest

**Question**

What solutions are you most interested in?

**Answer choices**

- Order routing
- Ship from Store
- Buy online pickup in store
- Store Inventory Management
- Pre-orders

**Intent**

Identify which HotWax operating capabilities are relevant before asking configuration questions. This should control which follow-up sections appear in onboarding.

**Configuration direction**

- Order routing should lead into routing, brokering, fulfillment source, and order approval questions.
- Ship from Store should lead into facility fulfillment, inventory reservation, rejection, packing, and fulfillment notification questions.
- Buy online pickup in store should lead into BOPIS, pickup rejection, pickup readiness, and customer pickup-change questions.
- Store Inventory Management should lead into inventory visibility, inventory count, reservation, and systemic QOH questions.
- Pre-orders should lead into preorder inventory holding, preorder facility groups, split behavior, and release behavior questions.

**Notes**

- This should likely be multi-select.
- The app should not expose unrelated setting categories after this answer.
- The selected solutions should create a tailored onboarding path and a clear summary of skipped areas.

## Cold-Start Setup Backbone

This section pivots from value discovery to setup discovery. Assume a new Shopify retailer is onboarding into a cold-start HotWax/Moqui instance where backend seed data exists, but retailer-specific operating data does not.

### Absolutely Required Before Any Solution Works

These are the minimum setup areas that must exist before Order Routing, Ship from Store, BOPIS, Store Inventory Management, or Pre-orders can be useful.

| Setup area | Why it is required | App should ask | Configuration/output |
| --- | --- | --- | --- |
| Organization identity | Product stores need a company/pay-to organization context. | What is your company or retail brand name? | Organization record, `ProductStore.companyName`, `ProductStore.payToPartyId` |
| Product store identity | Every solution is scoped to a product store. | What Shopify storefront or retail brand is this HotWax store for? | `ProductStore.productStoreId`, `storeName`, `defaultCurrencyUomId`, `orderNumberPrefix` |
| Shopify connection | Shopify is the sales channel, even if credentials are added later. | Is Shopify connected now, or should this store be prepared for Shopify later? | `ShopifyShop`, `ShopifyShop.productStoreId`, SystemMessage remote if connected |
| Facilities | Routing, fulfillment, pickup, inventory, and preorder need places. | What physical locations are in scope: stores, warehouses, hubs, or pickup locations? | Facility records, facility groups, product-store/facility relationships |
| Shopify location mapping | Shopify locations must line up with HotWax facilities for inventory and fulfillment. | Which Shopify location maps to each HotWax facility? | Shopify location mapping records |
| Product identity | Orders, inventory, scanning, and product sync need a stable identifier. | What identifier is reliable across Shopify and stores: SKU, UPC/barcode, variant ID, or another ID? | `productIdentifierEnumId`, `PRDT_IDEN_PREF`, `BARCODE_IDEN_PREF` if needed |
| Inventory source | Store Inventory, routing, SFS, BOPIS, and preorder all depend on available quantity. | Where will HotWax get inventory quantities from? | Inventory import/source setup, inventory jobs, facility-level QOH |
| Users and roles | Store operations need people with app access. | Which teams will use HotWax: store associates, managers, inventory, fulfillment, admins? | Security groups/permissions by app and task |
| Service jobs and sync cadence | Shopify and inventory flows need scheduled or event-driven jobs. | Which syncs should run automatically and how often? | Product-store-scoped service jobs, Shopify jobs, inventory/order/fulfillment jobs |

### Setup Order

1. Create or confirm organization identity.
2. Create Product Store identity.
3. Connect or reserve a future Shopify connection.
4. Create/import facilities.
5. Map Shopify locations to HotWax facilities.
6. Choose product identity and barcode identity.
7. Load or schedule product and inventory data.
8. Enable selected solution modules.
9. Assign users/roles.
10. Review settings, mappings, and required follow-up setup.

### Solution Setup: Order Routing

**Setup questions**

1. Which locations can fulfill online orders: stores, warehouses, hubs, or selected groups?
2. Should HotWax route automatically, or should orders start in review?
3. What should routing optimize for: available inventory, proximity, fulfillment capacity, warehouse priority, or product rules?
4. Are there products that should route only to specific location types?
5. Can an order be split across multiple locations?
6. What should happen if the selected location rejects or cannot fulfill?

**Settings and setup touched**

| Area | Configuration/output |
| --- | --- |
| ProductStore | `enableBrokering`, `allowSplit`, `reserveInventory`, `checkInventory`, possibly `requireInventory` |
| ProductStoreSetting | `PRE_SLCTD_FAC_TAG`, `ORD_ITM_SHIP_FAC`, `ORD_ITM_SHIP_METH`, possible exception settings |
| Setup outside ProductStore | Facility groups, routing rules, product/facility eligibility, routing jobs |

### Solution Setup: Ship From Store

**Setup questions**

1. Which stores are allowed to ship online orders?
2. Do stores need HotWax to show assigned shipping orders?
3. Should store teams scan items before packing or shipping?
4. Should stores print picklists, packing slips, and shipping labels?
5. Should HotWax send fulfillment notifications back to Shopify?
6. What should happen when a store rejects an item or cannot fulfill the full order?

**Settings and setup touched**

| Area | Configuration/output |
| --- | --- |
| ProductStore | `enableBrokering`, `reserveInventory`, `allowSplit` if multi-location fulfillment is allowed |
| ProductStoreSetting | `SHOW_SHIPPING_ORDERS`, `FULFILL_NOTIF`, `FULFILL_FORCE_SCAN`, `FULFILL_PART_ODR_REJ`, `AFFECT_QOH_ON_REJ`, `REJ_ITM_CC_CRT`, `FF_COLLATERAL_REJ` |
| Setup outside ProductStore | Store fulfillment permissions, carrier/shipment method mappings, label provider, Shopify fulfillment jobs |

### Solution Setup: BOPIS

**Setup questions**

1. Which stores allow pickup?
2. Does Shopify checkout already show pickup options, or should HotWax support pickup routing after order import?
3. How does HotWax identify pickup orders: shipment method, Shopify delivery method, pickup facility property, or location mapping?
4. Should stores print picklists or packing slips for pickup orders?
5. Can customers change pickup location, delivery method, address, or cancel before fulfillment?
6. What should happen if a pickup store partially rejects an order?

**Settings and setup touched**

| Area | Configuration/output |
| --- | --- |
| ProductStore | `enableBrokering`, `reserveInventory`, `checkInventory` |
| ProductStoreSetting | `BOPIS_PART_ODR_REJ`, `DEFULT_PKG_BOPIS_ORD`, `SHOW_SHIPPING_ORDERS`, `PRINT_PACKING_SLIPS`, `PRINT_PICKLISTS`, `ENABLE_TRACKING`, `ORD_ITM_PICKUP_FAC`, customer self-service settings |
| Setup outside ProductStore | Pickup facility mapping, Shopify pickup/location mapping, pickup shipment methods, BOPIS app permissions |

### Solution Setup: Store Inventory Management

**Setup questions**

1. Which stores need inventory counts, receiving, transfers, or adjustments?
2. What system currently owns inventory: Shopify, ERP, WMS, or HotWax?
3. How will starting inventory be loaded?
4. What product identifier do store teams scan?
5. Should store teams see systemic quantity during counts?
6. Who can approve adjustments, receive transfers, or resolve discrepancies?

**Settings and setup touched**

| Area | Configuration/output |
| --- | --- |
| ProductStore | `productIdentifierEnumId`, `inventoryFacilityId`, `oneInventoryFacility`, `reserveInventory` when online orders should hold stock |
| ProductStoreSetting | `BARCODE_IDEN_PREF`, `RECEIVE_FORCE_SCAN`, possibly `EX_INV_BY_PRD_TYPE` |
| Setup outside ProductStore | Facilities, inventory import jobs, transfer jobs, inventory count permissions, adjustment permissions |

### Solution Setup: Pre-orders

**Setup questions**

1. How are preorder products identified: Shopify tag, product type, metafield, SKU list, or manual setup?
2. Where should preorder inventory live: global pool, warehouse, store, or preorder facility group?
3. Should HotWax hold physical inventory for preorders?
4. Can preorder items split from in-stock items?
5. How should preorder orders be released when inventory arrives?
6. Should preorder routing use the same rules as normal orders or a separate routing group?

**Settings and setup touched**

| Area | Configuration/output |
| --- | --- |
| ProductStore | `allowSplit`, `reserveInventory` depending on preorder behavior |
| ProductStoreSetting | `HOLD_PRORD_PHYCL_INV`, `PRE_ORDER_GROUP_ID`, `REL_PREORD_ROUGRP_ID`, possibly `EX_INV_BY_PRD_TYPE` |
| Setup outside ProductStore | Preorder product identification, PO/inbound inventory source, preorder routing jobs, release jobs |

### Settings Not Earned By Setup Questions

Any product store fields or `ProductStoreSetting` IDs not touched by one of the selected solution setup flows should be left out of the guided onboarding path. They can remain available later in an advanced settings registry.

## Topic Flow: Order Routing + Ship From Store

This flow applies when the user selects:

- Order routing
- Ship from Store

The goal is to discover how HotWax should route Shopify orders and whether stores participate as fulfillment locations.

### 2. Routing Problems

**Question**

What routing problems are you trying to solve?

**Answer choices**

- Some products should only ship from warehouses
- We want to ship from stores but protect safety stock
- We do not use Shopify POS, and stores need a place to see online orders
- We do not have warehouses
- Something else

**Intent**

Capture the retailer's real routing pain before asking them to configure fulfillment behavior. These answers should decide which follow-up questions appear and which settings are even eligible for onboarding.

**Settings and setup areas touched**

| Routing problem | Settings touched | Setup area | Value direction |
| --- | --- | --- | --- |
| Products should only ship from warehouses | No product-store setting confirmed yet | Product/facility routing rules | Ask how warehouse-only products are identified |
| Ship from stores with safety stock | No product-store setting confirmed yet | Inventory availability / routing safety stock rules | Ask whether safety stock is global, per store, or per product |
| Stores need a place to see online orders without Shopify POS | `SHOW_SHIPPING_ORDERS` candidate | Store fulfillment app visibility | likely `true`, pending validation |
| No warehouses | `enableBrokering`, `reserveInventory` | Store-only fulfillment network | likely `Y` for both if HotWax owns routing and inventory reservation |

**Follow-up branches**

- Warehouse-only products: ask how products are classified and whether the rule is product-level, product-type-level, or tag/category-driven.
- Safety stock: ask whether the buffer is the same across all stores or varies by store/product.
- No Shopify POS: ask whether store teams need HotWax to show only assigned shipping orders, all open online orders, or both.
- No warehouses: skip warehouse fallback questions and focus on store eligibility, inventory reservation, and exception handling.
- Something else: capture free-text notes and route to manual setup review.

**Notes**

- This question should likely appear immediately after the selected solutions, before detailed routing configuration.
- Not every routing problem maps to a `ProductStore` field or `ProductStoreSetting`. Some should create setup requirements instead of flipping settings.
- The onboarding summary should separate "settings configured" from "setup required outside product store settings."

### 3. Fulfillment Network

**Question**

Where should HotWax look when deciding how to fulfill Shopify orders?

**Answer choices**

- Stores only
- Warehouses only
- Stores and warehouses
- A specific set of stores or regions
- Not sure yet

**Intent**

Determine whether routing/brokering should be enabled and whether the user needs location-group setup before routing can be configured confidently.

**Settings touched**

| Setting | Source | When touched | Value direction |
| --- | --- | --- | --- |
| `enableBrokering` | `ProductStore` | Stores only, stores and warehouses, or specific stores/regions | `Y` |
| `enableBrokering` | `ProductStore` | Warehouses only | likely `N` unless routing is still needed across warehouses |
| `PRE_ORDER_GROUP_ID` | `ProductStoreSetting` | Not touched in this topic | Leave out for this flow |

**Follow-up branches**

- If stores are included, continue to Ship from Store eligibility.
- If only warehouses are included, skip most Ship from Store questions.
- If specific stores or regions are selected, ask how locations should be grouped.
- If the user said "we do not have warehouses," default this answer to stores only and do not ask warehouse fallback questions.
- If not sure, keep routing as a pending recommendation instead of forcing settings.

### 4. Ship From Store Eligibility

**Question**

Should every store be allowed to ship online orders, or only selected stores?

**Answer choices**

- Every store can ship online orders
- Only selected stores can ship online orders
- Stores can ship only for nearby customers
- Stores should not ship online orders yet

**Intent**

Identify whether store fulfillment is globally enabled or needs a constrained fulfillment group/rule before orders can be routed to stores.

**Settings touched**

| Setting | Source | When touched | Value direction |
| --- | --- | --- | --- |
| `enableBrokering` | `ProductStore` | Any store shipping option except "not yet" | `Y` |
| `ORD_ITM_SHIP_FAC` | `ProductStoreSetting` | Not touched by the basic answer | Ask later only if Shopify tags/properties preselect fulfillment locations |
| `PRE_SLCTD_FAC_TAG` | `ProductStoreSetting` | Not touched by the basic answer | Ask later only if Shopify tags/properties preselect fulfillment locations |

**Follow-up branches**

- Every store can ship: continue to inventory reservation.
- Only selected stores: capture a location group requirement before flipping detailed routing rules.
- Nearby customers: mark routing strategy as distance/zone based; this likely needs a routing rule setup outside the product store settings alone.
- Not yet: skip Ship from Store settings and record Ship from Store as future setup.

### 5. Store Order Visibility

**Question**

Do store teams need HotWax to show them online orders to fulfill?

**Answer choices**

- Yes, because we do not use Shopify POS for store fulfillment
- Yes, even though Shopify POS is also used
- No, store teams already work from another system
- Not sure yet

**Intent**

Determine whether HotWax needs to expose shipping orders directly to stores as part of the Ship from Store flow.

**Settings touched**

| Setting | Source | When touched | Value direction |
| --- | --- | --- | --- |
| `SHOW_SHIPPING_ORDERS` | `ProductStoreSetting` | Store teams need HotWax to show online shipping orders | likely `true`, pending runtime validation |
| `SHOW_SHIPPING_ORDERS` | `ProductStoreSetting` | Store teams use another system | likely leave unset |

**Follow-up branches**

- If HotWax must show online orders, ask whether stores should only see orders assigned to them or also unassigned/open orders.
- If another system is used, skip store-order visibility settings for onboarding.

### 6. Inventory Reservation

**Question**

When Shopify orders are imported, should HotWax reserve store inventory before fulfillment?

**Answer choices**

- Yes, reserve inventory when the order is imported
- No, only reduce inventory when fulfillment happens
- Only reserve inventory for routed orders
- Not sure yet

**Intent**

Decide whether HotWax should hold inventory against orders before fulfillment work starts.

**Settings touched**

| Setting | Source | When touched | Value direction |
| --- | --- | --- | --- |
| `reserveInventory` | `ProductStore` | Yes | `Y` |
| `reserveInventory` | `ProductStore` | No | `N` |
| `reserveInventory` | `ProductStore` | Only routed orders | Needs more validation; ProductStore field may be too broad |

**Follow-up branches**

- If reserve inventory is enabled, ask whether split/backorder behavior is allowed.
- If inventory is not reserved, skip preorder holding and reservation-dependent questions for this topic.
- If only routed orders, flag as a more advanced routing/inventory design rather than a simple product store setting.

### 7. Safety Stock

**Question**

When routing to stores, should HotWax keep a safety-stock buffer so stores do not sell their last units online?

**Answer choices**

- Yes, use the same buffer for every store
- Yes, but each store can have a different buffer
- Yes, but buffer depends on the product
- No safety-stock buffer
- Not sure yet

**Intent**

Capture safety-stock requirements without pretending this is a simple product store setting. This is a routing/inventory availability requirement that should drive later setup.

**Settings touched**

| Setting | Source | When touched | Value direction |
| --- | --- | --- | --- |
| None confirmed | Product store settings | Any safety-stock answer | Do not flip a product store setting from this alone |

**Follow-up branches**

- Global buffer: capture the buffer quantity and mark as routing/inventory setup.
- Store-specific buffer: require facility-level setup.
- Product-specific buffer: require product/category-level setup.
- No buffer: skip safety-stock setup.

### 8. Warehouse-Only Product Rules

**Question**

How do you identify products that should only ship from a warehouse?

**Answer choices**

- Product type
- Product tag/category
- Specific SKU/product list
- Shopify product data
- Not sure yet

**Intent**

Identify whether warehouse-only routing can be modeled by product attributes, product groups, Shopify data, or manual lists.

**Settings touched**

| Setting | Source | When touched | Value direction |
| --- | --- | --- | --- |
| None confirmed | Product store settings | Warehouse-only product rules | Do not flip a product store setting from this alone |
| `EX_INV_BY_PRD_TYPE` | `ProductStoreSetting` | Product type is used for inventory exclusion | Candidate only; validate whether the desired behavior is inventory sync exclusion or fulfillment routing |

**Follow-up branches**

- Product type: validate whether this means excluding inventory sync or restricting fulfillment routing.
- Product tag/category or SKU list: create routing-rule setup requirements.
- Shopify product data: ask which Shopify field is reliable.

### 9. Order Splitting

**Question**

If one location cannot fulfill the full Shopify order, should HotWax split the order across locations?

**Answer choices**

- Yes, split orders across locations when needed
- No, keep each order together at one location
- Only split preorder or backorder items
- Not sure yet

**Intent**

Determine whether partial location assignment is acceptable for the retailer's operations.

**Settings touched**

| Setting | Source | When touched | Value direction |
| --- | --- | --- | --- |
| `allowSplit` | `ProductStore` | Yes | `Y` |
| `allowSplit` | `ProductStore` | No | `N` |
| `allowSplit` | `ProductStore` | Only preorder/backorder items | Possibly `Y`, but should be paired with preorder flow questions |

**Follow-up branches**

- If splitting is allowed, ask how strict the shipment threshold should be.
- If splitting is not allowed, skip shipment-threshold questions.
- If only preorder/backorder items, defer final value until the Pre-orders topic flow.

### 10. Shipment Split Threshold

**Question**

Should HotWax avoid splitting small orders unless the shipment value is above a minimum threshold?

**Answer choices**

- No threshold; split whenever routing recommends it
- Use a minimum shipment value
- Not sure yet

**Intent**

Control whether brokering should use a minimum shipment-value threshold before splitting.

**Settings touched**

| Setting | Source | When touched | Value direction |
| --- | --- | --- | --- |
| None confirmed | Product store settings | Minimum shipment value selected | Do not flip a product store setting from this alone |
| `BRK_SHPMNT_THRESHOLD` | Removed product-store setting | Any answer | Do not present; local settings study says no supported runtime owner |

**Follow-up branches**

- If minimum value is selected, ask for the currency amount.
- If no threshold, skip.

### 11. Fulfillment Rejection

**Question**

If a store cannot fulfill an assigned order, what should happen?

**Answer choices**

- Route the order to another location
- Cancel or reject the unavailable items
- Send the order to manual review
- Not sure yet

**Intent**

Understand exception handling for Ship from Store assignments. Some behavior may live outside product store settings, but this question determines whether rejection-related settings matter.

**Settings touched**

| Setting | Source | When touched | Value direction |
| --- | --- | --- | --- |
| `BOPIS_PART_ODR_REJ` | `ProductStoreSetting` | Not touched in Ship from Store unless pickup is also selected | Leave for BOPIS flow |
| `FULFILL_PART_ODR_REJ` | Backend setting not currently in Company guided UI | If cancel/reject unavailable items | Candidate future setting, not currently in create flow |
| `FULFILL_NOTIF` | `ProductStoreSetting` | Not decided by rejection alone | Ask in Shopify notification question |

**Follow-up branches**

- Route elsewhere: confirm brokering/rerouting behavior.
- Cancel/reject items: include advanced exception handling settings if supported.
- Manual review: route to order review/approval topic.

## Settings Covered So Far

| Setting | Covered by topic flow? | Notes |
| --- | --- | --- |
| `enableBrokering` | Yes | Order routing / Ship from Store |
| `reserveInventory` | Yes | Inventory reservation for imported/routed orders |
| `allowSplit` | Yes | Multi-location fulfillment and split behavior |
| `SHOW_SHIPPING_ORDERS` | Candidate | Relevant when stores need HotWax to show online shipping orders |
| `BRK_SHPMNT_THRESHOLD` | No | Removed from product-store settings; no supported runtime owner found |
| `ORD_ITM_SHIP_FAC` | Conditional | Only if Shopify sends a selected ship facility property |
| `PRE_SLCTD_FAC_TAG` | Conditional | Only if Shopify tags/properties preselect facility routing |
| `EX_INV_BY_PRD_TYPE` | Candidate | Only if product-type inventory exclusion matches the warehouse-only-product problem |
| `FULFILL_PART_ODR_REJ` | Candidate | Backend setting exists but is not part of current guided Company UI |
| `BOPIS_PART_ODR_REJ` | No | Leave for BOPIS topic flow |
| `PRE_ORDER_GROUP_ID` | No | Leave for Pre-orders topic flow |
