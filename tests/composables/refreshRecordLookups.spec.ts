import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  refreshRecord: vi.fn(),
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
vi.mock("@/services/appDbSync", () => ({ refreshRecord: (...args: any[]) => mocks.refreshRecord(...args) }));
vi.mock("@/utils/storage", () => ({ clearStorage: vi.fn(), getErrorRecords: vi.fn(), setErrorRecords: vi.fn() }));
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
  mocks.refreshRecord.mockReset().mockResolvedValue(1);
  mocks.upsertMany.mockReset();
  mocks.rows = {};
});

describe("ensureDataManagerLog", () => {
  it("serves a cached log without asking the worker", async () => {
    mocks.rows.dataManagerLogs = { L1: { logId: "L1" } };

    expect(await useDataManager().ensureDataManagerLog("L1")).toEqual({ logId: "L1" });
    expect(mocks.refreshRecord).not.toHaveBeenCalled();
  });

  it("asks the dataManagerLog domain on a miss, then reads the stored row", async () => {
    mocks.refreshRecord.mockImplementation(async () => {
      mocks.rows.dataManagerLogs = { L2: { logId: "L2", statusId: "DmlsFinished" } };
      return 1;
    });

    expect(await useDataManager().ensureDataManagerLog("L2")).toEqual({ logId: "L2", statusId: "DmlsFinished" });
    expect(mocks.refreshRecord).toHaveBeenCalledWith("dataManagerLog", { logId: "L2" });
    expect(mocks.api).not.toHaveBeenCalled();
    expect(mocks.upsertMany).not.toHaveBeenCalled();
  });

  it("resolves null when the refresh fails", async () => {
    mocks.refreshRecord.mockRejectedValue(new Error("offline"));

    expect(await useDataManager().ensureDataManagerLog("L3")).toBeNull();
  });
});

describe("ensureSystemMessageById", () => {
  it("serves a cached message without asking the worker", async () => {
    mocks.rows.systemMessages = { M1: { systemMessageId: "M1" } };

    expect(await useSystemMessage().ensureSystemMessageById("M1")).toEqual({ systemMessageId: "M1" });
    expect(mocks.refreshRecord).not.toHaveBeenCalled();
  });

  it("asks the systemMessage domain on a miss, then reads the stored row", async () => {
    mocks.refreshRecord.mockImplementation(async () => {
      mocks.rows.systemMessages = { M2: { systemMessageId: "M2", statusId: "SmsgSent" } };
      return 1;
    });

    expect(await useSystemMessage().ensureSystemMessageById("M2")).toEqual({ systemMessageId: "M2", statusId: "SmsgSent" });
    expect(mocks.refreshRecord).toHaveBeenCalledWith("systemMessage", { systemMessageId: "M2" });
    expect(mocks.api).not.toHaveBeenCalled();
    expect(mocks.upsertMany).not.toHaveBeenCalled();
  });

  it("resolves null when the refresh fails", async () => {
    mocks.refreshRecord.mockRejectedValue(new Error("offline"));

    expect(await useSystemMessage().ensureSystemMessageById("M3")).toBeNull();
  });
});
