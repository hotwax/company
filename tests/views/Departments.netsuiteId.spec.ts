// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  identifications: undefined as any,
  alertOptions: [] as any[],
  updateFacilityIdentification: vi.fn(),
}));

vi.mock("@common", () => ({
  commonUtil: { showToast: vi.fn(), hasError: () => false },
  emitter: { emit: vi.fn() },
  logger: { error: vi.fn() },
  translate: (key: string) => key,
}));

vi.mock("@ionic/vue", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  alertController: {
    create: (options: any) => {
      harness.alertOptions.push(options);
      return Promise.resolve({ present: () => Promise.resolve() });
    },
  },
}));

vi.mock("@/composables/useFacilities", () => ({
  useFacilities: () => ({
    facilities: ref([{ facilityId: "WH_1", facilityName: "Warehouse", facilityTypeId: "WAREHOUSE" }]),
    hydrated: ref(true),
  }),
}));

vi.mock("@/composables/useShopify", () => ({
  useShopifyLocations: () => ({ locations: ref([]) }),
}));

vi.mock("@/composables/useNetSuite", () => ({
  useFacilityIdentifications: () => ({ identifications: harness.identifications }),
  useNetSuite: () => ({
    updateFacilityIdentification: (...args: any[]) => harness.updateFacilityIdentification(...args),
  }),
}));

const GENERIC = { facilityId: "WH_1", facilityIdenTypeId: "QA477_FAC_ID", idValue: "GENERIC-1", fromDate: 1 };
const DEPARTMENT = { facilityId: "WH_1", facilityIdenTypeId: "ORDR_ORGN_DPT", idValue: "DEPT-9", fromDate: 2 };

async function mountView() {
  const Departments = (await import("@/views/Departments.vue")).default;
  const wrapper = mount(Departments, { global: { stubs: { IonBackButton: true } } });
  await flushPromises();
  return wrapper;
}

describe("Departments NetSuite department ID", () => {
  beforeEach(() => {
    harness.alertOptions = [];
    harness.updateFacilityIdentification.mockReset().mockResolvedValue({});
  });

  it("ignores identifications of other types for display and prefill", async () => {
    harness.identifications = ref([GENERIC]);
    const wrapper = await mountView();

    expect(wrapper.text()).not.toContain("GENERIC-1");
    expect(wrapper.find("ion-chip").exists()).toBe(false);

    await wrapper.findAll("ion-button").find((button) => button.text().includes("NetSuite ID"))!.trigger("click");
    await flushPromises();
    expect(harness.alertOptions.at(-1).inputs[0].value).toBe("");
  });

  it("shows, prefills and removes the ORDR_ORGN_DPT identification", async () => {
    harness.identifications = ref([GENERIC, DEPARTMENT]);
    const wrapper = await mountView();

    expect(wrapper.get("ion-chip").text()).toContain("DEPT-9");

    await wrapper.get("ion-chip").trigger("click");
    await flushPromises();
    expect(harness.alertOptions.at(-1).inputs[0].value).toBe("DEPT-9");

    await wrapper.get("ion-chip ion-icon").trigger("click");
    await flushPromises();
    expect(harness.updateFacilityIdentification).toHaveBeenCalledWith(
      expect.objectContaining({ facilityIdenTypeId: "ORDR_ORGN_DPT", idValue: "DEPT-9" }),
    );
  });
});
