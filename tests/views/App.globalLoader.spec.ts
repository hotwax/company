// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

/* eslint-disable require-await -- the fake overlay deliberately implements Ionic's async API */

/**
 * The global loader must close when `dismissLoader` lands while `loadingController.create()` is
 * still pending.
 *
 * Every loader after the first is created lazily, inside `presentLoader`. A save against a fast
 * backend emits its dismiss before that `create()` resolves, and the loader used to miss it: the
 * overlay presented a moment later with nothing left to close it, and its backdrop blocked every
 * click until a reload (found driving Shopify mapping saves against a local OMS, 2026-09-25).
 */

const harness = vi.hoisted(() => {
  const makeOverlay = () => {
    const overlay = {
      presented: false,
      present: vi.fn(async () => { overlay.presented = true; }),
      // Ionic answers false, and leaves the element in place, for an overlay that never presented.
      dismiss: vi.fn(async () => {
        const wasPresented = overlay.presented;
        overlay.presented = false;

        return wasPresented;
      }),
      remove: vi.fn(),
    };

    return overlay;
  };

  return {
    handlers: {} as Record<string, Array<(payload?: any) => void>>,
    // One entry per `create()` call; the test decides when each resolves.
    creates: [] as Array<{ overlay: ReturnType<typeof makeOverlay>; resolve: () => void }>,
    makeOverlay,
    stub: (name: string) => ({ name, inheritAttrs: false, render(this: any) { return this.$slots.default?.(); } }),
  };
});

vi.mock("@ionic/vue", () => ({
  IonApp: harness.stub("IonApp"),
  IonRouterOutlet: harness.stub("IonRouterOutlet"),
  IonSplitPane: harness.stub("IonSplitPane"),
  loadingController: {
    create: () => {
      const overlay = harness.makeOverlay();

      return new Promise((resolve) => {
        harness.creates.push({ overlay, resolve: () => resolve(overlay) });
      });
    },
  },
}));

vi.mock("@common", () => ({
  emitter: {
    on: (event: string, handler: (payload?: any) => void) => { (harness.handlers[event] ||= []).push(handler); },
    off: (event: string, handler: (payload?: any) => void) => {
      harness.handlers[event] = (harness.handlers[event] || []).filter((candidate) => candidate !== handler);
    },
    emit: (event: string, payload?: any) => { (harness.handlers[event] || []).forEach((handler) => handler(payload)); },
  },
  FastTravel: harness.stub("FastTravel"),
  translate: (value: string) => value,
}));

vi.mock("@/components/common/Menu.vue", () => ({ default: harness.stub("Menu") }));
vi.mock("@common/composables/useAuth", () => ({ useAuth: () => ({ isAuthenticated: ref(false) }) }));
vi.mock("@/store/user", () => ({ useUserStore: () => ({ current: null }) }));
vi.mock("@/services/appCacheBootstrap", () => ({ startReferenceSync: vi.fn() }));
vi.mock("@/router", () => ({ default: { currentRoute: { value: { name: "Login" } } } }));

import App from "@/App.vue";

const emit = (event: string, payload?: any) => (harness.handlers[event] || []).forEach((handler) => handler(payload));

describe("App global loader", () => {
  beforeEach(async () => {
    harness.handlers = {};
    harness.creates = [];
    mount(App);
    await flushPromises();
    // The mount-time loader serves the first present; resolve it so every later one is lazy.
    harness.creates[0].resolve();
    emit("presentLoader");
    await flushPromises();
    emit("dismissLoader");
    await flushPromises();
  });

  it("closes the mount-time loader on the first present and dismiss", () => {
    const first = harness.creates[0].overlay;

    expect(first.present).toHaveBeenCalledTimes(1);
    expect(first.dismiss).toHaveBeenCalledTimes(1);
    expect(first.presented).toBe(false);
  });

  it("never presents a loader whose dismiss arrived while it was being created", async () => {
    emit("presentLoader");
    emit("dismissLoader");
    harness.creates[1].resolve();
    await flushPromises();

    const lazy = harness.creates[1].overlay;
    expect(lazy.present).not.toHaveBeenCalled();
    expect(lazy.presented).toBe(false);
    // Never presented, so Ionic's dismiss leaves the element behind; it has to be removed by hand.
    expect(lazy.remove).toHaveBeenCalledTimes(1);
  });

  it("still shows a loader requested after a cancelled one", async () => {
    emit("presentLoader");
    emit("dismissLoader");
    emit("presentLoader");
    harness.creates[1].resolve();
    harness.creates[2].resolve();
    await flushPromises();

    expect((harness.creates[1].overlay).present).not.toHaveBeenCalled();
    expect((harness.creates[2].overlay).presented).toBe(true);

    emit("dismissLoader");
    await flushPromises();
    expect((harness.creates[2].overlay).presented).toBe(false);
  });
});
