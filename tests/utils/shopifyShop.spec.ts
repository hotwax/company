import { describe, expect, it } from "vitest";

import { isInShop } from "@/utils/shopifyShop";

/** L1 pure behaviors for the ShopifyShop entity — no mocks, no DOM. */

describe("isInShop", () => {
  it("matches only the exact shopId", () => {
    expect(isInShop({ shopId: "10010" }, "10010")).toBe(true);
    expect(isInShop({ shopId: "10010" }, "99999")).toBe(false);
  });

  it("rejects when either side is missing", () => {
    expect(isInShop({ shopId: "10010" }, "")).toBe(false);
    expect(isInShop({}, "10010")).toBe(false);
    expect(isInShop(null, "10010")).toBe(false);
  });
});
