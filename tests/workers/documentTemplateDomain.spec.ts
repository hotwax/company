import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ response: {} as any, calls: [] as any[], snapshots: [] as any[][] }));

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

  it("replaces the table with every document type the server lists", async () => {
    state.response = { documentTemplates: [
      { documentTypeId: "PACKING_SLIP", liveVersionName: "15", templates: [{ templateName: "holiday-2026", versionName: "02", isLive: false }] },
      { documentTypeId: "PICKLIST", liveVersionName: "03", templates: [] },
    ] };

    expect(await documentTemplateDomain.refetchOne!(ctx, {})).toBe(2);
    expect(state.calls).toEqual([{ url: "poorti/documentTemplates", params: undefined }]);
    expect(state.snapshots[0].map((row: any) => row.documentTypeId)).toEqual(["PACKING_SLIP", "PICKLIST"]);
  });

  it("throws on an unexpected response instead of pruning the stored rows", async () => {
    state.response = { errors: "Reading document templates needs the DOCUMENT_TEMPLATE_VIEW permission." };
    await expect(documentTemplateDomain.refetchOne!(ctx, {})).rejects.toThrow("Unexpected document template list");
    state.response = { documentTemplates: [{ description: "no id" }] };
    await expect(documentTemplateDomain.refetchOne!(ctx, {})).rejects.toThrow("Unexpected document template list");
    expect(state.snapshots).toEqual([]);
  });
});
