export type SetupWorkflowId =
  | "shopify"
  | "shipFromStore"
  | "bopis"
  | "storeInventory"
  | "preorder"
  | "returns"
  | "erp"
  | "klaviyo"
  | "carrier";

export type SetupRoleId =
  | "storeAssociate"
  | "storeManager"
  | "inventoryManager"
  | "customerService"
  | "routingAdmin"
  | "integrationAdmin"
  | "systemAdmin";

export type SetupAnswers = {
  companyName: string;
  productStoreName: string;
  storeCount: number;
  warehouseCount: number;
  shopifyShopCount: number;
  monthlyOrderVolume: string;
  selectedWorkflows: SetupWorkflowId[];
  selectedRoles: SetupRoleId[];
  sourceOfTruth: Record<string, string>;
  productIdentifier: string;
  wantsAutomaticZoomOut: boolean;
};

export type SetupWorkflow = {
  id: SetupWorkflowId;
  label: string;
  question: string;
  agentPrompt: string;
  productStoreFields: string[];
  productStoreSettings: string[];
  permissions: string[];
  shopifyConfig: string[];
  serviceJobs: string[];
  docs: SetupDocumentationLink[];
};

export type SetupRoleBundle = {
  id: SetupRoleId;
  label: string;
  permissions: string[];
};

export type SetupDocumentationLink = {
  label: string;
  href: string;
};

export type SetupSnapshot = {
  mode: "live" | "cold-start";
  productStores: any[];
  facilities: any[];
  facilityGroups: any[];
  shopifyShops: any[];
  serviceJobs: any[];
  systemMessageRemotes: any[];
};

export type SetupPackage = {
  productStoreFields: string[];
  productStoreSettings: string[];
  permissions: string[];
  shopifyConfig: string[];
  serviceJobs: string[];
  docs: SetupDocumentationLink[];
  limitations: string[];
};

export type SetupMapNode = {
  id: string;
  label: string;
  caption: string;
  state: "ready" | "draft" | "missing" | "review";
  tags: string[];
};

export const workflowOptions: SetupWorkflow[] = [
  {
    id: "shopify",
    label: "Shopify launch",
    question: "Do you want HotWax to connect to Shopify first?",
    agentPrompt: "I need to learn which Shopify shops, locations, order sources, payment names, shipping methods, and product identifiers should map into OMS.",
    productStoreFields: ["productStoreId", "storeName", "defaultCurrencyUomId", "defaultSalesChannelEnumId", "orderNumberPrefix", "productIdentifierEnumId"],
    productStoreSettings: ["SAVE_BILL_TO_INF", "APPR_WO_PMNT_CHK", "CAPTURE_PAYMENT_TAG", "AUTO_ACPT_RISK_REC"],
    permissions: ["COMPANY_APP_VIEW", "APP_UPDT_PRODUCT_STORE_CONFG", "COMMERCEUSER_VIEW"],
    shopifyConfig: ["ShopifyShop.productStoreId", "SystemMessageRemote", "SHOPIFY_ORDER_SOURCE", "SHOPIFY_PAYMENT_TYPE", "SHOPIFY_PRODUCT_TYPE", "ShopifyShopLocation"],
    serviceJobs: ["consume_ShopifyOrders_SQS", "queue_NewOrderIdsFeed", "queue_UpdatedOrderIdsFeed", "sync_ShopifyOrderHistory"],
    docs: [
      { label: "Shopify connection setup", href: "https://github.com/hotwax/company/blob/main/docs/shopify-product-sync-first-time-wizard.md" },
      { label: "Shopify Admin API calls", href: "https://github.com/hotwax/company/blob/main/docs/shopify-product-sync-shopify-api-calls.md" }
    ]
  },
  {
    id: "shipFromStore",
    label: "Ship from store",
    question: "Should stores fulfill online orders?",
    agentPrompt: "I need store count, DC versus store inventory exposure, split tolerance, carrier label ownership, and whether staff can reject partial orders.",
    productStoreFields: ["enableBrokering", "allowSplit", "reserveInventory", "checkInventory", "requireInventory", "inventoryFacilityId"],
    productStoreSettings: ["PRE_SLCTD_FAC_TAG", "ORD_ITM_SHIP_FAC", "ORD_ITM_SHIP_METH", "FULFILL_NOTIF", "FULFILL_FORCE_SCAN", "FULFILL_PART_ODR_REJ", "AFFECT_QOH_ON_REJ", "REJ_ITM_CC_CRT"],
    permissions: ["STOREFULFILLMENT_ADMIN", "FULFILLMENT_APP_VIEW", "FF_ORDER_LOOKUP_VIEW", "FF_SHIP_NOW", "SF_UNLOCK_ORDER", "ORDER_SHIPMENT_METHOD_UPDATE"],
    shopifyConfig: ["ShopifyShopLocation", "carrierPartyId", "shipmentMethodTypeId", "shopifyShippingMethod"],
    serviceJobs: ["Order_Routing_Group_MORNING_ORDER_GROUP", "generate_OMSFulfillmentFeed_Shopify", "sendShopifyFulfillmentAckFeed"],
    docs: [
      { label: "Product store settings", href: "https://docs.hotwax.co/documents/v/learn-netsuite/netsuite-deployment/prerequisites/productstoresettings" }
    ]
  },
  {
    id: "bopis",
    label: "BOPIS / pickup",
    question: "Do customers buy online and pick up in store?",
    agentPrompt: "I need pickup store logic, qualifying shipping methods, handover proof requirements, and whether pickup-only carts should suppress shipping rates.",
    productStoreFields: ["enableBrokering", "reserveInventory", "checkInventory"],
    productStoreSettings: ["BOPIS_PART_ODR_REJ", "DEFULT_PKG_BOPIS_ORD", "SHOW_SHIPPING_ORDERS", "PRINT_PACKING_SLIPS", "PRINT_PICKLISTS", "ENABLE_TRACKING", "HANDOVER_PROOF", "BOPIS_SHIP_MTHDS", "ORD_ITM_PICKUP_FAC"],
    permissions: ["BOPIS_APP_VIEW", "BOPIS_POD_UPDATE", "BOPIS_REQUEST_TRANSFER_UPDATE", "ORD_SALES_ORDER_CNCL", "STOREFULFILLMENT_ADMIN"],
    shopifyConfig: ["ShopifyShopLocation", "pickup shipping methods", "delivery-rate configuration"],
    serviceJobs: ["queue_FulfillmentOrderIdsFeed", "queue_FulfillmentOrdersFeedFromShopify", "sendShopifyFulfillmentAckFeed"],
    docs: [
      { label: "Shopify locations", href: "https://help.shopify.com/en/manual/fulfillment/setup/locations" }
    ]
  },
  {
    id: "storeInventory",
    label: "Store inventory",
    question: "Should store teams receive, count, transfer, or adjust inventory in HotWax?",
    agentPrompt: "I need device expectations, scanner behavior, discrepancy policy, product identifier preference, and who can count or receive inventory.",
    productStoreFields: ["productIdentifierEnumId", "inventoryFacilityId", "oneInventoryFacility", "reserveInventory"],
    productStoreSettings: ["RECEIVE_FORCE_SCAN", "BARCODE_IDEN_PREF", "PRDT_IDEN_PREF", "RECEIVE_BY_FULFILL", "EX_INV_BY_PRD_TYPE"],
    permissions: ["RECEIVING_APP_VIEW", "RECEIVING_ADMIN", "TRANSFERS_APP_VIEW", "ORD_TRANSFER_ORDER_VIEW", "ORD_TRANSFER_ORDER_ADMIN", "APP_DISCREPANCY_REPORT", "INVCOUNT_APP_VIEW", "INV_COUNT_ADMIN", "INV_COUNT_SUBMIT", "INV_COUNT_VAR_LOG"],
    shopifyConfig: ["Shopify POS location mapping", "product image and catalog import"],
    serviceJobs: ["generate_TransferOrderItemsFeed", "reconcile_TransferOrderReceipts", "Generate_Inventory_Var_Feed", "Import_Cycle_Count_Ext_NS"],
    docs: [
      { label: "Product identifier settings", href: "https://docs.hotwax.co/documents/v/learn-netsuite/netsuite-deployment/prerequisites/productstoresettings" }
    ]
  },
  {
    id: "preorder",
    label: "Preorder",
    question: "Do you sell before inventory is physically available?",
    agentPrompt: "I need preorder eligibility, PO or arrival-date source, preorder inventory pool, release routing group, and paid-shipping overrides.",
    productStoreFields: ["reserveInventory", "allowSplit", "productIdentifierEnumId", "requireInventory", "requirementMethodEnumId"],
    productStoreSettings: ["HOLD_PRORD_PHYCL_INV", "PRE_ORDER_GROUP_ID", "REL_PREORD_ROUGRP_ID", "EX_INV_BY_PRD_TYPE", "PROD_CAT_ATTR", "UPDATE_PRODUCT_TYPE"],
    permissions: ["PREORDER_APP_VIEW", "APP_PRODUCTS_VIEW", "APP_PRDT_DTLS_VIEW", "APP_INV_CNFG_UPDT", "APP_PRODUCT_IDENTIFIER_UPDATE", "MERCHANDISING_ADMIN"],
    shopifyConfig: ["Shopify product tags", "SHOPIFY_PRODUCT_TYPE", "product metafields"],
    serviceJobs: ["Order_Routing_Group_PRE_ORDER_GROUP", "sync_ShopifyProductUpdates", "queue_BulkQuerySystemMessage_BulkProductMetaFieldByTagsQuery"],
    docs: [
      { label: "Product sync first-time wizard", href: "https://github.com/hotwax/company/blob/main/docs/shopify-product-sync-first-time-wizard.md" }
    ]
  },
  {
    id: "returns",
    label: "Returns and cancellation",
    question: "Should HotWax manage returns, restock rules, customer edits, or cancellations?",
    agentPrompt: "I need restock facility rules, return deadlines, customer edit windows, and whether ERP return feeds are in scope.",
    productStoreFields: ["reqReturnInventoryReceive", "daysToCancelNonPay", "headerCancelStatus", "itemCancelStatus"],
    productStoreSettings: ["RETURN_DEADLINE_DAYS", "RTN_RSTCK_FAC", "NS_RTN_FEED_SYNC", "AUTO_REJ_IDLE_ORD", "CUST_ALLOW_CNCL", "CUST_DLVRADR_UPDATE", "CUST_DLVRMTHD_UPDATE", "CUST_PCKUP_UPDATE", "RF_SHIPPING_METHOD"],
    permissions: ["RECEIVING_ADMIN", "ORD_SALES_ORDER_CNCL", "APP_SHPGRP_CNCL", "APP_SHPGRP_DLVRADR_UPDATE", "APP_SHPGRP_DLVRMTHD_UPDATE", "APP_SHPGRP_PCKUP_UPDATE"],
    shopifyConfig: ["Shopify return IDs", "return reasons", "ERP return feed mapping"],
    serviceJobs: ["sync_NetSuiteReturnTransactions", "poll_SystemMessageFileSftp_ReturnsAndAppeasementsFeed", "poll_SystemMessageFileSftp_ReturnsAndExchangeFeed"],
    docs: [
      { label: "Re-route fulfillment settings", href: "https://docs.hotwax.co/" }
    ]
  },
  {
    id: "erp",
    label: "ERP / NetSuite",
    question: "Which system owns finance, procurement, receiving, inventory, and fulfillment records?",
    agentPrompt: "I need source of truth per object, file/API preference, sync cadence, facility code mapping, and whether stores should avoid direct ERP login.",
    productStoreFields: ["payToPartyId", "defaultCurrencyUomId", "defaultTimeZoneString", "defaultLocaleString"],
    productStoreSettings: ["NS_RTN_FEED_SYNC"],
    permissions: ["JOB_MANAGER_APP_VIEW", "SERVICE_JOB_VIEW", "RECEIVING_ADMIN", "ORD_TRANSFER_ORDER_ADMIN"],
    shopifyConfig: ["ERP department ID", "facility external IDs", "payment method mappings", "shipment method mappings"],
    serviceJobs: ["generate_CreateOrderFeed", "generate_CustomerFeed", "generate_FulfilledOrderItemsFeed_Netsuite", "sync_NetSuiteItemReceipts", "generate_TransferOrderItemsFeed"],
    docs: [
      { label: "NetSuite payment methods", href: "https://docs.hotwax.co/documents/v/learn-netsuite/synchronization-flows/integration-mappings/payment-methods" },
      { label: "NetSuite SFTP setup", href: "https://docs.hotwax.co/documents/v/learn-netsuite/netsuite-deployment/sdfbundle/setupsftp" }
    ]
  },
  {
    id: "klaviyo",
    label: "Klaviyo / Unigate",
    question: "Should HotWax trigger transactional email or other Unigate-mediated integrations?",
    agentPrompt: "I need the Unigate tenant, Klaviyo account per brand, email event ownership, and whether FedEx or other mediated integrations share the same path.",
    productStoreFields: ["productStoreId"],
    productStoreSettings: ["FULFILL_NOTIF"],
    permissions: ["COMPANY_APP_VIEW", "APP_UPDT_PRODUCT_STORE_CONFG"],
    shopifyConfig: ["UNIGATE_CONFIG", "ProductStoreEmailSetting", "Klaviyo connection", "tenant API key"],
    serviceJobs: ["consume_AllReceivedSystemMessages_frequent", "consume_AllReceivedSystemMessages_oms"],
    docs: [
      { label: "Klaviyo API contracts", href: "https://github.com/hotwax/company/blob/main/documentation/klaviyo-api-contracts.md" }
    ]
  },
  {
    id: "carrier",
    label: "Carrier labels",
    question: "Should stores print carrier labels from HotWax?",
    agentPrompt: "I need carrier parties, shipment methods, label provider, rate shopping rules, and whether integrations are direct or Unigate-mediated.",
    productStoreFields: ["productStoreId"],
    productStoreSettings: ["RATE_SHOPPING"],
    permissions: ["CARRIER_SETUP_VIEW", "FF_SHIP_NOW", "ORDER_SHIPMENT_METHOD_UPDATE"],
    shopifyConfig: ["ShipmentGatewayConfig", "carrierPartyId", "shipmentMethodTypeId", "shopifyShippingMethod", "Unigate/FedEx credentials"],
    serviceJobs: ["generate_OMSFulfillmentFeed_Shopify", "sendShopifyFulfillmentAckFeed"],
    docs: [
      { label: "Shipping method mappings", href: "https://docs.hotwax.co/" }
    ]
  }
];

export const roleBundles: SetupRoleBundle[] = [
  {
    id: "storeAssociate",
    label: "Store associate",
    permissions: ["BOPIS_APP_VIEW", "FULFILLMENT_APP_VIEW", "FF_ORDER_LOOKUP_VIEW", "RECEIVING_APP_VIEW"]
  },
  {
    id: "storeManager",
    label: "Store manager",
    permissions: ["STOREFULFILLMENT_ADMIN", "SF_UNLOCK_ORDER", "BOPIS_REQUEST_TRANSFER_UPDATE", "ORD_TRANSFER_ORDER_ADMIN"]
  },
  {
    id: "inventoryManager",
    label: "Inventory manager",
    permissions: ["INVCOUNT_APP_VIEW", "INV_COUNT_ADMIN", "INV_COUNT_SUBMIT", "INV_COUNT_VAR_LOG", "APP_DISCREPANCY_REPORT"]
  },
  {
    id: "customerService",
    label: "Customer service",
    permissions: ["APP_ORDERS_VIEW", "APP_SHPGRP_CNCL", "APP_SHPGRP_DLVRADR_UPDATE", "APP_SHPGRP_DLVRMTHD_UPDATE", "APP_SHPGRP_PCKUP_UPDATE"]
  },
  {
    id: "routingAdmin",
    label: "Routing admin",
    permissions: ["ORDER_ROUTING_APP_VIEW", "ROUTING_TEST_DRIVE_VIEW", "DELETE_ORDER_ROUTE"]
  },
  {
    id: "integrationAdmin",
    label: "Integration admin",
    permissions: ["COMPANY_APP_VIEW", "JOB_MANAGER_APP_VIEW", "SERVICE_JOB_VIEW", "CARRIER_SETUP_VIEW"]
  },
  {
    id: "systemAdmin",
    label: "System admin",
    permissions: ["COMMON_ADMIN", "APP_SUPER_USER", "APP_SECURITY_GROUP_CREATE", "APP_SECURITY_GROUP_ASSIGNMENT", "APP_PERMISSION_VIEW"]
  }
];

export const sourceOfTruthObjects = [
  "Products",
  "Prices",
  "Inventory",
  "Customers",
  "Orders",
  "Payments",
  "POs",
  "Transfers",
  "Returns",
  "Labels"
];

export const sourceOfTruthSystems = ["Shopify", "HotWax OMS", "NetSuite", "WMS / 3PL", "TMS / carrier", "Not sure"];

export const defaultSetupAnswers: SetupAnswers = {
  companyName: "New retailer",
  productStoreName: "Main brand",
  storeCount: 1,
  warehouseCount: 0,
  shopifyShopCount: 1,
  monthlyOrderVolume: "Not sure",
  selectedWorkflows: ["shopify"],
  selectedRoles: ["storeAssociate", "integrationAdmin"],
  sourceOfTruth: {
    Products: "Shopify",
    Prices: "Shopify",
    Inventory: "HotWax OMS",
    Customers: "Shopify",
    Orders: "Shopify",
    Payments: "Shopify",
    POs: "NetSuite",
    Transfers: "NetSuite",
    Returns: "HotWax OMS",
    Labels: "TMS / carrier"
  },
  productIdentifier: "SHOPIFY_PRODUCT_SKU",
  wantsAutomaticZoomOut: true
};

export const coldStartSnapshot: SetupSnapshot = {
  mode: "cold-start",
  productStores: [],
  facilities: [],
  facilityGroups: [],
  shopifyShops: [],
  serviceJobs: [],
  systemMessageRemotes: []
};

function uniq(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

export function getSelectedWorkflows(answers: SetupAnswers) {
  return workflowOptions.filter((workflow) => answers.selectedWorkflows.includes(workflow.id));
}

export function getSelectedRoles(answers: SetupAnswers) {
  return roleBundles.filter((role) => answers.selectedRoles.includes(role.id));
}

export function buildSetupPackage(answers: SetupAnswers): SetupPackage {
  const workflows = getSelectedWorkflows(answers);
  const roles = getSelectedRoles(answers);
  const docs = workflows.flatMap((workflow) => workflow.docs);
  const sourceSystems = Object.values(answers.sourceOfTruth);

  const limitations = [];
  if (answers.selectedWorkflows.includes("returns")) {
    limitations.push("Native Shopify POS accounting and store-level return valuation remain platform behavior; OMS can configure receiving, restock, feeds, and permissions around it.");
  }
  if (sourceSystems.includes("Not sure")) {
    limitations.push("Source-of-truth answers marked Not sure should stay pending until an implementation owner confirms them.");
  }

  return {
    productStoreFields: uniq(workflows.flatMap((workflow) => workflow.productStoreFields)),
    productStoreSettings: uniq(workflows.flatMap((workflow) => workflow.productStoreSettings)),
    permissions: uniq([
      ...workflows.flatMap((workflow) => workflow.permissions),
      ...roles.flatMap((role) => role.permissions)
    ]),
    shopifyConfig: uniq(workflows.flatMap((workflow) => workflow.shopifyConfig)),
    serviceJobs: uniq(workflows.flatMap((workflow) => workflow.serviceJobs)),
    docs: docs.filter((doc, index, list) => list.findIndex((item) => item.href === doc.href) === index),
    limitations
  };
}

export function buildPhysicalNodes(answers: SetupAnswers, snapshot: SetupSnapshot): SetupMapNode[] {
  const hasMultipleLocations = answers.storeCount + answers.warehouseCount > 1;
  const facilityCount = snapshot.facilities.length || answers.storeCount + answers.warehouseCount;

  return [
    {
      id: "product-store",
      label: hasMultipleLocations ? answers.productStoreName : "First location",
      caption: hasMultipleLocations ? "Policy container for this brand" : "Focused single-location setup",
      state: snapshot.productStores.length ? "ready" : "draft",
      tags: ["ProductStore", `${answers.storeCount} stores`]
    },
    {
      id: "facilities",
      label: "Facilities",
      caption: facilityCount ? `${facilityCount} location records in scope` : "Create the first facility",
      state: snapshot.facilities.length ? "ready" : "draft",
      tags: ["stores", "warehouses", "pickup"]
    },
    {
      id: "regions",
      label: "Regions and hubs",
      caption: hasMultipleLocations ? "Needed for routing and rollout control" : "Reveals when a second location appears",
      state: hasMultipleLocations ? "draft" : "missing",
      tags: ["FacilityGroup", "routing"]
    },
    {
      id: "roles",
      label: "User groups",
      caption: `${answers.selectedRoles.length} role bundles selected`,
      state: answers.selectedRoles.length ? "draft" : "missing",
      tags: ["permissions", "apps"]
    }
  ];
}

export function buildTechnicalNodes(answers: SetupAnswers, snapshot: SetupSnapshot): SetupMapNode[] {
  const packageConfig = buildSetupPackage(answers);
  const needsUnigate = answers.selectedWorkflows.some((workflow) => ["klaviyo", "carrier"].includes(workflow));
  const integrationCount = answers.selectedWorkflows.filter((workflow) => ["shopify", "erp", "klaviyo", "carrier"].includes(workflow)).length;

  return [
    {
      id: "oms",
      label: "HotWax OMS",
      caption: snapshot.mode === "live" ? "Reading current instance" : "Parallel cold-start model",
      state: "ready",
      tags: ["ProductStore", "settings", "jobs"]
    },
    {
      id: "shopify",
      label: answers.shopifyShopCount > 1 ? "Shopify shops" : "Shopify shop",
      caption: snapshot.shopifyShops.length ? `${snapshot.shopifyShops.length} shop records found` : "Connection stub required",
      state: snapshot.shopifyShops.length ? "ready" : "draft",
      tags: ["SystemMessageRemote", "locations"]
    },
    {
      id: "erp",
      label: "ERP / finance",
      caption: answers.selectedWorkflows.includes("erp") ? "Source-of-truth answers required" : "Optional",
      state: answers.selectedWorkflows.includes("erp") ? "draft" : "missing",
      tags: ["NetSuite", "feeds"]
    },
    {
      id: "unigate",
      label: "Unigate",
      caption: needsUnigate ? "Mediated integrations in scope" : "Hidden until needed",
      state: needsUnigate ? "draft" : "missing",
      tags: ["Klaviyo", "FedEx", "carrier"]
    },
    {
      id: "jobs",
      label: "Service jobs",
      caption: `${packageConfig.serviceJobs.length} job recommendations`,
      state: snapshot.serviceJobs.length ? "review" : "draft",
      tags: ["cron", "productStoreIds", "shopId"]
    },
    {
      id: "zoom",
      label: integrationCount > 1 ? "Stack map" : "Connector setup",
      caption: integrationCount > 1 ? "Automatic zoom-out is active" : "Start focused on the first connector",
      state: "review",
      tags: ["setup mode"]
    }
  ];
}

export function getNextAgentQuestion(answers: SetupAnswers) {
  if (!answers.selectedWorkflows.length) {
    return "What are you trying to improve first: Shopify launch, ship from store, BOPIS, store inventory, preorder, returns, integrations, or carrier labels?";
  }
  if (!answers.storeCount) {
    return "How many stores, warehouses, and Shopify shops should be in the first rollout?";
  }
  if (Object.values(answers.sourceOfTruth).some((system) => system === "Not sure")) {
    return "Which systems own the records marked Not sure? I can keep those as pending recommendations until an owner confirms them.";
  }
  return "I have enough to draft the OMS setup package. Review the maps and generated configuration before applying anything to Moqui.";
}
