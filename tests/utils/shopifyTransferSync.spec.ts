import { describe, expect, it, vi } from "vitest";

const fastTravel = vi.hoisted(() => ({ transfersBase: "https://transfers.example.test" as string | null }));

vi.mock("@common", () => ({
  api: vi.fn(),
  commonUtil: { hasError: vi.fn() },
  translate: (value: string) => value,
  // Mirrors buildAppUrl: null when the deployment has no URL for that app.
  buildAppUrl: (appId: string, path = "") =>
    (appId === "transfers" && fastTravel.transfersBase ? `${fastTravel.transfersBase}${path}` : null),
}));

import * as locationInventory from "@/utils/shopifyLocationInventory";
import * as transferSync from "@/utils/shopifyTransferSync";

describe("location inventory summary", () => {
  it("preserves the backend-authoritative no-op/quarantine total", () => {
    expect(locationInventory.normalizeLocationInventorySummary("10000", {
      backlogCount: 4,
      oldestBacklogDate: "1787700000000",
      errorLinkedCount: 2,
      noOpOrQuarantinedCount: 7,
    })).toEqual({
      shopId: "10000",
      backlogCount: 4,
      oldestBacklogDate: "1787700000000",
      errorLinkedCount: 2,
      noOpOrQuarantinedCount: 7,
    });
  });

  it("uses the backend-authoritative linked-error total even when only some detail rows are enriched", () => {
    const deliveryErrorCount = (locationInventory as any).locationInventoryDeliveryErrorCount;

    expect(deliveryErrorCount({ errorLinkedCount: 47 })).toBe(47);
    expect(deliveryErrorCount(undefined)).toBeUndefined();
  });
});

describe("Shopify transfer monitoring readiness", () => {
  it("does not declare a cold empty cache loaded before the view domain completes", () => {
    const isLoaded = (transferSync as any).isTransferSyncMonitoringLoaded;

    expect(isLoaded({ cacheHydrated: true, cachedRowCount: 0, liveSyncAt: 0, viewSyncBaselineAt: 0 })).toBe(false);
    expect(isLoaded({ cacheHydrated: true, cachedRowCount: 0, liveSyncAt: 100, viewSyncBaselineAt: 0 })).toBe(true);
    expect(isLoaded({ cacheHydrated: true, cachedRowCount: 1, liveSyncAt: 0, viewSyncBaselineAt: 0 })).toBe(true);
    expect(isLoaded({ cacheHydrated: false, cachedRowCount: 1, liveSyncAt: 100, viewSyncBaselineAt: 0 })).toBe(false);
    expect(isLoaded({ cacheHydrated: true, cachedRowCount: 0, liveSyncAt: 100, viewSyncBaselineAt: 100 })).toBe(false);
  });
});

describe("Shopify transfer admin link", () => {
  const adminUrl = (transferSync as any).shopifyTransferAdminUrl;

  it("builds the admin link from the shop domain and the transfer id", () => {
    expect(adminUrl("rails-paris.myshopify.com", "4604788917"))
      .toBe("https://rails-paris.myshopify.com/admin/transfers/4604788917");
  });

  it("reduces a gid to the legacy id the admin path expects", () => {
    expect(adminUrl("rails-paris.myshopify.com", "gid://shopify/InventoryTransfer/4604788917"))
      .toBe("https://rails-paris.myshopify.com/admin/transfers/4604788917");
  });

  it("renders no link rather than a broken one when either half is missing", () => {
    expect(adminUrl("", "4604788917")).toBe("");
    expect(adminUrl("rails-paris.myshopify.com", "")).toBe("");
    expect(adminUrl(undefined, undefined)).toBe("");
    expect(adminUrl("rails-paris.myshopify.com", null)).toBe("");
    expect(adminUrl("   ", "4604788917")).toBe("");
  });

  // myshopifyDomain is operator input the connection form only checks for non-emptiness, so an
  // unvalidated host would render a trusted-looking "Shopify Admin" link pointing anywhere.
  it("refuses to build a link to a host that is not a lowercase *.myshopify.com name", () => {
    expect(adminUrl("evil.com", "4604788917")).toBe("");
    expect(adminUrl("rails-paris.myshopify.com.evil.com", "4604788917")).toBe("");
    expect(adminUrl("evil.com/rails-paris.myshopify.com", "4604788917")).toBe("");
    expect(adminUrl("Rails-Paris.myshopify.com", "4604788917")).toBe("");
    expect(adminUrl("rails-paris.myshopify.com:8080", "4604788917")).toBe("");
    expect(adminUrl("user@rails-paris.myshopify.com", "4604788917")).toBe("");
    expect(adminUrl("myshopify.com", "4604788917")).toBe("");
  });

  it("refuses a transfer id that is not a positive integer", () => {
    expect(adminUrl("rails-paris.myshopify.com", "../../settings")).toBe("");
    expect(adminUrl("rails-paris.myshopify.com", "46047889 17")).toBe("");
    expect(adminUrl("rails-paris.myshopify.com", "0")).toBe("");
    expect(adminUrl("rails-paris.myshopify.com", "-1")).toBe("");
    expect(adminUrl("rails-paris.myshopify.com", "gid://shopify/InventoryTransfer/not-a-number")).toBe("");
  });

  it("accepts a numeric transfer id", () => {
    expect(adminUrl("rails-paris.myshopify.com", 4604788917))
      .toBe("https://rails-paris.myshopify.com/admin/transfers/4604788917");
  });
});

describe("Transfers app link", () => {
  const transfersUrl = (transferSync as any).transfersAppOrderUrl;

  it("deep-links the OMS transfer order into the Transfers app", () => {
    // Route confirmed against hotwax/transfers main; order-routing's /transfer-order-details/ is stale.
    expect(transfersUrl("128253")).toBe("https://transfers.example.test/order-detail/128253");
    expect(transfersUrl(128253)).toBe("https://transfers.example.test/order-detail/128253");
  });

  it("renders no link when the order id is missing", () => {
    expect(transfersUrl("")).toBe("");
    expect(transfersUrl(undefined)).toBe("");
    expect(transfersUrl(null)).toBe("");
    expect(transfersUrl("   ")).toBe("");
  });

  it("renders no link when the deployment has no Transfers app configured", () => {
    fastTravel.transfersBase = null;
    try {
      expect(transfersUrl("128253")).toBe("");
    } finally {
      fastTravel.transfersBase = "https://transfers.example.test";
    }
  });

  it("encodes an order id rather than letting it shape the path", () => {
    expect(transfersUrl("../../settings")).toBe("https://transfers.example.test/order-detail/..%2F..%2Fsettings");
  });
});
