/* eslint-disable require-await -- mocked async boundaries intentionally match worker/cache contracts */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  cached: [] as any[],
  domains: [] as any[],
  detailById: {} as Record<string, any>,
  detailCalls: [] as Array<{ params: Record<string, unknown>; url: string }>,
  listCalls: [] as any[],
  upserts: [] as any[][],
}));

vi.mock("@/utils/cacheEntities", () => ({
  serviceJobRunCache: {
    all: vi.fn(async () => state.cached),
    newestCursor: vi.fn(async () => 1_700_000_000_000),
    upsertMany: vi.fn(async (rows: any[]) => {
      state.upserts.push(rows);

      return rows.length;
    }),
  },
}));

vi.mock("@/workers/domains/workerFetch", () => ({
  pageNewestFirst: vi.fn(async (options: any) => {
    state.listCalls.push(options);

    return [];
  }),
  workerGet: vi.fn(async (_ctx: any, url: string, params: Record<string, unknown>) => {
    state.detailCalls.push({ params, url });
    const jobRunId = decodeURIComponent(url.split("/").at(-1) ?? "");
    const response = state.detailById[jobRunId];
    if(response instanceof Error) {throw response;}

    return response;
  }),
}));

vi.mock("@/workers/syncRegistry", () => ({
  registerSyncDomain: (domain: any) => { state.domains.push(domain); },
}));

const ctx = { maargUrl: "https://example.test", token: "token" } as any;
const now = 1_800_000_000_000;

async function loadDomain() {
  vi.resetModules();
  state.domains = [];
  await import("@/workers/domains/serviceJobRunDomain");

  return state.domains.find((domain) => domain.name === "serviceJobRun");
}

describe("serviceJobRun mutable-run refresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    state.cached = [];
    state.domains = [];
    state.detailById = {};
    state.detailCalls = [];
    state.listCalls = [];
    state.upserts = [];
  });

  it("re-fetches a cached unfinished run by its exact nested id and persists terminal results", async () => {
    state.cached = [{
      jobName: "Import Product Store",
      jobRunId: "RUN / 42",
      startTime: now - 60_000,
    }];
    state.detailById["RUN / 42"] = {
      endTime: now - 1_000,
      hasError: "N",
      jobRunId: "RUN / 42",
      results: { systemMessageId: "MSG-42" },
      startTime: now - 60_000,
    };

    const domain = await loadDomain();
    await expect(domain.sync(ctx, { jobNames: ["Import Product Store"] })).resolves.toBe(1);

    expect(state.detailCalls).toEqual([{
      params: {},
      url: "admin/serviceJobs/Import%20Product%20Store/runs/RUN%20%2F%2042",
    }]);
    expect(state.upserts.at(-1)).toEqual([expect.objectContaining({
      endTime: now - 1_000,
      jobName: "Import Product Store",
      jobRunId: "RUN / 42",
      results: { systemMessageId: "MSG-42" },
    })]);
  });

  it("only refreshes unfinished recent runs belonging to explicitly watched jobs", async () => {
    state.cached = [
      { jobName: "WATCHED", jobRunId: "RECENT", startTime: now - 1_000 },
      { jobName: "WATCHED", jobRunId: "FINISHED", startTime: now - 2_000, endTime: now - 1_000 },
      { jobName: "WATCHED", jobRunId: "STALE", startTime: now - 7 * 60 * 60 * 1_000 },
      { jobName: "OTHER", jobRunId: "OTHER-RUN", startTime: now - 500 },
    ];
    state.detailById.RECENT = { jobRunId: "RECENT", startTime: now - 1_000 };

    const domain = await loadDomain();
    await domain.sync(ctx, { jobNames: ["WATCHED"] });

    expect(state.detailCalls.map(({ url }) => url)).toEqual([
      "admin/serviceJobs/WATCHED/runs/RECENT",
    ]);
  });

  it("bounds exact refreshes per watched job without letting one job starve another", async () => {
    state.cached = [
      { jobName: "A", jobRunId: "A-NEW", startTime: now - 1_000 },
      { jobName: "A", jobRunId: "A-OLD", startTime: now - 2_000 },
      { jobName: "B", jobRunId: "B-NEW", startTime: now - 500 },
      { jobName: "B", jobRunId: "B-OLD", startTime: now - 1_500 },
    ];
    state.detailById = {
      "A-NEW": { jobRunId: "A-NEW" },
      "B-NEW": { jobRunId: "B-NEW" },
    };

    const domain = await loadDomain();
    await domain.sync(ctx, { jobNames: ["A", "B"], refreshMaxPerJob: 1 });

    expect(state.detailCalls.map(({ url }) => url)).toEqual([
      "admin/serviceJobs/A/runs/A-NEW",
      "admin/serviceJobs/B/runs/B-NEW",
    ]);
  });

  it("continues refreshing other candidates when one exact read fails", async () => {
    state.cached = [
      { jobName: "WATCHED", jobRunId: "FAIL", startTime: now - 1_000 },
      { jobName: "WATCHED", jobRunId: "OK", startTime: now - 2_000 },
    ];
    state.detailById.FAIL = new Error("temporary");
    state.detailById.OK = { endTime: now, jobRunId: "OK", results: { queuedSystemMessageId: "MSG" } };

    const domain = await loadDomain();
    await expect(domain.sync(ctx, { jobNames: ["WATCHED"] })).resolves.toBe(1);

    expect(state.detailCalls).toHaveLength(2);
    expect(state.upserts.at(-1)).toEqual([expect.objectContaining({
      jobName: "WATCHED",
      jobRunId: "OK",
      results: { queuedSystemMessageId: "MSG" },
    })]);
  });
});
