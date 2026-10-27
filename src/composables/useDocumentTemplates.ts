import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { api, commonUtil, useLiveEntity } from "@common";
import { companyDb } from "@/db/companyDb";
import { refreshAfterMutation, resyncDomain } from "@/db/appDbSync";
import { CacheReconciliationError } from "@/utils/db/cacheReconciliationError";
import type { DocumentArtifact, DocumentPreview, DocumentRevision } from "@/utils/documentTemplates";

export function useDocumentTemplates(documentTemplateId?: MaybeRefOrGetter<string>) {
  const { records: templates, hydrated, synced } = useLiveEntity<any>(companyDb.tables.documentTemplates, { syncDomain: "documentTemplate" });
  const { first: history } = useLiveEntity<any>(companyDb.tables.documentTemplateHistories,
    () => toValue(documentTemplateId) ? { equals: { documentTemplateId: toValue(documentTemplateId) } } : { filter: () => false });
  const template = computed(() => templates.value.find((row: any) => row.documentTemplateId === toValue(documentTemplateId)));

  const refresh = async () => {
    const results = await Promise.allSettled([
      resyncDomain("documentTemplate"),
      ...(toValue(documentTemplateId) ? [refreshAfterMutation("documentTemplateHistory", { documentTemplateId: toValue(documentTemplateId) })] : []),
    ]);
    const failed = results.find((result) => result.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
  };
  const refreshHistory = () => refreshAfterMutation("documentTemplateHistory", { documentTemplateId: toValue(documentTemplateId) });
  return { templates, template, history, hydrated, synced, refresh, refreshHistory };
}

/** Preview inputs and private artifact URLs are invocation state; native configuration/history stays worker-owned. */
export function useDocumentTemplateActions() {
  async function request(url: string, method = "get", data?: any, params?: any) {
    const response: any = await api({ url: `poorti/${url}`, method, ...(data ? { data } : {}), ...(params ? { params } : {}) });
    const result = response.data?.documentResult;
    if (commonUtil.hasError(response) || result?.ok !== true) {
      throw Object.assign(new Error("Document template operation failed"), { code: result?.code || "DOCUMENT_REQUEST_FAILED" });
    }
    return result;
  }

  async function readRevision(documentTemplateId: string, manifestVersionName: string): Promise<DocumentRevision> {
    const result = await request(`documentTemplates/${encodeURIComponent(documentTemplateId)}`, "get", undefined, { manifestVersionName });
    if (result.documentTemplateId !== documentTemplateId || result.manifestVersionName !== manifestVersionName || !result.manifestHash ||
      !Number.isSafeInteger(Number(result.publicationSequence)) || Number(result.publicationSequence) < 0) {
      throw new Error("The selected document revision could not be verified");
    }
    return result;
  }
  const examples = (documentTemplateId: string) => request(`documentTemplates/${encodeURIComponent(documentTemplateId)}/examples`);
  const createPreview = (data: any): Promise<DocumentPreview> => request("documentPreviews", "post", data);
  async function readPreview(previewId: string): Promise<DocumentPreview> {
    const result = await request(`documentPreviews/${encodeURIComponent(previewId)}`);
    if (result.previewId !== previewId) throw new Error("Unexpected document preview response");
    return result;
  }

  async function artifactBlob(artifact: DocumentArtifact): Promise<Blob> {
    const response: any = await api({ url: "poorti/DocumentArtifact", method: "get", params: { uri: artifact.uri }, responseType: "blob" });
    if (commonUtil.hasError(response) || !(response.data instanceof Blob) || response.data.size === 0 ||
      response.data.type.split(";")[0] !== artifact.mimeType) throw new Error("Document preview download failed");
    return response.data;
  }

  async function publish(documentTemplateId: string, data: any, rollback = false) {
    const result = await request(`documentTemplates/${encodeURIComponent(documentTemplateId)}/${rollback ? "rollback" : "activate"}`, "post", data);
    const reconciled = await Promise.allSettled([
      resyncDomain("documentTemplate"),
      refreshAfterMutation("documentTemplateHistory", { documentTemplateId }),
    ]);
    const failedDomains = reconciled.flatMap((outcome, index) => outcome.status === "rejected" ? [index === 0 ? "documentTemplate" : "documentTemplateHistory"] : []);
    if (failedDomains.length) throw new CacheReconciliationError("documentTemplate", { documentTemplateId }, undefined, failedDomains);
    return result;
  }
  return { readRevision, examples, createPreview, readPreview, artifactBlob, publish };
}
