// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

vi.mock("@common/index", () => ({
  Login: {},
  commonUtil: { showToast: vi.fn() },
  logger: { info: vi.fn() },
  translate: (key: string) => key,
}));

vi.mock("@common/composables/useAuth", () => ({
  useAuth: () => ({ isAuthenticated: { value: true }, checkAppVersionRedirect: () => false }),
}));

vi.mock("@/store/user", () => ({ useUserStore: () => ({ hasPermission: () => true }) }));

async function loadRouter() {
  vi.resetModules();

  return (await import("@/router")).default;
}

describe("unknown routes", () => {
  it("send any unmatched path to the default page", async () => {
    const router = await loadRouter();

    for(const path of ["/does-not-exist", "/shopify-connection-details/10010/no-such-page", "/a/b/c?x=1#frag"]) {
      const [record] = router.resolve(path).matched;

      expect(record?.path, path).toBe("/:pathMatch(.*)*");
      expect((record?.redirect as any)(router.resolve(path)), path).toEqual({ path: "/", query: {}, hash: "" });
    }
    expect(router.getRoutes().find((route) => route.path === "/")?.redirect).toBe("/product-store");
  });

  it("does not shadow a real route", async () => {
    const router = await loadRouter();

    expect(router.resolve("/shopify-connection-details/10010/transfer-sync").name).toBe("ShopifyTransferSync");
    expect(router.resolve("/shopify-connection-details/10010/transfer-sync/M103633").name).toBe("ShopifyTransferSyncDetail");
    expect(router.resolve("/login").name).toBe("Login");
  });
});
