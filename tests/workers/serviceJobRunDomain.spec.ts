/* eslint-disable require-await -- mocked async boundaries intentionally match worker/cache contracts */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  cursor: undefined as number | undefined,
  domains: [] as any[],
  serverPage: [] as any[],
  upserts: [] as any[][],
}));

vi.mock("@/utils/cacheEntities", () => ({
  serviceJobRunCache: {
    newestCursor: vi.fn(async () => state.cursor),
    upsertMany: vi.fn(async (rows: any[]) => {
      state.upserts.push(rows);

      return rows.length;
    }),
  },
}));

vi.mock("@/workers/domains/workerFetch", () => ({
  pageNewestFirst: vi.fn(async (options: any) =>
    options.keep ? options.keep(state.serverPage) : state.serverPage),
  workerGet: vi.fn(),
}));

vi.mock("@/workers/syncRegistry", () => ({
  registerSyncDomain: (domain: any) => { state.domains.push(domain); },
}));

const ctx = { maargUrl: "https://example.test", token: "token" } as any;

async function loadDomain() {
  vi.resetModules();
  state.domains = [];
  await import("@/workers/domains/serviceJobRunDomain");

  return state.domains.find((domain) => domain.name === "serviceJobRun");
}

describe("serviceJobRun cache domain", () => {
  beforeEach(() => {
    state.cursor = undefined;
    state.domains = [];
    state.serverPage = [];
    state.upserts = [];
  });

  it("re-reads a running cursor-boundary row until it becomes terminal", async () => {
    state.cursor = 100;
    state.serverPage = [{
      jobRunId: "RUN-1",
      startTime: 100,
      endTime: 200,
      hasError: "N",
    }];

    const domain = await loadDomain();

    expect(await domain.sync(ctx, { jobNames: ["ImportOrders"] })).toBe(1);
    expect(state.upserts[0]).toEqual([expect.objectContaining({
      jobRunId: "RUN-1",
      endTime: 200,
      jobName: "ImportOrders",
    })]);

    expect(await domain.sync(ctx, { jobNames: ["ImportOrders"] })).toBe(0);
    expect(state.upserts[1]).toEqual([]);
  });
});
