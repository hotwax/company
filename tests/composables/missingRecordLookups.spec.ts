import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  refreshAfterMutation: vi.fn(),
  rows: {} as Record<string, Record<string, any>>,
  upsertMany: vi.fn(),
}));

vi.mock("@common", () => ({
  api: (...args: any[]) => mocks.api(...args),
  commonUtil: { hasError: () => false, showToast: vi.fn() },
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  translate: (value: string) => value,
  useLiveEntity: () => ({ records: { value: [] }, hydrated: { value: true } }),
}));
vi.mock("@/db/appDbSync", () => ({ refreshAfterMutation: (...args: any[]) => mocks.refreshAfterMutation(...args) }));
vi.mock("@/db/shopifySyncDb", () => ({ clearStorage: vi.fn(), getErrorRecords: vi.fn(), setErrorRecords: vi.fn() }));
vi.mock("@/db/companyDb", () => ({
  companyDb: {
    tables: new Proxy({}, { get: (_target, table) => table }) as any,
    entity: (table: string) => ({
      get: vi.fn(async (key: string) => mocks.rows[table]?.[key]),
      all: vi.fn(async () => Object.values(mocks.rows[table] ?? {})),
      query: vi.fn(async () => []),
      upsertMany: (...args: any[]) => mocks.upsertMany(...args),
    }),
  },
}));

import { useDataManager } from "@/composables/useDataManager";
import { useSystemMessage } from "@/composables/useSystemMessage";

beforeEach(() => {
  mocks.api.mockReset();
  mocks.refreshAfterMutation.mockReset().mockResolvedValue(1);
  mocks.upsertMany.mockReset();
  mocks.rows = {};
});

describe("requestDataManagerLog", () => {
  it("asks the dataManagerLog domain for the log, and stores nothing itself", async () => {
    expect(await useDataManager().requestDataManagerLog("L2")).toBeUndefined();
    expect(mocks.refreshAfterMutation).toHaveBeenCalledWith("dataManagerLog", { logId: "L2" });
    expect(mocks.api).not.toHaveBeenCalled();
    expect(mocks.upsertMany).not.toHaveBeenCalled();
  });

  it("asks nothing without a log id", async () => {
    await useDataManager().requestDataManagerLog("");
    expect(mocks.refreshAfterMutation).not.toHaveBeenCalled();
  });

  it("swallows a failed refresh, so a fire-and-forget caller cannot reject", async () => {
    mocks.refreshAfterMutation.mockRejectedValue(new Error("offline"));

    await expect(useDataManager().requestDataManagerLog("L3")).resolves.toBeUndefined();
  });
});

describe("requestSystemMessage", () => {
  it("asks the systemMessage domain for the message, and stores nothing itself", async () => {
    expect(await useSystemMessage().requestSystemMessage("M2")).toBeUndefined();
    expect(mocks.refreshAfterMutation).toHaveBeenCalledWith("systemMessage", { systemMessageId: "M2" });
    expect(mocks.api).not.toHaveBeenCalled();
    expect(mocks.upsertMany).not.toHaveBeenCalled();
  });

  it("swallows a failed refresh, so a fire-and-forget caller cannot reject", async () => {
    mocks.refreshAfterMutation.mockRejectedValue(new Error("offline"));

    await expect(useSystemMessage().requestSystemMessage("M3")).resolves.toBeUndefined();
  });
});

describe("requestShopifyBulkOperation", () => {
  const id = "gid://shopify/BulkOperation/9";

  it("asks the shopifyBulkOperation domain for the operation, and stores nothing itself", async () => {
    expect(await useSystemMessage().requestShopifyBulkOperation(id, "REMOTE")).toBeUndefined();
    expect(mocks.refreshAfterMutation).toHaveBeenCalledWith("shopifyBulkOperation", { id, systemMessageRemoteId: "REMOTE" });
    expect(mocks.api).not.toHaveBeenCalled();
    expect(mocks.upsertMany).not.toHaveBeenCalled();
  });

  it("rethrows a failed fetch, which screens show as status unavailable", async () => {
    mocks.refreshAfterMutation.mockRejectedValue(new Error("Shopify unavailable"));

    await expect(useSystemMessage().requestShopifyBulkOperation(id, "REMOTE")).rejects.toThrow("Shopify unavailable");
  });
});
