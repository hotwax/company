import { api, commonUtil, logger, useLiveEntity } from "@common";
import { computed, onScopeDispose, ref } from "vue";
import { companyDb } from "@/db/companyDb";
import { refreshAfterMutation } from "@/db/appDbSync";
import type { DocumentTemplate, DocumentTemplateVersion, PreviewOrder, PreviewResult, SampleDocument, TemplateSelection, TemplateText } from "@/utils/documentTemplates";

/**
 * Document templates: the packing slip and pick list templates printing uses (Poorti
 * DocumentTemplateServices, the same services as the document-templates MCP tools).
 *   - Reads go through the OMS GraphQL endpoint (moqui-gql), the one agents query: the document types
 *     and their libraries are the class C `documentTemplate` domain, which the screens fetch when they
 *     open and after a publish and read from the local table; version history is a server ledger, read
 *     when shown (like app version history).
 *   - Writes stay on `poorti/documentTemplates`: `templates` saves a named template as a new revision
 *     (never the live one, so saving never changes printing) and deletes one with all its revisions; preview renders a template for one shipment
 *     or picklist, and the PDF is fetched from the print URL the server returns, through the app's session;
 *     publish and rollback go through `publish`, which checks the live version the screen showed.
 */

const DOCUMENT_TEMPLATE_DOMAIN = "documentTemplate";
const templatesUrl = (documentTypeId: string) => `poorti/documentTemplates/${encodeURIComponent(documentTypeId)}`;
const VERSIONS_QUERY = `query DocumentTemplateVersions($documentTypeId: ID!, $templateName: String) {
  documentTemplateVersions(documentTypeId: $documentTypeId, templateName: $templateName) {
    versionName previousVersionName versionDate userId isCurrent
  }
}`;
const TEXT_QUERY = `query DocumentTemplateText($documentTypeId: ID!, $templateName: String, $versionName: String) {
  documentTemplateText(documentTypeId: $documentTypeId, templateName: $templateName, versionName: $versionName) {
    versionName currentVersionName templateText
  }
  documentTemplateIncludes(documentTypeId: $documentTypeId, templateName: $templateName, versionName: $versionName) {
    location templateText
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
 * The code of the live template or a named template, at one revision (the current one when none is given), with the
 * shared print files it includes, such as PackingSlipContent.
 */
export function useDocumentTemplateText() {
  const text = ref<TemplateText | null>(null);
  const loading = ref(false);
  const error = ref(false);
  let request = 0;

  async function load(documentTypeId: string, selection: TemplateSelection) {
    const current = ++request;
    loading.value = true;
    error.value = false;
    try {
      const resp: any = await api({
        url: "graphql",
        method: "post",
        data: {
          query: TEXT_QUERY,
          variables: { documentTypeId, templateName: selection.templateName || null, versionName: selection.versionName || null },
          operationName: "DocumentTemplateText",
        },
      });
      const row = resp?.data?.data?.documentTemplateText;
      if(commonUtil.hasError(resp) || resp?.data?.errors?.length || typeof row?.templateText !== "string") {throw resp;}
      const includes = resp.data.data.documentTemplateIncludes;
      if(current === request) {text.value = { ...row, includes: Array.isArray(includes) ? includes : [] };}
    } catch(cause) {
      if(current === request) {
        text.value = null;
        error.value = true;
      }
      logger.error(cause);
    } finally {
      if(current === request) {loading.value = false;}
    }
  }

  return { text, loading, error, load };
}

/**
 * Saves a named template as a new revision. It never changes printing: the live template only changes through
 * publish. Pass the template's current revision as `expectedVersionName` when it exists, so a revision someone else
 * saved in the meantime is not overwritten.
 */
export function useDocumentTemplateSave() {
  const saving = ref(false);

  /** Throws when the server refuses, for example text that does not parse; the error carries the reason. */
  async function save(documentTypeId: string, payload: { templateName: string; templateText?: string; copyFromLive?: boolean; expectedVersionName?: string }) {
    saving.value = true;
    try {
      const resp: any = await api({ url: `${templatesUrl(documentTypeId)}/templates`, method: "post", data: payload });
      if(commonUtil.hasError(resp)) {throw resp;}
      // The library list shows each template's latest revision.
      await refreshAfterMutation(DOCUMENT_TEMPLATE_DOMAIN, {}).catch(cause => logger.error(cause));
      return resp.data as { templateName: string; versionName: string; previousVersionName?: string };
    } finally {
      saving.value = false;
    }
  }

  return { save, saving };
}

/**
 * Deletes a named template with all of its revisions. Printing never changes: the live template cannot be deleted,
 * and making a template live copied its code. `expectedVersionName` is the revision the user saw, so one saved since
 * is not deleted unseen.
 */
export function useDocumentTemplateDelete() {
  const deleting = ref(false);

  /** Throws when the server refuses; the error carries the reason. */
  async function remove(documentTypeId: string, templateName: string, expectedVersionName: string) {
    deleting.value = true;
    try {
      const resp: any = await api({
        url: `${templatesUrl(documentTypeId)}/templates/${encodeURIComponent(templateName)}`,
        method: "delete",
        params: { expectedVersionName },
      });
      if(commonUtil.hasError(resp)) {throw resp;}
      await refreshAfterMutation(DOCUMENT_TEMPLATE_DOMAIN, {}).catch(cause => logger.error(cause));
    } finally {
      deleting.value = false;
    }
  }

  return { remove, deleting };
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

const ORDER_BUCKETS: Array<{ url: string; stage: PreviewOrder["stage"] }> = [
  { url: "oms/orders/salesOrders/open", stage: "open" },
  { url: "oms/orders/salesOrders/inflight", stage: "picked" },
  { url: "oms/orders/salesOrders/packed", stage: "packed" },
];
const ORDER_SHIPMENTS_QUERY = `query OrderShipments($q: String!, $first: Int!) {
  shipments(query: $q, first: $first) { edges { node { shipmentId statusId primaryOrderId originFacilityId } } }
}`;
const ORDER_PICKLISTS_QUERY = `query OrderPicklists($q: String!, $first: Int!) {
  orderPicklists(query: $q, first: $first) { edges { node { picklistId orderId picklistDate picklistStatusId facilityId } } }
}`;
// GraphQL pages are at most 100 rows: enough for the documents of 20 orders from each list.
const SEARCH_PAGE = 20;

/**
 * Finds approved sales orders by keyword (order name, HotWax order id or external id), through the same order lists
 * the fulfillment app reads (open, in progress and packed), so a user can pick the exact order to preview a template
 * with. Each order comes with what a template can render for it: its shipments for packing slips, its pick lists
 * for the pick list. An order that has none yet is still returned, so the screen can say why it cannot be used.
 */
export function usePreviewOrderSearch() {
  const orders = ref<PreviewOrder[]>([]);
  const loading = ref(false);
  const error = ref(false);
  // The orders were found but their shipments or pick lists could not be read.
  const documentsError = ref(false);
  let request = 0;

  async function graphql(queryText: string, variables: Record<string, unknown>, operationName: string) {
    const resp: any = await api({ url: "graphql", method: "post", data: { query: queryText, variables, operationName } });
    if(commonUtil.hasError(resp) || resp?.data?.errors?.length || !resp?.data?.data) {throw resp;}

    return resp.data.data;
  }

  async function documentsFor(documentTypeId: string, orderIds: string[]): Promise<Map<string, SampleDocument[]>> {
    const byOrder = new Map<string, SampleDocument[]>();
    if(!orderIds.length) {return byOrder;}
    const add = (orderId: string, document: SampleDocument) => {
      const documents = byOrder.get(orderId) || [];
      if(!documents.some(existing => existing.sourceId === document.sourceId)) {documents.push(document);}
      byOrder.set(orderId, documents);
    };
    if(documentTypeId === "PICKLIST") {
      const data = await graphql(ORDER_PICKLISTS_QUERY, { q: `orderId:${orderIds.join(",")}`, first: 100 }, "OrderPicklists");
      for(const { node } of data.orderPicklists?.edges ?? []) {
        if(node?.picklistId) {
          add(node.orderId, { sourceId: node.picklistId, kind: "picklist", statusId: node.picklistStatusId, facilityId: node.facilityId,
            orderId: node.orderId, date: node.picklistDate ? Date.parse(node.picklistDate) : undefined });
        }
      }
    } else {
      const data = await graphql(ORDER_SHIPMENTS_QUERY, { q: `primaryOrderId:${orderIds.join(",")}`, first: 100 }, "OrderShipments");
      for(const { node } of data.shipments?.edges ?? []) {
        if(node?.shipmentId) {
          add(node.primaryOrderId, { sourceId: node.shipmentId, kind: "shipment", statusId: node.statusId, facilityId: node.originFacilityId, orderId: node.primaryOrderId });
        }
      }
    }

    return byOrder;
  }

  async function search(documentTypeId: string, keyword: string) {
    const current = ++request;
    loading.value = true;
    error.value = false;
    documentsError.value = false;
    try {
      // The buckets return a row per ship group item; keep one order each, in its furthest stage.
      const pages = await Promise.all(ORDER_BUCKETS.map(async bucket => {
        const resp: any = await api({
          url: bucket.url,
          method: "get",
          params: { keyword: keyword.trim() || undefined, pageSize: SEARCH_PAGE, orderByField: "-orderDate" },
        });
        if(commonUtil.hasError(resp) || !Array.isArray(resp?.data?.orders)) {throw resp;}

        return resp.data.orders.map((row: any) => ({ row, stage: bucket.stage }));
      }));
      const found = new Map<string, PreviewOrder>();
      for(const { row, stage } of pages.flat()) {
        if(!row?.orderId) {continue;}
        const customerName = [row.firstName, row.lastName].filter(Boolean).join(" ");
        const existing = found.get(row.orderId);
        if(existing) {
          if(ORDER_BUCKETS.findIndex(bucket => bucket.stage === stage) > ORDER_BUCKETS.findIndex(bucket => bucket.stage === existing.stage)) {existing.stage = stage;}
          continue;
        }
        found.set(row.orderId, {
          orderId: row.orderId, orderName: row.orderName || undefined, customerName: customerName || undefined,
          facilityName: row.facilityName || undefined, orderDate: typeof row.orderDate === "number" ? row.orderDate : (row.orderDate ? Date.parse(row.orderDate) : undefined),
          stage, documents: [],
        });
      }
      const rows = [...found.values()].sort((a, b) => (b.orderDate || 0) - (a.orderDate || 0));
      let documents = new Map<string, SampleDocument[]>();
      try {
        documents = await documentsFor(documentTypeId, rows.map(order => order.orderId));
      } catch(cause) {
        // Still show the orders: the user learns the order exists and why it cannot be chosen.
        if(current === request) {documentsError.value = true;}
        logger.error(cause);
      }
      if(current !== request) {return;}
      orders.value = rows.map(order => ({ ...order, documents: (documents.get(order.orderId) || []).map(document => ({ ...document, orderName: order.orderName })) }));
    } catch(cause) {
      if(current === request) {
        orders.value = [];
        error.value = true;
      }
      logger.error(cause);
    } finally {
      if(current === request) {loading.value = false;}
    }
  }

  return { orders, loading, error, documentsError, search };
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
      result.value = { rendered: !!data.rendered, pageCount: data.pageCount, errors: data.errors || [], templateErrors: data.templateErrors || [], versionName: data.versionName, previewUrl: data.previewUrl };
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
  async function publish(documentTypeId: string, payload: { templateName?: string; versionName: string; expectedLiveVersionName: string }) {
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
