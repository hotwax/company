import { describe, expect, it } from "vitest";
import {
  shopifyFulfillmentHistoryProjection,
  shopifyFulfillmentHistorySupportProjection,
  systemMessageProjection,
} from "@/utils/cacheEntities";
import { projectRow } from "@/utils/cacheProjection";

/**
 * L1 unit — the fulfillment sync projections, against the REAL definitions in `cacheEntities`.
 *
 * The synthesized key is the part worth locking: Shopify's numeric `fulfillmentId` is only unique
 * per shop, so a key built from it alone would let two shops' rows overwrite each other, and a key
 * that tolerates a missing half would collide rows onto `"undefined"`. The projector drops keyless
 * rows silently (that is the `isUnkeyableFetch` contract), so these tests are the loud version of
 * that rule.
 */

const CACHED_AT = 1_800_000_000_000;

describe("shopifyFulfillmentHistory projection", () => {
  it("synthesizes `${shopId}:${fulfillmentId}` and keeps every contract alias", () => {
    const row = projectRow({
      shopId: "10000",
      shopifyOrderId: "5734893781",
      fulfillmentId: "4471301884",
      processedDate: "2026-08-21T10:15:00Z",
      lastUpdatedStamp: 1755771300000,
      omsOrderId: "RAI-100488",
      orderDate: 1755680000000,
      shipmentId: "SHP-88801",
      originFacilityId: "STORE_118",
      shippedDate: 1755765660000,
    }, shopifyFulfillmentHistoryProjection, CACHED_AT);

    expect(row).toMatchObject({
      fulfillmentKey: "10000:4471301884",
      shopId: "10000",
      shopifyOrderId: "5734893781",
      fulfillmentId: "4471301884",
      omsOrderId: "RAI-100488",
      shipmentId: "SHP-88801",
      originFacilityId: "STORE_118",
      lastUpdatedStamp: 1755771300000,
      orderDate: 1755680000000,
      shippedDate: 1755765660000,
      cachedAt: CACHED_AT,
    });
    // ISO date strings are normalized to millis so the cursor and sort never compare strings.
    expect(row?.processedDate).toBe(Date.parse("2026-08-21T10:15:00Z"));
  });

  it("keeps a null processedDate absent — the mark of an OMS-pushed row, not a gap", () => {
    const row = projectRow({
      shopId: "10000",
      fulfillmentId: "4471302915",
      processedDate: null,
      lastUpdatedStamp: 1755771300000,
    }, shopifyFulfillmentHistoryProjection, CACHED_AT);

    expect(row).not.toBeNull();
    expect(row).not.toHaveProperty("processedDate");
  });

  it("drops a row missing either key half instead of colliding shops", () => {
    expect(projectRow(
      { fulfillmentId: "4471301884", lastUpdatedStamp: 1 },
      shopifyFulfillmentHistoryProjection,
      CACHED_AT,
    )).toBeNull();
    expect(projectRow(
      { shopId: "10000", lastUpdatedStamp: 1 },
      shopifyFulfillmentHistoryProjection,
      CACHED_AT,
    )).toBeNull();
  });

  it("gives the same fulfillmentId a distinct key per shop", () => {
    const first = projectRow(
      { shopId: "10000", fulfillmentId: "77" },
      shopifyFulfillmentHistoryProjection,
      CACHED_AT,
    );
    const second = projectRow(
      { shopId: "10010", fulfillmentId: "77" },
      shopifyFulfillmentHistoryProjection,
      CACHED_AT,
    );

    expect(first?.fulfillmentKey).toBe("10000:77");
    expect(second?.fulfillmentKey).toBe("10010:77");
    expect(first?.fulfillmentKey).not.toBe(second?.fulfillmentKey);
  });
});

describe("shopifyFulfillmentHistorySupport projection", () => {
  it("keys the endpoint verdict by shop", () => {
    const row = projectRow(
      { shopId: "10000", isSupported: "N", checkedAt: CACHED_AT },
      shopifyFulfillmentHistorySupportProjection,
      CACHED_AT,
    );

    expect(row).toMatchObject({ shopId: "10000", isSupported: "N", checkedAt: CACHED_AT });
  });
});

describe("systemMessage projection failCount", () => {
  it("projects failCount as a number even when the server sends a string", () => {
    const row = projectRow({
      systemMessageId: "M228628",
      systemMessageTypeId: "CreateShopifyFulfillment",
      systemMessageRemoteId: "HCDemoShopifyConfig",
      statusId: "SmsgError",
      failCount: "24",
      initDate: 1755771300000,
    }, systemMessageProjection, CACHED_AT);

    // A `text` declaration would pass "24" through unchanged and the retry note's arithmetic
    // ("failCount reached {count}") would concatenate instead of count.
    expect(row?.failCount).toBe(24);
  });

  it("leaves failCount absent for a message the sweep never touched", () => {
    const row = projectRow({
      systemMessageId: "M228629",
      statusId: "SmsgProduced",
    }, systemMessageProjection, CACHED_AT);

    expect(row).not.toBeNull();
    expect(row).not.toHaveProperty("failCount");
  });
});
