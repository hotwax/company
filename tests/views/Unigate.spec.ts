// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import Unigate from "@/views/Unigate.vue";

const harness = vi.hoisted(() => ({ state: undefined as any, config: undefined as any, history: undefined as any, enter: undefined as any }));
vi.mock("@ionic/vue", async (importOriginal) => {
  const ionic = await importOriginal<typeof import("@ionic/vue")>();
  const { onMounted } = await import("vue");

  return { ...ionic, onIonViewWillEnter: (callback: () => void) => { harness.enter = callback; onMounted(callback); } };
});
vi.mock("@common", () => ({ translate: (key: string) => key }));
vi.mock("@/composables/useUnigateConnection", () => ({ useUnigateConnection: () => harness.state }));
vi.mock("@/composables/useUnigateHistory", () => ({ useUnigateHistory: () => harness.history }));
vi.mock("@/composables/useSeed", () => ({ useMaargConfig: () => ({ config: harness.config, load: vi.fn() }) }));
beforeEach(() => {
  harness.history = { rows: ref([]), loading: ref(false), error: ref(false), hasMore: ref(false), load: vi.fn() };
  harness.config = ref({ instanceInfo: { instancePurpose: "dev" } });
  harness.state = { connection: ref({ exists: false, tenantId: "", sendUrl: "", hasKey: false }), loading: ref(false), loadError: ref(false), busy: ref(false), result: ref(null), notice: ref(""), load: vi.fn(), save: vi.fn(), test: vi.fn() };
});
describe("UniGate setup", () => {
  it("shows inline setup with a disabled Connect action until the required values are entered", async () => {
    const wrapper = mount(Unigate);
    await flushPromises();
    expect(wrapper.find("form").exists()).toBe(true);
    expect(wrapper.text()).toContain("Edit history");
    expect(wrapper.find("ion-segment").exists()).toBe(false);
    expect(wrapper.find("ion-toolbar ion-button").exists()).toBe(false);
    expect(wrapper.find("ion-select").attributes("modelvalue")).toBe("uat");
    expect((wrapper.get("[data-testid=connect-unigate-btn]").element as any).disabled).toBe(true);
    expect(wrapper.text()).toContain("unigate-uat.hotwax.io");
    expect(harness.state.test).not.toHaveBeenCalled();
  });
  it("does not offer a setup form after a failed configuration read", async () => {
    harness.state.loadError.value = true;
    const wrapper = mount(Unigate);
    await flushPromises();
    expect(wrapper.text()).toContain("Unable to load");
    expect(harness.state.test).not.toHaveBeenCalled();
    expect(wrapper.find("form").exists()).toBe(false);
    expect(wrapper.text()).toContain("Retry");
  });
  it("shows unknown key presence and no integration next steps for unverified legacy settings", async () => {
    harness.state.connection.value = { exists: true, tenantId: "TENANT", sendUrl: "https://unigate-uat.hotwax.io/rest/s1/unigate/", hasKey: null };
    const wrapper = mount(Unigate);
    await flushPromises();
    expect(wrapper.text()).toContain("Saved, not verified");
    expect(wrapper.text()).toContain("Edit history");
    expect(wrapper.text()).toContain("Key presence cannot be checked");
    expect(wrapper.text()).not.toContain("Set up FedEx");
    harness.state.result.value = { status: "connected", checkedAt: "2026-10-03T12:00:00Z" };
    await flushPromises();
    expect(wrapper.text()).toContain("Connected to UniGate");
    expect(wrapper.text()).toContain("Set up FedEx");
  });
  it("keeps carrier incompatibility visible after independent authentication succeeds", async () => {
    harness.state.connection.value = { exists: true, tenantId: "TENANT", sendUrl: "https://unigate-uat.hotwax.io/rest/s1/unigate/", hasKey: true };
    const wrapper = mount(Unigate);
    await flushPromises();
    harness.state.result.value = { status: "connected", carrierApiUnavailable: true };
    await flushPromises();
    expect(wrapper.text()).toContain("Connected to UniGate");
    expect(wrapper.text()).toContain("carrier API is incompatible");
    expect(wrapper.text()).toContain("Set up FedEx");
    expect(wrapper.text()).toContain("Set up Klaviyo");
  });

  it("waits for saved settings, then tests on first entry and when returning to the cached Ionic page", async () => {
    let finishLoad!: () => void;
    harness.state.load.mockImplementationOnce(() => new Promise<void>((resolve) => { finishLoad = resolve; }));
    mount(Unigate);
    await flushPromises();
    expect(harness.state.test).not.toHaveBeenCalled();
    harness.state.connection.value = { exists: true, tenantId: "TENANT", sendUrl: "https://unigate-uat.hotwax.io/rest/s1/unigate/", hasKey: null };
    finishLoad();
    await flushPromises();
    expect(harness.state.test).toHaveBeenCalledTimes(1);
    await harness.enter();
    expect(harness.state.test).toHaveBeenCalledTimes(2);
  });
  it("does not automatically test saved settings known to be missing a key", async () => {
    harness.state.connection.value = { exists: true, tenantId: "TENANT", sendUrl: "https://unigate-uat.hotwax.io/rest/s1/unigate/", hasKey: false };
    mount(Unigate);
    await flushPromises();
    expect(harness.state.test).not.toHaveBeenCalled();
  });

});
