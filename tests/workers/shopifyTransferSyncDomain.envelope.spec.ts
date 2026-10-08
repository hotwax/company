import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  domains: [] as any[],
  response: undefined as any,
  snapshotReplace: vi.fn().mockResolvedValue({ written: 0 }),
}));
vi.mock("@common/core/workerRemoteApi", () => ({
  default: vi.fn(({ url }: { url: string }) => Promise.resolve(url.includes("pendingCreate") ? state.response : [])),
}));
vi.mock("@/utils/cacheEntities", () => ({ shopifyTransferPendingCache: { snapshotReplace: state.snapshotReplace } }));
vi.mock("@/workers/syncRegistry", () => ({ registerSyncDomain: (domain: any) => { state.domains.push(domain); } }));

const ctx = { maargUrl: "https://example.test", token: "test" };

// Exercise the real page walker: a failed or incomplete list must never replace cached work.
describe("transfer pending snapshot validation", () => {
  beforeEach(() => {
    vi.resetModules();
    state.domains = [];
    state.snapshotReplace.mockClear();
  });

  it.each([null, { errors: ["Query failed"] }, { unexpected: [] }])("retains the failed segment for envelope %j", async (response) => {
    state.response = response;
    await import("@/workers/domains/shopifyTransferSyncDomain");
    const domain = state.domains.find(row => row.name === "shopifyTransferSync");

    await expect(domain.sync(ctx, { shopId: "SHOP" })).rejects.toMatchObject({
      details: { failedSegments: { create: { message: expect.stringContaining("bare array") } } },
    });
    expect(state.snapshotReplace).toHaveBeenCalledTimes(4);
    expect(state.snapshotReplace.mock.calls.every(([, scope]) => scope.value[1] !== "create")).toBe(true);
  });

  it("retains cached rows when pagination repeats a full page", async () => {
    state.response = [{ orderId: "O1", shopId: "SHOP" }];
    await import("@/workers/domains/shopifyTransferSyncDomain");
    const domain = state.domains.find(row => row.name === "shopifyTransferSync");

    await expect(domain.sync(ctx, { shopId: "SHOP", batchSize: 1 })).rejects.toMatchObject({
      details: { failedSegments: { create: { message: expect.stringContaining("no progress") } } },
    });
    expect(state.snapshotReplace).toHaveBeenCalledTimes(4);
  });
});
