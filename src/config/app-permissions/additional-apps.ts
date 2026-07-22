import { defineAppPermissionCatalog } from "./types";

const adminPermissions = ["COMMON_ADMIN"] as const;

const usage = (file: string, context: string) => [{ file, context }];

export const availableToPromisePermissionCatalog = defineAppPermissionCatalog({
  appId: "available-to-promise",
  appName: "Available to Promise",
  appDescription: "Controls access to inventory availability and promise-date workflows.",
  appAccessPermissionIds: ["ATP_APP_VIEW"],
  adminPermissionIds: adminPermissions,
  permissions: [
    {
      permissionId: "ATP_APP_VIEW",
      title: "Access available to promise",
      description: "Allows users to open the Available to Promise application.",
      category: "Application access",
      impliedBy: adminPermissions,
      usedIn: usage(".env.example", "ATP_APP_VIEW")
    }
  ]
} as const);

export const bopisPermissionCatalog = defineAppPermissionCatalog({
  appId: "bopis",
  appName: "BOPIS",
  appDescription: "Controls buy-online-pickup-in-store order handling and pickup updates.",
  appAccessPermissionIds: ["BOPIS_APP_VIEW"],
  adminPermissionIds: ["COMMON_ADMIN", "STOREFULFILLMENT_ADMIN"],
  permissions: [
    {
      permissionId: "BOPIS_APP_VIEW",
      title: "Access BOPIS",
      description: "Allows users to open the BOPIS application.",
      category: "Application access",
      impliedBy: ["COMMON_ADMIN", "STOREFULFILLMENT_ADMIN"],
      usedIn: usage(".env.example", "BOPIS_APP_VIEW")
    },
    {
      permissionId: "BOPIS_POD_UPDATE",
      title: "Update proof of delivery",
      description: "Allows users to update pickup proof-of-delivery details on BOPIS orders.",
      category: "Pickup orders",
      impliedBy: ["COMMON_ADMIN", "STOREFULFILLMENT_ADMIN"],
      usedIn: usage("src/views/Orders.vue", "BOPIS_POD_UPDATE")
    },
    {
      permissionId: "BOPIS_REQUEST_TRANSFER_UPDATE",
      title: "Request transfer updates",
      description: "Allows users to update transfer-request settings used by BOPIS workflows.",
      category: "Transfer requests",
      impliedBy: ["COMMON_ADMIN", "STOREFULFILLMENT_ADMIN"],
      usedIn: usage("src/views/Settings.vue", "BOPIS_REQUEST_TRANSFER_UPDATE")
    },
    {
      permissionId: "ORD_SALES_ORDER_CNCL",
      title: "Cancel sales orders",
      description: "Allows users to cancel sales orders from the BOPIS order detail flow.",
      category: "Order actions",
      impliedBy: ["COMMON_ADMIN", "STOREFULFILLMENT_ADMIN"],
      usedIn: usage("src/views/OrderDetail.vue", "ORD_SALES_ORDER_CNCL")
    },
    {
      permissionId: "STOREFULFILLMENT_ADMIN",
      title: "Store fulfillment admin",
      description: "Allows users to perform store fulfillment administrator actions across BOPIS workflows.",
      category: "Administration",
      impliedBy: adminPermissions,
      usedIn: usage("src/components/DxpProductIdentifier.vue", "STOREFULFILLMENT_ADMIN")
    }
  ]
} as const);

export const companyPermissionCatalog = defineAppPermissionCatalog({
  appId: "company",
  appName: "Company",
  appDescription: "Controls access to company administration.",
  appAccessPermissionIds: ["COMPANY_APP_VIEW"],
  adminPermissionIds: adminPermissions,
  permissions: [
    {
      permissionId: "COMPANY_APP_VIEW",
      title: "Access company",
      description: "Allows users to open the Company application.",
      category: "Application access",
      impliedBy: adminPermissions,
      usedIn: usage(".env.example", "COMPANY_APP_VIEW")
    }
  ]
} as const);

export const facilitiesPermissionCatalog = defineAppPermissionCatalog({
  appId: "facilities",
  appName: "Facilities",
  appDescription: "Controls facility administration and standalone app access.",
  appAccessPermissionIds: ["FACILITIES_APP_VIEW"],
  adminPermissionIds: adminPermissions,
  permissions: [
    {
      permissionId: "FACILITIES_APP_VIEW",
      title: "Access facilities",
      description: "Allows users to open the Facilities application.",
      category: "Application access",
      impliedBy: adminPermissions,
      usedIn: usage(".env.example", "FACILITIES_APP_VIEW")
    },
    {
      permissionId: "APP_COMMERCE_VIEW",
      title: "Open commerce view",
      description: "Allows users to access commerce-facing controls in the Facilities application.",
      category: "Application access",
      impliedBy: adminPermissions,
      usedIn: usage("src/authorization/Actions.ts", "APP_COMMERCE_VIEW")
    },
    {
      permissionId: "APP_PWA_STANDALONE_ACCESS",
      title: "Open standalone app controls",
      description: "Allows users to access standalone PWA controls.",
      category: "Application access",
      impliedBy: adminPermissions,
      usedIn: usage("src/authorization/Actions.ts", "APP_PWA_STANDALONE_ACCESS")
    }
  ]
} as const);

export const fulfillmentPermissionCatalog = defineAppPermissionCatalog({
  appId: "fulfillment",
  appName: "Fulfillment",
  appDescription: "Controls store fulfillment, transfer order, carrier, and order lookup workflows.",
  appAccessPermissionIds: ["FULFILLMENT_APP_VIEW"],
  adminPermissionIds: ["COMMON_ADMIN", "STOREFULFILLMENT_ADMIN"],
  permissions: [
    {
      permissionId: "FULFILLMENT_APP_VIEW",
      title: "Access fulfillment",
      description: "Allows users to open the Fulfillment application.",
      category: "Application access",
      impliedBy: ["COMMON_ADMIN", "STOREFULFILLMENT_ADMIN"],
      usedIn: usage(".env.example", "FULFILLMENT_APP_VIEW")
    },
    {
      permissionId: "STOREFULFILLMENT_ADMIN",
      title: "Store fulfillment admin",
      description: "Allows users to perform store fulfillment administrator actions.",
      category: "Administration",
      impliedBy: adminPermissions,
      usedIn: usage("src/components/DxpProductIdentifier.vue", "STOREFULFILLMENT_ADMIN")
    },
    {
      permissionId: "FF_ORDER_LOOKUP_VIEW",
      title: "View order lookup",
      description: "Allows users to access fulfillment order lookup pages.",
      category: "Order lookup",
      impliedBy: ["COMMON_ADMIN", "STOREFULFILLMENT_ADMIN"],
      usedIn: usage("src/router/index.ts", "FF_ORDER_LOOKUP_VIEW")
    },
    {
      permissionId: "FF_INVOICING_STATUS_VIEW",
      title: "View invoicing status",
      description: "Allows users to view invoicing status on fulfillment order details.",
      category: "Order details",
      impliedBy: ["COMMON_ADMIN", "STOREFULFILLMENT_ADMIN"],
      usedIn: usage("src/views/OrderDetail.vue", "FF_INVOICING_STATUS_VIEW")
    },
    {
      permissionId: "CARRIER_SETUP_VIEW",
      title: "View carrier setup",
      description: "Allows users to access carrier setup pages.",
      category: "Carrier setup",
      impliedBy: ["COMMON_ADMIN", "STOREFULFILLMENT_ADMIN"],
      usedIn: usage("src/router/index.ts", "CARRIER_SETUP_VIEW")
    },
    {
      permissionId: "FULFILLMENT_VIEW_ALL_PICKERS",
      title: "View all pickers",
      description: "Allows users to view and select all pickers in fulfillment workflows.",
      category: "Picking",
      impliedBy: ["COMMON_ADMIN", "STOREFULFILLMENT_ADMIN"],
      usedIn: usage("src/components/EditPickersModal.vue", "FULFILLMENT_VIEW_ALL_PICKERS")
    },
    {
      permissionId: "ORD_TRANSFER_ORDER_VIEW",
      title: "View transfer orders",
      description: "Allows users to view transfer order workflows.",
      category: "Transfer orders",
      impliedBy: ["COMMON_ADMIN", "ORD_TRANSFER_ORDER_ADMIN"],
      usedIn: usage("src/router/index.ts", "ORD_TRANSFER_ORDER_VIEW OR ORD_TRANSFER_ORDER_ADMIN")
    },
    {
      permissionId: "ORD_TRANSFER_ORDER_ADMIN",
      title: "Administer transfer orders",
      description: "Allows users to administer transfer order workflows.",
      category: "Transfer orders",
      impliedBy: adminPermissions,
      usedIn: usage("src/router/index.ts", "ORD_TRANSFER_ORDER_VIEW OR ORD_TRANSFER_ORDER_ADMIN")
    },
    {
      permissionId: "ORD_TRANSFER_ORDER_CANCEL",
      title: "Cancel transfer orders",
      description: "Allows users to cancel transfer orders.",
      category: "Transfer orders",
      impliedBy: ["COMMON_ADMIN", "ORD_TRANSFER_ORDER_ADMIN"],
      usedIn: usage("src/components/CloseTransferOrderModal.vue", "ORD_TRANSFER_ORDER_CANCEL")
    },
    {
      permissionId: "ORDER_SHIPMENT_METHOD_UPDATE",
      title: "Update shipment method",
      description: "Allows users to update shipment methods on fulfillment orders.",
      category: "Order actions",
      impliedBy: ["COMMON_ADMIN", "STOREFULFILLMENT_ADMIN"],
      usedIn: usage("src/views/OrderDetail.vue", "ORDER_SHIPMENT_METHOD_UPDATE")
    },
    {
      permissionId: "FF_SHIP_NOW",
      title: "Ship fulfillment orders",
      description: "Allows users to ship packed fulfillment orders.",
      category: "Order actions",
      impliedBy: ["COMMON_ADMIN", "STOREFULFILLMENT_ADMIN"],
      usedIn: usage("src/views/Completed.vue", "COMMON_ADMIN OR FF_SHIP_NOW")
    },
    {
      permissionId: "SF_UNLOCK_ORDER",
      title: "Unlock fulfillment orders",
      description: "Allows users to unlock fulfillment orders from completed workflows.",
      category: "Order actions",
      impliedBy: adminPermissions,
      usedIn: usage("src/views/Completed.vue", "COMMON_ADMIN OR SF_UNLOCK_ORDER")
    }
  ]
} as const);

export const jobManagerPermissionCatalog = defineAppPermissionCatalog({
  appId: "job-manager",
  appName: "Job Manager",
  appDescription: "Controls access to scheduled job monitoring and management.",
  appAccessPermissionIds: ["JOB_MANAGER_APP_VIEW"],
  adminPermissionIds: adminPermissions,
  permissions: [
    {
      permissionId: "JOB_MANAGER_APP_VIEW",
      title: "Access job manager",
      description: "Allows users to open the Job Manager application.",
      category: "Application access",
      impliedBy: adminPermissions,
      usedIn: usage(".env.example", "JOB_MANAGER_APP_VIEW")
    }
  ]
} as const);

export const launchpadPermissionCatalog = defineAppPermissionCatalog({
  appId: "launchpad",
  appName: "Launchpad",
  appDescription: "Controls which commerce and fulfillment applications users can open from Launchpad.",
  appAccessPermissionIds: ["APP_COMMERCE_VIEW", "APP_FULFILLMENT_VIEW", "APP_LEGACY_FULFILLMENT_VIEW"],
  adminPermissionIds: adminPermissions,
  permissions: [
    {
      permissionId: "APP_COMMERCE_VIEW",
      title: "View commerce apps",
      description: "Allows users to see commerce applications in Launchpad.",
      category: "Launchpad access",
      impliedBy: adminPermissions,
      usedIn: usage("src/authorization/Actions.ts", "APP_COMMERCE_VIEW")
    },
    {
      permissionId: "APP_FULFILLMENT_VIEW",
      title: "View fulfillment apps",
      description: "Allows users to see fulfillment applications in Launchpad.",
      category: "Launchpad access",
      impliedBy: adminPermissions,
      usedIn: usage("src/authorization/Actions.ts", "APP_FULFILLMENT_VIEW")
    },
    {
      permissionId: "APP_LEGACY_FULFILLMENT_VIEW",
      title: "View legacy fulfillment apps",
      description: "Allows users to see legacy fulfillment applications in Launchpad.",
      category: "Launchpad access",
      impliedBy: adminPermissions,
      usedIn: usage("src/authorization/Actions.ts", "APP_LEGACY_FULFILLMENT_VIEW")
    }
  ]
} as const);

export const orderManagerPermissionCatalog = defineAppPermissionCatalog({
  appId: "order-manager",
  appName: "Order Manager",
  appDescription: "Controls access to order management workflows.",
  appAccessPermissionIds: ["ORDERMGR_VIEW"],
  adminPermissionIds: adminPermissions,
  permissions: [
    {
      permissionId: "ORDERMGR_VIEW",
      title: "Access order manager",
      description: "Allows users to open the Order Manager application.",
      category: "Application access",
      impliedBy: adminPermissions,
      usedIn: usage(".env.example", "ORDERMGR_VIEW")
    }
  ]
} as const);

export const orderRoutingPermissionCatalog = defineAppPermissionCatalog({
  appId: "order-routing",
  appName: "Order Routing",
  appDescription: "Controls order routing setup and test-drive workflows.",
  appAccessPermissionIds: ["ORDER_ROUTING_APP_VIEW"],
  adminPermissionIds: adminPermissions,
  permissions: [
    {
      permissionId: "ORDER_ROUTING_APP_VIEW",
      title: "Access order routing",
      description: "Allows users to open the Order Routing application.",
      category: "Application access",
      impliedBy: adminPermissions,
      usedIn: usage(".env.example", "ORDER_ROUTING_APP_VIEW")
    },
    {
      permissionId: "ROUTING_TEST_DRIVE_VIEW",
      title: "Run routing test drive",
      description: "Allows users to access the routing test-drive workflow.",
      category: "Routing analysis",
      impliedBy: adminPermissions,
      usedIn: usage("src/views/BrokeringQuery.vue", "ROUTING_TEST_DRIVE_VIEW")
    }
  ]
} as const);

export const preorderPermissionCatalog = defineAppPermissionCatalog({
  appId: "preorder",
  appName: "Preorder",
  appDescription: "Controls preorder product, order, audit, and inventory configuration workflows.",
  appAccessPermissionIds: ["PREORDER_APP_VIEW"],
  adminPermissionIds: adminPermissions,
  permissions: [
    {
      permissionId: "PREORDER_APP_VIEW",
      title: "Access preorder",
      description: "Allows users to open the Preorder application.",
      category: "Application access",
      impliedBy: adminPermissions,
      usedIn: usage(".env.example", "PREORDER_APP_VIEW")
    },
    {
      permissionId: "APP_PRODUCTS_VIEW",
      title: "View preorder products",
      description: "Allows users to view products in preorder workflows.",
      category: "Products",
      impliedBy: adminPermissions,
      usedIn: usage("src/router/index.ts", "APP_PRODUCTS_VIEW")
    },
    {
      permissionId: "APP_PRDT_DTLS_VIEW",
      title: "View product details",
      description: "Allows users to view preorder product detail pages.",
      category: "Products",
      impliedBy: adminPermissions,
      usedIn: usage("src/router/index.ts", "APP_PRDT_DTLS_VIEW")
    },
    {
      permissionId: "APP_ORDERS_VIEW",
      title: "View preorder orders",
      description: "Allows users to view orders in preorder workflows.",
      category: "Orders",
      impliedBy: adminPermissions,
      usedIn: usage("src/router/index.ts", "APP_ORDERS_VIEW")
    },
    {
      permissionId: "APP_AUDIT_VIEW",
      title: "View audit",
      description: "Allows users to open preorder audit pages.",
      category: "Audit",
      impliedBy: adminPermissions,
      usedIn: usage("src/router/index.ts", "APP_AUDIT_VIEW")
    },
    {
      permissionId: "APP_AUDIT_PRDT_DTLS_VIEW",
      title: "View audit product details",
      description: "Allows users to view product details from preorder audit pages.",
      category: "Audit",
      impliedBy: adminPermissions,
      usedIn: usage("src/router/index.ts", "APP_AUDIT_PRDT_DTLS_VIEW")
    },
    {
      permissionId: "APP_INV_CNFG_UPDT",
      title: "Update inventory configuration",
      description: "Allows users to update preorder inventory configuration.",
      category: "Configuration",
      impliedBy: adminPermissions,
      usedIn: usage("src/authorization/Actions.ts", "APP_INV_CNFG_UPDT")
    },
    {
      permissionId: "APP_PRODUCT_IDENTIFIER_UPDATE",
      title: "Update product identifiers",
      description: "Allows users to update product identifiers in preorder workflows.",
      category: "Products",
      impliedBy: adminPermissions,
      usedIn: usage("src/authorization/Actions.ts", "APP_PRODUCT_IDENTIFIER_UPDATE")
    },
    {
      permissionId: "APP_COMMERCE_VIEW",
      title: "Open commerce view",
      description: "Allows users to access commerce-facing preorder controls.",
      category: "Application access",
      impliedBy: adminPermissions,
      usedIn: usage("src/authorization/Actions.ts", "APP_COMMERCE_VIEW")
    },
    {
      permissionId: "APP_PWA_STANDALONE_ACCESS",
      title: "Open standalone app controls",
      description: "Allows users to access standalone PWA controls.",
      category: "Application access",
      impliedBy: adminPermissions,
      usedIn: usage("src/authorization/Actions.ts", "APP_PWA_STANDALONE_ACCESS")
    }
  ]
} as const);

export const productsPermissionCatalog = defineAppPermissionCatalog({
  appId: "products",
  appName: "Products",
  appDescription: "No auditable permission checks are currently configured in this checkout.",
  appAccessPermissionIds: [],
  adminPermissionIds: adminPermissions,
  permissions: []
} as const);

export const receivingPermissionCatalog = defineAppPermissionCatalog({
  appId: "receiving",
  appName: "Receiving",
  appDescription: "Controls receiving, shipment, and purchase order close workflows.",
  appAccessPermissionIds: ["RECEIVING_APP_VIEW"],
  adminPermissionIds: ["COMMON_ADMIN", "RECEIVING_ADMIN"],
  permissions: [
    {
      permissionId: "RECEIVING_APP_VIEW",
      title: "Access receiving",
      description: "Allows users to open the Receiving application.",
      category: "Application access",
      impliedBy: ["COMMON_ADMIN", "RECEIVING_ADMIN"],
      usedIn: usage(".env.example", "RECEIVING_APP_VIEW")
    },
    {
      permissionId: "RECEIVING_ADMIN",
      title: "Receiving admin",
      description: "Allows users to administer receiving workflows.",
      category: "Administration",
      impliedBy: adminPermissions,
      usedIn: usage("src/components/ClosePurchaseOrderModal.vue", "RECEIVING_ADMIN")
    },
    {
      permissionId: "APP_SHIPMENTS_VIEW",
      title: "View shipments",
      description: "Allows users to view shipment pages in Receiving.",
      category: "Shipments",
      impliedBy: ["COMMON_ADMIN", "RECEIVING_ADMIN"],
      usedIn: usage("src/router/index.ts", "APP_SHIPMENTS_VIEW")
    },
    {
      permissionId: "FULFILLMENT_APP_VIEW",
      title: "Use modern fulfillment receiving",
      description: "Allows users to access receiving flows tied to the current fulfillment app.",
      category: "Application access",
      impliedBy: adminPermissions,
      usedIn: usage("src/App.vue", "FULFILLMENT_APP_VIEW")
    },
    {
      permissionId: "FULFILLMENT_LEGACY_APP_VIEW",
      title: "Use legacy fulfillment receiving",
      description: "Allows users to access receiving flows tied to the legacy fulfillment app.",
      category: "Application access",
      impliedBy: adminPermissions,
      usedIn: usage("src/App.vue", "FULFILLMENT_LEGACY_APP_VIEW")
    }
  ]
} as const);

export const rerouteFulfilmentPermissionCatalog = defineAppPermissionCatalog({
  appId: "reroute-fulfilment",
  appName: "Reroute Fulfilment",
  appDescription: "Controls shipment group reroute actions.",
  appAccessPermissionIds: [],
  adminPermissionIds: adminPermissions,
  permissions: [
    {
      permissionId: "APP_SHPGRP_CNCL",
      title: "Cancel shipment groups",
      description: "Allows users to cancel shipment groups during reroute workflows.",
      category: "Shipment groups",
      impliedBy: adminPermissions,
      usedIn: usage("src/authorization/Actions.ts", "APP_SHPGRP_CNCL")
    },
    {
      permissionId: "APP_SHPGRP_DLVRADR_UPDATE",
      title: "Update delivery address",
      description: "Allows users to update shipment group delivery addresses.",
      category: "Shipment groups",
      impliedBy: adminPermissions,
      usedIn: usage("src/authorization/Actions.ts", "APP_SHPGRP_DLVRADR_UPDATE")
    },
    {
      permissionId: "APP_SHPGRP_DLVRMTHD_UPDATE",
      title: "Update delivery method",
      description: "Allows users to update shipment group delivery methods.",
      category: "Shipment groups",
      impliedBy: adminPermissions,
      usedIn: usage("src/authorization/Actions.ts", "APP_SHPGRP_DLVRMTHD_UPDATE")
    },
    {
      permissionId: "APP_SHPGRP_PCKUP_UPDATE",
      title: "Update pickup details",
      description: "Allows users to update shipment group pickup details.",
      category: "Shipment groups",
      impliedBy: adminPermissions,
      usedIn: usage("src/authorization/Actions.ts", "APP_SHPGRP_PCKUP_UPDATE")
    }
  ]
} as const);

export const returnsPermissionCatalog = defineAppPermissionCatalog({
  appId: "returns",
  appName: "Returns",
  appDescription: "No auditable permission checks are currently configured in this checkout.",
  appAccessPermissionIds: [],
  adminPermissionIds: adminPermissions,
  permissions: []
} as const);

export const shopifyBopisPermissionCatalog = defineAppPermissionCatalog({
  appId: "shopify-bopis",
  appName: "Shopify BOPIS",
  appDescription: "No auditable permission checks are currently configured in this checkout.",
  appAccessPermissionIds: [],
  adminPermissionIds: adminPermissions,
  permissions: []
} as const);

export const transfersPermissionCatalog = defineAppPermissionCatalog({
  appId: "transfers",
  appName: "Transfers",
  appDescription: "Controls transfer order upload, discrepancy, and product identifier workflows.",
  appAccessPermissionIds: ["TRANSFERS_APP_VIEW"],
  adminPermissionIds: adminPermissions,
  permissions: [
    {
      permissionId: "TRANSFERS_APP_VIEW",
      title: "Access transfers",
      description: "Allows users to open the Transfers application.",
      category: "Application access",
      impliedBy: adminPermissions,
      usedIn: usage(".env.example", "TRANSFERS_APP_VIEW")
    },
    {
      permissionId: "APP_BULK_UPLOAD",
      title: "Use bulk upload",
      description: "Allows users to access bulk upload workflows.",
      category: "Bulk upload",
      impliedBy: adminPermissions,
      usedIn: usage("src/router/index.ts", "APP_BULK_UPLOAD")
    },
    {
      permissionId: "APP_TFNR_BULK_UPLOAD",
      title: "Use transfer bulk upload",
      description: "Allows users to access transfer-specific bulk upload workflows.",
      category: "Bulk upload",
      impliedBy: adminPermissions,
      usedIn: usage("src/authorization/Actions.ts", "APP_BULK_UPLOAD")
    },
    {
      permissionId: "APP_DISCREPANCY_REPORT",
      title: "View discrepancy reports",
      description: "Allows users to access discrepancy report pages.",
      category: "Reports",
      impliedBy: adminPermissions,
      usedIn: usage("src/router/index.ts", "APP_DISCREPANCY_REPORT")
    },
    {
      permissionId: "APP_TFNR_DISCREPANCY_REPORT",
      title: "View transfer discrepancy reports",
      description: "Allows users to access transfer-specific discrepancy report pages.",
      category: "Reports",
      impliedBy: adminPermissions,
      usedIn: usage("src/authorization/Actions.ts", "APP_DISCREPANCY_REPORT")
    },
    {
      permissionId: "APP_PRODUCT_IDENTIFIER_UPDATE",
      title: "Update product identifiers",
      description: "Allows users to update product identifiers in transfer workflows.",
      category: "Products",
      impliedBy: adminPermissions,
      usedIn: usage("src/authorization/Actions.ts", "APP_PRODUCT_IDENTIFIER_UPDATE")
    },
    {
      permissionId: "APP_COMMERCE_VIEW",
      title: "Open commerce view",
      description: "Allows users to access commerce-facing transfer controls.",
      category: "Application access",
      impliedBy: adminPermissions,
      usedIn: usage("src/authorization/Actions.ts", "APP_COMMERCE_VIEW")
    },
    {
      permissionId: "APP_PWA_STANDALONE_ACCESS",
      title: "Open standalone app controls",
      description: "Allows users to access standalone PWA controls.",
      category: "Application access",
      impliedBy: adminPermissions,
      usedIn: usage("src/authorization/Actions.ts", "APP_PWA_STANDALONE_ACCESS")
    }
  ]
} as const);

export const additionalAppPermissionCatalogs = [
  availableToPromisePermissionCatalog,
  bopisPermissionCatalog,
  companyPermissionCatalog,
  facilitiesPermissionCatalog,
  fulfillmentPermissionCatalog,
  jobManagerPermissionCatalog,
  launchpadPermissionCatalog,
  orderManagerPermissionCatalog,
  orderRoutingPermissionCatalog,
  preorderPermissionCatalog,
  productsPermissionCatalog,
  receivingPermissionCatalog,
  rerouteFulfilmentPermissionCatalog,
  returnsPermissionCatalog,
  shopifyBopisPermissionCatalog,
  transfersPermissionCatalog
] as const;
