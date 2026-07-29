// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  carriers: undefined as any,
  hydrated: undefined as any,
  catalogErrors: undefined as any,
  readyForDisplay: undefined as any,
  refreshCarriers: vi.fn(),
  createCarrier: vi.fn(),
  push: vi.fn(),
  showToast: vi.fn(),
  createAlert: vi.fn(),
  alertOptions: undefined as any,
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

vi.mock("@ionic/vue", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  alertController: {
    create: (...args: any[]) => harness.createAlert(...args),
  },
}));

vi.mock("@/composables/useCarriers", () => ({
  useCarriers: () => ({
    carriers: harness.carriers,
    hydrated: harness.hydrated,
    catalogErrors: harness.catalogErrors,
    readyForDisplay: harness.readyForDisplay,
    refreshCarriers: harness.refreshCarriers,
  }),
  createCarrier: (...args: any[]) => harness.createCarrier(...args),
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

  if(!button) {
    throw new Error(`Button not found: ${text}`);
  }

  return button;
}

function isDisabled(button: any) {
  return Object.prototype.hasOwnProperty.call(button.attributes(), "disabled") ||
    button.element.disabled === true;
}

async function openCreateAlert(wrapper: any) {
  await buttonWithText(wrapper, "Create carrier").trigger("click");
  await flushPromises();

  return harness.alertOptions;
}

function createAlertHandler(options: any) {
  const button = options.buttons.find((candidate: any) => candidate.text === "Create");

  if(!button?.handler) {
    throw new Error("Create alert handler not found");
  }

  return button.handler;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

const committedRefreshError = () => Object.assign(
  new Error("The server change was saved, but this view could not be refreshed. Refresh before retrying.",),
  {
    name: "CacheReconciliationError",
    mutationCommitted: true,
    domain: "carrier",
    pk: { partyId: "DHL" },
  },
);

describe("carrier catalog", () => {
  beforeEach(() => {
    vi.resetModules();
    harness.carriers = ref<any[]>([]);
    harness.hydrated = ref(false);
    harness.catalogErrors = ref<Record<string, string>>({});
    harness.readyForDisplay = ref(false);
    harness.refreshCarriers.mockReset().mockResolvedValue([]);
    harness.createCarrier.mockReset();
    harness.push.mockReset().mockResolvedValue(undefined);
    harness.showToast.mockReset();
    harness.alertOptions = undefined;
    harness.createAlert.mockReset().mockImplementation((options: any) => {
      harness.alertOptions = options;

      return Promise.resolve({ present: vi.fn(() => Promise.resolve()) });
    });
  });

  it("shows skeleton rows while the raw catalog cache is cold", async () => {
    const wrapper = await mountView();

    expect(wrapper.findAll("ion-skeleton-text").length).toBeGreaterThan(0);
    expect(wrapper.text()).not.toContain("No carriers configured.");
  });

  it("enables carrier creation only when the complete catalog is trustworthy", async () => {
    const coldWrapper = await mountView();
    expect((buttonWithText(coldWrapper, "Create carrier").element as any).disabled)
      .toBe(true);
    coldWrapper.unmount();

    harness.hydrated.value = true;
    harness.catalogErrors.value = { carrier: "carrier snapshot failed" };
    const failedWrapper = await mountView();
    expect((buttonWithText(failedWrapper, "Create carrier").element as any).disabled)
      .toBe(true);
    failedWrapper.unmount();

    harness.catalogErrors.value = {};
    harness.readyForDisplay.value = true;
    const readyWrapper = await mountView();
    expect((buttonWithText(readyWrapper, "Create carrier").element as any).disabled)
      .toBe(false);
  });

  it("renders warm carrier names, IDs, and configured-method counts", async () => {
    harness.carriers.value = [UPS, FEDEX];
    harness.hydrated.value = true;
    harness.readyForDisplay.value = true;

    const wrapper = await mountView();

    expect(wrapper.text()).toContain("United Parcel Service");
    expect(wrapper.text()).toContain("UPS");
    expect(wrapper.text()).toContain("2 shipment methods");
    expect(wrapper.text()).toContain("Federal Express");
    expect(wrapper.text()).toContain("FEDEX");
    expect(wrapper.text()).toContain("1 shipment method");
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

    if(!fedexRow) {
      throw new Error("FedEx carrier row not found");
    }

    await fedexRow.trigger("click");

    expect(harness.push).toHaveBeenCalledWith({
      name: "CarrierDetails",
      params: { partyId: "FEDEX" },
    });
  });

  it("shows catalog sync failures, retains cached rows, and retries through the façade", async () => {
    harness.carriers.value = [UPS];
    harness.hydrated.value = true;
    harness.catalogErrors.value = { carrierShipmentMethod: "Method sync failed" };
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
    harness.catalogErrors.value = {
      carrierShipmentMethod: "Method sync failed",
    };
    harness.readyForDisplay.value = false;

    const wrapper = await mountView();

    expect(wrapper.text()).toContain("United Parcel Service");
    expect(wrapper.text()).toContain("Method count unavailable");
    expect(wrapper.text()).not.toContain("0 shipment methods");
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

  it("requires both carrier ID and name before mutation", async () => {
    harness.hydrated.value = true;
    harness.readyForDisplay.value = true;
    const wrapper = await mountView();
    const options = await openCreateAlert(wrapper);
    const handler = createAlertHandler(options);

    await expect(handler({ partyId: " ", groupName: "United Parcel Service" }))
      .resolves.toBe(false);
    await expect(handler({ partyId: "UPS", groupName: " " }))
      .resolves.toBe(false);
    expect(harness.showToast).toHaveBeenLastCalledWith("Carrier ID and name are required.");
    expect(harness.createCarrier).not.toHaveBeenCalled();
  });

  it("rejects a case-insensitive duplicate carrier ID before mutation", async () => {
    harness.carriers.value = [UPS];
    harness.hydrated.value = true;
    harness.readyForDisplay.value = true;
    const wrapper = await mountView();
    const handler = createAlertHandler(await openCreateAlert(wrapper));

    await expect(handler({ partyId: "ups", groupName: "Duplicate UPS" })).resolves.toBe(false);
    expect(harness.showToast).toHaveBeenLastCalledWith("A carrier with this ID already exists.");
    expect(harness.createCarrier).not.toHaveBeenCalled();
  });

  it("prevents a duplicate create submission while the first is pending", async () => {
    harness.hydrated.value = true;
    harness.readyForDisplay.value = true;
    const create = deferred<string>();
    harness.createCarrier.mockReturnValue(create.promise);
    const wrapper = await mountView();
    const handler = createAlertHandler(await openCreateAlert(wrapper));
    const data = { partyId: " dhl ", groupName: " DHL Express " };

    const firstSubmission = handler(data);
    const duplicateSubmission = handler(data);
    await expect(duplicateSubmission).resolves.toBe(false);
    expect(harness.createCarrier).toHaveBeenCalledTimes(1);
    expect(harness.createCarrier).toHaveBeenCalledWith({
      partyId: "DHL",
      groupName: "DHL Express",
    });

    create.resolve("DHL");
    await firstSubmission;
  });

  it("blocks refresh in both the UI and handler while carrier creation is pending", async () => {
    harness.hydrated.value = true;
    harness.readyForDisplay.value = true;
    const create = deferred<string>();
    harness.createCarrier.mockReturnValue(create.promise);
    const wrapper = await mountView();
    const handler = createAlertHandler(await openCreateAlert(wrapper));

    const submission = handler({ partyId: "DHL", groupName: "DHL Express" });
    await flushPromises();

    const refreshButton = wrapper.get("[aria-label=\"Refresh carriers\"]");
    expect(isDisabled(refreshButton)).toBe(true);
    await refreshButton.trigger("click");
    expect(harness.refreshCarriers).not.toHaveBeenCalled();

    create.resolve("DHL");
    await submission;
  });

  it("blocks create in both the UI and handlers while refresh is pending", async () => {
    harness.hydrated.value = true;
    harness.readyForDisplay.value = true;
    const wrapper = await mountView();
    const handler = createAlertHandler(await openCreateAlert(wrapper));
    const refresh = deferred<any[]>();
    harness.refreshCarriers.mockReturnValue(refresh.promise);

    await wrapper.get("[aria-label=\"Refresh carriers\"]").trigger("click");
    await flushPromises();

    const createButton = buttonWithText(wrapper, "Create carrier");
    expect(isDisabled(createButton)).toBe(true);
    await createButton.trigger("click");
    expect(harness.createAlert).toHaveBeenCalledTimes(1);
    await expect(handler({ partyId: "DHL", groupName: "DHL Express" }))
      .resolves.toBe(false);
    expect(harness.createCarrier).not.toHaveBeenCalled();

    refresh.resolve([]);
    await flushPromises();
  });

  it("navigates to the named detail route after creating a carrier", async () => {
    harness.hydrated.value = true;
    harness.readyForDisplay.value = true;
    harness.createCarrier.mockResolvedValue("DHL");
    const wrapper = await mountView();
    const handler = createAlertHandler(await openCreateAlert(wrapper));

    await handler({ partyId: " dhl ", groupName: " DHL Express " });

    expect(harness.createCarrier).toHaveBeenCalledWith({
      partyId: "DHL",
      groupName: "DHL Express",
    });
    expect(harness.push).toHaveBeenCalledWith({
      name: "CarrierDetails",
      params: { partyId: "DHL" },
    });
  });

  it("does not report or retry a completed create when detail navigation fails", async () => {
    harness.hydrated.value = true;
    harness.readyForDisplay.value = true;
    harness.createCarrier.mockResolvedValue("DHL");
    harness.push.mockRejectedValue(new Error("lazy route failed"));
    const wrapper = await mountView();
    const handler = createAlertHandler(await openCreateAlert(wrapper));

    await expect(handler({
      partyId: "DHL",
      groupName: "DHL Express",
    })).resolves.toBe(true);

    expect(harness.createCarrier).toHaveBeenCalledTimes(1);
    expect(harness.showToast).toHaveBeenLastCalledWith("Carrier created, but its detail page could not be opened.",);
  });

  it("dismisses a committed create when only local cache reconciliation fails", async () => {
    harness.hydrated.value = true;
    harness.readyForDisplay.value = true;
    harness.createCarrier.mockRejectedValue(committedRefreshError());
    const wrapper = await mountView();
    const handler = createAlertHandler(await openCreateAlert(wrapper));

    await expect(handler({
      partyId: "DHL",
      groupName: "DHL Express",
    })).resolves.toBe(true);

    expect(harness.createCarrier).toHaveBeenCalledTimes(1);
    expect(harness.push).not.toHaveBeenCalled();
    expect(harness.showToast).toHaveBeenLastCalledWith("The server change was saved, but this view could not be refreshed. Refresh before retrying.",);
  });
});
