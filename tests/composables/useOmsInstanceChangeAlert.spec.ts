// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";

const alertStub = vi.hoisted(() => ({ present: vi.fn(async () => {}) }));
const create = vi.hoisted(() => vi.fn(async () => alertStub));
const bus = vi.hoisted(() => ({ emitter: null as any }));

vi.mock("@ionic/vue", () => ({ alertController: { create } }));
vi.mock("@common", async () => {
  const { default: makeMitt } = await import("mitt");
  bus.emitter = makeMitt();
  return {
    emitter: bus.emitter,
    translate: (key: string, params?: Record<string, string>) =>
      params ? key.replace(/\{(\w+)\}/g, (_, name) => params[name] ?? "") : key,
  };
});

import { useOmsInstanceChangeAlert } from "@/composables/useOmsInstanceChangeAlert";

const mountHost = () => mount(defineComponent({
  setup() {
    useOmsInstanceChangeAlert();
    return () => h("div");
  },
}));

describe("useOmsInstanceChangeAlert", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("asks to reload, naming the instance the session moved to", async () => {
    const wrapper = mountHost();

    bus.emitter.emit("omsInstanceChanged", { from: "adoc-ni", to: "adoc-hn" });
    await vi.waitFor(() => expect(alertStub.present).toHaveBeenCalled());

    const options = create.mock.calls[0][0] as any;
    expect(options.message).toContain("adoc-hn");
    expect(options.backdropDismiss).toBe(false);
    expect(options.buttons.map((button: any) => button.text)).toEqual(["Reload"]);
    wrapper.unmount();
  });

  it("shows the alert once however many times the change is reported", async () => {
    const wrapper = mountHost();

    bus.emitter.emit("omsInstanceChanged", { from: "a", to: "b" });
    bus.emitter.emit("omsInstanceChanged", { from: "a", to: "b" });
    await vi.waitFor(() => expect(alertStub.present).toHaveBeenCalled());

    expect(create).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it("stops listening once unmounted", () => {
    mountHost().unmount();

    bus.emitter.emit("omsInstanceChanged", { from: "a", to: "b" });

    expect(create).not.toHaveBeenCalled();
  });
});
