// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

const cachedJobs = ref<any[]>([]);
const cachedChannels = ref<any[]>([]);

const harness = vi.hoisted(() => ({
  ensureChannelResetJob: vi.fn(),
  fetchLocationsFromShopify: vi.fn(),
  fetchShopifyShopLocations: vi.fn(),
  updateInventoryChannel: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock("@common", () => ({
  commonUtil: {
    showToast: (...args: any[]) => harness.showToast(...args),
  },
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
  translate: (key: string, values: Record<string, unknown> = {}) =>
    Object.entries(values).reduce(
      (message, [name, value]) => message.replace(`{${name}}`, String(value)),
      key,
    ),
}));

vi.mock("@/composables/useCachedList", () => ({
  useCachedList: (entity: any) => ({
    records: entity.table === "inventoryChannels" ? cachedChannels : cachedJobs,
    rows: entity.table === "inventoryChannels" ? cachedChannels : cachedJobs,
    hydrated: ref(true),
  }),
}));

vi.mock("@/composables/useShopify", () => ({
  ABSOLUTE_CHANNEL_RESET_SERVICE: "co.hotwax.sob.product.InventoryServices.generate#InventoryChannelInventoryFeed",
  ensureChannelResetJob: (...args: any[]) => harness.ensureChannelResetJob(...args),
  fetchLocationsFromShopify: (...args: any[]) => harness.fetchLocationsFromShopify(...args),
  fetchShopifyShopLocations: (...args: any[]) => harness.fetchShopifyShopLocations(...args),
  updateInventoryChannel: (...args: any[]) => harness.updateInventoryChannel(...args),
}));

describe("EditInventoryChannelModal", () => {
  beforeEach(() => {
    vi.resetModules();
    cachedJobs.value = [];
    cachedChannels.value = [];
    harness.ensureChannelResetJob.mockReset();
    harness.fetchLocationsFromShopify.mockResolvedValue([]);
    harness.fetchShopifyShopLocations.mockResolvedValue([]);
    harness.updateInventoryChannel.mockReset();
    harness.showToast.mockReset();
  });

  it("displays reset job status as 'Not configured' and 'Set up reset job' when job is missing", async () => {
    const EditInventoryChannelModal = (await import("@/components/shopify/EditInventoryChannelModal.vue")).default;
    const wrapper = mount(EditInventoryChannelModal, {
      props: {
        isOpen: true,
        channel: {
          inventoryChannelId: "IC_1001",
          shopId: "100002",
          facilityGroupId: "FG_1",
          facilityGroupName: "Main Warehouse Group",
          shopifyLocationId: "LOC_1",
          description: "Main Channel",
        },
      },
      global: {
        stubs: {
          IonModal: { template: "<div><slot /></div>" },
        },
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("Aggregate ATP reset job");
    expect(wrapper.text()).toContain("Not configured");
    expect(wrapper.text()).toContain("Set up reset job");
  });

  it("displays reset job status as 'Active' and schedule description when configured", async () => {
    cachedJobs.value = [
      {
        jobName: "reset_InventoryChannelInventory_IC_1001",
        serviceName: "co.hotwax.sob.product.InventoryServices.generate#InventoryChannelInventoryFeed",
        paused: "N",
        cronExpression: "0 0 0 * * ?",
        runtimeDataId: "RD_1",
        runtimeData: {
          inventoryChannelId: "IC_1001",
        },
      },
    ];

    const EditInventoryChannelModal = (await import("@/components/shopify/EditInventoryChannelModal.vue")).default;
    const wrapper = mount(EditInventoryChannelModal, {
      props: {
        isOpen: true,
        channel: {
          inventoryChannelId: "IC_1001",
          shopId: "100002",
          facilityGroupId: "FG_1",
          facilityGroupName: "Main Warehouse Group",
          shopifyLocationId: "LOC_1",
        },
      },
      global: {
        stubs: {
          IonModal: { template: "<div><slot /></div>" },
        },
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("Active");
    expect(wrapper.text()).toContain("Configure schedule");
  });

  it("emits schedule-job when clicking 'Configure schedule'", async () => {
    cachedJobs.value = [
      {
        jobName: "reset_InventoryChannelInventory_IC_1001",
        serviceName: "co.hotwax.sob.product.InventoryServices.generate#InventoryChannelInventoryFeed",
        paused: "N",
        cronExpression: "0 0 0 * * ?",
        runtimeData: {
          inventoryChannelId: "IC_1001",
        },
      },
    ];

    const EditInventoryChannelModal = (await import("@/components/shopify/EditInventoryChannelModal.vue")).default;
    const wrapper = mount(EditInventoryChannelModal, {
      props: {
        isOpen: true,
        channel: {
          inventoryChannelId: "IC_1001",
          shopId: "100002",
          facilityGroupId: "FG_1",
          facilityGroupName: "Main Warehouse Group",
          shopifyLocationId: "LOC_1",
        },
      },
      global: {
        stubs: {
          IonModal: { template: "<div><slot /></div>" },
        },
      },
    });
    await flushPromises();

    const configButton = wrapper.findAll("ion-button").find((b) => b.text().includes("Configure schedule"));
    expect(configButton).toBeDefined();
    await configButton!.trigger("click");
    await flushPromises();

    expect(wrapper.emitted("schedule-job")).toBeTruthy();
    expect(wrapper.emitted("schedule-job")![0]).toEqual([
      {
        jobName: "reset_InventoryChannelInventory_IC_1001",
        title: "Reset aggregate ATP - Main Warehouse Group",
      },
    ]);
  });

  it("calls ensureChannelResetJob and emits schedule-job when clicking 'Set up reset job'", async () => {
    harness.ensureChannelResetJob.mockResolvedValue("reset_InventoryChannelInventory_IC_1002");

    const EditInventoryChannelModal = (await import("@/components/shopify/EditInventoryChannelModal.vue")).default;
    const wrapper = mount(EditInventoryChannelModal, {
      props: {
        isOpen: true,
        channel: {
          inventoryChannelId: "IC_1002",
          shopId: "100002",
          facilityGroupId: "FG_2",
          facilityGroupName: "Secondary Group",
          shopifyLocationId: "LOC_2",
        },
      },
      global: {
        stubs: {
          IonModal: { template: "<div><slot /></div>" },
        },
      },
    });
    await flushPromises();

    const setupButton = wrapper.findAll("ion-button").find((b) => b.text().includes("Set up reset job"));
    expect(setupButton).toBeDefined();
    await setupButton!.trigger("click");
    await flushPromises();

    expect(harness.ensureChannelResetJob).toHaveBeenCalledWith({
      inventoryChannelId: "IC_1002",
      description: "Full aggregate ATP reset for Secondary Group",
    });
    expect(wrapper.emitted("schedule-job")).toBeTruthy();
    expect(wrapper.emitted("schedule-job")![0]).toEqual([
      {
        jobName: "reset_InventoryChannelInventory_IC_1002",
        title: "Reset aggregate ATP - Secondary Group",
      },
    ]);
  });
  it("keeps the current target and excludes active claims on this shop, including claims arriving after selection", async () => {
    const { IonRadio, IonRadioGroup, IonFabButton } = await import("@ionic/vue");
    const Component = (await import("@/components/shopify/EditInventoryChannelModal.vue")).default;
    cachedChannels.value = [
      { inventoryChannelId: "CURRENT", shopId: "SHOP", shopifyLocationId: "1" },
      { inventoryChannelId: "OTHER", shopId: "SHOP", shopifyLocationId: "2" },
      { inventoryChannelId: "EXPIRED", shopId: "SHOP", shopifyLocationId: "3", thruDate: Date.now() - 1000 },
      { inventoryChannelId: "OTHER_SHOP", shopId: "ELSEWHERE", shopifyLocationId: "4" },
    ];
    harness.fetchLocationsFromShopify.mockResolvedValue([1, 2, 3, 4, 5].map(id => ({ id: `gid://shopify/Location/${id}`, name: `Location ${id}` })));
    harness.fetchShopifyShopLocations.mockResolvedValue([{ shopifyLocationId: "5", facilityId: "PHYSICAL" }]);
    const wrapper = mount(Component, {
      props: { isOpen: false, channel: { inventoryChannelId: "CURRENT", shopId: "SHOP", shopifyLocationId: "1" } },
      global: { stubs: { IonModal: { template: "<div><slot /></div>" } } },
    });
    await wrapper.setProps({ isOpen: true });
    await flushPromises();
    expect(wrapper.findAllComponents(IonRadio).map(row => row.props("value"))).toEqual(["1", "3", "4"]);
    wrapper.findComponent(IonRadioGroup).vm.$emit("ionChange", { detail: { value: "4" } });
    await flushPromises();
    cachedChannels.value.push({ inventoryChannelId: "NEW", shopId: "SHOP", shopifyLocationId: "4" });
    await flushPromises();
    await wrapper.findComponent(IonFabButton).trigger("click");
    expect(harness.updateInventoryChannel).not.toHaveBeenCalled();
    expect(harness.showToast).toHaveBeenCalledWith("This location is no longer available for this channel. Choose another location.");
    wrapper.unmount();
  });

});
