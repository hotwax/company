import semver from 'semver';

export const PRODUCT_SYNC_MIGRATION_CONFIG = {
  minimumComponentRelease: "v5.1.0",
  eligibleComponentReleases: [
    "product-sync",
    "UpcomingRelease",
    "feature-shopify-delta-sync-seevices",
    "main"
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
      perShopPattern: "sync_ShopifyProductUpdates_{shopId}",
      send: "send_ProducedBulkOperationSystemMessage_ShopifyBulkQuery",
      poll: "poll_ShopifyBulkOperationResult"
    },
    dataManagerConfig: "SYNC_SHOPIFY_PRODUCT",
    dataDocuments: [
      "SERVICE_JOB_PARAMETER",
      "DATA_MANAGER_LOG_AND_PARAMETER",
      "PRODUCT_STORE_PRODUCT"
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
  
  // 1. Check if explicitly in the list (handles branch names and special tags)
  if ((PRODUCT_SYNC_MIGRATION_CONFIG.eligibleComponentReleases as readonly string[]).includes(normalizedRelease)) {
    return true;
  }
  
  // 2. Check if it's a valid semver and >= minimumComponentRelease
  const minRelease = PRODUCT_SYNC_MIGRATION_CONFIG.minimumComponentRelease;
  if (semver.valid(normalizedRelease) && semver.valid(minRelease)) {
    return semver.gte(normalizedRelease, minRelease);
  }
  
  return false;
}
