// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, nextTick, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  carrier: undefined as any,
  shipmentMethods: undefined as any,
  configuredShipmentMethods: undefined as any,
  facilities: undefined as any,
  facilityAssociations: undefined as any,
  productStores: undefined as any,
  productStoreShipmentMethods: undefined as any,
  readiness: undefined as any,
  remote: undefined as any,
  remoteError: undefined as any,
  hydrated: undefined as any,
  detailErrors: undefined as any,
  readyForMutation: undefined as any,
  renameCarrier: vi.fn(),
  enableCarrierShipmentMethod: vi.fn(),
  updateCarrierShipmentMethod: vi.fn(),
  deleteCarrierShipmentMethod: vi.fn(),
  resequenceCarrierShipmentMethods: vi.fn(),
  setCarrierFacilityAssociation: vi.fn(),
  createShipmentMethodType: vi.fn(),
  renameShipmentMethodType: vi.fn(),
  addShipmentMethod: vi.fn(),
  updateShipmentMethod: vi.fn(),
  expireShipmentMethod: vi.fn(),
  push: vi.fn(),
  showToast: vi.fn(),
  createAlert: vi.fn(),
  alertOptions: [] as any[],
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
  CARRIER_ROLE_TYPE_ID: "CARRIER",
  useCarrier: () => ({
    carrier: harness.carrier,
    shipmentMethods: harness.shipmentMethods,
    configuredShipmentMethods: harness.configuredShipmentMethods,
    facilities: harness.facilities,
    facilityAssociations: harness.facilityAssociations,
    productStores: harness.productStores,
    productStoreShipmentMethods: harness.productStoreShipmentMethods,
    readiness: harness.readiness,
    remote: harness.remote,
    remoteError: harness.remoteError,
    hydrated: harness.hydrated,
    detailErrors: harness.detailErrors,
    readyForMutation: harness.readyForMutation,
  }),
  renameCarrier: (...args: any[]) => harness.renameCarrier(...args),
  enableCarrierShipmentMethod: (...args: any[]) =>
    harness.enableCarrierShipmentMethod(...args),
  updateCarrierShipmentMethod: (...args: any[]) =>
    harness.updateCarrierShipmentMethod(...args),
  deleteCarrierShipmentMethod: (...args: any[]) =>
    harness.deleteCarrierShipmentMethod(...args),
  resequenceCarrierShipmentMethods: (...args: any[]) =>
    harness.resequenceCarrierShipmentMethods(...args),
}));

vi.mock("@/composables/useFacilities", () => ({
  setCarrierFacilityAssociation: (...args: any[]) =>
    harness.setCarrierFacilityAssociation(...args),
}));

vi.mock("@/composables/useProductStores", () => ({
  useProductStoreMutations: () => ({
    addShipmentMethod: (...args: any[]) => harness.addShipmentMethod(...args),
    updateShipmentMethod: (...args: any[]) => harness.updateShipmentMethod(...args),
    expireShipmentMethod: (...args: any[]) => harness.expireShipmentMethod(...args),
  }),
}));

vi.mock("@/composables/useSeed", () => ({
  useShipmentMethodTypeMutations: () => ({
    createShipmentMethodType: (...args: any[]) =>
      harness.createShipmentMethodType(...args),
    renameShipmentMethodType: (...args: any[]) =>
      harness.renameShipmentMethodType(...args),
  }),
}));

vi.mock("@/router", () => ({
  default: {
    push: (...args: any[]) => harness.push(...args),
  },
}));

const IonSegmentStub = defineComponent({
  name: "IonSegment",
  props: {
    value: { type: String, default: "" },
    modelValue: { type: String, default: "" },
    disabled: { type: Boolean, default: false },
  },
  emits: ["ionChange", "update:modelValue"],
  methods: {
    select(value: string) {
      this.$emit("ionChange", { detail: { value } });
      this.$emit("update:modelValue", value);
    },
  },
  template: `
    <section
      data-testid="carrier-segment"
      :data-value="value || modelValue"
      :data-disabled="String(disabled)"
    >
      <button data-testid="select-store-a" @click="select('store:STORE_A')">
        Select Alpha Store
      </button>
      <slot />
    </section>
  `,
});

const GROUND = {
  shipmentMethodTypeId: "GROUND",
  description: "Ground",
  carrierServiceCode: "03",
  deliveryDays: 5,
  sequenceNumber: 1,
  isConfigured: true,
};

const TWO_DAY = {
  shipmentMethodTypeId: "TWO_DAY",
  description: "Two day",
  isConfigured: false,
};

const STORE_METHOD = {
  productStoreShipMethId: "PSM_1",
  productStoreId: "STORE_A",
  partyId: "UPS",
  roleTypeId: "CARRIER",
  shipmentMethodTypeId: "GROUND",
  shipmentGatewayConfigId: "UNIGATE_CONFIG",
  isTrackingRequired: "Y",
  fromDate: 1,
};

const READINESS = {
  carrierPartyId: "UPS",
  automaticAddressValidationCapable: false,
  remote: { hydrated: true, error: null },
  tenant: "ready",
  credential: "not-applicable",
  storeLink: "not-applicable",
  automaticAddressValidation: "not-applicable",
};

async function mountView() {
  const CarrierDetails = (await import("@/views/CarrierDetails.vue")).default;
  const wrapper = mount(CarrierDetails, {
    props: { partyId: "UPS" },
    global: {
      stubs: {
        IonBackButton: true,
        IonSegment: IonSegmentStub,
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

function alertButton(options: any, text: string) {
  const button = options.buttons.find((candidate: any) => candidate.text === text);

  if(!button?.handler) {
    throw new Error(`Alert button not found: ${text}`);
  }

  return button.handler;
}

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
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
    pk: { partyId: "UPS" },
  },
);

describe("CarrierDetails", () => {
  beforeEach(() => {
    harness.carrier = ref<any>({ partyId: "UPS", groupName: "United Parcel Service" });
    harness.shipmentMethods = ref<any[]>([GROUND, TWO_DAY]);
    harness.configuredShipmentMethods = ref<any[]>([GROUND]);
    harness.facilities = ref<any[]>([
      {
        facilityId: "FACILITY_1",
        facilityName: "Main warehouse",
        facilityTypeId: "WAREHOUSE",
        isConfigured: true,
        fromDate: 1,
      },
    ]);
    harness.facilityAssociations = ref<any[]>([]);
    harness.productStores = ref<any[]>([
      { productStoreId: "STORE_A", storeName: "Alpha Store" },
    ]);
    harness.productStoreShipmentMethods = ref<any[]>([STORE_METHOD]);
    harness.readiness = ref<any>(READINESS);
    harness.remote = ref<any>({
      systemMessageRemoteId: "UNIGATE_CONFIG",
      internalId: "tenant-1",
    });
    harness.remoteError = ref<any>(null);
    harness.hydrated = ref(true);
    harness.detailErrors = ref<Record<string, string>>({});
    harness.readyForMutation = ref(true);

    [
      harness.renameCarrier,
      harness.enableCarrierShipmentMethod,
      harness.updateCarrierShipmentMethod,
      harness.deleteCarrierShipmentMethod,
      harness.resequenceCarrierShipmentMethods,
      harness.setCarrierFacilityAssociation,
      harness.createShipmentMethodType,
      harness.renameShipmentMethodType,
      harness.addShipmentMethod,
      harness.updateShipmentMethod,
      harness.expireShipmentMethod,
    ].forEach((mock) => mock.mockReset().mockResolvedValue(undefined));
    harness.push.mockReset().mockResolvedValue(undefined);
    harness.showToast.mockReset();
    harness.alertOptions = [];
    harness.createAlert.mockReset().mockImplementation((options: any) => {
      harness.alertOptions.push(options);

      return Promise.resolve({ present: vi.fn(() => Promise.resolve()) });
    });
  });

  it("uses a cold skeleton and then distinguishes domain errors from not-found", async () => {
    harness.hydrated.value = false;
    const cold = await mountView();

    expect(cold.findAll("ion-skeleton-text").length).toBeGreaterThan(0);
    cold.unmount();

    harness.hydrated.value = true;
    harness.detailErrors.value = { carrier: "Carrier sync failed" };
    const failed = await mountView();

    expect(failed.text()).toContain("Unable to load the complete carrier details.");
    expect(failed.text()).toContain("Carrier sync failed");
    failed.unmount();

    harness.detailErrors.value = {};
    harness.carrier.value = undefined;
    const missing = await mountView();

    expect(missing.text()).toContain("Carrier not found.");
  });

  it("renders stable scrollable sections and resets a removed store segment", async () => {
    const wrapper = await mountView();
    const values = wrapper.findAll("ion-segment-button")
      .map((button) => button.attributes("value") || button.element.value);

    expect(values).toEqual(["methods", "facilities", "store:STORE_A", "account"]);

    await wrapper.get("[data-testid=\"select-store-a\"]").trigger("click");
    await nextTick();

    expect(wrapper.get("[data-testid=\"carrier-segment\"]").attributes("data-value"))
      .toBe("store:STORE_A");
    expect(wrapper.find("[data-testid=\"carrier-store-method-list\"]").exists()).toBe(true);

    harness.productStores.value = [];
    await nextTick();

    expect(wrapper.get("[data-testid=\"carrier-segment\"]").attributes("data-value"))
      .toBe("methods");
    expect(wrapper.find("[data-testid=\"carrier-method-list\"]").exists()).toBe(true);
  });

  it("locks identity and child mutation controls until every detail domain is ready", async () => {
    harness.readyForMutation.value = false;
    const wrapper = await mountView();

    expect(isDisabled(buttonWithText(wrapper, "Edit name"))).toBe(true);
    expect(isDisabled(buttonWithText(wrapper, "Enable"))).toBe(true);
    expect(isDisabled(buttonWithText(wrapper, "Disable"))).toBe(true);
  });

  it("keeps cached sections and Klaviyo navigation inspectable when mutations are gated", async () => {
    harness.detailErrors.value = { facility: "Facility sync failed" };
    harness.readyForMutation.value = false;
    const wrapper = await mountView();
    const segment = wrapper.getComponent(IonSegmentStub);

    expect(segment.props("disabled")).toBe(false);

    segment.vm.$emit("update:modelValue", "account");
    await nextTick();

    const manageButton = buttonWithText(wrapper, "Manage Unigate in Klaviyo");
    expect(isDisabled(manageButton)).toBe(false);
    await manageButton.trigger("click");

    expect(harness.push).toHaveBeenCalledWith("/klaviyo");
  });

  it("renames carrier identity through a parent-owned alert", async () => {
    const wrapper = await mountView();

    await buttonWithText(wrapper, "Edit name").trigger("click");
    await flushPromises();

    const options = harness.alertOptions.at(-1);
    await alertButton(options, "Save")({ groupName: "UPS Express" });

    expect(harness.renameCarrier).toHaveBeenCalledWith("UPS", "UPS Express");
    expect(harness.showToast).toHaveBeenCalledWith("Carrier name updated.");
  });

  it("dismisses a committed mutation with a cache-stage warning and releases its lock", async () => {
    harness.renameCarrier.mockRejectedValueOnce(committedRefreshError());
    const wrapper = await mountView();

    await buttonWithText(wrapper, "Edit name").trigger("click");
    await flushPromises();
    const options = harness.alertOptions.at(-1);

    await expect(alertButton(options, "Save")({ groupName: "UPS Express" }))
      .resolves.toBe(true);

    expect(harness.renameCarrier).toHaveBeenCalledTimes(1);
    expect(harness.showToast).toHaveBeenLastCalledWith("The server change was saved, but this view could not be refreshed. Refresh before retrying.",);
    expect(isDisabled(buttonWithText(wrapper, "Edit name"))).toBe(false);
  });

  it("locks the complete detail while a partition-replacing mutation is pending", async () => {
    const enable = deferred<void>();
    harness.enableCarrierShipmentMethod.mockReturnValue(enable.promise);
    const wrapper = await mountView();

    await buttonWithText(wrapper, "Enable").trigger("click");
    await nextTick();

    expect(isDisabled(buttonWithText(wrapper, "Enable"))).toBe(true);
    expect(isDisabled(buttonWithText(wrapper, "Edit name"))).toBe(true);

    await buttonWithText(wrapper, "Disable").trigger("click");
    expect(harness.createAlert).not.toHaveBeenCalled();

    enable.resolve();
    await flushPromises();

    expect(isDisabled(buttonWithText(wrapper, "Enable"))).toBe(false);
    expect(isDisabled(buttonWithText(wrapper, "Edit name"))).toBe(false);
    expect(harness.enableCarrierShipmentMethod).toHaveBeenCalledWith("UPS", "TWO_DAY");
  });

  it("keeps runtime diagnostics as values under a stable translated failure key", async () => {
    const error = new Error("Committed IDs: UPS_GROUND; failed ID: UPS_TWO_DAY");
    harness.renameCarrier.mockRejectedValueOnce(error);
    const wrapper = await mountView();

    await buttonWithText(wrapper, "Edit name").trigger("click");
    await flushPromises();
    const options = harness.alertOptions.at(-1);

    await expect(alertButton(options, "Save")({ groupName: "UPS Express" }))
      .resolves.toBe(false);

    const expected = "Failed to rename the carrier. Details: " +
      "Committed IDs: UPS_GROUND; failed ID: UPS_TWO_DAY";
    expect(harness.showToast).toHaveBeenLastCalledWith(expected);
  });

  it("confirms live cascading impact before delegating the authoritative hard delete", async () => {
    const wrapper = await mountView();

    await buttonWithText(wrapper, "Disable").trigger("click");
    await flushPromises();

    const options = harness.alertOptions.at(-1);
    expect(options.message).toContain("Any active product-store associations will be expired",);
    expect(options.message).not.toMatch(/\d+ product store association/);

    await alertButton(options, "Disable method")();

    expect(harness.deleteCarrierShipmentMethod).toHaveBeenCalledWith(
      "UPS",
      "GROUND",
    );
  });

  it("routes account setup intent to Klaviyo without exposing gateway edits", async () => {
    const wrapper = await mountView();
    const segment = wrapper.getComponent(IonSegmentStub);

    segment.vm.$emit("update:modelValue", "account");
    await nextTick();
    await buttonWithText(wrapper, "Manage Unigate in Klaviyo").trigger("click");

    expect(harness.push).toHaveBeenCalledWith("/klaviyo");
    expect(wrapper.find("ion-input").exists()).toBe(false);
  });
});
