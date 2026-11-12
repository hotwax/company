import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ response: {} as any, calls: [] as any[], snapshots: [] as any[][] }));

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
      snapshotReplace: vi.fn(async (rows: any[]) => { state.snapshots.push(rows); return { written: rows.length, pruned: 0 }; }),
    }),
  },
}));

import { documentTemplateDomain } from "@/workers/domains/documentTemplateDomain";

const ctx = { maargUrl: "https://example.test", token: "token" } as any;

describe("documentTemplateDomain", () => {
  beforeEach(() => {
    state.response = {};
    state.calls = [];
    state.snapshots = [];
  });

  it("is on-demand only: class C, so users without template access never fetch it at login", async () => {
    expect(documentTemplateDomain.syncClass).toBe("C");
    expect(documentTemplateDomain.table).toBe("documentTemplates");
    expect(await documentTemplateDomain.sync(ctx)).toBe(0);
    expect(state.calls).toEqual([]);
  });

  it("reads both GraphQL roots in one query and groups the library under each document type", async () => {
    state.response = { data: {
      documentTemplates: [
        { documentTypeId: "PACKING_SLIP", liveVersionName: "15", liveVersionDate: "2026-11-12T07:22:37.937Z" },
        { documentTypeId: "PICKLIST", liveVersionName: "03" },
      ],
      documentLibraryTemplates: [
        { documentTypeId: "PACKING_SLIP", templateName: "holiday-2026", versionName: "02" },
        { documentTypeId: "PACKING_SLIP", templateName: "plain", versionName: "01" },
      ],
    } };

    expect(await documentTemplateDomain.refetchOne!(ctx, {})).toBe(2);
    expect(state.calls).toHaveLength(1);
    expect(state.calls[0].url).toBe("graphql");
    expect(state.calls[0].data.query).toContain("documentTemplates");
    expect(state.calls[0].data.query).toContain("documentLibraryTemplates");
    expect(state.snapshots[0]).toEqual([
      { documentTypeId: "PACKING_SLIP", liveVersionName: "15", liveVersionDate: "2026-11-12T07:22:37.937Z",
        templates: [{ templateName: "holiday-2026", versionName: "02" }, { templateName: "plain", versionName: "01" }] },
      { documentTypeId: "PICKLIST", liveVersionName: "03", templates: [] },
    ]);
  });

  it("throws on GraphQL errors or an unexpected response instead of pruning the stored rows", async () => {
    state.response = { errors: [{ message: "Reading document templates needs the DOCUMENT_TEMPLATE_VIEW permission." }], data: null };
    await expect(documentTemplateDomain.refetchOne!(ctx, {})).rejects.toThrow("Unexpected document template list");
    state.response = { data: { documentTemplates: [{ description: "no id" }], documentLibraryTemplates: [] } };
    await expect(documentTemplateDomain.refetchOne!(ctx, {})).rejects.toThrow("Unexpected document template list");
    state.response = { data: { documentTemplates: [] } };
    await expect(documentTemplateDomain.refetchOne!(ctx, {})).rejects.toThrow("Unexpected document template list");
    expect(state.snapshots).toEqual([]);
  });
});
