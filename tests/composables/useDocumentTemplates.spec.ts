// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope } from "vue";

const mocks = vi.hoisted(() => ({ api: vi.fn(), refreshAfterMutation: vi.fn() }));

vi.mock("@common", () => ({
  api: (...args: any[]) => mocks.api(...args),
  commonUtil: { hasError: (resp: any) => !!resp?.data?.error, getMaargBaseURL: () => "https://maarg.example.test" },
  logger: { error: vi.fn(), warn: vi.fn() },
  useLiveEntity: vi.fn(),
}));
vi.mock("@/db/companyDb", () => ({ companyDb: { tables: new Proxy({}, { get: (_target, table) => table }) } }));
vi.mock("@/db/appDbSync", () => ({ refreshAfterMutation: (...args: any[]) => mocks.refreshAfterMutation(...args) }));

import { useDocumentTemplatePreview, useDocumentTemplatePublish, useDocumentTemplateVersions } from "@/composables/useDocumentTemplates";

const run = <T>(factory: () => T) => { const scope = effectScope(); return { scope, state: scope.run(factory)! }; };

beforeEach(() => {
  mocks.api.mockReset();
  mocks.refreshAfterMutation.mockReset().mockResolvedValue(3);
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});

describe("document template preview", () => {
  it("renders the selection for one shipment, then fetches the PDF from the print URL through the session", async () => {
    mocks.api.mockResolvedValueOnce({ data: { rendered: true, pageCount: 1, templateErrors: [{ line: 9, expression: "x.y" }], previewUrl: "/fop/apps/pdf/PrintPackingSlip?shipmentId=100051" } })
      .mockResolvedValueOnce({ data: new Blob(["%PDF-"]) });
    const { scope, state } = run(() => useDocumentTemplatePreview());

    await state.preview("PACKING_SLIP", { templateName: "holiday-2026", versionName: "" }, "100051");

    expect(mocks.api).toHaveBeenNthCalledWith(1, { url: "poorti/documentTemplates/PACKING_SLIP/preview", method: "post", data: { templateName: "holiday-2026", versionName: undefined, sourceId: "100051" } });
    expect(mocks.api).toHaveBeenNthCalledWith(2, { baseURL: "https://maarg.example.test", url: "/fop/apps/pdf/PrintPackingSlip?shipmentId=100051", method: "get", responseType: "blob" });
    expect(state.pdfUrl.value).toBe("blob:preview");
    expect(state.result.value).toMatchObject({ rendered: true, pageCount: 1, errors: [], templateErrors: [{ line: 9 }] });
    expect(state.previewed.value).toEqual({ templateName: "holiday-2026", versionName: "", sourceId: "100051" });

    scope.stop();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
  });

  it("reports a template that produced no PDF without fetching one", async () => {
    mocks.api.mockResolvedValueOnce({ data: { rendered: false, errors: [{ stage: "xsl-fo", message: "bad fo" }], templateErrors: [] } });
    const { scope, state } = run(() => useDocumentTemplatePreview());

    await state.preview("PICKLIST", { versionName: "03" }, "P1");

    expect(mocks.api).toHaveBeenCalledTimes(1);
    expect(state.pdfUrl.value).toBe("");
    expect(state.result.value).toMatchObject({ rendered: false, errors: [{ message: "bad fo" }] });
    scope.stop();
  });
});

describe("document template publish", () => {
  it("sends the live version the screen showed and refreshes the stored templates", async () => {
    mocks.api.mockResolvedValueOnce({ data: { liveVersionName: "16", previousLiveVersionName: "15" } });
    const { scope, state } = run(() => useDocumentTemplatePublish());

    const published = await state.publish("PACKING_SLIP", { templateName: "holiday-2026", expectedLiveVersionName: "15", sourceId: "100051" });

    expect(published.liveVersionName).toBe("16");
    expect(mocks.api).toHaveBeenCalledWith({ url: "poorti/documentTemplates/PACKING_SLIP/publish", method: "post", data: { templateName: "holiday-2026", expectedLiveVersionName: "15", sourceId: "100051" } });
    expect(mocks.refreshAfterMutation).toHaveBeenCalledWith("documentTemplate", {});
    scope.stop();
  });

  it("still refreshes after a refused publish, so a stale live version is replaced", async () => {
    const refused = Object.assign(new Error("400"), { response: { data: { errors: "The live PACKING_SLIP template is at version 16, not 15" } } });
    mocks.api.mockRejectedValueOnce(refused);
    const { scope, state } = run(() => useDocumentTemplatePublish());

    await expect(state.publish("PACKING_SLIP", { versionName: "14", expectedLiveVersionName: "15" })).rejects.toBe(refused);
    expect(mocks.refreshAfterMutation).toHaveBeenCalledWith("documentTemplate", {});
    expect(state.publishing.value).toBe(false);
    scope.stop();
  });
});

describe("document template versions", () => {
  it("lists a library template's versions and resolves who saved them", async () => {
    mocks.api.mockResolvedValueOnce({ data: { versions: [{ versionName: "02", userId: "M1", isCurrent: true }] } })
      .mockResolvedValueOnce({ data: { username: "aditya" } });
    const { scope, state } = run(() => useDocumentTemplateVersions());

    await state.load("PACKING_SLIP", "holiday-2026");
    await vi.waitFor(() => expect(state.usernameFor("M1")).toBe("aditya"));

    expect(mocks.api).toHaveBeenNthCalledWith(1, { url: "poorti/documentTemplates/PACKING_SLIP/versions", method: "get", params: { templateName: "holiday-2026" } });
    expect(state.versions.value).toHaveLength(1);
    scope.stop();
  });

  it("marks an error rather than showing an empty history", async () => {
    mocks.api.mockResolvedValueOnce({ data: { error: "denied" } });
    const { scope, state } = run(() => useDocumentTemplateVersions());

    await state.load("PACKING_SLIP");

    expect(mocks.api).toHaveBeenCalledWith({ url: "poorti/documentTemplates/PACKING_SLIP/versions", method: "get", params: {} });
    expect(state.error.value).toBe(true);
    expect(state.versions.value).toEqual([]);
    scope.stop();
  });
});
