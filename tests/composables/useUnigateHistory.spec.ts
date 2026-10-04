// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useUnigateHistory } from "@/composables/useUnigateHistory";

const harness = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@common", () => ({ api: (...args: any[]) => harness.api(...args), commonUtil: { hasError: (res: any) => Boolean(res?.data?.error) } }));
beforeEach(() => vi.clearAllMocks());
const audit = (id: string, field = "internalId", extra = {}) => ({ auditHistorySeqId: id, changedEntityName: "moqui.service.message.SystemMessageRemote", pkPrimaryValue: "UNIGATE_CONFIG", changedFieldName: field, changedDate: "2026-10-03T12:00:00Z", changedByUserId: "operator", oldValueText: "before", newValueText: "after", ...extra });

describe("UniGate edit history", () => {
  it("scopes the uncached query and excludes unrelated audit records", async () => {
    harness.api.mockResolvedValue({ data: { entityAuditLogs: [audit("1"), audit("2", "internalId", { pkPrimaryValue: "OTHER" })] } });
    const state = useUnigateHistory();
    await state.load();
    expect(harness.api).toHaveBeenCalledWith(expect.objectContaining({ url: "admin/entityAuditLogs", cache: false, params: expect.objectContaining({ changedEntityName: "moqui.service.message.SystemMessageRemote", pkPrimaryValue: "UNIGATE_CONFIG", orderByField: "-changedDate" }) }));
    expect(state.rows.value).toHaveLength(1);
    expect(state.rows.value[0]).toMatchObject({ field: "internalId", changedBy: "operator", oldValue: "before", newValue: "after" });
  });
  it("never retains secret values and strips credentials, queries and fragments from URL history", async () => {
    const fields = ["publicKey", "password", "privateKey", "sharedSecret", "futureCredential"];
    harness.api.mockResolvedValue({ data: { entityAuditLogs: [...fields.map((field, index) => audit(String(index), field)), audit("url", "sendUrl", { newValueText: "https://user:secret@example.com/rest/?key=secret#secret" })] } });
    const state = useUnigateHistory();
    await state.load();
    for(const row of state.rows.value.slice(0, fields.length)) {
      expect(row).not.toHaveProperty("oldValue");
      expect(row).not.toHaveProperty("newValue");
    }
    expect(state.rows.value.at(-1)?.newValue).toBe("https://example.com/rest/");
    expect(JSON.stringify(state.rows.value)).not.toContain("secret");
  });
  it("paginates, deduplicates overlapping rows and refreshes from the first page", async () => {
    harness.api.mockResolvedValueOnce({ data: { entityAuditLogs: Array.from({ length: 20 }, (_, index) => audit(String(index))) } }).mockResolvedValueOnce({ data: { entityAuditLogs: [audit("19"), audit("20")] } }).mockResolvedValueOnce({ data: { entityAuditLogs: [] } });
    const state = useUnigateHistory();
    await state.load();
    expect(state.hasMore.value).toBe(true);
    await state.load(false);
    expect(harness.api.mock.calls[1][0].params.pageIndex).toBe(1);
    expect(state.rows.value).toHaveLength(21);
    expect(state.hasMore.value).toBe(false);
    await state.load();
    expect(harness.api.mock.calls[2][0].params.pageIndex).toBe(0);
    expect(state.rows.value).toEqual([]);
  });
  it("shows read failures instead of interpreting them as an empty history", async () => {
    const state = useUnigateHistory();
    for(const response of [{ data: {} }, { data: { error: true, entityAuditLogs: [] } }]) {
      harness.api.mockResolvedValueOnce(response);
      await state.load();
      expect(state.error.value).toBe(true);
      expect(state.loading.value).toBe(false);
    }
  });
});
