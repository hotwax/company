export interface DocumentRevision {
  manifestVersionName: string;
  manifestHash: string;
  documentTemplateId: string;
  publicationSequence: number;
  publishedVersionName?: string;
  manifest?: { summary?: string; createdAt?: number | string };
}

export interface DocumentPreview {
  previewId: string;
  documentTemplateId: string;
  manifestVersionName: string;
  manifestHash: string;
  status: string;
  expiresAt: number;
  failureCode?: string;
  pageCount?: number;
  artifacts?: DocumentArtifact[];
}

export interface DocumentArtifact {
  uri: string;
  mimeType: string;
  pageNumber?: number;
  name?: string;
  widthPoints?: number;
  heightPoints?: number;
}

/** Describe the visible revision transition without guessing which server operation was used. */
export function documentPublicationKind(publications: any[], index: number): "return" | "repeat" | "publication" {
  const version = publications[index]?.manifestVersionName;
  if (!version) return "publication";
  if (publications[index + 1]?.manifestVersionName === version) return "repeat";
  return publications.slice(index + 2).some((entry) => entry.manifestVersionName === version) ? "return" : "publication";
}

/** Publication is tied to the exact saved revision and to the examples the operator reviewed. */
export function canUseDocumentPreview(revision: DocumentRevision | undefined, preview: DocumentPreview | undefined,
  previewSourceIds: string[], selectedSourceIds: string[], now: number): boolean {
  return !!revision && !!preview && preview.status === "ready" && Number(preview.expiresAt) > now &&
    preview.documentTemplateId === revision.documentTemplateId &&
    preview.manifestVersionName === revision.manifestVersionName && preview.manifestHash === revision.manifestHash &&
    previewSourceIds.length > 0 && previewSourceIds.length === selectedSourceIds.length &&
    [...previewSourceIds].sort().every((id, index) => id === [...selectedSourceIds].sort()[index]);
}

export function documentErrorCode(error: any): string {
  return String(error?.response?.data?.documentResult?.code ?? error?.response?.data?.documentResult?.error?.code ??
    error?.documentResult?.code ?? error?.code ?? "");
}
