// @vitest-environment jsdom

import { flushPromises, mount } from "@vue/test-utils";
import { reactive } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ShopifyOrderSyncConfigure from "./ShopifyOrderSyncConfigure.vue";

const mocks = vi.hoisted(() => ({
  enter: undefined as undefined | (() => void),
  leave: undefined as undefined | (() => void),
  store: undefined as any,
  router: {
    push: vi.fn(),
    replace: vi.fn(),
  },
}));

vi.mock("@common", () => ({
  commonUtil: { showToast: vi.fn() },
  logger: { error: vi.fn() },
  translate: (key: string, values?: Record<string, unknown>) => Object.entries(values || {})
    .reduce((message, [name, value]) => message.replace(`{${name}}`, String(value)), key),
}));

vi.mock("vue-router", async () => {
  const actual = await vi.importActual<typeof import("vue-router")>("vue-router");
  return {
    ...actual,
    onBeforeRouteLeave: vi.fn(),
    onBeforeRouteUpdate: vi.fn(),
    useRouter: () => mocks.router,
  };
});

vi.mock("@/store/shopifyOrderSync", () => ({
  useShopifyOrderSyncStore: () => mocks.store,
}));

vi.mock("@ionic/vue", async () => {
  const { defineComponent, h } = await vi.importActual<typeof import("vue")>("vue");

  const container = (tag = "div") => defineComponent({
    inheritAttrs: false,
    setup(_props, { attrs, slots }) {
      return () => h(tag, attrs, slots.default?.());
    },
  });
  const modal = defineComponent({
    inheritAttrs: false,
    props: { isOpen: Boolean },
    setup(props, { attrs, slots }) {
      return () => props.isOpen
        ? h("section", { ...attrs, "data-open-modal": "true" }, slots.default?.())
        : null;
    },
  });
  const checkbox = defineComponent({
    inheritAttrs: false,
    props: { checked: Boolean },
    emits: ["ionChange"],
    setup(props, { attrs, emit }) {
      return () => h("input", {
        ...attrs,
        type: "checkbox",
        checked: props.checked,
        onChange: (event: Event) => emit("ionChange", {
          detail: { checked: (event.target as HTMLInputElement).checked },
        }),
      });
    },
  });
  const input = defineComponent({
    inheritAttrs: false,
    props: { modelValue: String },
    emits: ["update:modelValue"],
    setup(props, { attrs, emit }) {
      return () => h("input", {
        ...attrs,
        value: props.modelValue,
        onInput: (event: Event) => emit(
          "update:modelValue",
          (event.target as HTMLInputElement).value,
        ),
      });
    },
  });

  return {
    IonBackButton: container("a"),
    IonBadge: container("span"),
    IonButton: container("button"),
    IonButtons: container(),
    IonCard: container("section"),
    IonCardContent: container(),
    IonCardHeader: container("header"),
    IonCardSubtitle: container("p"),
    IonCardTitle: container("h2"),
    IonCheckbox: checkbox,
    IonContent: container("main"),
    IonHeader: container("header"),
    IonIcon: container("i"),
    IonInput: input,
    IonItem: container("div"),
    IonLabel: container("span"),
    IonList: container(),
    IonListHeader: container("h3"),
    IonModal: modal,
    IonNote: container("small"),
    IonPage: container(),
    IonRadio: container("label"),
    IonRadioGroup: container(),
    IonSpinner: container("i"),
    IonTitle: container("h1"),
    IonToolbar: container(),
    alertController: { create: vi.fn() },
    onIonViewWillEnter: (handler: () => void) => { mocks.enter = handler; },
    onIonViewWillLeave: (handler: () => void) => { mocks.leave = handler; },
  };
});

function createStore(overrides: Record<string, unknown> = {}) {
  return reactive({
    selectedShopId: "SHOP_1",
    capabilities: {
      canConfigure: true,
      canEditSchedule: true,
      canActivate: true,
      canRunNow: true,
      canRetry: true,
    },
    configurationState: { kind: "configured-paused" },
    mappingReadiness: {
      hasWarnings: true,
      warnings: ["Sales Channel mapping is missing.", "Shipping Method mapping is missing."],
      families: [
        { id: "sales-channel", ready: false, warning: "{mapping} mapping is missing." },
        { id: "payment-method", ready: true, warning: "" },
        { id: "shipping-method", ready: false, warning: "{mapping} mapping is missing." },
      ],
    },
    shop: {
      shopId: "SHOP_1",
      name: "Test shop",
      productStoreId: "STORE_1",
    },
    productStore: { productStoreId: "STORE_1", name: "Test store" },
    remote: { systemMessageRemoteId: "REMOTE_1", ownerShopId: "SHOP_1" },
    job: {
      shopId: "SHOP_1",
      jobName: "queue_ShopifyOrderSync_SHOP_1",
      cronExpression: "0 0 9 LW * ?",
      paused: true,
    },
    templateJob: {
      jobName: "queue_ShopifyOrderSync",
      cronExpression: "0 0 9 LW * ?",
      paused: false,
    },
    runtimeTimeZone: "Asia/Kolkata",
    configurationResources: {},
    configurationError: null,
    activeMutation: "",
    loadConfiguration: vi.fn().mockResolvedValue(undefined),
    configure: vi.fn(),
    updateSchedule: vi.fn(),
    updateJobStatus: vi.fn().mockResolvedValue({
      shopId: "SHOP_1",
      jobName: "queue_ShopifyOrderSync_SHOP_1",
      cronExpression: "0 0 9 LW * ?",
      paused: false,
    }),
    resetForShop: vi.fn(),
    ...overrides,
  });
}

async function mountConfigured(overrides: Record<string, unknown> = {}) {
  mocks.store = createStore(overrides);
  const wrapper = mount(ShopifyOrderSyncConfigure, { props: { id: "SHOP_1" } });
  mocks.enter?.();
  await flushPromises();
  return wrapper;
}

describe("ShopifyOrderSyncConfigure", () => {
  beforeEach(() => {
    mocks.enter = undefined;
    mocks.leave = undefined;
    mocks.router.push.mockReset();
    mocks.router.replace.mockReset();
  });

  it("renders exactly the three accepted non-blocking mapping families", async () => {
    const wrapper = await mountConfigured();

    expect(wrapper.text()).toContain("Sales Channel");
    expect(wrapper.text()).toContain("Payment Method");
    expect(wrapper.text()).toContain("Shipping Method");
    expect(wrapper.text()).not.toContain("Product Type");
    expect(wrapper.text()).toContain("2 warnings");

    const mappingActions = wrapper.findAll("[aria-label*='mappings.']");
    expect(mappingActions).toHaveLength(3);
    await mappingActions[0].trigger("click");
    expect(mocks.router.push).toHaveBeenCalledWith({
      name: "ShopifySalesChannels",
      params: { id: "SHOP_1" },
      query: {
        returnTo: "/shopify-connection-details/SHOP_1/order-sync/configure",
      },
    });
  });

  it("keeps a valid advanced Quartz schedule saveable with OMS-authoritative preview copy", async () => {
    const wrapper = await mountConfigured();

    expect(wrapper.get("[data-testid='order-sync-cron-expression']").attributes("aria-invalid")).toBe("false");
    expect(wrapper.text()).toContain("Preview unavailable. OMS validates this schedule when you save.");
    expect(wrapper.text()).not.toContain("Provide a valid Quartz cron expression.");
  });

  it("allows warning-aware activation only after explicit acknowledgement", async () => {
    const wrapper = await mountConfigured();

    await wrapper.get("[data-testid='open-order-sync-activation']").trigger("click");
    expect(wrapper.find("[data-open-modal='true']").exists()).toBe(true);
    expect(wrapper.text()).toContain("These warnings do not block activation");
    expect(wrapper.text()).toContain("Sales Channel mapping is missing.");

    const activate = wrapper.get("[data-testid='activate-order-sync-job']");
    expect(activate.attributes()).toHaveProperty("disabled");

    await wrapper.get("[data-testid='order-sync-activation-acknowledgement']").setValue(true);
    expect(wrapper.get("[data-testid='activate-order-sync-job']").attributes("disabled")).toBeUndefined();
    await wrapper.get("[data-testid='activate-order-sync-job']").trigger("click");
    await flushPromises();

    expect(mocks.store.updateJobStatus).toHaveBeenCalledWith(false, "SHOP_1");
    expect(mocks.router.replace).toHaveBeenCalledWith(
      "/shopify-connection-details/SHOP_1/order-sync",
    );
  });

  it("keeps setup read-only without COMMON_ADMIN", async () => {
    const wrapper = await mountConfigured({
      capabilities: {
        canConfigure: false,
        canEditSchedule: false,
        canActivate: false,
        canRunNow: false,
        canRetry: false,
      },
    });

    expect(wrapper.text()).toContain("COMMON_ADMIN permission is required");
    expect(wrapper.get("[data-testid='order-sync-cron-expression']").attributes()).toHaveProperty("disabled");
    expect(wrapper.get("[data-testid='open-order-sync-activation']").attributes()).toHaveProperty("disabled");
  });
});
