export type AppPermissionCatalog = {
  appId: string;
  appName: string;
  permissionIds: readonly string[];
};

export type AppPermissionDefinition = {
  permissionId: string;
  description: string;
};

export const appPermissionCatalogs: readonly AppPermissionCatalog[] = [
  {
    appId: "users",
    appName: "Users",
    permissionIds: [
      "USERS_APP_VIEW",
      "USERS_LIST_VIEW",
      "APP_USER_CREATE",
      "APP_UPDT_BLOCK_LOGIN",
      "APP_UPDT_PASSWORD",
      "APP_SECURITY_GROUP_CREATE",
      "APP_PERMISSION_VIEW",
      "APP_PERMISSION_CREATE",
      "APP_PERMISSION_UPDATE",
      "APP_UPDT_PRODUCT_STORE_CONFG",
      "APP_UPDT_FULFILLMENT_FACILITY",
      "APP_UPDT_PICKER_CONFG",
      "APP_SUPER_USER",
      "APP_PWA_STANDALONE_ACCESS"
    ]
  },
  {
    appId: "inventory-count",
    appName: "Inventory Count",
    permissionIds: [
      "INVCOUNT_APP_VIEW",
      "INV_CNT_VIEW_QOH",
      "PREVIEW_COUNT_ITEM",
      "INV_COUNT_PRE_START",
      "INV_COUNT_SUBMIT",
      "INV_COUNT_LOCK_RLS",
      "INV_COUNT_VAR_LOG",
      "INV_COUNT_ADMIN"
    ]
  },
  { appId: "available-to-promise", appName: "Available to Promise", permissionIds: ["ATP_APP_VIEW"] },
  {
    appId: "bopis",
    appName: "BOPIS",
    permissionIds: ["BOPIS_APP_VIEW", "BOPIS_POD_UPDATE", "BOPIS_REQUEST_TRANSFER_UPDATE", "ORD_SALES_ORDER_CNCL", "STOREFULFILLMENT_ADMIN"]
  },
  { appId: "company", appName: "Company", permissionIds: ["COMPANY_APP_VIEW"] },
  { appId: "facilities", appName: "Facilities", permissionIds: ["FACILITIES_APP_VIEW", "APP_COMMERCE_VIEW", "APP_PWA_STANDALONE_ACCESS"] },
  {
    appId: "fulfillment",
    appName: "Fulfillment",
    permissionIds: [
      "FULFILLMENT_APP_VIEW",
      "STOREFULFILLMENT_ADMIN",
      "FF_ORDER_LOOKUP_VIEW",
      "FF_INVOICING_STATUS_VIEW",
      "CARRIER_SETUP_VIEW",
      "FULFILLMENT_VIEW_ALL_PICKERS",
      "ORD_TRANSFER_ORDER_VIEW",
      "ORD_TRANSFER_ORDER_ADMIN",
      "ORD_TRANSFER_ORDER_CANCEL",
      "ORDER_SHIPMENT_METHOD_UPDATE",
      "FF_SHIP_NOW",
      "SF_UNLOCK_ORDER"
    ]
  },
  { appId: "job-manager", appName: "Job Manager", permissionIds: ["JOB_MANAGER_APP_VIEW"] },
  { appId: "launchpad", appName: "Launchpad", permissionIds: ["APP_COMMERCE_VIEW", "APP_FULFILLMENT_VIEW", "APP_LEGACY_FULFILLMENT_VIEW"] },
  {
    appId: "order-manager",
    appName: "Order Manager",
    permissionIds: [
      "ORDERMGR_VIEW",
      "ORDERMGR_CREATE",
      "ORDERMGR_UPDATE",
      "ORDERMGR_RETURN",
      "ORDERMGR_ADMIN",
      "ORD_SALES_ORDER_VIEW",
      "ORD_SALES_ORDER_CREATE",
      "ORD_SALES_ORDER_EDIT",
      "ORD_SALES_ORDER_CNCL",
      "ORD_SALES_ORDER_ADMIN",
      "ORD_SALES_RTN_VIEW",
      "ORD_SALES_RTN_ADMIN",
      "ORD_CRT_EVENT_VIEW",
      "COMM_EVNT_MENU_VIEW",
      "RELATNSHIP_CUSTOMER_VIEW",
      "RELATNSHIP_CUSTOMER_CREATE",
      "RELATNSHIP_CUSTOMER_ADMIN",
      "MOVE_SO_ITEM",
      "PIM_PRODUCT_CREATE",
      "PIM_PRODUCT_ADMIN",
      "STOREFULFILLMENT_ADMIN",
      "COMMERCEUSER_VIEW"
    ]
  },
  { appId: "order-routing", appName: "Order Routing", permissionIds: ["ORDER_ROUTING_APP_VIEW", "ROUTING_TEST_DRIVE_VIEW"] },
  {
    appId: "preorder",
    appName: "Preorder",
    permissionIds: [
      "PREORDER_APP_VIEW",
      "APP_PRODUCTS_VIEW",
      "APP_PRDT_DTLS_VIEW",
      "APP_ORDERS_VIEW",
      "APP_AUDIT_VIEW",
      "APP_AUDIT_PRDT_DTLS_VIEW",
      "APP_INV_CNFG_UPDT",
      "APP_PRODUCT_IDENTIFIER_UPDATE",
      "APP_COMMERCE_VIEW",
      "APP_PWA_STANDALONE_ACCESS"
    ]
  },
  {
    appId: "products",
    appName: "Products",
    permissionIds: [
      "PRODUCTS_APP_VIEW",
      "PIM_PRODUCT_VIEW",
      "PIM_PRODUCT_CREATE",
      "PIM_PRODUCT_ADMIN",
      "PIM_FEATURE_CREATE",
      "PIM_FEATURE_ADMIN"
    ]
  },
  {
    appId: "receiving",
    appName: "Receiving",
    permissionIds: ["RECEIVING_APP_VIEW", "RECEIVING_ADMIN", "APP_SHIPMENTS_VIEW", "FULFILLMENT_APP_VIEW", "FULFILLMENT_LEGACY_APP_VIEW"]
  },
  {
    appId: "reroute-fulfilment",
    appName: "Reroute Fulfilment",
    permissionIds: ["APP_SHPGRP_CNCL", "APP_SHPGRP_DLVRADR_UPDATE", "APP_SHPGRP_DLVRMTHD_UPDATE", "APP_SHPGRP_PCKUP_UPDATE"]
  },
  { appId: "returns", appName: "Returns", permissionIds: [] },
  { appId: "shopify-bopis", appName: "Shopify BOPIS", permissionIds: [] },
  {
    appId: "transfers",
    appName: "Transfers",
    permissionIds: [
      "TRANSFERS_APP_VIEW",
      "APP_BULK_UPLOAD",
      "APP_TFNR_BULK_UPLOAD",
      "APP_DISCREPANCY_REPORT",
      "APP_TFNR_DISCREPANCY_REPORT",
      "APP_PRODUCT_IDENTIFIER_UPDATE",
      "APP_COMMERCE_VIEW",
      "APP_PWA_STANDALONE_ACCESS"
    ]
  }
];
