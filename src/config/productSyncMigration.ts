export const PRODUCT_SYNC_MIGRATION_CONFIG = {
  minimumComponentRelease: "ProductSyncMigrationGate_2026_05",
  eligibleComponentReleases: [
    "ProductSyncMigrationGate_2026_05",
    "UpcomingRelease"
  ],
  outgoing: {
    systemMessageTypes: [
      "ShopifyNewProductsFeed",
      "GenerateOMSNewProductsFeed",
      "SendOMSNewProductsFeed",
      "ShopifyUpdateProductsFeed",
      "GenerateOMSUpdateProductsFeed",
      "SendOMSUpdateProductsFeed",
      "ShopifyProductUpdatesFeed",
      "GenerateOMSUpdateProductsFeedNew"
    ],
    serviceJobs: [
      "poll_SystemMessageFileSftp_ShopifyNewProductsFeed",
      "poll_SystemMessageFileSftp_ShopifyUpdateProductsFeed",
      "poll_BulkOperationResult_ShopifyBulkQuery"
    ],
    enumerations: [
      "ShopifyNewProductsFeed",
      "GenerateOMSNewProductsFeed",
      "SendOMSNewProductsFeed",
      "ShopifyUpdateProductsFeed",
      "GenerateOMSUpdateProductsFeed",
      "SendOMSUpdateProductsFeed",
      "ShopifyProductUpdatesFeed",
      "ProductUpdatesFeed",
      "NewProductsFeed",
      "GenerateOMSUpdateProductsFeedNew",
      "ProductUpdatesFeedNew"
    ]
  },
  incoming: {
    systemMessageTypes: {
      productSync: "BulkQueryShopifyProductUpdates",
      webhook: "BulkOperationsFinish",
      webhookParent: "ShopifyWebhook"
    },
    serviceJobs: {
      baseSync: "sync_ShopifyProductUpdates",
      perShopPattern: "sync_ShopifyProductUpdates_{shopifyShopId}",
      send: "send_ProducedBulkOperationSystemMessage_ShopifyBulkQuery",
      poll: "poll_ShopifyBulkOperationResult"
    },
    dataManagerConfig: "SYNC_SHOPIFY_PRODUCT",
    dataDocuments: [
      "SERVICE_JOB_PARAMETER",
      "DATA_MANAGER_LOG_AND_PARAMETER",
      "PROD_STORE_PRODUCTS_COUNT"
    ],
    webhookTopic: "bulk_operations/finish"
  },
  mappings: {
    systemMessageTypeReplacement: {
      ShopifyNewProductsFeed: "BulkQueryShopifyProductUpdates",
      ShopifyUpdateProductsFeed: "BulkQueryShopifyProductUpdates",
      ShopifyProductUpdatesFeed: "BulkQueryShopifyProductUpdates"
    },
    jobReplacement: {
      poll_BulkOperationResult_ShopifyBulkQuery: "poll_ShopifyBulkOperationResult"
    }
  }
} as const;

export function isProductSyncMigrationEligibleRelease(componentRelease: string) {
  const normalizedRelease = String(componentRelease || "").trim();
  return (PRODUCT_SYNC_MIGRATION_CONFIG.eligibleComponentReleases as readonly string[]).includes(normalizedRelease);
}
