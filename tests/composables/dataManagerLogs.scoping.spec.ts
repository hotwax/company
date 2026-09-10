import { describe, expect, it, vi } from "vitest";

vi.mock("@common", () => ({ api: vi.fn(), logger: { error: vi.fn() } }));
vi.mock("@/utils/cacheEntities", () => ({ dataManagerLogCache: {} }));
vi.mock("@/composables/useCachedList", () => ({
  useCachedList: vi.fn(),
  useCachedRecord: vi.fn(),
}));
vi.mock("@/utils/storage", () => ({
  clearStorage: vi.fn(),
  getErrorRecords: vi.fn(),
  setErrorRecords: vi.fn(),
}));
vi.mock("papaparse", () => ({ default: { parse: vi.fn() } }));

import { scopeDataManagerLogsToMessages } from "@/composables/useDataManager";

describe("scopeDataManagerLogsToMessages", () => {
  const logs = [
    { logId: "other-new", systemMessageId: "OTHER-2", configId: "SYNC_SHOPIFY_PRODUCT" },
    { logId: "shop-new", systemMessageId: "SHOP-2", configId: "SYNC_SHOPIFY_PRODUCT" },
    { logId: "other-old", systemMessageId: "OTHER-1", configId: "SYNC_SHOPIFY_PRODUCT" },
    { logId: "shop-old", systemMessageId: "SHOP-1", configId: "SYNC_SHOPIFY_PRODUCT" },
  ];

  it("applies the row limit after selecting logs that belong to the current shop messages", () => {
    expect(scopeDataManagerLogsToMessages(logs, ["SHOP-2", "SHOP-1"], 2).map((row) => row.logId))
      .toEqual(["shop-new", "shop-old"]);
  });

  it("returns no logs before the current shop message spine is known", () => {
    expect(scopeDataManagerLogsToMessages(logs, [], 10)).toEqual([]);
  });
});
