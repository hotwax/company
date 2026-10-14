import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  api: vi.fn(),
  refreshAfterMutation: vi.fn(),
  resyncDomain: vi.fn(),
  fetchShopSystemMessageRemoteId: vi.fn(),
}));

vi.mock("@common", () => ({
  api: (...args: any[]) => harness.api(...args),
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock("@/services/appDbSync", () => ({
  refreshAfterMutation: (...args: any[]) => harness.refreshAfterMutation(...args),
  resyncDomain: (...args: any[]) => harness.resyncDomain(...args),
}));
vi.mock("@/composables/useSeed", () => ({
  useMaargConfig: () => ({ load: vi.fn(), config: { value: { instanceInfo: { componentRelease: "v5.2.0" } } } }),
}));
vi.mock("@/composables/useShopify", () => ({
  fetchShopSystemMessageRemoteId: (...args: any[]) => harness.fetchShopSystemMessageRemoteId(...args),
  fetchSyncJobConfig: vi.fn(async () => ({ isConfigured: true, jobName: "sync_ShopifyProductUpdates_SHOP" })),
}));

import {
  type MigrationCatalog,
  deactivateLegacyServiceJob,
  deprecateLegacySystemMessageType,
  fetchAssistantState,
  fetchLegacyTeardownState,
  withCatalog,
} from "@/composables/useShopifyProductSyncMigration";

const LEGACY_JOB = "poll_BulkOperationResult_ShopifyBulkQuery";
const DYNAMIC_JOB = "queue_BulkQuerySystemMessage_BulkProductAndVariantsById_SHOP";

const activeJob = (jobName: string, overrides: Record<string, any> = {}) => ({
  jobName, description: jobName, paused: "N", serviceName: "some.service", cronExpression: "0 0 * * * ?",
  serviceJobParameters: [{ parameterName: "shopId", parameterValue: "SHOP" }], ...overrides,
});

function catalogOf(overrides: Partial<MigrationCatalog> = {}): MigrationCatalog {
  return {
    systemMessageTypes: [
      { systemMessageTypeId: "BulkQueryShopifyProductUpdates", description: "Product sync" },
      { systemMessageTypeId: "ShopifyNewProductsFeed", description: "New products", sendServiceName: "send.feed" },
      { systemMessageTypeId: "BulkProductAndVariantsByIdQuery_SHOP", description: "Legacy bulk", consumeServiceName: "consume.bulk" },
    ],
    serviceJobs: [
      activeJob("sync_ShopifyProductUpdates"),
      activeJob("send_ProducedBulkOperationSystemMessage_ShopifyBulkQuery", { paused: "Y" }),
      activeJob(LEGACY_JOB),
      activeJob(DYNAMIC_JOB),
    ],
    systemMessageRemotes: [{ systemMessageRemoteId: "LegacyRemote", internalId: "SHOP" }],
    ...overrides,
  };
}

/** The server: legacy messages and job parameters by data document; configs and documents exist. */
function serverAnswers() {
  harness.api.mockImplementation(async (config: any) => {
    if (config.url === "oms/dataDocumentView" && config.data?.dataDocumentId === "SERVICE_JOB_PARAMETER" && config.data?.customParametersMap) {
      return { data: { entityValueList: [
        { jobName: DYNAMIC_JOB, parameterName: "systemMessageTypeId", parameterValue: "BulkProductAndVariantsByIdQuery_SHOP" },
        { jobName: DYNAMIC_JOB, parameterName: "systemMessageRemoteId", parameterValue: "LegacyRemote" },
      ] } };
    }
    if (config.url === "oms/dataDocumentView") return { data: { entityValueList: [] } };
    if (String(config.url).startsWith("admin/dataManager/")) return { data: { configId: "SYNC_SHOPIFY_PRODUCT" } };
    return { data: {} };
  });
}

const catalogReadsOnServer = () => harness.api.mock.calls.filter(([config]) =>
  String(config.url).startsWith("admin/serviceJobs") || String(config.url).startsWith("admin/systemMessages/types") || config.url === "oms/systemMessageRemotes");

beforeEach(() => {
  for (const mock of Object.values(harness)) mock.mockReset();
  harness.refreshAfterMutation.mockResolvedValue(1);
  harness.resyncDomain.mockResolvedValue(undefined);
  harness.fetchShopSystemMessageRemoteId.mockImplementation(async (payload: any) =>
    payload.returnAllSystemMessageRemoteIds ? payload.remotes.map((remote: any) => remote.systemMessageRemoteId) : payload.remotes[0]?.systemMessageRemoteId);
  serverAnswers();
});

describe("fetchAssistantState — required jobs and types from the catalog", () => {
  it("checks them against the screen's rows, never asking the server for a synced table", async () => {
    const catalog = catalogOf();
    const state = await fetchAssistantState({ shopId: "SHOP", catalog: () => catalog });
    const check = (id: string) => state.artifactChecks.find((item) => item.id === id);

    expect(check("sync_ShopifyProductUpdates")).toMatchObject({ status: "verified", isPaused: false });
    expect(check("send_ProducedBulkOperationSystemMessage_ShopifyBulkQuery")).toMatchObject({ status: "verified", isPaused: true });
    // Not in the catalog, which is a full snapshot: genuinely missing.
    expect(check("poll_ShopifyBulkOperationResult")).toMatchObject({ status: "missing" });
    expect(check("BulkQueryShopifyProductUpdates")).toMatchObject({ status: "verified" });
    expect(catalogReadsOnServer()).toHaveLength(0);
  });

  it("resolves the shop's remotes from the catalog rows it is given", async () => {
    const catalog = catalogOf();
    await fetchAssistantState({ shopId: "SHOP", catalog: () => catalog });

    for (const [payload] of harness.fetchShopSystemMessageRemoteId.mock.calls) {
      expect(payload.remotes).toBe(catalog.systemMessageRemotes);
    }
  });
});

describe("fetchLegacyTeardownState", () => {
  it("reads legacy types and jobs from the catalog, and only the per-shop job names from the server", async () => {
    const catalog = catalogOf();
    const state = await fetchLegacyTeardownState({ shopId: "SHOP", catalog: () => catalog });

    expect(state.legacyDynamicServiceJobNames).toEqual([DYNAMIC_JOB]);
    // The catalog's contains match finds the per-shop legacy type alongside the configured ones.
    expect(state.legacySystemMessageTypes.find((item) => item.id === "BulkProductAndVariantsByIdQuery_SHOP")).toMatchObject({ status: "active" });
    expect(state.legacySystemMessageTypes.find((item) => item.id === "ShopifyNewProductsFeed")).toMatchObject({ status: "active" });
    expect(state.legacySystemMessageTypes.find((item) => item.id === "GenerateOMSNewProductsFeed")).toMatchObject({ status: "missing" });
    expect(state.legacyServiceJobs.find((item) => item.id === LEGACY_JOB)).toMatchObject({ status: "active" });
    expect(state.legacyServiceJobs.find((item) => item.id === DYNAMIC_JOB)).toMatchObject({ status: "active" });
    expect(catalogReadsOnServer()).toHaveLength(0);
  });
});

describe("withCatalog — items re-derive as the rows change", () => {
  it("shows a deactivated job once its refreshed row is in the catalog", async () => {
    const catalog = catalogOf();
    const state = await fetchLegacyTeardownState({ shopId: "SHOP", catalog: () => catalog });

    const refreshed = catalogOf({
      serviceJobs: [activeJob(LEGACY_JOB, { paused: "Y", serviceName: "_NA_" }), activeJob(DYNAMIC_JOB)],
    });
    const updated = withCatalog(state, refreshed);

    expect(updated.legacyServiceJobs.find((item) => item.id === LEGACY_JOB)).toMatchObject({ status: "deactivated" });
    // Per-shop job names came from the server and are kept.
    expect(updated.legacyServiceJobs.find((item) => item.id === DYNAMIC_JOB)).toMatchObject({ status: "active" });
  });

  it("re-checks the required jobs, and leaves the server's checks as they were", () => {
    const state = {
      artifactChecks: [
        { id: "poll_ShopifyBulkOperationResult", label: "Poll", note: "", status: "missing" as const },
        { id: "SYNC_SHOPIFY_PRODUCT", label: "Config", note: "", status: "verified" as const },
      ],
    };
    const updated = withCatalog(state, catalogOf({ serviceJobs: [activeJob("poll_ShopifyBulkOperationResult")] }));

    expect(updated.artifactChecks).toEqual([
      expect.objectContaining({ id: "poll_ShopifyBulkOperationResult", status: "verified" }),
      expect.objectContaining({ id: "SYNC_SHOPIFY_PRODUCT", status: "verified" }),
    ]);
  });
});

describe("legacy teardown writes", () => {
  it("pauses a job from its stored row, then refreshes that row", async () => {
    await deactivateLegacyServiceJob(LEGACY_JOB, catalogOf());

    expect(harness.api).toHaveBeenCalledWith(expect.objectContaining({
      url: `admin/serviceJobs/${LEGACY_JOB}`,
      method: "PUT",
      data: expect.objectContaining({ paused: "Y", serviceName: "_NA_", cronExpression: "0 0 * * * ?", serviceJobParameters: [{ parameterName: "shopId", parameterValue: "SHOP" }] }),
    }));
    expect(harness.refreshAfterMutation).toHaveBeenCalledWith("serviceJob", { jobName: LEGACY_JOB });
  });

  it("deprecates a type from its stored row, then re-reads the type snapshot", async () => {
    await deprecateLegacySystemMessageType("ShopifyNewProductsFeed", catalogOf());

    expect(harness.api).toHaveBeenCalledWith(expect.objectContaining({
      url: "admin/systemMessages/types/ShopifyNewProductsFeed",
      method: "PUT",
      data: expect.objectContaining({ description: "New products [Deprecated]", sendServiceName: "" }),
    }));
    expect(harness.resyncDomain).toHaveBeenCalledWith("systemMessageType");
  });

  it("writes nothing for a type or job the catalog does not hold", async () => {
    await deprecateLegacySystemMessageType("NotThere", catalogOf());
    await deactivateLegacyServiceJob("not_there", catalogOf());

    expect(harness.api).not.toHaveBeenCalled();
  });

  it("does not report a saved write as failed when only its refresh fails", async () => {
    harness.refreshAfterMutation.mockRejectedValue(new Error("worker offline"));

    await expect(deactivateLegacyServiceJob(LEGACY_JOB, catalogOf())).resolves.toBeUndefined();
  });
});
