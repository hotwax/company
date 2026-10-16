import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  response: undefined as any,
  calls: [] as any[],
  stored: [] as any[],
  replaced: [] as Array<{ rows: any[]; scope: any }>,
  removed: [] as any[][],
}));

vi.mock("@common/core/workerRemoteApi", () => ({
  workerGet: vi.fn(async (_ctx: any, url: string, params: any) => {
    state.calls.push({ url, params });
    return state.response;
  }),
}));
vi.mock("@/db/companyDb", () => ({
  companyDb: {
    tables: new Proxy({}, { get: (_target, table) => table }) as any,
    entity: () => ({
      query: vi.fn(async (options: any) => {
        if (options.equals) return state.stored.filter((row) => row.logContentId === options.equals.logContentId);
        return state.stored.filter((row) => row.fetchedAt <= options.until);
      }),
      snapshotReplace: vi.fn(async (rows: any[], scope: any) => {
        state.replaced.push({ rows, scope });
        return { written: rows.length, pruned: 0 };
      }),
      bulkRemove: vi.fn(async (keys: any[]) => { state.removed.push(keys); }),
    }),
  },
}));

import { ERROR_RECORD_TTL_MS } from "@/config/appSyncConfig";
import { dataManagerErrorRecordDomain, parseErrorFile } from "@/workers/domains/dataManagerErrorRecordDomain";

const ctx = { maargUrl: "https://example.test", token: "token" } as any;
const pk = { configId: "SYNC_SHOPIFY_PRODUCT", logContentId: "LC1" };

describe("dataManagerErrorRecordDomain", () => {
  beforeEach(() => {
    state.response = undefined;
    state.calls = [];
    state.stored = [];
    state.replaced = [];
    state.removed = [];
  });

  it("is on-demand only: class C, and its sync does nothing", async () => {
    expect(dataManagerErrorRecordDomain.syncClass).toBe("C");
    expect(dataManagerErrorRecordDomain.table).toBe("dataManagerErrorRecords");
    expect(await dataManagerErrorRecordDomain.sync(ctx)).toBe(0);
    expect(state.calls).toEqual([]);
  });

  it("downloads a JSON error file and replaces that log's rows, lifting the searched fields", async () => {
    state.response = { csvData: JSON.stringify([
      { virtualProduct: { id: "gid://shopify/Product/42", title: "Shirt", handle: "shirt", variants: [{ sku: "S-1" }] }, _ERROR_MESSAGE_: "Bad price" },
    ]) };

    expect(await dataManagerErrorRecordDomain.refetchOne!(ctx, pk)).toBe(1);
    expect(state.calls).toEqual([{ url: "admin/dataManager/downloadDataManagerFile", params: { configId: "SYNC_SHOPIFY_PRODUCT", logContentId: "LC1" } }]);
    const [{ rows, scope }] = state.replaced;
    expect(scope).toEqual({ field: "logContentId", value: "LC1" });
    expect(rows[0]).toMatchObject({ logContentId: "LC1", seqId: 0, numericId: "42", title: "Shirt", handle: "shirt", sku: "S-1", error: "Bad price" });
    expect(rows[0].raw.virtualProduct.title).toBe("Shirt");
  });

  it("stores a CSV error file too", async () => {
    state.response = { csvData: " sku ,error\nS-1,Missing title\nS-2,Bad price\n" };

    expect(await dataManagerErrorRecordDomain.refetchOne!(ctx, pk)).toBe(2);
    expect(state.replaced[0].rows.map((row: any) => [row.seqId, row.sku, row.error]))
      .toEqual([[0, "S-1", "Missing title"], [1, "S-2", "Bad price"]]);
  });

  it("answers from the table while the log's rows are younger than two hours", async () => {
    state.stored = [{ logContentId: "LC1", seqId: 0, fetchedAt: Date.now() - 1000 }];

    expect(await dataManagerErrorRecordDomain.refetchOne!(ctx, pk)).toBe(1);
    expect(state.calls).toEqual([]);
  });

  it("downloads again once the rows have expired, or when forced", async () => {
    state.response = { csvData: "[]" };
    state.stored = [{ logContentId: "LC1", seqId: 0, fetchedAt: Date.now() - ERROR_RECORD_TTL_MS - 1 }];
    await dataManagerErrorRecordDomain.refetchOne!(ctx, pk);

    state.stored = [{ logContentId: "LC1", seqId: 0, fetchedAt: Date.now() }];
    await dataManagerErrorRecordDomain.refetchOne!(ctx, { ...pk, force: true });

    expect(state.calls).toHaveLength(2);
  });

  it("prunes every expired row after it writes", async () => {
    state.response = { csvData: "[]" };
    state.stored = [
      { logContentId: "OLD", seqId: 3, fetchedAt: Date.now() - ERROR_RECORD_TTL_MS - 1 },
      { logContentId: "NEW", seqId: 0, fetchedAt: Date.now() },
    ];

    await dataManagerErrorRecordDomain.refetchOne!(ctx, pk);
    expect(state.removed).toEqual([[["OLD", 3]]]);
  });

  it("does nothing without a config id and a log content id", async () => {
    expect(await dataManagerErrorRecordDomain.refetchOne!(ctx, { logContentId: "LC1" })).toBe(0);
    expect(state.calls).toEqual([]);
  });
});

describe("parseErrorFile", () => {
  it("reads a JSON array, CSV, or nothing", () => {
    expect(parseErrorFile('[{"a":1}]')).toEqual([{ a: 1 }]);
    expect(parseErrorFile([{ a: 1 }])).toEqual([{ a: 1 }]);
    expect(parseErrorFile("a\n1\n")).toEqual([{ a: "1" }]);
    expect(parseErrorFile('{"not":"a list"}')).toEqual([]);
    expect(parseErrorFile(undefined)).toEqual([]);
  });
});
