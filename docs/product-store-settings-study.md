# Product Store Settings Study

## Purpose

The Company app should be the place operators use to stand up an OMS and manage organization-level behavior. For product stores, that means the app should not hide settings simply because they are advanced or obscure. Every setting needs a home.

This study separates:

- Direct `ProductStore` fields edited by Company today.
- `ProductStoreSetting` records backed by `PROD_STR_STNG` enum IDs.
- The broader backend setting universe that is not yet represented in the Company UI.

## Current Company Surface

Company currently manages 24 editable product store values on the detail/setup flows:

- 8 direct `ProductStore` fields.
- 16 `ProductStoreSetting` records.

### Direct ProductStore fields

| Field | Current purpose |
| --- | --- |
| `defaultCurrencyUomId` | Store currency used by pricing, product, and order flows. |
| `orderNumberPrefix` | Prefix added to generated sales order IDs. |
| `autoApproveOrder` | Whether imported or authorized orders can auto-approve. |
| `daysToCancelNonPay` | Days before unpaid/unfulfilled orders are auto-cancelled. |
| `reserveInventory` | Whether inventory reservation is enabled for this store. |
| `enableBrokering` | Whether brokering behavior is enabled for this store. |
| `allowSplit` | Whether preorder/backorder items can split from the full order. |
| `productIdentifierEnumId` | Global product identifier used for Shopify product matching. |

### ProductStoreSetting records managed today

| Setting ID | Current purpose |
| --- | --- |
| `SAVE_BILL_TO_INF` | Save Shopify billing information on imported orders. |
| `RETURN_DEADLINE_DAYS` | Limit how far back orders remain eligible for return creation. |
| `PRE_SLCTD_FAC_TAG` | Shopify order tag that enables preselected facility logic. |
| `ORD_ITM_SHIP_FAC` | Shopify line item property name for selected ship facility. |
| `BRK_SHPMNT_THRESHOLD` | Minimum value before brokering shipment split applies. |
| `FULFILL_NOTIF` | Send fulfillment notifications back to Shopify. |
| `BOPIS_PART_ODR_REJ` | Allow partial rejection of BOPIS orders. |
| `INV_CNT_VIEW_QOH` | Show systemic QOH in inventory count flows. |
| `HOLD_PRORD_PHYCL_INV` | Treat physical preorder inventory as held when preorder queue exists. |
| `PRE_ORDER_GROUP_ID` | Facility group used for multi-channel preorder inventory. |
| `PRDT_IDEN_PREF` | JSON preference for primary and secondary product identifiers. |
| `CUST_DLVRMTHD_UPDATE` | Allow customers to change delivery method in reroute fulfillment. |
| `RF_SHIPPING_METHOD` | Shipping method used by reroute fulfillment. |
| `CUST_DLVRADR_UPDATE` | Allow customers to change delivery address in reroute fulfillment. |
| `CUST_PCKUP_UPDATE` | Allow customers to change pickup location in reroute fulfillment. |
| `CUST_ALLOW_CNCL` | Allow customers to cancel before fulfillment. |

## Backend ProductStoreSetting Universe

Backend data and upgrade files define 44 unique `PROD_STR_STNG` enum IDs:

| Setting ID | Suggested UX home |
| --- | --- |
| `AFFECT_QOH_ON_REJ` | Rejection and exception handling |
| `APPR_WO_PMNT_CHK` | Approval and payment checks |
| `AUTO_REJ_IDLE_ORD` | Rejection and exception handling |
| `BARCODE_IDEN_PREF` | Product identity and scanning |
| `BOPIS_PART_ODR_REJ` | Store pickup / BOPIS |
| `BRK_SHPMNT_THRESHOLD` | Brokering and routing |
| `CAPTURE_PAYMENT_TAG` | Approval and payment checks |
| `CUST_ALLOW_CNCL` | Customer self-service |
| `CUST_DLVRADR_UPDATE` | Customer self-service |
| `CUST_DLVRMTHD_UPDATE` | Customer self-service |
| `CUST_PCKUP_UPDATE` | Customer self-service |
| `DEFAULT_CARRIER` | Shipping and carriers |
| `DEFULT_PKG_BOPIS_ORD` | Store pickup / BOPIS |
| `DISABLE_SHIPNOW` | Fulfillment operations |
| `DISABLE_UNPACK` | Fulfillment operations |
| `DIS_REJ_NOTI_ON_CNCL` | Notifications and Shopify behavior |
| `ENABLE_TRACKING` | Store pickup / BOPIS |
| `EX_INV_BY_PRD_TYPE` | Inventory sync |
| `FF_COLLATERAL_REJ` | Rejection and exception handling |
| `FF_USE_NEW_REJ_API` | Rejection and exception handling |
| `FULFILL_FORCE_SCAN` | Fulfillment operations |
| `FULFILL_NOTIF` | Notifications and Shopify behavior |
| `FULFILL_PART_ODR_REJ` | Fulfillment operations |
| `HOLD_PRORD_PHYCL_INV` | Inventory and preorder |
| `INV_CNT_VIEW_QOH` | Inventory counting |
| `ORD_ITM_PICKUP_FAC` | Brokering and routing |
| `ORD_ITM_SHIP_FAC` | Brokering and routing |
| `ORD_ITM_SHIP_METH` | Brokering and routing |
| `PCKGING_BOX_ALGO` | Packing and documents |
| `PKG_SLIP` | Packing and documents |
| `PRDT_IDEN_PREF` | Product identity |
| `PRE_ORDER_GROUP_ID` | Inventory and preorder |
| `PRE_SLCTD_FAC_TAG` | Brokering and routing |
| `PRINT_PACKING_SLIPS` | Store pickup / BOPIS |
| `PRINT_PICKLISTS` | Store pickup / BOPIS |
| `RATE_SHOPPING` | Shipping and carriers |
| `RECEIVE_FORCE_SCAN` | Receiving operations |
| `REJ_ITM_CC_CRT` | Rejection and exception handling |
| `REL_PREORD_ROUGRP_ID` | Inventory and preorder |
| `RETURN_DEADLINE_DAYS` | Returns |
| `RF_SHIPPING_METHOD` | Customer self-service |
| `RTN_RSTCK_FAC` | Returns |
| `SAVE_BILL_TO_INF` | Order import |
| `SHOW_SHIPPING_ORDERS` | Store pickup / BOPIS |

## UX Direction

The product store settings experience should have two layers.

### Guided operating settings

Common and well-understood settings should be shown as guided sections with labels, explanations, typed controls, and validation.

Candidate sections:

- Store identity and defaults
- Order import and approval
- Returns and cancellation
- Inventory reservation and preorder
- Brokering and routing
- Fulfillment operations
- Store pickup / BOPIS
- Customer self-service / reroute fulfillment
- Shipping and carriers
- Packing, labels, and documents
- Notifications and Shopify behavior
- Rejection and exception handling

### All settings registry

Every backend product store setting should also appear in a searchable registry. This prevents settings from having no home while allowing risky or obscure settings to be marked advanced.

Minimum registry fields:

- Setting ID
- Backend enum name
- Backend description when available
- Category
- Current value
- Value type
- Default value when known
- Guided vs advanced status
- Last updated metadata when available

## Metadata Needed Before Implementation

Create a typed metadata map before changing the UI:

```ts
{
  id: "SAVE_BILL_TO_INF",
  source: "ProductStoreSetting",
  category: "order-import",
  label: "Save billing information",
  valueType: "boolean-y-n",
  defaultValue: "N",
  control: "toggle",
  guided: true,
  description: "Save Shopify billing information on imported orders."
}
```

This metadata should cover all 44 `PROD_STR_STNG` settings plus the direct `ProductStore` fields Company manages.

## Open Questions

- Should direct `ProductStore` fields and `ProductStoreSetting` records be shown together by business area, or should advanced users be able to switch to a source-oriented view?
- Which backend-only settings are safe enough for guided controls in the first Company app pass?
- Should the all-settings registry allow raw string editing for unknown settings, or require metadata before a setting becomes editable?
- Can we expose per-setting audit history from OMS so operators can see who changed critical behavior?
