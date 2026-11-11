// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  authenticated: { value: true },
  hasPermission: vi.fn(),
}));

vi.mock("@common/index", () => ({
  Login: {},
  commonUtil: { showToast: vi.fn() },
  logger: { info: vi.fn() },
  translate: (key: string) => key,
}));

vi.mock("@common/composables/useAuth", () => ({
  useAuth: () => ({ isAuthenticated: harness.authenticated }),
}));

vi.mock("@/store/user", () => ({
  useUserStore: () => ({ hasPermission: (...args: any[]) => harness.hasPermission(...args) }),
}));

async function fedexRoute() {
  vi.resetModules();
  const router = (await import("@/router")).default;
  return router.getRoutes().find((route) => route.path === "/fedex-setup") as any;
}

describe("fedex setup route", () => {
  beforeEach(() => {
    harness.authenticated.value = true;
    harness.hasPermission.mockReset().mockReturnValue(true);
  });

  it("is registered and requires the carrier setup permission", async () => {
    const route = await fedexRoute();
    expect(route).toMatchObject({ name: "FedexSetup" });

    const guard = Array.isArray(route.beforeEnter) ? route.beforeEnter[0] : route.beforeEnter;
    await guard({}, {});
    expect(harness.hasPermission).toHaveBeenCalledWith("CARRIER_SETUP_VIEW");
  });
});
