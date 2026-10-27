import { companyDb } from "@/db/companyDb";
import { workerGet } from "@common/core/workerRemoteApi";
import { defineSyncDomain } from "@common/db/sync/defineSyncDomain";

const templates = companyDb.entity(companyDb.tables.documentTemplates);
const histories = companyDb.entity(companyDb.tables.documentTemplateHistories);

/** A malformed or denied response must never prune known configuration. */
function resultOf(response: any) {
  const result = response?.documentResult;
  if (result?.ok !== true) throw new Error(String(result?.code || "Document template read failed"));
  return result;
}

export const documentTemplateDomain = defineSyncDomain({
  name: "documentTemplate", label: "Document templates", syncClass: "B", table: "documentTemplates",
  async sync(ctx, _args, options) {
    if (!options?.force && await companyDb.client().syncedThisLogin("documentTemplate")) return 0;
    const result = resultOf(await workerGet(ctx, "poorti/documentTemplates"));
    if (!Array.isArray(result.templates) || result.templates.some((row: any) => !row.documentTemplateId)) {
      throw new Error("Unexpected document template collection");
    }
    const { written } = await templates.snapshotReplace(result.templates);
    await companyDb.client().markSyncedThisLogin("documentTemplate");
    return written;
  },
});

export const documentTemplateHistoryDomain = defineSyncDomain({
  name: "documentTemplateHistory", label: "Document template history", syncClass: "C", table: "documentTemplateHistories",
  async sync() { return 0; },
  async refetchOne(ctx, pk) {
    const documentTemplateId = String(pk.documentTemplateId || "");
    if (!documentTemplateId) return 0;
    let header: any;
    const revisions: any[] = [], publications: any[] = [];
    for (let offset = 0; offset < 2000; offset += 100) {
      const result = resultOf(await workerGet(ctx, `poorti/documentTemplates/${encodeURIComponent(documentTemplateId)}/history`, { limit: 100, offset }));
      if (!Array.isArray(result.revisions) || !Array.isArray(result.publications)) throw new Error("Unexpected document history collection");
      header ??= result;
      revisions.push(...result.revisions);
      publications.push(...result.publications);
      if (result.revisions.length < 100 && result.publications.length < 100) {
        return histories.upsertMany([{ ...header, documentTemplateId, revisions, publications }]);
      }
    }
    throw new Error("Document history is too large to read completely");
  },
});
