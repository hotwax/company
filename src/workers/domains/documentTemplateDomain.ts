import { companyDb } from "@/db/companyDb";
import { defineSyncDomain } from "@common/db/sync/defineSyncDomain";
import { workerGet } from "@common/core/workerRemoteApi";

const documentTemplateEntity = companyDb.entity(companyDb.tables.documentTemplates);

/**
 * Document templates — class C: fetched when the Document Templates screens open and after a publish
 * (`refreshAfterMutation("documentTemplate", {})`), never at login. Only users with
 * DOCUMENT_TEMPLATE_VIEW or DOCUMENT_TEMPLATE_ADMIN may read them, so a login-time sync would fail for
 * everyone else.
 *
 * `poorti/documentTemplates` answers every document type at once (three rows), so each fetch replaces
 * the whole table. An unexpected response throws instead of pruning the rows already stored.
 */
export const documentTemplateDomain = defineSyncDomain({
  name: "documentTemplate",
  table: "documentTemplates",
  label: "Document templates",
  syncClass: "C",
  async sync() {
    return 0;
  },
  async refetchOne(ctx) {
    const response = await workerGet(ctx, "poorti/documentTemplates");
    const rows = response?.documentTemplates;
    if (!Array.isArray(rows) || rows.some((row: any) => !row?.documentTypeId)) {
      throw new Error("Unexpected document template list");
    }
    const { written } = await documentTemplateEntity.snapshotReplace(rows);
    return written;
  },
});
