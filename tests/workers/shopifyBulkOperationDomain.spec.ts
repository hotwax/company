import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ response: undefined as any, calls: [] as any[], upserts: [] as any[][] }));

vi.mock("@common/core/workerRemoteApi", () => ({
  workerPost: vi.fn(async (_ctx: any, url: string, data: any) => {
    state.calls.push({ url, data });
    return state.response;
  }),
}));
vi.mock("@/db/companyDb", () => ({
  companyDb: {
    tables: new Proxy({}, { get: (_target, table) => table }) as any,
    entity: () => ({
      upsertMany: vi.fn(async (rows: any[]) => { state.upserts.push(rows); return rows.length; }),
    }),
  },
}));

import { shopifyBulkOperationDomain } from "@/workers/domains/shopifyBulkOperationDomain";
import { BULK_OPERATION_QUERY } from "@/utils/shopifyBulkOperation";

const ctx = { maargUrl: "https://example.test", token: "token" } as any;
const pk = { id: "gid://shopify/BulkOperation/1", systemMessageRemoteId: "SHOP_REMOTE" };

describe("shopifyBulkOperationDomain", () => {
  beforeEach(() => {
    state.response = undefined;
    state.calls = [];
    state.upserts = [];
  });

  it("is on-demand only: class C, and its sync does nothing", async () => {
    expect(shopifyBulkOperationDomain.syncClass).toBe("C");
    expect(shopifyBulkOperationDomain.table).toBe("shopifyBulkOperations");
    expect(await shopifyBulkOperationDomain.sync(ctx)).toBe(0);
  });

  it("asks Shopify for the operation through the shop's remote and stores it with that remote", async () => {
    state.response = { response: { data: { node: { id: pk.id, status: "COMPLETED" } } } };

    expect(await shopifyBulkOperationDomain.refetchOne!(ctx, pk)).toBe(1);
    expect(state.calls).toEqual([{
      url: "shopify/graphql",
      data: { systemMessageRemoteId: "SHOP_REMOTE", queryText: BULK_OPERATION_QUERY, variables: { id: pk.id } },
    }]);
    expect(state.upserts).toEqual([[{ id: pk.id, status: "COMPLETED", systemMessageRemoteId: "SHOP_REMOTE" }]]);
  });

  it("writes nothing when Shopify returns no node", async () => {
    state.response = { data: { node: null } };
    expect(await shopifyBulkOperationDomain.refetchOne!(ctx, pk)).toBe(0);
    expect(state.upserts).toEqual([]);
  });

  it("does nothing without both the operation id and the remote", async () => {
    expect(await shopifyBulkOperationDomain.refetchOne!(ctx, { id: pk.id })).toBe(0);
    expect(state.calls).toEqual([]);
  });
});
