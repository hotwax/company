import { beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope } from "vue";
import { api } from "@common";
import { useAppVersionHistory } from "@/composables/useAppVersionHistory";

vi.mock("@common", () => ({ api: vi.fn(), commonUtil: { hasError: (r: any) => !!r.data?.error }, logger: { error: vi.fn(), warn: vi.fn() } }));
beforeEach(() => vi.mocked(api).mockReset());
const history = () => { const scope = effectScope(); return { scope, state: scope.run(() => useAppVersionHistory("COMPANY"))! }; };

describe("version edit history", () => {
  it("combines environments for one app, filters the version field and uses username rather than full name", async () => {
    vi.mocked(api).mockResolvedValueOnce({ data: { entityAuditLogs: [{ auditHistorySeqId: "1", oldValueText: "v2.7.0", newValueText: "v2.8.1", changedByUserId: "U1", pkSecondaryValue: "AppEnvProd" }] } } as any)
      .mockResolvedValueOnce({ data: { username: "operator", userFullName: "Other name" } } as any);
    const { scope, state } = history(); await state.loadMore();
    expect(api).toHaveBeenNthCalledWith(1, expect.objectContaining({ url: "admin/entityAuditLogs", params: expect.objectContaining({ changedEntityName: "co.hotwax.app.CommerceAppDeployment", pkPrimaryValue: "COMPANY", changedFieldName: "currentVersion", pageIndex: 0, pageSize: 20 }) }));
    expect(vi.mocked(api).mock.calls[0][0].params).not.toHaveProperty("pkSecondaryValue");
    expect(state.changes.value[0].newValueText).toBe("v2.8.1"); expect(state.usernames.value.U1).toBe("operator"); expect(state.hasMore.value).toBe(false); scope.stop();
  });
  it("retries the failed page without losing earlier changes or duplicating entries", async () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ auditHistorySeqId: String(i), pkSecondaryValue: i % 2 ? "AppEnvUAT" : "AppEnvProd" }));
    vi.mocked(api).mockResolvedValueOnce({ data: { entityAuditLogs: rows } } as any).mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ data: { entityAuditLogs: [rows[19], { auditHistorySeqId: "20", pkSecondaryValue: "AppEnvUAT" }] } } as any);
    const { scope, state } = history(); await state.loadMore(); await state.loadMore();
    expect(state.error.value).toBe(true); expect(state.changes.value).toHaveLength(20);
    await state.loadMore(); expect(state.changes.value).toHaveLength(21); expect(state.error.value).toBe(false);
    expect(vi.mocked(api).mock.calls.map(([config]) => config.params.pageIndex)).toEqual([0, 1, 1]); scope.stop();
  });
  it("distinguishes an empty history from a failed response", async () => {
    vi.mocked(api).mockResolvedValueOnce({ data: { error: "denied" } } as any).mockResolvedValueOnce({ data: { entityAuditLogs: [] } } as any);
    const { scope, state } = history(); await state.loadMore(); expect(state.error.value).toBe(true);
    await state.loadMore(); expect(state.error.value).toBe(false); expect(state.changes.value).toEqual([]); scope.stop();
  });
});
