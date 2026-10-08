import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  /** What the pendingCreate endpoint answers; every other segment answers an empty list. */
  response: undefined as any,
  snapshotReplace: vi.fn().mockResolvedValue({ written: 0, pruned: 0 }),
}));

// The real page walker from @common runs; only the transport and the cache are stubbed.
vi.stubGlobal("fetch", vi.fn(async (url: string) => ({
  ok: true,
  status: 200,
  json: async () => (String(url).includes("pendingCreate") ? state.response : []),
})));

vi.mock("@/db/companyDb", () => ({
  companyDb: { entity: () => ({ snapshotReplace: state.snapshotReplace }) },
}));

const ctx = { maargUrl: "https://example.test/rest/s1/", token: "test", omsInstance: "demo", now: 0 } as any;

async function loadDomain() {
  const { shopifyTransferSyncDomain } = await import("@/workers/domains/shopifyTransferSyncDomain");
  return shopifyTransferSyncDomain;
}

// Exercise the real page walker: a failed or incomplete list must never replace cached work.
describe("transfer pending snapshot validation", () => {
  beforeEach(() => {
    vi.resetModules();
    state.snapshotReplace.mockClear();
  });

  it.each([null, { errors: ["Query failed"] }, { unexpected: [] }])("retains the failed segment for envelope %j", async (response) => {
    state.response = response;
    const domain = await loadDomain();

    await expect(domain.sync(ctx, { shopId: "SHOP" })).rejects.toMatchObject({
      details: { failedSegments: { create: { message: expect.stringContaining("bare array") } } },
    });
    expect(state.snapshotReplace).toHaveBeenCalledTimes(4);
    expect(state.snapshotReplace.mock.calls.every(([, scope]) => scope.value[1] !== "create")).toBe(true);
  });

  it("retains cached rows when pagination repeats a full page", async () => {
    state.response = [{ orderId: "O1", shopId: "SHOP" }];
    const domain = await loadDomain();

    await expect(domain.sync(ctx, { shopId: "SHOP", batchSize: 1 })).rejects.toMatchObject({
      details: { failedSegments: { create: { message: expect.stringContaining("no new records") } } },
    });
    expect(state.snapshotReplace).toHaveBeenCalledTimes(4);
  });
});
