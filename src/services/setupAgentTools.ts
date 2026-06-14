import api from "@common/core/remoteApi";
import logger from "@common/core/logger";
import { commonUtil } from "@common/utils/commonUtil";
import {
  SetupAnswers,
  SetupPackage,
  SetupSnapshot,
  buildSetupPackage,
  coldStartSnapshot
} from "@/data/setupAgentCatalog";

export type SetupToolStatus = "idle" | "running" | "complete" | "error" | "draft";

export type SetupToolContract = {
  id: string;
  label: string;
  purpose: string;
  mode: "read" | "draft-write" | "write";
  endpoint?: string;
};

export type SetupToolRun = {
  id: string;
  toolId: string;
  label: string;
  status: SetupToolStatus;
  summary: string;
};

export type SetupExecutionStep = {
  id: string;
  label: string;
  endpoint: string;
  method: "GET" | "POST" | "PUT";
  records: string[];
  status: "draft" | "ready" | "blocked";
};

export const setupAgentToolContracts: SetupToolContract[] = [
  {
    id: "readProductStores",
    label: "Read product stores",
    purpose: "Find existing ProductStore records and decide whether onboarding should start focused or zoomed out.",
    mode: "read",
    endpoint: "GET admin/productStores"
  },
  {
    id: "readFacilities",
    label: "Read facilities",
    purpose: "Find physical stores, warehouses, regions, and facility groups that already exist.",
    mode: "read",
    endpoint: "GET admin/facilities"
  },
  {
    id: "readShopify",
    label: "Read Shopify topology",
    purpose: "Find Shopify shops, location mappings, type mappings, and remote credentials.",
    mode: "read",
    endpoint: "GET oms/shopifyShops/*"
  },
  {
    id: "readJobs",
    label: "Read service jobs",
    purpose: "Find current job schedules and product-store or shop-scoped parameters.",
    mode: "read",
    endpoint: "GET admin/serviceJobs"
  },
  {
    id: "draftProductStore",
    label: "Draft product store",
    purpose: "Create the ProductStore payload and ProductStoreSetting records from retailer-language answers.",
    mode: "draft-write",
    endpoint: "POST admin/productStores"
  },
  {
    id: "draftShopifyConnection",
    label: "Draft Shopify connection",
    purpose: "Prepare ShopifyShop, ShopifyShopLocation, ShopifyShopTypeMapping, and SystemMessageRemote records.",
    mode: "draft-write",
    endpoint: "POST oms/shopifyShops/shops"
  },
  {
    id: "draftSecurityGroups",
    label: "Draft user groups",
    purpose: "Turn selected store and operations roles into security group permission assignments.",
    mode: "draft-write"
  },
  {
    id: "draftServiceJobs",
    label: "Draft service jobs",
    purpose: "Prepare job clone/update payloads with cron, shopId, and productStoreIds parameters.",
    mode: "draft-write",
    endpoint: "PUT admin/serviceJobs/{jobName}"
  }
];

function unwrapSystemMessageRemotes(payload: any) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.systemMessageRemoteList)) return payload.systemMessageRemoteList;
  if (Array.isArray(payload?.systemMessageRemotes)) return payload.systemMessageRemotes;
  if (Array.isArray(payload?.docs)) return payload.docs;
  return [];
}

export async function fetchSystemMessageRemotes() {
  try {
    const resp = await api({ url: "oms/systemMessageRemotes", method: "get" }) as any;
    if (commonUtil.hasError(resp)) throw resp;
    return unwrapSystemMessageRemotes(resp?.data);
  } catch (error) {
    logger.warn("Failed to fetch system message remotes for setup agent", error);
    return [];
  }
}

export function createColdStartSnapshot(): SetupSnapshot {
  return JSON.parse(JSON.stringify(coldStartSnapshot));
}

export function summarizeSnapshot(snapshot: SetupSnapshot): SetupToolRun[] {
  return [
    {
      id: `tool-run-product-stores-${snapshot.mode}`,
      toolId: "readProductStores",
      label: "Read product stores",
      status: "complete",
      summary: snapshot.productStores.length
        ? `${snapshot.productStores.length} product store records found.`
        : "No product stores found; agent will draft the first ProductStore."
    },
    {
      id: `tool-run-facilities-${snapshot.mode}`,
      toolId: "readFacilities",
      label: "Read facilities",
      status: "complete",
      summary: snapshot.facilities.length
        ? `${snapshot.facilities.length} facilities found for the physical map.`
        : "No facilities found; first location will create the physical map seed."
    },
    {
      id: `tool-run-shopify-${snapshot.mode}`,
      toolId: "readShopify",
      label: "Read Shopify topology",
      status: "complete",
      summary: snapshot.shopifyShops.length
        ? `${snapshot.shopifyShops.length} Shopify shops found.`
        : "No Shopify shops found; agent will create a Shopify connection stub."
    },
    {
      id: `tool-run-jobs-${snapshot.mode}`,
      toolId: "readJobs",
      label: "Read service jobs",
      status: "complete",
      summary: snapshot.serviceJobs.length
        ? `${snapshot.serviceJobs.length} service jobs loaded for review.`
        : "No service jobs loaded in this model; job bundle remains draft."
    }
  ];
}

export function buildExecutionSteps(answers: SetupAnswers, packageConfig: SetupPackage = buildSetupPackage(answers)): SetupExecutionStep[] {
  return [
    {
      id: "create-product-store",
      label: "Create or update ProductStore",
      endpoint: "admin/productStores",
      method: "POST",
      records: packageConfig.productStoreFields,
      status: "draft"
    },
    {
      id: "save-product-store-settings",
      label: "Save ProductStoreSetting records",
      endpoint: "admin/productStores/{productStoreId}/settings",
      method: "POST",
      records: packageConfig.productStoreSettings,
      status: packageConfig.productStoreSettings.length ? "draft" : "blocked"
    },
    {
      id: "create-facility-network",
      label: "Create physical business topology",
      endpoint: "admin/facilities, admin/facilityGroups",
      method: "POST",
      records: [
        `${answers.storeCount} store facilities`,
        `${answers.warehouseCount} warehouse facilities`,
        answers.storeCount + answers.warehouseCount > 1 ? "facility groups / regions" : "single-location default group"
      ],
      status: "draft"
    },
    {
      id: "create-shopify-topology",
      label: "Create Shopify connection and mappings",
      endpoint: "oms/shopifyShops/shops, oms/systemMessageRemotes",
      method: "POST",
      records: packageConfig.shopifyConfig,
      status: packageConfig.shopifyConfig.length ? "draft" : "blocked"
    },
    {
      id: "create-security-groups",
      label: "Create role-based user groups",
      endpoint: "security group and permission assignment services",
      method: "POST",
      records: packageConfig.permissions,
      status: packageConfig.permissions.length ? "draft" : "blocked"
    },
    {
      id: "configure-service-jobs",
      label: "Configure service job bundle",
      endpoint: "admin/serviceJobs/{jobName}",
      method: "PUT",
      records: packageConfig.serviceJobs,
      status: packageConfig.serviceJobs.length ? "draft" : "blocked"
    }
  ];
}

export function createDraftToolRuns(answers: SetupAnswers): SetupToolRun[] {
  const packageConfig = buildSetupPackage(answers);
  return [
    {
      id: "tool-run-draft-product-store",
      toolId: "draftProductStore",
      label: "Draft product store",
      status: "draft",
      summary: `${packageConfig.productStoreFields.length} ProductStore fields and ${packageConfig.productStoreSettings.length} settings selected.`
    },
    {
      id: "tool-run-draft-shopify",
      toolId: "draftShopifyConnection",
      label: "Draft Shopify connection",
      status: "draft",
      summary: `${packageConfig.shopifyConfig.length} Shopify or adjacent configuration records recommended.`
    },
    {
      id: "tool-run-draft-security",
      toolId: "draftSecurityGroups",
      label: "Draft user groups",
      status: "draft",
      summary: `${packageConfig.permissions.length} permissions mapped from selected workflows and roles.`
    },
    {
      id: "tool-run-draft-jobs",
      toolId: "draftServiceJobs",
      label: "Draft service jobs",
      status: "draft",
      summary: `${packageConfig.serviceJobs.length} service job families selected for schedule review.`
    }
  ];
}
