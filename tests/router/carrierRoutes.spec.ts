// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  authenticated: { value: true },
  hasPermission: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock("@common/index", () => ({
  Login: {},
  commonUtil: { showToast: (...args: any[]) => harness.showToast(...args) },
  logger: { info: vi.fn() },
  translate: (key: string) => key,
}));

vi.mock("@common/composables/useAuth", () => ({
  useAuth: () => ({ isAuthenticated: harness.authenticated }),
}));

vi.mock("@/store/user", () => ({
  useUserStore: () => ({
    hasPermission: (...args: any[]) => harness.hasPermission(...args),
  }),
}));

async function carrierRoutes() {
  vi.resetModules();
  const router = (await import("@/router")).default;

  return {
    catalog: router.getRoutes().find((route) => route.path === "/carriers"),
    detail: router.getRoutes().find((route) => route.path === "/carriers/:partyId"),
  };
}

function runGuard(route: any) {
  const guard = route.beforeEnter;
  const result = Array.isArray(guard)
    ? guard[0]({}, {})
    : guard({}, {});

  return Promise.resolve(result);
}

describe("carrier routes", () => {
  beforeEach(() => {
    harness.authenticated.value = true;
    harness.hasPermission.mockReset().mockReturnValue(true);
    harness.showToast.mockReset();
  });

  it("registers stable catalog and detail routes with detail props", async () => {
    const { catalog, detail } = await carrierRoutes();

    expect(catalog).toMatchObject({ name: "Carriers" });
    expect(detail).toMatchObject({ name: "CarrierDetails", props: { default: true } });
  });

  it.each(["catalog", "detail"] as const)(
    "requires the exact carrier setup permission on the %s route",
    async (key) => {
      const routes = await carrierRoutes();
      await runGuard(routes[key]);

      expect(harness.hasPermission).toHaveBeenCalledWith("CARRIER_SETUP_VIEW");
    },
  );

  it("redirects unauthenticated users before checking permissions", async () => {
    harness.authenticated.value = false;
    const { catalog } = await carrierRoutes();

    await expect(runGuard(catalog)).resolves.toEqual({ path: "/login" });
    expect(harness.hasPermission).not.toHaveBeenCalled();
  });

  it("redirects denied users and allows users with the permission", async () => {
    harness.hasPermission.mockReturnValue(false);
    const { detail } = await carrierRoutes();

    await expect(runGuard(detail)).resolves.toEqual({ path: "/product-store" });
    expect(harness.showToast).toHaveBeenCalledTimes(1);

    harness.hasPermission.mockReturnValue(true);
    await expect(runGuard(detail)).resolves.toBeUndefined();
  });
});
