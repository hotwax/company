// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  addFacility: vi.fn(),
  associations: { value: [] as any[] },
  dismiss: vi.fn(),
  fetchLocationsFromShopify: vi.fn(),
  fetchShopifyShopLocations: vi.fn(),
  hasError: vi.fn((response: any) => Boolean(response?.error)),
  importShopifyFacilities: vi.fn(),
  loggerError: vi.fn(),
  refreshAfterMutation: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock("@ionic/vue", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  modalController: { dismiss: harness.dismiss },
}));

vi.mock("@common", () => ({
  commonUtil: {
    hasError: harness.hasError,
    showToast: harness.showToast,
  },
  logger: {
    error: harness.loggerError,
    warn: vi.fn(),
  },
  translate: (key: string, parameters?: Record<string, unknown>) =>
    parameters?.count === undefined ? key : key.replace("{count}", String(parameters.count)),
}));

vi.mock("@/composables/useShopify", () => ({
  fetchLocationsFromShopify: harness.fetchLocationsFromShopify,
  fetchShopifyShopLocations: harness.fetchShopifyShopLocations,
  importShopifyFacilities: harness.importShopifyFacilities,
}));

vi.mock("@/composables/useProductStores", () => ({
  useProductStoreMutations: () => ({ addFacility: harness.addFacility }),
}));

vi.mock("@/composables/useFacilities", () => ({
  useFacilityProductStores: () => ({ associations: harness.associations }),
}));

vi.mock("@/services/appCacheBootstrap", () => ({
  refreshAfterMutation: harness.refreshAfterMutation,
}));

const shopifyLocations = [
  {
    id: "gid://shopify/Location/101",
    name: "Downtown",
    address: { city: "New York", provinceCode: "NY", countryCode: "US" },
  },
  {
    id: "gid://shopify/Location/202",
    name: "Warehouse",
    address: { city: "Brooklyn", provinceCode: "NY", countryCode: "US" },
  },
];

async function mountModal(productStoreId: string | null = "STORE") {
  const Modal = (await import("@/components/facility/ImportShopifyLocationsModal.vue")).default;
  const wrapper = mount(Modal, {
    props: { shopId: "SHOP", ...(productStoreId ? { productStoreId } : {}) },
    global: { stubs: { IonIcon: true } },
  });
  await flushPromises();

  return wrapper;
}

async function importSelected(wrapper: Awaited<ReturnType<typeof mountModal>>) {
  await wrapper.find("ion-footer ion-button").trigger("click");
  await flushPromises();
}

describe("ImportShopifyLocationsModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness.associations.value = [];
    harness.fetchLocationsFromShopify.mockResolvedValue(shopifyLocations);
    harness.fetchShopifyShopLocations.mockResolvedValue([]);
    harness.importShopifyFacilities.mockResolvedValue({
      data: [{ facilityId: "FAC_101" }, { facilityId: "FAC_202" }],
    });
    harness.addFacility.mockResolvedValue({ data: {} });
    harness.refreshAfterMutation.mockResolvedValue(true);
  });

  it("uses the exact response facilityIds and reports imported and associated counts", async () => {
    const wrapper = await mountModal();

    await importSelected(wrapper);

    expect(harness.importShopifyFacilities).toHaveBeenCalledWith("SHOP", [
      expect.objectContaining({
        shopifyLocationId: "101",
        name: "Downtown",
        facilityTypeId: "RETAIL_STORE",
      }),
      expect.objectContaining({
        shopifyLocationId: "202",
        name: "Warehouse",
        facilityTypeId: "RETAIL_STORE",
      }),
    ]);
    expect(harness.refreshAfterMutation).toHaveBeenCalledTimes(2);
    expect(harness.refreshAfterMutation).toHaveBeenNthCalledWith(1, "facility", { facilityId: "FAC_101" });
    expect(harness.refreshAfterMutation).toHaveBeenNthCalledWith(2, "facility", { facilityId: "FAC_202" });
    expect(harness.addFacility).toHaveBeenNthCalledWith(1, { facilityId: "FAC_101" });
    expect(harness.addFacility).toHaveBeenNthCalledWith(2, { facilityId: "FAC_202" });
    expect(harness.dismiss).toHaveBeenCalledWith({
      imported: 2,
      retried: 0,
      associated: 2,
      facilityIds: ["FAC_101", "FAC_202"],
      retriedFacilityIds: [],
      associationFacilityIds: ["FAC_101", "FAC_202"],
      associatedFacilityIds: ["FAC_101", "FAC_202"],
      failedAssociationFacilityIds: [],
      associationFailed: false,
    });
  });

  it.each([
    ["a non-array envelope", { facilities: [{ facilityId: "FAC_101" }, { facilityId: "FAC_202" }] }],
    ["an empty response array", []],
    ["a response row without facilityId", [{ facilityId: "FAC_101" }, {}]],
    ["fewer response rows than requested", [{ facilityId: "FAC_101" }]],
  ])("treats %s as a failed import and does not dismiss", async (_case, data) => {
    harness.importShopifyFacilities.mockResolvedValue({ data });
    const wrapper = await mountModal();

    await importSelected(wrapper);

    expect(harness.refreshAfterMutation).not.toHaveBeenCalled();
    expect(harness.addFacility).not.toHaveBeenCalled();
    expect(harness.dismiss).not.toHaveBeenCalled();
    expect(harness.showToast).toHaveBeenCalledWith("Import failed");
  });

  it("reports the exact partial association result", async () => {
    harness.addFacility
      .mockResolvedValueOnce({ data: {} })
      .mockResolvedValueOnce({ error: true, data: { message: "association failed" } });
    const wrapper = await mountModal();

    await importSelected(wrapper);

    expect(harness.addFacility).toHaveBeenCalledTimes(2);
    expect(harness.showToast).toHaveBeenCalledWith("Locations imported, but Product Store association failed",);
    expect(harness.dismiss).toHaveBeenCalledWith({
      imported: 2,
      retried: 0,
      associated: 1,
      facilityIds: ["FAC_101", "FAC_202"],
      retriedFacilityIds: [],
      associationFacilityIds: ["FAC_101", "FAC_202"],
      associatedFacilityIds: ["FAC_101"],
      failedAssociationFacilityIds: ["FAC_202"],
      associationFailed: true,
    });
  });

  it("reports zero associations when no Product Store association was requested", async () => {
    const wrapper = await mountModal(null);

    await importSelected(wrapper);

    expect(harness.addFacility).not.toHaveBeenCalled();
    expect(harness.dismiss).toHaveBeenCalledWith({
      imported: 2,
      retried: 0,
      associated: 0,
      facilityIds: ["FAC_101", "FAC_202"],
      retriedFacilityIds: [],
      associationFacilityIds: [],
      associatedFacilityIds: [],
      failedAssociationFacilityIds: [],
      associationFailed: false,
    });
  });

  it("retries only mapped facilities that are not yet associated with this Product Store", async () => {
    harness.fetchShopifyShopLocations.mockResolvedValue([
      { shopifyLocationId: "101", facilityId: "FAC_101" },
      { shopifyLocationId: "202", facilityId: "FAC_202" },
    ]);
    harness.associations.value = [
      { productStoreId: "STORE", facilityId: "FAC_101" },
    ];
    const wrapper = await mountModal();
    const checkboxes = wrapper.findAll("ion-checkbox");

    expect((checkboxes[0].element as HTMLInputElement).disabled).toBe(true);
    expect((checkboxes[1].element as HTMLInputElement).disabled).toBe(false);
    expect((checkboxes[1].element as HTMLInputElement).checked).toBe(true);
    expect(wrapper.findAll("ion-select")).toHaveLength(0);
    expect(wrapper.find("ion-footer ion-button").text()).toContain("Retry");

    await importSelected(wrapper);

    expect(harness.importShopifyFacilities).not.toHaveBeenCalled();
    expect(harness.refreshAfterMutation).not.toHaveBeenCalled();
    expect(harness.addFacility).toHaveBeenCalledTimes(1);
    expect(harness.addFacility).toHaveBeenCalledWith({ facilityId: "FAC_202" });
    expect(harness.showToast).toHaveBeenCalledWith("Facility associations updated successfully.");
    expect(harness.dismiss).toHaveBeenCalledWith({
      imported: 0,
      retried: 1,
      associated: 1,
      facilityIds: [],
      retriedFacilityIds: ["FAC_202"],
      associationFacilityIds: ["FAC_202"],
      associatedFacilityIds: ["FAC_202"],
      failedAssociationFacilityIds: [],
      associationFailed: false,
    });
  });

  it("truthfully reports a failed mapped-facility retry without reimporting", async () => {
    harness.fetchLocationsFromShopify.mockResolvedValue([shopifyLocations[0]]);
    harness.fetchShopifyShopLocations.mockResolvedValue([
      { shopifyLocationId: "101", facilityId: "FAC_101" },
    ]);
    harness.addFacility.mockResolvedValueOnce({ error: true, data: { message: "association failed" } });
    const wrapper = await mountModal();

    await importSelected(wrapper);

    expect(harness.importShopifyFacilities).not.toHaveBeenCalled();
    expect(harness.showToast).toHaveBeenCalledWith("Failed to update some product store associations");
    expect(harness.dismiss).toHaveBeenCalledWith({
      imported: 0,
      retried: 1,
      associated: 0,
      facilityIds: [],
      retriedFacilityIds: ["FAC_101"],
      associationFacilityIds: ["FAC_101"],
      associatedFacilityIds: [],
      failedAssociationFacilityIds: ["FAC_101"],
      associationFailed: true,
    });
  });
});
