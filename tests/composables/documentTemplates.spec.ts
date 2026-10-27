import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ api: vi.fn(), resync: vi.fn(), refresh: vi.fn() }));
vi.mock("@common", () => ({ api: state.api, commonUtil: { hasError: (response: any) => !!response.data?._ERROR_MESSAGE_ } }));
vi.mock("@/db/companyDb", () => ({ companyDb: {} }));
vi.mock("@/db/appDbSync", () => ({ resyncDomain: state.resync, refreshAfterMutation: state.refresh }));
import { useDocumentTemplateActions } from "@/composables/useDocumentTemplates";

beforeEach(() => { vi.resetAllMocks(); });
describe("document template actions", () => {
  it("rejects an exact-revision read that returns another saved revision", async () => {
    state.api.mockResolvedValue({ data: { documentResult: { ok: true, documentTemplateId: "packing", manifestVersionName: "3", manifestHash: "hash", publicationSequence: 1 } } });
    await expect(useDocumentTemplateActions().readRevision("packing", "2")).rejects.toThrow("could not be verified");
  });
  it("passes the exact revision, evidence and compare-and-set counter to activation", async () => {
    state.api.mockResolvedValue({ data: { documentResult: { ok: true } } });
    const data = { manifestVersionName: "2", manifestHash: "hash", previewId: "private", expectedPublicationSequence: 3, reason: "Reviewed", requestKey: "test-request" };
    await useDocumentTemplateActions().publish("packing", data);
    expect(state.api).toHaveBeenCalledWith({ url: "poorti/documentTemplates/packing/activate", method: "post", data });
    expect(state.resync).toHaveBeenCalledWith("documentTemplate");
    expect(state.refresh).toHaveBeenCalledWith("documentTemplateHistory", { documentTemplateId: "packing" });
  });
  it("does not reconcile or claim success on a payload-level publication conflict", async () => {
    state.api.mockResolvedValue({ data: { documentResult: { ok: false, code: "PUBLICATION_CONFLICT" } } });
    await expect(useDocumentTemplateActions().publish("packing", {})).rejects.toMatchObject({ code: "PUBLICATION_CONFLICT" });
    expect(state.resync).not.toHaveBeenCalled(); expect(state.refresh).not.toHaveBeenCalled();
  });
  it("reports the committed write separately when either cache reconciliation fails", async () => {
    state.api.mockResolvedValue({ data: { documentResult: { ok: true } } });
    state.resync.mockRejectedValue(new Error("offline"));
    await expect(useDocumentTemplateActions().publish("packing", {})).rejects.toMatchObject({ mutationCommitted: true, failedDomains: ["documentTemplate"] });
    expect(state.refresh).toHaveBeenCalled();
  });
  it("uses native rollback receipt and replacement preview evidence", async () => {
    state.api.mockResolvedValue({ data: { documentResult: { ok: true } } });
    await useDocumentTemplateActions().publish("packing", { publicationReceiptId: "receipt", replacementPreviewId: "private" }, true);
    expect(state.api.mock.calls[0][0]).toMatchObject({ url: "poorti/documentTemplates/packing/rollback", method: "post", data: { publicationReceiptId: "receipt", replacementPreviewId: "private" } });
  });
});
