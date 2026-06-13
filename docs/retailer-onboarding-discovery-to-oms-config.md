# Retailer Onboarding Discovery to OMS Configuration Map

## Scope

This document turns first-time retailer discovery calls into an onboarding model for Product Store setup. The wizard should ask questions the way retailers naturally describe their business, then translate those answers into HotWax OMS configuration.

The scan used:

- Read AI sales/discovery calls where a retailer or partner was describing a first implementation, evaluation, or major new operating model.
- Current Company app surfaces.
- Current Moqui components and PWA apps under the local GitHub workspace.
- Exclusions: legacy-only `hotwax-oms` surfaces and config with no current Moqui/PWA owner.

## Read AI Call Evidence

| Read AI meeting | Retailer language observed | Configuration signal |
| --- | --- | --- |
| `01KSHQPEGG3YWY16GCQ46NH9AC` Capital Hair and Beauty / HotWax | Wants to unlock store inventory for online sales, has about 60 stores, large DC inventory online but more stock trapped in stores, high online order volume, asks whether routing can consolidate or transfer. | Ask store count, order volume, online SKU coverage, store/DC inventory split, hub-store strategy, split tolerance, transfer vs route-to-store behavior. Map to brokering, split, facility groups, routing rules, fulfillment permissions, labels/carrier setup, and job cadence. |
| `01KREFVE0KKXH6D25QF7VQPTK9` Julien x HotWax | Wants preorder before the full ERP/WMS setup, asks whether manual stock or PO imports can work, needs per-location preorder and paid shipping overrides. | Ask PO source, promise-date source, preorder pool scope, product/store/location eligibility, paid shipping priority. Map to preorder product-store settings, routing groups, Shopify product metadata sync, and product-store-scoped jobs. |
| `01KRK722V2NFJ35YCEB3XC5WEC` Subdued first call | Pain is return accounting and inventory valuation by store, especially Shopify POS booking returns to the original store. | Ask whether the pain is configurable OMS behavior or native platform accounting. Map only the supported pieces: return receiving, restock facility, return feed sync, inventory reports, cycle count permissions, and explicit limitations. |
| `01KRH32X3QYZ07CSDM1257G8E5` Tui first call | Partner asks whether HotWax is modular, where it sits in the stack, how ship-to-store appears in NetSuite, and whether inventory management can start small. | Ask implementation package, source of truth, multiple Shopify instances, store/warehouse scope, ship-from-store vs ship-to-store, and phase plan. Map to Shopify shop/ProductStore links, facility groups, inventory sync, transfer jobs, and app permission packages. |
| `01KTBXHCR7F2DCBMT85AJ48NXG` Contax / HotWax | ERP partner frames systems by responsibility: ERP as finance/procurement/receiving, OMS as order lifecycle/fulfillment, files vs APIs, sync cadence. | Ask authoritative system per object: products, inventory, customers, orders, payments, POs, transfers, returns. Map to service job families, SystemMessage remotes, NetSuite/Acumatica mappings, and product-store job parameters. |
| `01KSFVK2QEWK5GC3YE7C2E2GK2` AdCirrus / HotWax | Partner-led Canadian retailer evaluating ERP and HotWax for preorder/allocation across six warehouses. | Ask warehouses, allocation source, container/PO arrival dates, preorder product eligibility, and budget/timeline. Map to preorder settings, routing groups, product sync, and inventory jobs. |
| `01KTRSHGQK4XBTK4SMP6K7XQK9` RFP Discussion | Multi-store, multi-Shopify, cross-entity/cross-border, WMS/TMS, NetSuite, preorders and kits. | Ask entity/shop/store boundaries first. Map to multiple ProductStores, multiple ShopifyShops, shop-to-store links, shipment methods, and integration jobs. |
| `01KRXTXW4QSYZ52C9SZVRRX7RJ` HotWax x Tui deployment practices | Discusses custom Shopify fields, customer/address updates until fulfillment, inventory sync cadence, transfer receipts, commitments, returns/exchanges. | Ask which Shopify custom fields carry operational intent, when customers can edit order details, and which events should sync in near real time. Map to preselected facility settings, customer self-service settings, transfer/return jobs, and permissions. |
| `01JWVBC3WM7SMA8TM6YMCD9DFC` Third Love discovery call | Retailer found HotWax while looking for Shopify POS + NetSuite inventory management. They describe two problems: inventory counts and transfer-order receiving without Excel/NetSuite logins, starting with two stores and growing. | Ask current store count, planned store count, manual workarounds, whether stores need NetSuite access, cycle count flow, transfer receiving flow, and integration replacement scope. Map to receiving/transfers apps, `RECEIVE_FORCE_SCAN`, inventory count permissions, transfer jobs, Shopify/NetSuite jobs, and user/security groups. |
| `01JWV2RFQSK81V6X5G7Q9HN1BR` Scanlan Theodore inventory call | Retailer wants AP21 as back office, but stores need cloud/iPad/Mac-friendly receiving. They ask about initial inventory receiving, COGS, discrepancy history, damages, dry cleaning, consignments, ship-from-store, store transfers, and budget. | Ask back-office system, device/workflow expectations, PO/invoice source, COGS ownership, damage/hold locations, transfer scenarios, ship-from-store status, force scan vs manual quantity, and budget/timeline. Map to receiving settings, facility/location setup, inventory status/location modeling, carrier setup, transfer/fulfillment permissions, and ERP jobs. |
| `01JX2Z4AVXP597K053WHAFR596` ThirdLove inventory management demo | Store associates, scanners, inventory adjustments, transfer discrepancies, cycle counts, Shopify catalog import, and role permissions are the decision points. | Ask scanner requirement, discrepancy policy, count types, product identifier source, who can adjust/count/receive, and product import scope. Map to barcode/product identifier settings, inventory count permissions, receiving permissions, and product sync jobs. |
| `01JVSZNS0BWHYRZD3A4ZHMEY98` BOPIS UI review | Checkout shipping options, pickup-only carts, 3PL interaction, fulfillment location logic, and customer-facing pickup experience dominate the conversation. | Ask whether BOPIS should appear with shipping methods, what shipping methods qualify, whether pickup-only carts suppress shipping rates, and what customer pickup changes are allowed. Map to BOPIS settings, shipping method mappings, delivery-rate config, and BOPIS permissions. |

## Discovery Shape

Retailers rarely begin with configuration names. They describe:

- Business footprint: stores, warehouses, countries, channels, order volume, SKUs, growth plans.
- Current manual work: Excel sheets, NetSuite logins, store calls, manual labels, manual returns, manual inventory uploads.
- System ownership: Shopify, Shopify POS, NetSuite, AP21, Acumatica, WMS, 3PL, TMS, carrier, returns platform, Klaviyo.
- Operational tolerance: whether to split, reroute, reject, hold, transfer, cancel, reserve, force scan, or manually review.
- Store role expectations: associate, manager, inventory team, customer service, routing admin, system admin.

The onboarding wizard should therefore start with business questions, not tables. The last screen can show the generated configuration package.

## Discovery Question Backbone

| Wizard area | Retailer-facing question | Why it matters | Configuration direction |
| --- | --- | --- | --- |
| Fit and scope | What are you trying to improve first: routing, ship from store, BOPIS, store inventory, preorder, returns, or integrations? | Controls which sections are relevant. | Enables only the relevant setting, permission, mapping, and job groups. |
| Business scale | How many stores, warehouses, Shopify shops, countries, and monthly online orders are in scope now and later? | Determines rollout size and whether one ProductStore is enough. | ProductStore records, ShopifyShop records, facility groups, security groups, service-job scope. |
| Source of truth | Which system owns products, prices, inventory, customers, orders, payments, POs, transfers, returns, and labels? | Prevents bad config caused by duplicate ownership. | Shopify/ERP/OMS mappings, SystemMessage remotes, service job families, data feed direction. |
| Inventory exposure | Which inventory should be sellable online: DC only, stores only, selected stores, hubs, all stores, safety-stocked stores, or preorder inventory? | Drives brokering and inventory logic. | `checkInventory`, `reserveInventory`, `enableBrokering`, `allowSplit`, facility groups, routing groups, ATP/rule jobs. |
| Fulfillment flow | Can stores ship online orders, receive transfers, initiate transfers, print labels, and reject partial orders? | Defines store app package and exception handling. | Fulfillment, BOPIS, receiving, transfer permissions; scan settings; label/carrier config. |
| Pickup flow | Is pickup store-local only, website-visible inventory, ship-to-store, BOPIS with shipping methods, or pickup-only checkout? | Separates Shopify checkout behavior from OMS pickup operations. | BOPIS settings, shipping method mappings, delivery-rate config, pickup permissions, facility mappings. |
| Preorder flow | Are preorders based on product tags, POs, locations, warehouses, arrival dates, paid shipping, or manual inventory? | Preorder is usually a workflow before it is a setting. | Preorder settings, preorder routing group, release routing group, product sync, PO/inventory jobs. |
| Returns and cancellation | Where should returns restock, who receives them, can customers cancel or change pickup/address/method, and should return feeds sync to ERP? | Avoids mapping unsupported platform-accounting asks to settings. | Return settings, customer self-service settings, receiving permissions, return lifecycle jobs. |
| Product identity | What do stores scan and what does Shopify/ERP use: SKU, UPC, barcode, Shopify product ID, variant ID, style/color/size? | Controls matching and app scanning. | `productIdentifierEnumId`, `PRDT_IDEN_PREF`, `BARCODE_IDEN_PREF`, Shopify product type/product sync mappings. |
| Jobs and cadence | Which syncs must be real time, scheduled, manually run, per shop, or per product store? | Most integrations become job parameters and schedules. | ServiceJob active flags, cron, `productStoreIds`, shop IDs, remotes, data documents. |
| Roles | Which roles exist and which apps/actions should each role see? | Permissions are onboarding output, not a separate admin afterthought. | Security groups and app/action permissions. |

## Question to Configuration Matrix

| Retailer answer pattern | ProductStore fields | ProductStoreSetting IDs | Permissions | Shopify and adjacent config | Service-job families |
| --- | --- | --- | --- | --- | --- |
| One brand/storefront with normal Shopify import | `productStoreId`, `storeName`, `defaultCurrencyUomId`, `defaultSalesChannelEnumId`, `orderNumberPrefix`, `productIdentifierEnumId` | `SAVE_BILL_TO_INF`, `APPR_WO_PMNT_CHK`, `CAPTURE_PAYMENT_TAG`, `AUTO_ACPT_RISK_REC` | `COMPANY_APP_VIEW`, `APP_UPDT_PRODUCT_STORE_CONFG`, `COMMERCEUSER_VIEW` | `ShopifyShop.productStoreId`, `SHOPIFY_ORDER_SOURCE`, `SHOPIFY_PAYMENT_TYPE`, `SHOPIFY_PRODUCT_TYPE` | Shopify order import/history, customer/payment/order feeds |
| Stores should fulfill online orders | `enableBrokering`, `allowSplit`, `reserveInventory`, `checkInventory`, `requireInventory`, `inventoryFacilityId` | `PRE_SLCTD_FAC_TAG`, `ORD_ITM_SHIP_FAC`, `ORD_ITM_SHIP_METH`, `FULFILL_NOTIF`, `FULFILL_FORCE_SCAN`, `FULFILL_PART_ODR_REJ`, `AFFECT_QOH_ON_REJ`, `REJ_ITM_CC_CRT`, `FF_COLLATERAL_REJ` | `STOREFULFILLMENT_ADMIN`, `FULFILLMENT_APP_VIEW`, `FF_ORDER_LOOKUP_VIEW`, `FF_SHIP_NOW`, `SF_UNLOCK_ORDER`, `FULFILLMENT_VIEW_ALL_PICKERS`, `ORDER_SHIPMENT_METHOD_UPDATE` | Carrier mappings, `ShipmentGatewayConfig`, ShipHawk/FedEx/UPS/Unigate config, Shopify locations | Routing jobs, fulfillment feeds, carrier/label jobs, Shopify fulfillment ack jobs |
| Pickup/BOPIS is important | `enableBrokering`, `reserveInventory`, `checkInventory` | `BOPIS_PART_ODR_REJ`, `DEFULT_PKG_BOPIS_ORD`, `SHOW_SHIPPING_ORDERS`, `PRINT_PACKING_SLIPS`, `PRINT_PICKLISTS`, `ENABLE_TRACKING`, `HANDOVER_PROOF`, `BOPIS_SHIP_MTHDS`, `ORD_ITM_PICKUP_FAC` | `BOPIS_APP_VIEW`, `BOPIS_POD_UPDATE`, `BOPIS_REQUEST_TRANSFER_UPDATE`, `ORD_SALES_ORDER_CNCL`, `STOREFULFILLMENT_ADMIN` | Shopify location mapping, shipping-rate/delivery-rate config, pickup shipping methods | Fulfillment order imports, BOPIS/fulfillment sync, delivery-rate jobs if configured |
| Store inventory management without NetSuite/ERP logins | `productIdentifierEnumId`, `inventoryFacilityId`, `oneInventoryFacility`, `reserveInventory` | `RECEIVE_FORCE_SCAN`, `BARCODE_IDEN_PREF`, `PRDT_IDEN_PREF`, `RECEIVE_BY_FULFILL`, `EX_INV_BY_PRD_TYPE` | `RECEIVING_APP_VIEW`, `RECEIVING_ADMIN`, `TRANSFERS_APP_VIEW`, `ORD_TRANSFER_ORDER_VIEW`, `ORD_TRANSFER_ORDER_ADMIN`, `APP_BULK_UPLOAD`, `APP_DISCREPANCY_REPORT`, `INVCOUNT_APP_VIEW`, `INV_COUNT_ADMIN`, `INV_COUNT_SUBMIT`, `INV_COUNT_VAR_LOG`, `INV_CNT_VIEW_QOH` | Facility mappings, facility IDs, facility locations, Shopify POS embedding, product image/catalog import | Transfer-order jobs, item receipt jobs, inventory variance jobs, cycle count import/export jobs |
| Preorder/backorder | `reserveInventory`, `allowSplit`, `productIdentifierEnumId`, `requireInventory`, `requirementMethodEnumId` | `HOLD_PRORD_PHYCL_INV`, `PRE_ORDER_GROUP_ID`, `REL_PREORD_ROUGRP_ID`, `EX_INV_BY_PRD_TYPE`, `PROD_CAT_ATTR`, `UPDATE_PRODUCT_TYPE` | `PREORDER_APP_VIEW`, `APP_PRODUCTS_VIEW`, `APP_PRDT_DTLS_VIEW`, `APP_INV_CNFG_UPDT`, `APP_PRODUCT_IDENTIFIER_UPDATE`, `MERCHANDISING_ADMIN` | Shopify product tags, product type mappings, product identifiers, PO/arrival-date import | Shopify product sync, preorder routing jobs, product metafield/tag jobs, PO/inventory jobs |
| Customer can change or cancel before fulfillment | `headerCancelStatus`, `itemCancelStatus`, `daysToCancelNonPay` | `CUST_ALLOW_CNCL`, `CUST_DLVRADR_UPDATE`, `CUST_DLVRMTHD_UPDATE`, `CUST_PCKUP_UPDATE`, `RF_SHIPPING_METHOD` | `APP_SHPGRP_CNCL`, `APP_SHPGRP_DLVRADR_UPDATE`, `APP_SHPGRP_DLVRMTHD_UPDATE`, `APP_SHPGRP_PCKUP_UPDATE` | Reroute fulfillment app config, shipping method mapping | Order update jobs, fulfillment-order refresh, customer service workflows |
| Returns and return accounting | `reqReturnInventoryReceive`, `daysToCancelNonPay`, status fields | `RETURN_DEADLINE_DAYS`, `RTN_RSTCK_FAC`, `NS_RTN_FEED_SYNC`, `AUTO_REJ_IDLE_ORD` | `RECEIVING_ADMIN`, `ORD_SALES_ORDER_CNCL`, inventory count permissions as needed | Returns platform mappings, Shopify return IDs/reasons, ERP return feeds | Return transaction/item receipt jobs, return/appeasement feed jobs |
| Multi-shop or multi-entity | `productStoreId`, `primaryStoreGroupId`, `defaultCurrencyUomId`, `defaultLocaleString`, `defaultTimeZoneString`, `payToPartyId` | Depends on selected operating flows | App package per role/entity | Multiple `ShopifyShop` rows, `ShopifyShopLocation`, `ShopifyShopTypeMapping`, ProductStore email settings, Klaviyo, carrier, Unigate/FedEx | Product-store-scoped service jobs via `productStoreIds`, shop-scoped jobs via `shopId` |

## ProductStore Field Inventory

Current Company detail code exposes these direct fields. The wizard should not ask every field directly; many should be derived, defaulted, or kept in an advanced review step.

| Area | Fields |
| --- | --- |
| Store identity and defaults | `productStoreId`, `primaryStoreGroupId`, `storeName`, `companyName`, `title`, `subtitle`, `payToPartyId`, `visualThemeId`, `defaultLocaleString`, `defaultTimeZoneString` |
| Order import and checkout | `orderNumberPrefix`, `defaultCurrencyUomId`, `defaultSalesChannelEnumId`, `viewCartOnAdd`, `autoSaveCart`, `allowPassword`, `defaultPassword`, `usePrimaryEmailUsername`, `requireCustomerRole`, `retryFailedAuths`, `allowComment`, `orderDecimalQuantity` |
| Approval, payment, accounting | `manualAuthIsCapture`, `autoApproveOrder`, `autoApproveInvoice`, `shipIfCaptureFails`, `checkGcBalance`, `selectPaymentTypePerItem`, `splitPayPrefPerShpGrp`, `storeCreditAccountEnumId`, `storeCreditValidDays` |
| Inventory and products | `inventoryFacilityId`, `oneInventoryFacility`, `checkInventory`, `reserveInventory`, `reserveOrderEnumId`, `requireInventory`, `balanceResOnOrderCreation`, `requirementMethodEnumId`, `isImmediatelyFulfilled`, `explodeOrderItems`, `prodSearchExcludeVariants`, `showOutOfStockProducts`, `managedByLot`, `setOwnerUponIssuance`, `productIdentifierEnumId` |
| Digital, tax, returns | `autoInvoiceDigitalItems`, `reqShipAddrForDigItems`, `showCheckoutGiftOptions`, `showPricesWithVatTax`, `showTaxIsExempt`, `vatTaxAuthGeoId`, `vatTaxAuthPartyId`, `reqReturnInventoryReceive`, `daysToCancelNonPay` |
| Customer suggestion and uploads | `enableAutoSuggestionList`, `enableDigProdUpload`, `digProdUploadCategoryId` |
| Status and authorization messaging | `headerApprovedStatus`, `itemApprovedStatus`, `digitalItemApprovedStatus`, `headerDeclinedStatus`, `itemDeclinedStatus`, `headerCancelStatus`, `itemCancelStatus`, `authDeclinedMessage`, `authFraudMessage`, `authErrorMessage` |
| Auto-order retries | `autoOrderCcTryExp`, `autoOrderCcTryOtherCards`, `autoOrderCcTryLaterNsf`, `autoOrderCcTryLaterMax` |
| Legacy storefront fields | `oldStyleSheet`, `oldHeaderLogo`, `oldHeaderMiddleBackground`, `oldHeaderRightBackground` |

## ProductStoreSetting Inventory

These IDs were found outside `hotwax-oms` in current Moqui/PWA/component roots. The wizard should split them into guided, advanced, and excluded/replacement buckets.

### Guided and Current

| Area | Setting IDs |
| --- | --- |
| Order import and approval | `SAVE_BILL_TO_INF`, `APPR_WO_PMNT_CHK`, `CAPTURE_PAYMENT_TAG`, `AUTO_ACPT_RISK_REC` |
| Returns and cancellation | `RETURN_DEADLINE_DAYS`, `RTN_RSTCK_FAC`, `AUTO_REJ_IDLE_ORD`, `NS_RTN_FEED_SYNC` |
| Inventory and preorder | `HOLD_PRORD_PHYCL_INV`, `PRE_ORDER_GROUP_ID`, `REL_PREORD_ROUGRP_ID`, `EX_INV_BY_PRD_TYPE`, `PROD_CAT_ATTR`, `UPDATE_PRODUCT_TYPE` |
| Brokering and preselected routing | `PRE_SLCTD_FAC_TAG`, `ORD_ITM_PICKUP_FAC`, `ORD_ITM_SHIP_FAC`, `ORD_ITM_SHIP_METH` |
| Fulfillment operations | `FULFILL_NOTIF`, `FULFILL_FORCE_SCAN`, `FULFILL_PART_ODR_REJ`, `AFFECT_QOH_ON_REJ`, `REJ_ITM_CC_CRT`, `FF_COLLATERAL_REJ` |
| Store pickup and BOPIS | `BOPIS_PART_ODR_REJ`, `DEFULT_PKG_BOPIS_ORD`, `SHOW_SHIPPING_ORDERS`, `PRINT_PACKING_SLIPS`, `PRINT_PICKLISTS`, `ENABLE_TRACKING`, `HANDOVER_PROOF`, `BOPIS_SHIP_MTHDS` |
| Receiving and scanning | `RECEIVE_FORCE_SCAN`, `RECEIVE_BY_FULFILL`, `PRDT_IDEN_PREF`, `BARCODE_IDEN_PREF` |
| Customer self-service / reroute fulfillment | `CUST_ALLOW_CNCL`, `CUST_DLVRADR_UPDATE`, `CUST_DLVRMTHD_UPDATE`, `CUST_PCKUP_UPDATE`, `RF_SHIPPING_METHOD` |
| Shipping and carriers | `RATE_SHOPPING` |

### Keep Out of Guided Wizard Unless a Current Runtime Owner Is Confirmed

| Setting ID | Reason |
| --- | --- |
| `BRK_SHPMNT_THRESHOLD` | Found in non-`hotwax-oms` seed data, but previous Company notes found no supported runtime owner. Treat as excluded until code ownership is proven. |
| `DEFAULT_CARRIER` | Legacy carrier fallback path; prefer explicit carrier/shipment mappings. |
| `PCKGING_BOX_ALGO` | Legacy packing-box algorithm path. |
| `FF_USE_NEW_REJ_API` | Replacement/cleanup candidate. |
| `DISABLE_UNPACK` | Should become an action permission if still needed. |
| `DISABLE_SHIPNOW` | Should become an action permission; current fulfillment still references it, so migration must be deliberate. |
| `DIS_REJ_NOTI_ON_CNCL` | Should be backend behavior, not a retailer-facing onboarding question. |
| `INV_CNT_VIEW_QOH` | Keep as an inventory-count permission; do not present as a ProductStoreSetting. |

## Ionic Permission Inventory

The wizard should emit security-group recommendations based on selected workflows. These are the permission IDs found in current Ionic/PWA surfaces and adjacent current Moqui screens.

| Permission group | Permission IDs |
| --- | --- |
| Base and admin | `COMMERCEUSER_VIEW`, `COMMON_ADMIN`, `APP_PWA_STANDALONE_ACCESS`, `APP_SUPER_USER`, `WEBTOOLS_VIEW` |
| App access | `COMPANY_APP_VIEW`, `APP_COMMERCE_VIEW`, `ORDERMGR_VIEW`, `ORDER_ROUTING_APP_VIEW`, `JOB_MANAGER_APP_VIEW`, `SERVICE_JOB_VIEW`, `BOPIS_APP_VIEW`, `FULFILLMENT_APP_VIEW`, `FULFILLMENT_LEGACY_APP_VIEW`, `APP_FULFILLMENT_VIEW`, `APP_LEGACY_FULFILLMENT_VIEW`, `RECEIVING_APP_VIEW`, `APP_SHIPMENTS_VIEW`, `INVCOUNT_APP_VIEW`, `PREORDER_APP_VIEW`, `FACILITIES_APP_VIEW`, `TRANSFERS_APP_VIEW`, `USERS_APP_VIEW`, `USERS_LIST_VIEW`, `APP_USERS_LIST_VIEW`, `ATP_APP_VIEW`, `APP_ORDERS_VIEW`, `APP_PRODUCTS_VIEW`, `APP_PRDT_DTLS_VIEW`, `APP_AUDIT_VIEW`, `APP_AUDIT_PRDT_DTLS_VIEW` |
| Product store and product setup | `APP_UPDT_PRODUCT_STORE_CONFG`, `APP_INV_CNFG_UPDT`, `APP_PRODUCT_IDENTIFIER_UPDATE`, `APP_UPDT_FULFILLMENT_FACILITY`, `APP_PRODUCTS_VIEW`, `APP_PRDT_DTLS_VIEW`, `MERCHANDISING_ADMIN` |
| Fulfillment | `STOREFULFILLMENT_ADMIN`, `FF_ORDER_LOOKUP_VIEW`, `FF_SHIP_NOW`, `SF_UNLOCK_ORDER`, `FULFILLMENT_VIEW_ALL_PICKERS`, `ORDER_SHIPMENT_METHOD_UPDATE`, `FF_INVOICING_STATUS_VIEW`, `CARRIER_SETUP_VIEW` |
| BOPIS and pickup | `BOPIS_POD_UPDATE`, `BOPIS_REQUEST_TRANSFER_UPDATE`, `ORD_SALES_ORDER_CNCL`, `BOPIS_APP_VIEW` |
| Receiving, transfers, and inventory counts | `RECEIVING_ADMIN`, `ORD_TRANSFER_ORDER_VIEW`, `ORD_TRANSFER_ORDER_ADMIN`, `ORD_TRANSFER_ORDER_CANCEL`, `APP_BULK_UPLOAD`, `APP_TFNR_BULK_UPLOAD`, `APP_DISCREPANCY_REPORT`, `APP_TFNR_DISCREPANCY_REPORT`, `INV_COUNT_ADMIN`, `INV_COUNT_LOCK_RLS`, `INV_COUNT_PRE_START`, `INV_COUNT_SUBMIT`, `INV_COUNT_VAR_LOG`, `INV_CNT_VIEW_QOH`, `PREVIEW_COUNT_ITEM` |
| Customer self-service / reroute fulfillment | `APP_SHPGRP_CNCL`, `APP_SHPGRP_DLVRADR_UPDATE`, `APP_SHPGRP_DLVRMTHD_UPDATE`, `APP_SHPGRP_PCKUP_UPDATE`, `CUST_ALLOW_CNCL`, `CUST_DLVRADR_UPDATE`, `CUST_DLVRMTHD_UPDATE`, `CUST_PCKUP_UPDATE` |
| Routing administration | `ROUTING_TEST_DRIVE_VIEW`, `DELETE_ORDER_ROUTE` |
| User and security administration | `APP_USER_CREATE`, `APP_USER_PROFILE_UPDATE`, `APP_USER_STATUS_UPDATE`, `APP_USER_CONTACT_CREATE`, `APP_USER_CONTACT_UPDATE`, `APP_USER_CONTACT_DELETE`, `APP_SECURITY_GROUP_CREATE`, `APP_SECURITY_GROUP_ASSIGNMENT`, `APP_PERMISSION_CREATE`, `APP_PERMISSION_UPDATE`, `APP_PERMISSION_VIEW`, `APP_UPDT_BLOCK_LOGIN`, `APP_UPDT_PASSWORD`, `APP_UPDT_PICKER_CONFG` |

## Shopify and Adjacent Configuration

Retailers talk about Shopify in business terms: locations, payment names, product types, channels, shipping labels, pickup rates, and POS staff access. The onboarding wizard should ask those terms and map them to these current surfaces:

| Retailer-facing topic | Current config surface |
| --- | --- |
| Which Shopify shop belongs to this ProductStore? | `ShopifyShop.productStoreId`, `shopId`, `shopifyShopId`, `myshopifyDomain`, SystemMessageRemote credentials |
| Which Shopify location maps to which OMS facility? | `ShopifyShopLocation` via `shopId`, `facilityId`, `shopifyLocationId` |
| Which Shopify product type maps to which OMS product type? | `ShopifyShopTypeMapping` with `mappedTypeId = SHOPIFY_PRODUCT_TYPE` |
| Which Shopify sales channel/order source maps to OMS sales channel? | `ShopifyShopTypeMapping` with `mappedTypeId = SHOPIFY_ORDER_SOURCE` |
| Which Shopify payment method maps to OMS payment method? | `ShopifyShopTypeMapping` with `mappedTypeId = SHOPIFY_PAYMENT_TYPE` |
| Which Shopify shipping method name maps to carrier + shipment method? | Shopify carrier shipment mapping via `shopId`, `carrierPartyId`, `shipmentMethodTypeId`, `shopifyShippingMethod` |
| Which ERP department/location code maps to a facility? | Facility identification such as `ORDR_ORGN_DPT` |
| Which product-store email events should go to Klaviyo? | `ProductStoreEmailSetting`, Klaviyo connection settings |
| Which carrier/label systems are needed? | `ShipmentGatewayConfig`, carrier parties, ShipHawk/FedEx/UPS/Unigate config |
| Which sync job belongs to which shop/store? | Service job parameters `shopId`, `shopifyShopId`, `productStoreIds`, `shopifyProductIdentifier` |

## Service Job Inventory

The onboarding wizard should not show 100+ jobs as a raw checklist. It should ask sync ownership and cadence, then create or recommend a job bundle. Current bounded scan found these job families outside `hotwax-oms`.

| Job family | Job IDs found |
| --- | --- |
| Shopify order ingest and order queries | `consume_ShopifyOrders_SQS`, `queue_NewOrderIdsFeed`, `queue_UpdatedOrderIdsFeed`, `queue_UpdatedAgreementOrderIdsFeed`, `queue_OrderIdsByTagFeed`, `queue_ReturnedOrderIdsFeed`, `queue_AppeasementIdsFeed`, `queue_ShopifyOrderSync`, `sync_ShopifyOrderHistory`, `queue_BulkQuerySystemMessage_BulkOrderHeadersQuery`, `queue_BulkQuerySystemMessage_BulkOrderItemsQuery`, `queue_BulkQuerySystemMessage_BulkOrderCustomAttributesQuery`, `queue_BulkQuerySystemMessage_BulkOrderDiscountCodeApplQuery`, `queue_BulkQuerySystemMessage_BulkOrderMetafieldsQuery`, `queue_BulkQuerySystemMessage_BulkCanceledOrdersAndItemsQuery` |
| Shopify fulfillment and return feeds | `queue_FulfillmentOrderIdsFeed`, `queue_FulfillmentOrdersFeedFromShopify`, `generate_OMSFulfillmentFeed_Shopify`, `sendShopifyFulfillmentAckFeed`, `poll_SystemMessageFileSftp_OMSFulfillmentFeed`, `poll_SystemMessageSftp_OMSFulfillmentFeed`, `poll_SystemMessageFileSftp_ShopifyFulfillmentAckFeed`, `poll_SystemMessageFileSftp_OMSSyncedRefundsFeed`, `poll_SystemMessageFileSftp_ReturnsAndAppeasementsFeed`, `poll_SystemMessageFileSftp_ReturnsAndExchangeFeed`, `poll_SystemMessageFileSftp_ShopifyOrderCancelUpdatesFeed` |
| Shopify product and catalog sync | `IMP_SHPY_PRD_IDS`, `queue_CreatedProductIdsFeed`, `queue_UpdatedProductIdsFeed`, `queue_BulkQuerySystemMessage_BulkProductAndVariantsById`, `queue_BulkQuerySystemMessage_BulkProductAndVariantsByIdQuery`, `queue_BulkQuerySystemMessage_BulkProductMetaFieldByTagsQuery`, `queue_BulkQuerySystemMessage_BulkVariantsMetafieldQuery`, `queue_BulkQuerySystemMessage_BulkVariantsMetafieldQueryt`, `consume_ShopifyProductDelete_SQS`, `sync_ShopifyProductUpdates`, `resetShopifyInventoryQoh`, `poll_SystemMessageFileSftp_NewProductsFeed`, `poll_SystemMessageFileSftp_ProductUpdatesFeed`, `poll_SystemMessageFileSftp_ProductVariantsFeed`, `poll_SystemMessageFileSftp_ProductTagsFeed`, `poll_SystemMessageFileSftp_ProductMetaFieldQueryResult`, `poll_SystemMessageFileSftp_BulkProductMetaFieldQueryResult`, `poll_SystemMessageFileSftp_ShopifyNewProductsFeed`, `poll_SystemMessageFileSftp_ShopifyUpdateProductsFeed`, `poll_SystemMessageFileSftp_ShopifyChildCatalogUpdatesFeed` |
| Shopify bulk operation transport | `poll_BulkOperationResult_ShopifyBulkImport`, `poll_BulkOperationResult_ShopifyBulkQuery`, `poll_ShopifyBulkOperationResult`, `send_ProducedBulkMutationSystemMessage_ShopifyBulkImport`, `send_ProducedBulkOperationSystemMessage_ShopifyBulkImport`, `send_ProducedBulkOperationSystemMessage_ShopifyBulkQuery`, `send_BulkProductAndVariantsByIdQueryProducedSystemMessages`, `poll_SystemMessageFileSftp_BulkFulfillmentOrderQuery`, `poll_SystemMessageFileSftp_BulkProductMetaFieldQueryResult`, `consume_AllReceivedSystemMessages_frequent`, `consume_AllReceivedSystemMessages_oms`, `purge_OldSystemMessages` |
| NetSuite order, customer, payment, fulfillment, and return sync | `generate_CreateOrderFeed`, `generate_CreateOrderFeed_pos`, `generate_CustomerFeed`, `generate_CustomerDepositFeed`, `generate_FulfilledOrderItemsFeed_Netsuite`, `generate_BrokeredOrderItemsFeed_Netsuite`, `sync_NetSuiteItemReceipts`, `sync_NetSuiteReturnTransactions`, `poll_fulfilledItemsNetsuiteToHotwax` |
| NetSuite / HC restlet and CSV jobs | `HC_MR_CreateCustomerDeposit`, `HC_MR_ExportedCashSaleCSV`, `HC_MR_ExportedCustomerCSV`, `HC_MR_ExportedInventoryAdjustmentCSV`, `HC_MR_ExportedInventoryTransferCSV`, `HC_MR_ExportedSalesOrderCSV`, `HC_MR_ExportedSalesOrderFulfillmentCSV`, `HC_MR_ExportedSalesOrderItemCSV`, `HC_MR_ExportedStoreTOFulfillmentJson_v2`, `HC_MR_ExportedStoretoStoreTOJson_v2`, `HC_MR_ExportedStoretoWhTOJson_v2`, `HC_MR_ExportedWHTOFulfillmentJson_v2`, `HC_MR_ExportedWhtoStoreTOJson_v2`, `HC_SC_CreateCustomerDeposit`, `HC_SC_CreateCustomerDepositAndRefund`, `HC_SC_CreateItemFulfillment`, `HC_SC_CreateSalesOrderInvoice`, `HC_SC_GenerateProductCSV`, `HC_SC_ImportCashSale`, `HC_SC_ImportCustomer`, `HC_SC_ImportInventoryAdjustment`, `HC_SC_ImportInventoryTransfer`, `HC_SC_ImportTOFulfillmentReceipts_v2`, `HC_SC_ImportTOItemFulfillment_v2`, `HC_SC_UpdateSalesOrders`, `HC_SC_UpdateTransferOrders`, `HC_SC_UploadProductCSV`, `HC_generateCSV_InventoryItems`, `HC_importSalesOrders`, `HC_uploadCSV_InventoryItems` |
| Inventory, transfer, receiving, and variance | `import_store_inventory_from_NS`, `Generate_Inventory_Var_Feed`, `Import_Cycle_Count_Ext_NS`, `generate_TransferOrderItemsFeed`, `generate_TransferOrderReconciliationFeed`, `generate_TransferOrderShipmentFeed`, `generate_TransferOrderShipmentReceiptFeed`, `Generate_TO_Item_Closure_Feed`, `Generate_TransferOrder_MisShipped_Rcpt_Feed`, `Generate_Transfer_Order_Sync_Ack_Feed`, `bulkApprove_StoreFulfillTransferOrders`, `bulkApprove_WarehouseTransferOrders`, `reconcile_TransferOrderReceipts`, `poll_SystemMessageFileSftp_TransferOrder`, `poll_SystemMessageFileSftp_Store_TO_Fulfillment`, `poll_SystemMessageFileSftp_Wh_TO_Fulfillment`, `migrate_sales_shipment` |
| Routing and ATP/rule maintenance | `Order_Routing_MORNING_ORDER_GROUP`, `Order_Routing_Group_MORNING_ORDER_GROUP`, `Order_Routing_Group_PRE_ORDER_GROUP`, `Order_Routing_Group_RE_BROKERING_GROUP`, `clean_Routing_Runs`, `clean_Rule_Group_Runs` |
| Migration/admin/background | `migrate_legacy_fulfillment_permissions`, `process_ADP_PendingWorkerHistory` |

One scanner hit, `%queue_BulkQuerySystemMessage_BulkProductAndVariantsById%`, is a template placeholder and should not be shown as a job.

## Wizard Output Model

The final onboarding output should be a configuration package with:

- ProductStore field changes.
- ProductStoreSetting records with values and defaults.
- Security-group recommendations by role.
- Shopify shop, location, type, payment, channel, and shipping mappings.
- Service job bundle with active flag, cron, `shopId`, `productStoreIds`, and identifier parameters.
- Integration checklist for ERP/WMS/TMS/Klaviyo/Unigate/FedEx/ShipHawk.
- Explicit non-configurable limitations when the retailer is asking for native Shopify POS accounting/reporting behavior HotWax cannot change.

## Implementation Notes

- Start with multi-select solution interest, then branch. Do not show unrelated settings.
- Keep retailer language in the questions and reserve IDs for the review screen.
- Ask for workflow ownership before asking for schedules or mappings.
- Treat roles as part of setup: store associate, store manager, inventory manager, customer service, routing admin, integration admin, system admin.
- Support "not sure yet" answers by recording a pending recommendation instead of forcing a setting.
- Do not expose deprecated/replacement ProductStoreSetting IDs as normal wizard controls.
- Validate setting-like keys such as `SHOPIFY_OIG_CHECK`, `SHP_RATE_QUERY_DATE`, and `PICK_LST_PROD_IDENT` before showing them as ProductStoreSettings; they were seen as references, not confirmed guided enum settings in this pass.
