// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  carriers: undefined as any,
  hydrated: undefined as any,
  catalogErrors: undefined as any,
  hasCatalogError: undefined as any,
  catalogErrorMessages: undefined as any,
  methodCountsAvailable: undefined as any,
  readyForDisplay: undefined as any,
  refreshCarriers: vi.fn(),
  push: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock("@common", () => ({
  commonUtil: {
    showToast: (...args: any[]) => harness.showToast(...args),
  },
  translate: (key: string, values: Record<string, unknown> = {}) =>
    Object.entries(values).reduce(
      (message, [name, value]) => message.replace(`{${name}}`, String(value)),
      key,
    ),
}));

vi.mock("@/composables/useCarriers", () => ({
  useCarriers: () => ({
    carriers: harness.carriers,
    hydrated: harness.hydrated,
    catalogErrors: harness.catalogErrors,
    hasCatalogError: harness.hasCatalogError,
    catalogErrorMessages: harness.catalogErrorMessages,
    methodCountsAvailable: harness.methodCountsAvailable,
    readyForDisplay: harness.readyForDisplay,
    refreshCarriers: harness.refreshCarriers,
  }),
}));

vi.mock("@/router", () => ({
  default: {
    push: (...args: any[]) => harness.push(...args),
  },
}));

const IonSearchbarStub = defineComponent({
  name: "IonSearchbar",
  props: {
    modelValue: { type: String, default: "" },
    placeholder: { type: String, default: "" },
  },
  emits: ["update:modelValue"],
  template: `
    <input
      data-testid="carrier-search"
      :value="modelValue"
      :placeholder="placeholder"
      @input="$emit('update:modelValue', $event.target.value)"
    />
  `,
});

const UPS = {
  partyId: "UPS",
  groupName: "United Parcel Service",
  partyTypeId: "PARTY_GROUP",
  roleTypeId: "CARRIER",
  shipmentMethodCount: 2,
};

const FEDEX = {
  partyId: "FEDEX",
  groupName: "Federal Express",
  partyTypeId: "PARTY_GROUP",
  roleTypeId: "CARRIER",
  shipmentMethodCount: 1,
};

async function mountView() {
  const Carriers = (await import("@/views/Carriers.vue")).default;
  const wrapper = mount(Carriers, {
    global: {
      stubs: {
        IonSearchbar: IonSearchbarStub,
      },
    },
  });
  await flushPromises();

  return wrapper;
}

function buttonWithText(wrapper: any, text: string) {
  const button = wrapper.findAll("ion-button").find((candidate: any) =>
    candidate.text().includes(text));

  if (!button) {
    throw new Error(`Button not found: ${text}`);
  }

  return button;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

describe("carrier catalog", () => {
  beforeEach(() => {
    vi.resetModules();
    harness.carriers = ref<any[]>([]);
    harness.hydrated = ref(false);
    harness.catalogErrors = ref<Record<string, string>>({});
    harness.hasCatalogError = ref(false);
    harness.catalogErrorMessages = ref<string[]>([]);
    harness.methodCountsAvailable = ref(true);
    harness.readyForDisplay = ref(false);
    harness.refreshCarriers.mockReset().mockResolvedValue([]);
    harness.push.mockReset().mockResolvedValue(undefined);
    harness.showToast.mockReset();
  });

  it("shows skeleton rows while the raw catalog cache is cold", async () => {
    const wrapper = await mountView();

    expect(wrapper.findAll("ion-skeleton-text").length).toBeGreaterThan(0);
    expect(wrapper.text()).not.toContain("No carriers configured.");
  });

  it("renders warm carrier names, IDs, and configured-method counts", async () => {
    harness.carriers.value = [UPS, FEDEX];
    harness.hydrated.value = true;
    harness.readyForDisplay.value = true;

    const wrapper = await mountView();

    expect(wrapper.text()).toContain("United Parcel Service");
    expect(wrapper.text()).toContain("UPS");
    expect(wrapper.text()).toContain("2 methods");
    expect(wrapper.text()).toContain("Federal Express");
    expect(wrapper.text()).toContain("FEDEX");
    expect(wrapper.text()).toContain("1 method");
  });

  it("distinguishes a trustworthy empty catalog from an empty search result", async () => {
    harness.hydrated.value = true;
    harness.readyForDisplay.value = true;

    const emptyWrapper = await mountView();
    expect(emptyWrapper.text()).toContain("No carriers configured.");
    emptyWrapper.unmount();

    harness.carriers.value = [UPS];
    const searchWrapper = await mountView();
    await searchWrapper.get("[data-testid=\"carrier-search\"]").setValue("FEDEX");

    expect(searchWrapper.text()).toContain("No carriers match your search.");
    expect(searchWrapper.text()).not.toContain("No carriers configured.");
  });

  it("filters the cached rows locally by carrier ID and name", async () => {
    harness.carriers.value = [UPS, FEDEX];
    harness.hydrated.value = true;
    harness.readyForDisplay.value = true;
    const wrapper = await mountView();
    const search = wrapper.get("[data-testid=\"carrier-search\"]");

    await search.setValue("fedex");
    expect(wrapper.text()).toContain("Federal Express");
    expect(wrapper.text()).not.toContain("United Parcel Service");

    await search.setValue("parcel");
    expect(wrapper.text()).toContain("United Parcel Service");
    expect(wrapper.text()).not.toContain("Federal Express");
  });

  it("opens the selected carrier through the named detail route", async () => {
    harness.carriers.value = [UPS, FEDEX];
    harness.hydrated.value = true;
    harness.readyForDisplay.value = true;
    const wrapper = await mountView();
    const fedexRow = wrapper.findAll("ion-item").find((item: any) =>
      item.text().includes("Federal Express"));

    if (!fedexRow) {
      throw new Error("FedEx carrier row not found");
    }

    await fedexRow.trigger("click");

    expect(harness.push).toHaveBeenCalledWith({
      name: "CarrierDetails",
      params: { partyId: "FEDEX" },
    });
  });

  it("navigates to create carrier view when clicking the FAB button", async () => {
    harness.carriers.value = [UPS];
    harness.hydrated.value = true;
    harness.readyForDisplay.value = true;
    const wrapper = await mountView();

    const fabButton = wrapper.get("[aria-label=\"Create carrier\"]");
    await fabButton.trigger("click");

    expect(harness.push).toHaveBeenCalledWith({
      path: "/create-carrier",
    });
  });

  it("shows catalog sync failures, retains cached rows, and retries through the façade", async () => {
    harness.carriers.value = [UPS];
    harness.hydrated.value = true;
    harness.hasCatalogError.value = true;
    harness.catalogErrorMessages.value = ["Method sync failed"];
    harness.readyForDisplay.value = false;

    const wrapper = await mountView();

    expect(wrapper.text()).toContain("Unable to load the complete carrier catalog.");
    expect(wrapper.text()).toContain("Method sync failed");
    expect(wrapper.text()).toContain("United Parcel Service");

    await buttonWithText(wrapper, "Retry").trigger("click");
    expect(harness.refreshCarriers).toHaveBeenCalledTimes(1);
  });

  it("does not present method counts as zero when the method domain failed", async () => {
    harness.carriers.value = [{ ...UPS, shipmentMethodCount: 0 }];
    harness.hydrated.value = true;
    harness.methodCountsAvailable.value = false;
    harness.readyForDisplay.value = false;

    const wrapper = await mountView();

    expect(wrapper.text()).toContain("United Parcel Service");
    expect(wrapper.text()).toContain("Method count unavailable");
    expect(wrapper.text()).not.toContain("0 methods");
  });

  it("delegates manual refresh without clearing warm rows while it is pending", async () => {
    harness.carriers.value = [UPS];
    harness.hydrated.value = true;
    harness.readyForDisplay.value = true;
    const refresh = deferred<any[]>();
    harness.refreshCarriers.mockReturnValue(refresh.promise);
    const wrapper = await mountView();

    await wrapper.get("[aria-label=\"Refresh carriers\"]").trigger("click");
    await flushPromises();

    expect(harness.refreshCarriers).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain("United Parcel Service");

    refresh.resolve([]);
    await flushPromises();
  });
});
