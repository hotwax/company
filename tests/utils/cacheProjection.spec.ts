import { describe, expect, it } from "vitest";
import {
  diffStaleKeys,
  isEffectiveNow,
  isUnkeyableFetch,
  keepNewerThan,
  newestValue,
  projectRow,
  projectRows,
  toCount,
  toMillis,
  toText,
} from "@/utils/cacheProjection";
import { dataFeedProjection } from "@/utils/cacheEntities";

const NOW = 1_700_000_000_000;

const logProjection = {
  keyField: "logId",
  fields: {
    logId: "text",
    configId: "text",
    totalRecordCount: "count",
    createdDate: "date",
    finishDateTime: "date",
  },
} as const;

describe("toMillis", () => {
  it("passes through finite numbers", () => {
    expect(toMillis(1_700_000_000_000)).toBe(1_700_000_000_000);
  });

  it("parses numeric strings (Moqui serializes epoch millis as strings)", () => {
    expect(toMillis("1700000000000")).toBe(1_700_000_000_000);
  });

  it("parses ISO strings", () => {
    expect(toMillis("2026-07-22T21:54:54.252Z")).toBe(Date.parse("2026-07-22T21:54:54.252Z"));
  });

  it("returns undefined for absent or unparseable values", () => {
    expect(toMillis(null)).toBeUndefined();
    expect(toMillis(undefined)).toBeUndefined();
    expect(toMillis("")).toBeUndefined();
    expect(toMillis("not a date")).toBeUndefined();
  });
});

describe("toCount / toText", () => {
  it("coerces counts, including zero", () => {
    expect(toCount("25")).toBe(25);
    expect(toCount(0)).toBe(0);
    expect(toCount("")).toBeUndefined();
    expect(toCount("abc")).toBeUndefined();
  });

  it("trims text and drops empties", () => {
    expect(toText("  SYNC_SHOPIFY_ORDER ")).toBe("SYNC_SHOPIFY_ORDER");
    expect(toText("   ")).toBeUndefined();
    expect(toText(null)).toBeUndefined();
  });
});

describe("projectRow", () => {
  it("hoists and normalizes declared fields, keeping raw intact", () => {
    const raw = {
      logId: "M101327",
      configId: "SYNC_SHOPIFY_ORDER",
      totalRecordCount: "2",
      createdDate: "1784757294252",
      extraServerField: "kept only in raw",
    };
    const row = projectRow(raw, logProjection, NOW)!;

    expect(row.logId).toBe("M101327");
    expect(row.configId).toBe("SYNC_SHOPIFY_ORDER");
    expect(row.totalRecordCount).toBe(2);
    expect(row.createdDate).toBe(1_784_757_294_252);
    expect(row.cachedAt).toBe(NOW);
    expect(row.raw).toBe(raw);
    // A field the server omitted is absent, not null — Dexie indexes stay sparse.
    expect("finishDateTime" in row).toBe(false);
  });

  it("returns null when the primary key is missing, so unaddressable rows are skipped", () => {
    expect(projectRow({ configId: "X" }, logProjection, NOW)).toBeNull();
    expect(projectRow({ logId: "  " }, logProjection, NOW)).toBeNull();
  });

  it("supports a synthetic composite key (date-effective association)", () => {
    const memberProjection = {
      keyField: "memberKey",
      fields: { facilityGroupId: "text", facilityId: "text", fromDate: "date" },
      buildKey: (raw: Record<string, unknown>) =>
        `${raw.facilityGroupId}|${raw.facilityId}|${raw.fromDate}`,
    } as const;

    const row = projectRow(
      { facilityGroupId: "ARCHIVE", facilityId: "STORE_1", fromDate: 1_700_000_000_000 },
      memberProjection,
      NOW,
    )!;
    expect(row.memberKey).toBe("ARCHIVE|STORE_1|1700000000000");
  });

  it("projectRows drops keyless records rather than throwing", () => {
    const rows = projectRows([{ logId: "A" }, { configId: "no key" }, { logId: "B" }], logProjection, NOW);
    expect(rows.map((row) => row.logId)).toEqual(["A", "B"]);
  });

  it("keeps the inventory event feed mode as a first-class cached field", () => {
    const row = projectRow({
      dataFeedId: "ShopifyInventoryChannelEventFeed",
      dataFeedTypeEnumId: "DTFDTP_RT_PUSH",
      feedName: "Shopify Inventory Channel Event Feed",
    }, dataFeedProjection, NOW)!;

    expect(row.dataFeedId).toBe("ShopifyInventoryChannelEventFeed");
    expect(row.dataFeedTypeEnumId).toBe("DTFDTP_RT_PUSH");
    expect(row.feedName).toBe("Shopify Inventory Channel Event Feed");
  });
});

describe("diffStaleKeys (class-B snapshot prune)", () => {
  it("returns cached keys the fresh set no longer contains", () => {
    expect(diffStaleKeys(["a", "b", "c"], ["a", "c"])).toEqual(["b"]);
  });

  it("returns nothing when the fresh set covers everything", () => {
    expect(diffStaleKeys(["a", "b"], ["a", "b", "c"])).toEqual([]);
  });

  it("prunes everything when the server returns an empty set", () => {
    expect(diffStaleKeys(["a", "b"], [])).toEqual(["a", "b"]);
  });
});

describe("newestValue (cursor selection)", () => {
  it("takes the max, not the first or last row", () => {
    const rows = [{ createdDate: 100 }, { createdDate: 300 }, { createdDate: 200 }];
    expect(newestValue(rows, "createdDate")).toBe(300);
  });

  it("ignores rows missing or non-numeric on that field", () => {
    const rows = [{ createdDate: undefined }, { createdDate: "500" }, { createdDate: 200 }];
    expect(newestValue(rows, "createdDate")).toBe(200);
  });

  it("returns undefined for an empty scope, which triggers a full seed", () => {
    expect(newestValue([], "createdDate")).toBeUndefined();
  });
});

describe("keepNewerThan (inclusive-boundary dedup)", () => {
  it("drops the boundary record the server returns because `_from` is inclusive", () => {
    const cursor = 1_784_757_294_252;
    const page = [
      { logId: "new", createdDate: cursor + 1000 },
      { logId: "boundary", createdDate: cursor },
      { logId: "older", createdDate: cursor - 1000 },
    ];
    expect(keepNewerThan(page, "createdDate", cursor).map((r) => r.logId)).toEqual(["new"]);
  });

  it("yields nothing on a quiet poll, so the tick writes zero rows", () => {
    const cursor = 500;
    expect(keepNewerThan([{ createdDate: cursor }], "createdDate", cursor)).toEqual([]);
  });

  it("handles string dates from the server", () => {
    const kept = keepNewerThan([{ createdDate: "600" }], "createdDate", 500);
    expect(kept).toHaveLength(1);
  });
});

describe("isUnkeyableFetch", () => {
  // Mirrors the real productStoreFacility projection: the key needs BOTH ids.
  const projection = {
    keyField: "storeFacilityKey",
    fields: { productStoreId: "text", facilityId: "text" },
    buildKey: (raw: Record<string, unknown>) =>
      raw?.productStoreId && raw?.facilityId
        ? `${raw.productStoreId}::${raw.facilityId}`
        : undefined,
  } as const;

  it("is false for an empty fetch, which is a legitimate empty scope", () => {
    expect(isUnkeyableFetch([], projection as any)).toBe(false);
  });

  it("is false when the rows are keyable", () => {
    const rows = [{ productStoreId: "STORE", facilityId: "BROADWAY" }];
    expect(isUnkeyableFetch(rows, projection as any)).toBe(false);
  });

  it("is true when a fetch returns the WRONG entity, so its rows cannot be keyed", () => {
    // What the fan-out refetch bug actually returned: product stores, not store<->facility links.
    // Every row lacks facilityId, so the projection keys none of them. Snapshotting this would
    // diff cached keys against zero fresh keys and prune the entire scope.
    const wrongEntity = [{ productStoreId: "STORE", storeName: "Demo Store" }];
    expect(isUnkeyableFetch(wrongEntity, projection as any)).toBe(true);
  });

  it("is false if even one row keys, so a partial response still snapshots", () => {
    const mixed = [
      { productStoreId: "STORE", storeName: "Demo Store" },
      { productStoreId: "STORE", facilityId: "BROADWAY" },
    ];
    expect(isUnkeyableFetch(mixed, projection as any)).toBe(false);
  });
});

describe("isEffectiveNow", () => {
  const NOW = 1_000_000;

  it("keeps a row with no dates at all", () => {
    expect(isEffectiveNow({}, NOW)).toBe(true);
  });

  it("keeps an open-ended row that has already started", () => {
    expect(isEffectiveNow({ fromDate: NOW - 1, thruDate: null }, NOW)).toBe(true);
  });

  it("drops a row whose thruDate has passed", () => {
    expect(isEffectiveNow({ fromDate: NOW - 100, thruDate: NOW - 1 }, NOW)).toBe(false);
  });

  it("drops a row closed at exactly now, so a just-removed record disappears immediately", () => {
    // The remove mutations stamp thruDate = Date.now(); an inclusive check would keep it visible.
    expect(isEffectiveNow({ fromDate: NOW - 100, thruDate: NOW }, NOW)).toBe(false);
  });

  it("drops a row that has not started yet", () => {
    expect(isEffectiveNow({ fromDate: NOW + 1 }, NOW)).toBe(false);
  });

  it("handles the undefined row", () => {
    expect(isEffectiveNow(undefined, NOW)).toBe(true);
  });
});

describe("projectRow — rename", () => {
  const projection = {
    keyField: "systemMessageId",
    fields: { systemMessageId: "text", shopId: "text", logId: "text" },
    // Keyed by the CACHED name → the source field. Getting this backwards silently drops the field,
    // which is how `shopId` came back undefined on every cached sync run while `raw.remoteInternalId`
    // sat right there — and a table indexed by `shopId` then scopes to nothing.
    rename: { shopId: "remoteInternalId" },
  } as const;

  it("reads a renamed field from its source name", () => {
    const row = projectRow({ systemMessageId: "M1", remoteInternalId: "10000" }, projection as any, 1);

    expect(row?.shopId).toBe("10000");
  });

  it("prefers the cached name when the feed already uses it", () => {
    const row = projectRow(
      { systemMessageId: "M1", shopId: "10010", remoteInternalId: "10000" }, projection as any, 1);

    expect(row?.shopId).toBe("10010");
  });

  it("leaves a renamed field absent when neither name is present", () => {
    const row = projectRow({ systemMessageId: "M1" }, projection as any, 1);

    expect(row).not.toBeNull();
    expect("shopId" in (row as any)).toBe(false);
  });

  it("still drops fields the sparse feed omitted", () => {
    // The DataDocument omits the log side entirely for a message that never imported.
    const row = projectRow({ systemMessageId: "M1", remoteInternalId: "10000" }, projection as any, 1);

    expect("logId" in (row as any)).toBe(false);
  });
});
