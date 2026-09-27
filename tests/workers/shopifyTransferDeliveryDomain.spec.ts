import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ domain: undefined as any, cached: [] as any[], post: vi.fn(), get: vi.fn(), write: vi.fn() }));
vi.mock("@/workers/syncRegistry", () => ({ registerSyncDomain: (domain: any) => { state.domain = domain; } }));
vi.mock("@/utils/cacheEntities", () => ({ dataManagerLogCache: { all: () => Promise.resolve(state.cached), upsertMany: state.write } }));
vi.mock("@/workers/domains/workerFetch", () => ({ workerPost: state.post, workerGet: state.get, unwrapCollection: (response: any) => response.entityValueList }));
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
    state.cached = [{ logId: "L", raw: { ...log, finishDateTime: null, transferShopId: "UK", transferOrderIds: ["TO"] } }];
    await state.domain.sync({}, { shopId: "UK" });
    expect(state.get).toHaveBeenCalledTimes(1);
    expect(state.write.mock.calls[0][0][0].statusId).toBe("DmlsFinished");
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
