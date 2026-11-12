// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope } from "vue";

const mocks = vi.hoisted(() => ({ api: vi.fn(), refreshAfterMutation: vi.fn() }));

vi.mock("@common", () => ({
  api: (...args: any[]) => mocks.api(...args),
  commonUtil: { hasError: (resp: any) => !!resp?.data?.error, getMaargURL: () => "https://maarg.example.test/rest/s1/" },
  logger: { error: vi.fn(), warn: vi.fn() },
  useLiveEntity: vi.fn(),
}));
vi.mock("@/db/companyDb", () => ({ companyDb: { tables: new Proxy({}, { get: (_target, table) => table }) } }));
vi.mock("@/db/appDbSync", () => ({ refreshAfterMutation: (...args: any[]) => mocks.refreshAfterMutation(...args) }));

import { committedResult, usePreviewOrderSearch, useDocumentTemplateDelete, useDocumentTemplatePreview, useDocumentTemplatePublish, useDocumentTemplateSave, useDocumentTemplateText, useDocumentTemplateVersions, useSampleDocuments } from "@/composables/useDocumentTemplates";

const run = <T>(factory: () => T) => { const scope = effectScope(); return { scope, state: scope.run(factory)! }; };

beforeEach(() => {
  mocks.api.mockReset();
  mocks.refreshAfterMutation.mockReset().mockResolvedValue(3);
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});

describe("document template preview", () => {
  it("renders the selection for one shipment, then fetches the PDF from the print URL through the session", async () => {
    mocks.api.mockResolvedValueOnce({ data: { rendered: true, pageCount: 1, versionName: "02", templateErrors: [{ line: 9, expression: "x.y" }], previewUrl: "/fop/apps/pdf/PrintPackingSlip?shipmentId=100051" } })
      .mockResolvedValueOnce({ data: new Blob(["%PDF-"]) });
    const { scope, state } = run(() => useDocumentTemplatePreview());

    await state.preview("PACKING_SLIP", { templateName: "holiday-2026", versionName: "" }, "100051");

    expect(mocks.api).toHaveBeenNthCalledWith(1, { url: "poorti/documentTemplates/PACKING_SLIP/preview", method: "post", data: { templateName: "holiday-2026", versionName: undefined, sourceId: "100051" } });
    expect(mocks.api).toHaveBeenNthCalledWith(2, { baseURL: "https://maarg.example.test", url: "/fop/apps/pdf/PrintPackingSlip?shipmentId=100051", method: "get", responseType: "blob" });
    expect(state.pdfUrl.value).toBe("blob:preview");
    expect(state.result.value).toMatchObject({ rendered: true, pageCount: 1, versionName: "02", errors: [], templateErrors: [{ line: 9 }] });
    expect(state.previewed.value).toEqual({ templateName: "holiday-2026", versionName: "", sourceId: "100051" });

    scope.stop();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
  });

  it("reports a template that produced no PDF without fetching one", async () => {
    mocks.api.mockResolvedValueOnce({ data: { rendered: false, errors: [{ stage: "xsl-fo", message: "bad fo" }], templateErrors: [] } });
    const { scope, state } = run(() => useDocumentTemplatePreview());

    await state.preview("PICKLIST", { versionName: "03" }, "P1");

    expect(mocks.api).toHaveBeenCalledTimes(1);
    expect(state.pdfUrl.value).toBe("");
    expect(state.result.value).toMatchObject({ rendered: false, errors: [{ message: "bad fo" }] });
    scope.stop();
  });
});

describe("document template publish", () => {
  it("sends the live version the screen showed and refreshes the stored templates", async () => {
    mocks.api.mockResolvedValueOnce({ data: { liveVersionName: "16", previousLiveVersionName: "15" } });
    const { scope, state } = run(() => useDocumentTemplatePublish());

    const published = await state.publish("PACKING_SLIP", { templateName: "holiday-2026", versionName: "02", expectedLiveVersionName: "15" });

    expect(published.liveVersionName).toBe("16");
    expect(mocks.api).toHaveBeenCalledWith({ url: "poorti/documentTemplates/PACKING_SLIP/publish", method: "post", data: { templateName: "holiday-2026", versionName: "02", expectedLiveVersionName: "15" } });
    expect(mocks.refreshAfterMutation).toHaveBeenCalledWith("documentTemplate", {});
    scope.stop();
  });

  it("still refreshes after a refused publish, so a stale live version is replaced", async () => {
    const refused = Object.assign(new Error("400"), { response: { data: { errors: "The live PACKING_SLIP template is at version 16, not 15" } } });
    mocks.api.mockRejectedValueOnce(refused);
    const { scope, state } = run(() => useDocumentTemplatePublish());

    await expect(state.publish("PACKING_SLIP", { versionName: "14", expectedLiveVersionName: "15" })).rejects.toBe(refused);
    expect(mocks.refreshAfterMutation).toHaveBeenCalledWith("documentTemplate", {});
    expect(state.publishing.value).toBe(false);
    scope.stop();
  });
});

describe("document template versions", () => {
  it("reads a library template's history through GraphQL, as epoch millis, and resolves who saved it", async () => {
    mocks.api.mockResolvedValueOnce({ data: { data: { documentTemplateVersions: [{ versionName: "02", userId: "M1", isCurrent: true, versionDate: "2026-11-12T07:22:37.937Z" }] } } })
      .mockResolvedValueOnce({ data: { username: "aditya" } });
    const { scope, state } = run(() => useDocumentTemplateVersions());

    await state.load("PACKING_SLIP", "holiday-2026");
    await vi.waitFor(() => expect(state.usernameFor("M1")).toBe("aditya"));

    const request = mocks.api.mock.calls[0][0];
    expect(request).toMatchObject({ url: "graphql", method: "post", data: { variables: { documentTypeId: "PACKING_SLIP", templateName: "holiday-2026" }, operationName: "DocumentTemplateVersions" } });
    expect(request.data.query).toContain("documentTemplateVersions(documentTypeId: $documentTypeId, templateName: $templateName)");
    expect(state.versions.value).toEqual([{ versionName: "02", userId: "M1", isCurrent: true, versionDate: Date.parse("2026-11-12T07:22:37.937Z") }]);
    scope.stop();
  });

  it("marks an error rather than showing an empty history when GraphQL returns errors", async () => {
    mocks.api.mockResolvedValueOnce({ data: { errors: [{ message: "denied" }], data: null } });
    const { scope, state } = run(() => useDocumentTemplateVersions());

    await state.load("PACKING_SLIP");

    expect(mocks.api.mock.calls[0][0].data.variables).toEqual({ documentTypeId: "PACKING_SLIP", templateName: null });
    expect(state.error.value).toBe(true);
    expect(state.versions.value).toEqual([]);
    scope.stop();
  });
});

describe("sample documents to preview with", () => {
  it("offers recent shipped or packed shipments, newest shipped first, named by their order", async () => {
    mocks.api.mockResolvedValueOnce({ data: { data: { shipments: { edges: [
      { node: { shipmentId: "100053", statusId: "SHIPMENT_SHIPPED", primaryOrderId: "M108436", originFacilityId: "WH" } },
      { node: { shipmentId: "100060", statusId: "SHIPMENT_PACKED", primaryOrderId: "M2", originFacilityId: "WH" } },
    ] } } } }).mockResolvedValueOnce({ data: { data: { orders: { edges: [{ node: { orderId: "M108436", orderName: "#973026" } }] } } } });
    const { scope, state } = run(() => useSampleDocuments());

    await state.load("shipmentId");

    const shipmentsCall = mocks.api.mock.calls[0][0];
    expect(shipmentsCall).toMatchObject({ url: "graphql", method: "post", data: { operationName: "SampleShipments", variables: { first: 20 } } });
    expect(shipmentsCall.data.query).toContain('statusId:SHIPMENT_SHIPPED,SHIPMENT_PACKED", sortKey: SHIPPED_DATE, reverse: true');
    expect(mocks.api.mock.calls[1][0].data.variables).toEqual({ q: "orderId:M108436,M2", first: 2 });
    expect(state.samples.value).toEqual([
      { sourceId: "100053", kind: "shipment", statusId: "SHIPMENT_SHIPPED", facilityId: "WH", orderId: "M108436", orderName: "#973026" },
      { sourceId: "100060", kind: "shipment", statusId: "SHIPMENT_PACKED", facilityId: "WH", orderId: "M2", orderName: undefined },
    ]);
    scope.stop();
  });

  it("keeps the shipments when their order names cannot be read", async () => {
    mocks.api.mockResolvedValueOnce({ data: { data: { shipments: { edges: [{ node: { shipmentId: "1", primaryOrderId: "O1" } }] } } } })
      .mockRejectedValueOnce(new Error("offline"));
    const { scope, state } = run(() => useSampleDocuments());

    await state.load("shipmentId");

    expect(state.samples.value.map(sample => sample.sourceId)).toEqual(["1"]);
    expect(state.error.value).toBe(false);
    scope.stop();
  });

  it("reads the newest pick lists from Poorti's picklists REST resource", async () => {
    mocks.api.mockResolvedValueOnce({ data: [
      { picklistId: "P2", picklistDate: 1793000000000, statusId: "PICKLIST_PRINTED" },
      { picklistId: "P1", picklistDate: 1792000000000, statusId: "PICKLIST_PICKED", facilityId: "WH" },
    ] });
    const { scope, state } = run(() => useSampleDocuments());

    await state.load("picklistId");

    expect(mocks.api).toHaveBeenCalledWith({ url: "poorti/picklists", method: "get", params: { pageSize: 20, orderByField: "-picklistDate" } });
    expect(state.samples.value.map(sample => sample.sourceId)).toEqual(["P2", "P1"]);
    expect(state.samples.value[1]).toMatchObject({ kind: "picklist", statusId: "PICKLIST_PICKED", facilityId: "WH", date: 1792000000000 });
    expect(state.error.value).toBe(false);
    scope.stop();
  });

  it("offers recent approved transfer orders for a document printed from an order", async () => {
    mocks.api.mockResolvedValueOnce({ data: { orders: [
      { orderId: "TO2", orderName: "Store 12 restock", orderStatusId: "ORDER_APPROVED", facilityId: "WH", orderDate: 1793000000000 },
      { orderId: "TO1", orderStatusId: "ORDER_APPROVED" },
    ], ordersCount: 2 } });
    const { scope, state } = run(() => useSampleDocuments());

    await state.load("orderId");

    expect(mocks.api).toHaveBeenCalledWith({ url: "oms/transferOrders", method: "get", params: { keyword: undefined, orderStatusId: "ORDER_APPROVED",
      limit: 20, orderBy: "-orderDate", fieldsToSelect: "orderId,orderName,orderStatusId,facilityId,orderDate" } });
    expect(state.samples.value).toEqual([
      { sourceId: "TO2", kind: "order", statusId: "ORDER_APPROVED", facilityId: "WH", orderId: "TO2", orderName: "Store 12 restock", date: 1793000000000 },
      { sourceId: "TO1", kind: "order", statusId: "ORDER_APPROVED", facilityId: undefined, orderId: "TO1", orderName: undefined, date: undefined },
    ]);
    scope.stop();
  });

  it("reports an error instead of an empty list when the lookup fails", async () => {
    mocks.api.mockResolvedValueOnce({ data: { errors: [{ message: "denied" }], data: null } });
    const { scope, state } = run(() => useSampleDocuments());

    await state.load("shipmentId");

    expect(state.error.value).toBe(true);
    expect(state.samples.value).toEqual([]);
    scope.stop();
  });
});

describe("document template code", () => {
  it("reads one revision's code and the shared files it includes through GraphQL", async () => {
    mocks.api.mockResolvedValueOnce({ data: { data: {
      documentTemplateText: { versionName: "02", currentVersionName: "03", templateText: "<#include \"x\">" },
      documentTemplateIncludes: [{ location: "x", templateText: "<fo:block/>" }],
    } } });
    const { scope, state } = run(() => useDocumentTemplateText());

    await state.load("PICKLIST", { templateName: "pick-list-copy", versionName: "02" });

    expect(mocks.api).toHaveBeenCalledWith(expect.objectContaining({ url: "graphql", method: "post", data: expect.objectContaining({
      operationName: "DocumentTemplateText", variables: { documentTypeId: "PICKLIST", templateName: "pick-list-copy", versionName: "02" } }) }));
    expect(state.text.value).toEqual({ versionName: "02", currentVersionName: "03", templateText: "<#include \"x\">", includes: [{ location: "x", templateText: "<fo:block/>" }] });
    expect(state.error.value).toBe(false);
    scope.stop();
  });

  it("asks for the live template's current revision when nothing is chosen, and reports an error instead of empty code", async () => {
    mocks.api.mockResolvedValueOnce({ data: { data: { documentTemplateText: null }, errors: [{ message: "Template x does not exist" }] } });
    const { scope, state } = run(() => useDocumentTemplateText());

    await state.load("PICKLIST", {});

    expect(mocks.api.mock.calls[0][0].data.variables).toEqual({ documentTypeId: "PICKLIST", templateName: null, versionName: null });
    expect(state.text.value).toBeNull();
    expect(state.error.value).toBe(true);
    scope.stop();
  });
});

describe("document template save", () => {
  it("saves a revision with the revision it was edited from, then refreshes the template list", async () => {
    mocks.api.mockResolvedValueOnce({ data: { templateName: "pick-list-copy", versionName: "03", previousVersionName: "02" } });
    const { scope, state } = run(() => useDocumentTemplateSave());

    const saved = await state.save("PICKLIST", { templateName: "pick-list-copy", templateText: "<fo:root/>", expectedVersionName: "02" });

    expect(mocks.api).toHaveBeenCalledWith({ url: "poorti/documentTemplates/PICKLIST/templates", method: "post",
      data: { templateName: "pick-list-copy", templateText: "<fo:root/>", expectedVersionName: "02" } });
    expect(saved.versionName).toBe("03");
    expect(mocks.refreshAfterMutation).toHaveBeenCalledWith("documentTemplate", {});
    expect(state.saving.value).toBe(false);
    scope.stop();
  });

  it("throws the refusal so the screen can show the server's reason, and does not refresh", async () => {
    const refusal = { response: { data: { errors: "Template does not parse: (line 4, column 1)" } } };
    mocks.api.mockRejectedValueOnce(refusal);
    const { scope, state } = run(() => useDocumentTemplateSave());

    await expect(state.save("PICKLIST", { templateName: "pick-list-copy", templateText: "<#if>" })).rejects.toBe(refusal);
    expect(mocks.refreshAfterMutation).not.toHaveBeenCalled();
    expect(state.saving.value).toBe(false);
    scope.stop();
  });
});

describe("document template delete", () => {
  it("deletes a named template at the revision the user saw, then refreshes the template list", async () => {
    mocks.api.mockResolvedValueOnce({ data: { templateName: "pick-list-copy", versionName: "02" } });
    const { scope, state } = run(() => useDocumentTemplateDelete());

    await state.remove("PICKLIST", "pick-list-copy", "02");

    expect(mocks.api).toHaveBeenCalledWith({ url: "poorti/documentTemplates/PICKLIST/templates/pick-list-copy", method: "delete", params: { expectedVersionName: "02" } });
    expect(mocks.refreshAfterMutation).toHaveBeenCalledWith("documentTemplate", {});
    expect(state.deleting.value).toBe(false);
    scope.stop();
  });

  it("throws a refusal, such as a newer revision, without refreshing", async () => {
    const refusal = { response: { data: { errors: "Template pick-list-copy is at version 03, not 02" } } };
    mocks.api.mockRejectedValueOnce(refusal);
    const { scope, state } = run(() => useDocumentTemplateDelete());

    await expect(state.remove("PICKLIST", "pick-list-copy", "02")).rejects.toBe(refusal);
    expect(mocks.refreshAfterMutation).not.toHaveBeenCalled();
    scope.stop();
  });
});

describe("preview order search", () => {
  const bucket = (orders: any[]) => ({ data: { orders, ordersCount: orders.length } });

  it("searches approved orders by keyword in the open, picked and packed lists, one row per order with its shipments", async () => {
    mocks.api.mockImplementation(async (request: any) => {
      if(request.url === "oms/orders/salesOrders/open") {return bucket([{ orderId: "M1", orderName: "#5955", firstName: "Ada", lastName: "L", facilityName: "Central", orderDate: 2000 }]);}
      if(request.url === "oms/orders/salesOrders/inflight") {return bucket([{ orderId: "M1", orderName: "#5955", orderDate: 2000 }, { orderId: "M2", orderName: "#5956", orderDate: 3000 }]);}
      if(request.url === "oms/orders/salesOrders/packed") {return bucket([]);}
      return { data: { data: { shipments: { edges: [{ node: { shipmentId: "S1", statusId: "SHIPMENT_APPROVED", primaryOrderId: "M1" } }] } } } };
    });
    const { scope, state } = run(() => usePreviewOrderSearch());

    await state.search("shipmentId", " 595 ");

    const bucketCalls = mocks.api.mock.calls.map(([request]) => request).filter((request: any) => request.method === "get");
    expect(bucketCalls.map((request: any) => request.url)).toEqual(["oms/orders/salesOrders/open", "oms/orders/salesOrders/inflight", "oms/orders/salesOrders/packed"]);
    expect(bucketCalls[0].params).toEqual({ keyword: "595", pageSize: 20, orderByField: "-orderDate" });
    const lookup = mocks.api.mock.calls.map(([request]) => request).find((request: any) => request.url === "graphql");
    expect(lookup.data.variables).toEqual({ q: "primaryOrderId:M2,M1", first: 100, after: null });
    expect(state.orders.value.map(order => [order.orderId, order.stage, order.documents.map(document => document.sourceId)]))
      .toEqual([["M2", "picked", []], ["M1", "picked", ["S1"]]]);
    expect(state.orders.value[1]).toMatchObject({ customerName: "Ada L", facilityName: "Central" });
    expect(state.orders.value[1].documents[0]).toMatchObject({ kind: "shipment", orderName: "#5955" });
    scope.stop();
  });

  it("finds the orders' pick lists through Poorti's shipmentPicklists, reading every page", async () => {
    const page = (rows: any[], total: number) => ({ data: rows, headers: { "x-total-count": String(total) } });
    const shipment = (id: string, orderId: string, picklistId?: string) => ({ shipmentId: id, primaryOrderId: orderId,
      picklistShipment: picklistId ? [{ picklistId, picklist: { statusId: "PICKLIST_ASSIGNED", facilityId: "71", picklistDate: 1771713021323 } }] : [] });
    mocks.api.mockImplementation(async (request: any) => {
      if(request.url.startsWith("oms/")) {return bucket(request.url.endsWith("/inflight") ? [{ orderId: "M1", orderName: "#1" }, { orderId: "M2", orderName: "#2" }] : []);}
      // first page full (100 rows), second page the rest
      if(request.params.pageIndex === 0) {return page([shipment("S1", "M1", "P1"), ...Array.from({ length: 99 }, (_, i) => shipment(`X${i}`, "M2"))], 101);}
      return page([shipment("S2", "M2", "P2")], 101);
    });
    const { scope, state } = run(() => usePreviewOrderSearch());

    await state.search("picklistId", "");

    const lookups = mocks.api.mock.calls.map(([request]) => request).filter((request: any) => request.url === "poorti/shipmentPicklists");
    expect(lookups.map((request: any) => request.params)).toEqual([
      { primaryOrderId: "M1,M2", primaryOrderId_op: "in", pageIndex: 0, pageSize: 100 },
      { primaryOrderId: "M1,M2", primaryOrderId_op: "in", pageIndex: 1, pageSize: 100 },
    ]);
    expect(Object.fromEntries(state.orders.value.map(order => [order.orderId, order.documents.map(document => document.sourceId)]))).toEqual({ M1: ["P1"], M2: ["P2"] });
    expect(state.orders.value.find(order => order.orderId === "M1")?.documents[0]).toMatchObject({ kind: "picklist", statusId: "PICKLIST_ASSIGNED", facilityId: "71", date: 1771713021323 });
    expect(state.documentsError.value).toBe(false);
    scope.stop();
  });

  it("still shows the orders when the pick list lookup fails", async () => {
    mocks.api.mockImplementation(async (request: any) => {
      if(request.url.startsWith("oms/")) {return bucket(request.url.endsWith("/packed") ? [{ orderId: "M1", orderName: "#5955" }] : []);}
      return { data: { errors: "denied" } };
    });
    const { scope, state } = run(() => usePreviewOrderSearch());

    await state.search("picklistId", "");

    expect(mocks.api.mock.calls[0][0].params.keyword).toBeUndefined();
    expect(state.orders.value).toEqual([expect.objectContaining({ orderId: "M1", stage: "packed", documents: [] })]);
    expect(state.documentsError.value).toBe(true);
    expect(state.error.value).toBe(false);
    scope.stop();
  });

  it("searches approved transfer orders by keyword for a document printed from an order, each order its own document", async () => {
    mocks.api.mockResolvedValueOnce({ data: { orders: [{ orderId: "TO7", orderName: "Store 7", orderStatusId: "ORDER_APPROVED", orderDate: 5000 }] } });
    const { scope, state } = run(() => usePreviewOrderSearch());

    await state.search("orderId", " TO7 ");

    expect(mocks.api).toHaveBeenCalledTimes(1);
    expect(mocks.api.mock.calls[0][0]).toMatchObject({ url: "oms/transferOrders", params: { keyword: "TO7", orderStatusId: "ORDER_APPROVED", limit: 20 } });
    expect(state.orders.value).toEqual([{ orderId: "TO7", orderName: "Store 7", orderDate: 5000, stage: "open",
      documents: [expect.objectContaining({ sourceId: "TO7", kind: "order", orderName: "Store 7" })] }]);
    expect(state.error.value).toBe(false);
    scope.stop();
  });

  it("reports an error when an order list cannot be read", async () => {
    mocks.api.mockResolvedValue({ data: { errors: "Not authorized" } });
    const { scope, state } = run(() => usePreviewOrderSearch());

    await state.search("shipmentId", "5955");

    expect(state.orders.value).toEqual([]);
    expect(state.error.value).toBe(true);
    scope.stop();
  });
});

describe("committed writes whose list refresh fails", () => {
  it("a save that committed but could not refresh the list throws a CacheReconciliationError carrying the saved revision", async () => {
    mocks.api.mockResolvedValueOnce({ data: { templateName: "pick-list-copy", versionName: "03" } });
    mocks.refreshAfterMutation.mockRejectedValueOnce(new Error("worker offline"));
    const { scope, state } = run(() => useDocumentTemplateSave());

    const error = await state.save("PICKLIST", { templateName: "pick-list-copy", templateText: "<a/>", expectedVersionName: "02" }).catch(cause => cause);

    expect(error.name).toBe("CacheReconciliationError");
    expect(error.mutationCommitted).toBe(true);
    expect(committedResult(error)).toEqual({ templateName: "pick-list-copy", versionName: "03" });
    expect(mocks.api).toHaveBeenCalledTimes(1);
    scope.stop();
  });

  it("a delete and a publish report the same way, and a refused publish stays a refusal", async () => {
    mocks.api.mockResolvedValueOnce({ data: {} }).mockResolvedValueOnce({ data: { liveVersionName: "16" } });
    mocks.refreshAfterMutation.mockRejectedValue(new Error("worker offline"));
    const deleting = run(() => useDocumentTemplateDelete());
    const publishing = run(() => usePublish());

    expect((await deleting.state.remove("PICKLIST", "pick-list-copy", "02").catch(cause => cause)).name).toBe("CacheReconciliationError");
    const published = await publishing.state.publish("PICKLIST", { templateName: "x", versionName: "01", expectedLiveVersionName: "15" }).catch(cause => cause);
    expect(published.name).toBe("CacheReconciliationError");
    expect(committedResult(published)).toEqual({ liveVersionName: "16" });

    const refused = Object.assign(new Error("400"), { response: { data: { errors: "stale" } } });
    mocks.api.mockRejectedValueOnce(refused);
    await expect(publishing.state.publish("PICKLIST", { versionName: "14", expectedLiveVersionName: "15" })).rejects.toBe(refused);
    deleting.scope.stop();
    publishing.scope.stop();
  });

  function usePublish() { return useDocumentTemplatePublish(); }
});

describe("preview document lookup paging", () => {
  it("reads every page of shipments for the orders found, following the cursor", async () => {
    mocks.api.mockImplementation(async (request: any) => {
      if(request.method === "get") {return { data: { orders: request.url.endsWith("/open") ? [{ orderId: "M1", orderName: "#1" }] : [] } };}
      if(!request.data.variables.after) {
        return { data: { data: { shipments: { edges: [{ node: { shipmentId: "S1", primaryOrderId: "M1" } }], pageInfo: { hasNextPage: true, endCursor: "c1" } } } } };
      }
      return { data: { data: { shipments: { edges: [{ node: { shipmentId: "S2", primaryOrderId: "M1" } }], pageInfo: { hasNextPage: false, endCursor: "c2" } } } } };
    });
    const { scope, state } = run(() => usePreviewOrderSearch());

    await state.search("shipmentId", "");

    const pages = mocks.api.mock.calls.map(([request]) => request).filter((request: any) => request.url === "graphql");
    expect(pages.map((request: any) => request.data.variables.after)).toEqual([null, "c1"]);
    expect(state.orders.value[0].documents.map(document => document.sourceId)).toEqual(["S1", "S2"]);
    scope.stop();
  });

  it("refuses a cursor that does not advance instead of listing a partial page", async () => {
    mocks.api.mockImplementation(async (request: any) => {
      if(request.method === "get") {return { data: { orders: request.url.endsWith("/open") ? [{ orderId: "M1" }] : [] } };}
      return { data: { data: { shipments: { edges: [{ node: { shipmentId: "S1", primaryOrderId: "M1" } }], pageInfo: { hasNextPage: true, endCursor: "same" } } } } };
    });
    const { scope, state } = run(() => usePreviewOrderSearch());

    await state.search("shipmentId", "");

    expect(state.documentsError.value).toBe(true);
    expect(state.orders.value[0].documents).toEqual([]);
    scope.stop();
  });
});
