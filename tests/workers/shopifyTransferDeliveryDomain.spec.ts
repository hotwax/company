import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ domain: undefined as any, cached: [] as any[], post: vi.fn(), get: vi.fn(), write: vi.fn() }));
vi.mock("@/workers/syncRegistry", () => ({ registerSyncDomain: (domain: any) => { state.domain = domain; } }));
vi.mock("@/utils/cacheEntities", () => ({ dataManagerLogCache: { all: () => Promise.resolve(state.cached), upsertMany: state.write } }));
vi.mock("@/workers/domains/workerFetch", () => ({ workerPost: state.post, workerGet: state.get }));
import "@/workers/domains/shopifyTransferDeliveryDomain";

const scopeRow = { logId: "L", configId: "POST_SHOPIFY_TRANSFER_ORDER", parameterName: "transferShopId", parameterValue: "UK", finishDateTime: 200, failedRecordCount: 0 };
const log = { logId: "L", configId: "POST_SHOPIFY_TRANSFER_ORDER", fileSize: 100, logContentId: "C", statusId: "DmlsFinished", finishDateTime: 200, failedRecordCount: 0 };

describe("transfer delivery worker", () => {
  beforeEach(() => {
    vi.clearAllMocks(); state.cached = [];
    state.post.mockImplementation((_ctx, _url, body) => Promise.resolve({ entityValueList: body.customParametersMap.configId === log.configId ? [scopeRow] : [] }));
    state.get.mockImplementation((_ctx, url) => Promise.resolve(url.includes("download") ? { csvData: JSON.stringify([{ shopId: "UK", orderId: "TO" }]) } : { dataManagerLogs: [log] }));
    state.write.mockResolvedValue(1);
  });
  it("discovers by the shop parameter even when the stager returns no valid log IDs", async () => {
    await state.domain.sync({}, { shopId: "UK" });
    expect(state.post.mock.calls.every(([, , body]) => body.customParametersMap.parameterName === "transferShopId" && body.customParametersMap.parameterValue === "UK" && body.pageSize === 5)).toBe(true);
    expect(state.write.mock.calls[0][0][0]).toMatchObject({ transferShopId: "UK", transferOrderIds: ["TO"] });
  });
  it("fails closed on cross-shop results", async () => {
    state.post.mockResolvedValue({ entityValueList: [{ ...scopeRow, parameterValue: "US" }] });
    await expect(state.domain.sync({}, { shopId: "UK" })).rejects.toThrow("scope");
    expect(state.get).not.toHaveBeenCalled();
  });
  it("rechecks an in-flight log without downloading the source file again", async () => {
    state.cached = [{ logId: "L", raw: { ...log, statusId: "DmlsRunning", createdDate: Date.now(), finishDateTime: null, transferShopId: "UK", transferOrderIds: ["TO"] } }];
    await state.domain.sync({}, { shopId: "UK" });
    expect(state.get).toHaveBeenCalledTimes(1);
    expect(state.write.mock.calls[0][0][0].statusId).toBe("DmlsFinished");
  });
  it("refreshes a cached unfinished log outside the newest five and retains its transfer membership", async () => {
    state.cached = [{ logId: "L", raw: { ...log, statusId: "DmlsRunning", createdDate: Date.now(), finishDateTime: null, transferShopId: "UK", transferOrderIds: ["TO"] } }];
    state.post.mockImplementation((_ctx, _url, body) => Promise.resolve({ entityValueList: body.customParametersMap.configId === log.configId ? Array.from({ length: 5 }, (_, i) => ({ ...scopeRow, logId: `new-${i}` })) : [] }));
    state.get.mockImplementation((_ctx, _url, { logId }) => Promise.resolve({ dataManagerLogs: [{ ...log, logId, fileSize: 1_000_000 }] }));
    await state.domain.sync({}, { shopId: "UK" });
    expect(state.get.mock.calls.map(([, , params]) => params.logId)).toEqual(["new-0", "new-1", "new-2", "new-3", "new-4", "L"]);
    expect(state.write.mock.calls.at(-1)?.[0][0]).toMatchObject({ logId: "L", statusId: "DmlsFinished", transferOrderIds: ["TO"] });
  });
  it("bounds extra refreshes to five recent in-flight logs for this shop and configuration", async () => {
    const recent = { ...log, statusId: "DmlsRunning", createdDate: Date.now(), finishDateTime: null, transferShopId: "UK", transferOrderIds: ["TO"] };
    state.cached = [...Array.from({ length: 6 }, (_, i) => ({ ...recent, logId: `old-${i}`, createdDate: recent.createdDate - i })),
      { ...recent, logId: "US", transferShopId: "US" }, { ...recent, logId: "other", configId: "OTHER" },
      { ...recent, logId: "expired", createdDate: recent.createdDate - 6 * 60 * 60 * 1000 },
      { ...recent, logId: "cancelled", statusId: "DmlsCancelled" }].map(raw => ({ logId: raw.logId, raw }));
    state.post.mockResolvedValue({ entityValueList: [] });
    state.get.mockImplementation((_ctx, _url, { logId }) => Promise.resolve({ dataManagerLogs: [{ ...log, logId }] }));
    await state.domain.sync({}, { shopId: "UK" });
    expect(state.get.mock.calls.map(([, , params]) => params.logId)).toEqual(["old-0", "old-1", "old-2", "old-3", "old-4"]);
  });
  it.each([null, {}, { entityValueList: {} }, { _ERROR_MESSAGE_: "Unavailable" }, { entityValueList: [], errors: ["Unavailable"] }, { entityValueList: [], _ERROR_MESSAGE_LIST_: ["Unavailable"] }])("rejects unavailable or unrecognized discovery responses: %j", async response => {
    state.post.mockResolvedValue(response);
    await expect(state.domain.sync({}, { shopId: "UK" })).rejects.toThrow("discovery response");
    expect(state.get).not.toHaveBeenCalled();
    expect(state.write).not.toHaveBeenCalled();
  });
  it("accepts a verified empty discovery result", async () => {
    state.post.mockResolvedValue({ entityValueList: [] });
    await expect(state.domain.sync({}, { shopId: "UK" })).resolves.toBe(0);
    expect(state.get).not.toHaveBeenCalled();
  });
  it("keeps large files at batch scope and quiets unchanged completed logs", async () => {
    state.get.mockResolvedValue({ dataManagerLogs: [{ ...log, fileSize: 1_000_000 }] });
    await state.domain.sync({}, { shopId: "UK" });
    expect(state.get).toHaveBeenCalledTimes(1);
    const stored = state.write.mock.calls[0][0][0];
    expect(stored.transferOrderIds).toBeUndefined();
    state.cached = [{ logId: "L", raw: stored }];
    state.get.mockClear();
    await state.domain.sync({}, { shopId: "UK" });
    expect(state.get).not.toHaveBeenCalled();
  });
});
