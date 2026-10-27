import { describe, expect, it } from "vitest";
import { canUseDocumentPreview, type DocumentPreview, type DocumentRevision } from "@/utils/documentTemplates";

const revision: DocumentRevision = { documentTemplateId: "packing", manifestVersionName: "2", manifestHash: "hash-2", publicationSequence: 1 };
const preview: DocumentPreview = { ...revision, previewId: "private", status: "ready", expiresAt: 200 };

describe("reviewed document preview", () => {
  it("accepts only the same saved revision and reviewed source set", () => {
    expect(canUseDocumentPreview(revision, preview, ["a", "b"], ["b", "a"], 100)).toBe(true);
    expect(canUseDocumentPreview(revision, preview, ["a"], ["b"], 100)).toBe(false);
    expect(canUseDocumentPreview(revision, { ...preview, manifestHash: "changed" }, ["a"], ["a"], 100)).toBe(false);
    expect(canUseDocumentPreview({ ...revision, manifestVersionName: "3" }, preview, ["a"], ["a"], 100)).toBe(false);
  });
  it("rejects pending, expired and empty previews", () => {
    expect(canUseDocumentPreview(revision, { ...preview, status: "queued" }, ["a"], ["a"], 100)).toBe(false);
    expect(canUseDocumentPreview(revision, preview, ["a"], ["a"], 200)).toBe(false);
    expect(canUseDocumentPreview(revision, preview, [], [], 100)).toBe(false);
  });
});
