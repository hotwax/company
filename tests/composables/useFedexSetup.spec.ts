import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  api: vi.fn(),
  calls: [] as string[],
  tenant: { internalId: "T1", sendUrl: "https://u" } as any,
}));

vi.mock("@common", () => ({
  api: (...a: any[]) => h.api(...a),
  translate: (key: string, values: Record<string, string> = {}) => key.replace(/\{(\w+)\}/g, (_, name) => values[name]),
  commonUtil: { hasError: (r: any) => Boolean(r?.error) },
  logger: { error: vi.fn() },
  useSolrSearch: () => ({ prepareSolrQuery: (q: any) => q, runSolrQuery: (q: any) => h.api({ solr: q }) }),
  useLiveEntity: () => ({ records: { value: [] }, hydrated: { value: true } }),
}));
vi.mock("@/db/appDbSync", () => ({
  refreshAfterMutation: vi.fn(async () => { h.calls.push("refresh"); }),
  resyncDomain: vi.fn(),
  bootstrapState: { errors: {} },
  startAppDbSync: vi.fn(),
}));
vi.mock("@/db/companyDb", () => ({ companyDb: { tables: {} } }));
vi.mock("@/composables/useCarriers", () => ({
  createCarrier: vi.fn(async () => { h.calls.push("carrier"); return "FEDEX"; }),
  useCarriers: () => ({ carriers: { value: [] }, hydrated: { value: true } }),
}));
vi.mock("@/composables/useProductStores", () => ({
  useProductStoreShippingMethodsLive: () => ({ fetchShippingMethodsFor: vi.fn(async () => []) }),
}));
vi.mock("@/composables/useUnigate", () => ({
  fetchUnigateRemoteConfig: vi.fn(async () => h.tenant),
  createShippingGatewayAuth: vi.fn(async (d: any) => { h.calls.push(`auth:${d.shippingGatewayAuthId}:${d.username}:${d.publicKey}`); return "SERVER_ID"; }),
  updateShippingGatewayAuth: vi.fn(async (id: string, d: any) => { h.calls.push(`update:${id}:${d.username}:${d.publicKey}:${d.shippingGatewayConfigId}`); }),
  saveShippingCarrierConfig: vi.fn(async (d: any) => { h.calls.push(`config:${d.carrierConfigId ?? "new"}:${d.facilityId ?? "-"}:${d.gatewayAuthId}:${d.carrierAccountId}`); }),
  deleteShippingCarrierConfig: vi.fn(async (id: string) => { h.calls.push(`delete:${id}`); }),
  useUnigate: () => ({
    isConfigured: { value: true }, shippingGatewayAuths: { value: [] }, shippingCarrierConfigs: { value: [] },
    status: { value: {} },
  }),
}));

const form = { productStoreId: "STORE", accountNumber: " 123 ", apiKey: "k", secretKey: "s", facilityAccounts: [] as any[] };
const none = { configs: [] as any[], carrierExists: true };

describe("resolveFedexAuth", () => {
  const auth = (id: string, configId = "FEDEX") => ({ shippingGatewayAuthId: id, shippingGatewayConfigId: configId } as any);
  const config = (storeId: string, gatewayAuthId: string) => ({ carrierPartyId: "FEDEX", productStoreId: storeId, gatewayAuthId } as any);

  it("keeps the credentials a store is already linked to, not the first FedEx auth", async () => {
    const { resolveFedexAuth } = await import("@/composables/useFedexSetup");
    const auths = [auth("A1"), auth("A2")];
    expect(resolveFedexAuth(auths, [config("S2", "A2")], "S2")?.shippingGatewayAuthId).toBe("A2");
  });

  it("uses the only FedEx auth for an unlinked store, and nothing when there are several", async () => {
    const { resolveFedexAuth } = await import("@/composables/useFedexSetup");
    expect(resolveFedexAuth([auth("A1"), auth("X", "UPS")], [], "S1")?.shippingGatewayAuthId).toBe("A1");
    expect(resolveFedexAuth([auth("A1"), auth("A2")], [], "S1")).toBeUndefined();
    expect(resolveFedexAuth([auth("A1"), auth("A2")], [], "S1", "A2")?.shippingGatewayAuthId).toBe("A2");
  });
});

describe("useFedexSetup", () => {
  beforeEach(() => { h.api.mockReset(); h.calls.length = 0; h.tenant = { internalId: "T1", sendUrl: "https://u" }; });

  it("creates the carrier, the auth (key as username, secret as public key) and the store link in order", async () => {
    const { saveFedexSetup } = await import("@/composables/useFedexSetup");
    await saveFedexSetup(form, { configs: [], carrierExists: false });
    expect(h.calls).toEqual(["carrier", "refresh", "auth:FEDEX:k:s", "config:new:-:SERVER_ID:123"]);
  });

  it("updates existing records in place and keeps the saved credentials when the fields are blank", async () => {
    const { saveFedexSetup } = await import("@/composables/useFedexSetup");
    const configs = [{ carrierConfigId: "C1", carrierPartyId: "FEDEX", productStoreId: "STORE", gatewayAuthId: "FEDEX_OLD" }];
    await saveFedexSetup({ ...form, apiKey: "", secretKey: "" }, { authId: "FEDEX_OLD", configs, carrierExists: true });
    expect(h.calls).toEqual(["config:C1:-:FEDEX_OLD:123"]);

    h.calls.length = 0;
    await saveFedexSetup(form, { authId: "FEDEX_OLD", configs, carrierExists: true });
    expect(h.calls).toEqual(["update:FEDEX_OLD:k:s:FEDEX", "config:C1:-:FEDEX_OLD:123"]);
  });

  it("saves one config per facility account and deletes the ones removed from the form", async () => {
    const { saveFedexSetup } = await import("@/composables/useFedexSetup");
    const configs = [
      { carrierConfigId: "C1", carrierPartyId: "FEDEX", productStoreId: "STORE" },
      { carrierConfigId: "C2", carrierPartyId: "FEDEX", productStoreId: "STORE", facilityId: "OLD_FAC" },
      { carrierConfigId: "C3", carrierPartyId: "FEDEX", productStoreId: "OTHER", facilityId: "F9" },
    ];
    await saveFedexSetup(
      { ...form, facilityAccounts: [{ facilityId: "F1", accountNumber: " 456 " }] },
      { authId: "A", configs, carrierExists: true },
    );
    expect(h.calls).toEqual(["update:A:k:s:FEDEX", "config:C1:-:A:123", "config:new:F1:A:456", "delete:C2"]);
  });

  it("rebuilds the form from a store's saved configs", async () => {
    const { fedexFormFromConfigs } = await import("@/composables/useFedexSetup");
    expect(fedexFormFromConfigs([
      { carrierPartyId: "FEDEX", productStoreId: "STORE", carrierAccountId: "123" },
      { carrierPartyId: "FEDEX", productStoreId: "STORE", facilityId: "F1", carrierAccountId: "456" },
      { carrierPartyId: "UPS", productStoreId: "STORE", carrierAccountId: "9" },
    ] as any, "STORE")).toEqual({ accountNumber: "123", facilityAccounts: [{ facilityId: "F1", accountNumber: "456" }] });
  });

  it("refuses bad input and a missing Unigate tenant before saving anything", async () => {
    const { saveFedexSetup } = await import("@/composables/useFedexSetup");
    await expect(saveFedexSetup({ ...form, secretKey: "" }, none)).rejects.toThrow(/required/);
    await expect(saveFedexSetup({ ...form, accountNumber: "" }, none)).rejects.toThrow(/account number/);
    await expect(saveFedexSetup({ ...form, apiKey: "k", secretKey: "" }, { ...none, authId: "A" })).rejects.toThrow(/both/);
    await expect(saveFedexSetup({ ...form, facilityAccounts: [{ facilityId: "F", accountNumber: "" }] }, none)).rejects.toThrow(/facility/i);
    await expect(saveFedexSetup({ ...form, facilityAccounts: [{ facilityId: "F", accountNumber: "1" }, { facilityId: "F", accountNumber: "2" }] }, none)).rejects.toThrow(/only have one/);
    h.tenant = null;
    await expect(saveFedexSetup(form, none)).rejects.toThrow(/Unigate/);
    expect(h.calls).toEqual([]);
  });

  const methods = [
    { partyId: "FEDEX", shipmentMethodTypeId: "FEDEX_GROUND", isTrackingRequired: "Y" },
    { partyId: "FEDEX", shipmentMethodTypeId: "FEDEX_2DAY" },
    { partyId: "FEDEX", shipmentMethodTypeId: "SHIP_TO_STORE" },
  ];
  const order = { shipmentId: "S1", orderId: "O1", facilityId: "F1", itemCount: 1 };
  const seg = (extra: any) => ({ data: { shipmentPackageRouteSegDetails: [{ shipmentRouteSegmentId: "R1", ...extra }] } });
  const urls = () => h.api.mock.calls.map((c: any[]) => c[0].url);

  it("moves a non-FedEx shipment to FedEx before packing, then reads the label", async () => {
    const { generateSampleLabel } = await import("@/composables/useFedexSetup");
    h.api
      .mockResolvedValueOnce(seg({ carrierPartyId: "UPS", shipmentMethodTypeId: "UPS_GROUND" }))
      .mockResolvedValueOnce({ data: {} })
      .mockResolvedValueOnce({ data: {} })
      .mockResolvedValueOnce({ data: { shipmentPackageRouteSegDetails: [
        { carrierServiceStatusId: "SHRSCS_VOIDED", trackingCode: "OLD", labelImageUrl: "old" },
        { trackingCode: "T1", labelImageUrl: "https://l.pdf", carrierPartyId: "FEDEX" },
      ] } });
    const label = await generateSampleLabel(order, methods);
    expect(label).toMatchObject({ trackingCode: "T1", labelImageUrl: "https://l.pdf" });
    expect(urls()).toEqual([
      "/poorti/shipmentPackageRouteSegDetails",
      "/poorti/updateShipmentCarrierAndMethod",
      "/poorti/shipments/S1/pack",
      "/poorti/shipmentPackageRouteSegDetails",
    ]);
    expect(h.api.mock.calls[1][0]).toMatchObject({
      method: "PUT",
      data: { shipmentId: "S1", shipmentRouteSegmentId: "R1", carrierPartyId: "FEDEX", shipmentMethodTypeId: "FEDEX_GROUND", isTrackingRequired: "Y" },
    });
  });

  it("skips the carrier update when the shipment is already FedEx with a supported method", async () => {
    const { generateSampleLabel } = await import("@/composables/useFedexSetup");
    h.api
      .mockResolvedValueOnce(seg({ carrierPartyId: "FEDEX", shipmentMethodTypeId: "FEDEX_2DAY" }))
      .mockResolvedValueOnce({ data: {} })
      .mockResolvedValueOnce(seg({ carrierPartyId: "FEDEX", trackingCode: "T", labelImageUrl: "u" }));
    await generateSampleLabel(order, methods);
    expect(urls()).not.toContain("/poorti/updateShipmentCarrierAndMethod");
  });

  it("keeps the current method on a switch when FedEx offers it", async () => {
    const { generateSampleLabel } = await import("@/composables/useFedexSetup");
    h.api
      .mockResolvedValueOnce(seg({ carrierPartyId: "UPS", shipmentMethodTypeId: "FEDEX_2DAY" }))
      .mockResolvedValueOnce({ data: {} })
      .mockResolvedValueOnce({ data: {} })
      .mockResolvedValueOnce(seg({ carrierPartyId: "FEDEX", trackingCode: "T", labelImageUrl: "u" }));
    await generateSampleLabel(order, methods);
    expect(h.api.mock.calls[1][0].data.shipmentMethodTypeId).toBe("FEDEX_2DAY");
  });

  it("keeps the shipment's own method when the store has no FedEx methods", async () => {
    const { generateSampleLabel } = await import("@/composables/useFedexSetup");
    h.api
      .mockResolvedValueOnce(seg({ carrierPartyId: "UPS", shipmentMethodTypeId: "STANDARD" }))
      .mockResolvedValueOnce({ data: {} })
      .mockResolvedValueOnce({ data: {} })
      .mockResolvedValueOnce({ data: { shipmentPackageRouteSegDetails: [{ trackingCode: "T1", labelImageUrl: "u", carrierPartyId: "FEDEX" }] } });
    await generateSampleLabel(order, []);
    expect(h.api.mock.calls[1][0].data).toMatchObject({ carrierPartyId: "FEDEX", shipmentMethodTypeId: "STANDARD" });
  });

  it("does not pack if the carrier update fails", async () => {
    const { generateSampleLabel } = await import("@/composables/useFedexSetup");
    h.api
      .mockResolvedValueOnce(seg({ carrierPartyId: "UPS", shipmentMethodTypeId: "X" }))
      .mockResolvedValueOnce({ error: true, data: {} });
    await expect(generateSampleLabel(order, methods)).rejects.toThrow();
    expect(urls()).not.toContain("/poorti/shipments/S1/pack");
  });

  it("rejects a label that came from another carrier", async () => {
    const { generateSampleLabel } = await import("@/composables/useFedexSetup");
    h.api
      .mockResolvedValueOnce(seg({ carrierPartyId: "FEDEX", shipmentMethodTypeId: "FEDEX_GROUND" }))
      .mockResolvedValueOnce({ data: {} })
      .mockResolvedValueOnce(seg({ carrierPartyId: "UPS", trackingCode: "T", labelImageUrl: "u" }));
    await expect(generateSampleLabel(order, methods)).rejects.toThrow(/UPS, not FedEx/);
  });

  it("picks an order that has no shipment first, then packs the shipment the wave created", async () => {
    const { generateSampleLabel } = await import("@/composables/useFedexSetup");
    const items = [{ orderId: "O9", orderItemSeqId: "00101", shipGroupSeqId: "00001", productId: "P1", quantity: 1 }];
    h.api
      .mockResolvedValueOnce({ data: { shipments: [] } })
      .mockResolvedValueOnce({ data: { picklistId: "PL", shipmentIds: ["S9"] } })
      .mockResolvedValueOnce(seg({ carrierPartyId: "FEDEX", shipmentMethodTypeId: "FEDEX_GROUND" }))
      .mockResolvedValueOnce({ data: {} })
      .mockResolvedValueOnce(seg({ carrierPartyId: "FEDEX", trackingCode: "T", labelImageUrl: "u" }));
    await generateSampleLabel({ shipmentId: "", orderId: "O9", facilityId: "F1", itemCount: 1, hasShipment: false, items }, methods);
    expect(urls()).toEqual([
      "/poorti/shipments",
      "/poorti/createOrderFulfillmentWave",
      "/poorti/shipmentPackageRouteSegDetails",
      "/poorti/shipments/S9/pack",
      "/poorti/shipmentPackageRouteSegDetails",
    ]);
    expect(h.api.mock.calls[1][0].data).toMatchObject({ statusId: "PICKLIST_ASSIGNED", orderItems: items });
  });

  it("uses the shipment an already picked order has instead of picking it again", async () => {
    const { generateSampleLabel } = await import("@/composables/useFedexSetup");
    h.api
      .mockResolvedValueOnce({ data: { shipments: [{ shipmentId: "S7", statusId: "SHIPMENT_APPROVED", shipGroupSeqId: "00001" }] } })
      .mockResolvedValueOnce(seg({ carrierPartyId: "FEDEX", shipmentMethodTypeId: "FEDEX_GROUND" }))
      .mockResolvedValueOnce({ data: {} })
      .mockResolvedValueOnce(seg({ carrierPartyId: "FEDEX", trackingCode: "T", labelImageUrl: "u" }));
    await generateSampleLabel({ shipmentId: "", orderId: "O7", facilityId: "F1", itemCount: 1, hasShipment: false, shipGroupSeqId: "00001", items: [{} as any] }, methods);
    expect(urls()).not.toContain("/poorti/createOrderFulfillmentWave");
    expect(urls()).toContain("/poorti/shipments/S7/pack");
  });

  it("does not pack a shipment that is already packed, only asks for the missing label", async () => {
    const { generateSampleLabel } = await import("@/composables/useFedexSetup");
    h.api
      .mockResolvedValueOnce(seg({ carrierPartyId: "FEDEX", shipmentMethodTypeId: "FEDEX_GROUND" }))
      .mockResolvedValueOnce(seg({ carrierPartyId: "FEDEX", gatewayMessage: "old" }))
      .mockResolvedValueOnce({ data: {} })
      .mockResolvedValueOnce(seg({ carrierPartyId: "FEDEX", trackingCode: "T", labelImageUrl: "u" }));
    await generateSampleLabel({ ...order, statusId: "SHIPMENT_PACKED" }, methods);
    expect(urls()).not.toContain("/poorti/shipments/S1/pack");
    expect(urls()).toContain("/poorti/shipments/retryShippingLabel");
  });

  it("refuses to pick an order whose item list is incomplete", async () => {
    const { generateSampleLabel } = await import("@/composables/useFedexSetup");
    h.api.mockResolvedValueOnce({ data: { shipments: [] } });
    await expect(generateSampleLabel({
      shipmentId: "", orderId: "O8", itemCount: 3, hasShipment: false, hasPartialItems: true, items: [{} as any],
    }, methods)).rejects.toThrow(/too many items/);
    expect(urls()).not.toContain("/poorti/createOrderFulfillmentWave");
  });

  it("never reuses a shipment of another ship group or one it can't match", async () => {
    const { generateSampleLabel } = await import("@/composables/useFedexSetup");
    const items = [{ orderId: "O7", orderItemSeqId: "00101", shipGroupSeqId: "00001", productId: "P", quantity: 1 }];
    const unpicked = { shipmentId: "", orderId: "O7", itemCount: 1, hasShipment: false, shipGroupSeqId: "00001", items };

    // Another ship group's shipment: picks this group instead.
    h.api.mockResolvedValueOnce({ data: { shipments: [{ shipmentId: "S2", statusId: "SHIPMENT_APPROVED", shipGroupSeqId: "00002" }] } })
      .mockResolvedValueOnce({ data: { shipmentIds: [] } });
    await expect(generateSampleLabel(unpicked, methods)).rejects.toThrow(/no shipment came back/);
    expect(urls()).toContain("/poorti/createOrderFulfillmentWave");

    // No group and no items to compare: refuses instead of guessing.
    h.api.mockReset().mockResolvedValueOnce({ data: { shipments: [{ shipmentId: "S3", statusId: "SHIPMENT_APPROVED" }] } });
    await expect(generateSampleLabel(unpicked, methods)).rejects.toThrow(/can't be matched/);
    expect(urls()).toEqual(["/poorti/shipments"]);

    // Matched through its items.
    h.api.mockReset()
      .mockResolvedValueOnce({ data: { shipments: [{ shipmentId: "S4", statusId: "SHIPMENT_PACKED", items: [{ orderItemSeqId: "00101" }] }] } })
      .mockResolvedValueOnce(seg({ carrierPartyId: "FEDEX", shipmentMethodTypeId: "FEDEX_GROUND" }))
      .mockResolvedValueOnce(seg({ carrierPartyId: "FEDEX", trackingCode: "T", labelImageUrl: "u" }));
    await generateSampleLabel(unpicked, methods);
    expect(urls()).not.toContain("/poorti/createOrderFulfillmentWave");
  });

  it("shows the stored gateway message when packing fails", async () => {
    const { generateSampleLabel } = await import("@/composables/useFedexSetup");
    h.api
      .mockResolvedValueOnce(seg({ carrierPartyId: "FEDEX", shipmentMethodTypeId: "FEDEX_GROUND" }))
      .mockResolvedValueOnce({ error: true, data: { message: "Pack failed" } })
      .mockResolvedValueOnce(seg({ carrierPartyId: "FEDEX", gatewayMessage: "Account number is invalid" }));
    await expect(generateSampleLabel(order, methods)).rejects.toThrow("Account number is invalid");
  });

  it("retries once, then surfaces the gateway message", async () => {
    const { generateSampleLabel } = await import("@/composables/useFedexSetup");
    const noLabel = seg({ carrierPartyId: "FEDEX", gatewayMessage: "Invalid account" });
    h.api
      .mockResolvedValueOnce(seg({ carrierPartyId: "FEDEX", shipmentMethodTypeId: "FEDEX_GROUND" }))
      .mockResolvedValueOnce({ data: {} })
      .mockResolvedValueOnce(noLabel)
      .mockResolvedValueOnce({ data: {} })
      .mockResolvedValueOnce(noLabel);
    await expect(generateSampleLabel(order, methods)).rejects.toThrow("Invalid account");
    expect(urls()).toContain("/poorti/shipments/retryShippingLabel");
  });

  it("lists only shipments whose route segment has no tracking URL, plus orders with no shipment", async () => {
    const { fetchSampleLabelOrders, fetchOrdersWithoutShipment } = await import("@/composables/useFedexSetup");
    const live = (extra: any) => ({ carrierServiceStatusId: "SHRSCS_ACCEPTED", ...extra });
    h.api.mockResolvedValueOnce({ data: { shipmentCount: 4, shipments: [
      { shipmentId: "S1", orderId: "O1", shipmentPackageRouteSegDetails: [] },
      { shipmentId: "S2", orderId: "O2", orderDate: new Date().toISOString(), shipmentPackageRouteSegDetails: [live({ trackingUrl: "", gatewayMessage: "Invalid account" })] },
      { shipmentId: "S5", orderId: "O5", orderDate: "2020-01-01T00:00:00Z", shipmentPackageRouteSegDetails: [] },
      { shipmentId: "S3", orderId: "O3", shipmentPackageRouteSegDetails: [live({ trackingUrl: "https://t" })] },
      { shipmentId: "S4", orderId: "O4", shipmentPackageRouteSegDetails: [{ carrierServiceStatusId: "SHRSCS_VOIDED" }, live({ trackingUrl: "https://t" })] },
    ] } });
    const page = await fetchSampleLabelOrders({ productStoreId: "STORE" });
    expect(page.orders.map((o) => o.shipmentId)).toEqual(["S1", "S2"]);
    expect(page.hasMore).toBe(false);
    expect(page.orders.map((o) => o.labelError)).toEqual([undefined, "Invalid account"]);
    expect(h.api.mock.calls[0][0].params).toMatchObject({ statusId: ["SHIPMENT_APPROVED", "SHIPMENT_PACKED"], statusId_op: "in" });

    h.api.mockResolvedValueOnce({ data: { grouped: { orderItemShipGroupIdentifier: { groups: [
      { doclist: { numFound: 1, docs: [{ orderId: "O9", shipGroupSeqId: "00001" }] } },
      { doclist: { numFound: 3, docs: [{ orderId: "O8", shipGroupSeqId: "00001" }] } },
    ] } } } });
    const unshipped = await fetchOrdersWithoutShipment({ productStoreId: "STORE" });
    expect(h.api.mock.calls[1][0].solr.filters["-shipmentMethodTypeId"].value).toEqual(["STOREPICKUP", "POS_COMPLETED"]);
    expect(unshipped).toMatchObject([
      { orderId: "O9", shipGroupSeqId: "00001", hasShipment: false, shipmentId: "", hasPartialItems: false },
      { orderId: "O8", itemCount: 3, hasPartialItems: true },
    ]);
  });
});
