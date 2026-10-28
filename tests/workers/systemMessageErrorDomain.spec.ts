import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ response: [] as any, calls: [] as any[], upserts: [] as any[][] }));

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
      upsertMany: vi.fn(async (rows: any[]) => { state.upserts.push(rows); return rows.length; }),
    }),
  },
}));

import { systemMessageErrorDomain } from "@/workers/domains/systemMessageErrorDomain";

const ctx = { maargUrl: "https://example.test", token: "token" } as any;

describe("systemMessageErrorDomain", () => {
  beforeEach(() => {
    state.response = [];
    state.calls = [];
    state.upserts = [];
  });

  it("is on-demand only: class C, and its sync does nothing", async () => {
    expect(systemMessageErrorDomain.syncClass).toBe("C");
    expect(systemMessageErrorDomain.table).toBe("systemMessageErrors");
    expect(await systemMessageErrorDomain.sync(ctx)).toBe(0);
    expect(state.calls).toEqual([]);
  });

  it("fetches one message's errors, newest first, and stamps the message id onto each row", async () => {
    state.response = [{ errorDate: 5, errorText: "Timed out" }];

    expect(await systemMessageErrorDomain.refetchOne!(ctx, { systemMessageId: "M/1" })).toBe(1);
    expect(state.calls).toEqual([{ url: "admin/systemMessages/M%2F1/errors", params: { orderByField: "-errorDate", pageSize: 50 } }]);
    expect(state.upserts).toEqual([[{ errorDate: 5, errorText: "Timed out", systemMessageId: "M/1" }]]);
  });

  it("writes nothing for a message with no errors or an unexpected response", async () => {
    state.response = { unexpected: true };
    expect(await systemMessageErrorDomain.refetchOne!(ctx, { systemMessageId: "M2" })).toBe(0);
    expect(state.upserts).toEqual([]);
  });

  it("does nothing without a message id", async () => {
    expect(await systemMessageErrorDomain.refetchOne!(ctx, {})).toBe(0);
    expect(state.calls).toEqual([]);
  });
});
