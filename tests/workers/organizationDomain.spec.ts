/* eslint-disable require-await -- mocked async boundaries intentionally match worker/cache contracts */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineEntity } from "@common/db/defineEntity";

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

vi.mock("@common/core/workerRemoteApi", () => ({
  pageAll: vi.fn(async () => state.roles),
  workerGet: vi.fn(async (_ctx: any, url: string) => {
    const partyId = decodeURIComponent(url.split("/").at(-1) ?? "");

    return state.details[partyId];
  }),
}));

vi.mock("@/db/companyDb", () => ({
  companyDb: {
    raw: () => ({ organizations: { count: vi.fn(async () => state.cachedCount) } }),
    entities: {
      organizations: defineEntity({ primaryKey: "partyId", fields: { partyId: "text" } }),
    },
    entity: (table: string) => {
      if (table === "organizations") {
        return {
          snapshotReplace: vi.fn(async (rows: any[]) => {
            state.snapshots.push(rows);
            return { written: rows.length, pruned: 0 };
          }),
          upsertMany: vi.fn(async (rows: any[]) => {
            state.upserts.push(rows);
            return rows.length;
          }),
          remove: vi.fn(async (partyId: string) => { state.removed.push(partyId); }),
        };
      }
      return {};
    },
  },
}));

vi.mock("@common/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@common/db")>();
  return {
    ...actual,
    hasSyncedThisLogin: vi.fn(async () => false),
    markSyncedThisLogin: vi.fn(async (_db: any, name: string) => { state.marked.push(name); }),
  };
});

vi.mock("@common/db/sync/syncRegistry", () => ({
  registerSyncDomain: (domain: any) => { state.domains.push(domain); },
}));

const ctx = { maargUrl: "https://example.test", token: "token" } as any;

async function loadDomain() {
  const { organizationDomain } = await import("@/workers/domains/organizationDomain");
  return organizationDomain;
}

describe("organizationDomain", () => {
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

  it("fans out over PartyRole(INTERNAL_ORGANIZATIO) to build one authoritative snapshot", async () => {
    state.roles = [
      { partyId: "ORG_HEAD" },
      { partyId: "STORE_1" },
    ];
    state.details = {
      ORG_HEAD: { partyId: "ORG_HEAD", partyTypeId: "PARTY_GROUP", groupName: "Head Office", statusId: "PARTY_ENABLED" },
      STORE_1: { partyId: "STORE_1", partyTypeId: "PARTY_GROUP", groupName: "Store One", statusId: "PARTY_ENABLED" },
    };

    const domain = await loadDomain();
    const written = await domain.sync(ctx, undefined, { force: true });

    expect(written).toBe(2);
    expect(state.snapshots).toEqual([[
      { partyId: "ORG_HEAD", partyTypeId: "PARTY_GROUP", groupName: "Head Office", statusId: "PARTY_ENABLED", roleTypeId: "INTERNAL_ORGANIZATIO" },
      { partyId: "STORE_1", partyTypeId: "PARTY_GROUP", groupName: "Store One", statusId: "PARTY_ENABLED", roleTypeId: "INTERNAL_ORGANIZATIO" },
    ]]);
    expect(state.marked).toEqual(["organization"]);
  });

  it("refetches one organization by reading its detail endpoint and upserting the row", async () => {
    state.roles = [{ partyId: "ORG_HEAD", roleTypeId: "INTERNAL_ORGANIZATIO" }];
    state.details = {
      ORG_HEAD: { partyId: "ORG_HEAD", partyTypeId: "PARTY_GROUP", groupName: "Head Office Renamed", statusId: "PARTY_ENABLED" },
    };

    const domain = await loadDomain();
    const written = await domain.refetchOne(ctx, { partyId: "ORG_HEAD" });

    expect(written).toBe(1);
    expect(state.upserts).toEqual([[
      { partyId: "ORG_HEAD", partyTypeId: "PARTY_GROUP", groupName: "Head Office Renamed", statusId: "PARTY_ENABLED", roleTypeId: "INTERNAL_ORGANIZATIO" },
    ]]);
  });

  it("removes a cached organization when the detail endpoint no longer returns it", async () => {
    state.roles = [{ partyId: "ORG_HEAD", roleTypeId: "INTERNAL_ORGANIZATIO" }];
    state.details = { ORG_HEAD: null };

    const domain = await loadDomain();
    const written = await domain.refetchOne(ctx, { partyId: "ORG_HEAD" });

    expect(written).toBe(0);
    expect(state.removed).toEqual(["ORG_HEAD"]);
  });
});
