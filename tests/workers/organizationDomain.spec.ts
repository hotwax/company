/* eslint-disable require-await -- mocked async boundaries intentionally match worker/cache contracts */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  roles: [] as any[],
  details: {} as Record<string, any>,
  cachedCount: 0,
  snapshots: [] as any[][],
  upserts: [] as any[][],
  removed: [] as string[],
  marked: [] as string[],
  domains: [] as any[],
}));

vi.mock("@/workers/domains/workerFetch", () => ({
  pageAll: vi.fn(async () => state.roles),
  workerGet: vi.fn(async (_ctx: any, url: string) => {
    const partyId = decodeURIComponent(url.split("/").at(-1) ?? "");

    return state.details[partyId];
  }),
}));

vi.mock("@/utils/appCacheDb", () => ({
  appCacheDb: { organizations: { count: vi.fn(async () => state.cachedCount) } },
  hasSyncedThisLogin: vi.fn(async () => false),
  markSyncedThisLogin: vi.fn(async (name: string) => { state.marked.push(name); }),
}));

vi.mock("@/utils/cacheEntities", () => ({
  organizationProjection: { keyField: "partyId", fields: { partyId: "text" } },
  organizationCache: {
    snapshotReplace: vi.fn(async (rows: any[]) => {
      state.snapshots.push(rows);

      return { written: rows.length, pruned: 0 };
    }),
    upsertMany: vi.fn(async (rows: any[]) => {
      state.upserts.push(rows);

      return rows.length;
    }),
    remove: vi.fn(async (partyId: string) => { state.removed.push(partyId); }),
  },
}));

vi.mock("@/workers/syncRegistry", () => ({
  registerSyncDomain: (domain: any) => { state.domains.push(domain); },
}));

const ctx = { maargUrl: "https://example.test", token: "token" } as any;

async function loadDomain() {
  vi.resetModules();
  state.domains = [];
  await import("@/workers/domains/organizationDomain");

  return state.domains.find((domain) => domain.name === "organization");
}

describe("organization cache domain", () => {
  beforeEach(() => {
    state.roles = [];
    state.details = {};
    state.cachedCount = 0;
    state.snapshots = [];
    state.upserts = [];
    state.removed = [];
    state.marked = [];
    state.domains = [];
  });

  it("enriches role rows with group names and excludes non-group parties", async () => {
    state.roles = [
      { partyId: "ORG", roleTypeId: "INTERNAL_ORGANIZATIO" },
      { partyId: "PERSON", roleTypeId: "INTERNAL_ORGANIZATIO" },
    ];
    state.details = {
      ORG: { partyId: "ORG", partyTypeId: "PARTY_GROUP", groupName: "Organization" },
      PERSON: { partyId: "PERSON", partyTypeId: "PERSON", firstName: "Not a group" },
    };

    const domain = await loadDomain();
    expect(await domain.sync(ctx, undefined, {})).toBe(1);
    expect(state.snapshots[0]).toEqual([expect.objectContaining({
      partyId: "ORG",
      groupName: "Organization",
      roleTypeId: "INTERNAL_ORGANIZATIO",
    })]);
    expect(state.marked).toEqual(["organization"]);
  });

  it("does not wipe a populated cache when enrichment yields no organizations", async () => {
    state.roles = [{ partyId: "PERSON", roleTypeId: "INTERNAL_ORGANIZATIO" }];
    state.details = { PERSON: { partyId: "PERSON", partyTypeId: "PERSON" } };
    state.cachedCount = 2;

    const domain = await loadDomain();
    expect(await domain.sync(ctx, undefined, {})).toBe(0);
    expect(state.snapshots).toHaveLength(0);
    expect(state.marked).toHaveLength(0);
  });

  it("removes a cached organization when its internal role no longer exists", async () => {
    state.roles = [];

    const domain = await loadDomain();
    expect(await domain.refetchOne(ctx, { partyId: "OLD" })).toBe(0);
    expect(state.removed).toEqual(["OLD"]);
  });
});
