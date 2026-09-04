// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { onMounted, ref } from "vue";

/**
 * The facility-type default must survive a cache that is still empty when the view opens.
 *
 * `facilityTypes` is served from IndexedDB, so `onIonViewWillEnter` can run before a single row has
 * landed. The original code read the list once in that hook, so on a cold cache — a fresh login,
 * or a hard reload straight onto this route — the type selector came up blank and nothing ever
 * re-ran the choice once the rows arrived. The user then had to pick a type that should have been
 * defaulted for them, or worse, submitted the form without one.
 */

const harness = vi.hoisted(() => ({
  facilityTypes: undefined as any,
  routeQuery: {} as Record<string, string>,
}));

vi.mock("@ionic/vue", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  onIonViewWillEnter: (cb: any) => onMounted(cb),
  onIonViewDidEnter: (cb: any) => onMounted(cb),
}));

vi.mock("@common", async () => ({
  translate: (key: string) => key,
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
  commonUtil: { showToast: vi.fn(), hasError: () => false, generateInternalId: (s: string) => s },
  api: vi.fn(async () => ({ data: {} })),
  emitter: { emit: vi.fn(), on: vi.fn(), off: vi.fn() },
}));

vi.mock("@/composables/useFacilities", () => ({
  useFacilityTypes: () => ({ facilityTypes: harness.facilityTypes, hydrated: ref(true) }),
  useFacilityCreation: () => ({ createFacility: vi.fn(async () => ({ facilityId: "NEW" })) }),
  useFacilityMutations: () => ({ addToGroup: vi.fn(), updateGroupAssociation: vi.fn() }),
}));

vi.mock("@/composables/useSeed", () => ({
  useOrganization: () => ({ organizationPartyId: ref("COMPANY"), loadOrganizationPartyId: vi.fn(async () => "COMPANY") }),
}));

vi.mock("@/utils", () => ({ generateInternalId: (s: string) => s }));

vi.mock("@/router", () => ({
  default: {
    // A getter, not a snapshot: the mock factory runs once, so a plain object would freeze
    // whatever `routeQuery` happened to be for the first test in the file.
    currentRoute: { get value() { return { query: harness.routeQuery }; } },
    push: vi.fn(),
    replace: vi.fn(),
  },
}));

const RETAIL = { facilityTypeId: "RETAIL_STORE", description: "Retail Store" };
const WAREHOUSE = { facilityTypeId: "WAREHOUSE", description: "Warehouse" };

async function mountView() {
  const CreateFacility = (await import("@/views/CreateFacility.vue")).default;
  const wrapper = mount(CreateFacility, { global: { stubs: { IonBackButton: true } } });
  await flushPromises();
  return wrapper;
}

/**
 * The submit button renders the chosen type ("Create Retail Store"), falling back to the generic
 * "Create facility" when nothing is selected — so it reports the selection as the user sees it.
 */
function submitLabel(wrapper: any) {
  return wrapper.find("ion-button").text().trim();
}

describe("CreateFacility default type on a cold cache", () => {
  beforeEach(() => {
    harness.routeQuery = {};
    vi.resetModules();
  });

  it("defaults to RETAIL_STORE once the cache emits after the view has opened", async () => {
    // Cold: the view mounts against an empty cache, exactly as it does right after login.
    harness.facilityTypes = ref<any[]>([]);
    const wrapper = await mountView();

    expect(submitLabel(wrapper)).toBe("Create facility");

    // IndexedDB emits a moment later.
    harness.facilityTypes.value = [WAREHOUSE, RETAIL];
    await flushPromises();

    expect(submitLabel(wrapper)).toBe("Create Retail Store");
  });

  it("still defaults when the cache is already warm at mount", async () => {
    harness.facilityTypes = ref<any[]>([WAREHOUSE, RETAIL]);
    const wrapper = await mountView();

    expect(submitLabel(wrapper)).toBe("Create Retail Store");
  });

  it("honours an explicit ?type= over the RETAIL_STORE default", async () => {
    harness.routeQuery = { type: "WAREHOUSE" };
    harness.facilityTypes = ref<any[]>([]);
    const wrapper = await mountView();

    harness.facilityTypes.value = [WAREHOUSE, RETAIL];
    await flushPromises();

    expect(submitLabel(wrapper)).toBe("Create Warehouse");
  });

  it("does not overwrite a type the user picked before the cache landed", async () => {
    harness.facilityTypes = ref<any[]>([WAREHOUSE]);
    const wrapper = await mountView();
    expect(submitLabel(wrapper)).toBe("Create Warehouse");

    // A later emit (a resync, say) must not yank the selection back to the default.
    harness.facilityTypes.value = [WAREHOUSE, RETAIL];
    await flushPromises();

    expect(submitLabel(wrapper)).toBe("Create Warehouse");
  });
});
