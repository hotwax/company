import api from "@/api";
import logger from "@/logger";
import { PRODUCT_SYNC_MIGRATION_CONFIG, isProductSyncMigrationEligibleRelease } from "@/config/productSyncMigration";
import { ShopifyProductSyncService } from "@/services/ShopifyProductSyncService";

export type ProductSyncMigrationEntryAction = "current" | "setup" | "request-upgrade";

export interface ProductSyncMigrationEligibility {
  componentRelease: string;
  minimumComponentRelease: string;
  isEligible: boolean;
}

export interface ProductSyncMigrationArtifactCheck {
  id: string;
  label: string;
  status: "verified" | "missing";
  note: string;
}

export interface ProductSyncMigrationAssistantState {
  componentRelease: string;
  minimumComponentRelease: string;
  isEligible: boolean;
  hasNewProductSyncMessages: boolean;
  systemMessageRemoteId: string;
  syncJobConfigured: boolean;
  syncJobName: string;
  artifactChecks: ProductSyncMigrationArtifactCheck[];
}

function getShopifyShopId(payload: any) {
  return String(payload?.shopifyShopId || payload?.shopId || payload?.id || payload?.shop?.shopId || "").trim();
}

async function fetchMaargInfo() {
  const response = await api({
    url: "admin/maarg",
    method: "GET"
  }) as any;

  if (!response?.data || typeof response.data !== "object") {
    throw new Error("Maarg version response is unavailable.");
  }

  return response.data;
}

async function fetchEligibility(): Promise<ProductSyncMigrationEligibility> {
  const maargInfo = await fetchMaargInfo();
  const componentRelease = String(maargInfo?.instanceInfo?.componentRelease || "").trim();

  return {
    componentRelease,
    minimumComponentRelease: PRODUCT_SYNC_MIGRATION_CONFIG.minimumComponentRelease,
    isEligible: isProductSyncMigrationEligibleRelease(componentRelease)
  };
}

async function fetchServiceJobCheck(jobName: string, label: string, note: string): Promise<ProductSyncMigrationArtifactCheck> {
  try {
    const response = await api({
      url: `admin/serviceJobs/${jobName}`,
      method: "GET",
      params: {
        pageSize: 1
      }
    }) as any;

    return {
      id: jobName,
      label,
      status: response?.data?.jobDetail?.jobName ? "verified" : "missing",
      note
    };
  } catch (error) {
    logger.warn(`Failed to verify service job ${jobName}`, error);
    return {
      id: jobName,
      label,
      status: "missing",
      note
    };
  }
}

async function fetchAssistantState(payload: any): Promise<ProductSyncMigrationAssistantState> {
  const eligibility = await fetchEligibility();
  const shopifyShopId = getShopifyShopId(payload);
  let systemMessageRemoteId = "";
  let hasNewProductSyncMessages = false;
  let syncJobConfigured = false;
  let syncJobName = "";

  const artifactCheckPromises = [
    fetchServiceJobCheck(
      PRODUCT_SYNC_MIGRATION_CONFIG.incoming.serviceJobs.baseSync,
      "Base sync job",
      "Shared template job required before the app can configure a per-shop sync."
    ),
    fetchServiceJobCheck(
      PRODUCT_SYNC_MIGRATION_CONFIG.incoming.serviceJobs.send,
      "Send produced messages job",
      "Shared sender for new product sync system messages."
    ),
    fetchServiceJobCheck(
      PRODUCT_SYNC_MIGRATION_CONFIG.incoming.serviceJobs.poll,
      "Poll bulk operation results job",
      "Shared poller for completed Shopify bulk query results."
    )
  ];

  if (shopifyShopId) {
    try {
      const syncJobConfig = await ShopifyProductSyncService.fetchSyncJobConfig({ shopifyShopId });
      syncJobConfigured = syncJobConfig.isConfigured;
      syncJobName = syncJobConfig.jobName || "";
    } catch (error) {
      logger.warn("Failed to verify per-shop product sync job configuration", error);
    }
  }

  try {
    systemMessageRemoteId = await ShopifyProductSyncService.fetchShopSystemMessageRemoteId(payload);
    const syncRunState = await ShopifyProductSyncService.fetchProductUpdateSyncRunState(systemMessageRemoteId);
    hasNewProductSyncMessages = !!syncRunState.latestSystemMessage || !!syncRunState.systemMessages?.length;
  } catch (error) {
    logger.warn("Failed to detect existing new product sync messages for shop", error);
  }

  const artifactChecks = await Promise.all(artifactCheckPromises);

  return {
    ...eligibility,
    hasNewProductSyncMessages,
    systemMessageRemoteId,
    syncJobConfigured,
    syncJobName,
    artifactChecks
  };
}

function resolveEntryAction(payload: Pick<ProductSyncMigrationAssistantState, "hasNewProductSyncMessages" | "isEligible">): ProductSyncMigrationEntryAction {
  if (payload.hasNewProductSyncMessages) {
    return "current";
  }

  return payload.isEligible ? "setup" : "request-upgrade";
}

export const ShopifyProductSyncMigrationService = {
  fetchAssistantState,
  fetchEligibility,
  resolveEntryAction
};
