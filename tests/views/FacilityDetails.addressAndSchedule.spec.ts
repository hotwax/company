// @vitest-environment jsdom
import { flushPromises, shallowMount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Two Facility Details writes that QA found broken against a live OMS:
 *
 * - Adding a first address POSTed `facilityAddress` without `contactMechPurposeTypeId`, which the
 *   service rejects ("Required field Contact Mech Purpose Type ID is missing"); the modal then
 *   closed as if it had saved.
 * - Schedule modals/popover wrote the calendar but nothing reloaded the live associations after
 *   they closed, so the card stayed on its previous state until a cold reload.
 */

const harness = vi.hoisted(() => ({
  createPostalAddress: vi.fn(),
  updatePostalAddress: vi.fn(),
  reloadAssociations: vi.fn(async () => undefined),
  load: vi.fn(async () => undefined),
  showToast: vi.fn(),
  hasError: vi.fn((resp: any) => Boolean(resp?.error)),
  overlays: [] as any[],
  current: { value: {} as Record<string, any> },
}));

function overlay() {
  let resolveDismiss: (value?: any) => void = () => undefined;
  const created = {
    present: vi.fn(),
    onDidDismiss: vi.fn(() => new Promise((resolve) => { resolveDismiss = resolve; })),
    dismiss: () => resolveDismiss({}),
  };
  harness.overlays.push(created);

  return created;
}

vi.mock("@ionic/vue", async (importOriginal) => {
  const { onMounted: mounted } = await import("vue");

  return {
    ...(await importOriginal<any>()),
    onIonViewWillEnter: mounted,
    onIonViewDidEnter: mounted,
    modalController: { create: vi.fn(async () => overlay()) },
    popoverController: { create: vi.fn(async () => overlay()) },
  };
});

vi.mock("@common", () => ({
  api: vi.fn(),
  commonUtil: {
    getOmsURL: () => "https://example.test/api/",
    hasError: harness.hasError,
    showToast: harness.showToast,
    isValidEmail: () => true,
    getTelecomCountryCode: () => "1",
  },
  emitter: { emit: vi.fn(), on: vi.fn(), off: vi.fn() },
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
  translate: (key: string) => key,
}));

vi.mock("@/composables/useFacilities", async () => {
  const { computed, ref: vueRef } = await import("vue");
  const current = vueRef<Record<string, any>>({});
  harness.current = current as any;

  return {
    isFacilityStaffParty: () => true,
    useFacilityDetail: () => ({
      current: computed(() => current.value),
      hydrated: vueRef(true),
      loadingAssociations: vueRef(false),
      loadingVolatile: vueRef(false),
      calendarOptions: vueRef([]),
      load: harness.load,
      reloadAssociations: harness.reloadAssociations,
      refreshVolatile: vi.fn(),
    }),
    useFacilityMutations: () => ({
      createPostalAddress: harness.createPostalAddress,
      updatePostalAddress: harness.updatePostalAddress,
    }),
    useFacilityTypes: () => ({ facilityTypes: vueRef([]), hydrated: vueRef(true) }),
    useFacilityGroupTypes: () => ({ facilityGroupTypes: vueRef([]) }),
    useFacilityGroups: () => ({ facilityGroups: vueRef([]) }),
    useFacilityIdentificationTypes: () => ({ byId: vueRef({}) }),
    usePartyQueries: () => ({ fetchPartyRoleDetails: vi.fn() }),
    useFacilityOrderCounts: () => ({ fetchFacilityOrderHistory: vi.fn(async () => []) }),
  };
});

vi.mock("@/composables/useSeed", async () => {
  const { ref: vueRef } = await import("vue");

  return {
    useRoleTypes: () => ({ descriptionById: vueRef({}) }),
    useTypedEnums: () => ({ descriptionById: vueRef({}) }),
    useGeos: () => ({ countries: vueRef([]), statesOf: () => [] }),
    useEnums: () => ({}),
    useGeocode: () => ({ geocode: vi.fn() }),
  };
});

// Child overlays are only handed to the (mocked) controllers; their own behavior is not under test.
vi.mock("@/components/facility/GeoPointPopover.vue", () => ({ default: { name: "GeoPointPopover" } }));
vi.mock("@/components/product-store/SelectProductStoreModal.vue", () => ({ default: { name: "SelectProductStoreModal" } }));
vi.mock("@/components/product-store/ProductStorePopover.vue", () => ({ default: { name: "ProductStorePopover" } }));
vi.mock("@/components/facility/FacilityTimeZoneSwitcher.vue", () => ({ default: { name: "FacilityTimeZoneSwitcher" } }));
vi.mock("@/components/common/CustomScheduleModal.vue", () => ({ default: { name: "CustomScheduleModal" } }));
vi.mock("@/components/facility/AddOperatingHoursModal.vue", () => ({ default: { name: "AddOperatingHoursModal" } }));
vi.mock("@/components/facility/OperatingHoursPopover.vue", () => ({ default: { name: "OperatingHoursPopover" } }));
vi.mock("@/components/facility/OrderLimitPopover.vue", () => ({ default: { name: "OrderLimitPopover" } }));
vi.mock("@/components/facility/FacilityLoginActionPopover.vue", () => ({ default: { name: "FacilityLoginActionPopover" } }));
vi.mock("@/components/common/Image.vue", () => ({ default: { name: "Image" } }));
vi.mock("@/components/facility/CreateFacilityGroupModal.vue", () => ({ default: { name: "CreateFacilityGroupModal" } }));
vi.mock("@/components/facility/AddLocationModal.vue", () => ({ default: { name: "AddLocationModal" } }));
vi.mock("@/components/facility/LocationDetailsPopover.vue", () => ({ default: { name: "LocationDetailsPopover" } }));
vi.mock("@/components/facility/FacilityMappingModal.vue", () => ({ default: { name: "FacilityMappingModal" } }));
vi.mock("@/components/facility/FacilityShopifyMappingModal.vue", () => ({ default: { name: "FacilityShopifyMappingModal" } }));
vi.mock("@/components/facility/FacilityExternalIdModal.vue", () => ({ default: { name: "FacilityExternalIdModal" } }));
vi.mock("@/components/facility/FacilityMappingPopover.vue", () => ({ default: { name: "FacilityMappingPopover" } }));

import FacilityDetails from "@/views/FacilityDetails.vue";

async function mountDetails() {
  const wrapper = shallowMount(FacilityDetails, { props: { facilityId: "BROADWAY" } });
  await flushPromises();
  harness.reloadAssociations.mockClear();

  return wrapper.vm as any;
}

beforeEach(() => {
  harness.overlays.length = 0;
  harness.createPostalAddress.mockReset();
  harness.updatePostalAddress.mockReset();
  harness.showToast.mockClear();
  harness.current.value = { facilityId: "BROADWAY", facilityName: "Broadway", postalAddress: {}, contactDetails: {} };
});

describe("Facility Details — add address", () => {
  const typed = { toName: "Broadway", address1: "1 Main St", city: "New York", postalCode: "10001" };

  it("creates the first address with the PRIMARY_LOCATION purpose", async () => {
    harness.createPostalAddress.mockResolvedValue({ data: { contactMechId: "CM_1" } });
    const vm = await mountDetails();

    vm.address = { ...typed };
    vm.showAddressModal = true;
    await vm.saveContact();

    expect(harness.createPostalAddress).toHaveBeenCalledWith(expect.objectContaining({
      ...typed,
      facilityId: "BROADWAY",
      contactMechPurposeTypeId: "PRIMARY_LOCATION",
    }));
    expect(harness.reloadAssociations).toHaveBeenCalled();
    expect(vm.showAddressModal).toBe(false);
  });

  it("keeps the modal open with the typed values when the address is rejected", async () => {
    harness.createPostalAddress.mockRejectedValue(new Error("400"));
    const vm = await mountDetails();

    vm.address = { ...typed };
    vm.showAddressModal = true;
    await vm.saveContact();

    expect(harness.showToast).toHaveBeenCalledWith("Failed to update facility contact.");
    expect(vm.showAddressModal).toBe(true);
    expect(vm.address).toMatchObject(typed);
  });
});

describe("Facility Details — operating-hours schedule", () => {
  it.each([
    ["custom schedule modal", "addCustomSchedule"],
    ["saved-calendar modal", "addOperatingHours"],
    ["operating-hours popover (edit / remove)", "openOperatingHoursPopover"],
  ])("reloads the facility calendar once the %s closes", async (_label, opener) => {
    const vm = await mountDetails();

    await vm[opener](new Event("click"));
    const [opened] = harness.overlays;
    expect(opened.present).toHaveBeenCalled();
    expect(harness.reloadAssociations).not.toHaveBeenCalled();

    opened.dismiss();
    await flushPromises();

    expect(harness.reloadAssociations).toHaveBeenCalledTimes(1);
  });
});

