import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * NS-08: a rule group archived outside the monitor stayed visible. The active-group read is the
 * store's whole active set, but it was merged into the cache with `upsertMany`, so a group the read
 * stopped returning was never removed. It must replace the store's rows instead.
 */

const state = vi.hoisted(() => ({
  groupsResponse: undefined as any,
  calls: [] as Array<{ table: string; op: string; rows: any[]; scope?: any }>,
}));

const entityFor = (table: string) => ({
  upsertMany: vi.fn(async (rows: any[]) => {
    state.calls.push({ table, op: "upsertMany", rows });
    return rows.length;
  }),
  snapshotReplace: vi.fn(async (rows: any[], scope?: any) => {
    state.calls.push({ table, op: "snapshotReplace", rows, scope });
    return { written: rows.length, pruned: 0 };
  }),
  newestCursor: vi.fn(async () => undefined),
});

vi.mock("@/db/companyDb", () => ({
  companyDb: { entity: (table: string) => entityFor(table) },
}));

vi.mock("@common/core/workerRemoteApi", () => ({
  workerGet: vi.fn(async (_ctx: any, url: string) => {
    if (url === "available-to-promise/ruleGroups") return state.groupsResponse;
    if (url === "available-to-promise/decisionRules") return [];
    return { count: 0 };
  }),
  pageNewestFirst: vi.fn(async () => []),
}));

const ctx = { maargUrl: "https://example.test/", token: "token", omsInstance: "demo" } as any;

async function domain() {
  vi.resetModules();
  return (await import("@/workers/domains/netSuiteOrderPushDomain")).netSuiteOrderPushDomain;
}

describe("netSuiteOrderPush rule groups", () => {
  beforeEach(() => {
    state.calls = [];
    state.groupsResponse = undefined;
  });

  it("replaces the store's cached groups with the active set, so an archived group is pruned", async () => {
    // G2 was archived elsewhere: the active read now returns only G1.
    state.groupsResponse = [
      { ruleGroupId: "G1", productStoreId: "STORE", groupTypeEnumId: "RG_NS_ORDER_PUSH", statusId: "ATP_RG_ACTIVE" },
    ];

    await (await domain()).sync(ctx, { productStoreId: "STORE" });

    const groupWrites = state.calls.filter((call) => call.table === "netSuiteRuleGroups");
    expect(groupWrites).toEqual([{
      table: "netSuiteRuleGroups",
      op: "snapshotReplace",
      rows: state.groupsResponse,
      scope: { field: "productStoreId", value: "STORE" },
    }]);
  });

  it("prunes every group of the store when the active read is a genuine empty list", async () => {
    state.groupsResponse = [];

    await (await domain()).sync(ctx, { productStoreId: "STORE" });

    expect(state.calls.filter((call) => call.table === "netSuiteRuleGroups")).toEqual([{
      table: "netSuiteRuleGroups",
      op: "snapshotReplace",
      rows: [],
      scope: { field: "productStoreId", value: "STORE" },
    }]);
  });

  it("leaves the cache alone when the response is not a list", async () => {
    state.groupsResponse = { errors: "unexpected envelope" };

    await (await domain()).sync(ctx, { productStoreId: "STORE" });

    expect(state.calls.filter((call) => call.table === "netSuiteRuleGroups")).toEqual([]);
  });
});
