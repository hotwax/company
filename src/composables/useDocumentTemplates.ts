import { api, commonUtil, logger, useLiveEntity } from "@common";
import { computed, onScopeDispose, ref } from "vue";
import { companyDb } from "@/db/companyDb";
import { refreshAfterMutation } from "@/db/appDbSync";
import type { DocumentTemplate, DocumentTemplateVersion, PreviewResult, SampleDocument, TemplateSelection } from "@/utils/documentTemplates";

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
const SAMPLE_COUNT = 20;
const SAMPLE_SHIPMENTS_QUERY = `query SampleShipments($first: Int!) {
  shipments(query: "statusId:SHIPMENT_SHIPPED,SHIPMENT_PACKED", sortKey: SHIPPED_DATE, reverse: true, first: $first) {
    edges { node { shipmentId statusId primaryOrderId originFacilityId } }
  }
}`;
const SAMPLE_ORDERS_QUERY = `query SampleOrders($q: String!, $first: Int!) {
  orders(query: $q, first: $first) { edges { node { orderId orderName } } }
}`;
const SAMPLE_PICKLISTS_QUERY = `query SamplePicklists($first: Int!) {
  orderPicklists(first: $first) { edges { node { picklistId picklistDate picklistStatusId facilityId } } }
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
 * Recent real documents to preview a template with, so nobody has to know an id: shipped or packed
 * shipments for packing slips (newest shipped first, with their order's name), recent pick lists for
 * pick lists. Read from the OMS GraphQL endpoint.
 */
export function useSampleDocuments() {
  const samples = ref<SampleDocument[]>([]);
  const loading = ref(false);
  const error = ref(false);
  let request = 0;

  async function query(queryText: string, variables: Record<string, unknown>, operationName: string) {
    const resp: any = await api({ url: "graphql", method: "post", data: { query: queryText, variables, operationName } });
    if(commonUtil.hasError(resp) || resp?.data?.errors?.length || !resp?.data?.data) {throw resp;}

    return resp.data.data;
  }

  async function shipmentSamples(): Promise<SampleDocument[]> {
    const data = await query(SAMPLE_SHIPMENTS_QUERY, { first: SAMPLE_COUNT }, "SampleShipments");
    const shipments: any[] = (data.shipments?.edges ?? []).map((edge: any) => edge.node).filter((row: any) => row?.shipmentId);
    const orderIds = [...new Set(shipments.map(row => row.primaryOrderId).filter(Boolean))];
    const orders = new Map<string, any>();
    if(orderIds.length) {
      try {
        const orderData = await query(SAMPLE_ORDERS_QUERY, { q: `orderId:${orderIds.join(",")}`, first: orderIds.length }, "SampleOrders");
        for(const edge of orderData.orders?.edges ?? []) {orders.set(edge.node.orderId, edge.node);}
      } catch(cause) {
        // Order names only make the list easier to read; the shipments are still usable without them.
        logger.warn(cause);
      }
    }

    return shipments.map(row => ({
      sourceId: row.shipmentId, kind: "shipment", statusId: row.statusId, facilityId: row.originFacilityId,
      orderId: row.primaryOrderId, orderName: orders.get(row.primaryOrderId)?.orderName || undefined,
    }));
  }

  async function picklistSamples(): Promise<SampleDocument[]> {
    const data = await query(SAMPLE_PICKLISTS_QUERY, { first: SAMPLE_COUNT * 5 }, "SamplePicklists");
    // One row per picked order item, so a pick list repeats; keep each once, newest first.
    const byId = new Map<string, any>();
    for(const edge of data.orderPicklists?.edges ?? []) {
      const row = edge.node;
      if(row?.picklistId && !byId.has(row.picklistId)) {byId.set(row.picklistId, row);}
    }

    return [...byId.values()]
      .sort((a, b) => String(b.picklistDate || "").localeCompare(String(a.picklistDate || "")))
      .slice(0, SAMPLE_COUNT)
      .map(row => ({ sourceId: row.picklistId, kind: "picklist", statusId: row.picklistStatusId, facilityId: row.facilityId,
        date: row.picklistDate ? Date.parse(row.picklistDate) : undefined }));
  }

  async function load(documentTypeId: string) {
    const current = ++request;
    loading.value = true;
    error.value = false;
    try {
      const rows = documentTypeId === "PICKLIST" ? await picklistSamples() : await shipmentSamples();
      if(current === request) {samples.value = rows;}
    } catch(cause) {
      if(current === request) {
        samples.value = [];
        error.value = true;
      }
      logger.error(cause);
    } finally {
      if(current === request) {loading.value = false;}
    }
  }

  return { samples, loading, error, load };
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
