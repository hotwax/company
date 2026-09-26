/* eslint-disable require-await -- async boundary test doubles */
import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ domain: null as any, rows: [] as any[], fail: false, snapshots: [] as any[] }));
vi.mock("@/workers/syncRegistry", () => ({ registerSyncDomain: (domain: any) => { state.domain = domain; } }));
vi.mock("@/workers/domains/workerFetch", () => ({
  pageAll: async () => {
    if(state.fail) {throw new Error("incomplete");}

    return state.rows;
  },
  workerGet: async () => ({ summary: { backlogCount: 0 } }),
}));
vi.mock("@/utils/cacheEntities", () => ({
  shopifyLocationInventoryAdjustmentDetailCache: { snapshotReplace: async (rows: any[], scope: any) => {
    state.snapshots.push({ rows, scope });

    return { written: rows.length };
  } },
  shopifyLocationInventorySummaryCache: { upsertMany: async () => 1 },
}));
beforeEach(async () => {
  state.rows = []; state.fail = false; state.snapshots = [];
  vi.resetModules(); await import("@/workers/domains/shopifyLocationInventoryDomain");
});
it("replaces only the requested shop with a complete authoritative empty result", async () => {
  await state.domain.sync({}, { shopId: "A" });
  expect(state.snapshots).toEqual([{ rows: [], scope: { field: "shopId", value: "A" } }]);
});
it("preserves the snapshot on failed or incomplete pagination", async () => {
  state.fail = true;
  await expect(state.domain.sync({}, { shopId: "A" })).rejects.toThrow("incomplete");
  expect(state.snapshots).toEqual([]);
});
it("retains API message status without message enrichment", async () => {
  state.rows = [{ shopId: "A", systemMessageId: "M1", systemMessageStatusId: "SmsgProduced" }];
  await state.domain.sync({}, { shopId: "A" });
  expect(state.snapshots[0].rows[0].systemMessageStatusId).toBe("SmsgProduced");
});
