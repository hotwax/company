import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ get: vi.fn(), snapshot: vi.fn(), upsert: vi.fn(), marked: vi.fn(), synced: vi.fn() }));
vi.mock("@common/core/workerRemoteApi", () => ({ workerGet: state.get }));
vi.mock("@/db/companyDb", () => ({ companyDb: {
  tables: { documentTemplates: "documentTemplates", documentTemplateHistories: "documentTemplateHistories" },
  entity: () => ({ snapshotReplace: state.snapshot, upsertMany: state.upsert }),
  client: () => ({ syncedThisLogin: state.synced, markSyncedThisLogin: state.marked }),
} }));
import { documentTemplateDomain, documentTemplateHistoryDomain } from "@/workers/domains/documentTemplateDomains";

const ctx = { token: "test", omsInstance: "local", now: 1 };
beforeEach(() => {
  vi.resetAllMocks(); state.snapshot.mockResolvedValue({ written: 1 }); state.upsert.mockResolvedValue(1);
});
describe("native document template metadata sync", () => {
  it("snapshots a valid complete collection once per login", async () => {
    state.get.mockResolvedValue({ documentResult: { ok: true, templates: [{ documentTemplateId: "packing" }] } });
    expect(await documentTemplateDomain.sync(ctx)).toBe(1);
    expect(state.get).toHaveBeenCalledWith(ctx, "poorti/documentTemplates");
    expect(state.snapshot).toHaveBeenCalledWith([{ documentTemplateId: "packing" }]);
    expect(state.marked).toHaveBeenCalledWith("documentTemplate");
    state.synced.mockResolvedValue(true); state.get.mockClear();
    await documentTemplateDomain.sync(ctx);
    expect(state.get).not.toHaveBeenCalled();
  });
  it("preserves cached rows on denied or malformed collections", async () => {
    for (const documentResult of [{ ok: false, code: "ACCESS_DENIED" }, { ok: true }, { ok: true, templates: [{}] }]) {
      state.get.mockResolvedValue({ documentResult });
      await expect(documentTemplateDomain.sync(ctx)).rejects.toThrow();
    }
    expect(state.snapshot).not.toHaveBeenCalled(); expect(state.marked).not.toHaveBeenCalled();
  });
  it("reads every native history page before replacing the cached history", async () => {
    const revisions = Array.from({ length: 100 }, (_, index) => ({ versionName: String(index) }));
    state.get.mockResolvedValueOnce({ documentResult: { ok: true, revisions, publications: [] } })
      .mockResolvedValueOnce({ documentResult: { ok: true, revisions: [{ versionName: "last" }], publications: [] } });
    await documentTemplateHistoryDomain.refetchOne!(ctx, { documentTemplateId: "packing" });
    expect(state.get).toHaveBeenNthCalledWith(2, ctx, "poorti/documentTemplates/packing/history", { limit: 100, offset: 100 });
    expect(state.upsert.mock.calls[0][0][0].revisions).toHaveLength(101);
  });
  it("keeps existing history when a later page fails", async () => {
    state.get.mockResolvedValueOnce({ documentResult: { ok: true, revisions: Array(100).fill({ versionName: "1" }), publications: [] } }).mockRejectedValueOnce(new Error("offline"));
    await expect(documentTemplateHistoryDomain.refetchOne!(ctx, { documentTemplateId: "packing" })).rejects.toThrow("offline");
    expect(state.upsert).not.toHaveBeenCalled();
  });
});
