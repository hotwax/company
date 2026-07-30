// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { onMounted, ref } from "vue";

const harness = vi.hoisted(() => ({
  canManage: true,
  organization: undefined as any,
  forest: undefined as any,
  showToast: vi.fn(),
  updateOrganizationExternalId: vi.fn(),
}));

vi.mock("@ionic/vue", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  onIonViewWillEnter: (cb: any) => onMounted(cb),
}));

vi.mock("@common", () => ({
  commonUtil: { showToast: harness.showToast },
  translate: (key: string) => key,
}));

vi.mock("@/composables/useOrganizations", () => ({
  renameOrganization: vi.fn(),
  reparentOrganization: vi.fn(),
  updateOrganizationExternalId: harness.updateOrganizationExternalId,
  useOrganizationRecord: () => ({ record: harness.organization, hydrated: ref(true) }),
  useOrganizations: () => ({
    organizations: ref([harness.organization.value]),
    relationships: ref([]),
    forest: harness.forest,
    hydrated: ref(true),
  }),
  useOrganizationFacilities: () => ({ facilities: ref([]), hydrated: ref(true) }),
  usePrimaryOrganization: () => ({ primaryOrganizationId: ref(""), load: vi.fn() }),
}));

vi.mock("@/composables/useSecurity", () => ({
  useAuth: () => ({ hasPermission: () => harness.canManage }),
}));

vi.mock("@/utils", () => ({
  getResponseErrorMessage: (error: any, fallback: string) => error?.message ?? fallback,
}));

async function mountView() {
  const OrganizationDetails = (await import("@/views/OrganizationDetails.vue")).default;
  const wrapper = mount(OrganizationDetails, {
    props: { partyId: "ORG" },
    global: { stubs: { IonBackButton: true } },
  });
  await flushPromises();

  return wrapper;
}

function buttonWithText(wrapper: any, text: string) {
  const matches = wrapper.findAll("ion-button").filter((button: any) => button.text().trim() === text);
  expect(matches).toHaveLength(1);

  return matches[0];
}

describe("OrganizationDetails external ID", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    harness.canManage = true;
    harness.organization = ref({
      partyId: "ORG",
      groupName: "Organization",
      externalId: "42",
    });
    harness.forest = ref({
      nodesById: new Map([["ORG", { ...harness.organization.value, children: [] }]]),
      parentById: new Map(),
      anomalies: [],
    });
    harness.updateOrganizationExternalId.mockResolvedValue(undefined);
  });

  it("allows an administrator to update the external id", async () => {
    const wrapper = await mountView();

    expect(wrapper.text()).toContain("External ID");
    expect(wrapper.text()).toContain("42");
    await buttonWithText(wrapper, "Edit").trigger("click");

    const input = wrapper.findComponent("[data-testid='external-id-input']");
    input.vm.$emit("update:modelValue", "84");
    await flushPromises();
    await wrapper.find("[data-testid='save-external-id']").trigger("click");
    await flushPromises();

    expect(harness.updateOrganizationExternalId).toHaveBeenCalledWith("ORG", "84");
    expect(harness.showToast).toHaveBeenCalledWith("External ID updated.");
  });

  it("keeps a failed external-id edit open with the entered value", async () => {
    harness.updateOrganizationExternalId.mockRejectedValueOnce(new Error("Update failed"));
    const wrapper = await mountView();

    await buttonWithText(wrapper, "Edit").trigger("click");
    const input = wrapper.findComponent("[data-testid='external-id-input']");
    input.vm.$emit("update:modelValue", "99");
    await flushPromises();
    await wrapper.find("[data-testid='save-external-id']").trigger("click");
    await flushPromises();

    expect(harness.updateOrganizationExternalId).toHaveBeenCalledWith("ORG", "99");
    expect(wrapper.find("[data-testid='external-id-input']").exists()).toBe(true);
    expect(harness.showToast).toHaveBeenCalledWith("Update failed");
  });

  it("shows an unmapped value without edit controls to a read-only user", async () => {
    harness.canManage = false;
    harness.organization.value.externalId = "";
    const wrapper = await mountView();

    expect(wrapper.text()).toContain("Not mapped");
    expect(wrapper.findAll("ion-button").some((button: any) =>
      ["Add", "Edit"].includes(button.text().trim()))).toBe(false);
  });
});
