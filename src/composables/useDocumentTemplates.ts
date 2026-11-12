import { api, commonUtil, logger, useLiveEntity } from "@common";
import { computed, onScopeDispose, ref } from "vue";
import { companyDb } from "@/db/companyDb";
import { refreshAfterMutation } from "@/db/appDbSync";
import type { DocumentTemplate, DocumentTemplateVersion, PreviewResult, TemplateSelection } from "@/utils/documentTemplates";

/**
 * Document templates: the packing slip and pick list templates printing uses (Poorti
 * DocumentTemplateServices, the same services as the document-templates MCP tools).
 *   - Reads go through the OMS GraphQL endpoint (moqui-gql), the one agents query: the document types
 *     and their libraries are the class C `documentTemplate` domain, which the screens fetch when they
 *     open and after a publish and read from the local table; version history is a server ledger, read
 *     when shown (like app version history).
 *   - Writes stay on `poorti/documentTemplates`: preview renders a template for one shipment or picklist,
 *     and the PDF is fetched from the print URL the server returns, through the app's session; publish
 *     and rollback go through `publish`, which checks the live version the screen showed.
 */

const DOCUMENT_TEMPLATE_DOMAIN = "documentTemplate";
const templatesUrl = (documentTypeId: string) => `poorti/documentTemplates/${encodeURIComponent(documentTypeId)}`;
const VERSIONS_QUERY = `query DocumentTemplateVersions($documentTypeId: ID!, $templateName: String) {
  documentTemplateVersions(documentTypeId: $documentTypeId, templateName: $templateName) {
    versionName previousVersionName versionDate userId isCurrent
  }
}`;

/** Every document type, from the local table, and `refresh()` to fetch them again. */
export function useDocumentTemplates() {
  const { records, hydrated } = useLiveEntity<DocumentTemplate>(companyDb.tables.documentTemplates);
  const loading = ref(false);
  const loaded = ref(false);
  const error = ref(false);

  async function refresh() {
    if(loading.value) {return;}
    loading.value = true;
    error.value = false;
    try {
      await refreshAfterMutation(DOCUMENT_TEMPLATE_DOMAIN, {});
      loaded.value = true;
    } catch(cause) {
      error.value = true;
      logger.error(cause);
    } finally {
      loading.value = false;
    }
  }

  const documentTemplates = computed(() =>
    [...records.value].sort((a, b) => (a.description || a.documentTypeId).localeCompare(b.description || b.documentTypeId)));

  return { documentTemplates, hydrated, loading, loaded, error, refresh };
}

/** One document type from the local table. */
export function useDocumentTemplate(documentTypeId: () => string) {
  const { first, hydrated } = useLiveEntity<DocumentTemplate>(companyDb.tables.documentTemplates,
    () => documentTypeId() ? { equals: { documentTypeId: documentTypeId() } } : { filter: () => false });

  return { documentTemplate: first, hydrated };
}

/** Usernames for the user ids on versions, looked up once each. */
function useUsernames() {
  const usernames = ref<Record<string, string>>({});
  const requested = new Set<string>();

  async function resolve(userIds: Array<string | undefined>) {
    const missing = [...new Set(userIds.filter((id): id is string => !!id && !requested.has(id)))];
    missing.forEach(id => requested.add(id));
    await Promise.all(missing.map(async userId => {
      try {
        const resp: any = await api({ url: `admin/users/${encodeURIComponent(userId)}`, method: "get" });
        if(!commonUtil.hasError(resp)) {usernames.value[userId] = resp.data?.username?.trim() || "";}
      } catch(cause) {
        logger.warn(cause);
      }
    }));
  }

  const usernameFor = (userId?: string) => (userId && usernames.value[userId]) || userId || "";

  return { usernameFor, resolveUsernames: resolve };
}

/** The saved versions of the live template, or of one library template, newest first. */
export function useDocumentTemplateVersions() {
  const versions = ref<DocumentTemplateVersion[]>([]);
  const loading = ref(false);
  const error = ref(false);
  const { usernameFor, resolveUsernames } = useUsernames();
  let request = 0;

  async function load(documentTypeId: string, templateName?: string) {
    const current = ++request;
    loading.value = true;
    error.value = false;
    try {
      const resp: any = await api({
        url: "graphql",
        method: "post",
        data: { query: VERSIONS_QUERY, variables: { documentTypeId, templateName: templateName || null }, operationName: "DocumentTemplateVersions" },
      });
      const rows = resp?.data?.data?.documentTemplateVersions;
      if(commonUtil.hasError(resp) || resp?.data?.errors?.length || !Array.isArray(rows)) {throw resp;}
      if(current !== request) {return;}
      // GraphQL DateTime is an ISO string; the screens format epoch millis.
      versions.value = rows.map((row: any) => ({ ...row, versionDate: row.versionDate ? Date.parse(row.versionDate) : undefined }));
      void resolveUsernames(versions.value.map(version => version.userId));
    } catch(cause) {
      if(current === request) {
        versions.value = [];
        error.value = true;
      }
      logger.error(cause);
    } finally {
      if(current === request) {loading.value = false;}
    }
  }

  return { versions, loading, error, load, usernameFor, resolveUsernames };
}

/**
 * Renders a template for one shipment or picklist and fetches the PDF. `pdfUrl` is an object URL the
 * screen embeds; it is revoked when the next preview replaces it and when the screen goes away.
 */
export function useDocumentTemplatePreview() {
  const result = ref<PreviewResult | null>(null);
  const previewed = ref<(TemplateSelection & { sourceId: string }) | null>(null);
  const pdfUrl = ref("");
  const loading = ref(false);
  let request = 0;

  function clear() {
    request++;
    if(pdfUrl.value) {URL.revokeObjectURL(pdfUrl.value);}
    pdfUrl.value = "";
    result.value = null;
    previewed.value = null;
    loading.value = false;
  }
  onScopeDispose(clear);

  /** Throws when the preview request itself fails; a template that does not render is a result. */
  async function preview(documentTypeId: string, selection: TemplateSelection, sourceId: string) {
    clear();
    const current = request;
    loading.value = true;
    try {
      const resp: any = await api({
        url: `${templatesUrl(documentTypeId)}/preview`,
        method: "post",
        data: { templateName: selection.templateName || undefined, versionName: selection.versionName || undefined, sourceId },
      });
      if(commonUtil.hasError(resp)) {throw resp;}
      if(current !== request) {return;}
      const data = resp.data || {};
      let objectUrl = "";
      if(data.rendered && data.previewUrl) {
        // getMaargURL() is always a full URL; getMaargBaseURL() is a bare instance name on some Moqui-only logins.
        const maargHost = commonUtil.getMaargURL().replace(/\/rest\/s1\/?$/, "");
        const pdf: any = await api({ baseURL: maargHost, url: data.previewUrl, method: "get", responseType: "blob" });
        if(commonUtil.hasError(pdf) || !(pdf.data instanceof Blob)) {throw pdf;}
        objectUrl = URL.createObjectURL(pdf.data);
      }
      if(current !== request) {
        if(objectUrl) {URL.revokeObjectURL(objectUrl);}
        return;
      }
      pdfUrl.value = objectUrl;
      result.value = { rendered: !!data.rendered, pageCount: data.pageCount, errors: data.errors || [], templateErrors: data.templateErrors || [], previewUrl: data.previewUrl };
      previewed.value = { templateName: selection.templateName, versionName: selection.versionName, sourceId };
    } finally {
      if(current === request) {loading.value = false;}
    }
  }

  return { result, previewed, pdfUrl, loading, preview, clear };
}

/** Makes a library template live, or rolls the live template back to an earlier version. */
export function useDocumentTemplatePublish() {
  const publishing = ref(false);

  /** Throws when the server refuses; the error carries the server's reason (`serverErrorMessage`). */
  async function publish(documentTypeId: string, payload: { templateName?: string; versionName?: string; expectedLiveVersionName: string }) {
    publishing.value = true;
    try {
      const resp: any = await api({ url: `${templatesUrl(documentTypeId)}/publish`, method: "post", data: payload });
      if(commonUtil.hasError(resp)) {throw resp;}
      return resp.data as { liveVersionName?: string; previousLiveVersionName?: string };
    } finally {
      // The live version changed (or someone else's publish made ours stale): show the server's state.
      await refreshAfterMutation(DOCUMENT_TEMPLATE_DOMAIN, {}).catch(cause => logger.error(cause));
      publishing.value = false;
    }
  }

  return { publish, publishing };
}
