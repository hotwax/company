import { describe, expect, it } from "vitest";
import { companyDb } from "@/db/companyDb";
import { entityKeyOf, projectRows } from "@common/db/projection";
import { isShopifyLocationMapping } from "@/utils/shopifyShop";

const SYNCED_AT = 1_800_000_000_000;
const shopifyLocations = companyDb.entities.shopifyLocations;

/**
 * `ShopifyShopLocation` is keyed by (shopId, facilityId), and several facilities may map to the same
 * Shopify location. The table used to key on `shopifyLocationId`, so on the local OMS (2026-09-25)
 * CENTRAL_WAREHOUSE and M100051 — both on 67890151588 — stored as ONE row and M100051 read as
 * unmapped even right after it was saved.
 */
describe("Shopify location projection", () => {
  it("keeps one row per facility when facilities share a Shopify location", () => {
    const rows = projectRows([
      { shopId: "10000", facilityId: "CENTRAL_WAREHOUSE", shopifyLocationId: "67890151588" },
      { shopId: "10000", facilityId: "M100051", shopifyLocationId: "67890151588" },
      { shopId: "10000", facilityId: "BROOKLYN", shopifyLocationId: "67890479268" },
    ], shopifyLocations, SYNCED_AT);

    expect(rows.map((row) => entityKeyOf(row, shopifyLocations))).toEqual([
      ["10000", "CENTRAL_WAREHOUSE"],
      ["10000", "M100051"],
      ["10000", "BROOKLYN"],
    ]);
    expect(rows.filter((row) => row.shopifyLocationId === "67890151588").map((row) => row.facilityId))
      .toEqual(["CENTRAL_WAREHOUSE", "M100051"]);
  });

  it("keeps a facility mapped in two shops as two rows", () => {
    const rows = projectRows([
      { shopId: "10000", facilityId: "BROADWAY", shopifyLocationId: "67890413732" },
      { shopId: "10001", facilityId: "BROADWAY", shopifyLocationId: "71234500001" },
    ], shopifyLocations, SYNCED_AT);

    expect(rows.map((row) => entityKeyOf(row, shopifyLocations))).toEqual([["10000", "BROADWAY"], ["10001", "BROADWAY"]]);
  });

  it("does not read a row with no Shopify location as a mapping", () => {
    const rows = projectRows([
      { shopId: "10000", facilityId: "M100051", shopifyLocationId: null },
      { shopId: "10000", facilityId: "BROOKLYN", shopifyLocationId: "67890479268" },
    ], shopifyLocations, SYNCED_AT);

    expect(rows.filter(isShopifyLocationMapping).map((row) => row.facilityId)).toEqual(["BROOKLYN"]);
  });
});
