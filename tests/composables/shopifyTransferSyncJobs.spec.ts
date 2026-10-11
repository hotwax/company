import { beforeEach, describe, expect, it, vi } from "vitest";

const { api, refreshAfterMutation } = vi.hoisted(() => ({ api: vi.fn(), refreshAfterMutation: vi.fn() }));

vi.mock("@common", () => ({
  api,
  commonUtil: { hasError: () => false },
}));

vi.mock("@/services/appCacheBootstrap", () => ({ refreshAfterMutation }));
vi.mock("@/utils/cacheEntities", () => ({ shopifyTransferPendingCache: {} }));
vi.mock("@/composables/useCachedList", () => ({ useCachedList: vi.fn() }));
vi.mock("@/utils/shopifyWebhookReconciliation", () => ({ reconcileWebhookTopics: vi.fn() }));
vi.mock("@/workers/domains/shopifyTransferSyncDomain", () => ({
  PENDING_SEGMENT_ENDPOINTS: {
    create: "sob/shopify/transferSync/pendingCreate",
    cancellation: "sob/shopify/transferSync/pendingCancellation",
  },
  SYNCED_SEGMENT_ENDPOINTS: {},
}));

import { TRANSFER_SYNC_JOBS, useShopifyTransferSyncJobs, useShopifyTransferSyncLaunch } from "@/composables/useShopifyTransferSync";

const CREATE = TRANSFER_SYNC_JOBS.find((definition) => definition.key === "create")!;
const UPDATE = TRANSFER_SYNC_JOBS.find((definition) => definition.key === "update")!;

/** The job rows exactly as demo-oms returns them from admin/serviceJobs. */
const job = (jobName: string, serviceName: string, parameters: Record<string, string | null>, paused = "N") => ({
  jobName,
  serviceName,
  paused,
  serviceJobParameters: Object.entries(parameters).map(([parameterName, parameterValue]) => ({ parameterName, parameterValue })),
});
const demoCreate = job("DEMO_StageTransferCreate_10010", CREATE.serviceName!, { configId: "DEMO_TO_CREATE", orderId: null, shopId: "10010" });
const demoUpdate = job("DEMO_StageTransferUpdates_10010", UPDATE.serviceName!, { configId: "DEMO_TO_UPDATE", orderId: null, shopId: "10010" });
const createTemplate = job("stage_PendingShopifyTransferOrders", CREATE.serviceName!, { configId: "POST_SHOPIFY_TRANSFER_ORDER", shopId: null }, "Y");

/** The job a card resolved to, for one definition key. */
const matched = (key: string, jobs: any[], shopId = "10010") =>
  useShopifyTransferSyncJobs(() => shopId, () => jobs).cards.value.find((card) => card.definition.key === key)?.job?.jobName;

describe("transfer stager matching", () => {
  it("matches a shop's stager by service and shopId, whatever it is named", () => {
    expect(matched("create", [createTemplate, demoCreate, demoUpdate])).toBe("DEMO_StageTransferCreate_10010");
    expect(matched("update", [createTemplate, demoCreate, demoUpdate])).toBe("DEMO_StageTransferUpdates_10010");
  });

  it("ignores the template, other shops and other services", () => {
    const otherShop = job("stage_PendingShopifyTransferOrders_10000", CREATE.serviceName!, { shopId: "10000" });
    const otherService = job("stage_PendingShopifyTransferOrders_10010", "co.hotwax.other#Service", { shopId: "10010" });

    expect(matched("create", [createTemplate, otherShop, otherService])).toBeUndefined();
  });

  it("prefers an active clone, then the conventional name, when several match", () => {
    const pausedConventional = job("stage_PendingShopifyTransferOrders_10010", CREATE.serviceName!, { shopId: "10010" }, "Y");
    const activeConventional = job("stage_PendingShopifyTransferOrders_10010", CREATE.serviceName!, { shopId: "10010" });

    expect(matched("create", [pausedConventional, demoCreate])).toBe("DEMO_StageTransferCreate_10010");
    expect(matched("create", [demoCreate, activeConventional])).toBe("stage_PendingShopifyTransferOrders_10010");
  });
});

describe("useShopifyTransferSyncJobs", () => {
  beforeEach(() => {
    api.mockReset();
    refreshAfterMutation.mockReset();
  });

  it("reports a differently named running stager as active, with its own config", () => {
    const { cards, deliveryConfigIds } = useShopifyTransferSyncJobs(() => "10010", () => [createTemplate, demoCreate, demoUpdate]);
    const byKey = Object.fromEntries(cards.value.map((card) => [card.definition.key, card]));

    expect(byKey.create).toMatchObject({ status: "active", jobName: "DEMO_StageTransferCreate_10010", configId: "DEMO_TO_CREATE" });
    expect(byKey.update).toMatchObject({ status: "active", jobName: "DEMO_StageTransferUpdates_10010", configId: "DEMO_TO_UPDATE" });
    expect(deliveryConfigIds.value).toEqual({ create: "DEMO_TO_CREATE", update: "DEMO_TO_UPDATE" });
  });

  it("falls back to the seeded config for a shop with no stager", () => {
    const { cards, deliveryConfigIds } = useShopifyTransferSyncJobs(() => "10000", () => [createTemplate, demoCreate]);

    expect(cards.value.find((card) => card.definition.key === "create")).toMatchObject({
      status: "missing", jobName: "stage_PendingShopifyTransferOrders_10000", configId: "POST_SHOPIFY_TRANSFER_ORDER",
    });
    expect(deliveryConfigIds.value).toEqual({ create: "POST_SHOPIFY_TRANSFER_ORDER", update: "UPDATE_SHOPIFY_INVENTORY_TRANSFER" });
  });

  it("returns the server's existing clone instead of creating a second stager", async () => {
    api.mockResolvedValueOnce({ data: { serviceJobList: [createTemplate, demoCreate], serviceJobCount: 2 } });
    const { ensure } = useShopifyTransferSyncJobs(() => "10010", () => []);

    await expect(ensure("create")).resolves.toBe("DEMO_StageTransferCreate_10010");
    expect(api).toHaveBeenCalledTimes(1);
    expect(api.mock.calls[0][0]).toMatchObject({ url: "admin/serviceJobs", method: "get", params: { serviceName: CREATE.serviceName } });
    expect(refreshAfterMutation).toHaveBeenCalledWith("serviceJob", { jobName: "DEMO_StageTransferCreate_10010" });
  });

  it("refuses to create when the existing jobs cannot be read", async () => {
    api.mockResolvedValueOnce({ data: { unexpected: true } });
    const { ensure } = useShopifyTransferSyncJobs(() => "10010", () => []);

    await expect(ensure("create")).rejects.toThrow("could not be read");
    expect(api).toHaveBeenCalledTimes(1);
  });
});

describe("useShopifyTransferSyncLaunch preview", () => {
  beforeEach(() => api.mockReset());

  it("filters each segment by orderEntryDate_from in epoch millis", async () => {
    api.mockResolvedValue({ data: [], headers: { "x-total-count": "0" } });
    const { load, counts } = useShopifyTransferSyncLaunch();

    await load("10010", "2026-10-02T18:21:38.421Z");

    expect(api).toHaveBeenCalledTimes(2);
    for(const [request] of api.mock.calls) {
      expect(request.params).toEqual({ shopId: "10010", orderEntryDate_from: Date.parse("2026-10-02T18:21:38.421Z"), pageSize: 1 });
    }
    expect(counts.value).toEqual({ create: 0, cancellation: 0 });
  });
});
