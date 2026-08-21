// @vitest-environment jsdom
import { config, flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  initialAllowed: false,
  allowed: undefined as any,
  authenticated: { value: true },
  currentRoute: { value: { path: "/product-store" } },
  hasPermission: vi.fn(),
}));

vi.mock("@common", () => ({
  translate: (key: string) => key,
  commonUtil: {
    getMaargURL: () => "https://rails-uat.hotwax.io/rest/s1/",
    getCurrentTime: () => "12:00 PM",
  },
}));

// The footer reads the Maarg config for its instance label.
vi.mock("@/composables/useSeed", async () => {
  const { computed } = await vi.importActual<typeof import("vue")>("vue");

  return {
    useMaargConfig: () => ({
      instanceInfo: computed(() => ({ instanceName: "rails-uat" })),
      load: vi.fn(),
    }),
  };
});

vi.mock("@common/composables/useAuth", () => ({
  useAuth: () => ({ isAuthenticated: harness.authenticated }),
}));

vi.mock("@/composables/useSecurity", async () => {
  const { ref } = await vi.importActual<typeof import("vue")>("vue");
  harness.allowed = ref(harness.initialAllowed);

  return {
    useAuth: () => ({
      hasPermission: (...args: any[]) => harness.hasPermission(...args),
    }),
  };
});

vi.mock("@/router", () => ({
  default: { currentRoute: harness.currentRoute },
}));

async function mountMenu() {
  const { createPinia, setActivePinia } = await import("pinia");
  const pinia = createPinia();
  setActivePinia(pinia);

  const Menu = (await import("@/components/common/Menu.vue")).default;
  const wrapper = mount(Menu, { global: { plugins: [pinia] } });
  await flushPromises();

  return wrapper;
}

describe("carrier menu permission", () => {
  beforeEach(() => {
    vi.resetModules();
    config.global.renderStubDefaultSlot = true;
    harness.initialAllowed = false;
    if(harness.allowed) {
      harness.allowed.value = false;
    }
    harness.authenticated.value = true;
    harness.currentRoute.value = { path: "/product-store" };
    harness.hasPermission.mockReset().mockImplementation((permission: string | undefined) =>
      !permission || (
        permission === "CARRIER_SETUP_VIEW" &&
        Boolean(harness.allowed?.value)
      ));
  });

  it("hides the carrier integration entry without CARRIER_SETUP_VIEW", async () => {
    const wrapper = await mountMenu();

    expect(wrapper.text()).not.toContain("Carriers");
    expect(harness.hasPermission).toHaveBeenCalledWith("CARRIER_SETUP_VIEW");
  });

  it("shows the entry when the carrier permission is available", async () => {
    harness.initialAllowed = true;
    if(harness.allowed) {
      harness.allowed.value = true;
    }
    const wrapper = await mountMenu();

    expect(wrapper.text()).toContain("Carriers");
  });

  it("reveals the entry reactively when permissions hydrate after mount", async () => {
    const wrapper = await mountMenu();
    expect(wrapper.text()).not.toContain("Carriers");

    harness.allowed.value = true;
    await flushPromises();

    expect(wrapper.text()).toContain("Carriers");
  });
});
