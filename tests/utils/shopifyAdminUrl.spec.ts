import { describe, expect, it } from "vitest";

import {
  isShopifyObjectId,
  shopifyAdminHostname,
  shopifyOrderAdminUrl,
  shopifyProductAdminUrl,
  shopifyShopAdminUrl,
} from "@/utils/shopifyAdminUrl";

// myshopifyDomain is operator input that nothing validates — CreateShopifyConnectionModal's
// isFormValid only checks the field is non-empty — so every link built from it has to prove the
// host is a real shop before it renders as a trusted-looking "Shopify Admin" control.
describe("Shopify admin hostname", () => {
  it("accepts a lowercase *.myshopify.com name", () => {
    expect(shopifyAdminHostname("rails-paris.myshopify.com")).toBe("rails-paris.myshopify.com");
    expect(shopifyAdminHostname("  rails-paris.myshopify.com  ")).toBe("rails-paris.myshopify.com");
    expect(shopifyAdminHostname("shop1.myshopify.com")).toBe("shop1.myshopify.com");
  });

  it("refuses anything that is not a lowercase *.myshopify.com name", () => {
    expect(shopifyAdminHostname("evil.com")).toBe("");
    expect(shopifyAdminHostname("rails-paris.myshopify.com.evil.com")).toBe("");
    expect(shopifyAdminHostname("evil.com/rails-paris.myshopify.com")).toBe("");
    expect(shopifyAdminHostname("rails-paris.myshopify.com/../../settings")).toBe("");
    expect(shopifyAdminHostname("user@rails-paris.myshopify.com")).toBe("");
    expect(shopifyAdminHostname("rails-paris.myshopify.com:8080")).toBe("");
    expect(shopifyAdminHostname("Rails-Paris.myshopify.com")).toBe("");
    expect(shopifyAdminHostname("myshopify.com")).toBe("");
    expect(shopifyAdminHostname("rails.paris.myshopify.com")).toBe("");
    expect(shopifyAdminHostname("")).toBe("");
    expect(shopifyAdminHostname(undefined)).toBe("");
    expect(shopifyAdminHostname(null)).toBe("");
  });
});

describe("Shopify object id", () => {
  it("accepts a positive integer", () => {
    expect(isShopifyObjectId("4604788917")).toBe(true);
    expect(isShopifyObjectId(4604788917)).toBe(true);
    expect(isShopifyObjectId("  4604788917  ")).toBe(true);
  });

  it("refuses anything that cannot name a real record", () => {
    expect(isShopifyObjectId("0")).toBe(false);
    expect(isShopifyObjectId("000")).toBe(false);
    expect(isShopifyObjectId("-1")).toBe(false);
    expect(isShopifyObjectId("46047 88917")).toBe(false);
    expect(isShopifyObjectId("../../settings")).toBe(false);
    expect(isShopifyObjectId("gid://shopify/Product/4604788917")).toBe(false);
    expect(isShopifyObjectId("1e5")).toBe(false);
    expect(isShopifyObjectId("1".repeat(31))).toBe(false);
    expect(isShopifyObjectId("")).toBe(false);
    expect(isShopifyObjectId(undefined)).toBe(false);
  });
});

// ShopifyConnections.vue opens this one in a new window from the domain chip.
describe("Shop admin link", () => {
  it("opens the admin of a real shop host", () => {
    expect(shopifyShopAdminUrl("rails-paris.myshopify.com")).toBe("https://rails-paris.myshopify.com/admin");
  });

  it("builds nothing for a host the connection form never validated", () => {
    expect(shopifyShopAdminUrl("evil.com")).toBe("");
    expect(shopifyShopAdminUrl("rails-paris.myshopify.com.evil.com")).toBe("");
    expect(shopifyShopAdminUrl("evil.com/rails-paris.myshopify.com")).toBe("");
    expect(shopifyShopAdminUrl("Rails-Paris.myshopify.com")).toBe("");
    expect(shopifyShopAdminUrl("")).toBe("");
    expect(shopifyShopAdminUrl(undefined)).toBe("");
  });
});

// ShopifyProductSync.vue links each recent sync row at the product, or at the one variant the row
// is actually about.
describe("Product admin link", () => {
  it("links the product, and the variant when the row names a different record", () => {
    expect(shopifyProductAdminUrl("rails-paris.myshopify.com", "4604788917"))
      .toBe("https://rails-paris.myshopify.com/admin/products/4604788917");
    expect(shopifyProductAdminUrl("rails-paris.myshopify.com", "4604788917", "5501234567"))
      .toBe("https://rails-paris.myshopify.com/admin/products/4604788917/variants/5501234567");
    expect(shopifyProductAdminUrl("rails-paris.myshopify.com", 4604788917))
      .toBe("https://rails-paris.myshopify.com/admin/products/4604788917");
  });

  it("drops a variant that repeats the product or names no record, keeping the product link whole", () => {
    expect(shopifyProductAdminUrl("rails-paris.myshopify.com", "4604788917", "4604788917"))
      .toBe("https://rails-paris.myshopify.com/admin/products/4604788917");
    expect(shopifyProductAdminUrl("rails-paris.myshopify.com", "4604788917", "../../settings"))
      .toBe("https://rails-paris.myshopify.com/admin/products/4604788917");
    expect(shopifyProductAdminUrl("rails-paris.myshopify.com", "4604788917", ""))
      .toBe("https://rails-paris.myshopify.com/admin/products/4604788917");
  });

  it("builds nothing when the host or the product cannot be trusted", () => {
    expect(shopifyProductAdminUrl("evil.com", "4604788917")).toBe("");
    expect(shopifyProductAdminUrl("rails-paris.myshopify.com.evil.com", "4604788917")).toBe("");
    expect(shopifyProductAdminUrl("Rails-Paris.myshopify.com", "4604788917")).toBe("");
    expect(shopifyProductAdminUrl("rails-paris.myshopify.com", "0")).toBe("");
    expect(shopifyProductAdminUrl("rails-paris.myshopify.com", "../../settings")).toBe("");
    expect(shopifyProductAdminUrl("rails-paris.myshopify.com", "")).toBe("");
    expect(shopifyProductAdminUrl("", "4604788917")).toBe("");
  });
});

// ShopifyOrderSync.vue links a recent order row once the row is verified against the loaded shop.
describe("Order admin link", () => {
  it("links an order in the shop's admin", () => {
    expect(shopifyOrderAdminUrl("rails-paris.myshopify.com", "4604788917"))
      .toBe("https://rails-paris.myshopify.com/admin/orders/4604788917");
  });

  it("builds nothing when the host or the order cannot be trusted", () => {
    expect(shopifyOrderAdminUrl("evil.com", "4604788917")).toBe("");
    expect(shopifyOrderAdminUrl("rails-paris.myshopify.com.evil.com", "4604788917")).toBe("");
    expect(shopifyOrderAdminUrl("rails-paris.myshopify.com", "0")).toBe("");
    expect(shopifyOrderAdminUrl("rails-paris.myshopify.com", "../../settings")).toBe("");
    expect(shopifyOrderAdminUrl("rails-paris.myshopify.com", "")).toBe("");
    expect(shopifyOrderAdminUrl(undefined, "4604788917")).toBe("");
  });
});
