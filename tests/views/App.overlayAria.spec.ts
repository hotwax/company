// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

/**
 * Ionic 8 leaves aria-hidden="true" on ion-router-outlet when two overlays dismiss together (an
 * alert or modal closing while the global loader is still animating out): each dismissal counts
 * the other as still open, so neither removes it and the main content drops out of the
 * accessibility tree. App.vue clears it once no overlay is presented any more.
 */

const stub = vi.hoisted(() => (name: string) => ({ name, inheritAttrs: false, render(this: any) { return this.$slots.default?.(); } }));

vi.mock("@ionic/vue", () => ({
  IonApp: stub("IonApp"),
  IonRouterOutlet: stub("IonRouterOutlet"),
  IonSplitPane: stub("IonSplitPane"),
  loadingController: { create: () => new Promise(() => undefined) },
}));
vi.mock("@common", () => ({
  emitter: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
  FastTravel: stub("FastTravel"),
  translate: (value: string) => value,
}));
vi.mock("@/components/common/Menu.vue", () => ({ default: stub("Menu") }));
vi.mock("@common/composables/useAuth", () => ({ useAuth: () => ({ isAuthenticated: ref(false) }) }));
vi.mock("@/store/user", () => ({ useUserStore: () => ({ current: null }) }));
vi.mock("@/services/appDbSync", () => ({ startAppDbSync: vi.fn() }));
vi.mock("@/router", () => ({ default: { currentRoute: { value: { name: "Login" } } } }));

import App from "@/App.vue";

const overlay = (tag: string, presented: boolean) => {
  const el = document.createElement(tag) as any;
  el.overlayIndex = 1;
  el.presented = presented;
  document.body.appendChild(el);

  return el;
};

const tick = () => new Promise((resolve) => setTimeout(resolve));

describe("App restores the router outlet to the accessibility tree", () => {
  let outlet: HTMLElement;
  let wrapper: ReturnType<typeof mount>;

  beforeEach(async () => {
    wrapper = mount(App);
    await flushPromises();
    outlet = document.createElement("ion-router-outlet");
    outlet.setAttribute("aria-hidden", "true");
    document.body.appendChild(outlet);
  });

  afterEach(() => {
    wrapper.unmount();
    document.body.innerHTML = "";
  });

  it("keeps aria-hidden while another overlay is still presented", async () => {
    const alert = overlay("ion-alert", false);
    overlay("ion-loading", true);

    alert.dispatchEvent(new CustomEvent("ionAlertDidDismiss", { bubbles: true }));
    await tick();

    expect(outlet.getAttribute("aria-hidden")).toBe("true");
  });

  it("removes aria-hidden once the overlapping dismissals have both finished", async () => {
    const alert = overlay("ion-alert", false);
    // The loader is mid leave-animation: no longer presented, not yet marked overlay-hidden.
    const loading = overlay("ion-loading", false);

    alert.dispatchEvent(new CustomEvent("ionAlertDidDismiss", { bubbles: true }));
    loading.dispatchEvent(new CustomEvent("ionLoadingDidDismiss", { bubbles: true }));
    await tick();

    expect(outlet.hasAttribute("aria-hidden")).toBe(false);
  });

  it("ignores overlays that are already hidden", async () => {
    const modal = overlay("ion-modal", true);
    modal.classList.add("overlay-hidden");

    modal.dispatchEvent(new CustomEvent("ionModalDidDismiss", { bubbles: true }));
    await tick();

    expect(outlet.hasAttribute("aria-hidden")).toBe(false);
  });
});
