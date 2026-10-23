import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, ref } from "vue";

const harness = vi.hoisted(() => ({
  api: vi.fn(),
  hasError: vi.fn(),
  errorLogger: vi.fn(),
}));

vi.mock("@common", () => ({
  api: (...args: any[]) => harness.api(...args),
  commonUtil: {
    hasError: (...args: any[]) => harness.hasError(...args),
  },
  logger: {
    error: (...args: any[]) => harness.errorLogger(...args),
    warn: vi.fn(),
    info: vi.fn(),
  },
  translate: (value: string) => value,
  useLiveEntity: () => ({ records: ref([]), record: ref(null), hydrated: ref("idle") }),
}));

vi.mock("@/db/appDbSync", () => ({
  activateSyncDomains: vi.fn(),
  createSyncDomainOwner: vi.fn(() => "test-owner"),
  deactivateSyncDomains: vi.fn(),
  refreshAfterMutation: vi.fn(),
  syncDomainsError: ref(null),
  syncNow: vi.fn(),
}));

import { useShopifyShopLocations } from "@/composables/useShopify";

beforeEach(() => {
  vi.clearAllMocks();
  harness.hasError.mockReturnValue(false);
  harness.api.mockResolvedValue({ data: [{ shopifyLocationId: "LOC_1", facilityId: "FAC_1" }] });
});

describe("useShopifyShopLocations", () => {
  it("loads locations successfully when a shopId is provided", async () => {
    const shopId = ref("SHOP_100");
    const { locations, hydrated, load } = useShopifyShopLocations(shopId);

    expect(hydrated.value).toBe("idle");
    expect(locations.value).toEqual([]);

    const promise = load(150);
    expect(hydrated.value).toBe("pending");

    const result = await promise;
    expect(hydrated.value).toBe("success");
    expect(result).toEqual([{ shopifyLocationId: "LOC_1", facilityId: "FAC_1" }]);
    expect(locations.value).toEqual([{ shopifyLocationId: "LOC_1", facilityId: "FAC_1" }]);
    expect(harness.api).toHaveBeenCalledWith({
      url: "oms/shopifyShops/locations",
      method: "get",
      params: { shopId: "SHOP_100", pageSize: 150 },
    });
  });

  it("handles an empty or undefined shopId without calling the API", async () => {
    const shopId = computed(() => "");
    const { locations, hydrated, load } = useShopifyShopLocations(shopId);

    const result = await load();
    expect(hydrated.value).toBe("idle");
    expect(result).toEqual([]);
    expect(locations.value).toEqual([]);
    expect(harness.api).not.toHaveBeenCalled();
  });

  it("captures error state and rethrows when location fetch fails", async () => {
    harness.hasError.mockReturnValue(true);
    harness.api.mockResolvedValue({ error: "Failed to connect" });

    const { locations, hydrated, load } = useShopifyShopLocations(() => "SHOP_ERR");

    await expect(load()).rejects.toBeDefined();
    expect(hydrated.value).toBe("error");
    expect(harness.errorLogger).toHaveBeenCalled();
  });
});
