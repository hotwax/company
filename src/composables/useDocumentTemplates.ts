import { api, commonUtil, logger, useLiveEntity } from "@common";
import { computed, onScopeDispose, ref } from "vue";
import { companyDb } from "@/db/companyDb";
import { refreshAfterMutation } from "@/db/appDbSync";
import { CacheReconciliationError } from "@/utils/db/cacheReconciliationError";
import type { DocumentTemplate, DocumentTemplateVersion, PreviewOrder, PreviewResult, SampleDocument, SourceParameter, TemplateSelection, TemplateText } from "@/utils/documentTemplates";

/**
 * Document templates: the packing slip and pick list templates printing uses (Poorti
 * DocumentTemplateServices, the same services as the document-templates MCP tools).
 *   - Reads go through the OMS GraphQL endpoint (moqui-gql), the one agents query: the document types
 *     and their libraries are the class C `documentTemplate` domain, which the screens fetch when they
 *     open and after a publish and read from the local table; version history is a server ledger, read
 *     when shown (like app version history).
 *   - Writes go to the `document-templates` REST root, open only to the user groups the OMS grants artifact group
 *     DOCUMENT_TEMPLATE_EDIT (on an OMS that predates it, the same paths under `poorti/documentTemplates`): `templates` saves a named template as a new revision
 *     (never the live one, so saving never changes printing) and deletes one with all its revisions; preview renders a template for one shipment
 *     or picklist, and the PDF is fetched from the preview URL the server returns, through the app's session;
 *     publish and rollback go through `publish`, which checks the live version the screen showed.
 */

const DOCUMENT_TEMPLATE_DOMAIN = "documentTemplate";

/**
 * Refreshes the template list after a write the server committed. When that refresh fails the write still
 * happened, so this throws a `CacheReconciliationError` carrying the write's `result`: the screen reports it as
 * done but the list as possibly stale, and never repeats the write.
 */
async function reconcileAfterWrite<T>(pk: Record<string, unknown>, result: T): Promise<T> {
  try {
    await refreshAfterMutation(DOCUMENT_TEMPLATE_DOMAIN, {});
  } catch(cause) {
    throw Object.assign(new CacheReconciliationError(DOCUMENT_TEMPLATE_DOMAIN, pk, cause), { result });
  }

  return result;
}

/** The committed write's result from a `CacheReconciliationError` thrown after it. */
export const committedResult = <T>(error: unknown): T | undefined => (error as { result?: T })?.result;
/**
 * A write to the document template REST root, `document-templates/{documentTypeId}{path}`. An OMS that predates that
 * root (hotwax-poorti#484) has the same paths under `poorti/documentTemplates`, so a 404 is retried there; any other
 * refusal, such as a user without template editing access, is not.
 */
async function templatesApi(documentTypeId: string, path: string, config: Record<string, unknown>): Promise<any> {
  const url = (root: string) => `${root}/${encodeURIComponent(documentTypeId)}${path}`;
  try {
    return await api({ ...config, url: url("document-templates") });
  } catch(error: any) {
    if(statusOf(error) !== 404) {throw error;}
    return api({ ...config, url: url("poorti/documentTemplates") });
  }
}

const statusOf = (error: any): number | undefined => error?.response?.status ?? error?.status;

/**
 * Whether this user may save, preview, publish and delete templates. The OMS answers it: `document-templates/access`
 * runs only for the user groups it grants artifact group DOCUMENT_TEMPLATE_EDIT and refuses everyone else with a 403.
 * An OMS that predates the route answers 404; there the DOCUMENT_TEMPLATE_ADMIN permission still decides
 * (`legacyCanEdit`). Until the answer arrives, and after any other failure, editing stays off.
 */
export function useDocumentTemplateAccess(legacyCanEdit: () => boolean) {
  const canEdit = ref(false);
  const checked = ref(false);

  async function check(): Promise<boolean> {
    try {
      const resp: any = await api({ url: "document-templates/access", method: "get" });
      canEdit.value = !commonUtil.hasError(resp) && resp?.data?.canEdit === true;
    } catch(error: any) {
      const status = statusOf(error);
      if(status === 404) {
        canEdit.value = legacyCanEdit();
      } else {
        if(status !== 403) {logger.error("Failed to check document template access", error);}
        canEdit.value = false;
      }
    }
    checked.value = true;
    return canEdit.value;
  }

  return { canEdit, checked, check };
}
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
/** Moqui REST returns dates as epoch millis, GraphQL as ISO strings. */
const toMillis = (value: unknown): number | undefined =>
  typeof value === "number" ? value : typeof value === "string" && value ? Date.parse(value) : undefined;
const SAMPLE_COUNT = 20;
// Transfer orders over the OMS REST list the Fulfillment and Transfers apps read; approved ones are the ones picked.
const TRANSFER_ORDER_FIELDS = "orderId,orderName,orderStatusId,facilityId,orderDate";

async function approvedTransferOrders(keyword: string, limit: number): Promise<any[]> {
  const resp: any = await api({
    url: "oms/transferOrders",
    method: "get",
    params: { keyword: keyword || undefined, orderStatusId: "ORDER_APPROVED", limit, orderBy: "-orderDate", fieldsToSelect: TRANSFER_ORDER_FIELDS },
  });
  if(commonUtil.hasError(resp) || !Array.isArray(resp?.data?.orders)) {throw resp;}

  return resp.data.orders.filter((row: any) => row?.orderId);
}

const transferOrderDocument = (row: any): SampleDocument => ({
  sourceId: row.orderId, kind: "order", statusId: row.orderStatusId, facilityId: row.facilityId || undefined,
  orderId: row.orderId, orderName: row.orderName || undefined, date: toMillis(row.orderDate),
});

const SAMPLE_SHIPMENTS_QUERY = `query SampleShipments($first: Int!) {
  shipments(query: "statusId:SHIPMENT_SHIPPED,SHIPMENT_PACKED", sortKey: SHIPPED_DATE, reverse: true, first: $first) {
    edges { node { shipmentId statusId primaryOrderId originFacilityId } }
  }
}`;
const SAMPLE_ORDERS_QUERY = `query SampleOrders($q: String!, $first: Int!) {
  orders(query: $q, first: $first) { edges { node { orderId orderName } } }
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
      const resp: any = await templatesApi(documentTypeId, "/templates", { method: "post", data: payload });
      if(commonUtil.hasError(resp)) {throw resp;}
      // The library list shows each template's latest revision.
      return await reconcileAfterWrite({ documentTypeId, templateName: payload.templateName },
        resp.data as { templateName: string; versionName: string; previousVersionName?: string });
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
      const resp: any = await templatesApi(documentTypeId, `/templates/${encodeURIComponent(templateName)}`, {
        method: "delete",
        params: { expectedVersionName },
      });
      if(commonUtil.hasError(resp)) {throw resp;}
      await reconcileAfterWrite({ documentTypeId, templateName }, resp.data);
    } finally {
      deleting.value = false;
    }
  }

  return { remove, deleting };
}

/**
 * Recent real documents to preview a template with, so nobody has to know an id: shipped or packed
 * shipments for packing slips (newest shipped first, with their order's name, from the OMS GraphQL
 * endpoint), recent pick lists for pick lists, recent approved transfer orders for documents printed
 * from an order.
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

  /**
   * The newest pick lists, from Poorti's `picklists` REST resource. Released moqui-gql versions have no pick list
   * root, so pick lists are read over REST on every OMS version.
   */
  async function picklistSamples(): Promise<SampleDocument[]> {
    const resp: any = await api({ url: "poorti/picklists", method: "get", params: { pageSize: SAMPLE_COUNT, orderByField: "-picklistDate" } });
    if(commonUtil.hasError(resp) || !Array.isArray(resp?.data)) {throw resp;}

    return resp.data.filter((row: any) => row?.picklistId).map((row: any) => ({
      sourceId: row.picklistId, kind: "picklist" as const, statusId: row.statusId, facilityId: row.facilityId || undefined, date: toMillis(row.picklistDate),
    }));
  }

  async function load(sourceParameter: SourceParameter) {
    const current = ++request;
    loading.value = true;
    error.value = false;
    try {
      const rows = sourceParameter === "picklistId" ? await picklistSamples()
        : sourceParameter === "orderId" ? (await approvedTransferOrders("", SAMPLE_COUNT)).map(transferOrderDocument)
        : await shipmentSamples();
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
const ORDER_SHIPMENTS_QUERY = `query OrderShipments($q: String!, $first: Int!, $after: String) {
  shipments(query: $q, first: $first, after: $after) {
    edges { node { shipmentId statusId primaryOrderId originFacilityId } }
    pageInfo { hasNextPage endCursor }
  }
}`;
// Lookups read every page (GraphQL returns at most 100 rows a page) and refuse rather than list part of a set.
const LOOKUP_PAGE = 100;
const LOOKUP_MAX_PAGES = 20;
const SEARCH_PAGE = 20;

/**
 * Finds approved sales orders by keyword (order name, HotWax order id or external id), through the same order lists
 * the fulfillment app reads (open, in progress and packed), so a user can pick the exact order to preview a template
 * with. Each order comes with what a template can render for it: its shipments for packing slips, its pick lists
 * for a pick list. An order that has none yet is still returned, so the screen can say why it cannot be used.
 * Documents printed from an order (a transfer order pick list) search approved transfer orders instead.
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

  /**
   * Every row of a Moqui entity REST list, page by page (`pageIndex`, `pageSize`, and the `X-Total-Count` header);
   * refuses rather than return a partial list.
   */
  async function allRestRows(url: string, params: Record<string, unknown>): Promise<any[]> {
    const rows: any[] = [];
    for(let pageIndex = 0; pageIndex < LOOKUP_MAX_PAGES; pageIndex++) {
      const resp: any = await api({ url, method: "get", params: { ...params, pageIndex, pageSize: LOOKUP_PAGE } });
      if(commonUtil.hasError(resp) || !Array.isArray(resp?.data)) {throw resp;}
      rows.push(...resp.data);
      const total = Number(resp.headers?.["x-total-count"]);
      if(resp.data.length < LOOKUP_PAGE || (Number.isFinite(total) && rows.length >= total)) {return rows;}
    }
    throw new Error(`${url} has more than ${LOOKUP_MAX_PAGES * LOOKUP_PAGE} rows`);
  }

  /** Every row of a connection, page by page; refuses rather than return a partial list. */
  async function allRows(queryText: string, root: string, operationName: string, q: string): Promise<any[]> {
    const rows: any[] = [];
    let after: string | null = null;
    for(let page = 0; page < LOOKUP_MAX_PAGES; page++) {
      const data = await graphql(queryText, { q, first: LOOKUP_PAGE, after }, operationName);
      const connection = data[root];
      rows.push(...(connection?.edges ?? []).map((edge: any) => edge?.node).filter(Boolean));
      const next = connection?.pageInfo?.hasNextPage ? connection.pageInfo.endCursor : null;
      if(!next) {return rows;}
      if(next === after) {throw new Error(`${operationName} did not advance past ${after}`);}
      after = next;
    }
    throw new Error(`${operationName} has more than ${LOOKUP_MAX_PAGES * LOOKUP_PAGE} rows`);
  }

  async function documentsFor(sourceParameter: SourceParameter, orderIds: string[]): Promise<Map<string, SampleDocument[]>> {
    const byOrder = new Map<string, SampleDocument[]>();
    if(!orderIds.length) {return byOrder;}
    const add = (orderId: string, document: SampleDocument) => {
      const documents = byOrder.get(orderId) || [];
      if(!documents.some(existing => existing.sourceId === document.sourceId)) {documents.push(document);}
      byOrder.set(orderId, documents);
    };
    if(sourceParameter === "picklistId") {
      // Poorti's shipmentPicklists: each of the orders' shipments with the pick lists it is on (released moqui-gql
      // versions have no pick list root).
      const shipments = await allRestRows("poorti/shipmentPicklists", { primaryOrderId: orderIds.join(","), primaryOrderId_op: "in" });
      for(const shipment of shipments) {
        for(const link of Array.isArray(shipment?.picklistShipment) ? shipment.picklistShipment : []) {
          if(!link?.picklistId || !shipment.primaryOrderId) {continue;}
          add(shipment.primaryOrderId, { sourceId: link.picklistId, kind: "picklist", statusId: link.picklist?.statusId,
            facilityId: link.picklist?.facilityId || undefined, orderId: shipment.primaryOrderId, date: toMillis(link.picklist?.picklistDate) });
        }
      }
    } else {
      for(const node of await allRows(ORDER_SHIPMENTS_QUERY, "shipments", "OrderShipments", `primaryOrderId:${orderIds.join(",")}`)) {
        if(node.shipmentId) {
          add(node.primaryOrderId, { sourceId: node.shipmentId, kind: "shipment", statusId: node.statusId, facilityId: node.originFacilityId, orderId: node.primaryOrderId });
        }
      }
    }

    return byOrder;
  }

  /** Approved transfer orders: each is the document it prints, so none is left without one. */
  async function searchTransferOrders(keyword: string): Promise<PreviewOrder[]> {
    return (await approvedTransferOrders(keyword, SEARCH_PAGE)).map(row => {
      const document = transferOrderDocument(row);
      return { orderId: row.orderId, orderName: document.orderName, orderDate: document.date, stage: "open", documents: [document] };
    });
  }

  async function search(sourceParameter: SourceParameter, keyword: string) {
    const current = ++request;
    loading.value = true;
    error.value = false;
    documentsError.value = false;
    try {
      if(sourceParameter === "orderId") {
        const found = await searchTransferOrders(keyword.trim());
        if(current === request) {orders.value = found;}
        return;
      }
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
        documents = await documentsFor(sourceParameter, rows.map(order => order.orderId));
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
      const resp: any = await templatesApi(documentTypeId, "/preview", {
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

  /**
   * Throws when the server refuses (the error carries the server's reason, `serverErrorMessage`), or a
   * `CacheReconciliationError` when the publish committed but the list could not be refreshed.
   */
  async function publish(documentTypeId: string, payload: { templateName?: string; versionName: string; expectedLiveVersionName: string }) {
    publishing.value = true;
    try {
      let resp: any;
      try {
        resp = await templatesApi(documentTypeId, "/publish", { method: "post", data: payload });
        if(commonUtil.hasError(resp)) {throw resp;}
      } catch(refusal) {
        // Someone else's publish may have made ours stale: show the server's state, but report the refusal.
        await refreshAfterMutation(DOCUMENT_TEMPLATE_DOMAIN, {}).catch(cause => logger.error(cause));
        throw refusal;
      }
      return await reconcileAfterWrite({ documentTypeId }, resp.data as { liveVersionName?: string; previousLiveVersionName?: string });
    } finally {
      publishing.value = false;
    }
  }

  return { publish, publishing };
}
