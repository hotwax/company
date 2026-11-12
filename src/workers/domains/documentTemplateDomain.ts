import { companyDb } from "@/db/companyDb";
import { defineSyncDomain } from "@common/db/sync/defineSyncDomain";
import { workerPost } from "@common/core/workerRemoteApi";

const documentTemplateEntity = companyDb.entity(companyDb.tables.documentTemplates);

const DOCUMENT_TEMPLATES_QUERY = `query DocumentTemplates {
  documentTemplates { documentTypeId description liveVersionName liveVersionDate liveUserId }
  documentLibraryTemplates { documentTypeId templateName versionName versionDate userId }
}`;

/**
 * Document templates — class C: fetched when the Document Templates screens open and after a publish
 * (`refreshAfterMutation("documentTemplate", {})`), never at login. Only users with
 * DOCUMENT_TEMPLATE_VIEW or DOCUMENT_TEMPLATE_ADMIN may read them, so a login-time sync would fail for
 * everyone else.
 *
 * Read from the OMS GraphQL endpoint (moqui-gql), which agents query too. Its rows are flat, so each
 * library template is grouped under its document type here. The answer covers every document type (three
 * rows), so each fetch replaces the whole table; an error or unexpected response throws instead of
 * pruning the rows already stored.
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
    const response = await workerPost(ctx, "graphql", { query: DOCUMENT_TEMPLATES_QUERY, operationName: "DocumentTemplates" });
    const types = response?.data?.documentTemplates;
    const library = response?.data?.documentLibraryTemplates;
    if (response?.errors?.length || !Array.isArray(types) || !Array.isArray(library) || types.some((row: any) => !row?.documentTypeId)) {
      throw new Error("Unexpected document template list");
    }
    const rows = types.map((type: any) => ({
      ...type,
      templates: library.filter((row: any) => row.documentTypeId === type.documentTypeId)
        .map(({ documentTypeId: _documentTypeId, ...template }: any) => template),
    }));
    const { written } = await documentTemplateEntity.snapshotReplace(rows);
    return written;
  },
});
