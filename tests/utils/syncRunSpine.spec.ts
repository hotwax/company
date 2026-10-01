import { describe, expect, it } from "vitest";

import { projectRow, projectRows } from "@/utils/cacheProjection";
import { syncRunProjection } from "@/utils/cacheEntities";

/**
 * L1 unit — the shop-scoped sync CURSOR (spine).
 *
 * `syncRuns` records which runs a shop has and which import each became; detail lives in
 * `systemMessages` / `dataManagerLogs`, enriched by id. It exists because of an asymmetry proven live:
 *
 *   - messages DO partition per shop — `systemMessageRemoteId` → remote → `internalId` = shopId, and a
 *     remote belongs to exactly one shop, so each (remote, type) has its own window and cursor;
 *   - logs do NOT and cannot — `admin/dataManager/details` ignores shop filters (a nonexistent shop id
 *     returns the full unfiltered set) and `DATA_MANAGER_LOG_AND_PARAMETER`, which does scope by shop,
 *     omits `systemMessageId` and so cannot be joined to a message.
 *
 * `SYSTEM_MESSAGE_DATA_MANAGER_LOG` is the only feed that pairs the two under a shop scope, which is
 * why membership is decided here and not by hoping two shared windows line up.
 */
const RUN_WITH_IMPORT = {
  systemMessageId: "M227136",
  statusId: "SmsgConsumed",
  initDate: 1784618182975,
  systemMessageTypeId: "BulkQueryShopifyProductUpdates",
  systemMessageRemoteId: "HotWaxDemoShopifyConfig",
  remoteMessageId: "gid://shopify/BulkOperation/8690843975834",
  logId: "M101074",
  logStatusId: "DmlsFinished",
  totalRecordCount: 1,
  failedRecordCount: 0,
  configId: "SYNC_SHOPIFY_PRODUCT",
  remoteInternalId: "10010",
  remoteInternalIdType: "HOTWAX_SHOP_ID",
  processedDate: 1784618425744,
  lastUpdatedStamp: 1784618425744,
};

/** Same document, for a run that consumed but imported nothing — log fields simply absent. */
const RUN_WITHOUT_IMPORT = {
  systemMessageId: "M228375",
  statusId: "SmsgConsumed",
  initDate: 1784710942693,
  systemMessageTypeId: "BulkQueryShopifyProductUpdates",
  systemMessageRemoteId: "HotWaxDemoShopifyConfig",
  remoteInternalId: "10010",
  remoteInternalIdType: "HOTWAX_SHOP_ID",
  lastUpdatedStamp: 1784711124955,
};

describe("syncRun spine — shop scoping", () => {
  it("lands shopId from the document's remoteInternalId", () => {
    // Without this the per-shop index and every read filter are dead.
    expect(projectRow(RUN_WITH_IMPORT, syncRunProjection as any, 1)?.shopId).toBe("10010");
  });

  it("keeps shopId even though the raw document has no such field", () => {
    const row = projectRow(RUN_WITH_IMPORT, syncRunProjection as any, 1) as any;

    expect("shopId" in row.raw).toBe(false);
    expect(row.shopId).toBe("10010");
  });

  it("separates two shops' runs", () => {
    const rows = projectRows(
      [RUN_WITH_IMPORT, { ...RUN_WITH_IMPORT, systemMessageId: "M9", remoteInternalId: "10000" }],
      syncRunProjection as any,
      1,
    );

    expect(rows.map((r: any) => r.shopId)).toEqual(["10010", "10000"]);
  });
});

describe("syncRun spine — the message↔import pairing", () => {
  it("carries the pairing that no other shop-scoped feed provides", () => {
    const row = projectRow(RUN_WITH_IMPORT, syncRunProjection as any, 1) as any;

    expect(row.systemMessageId).toBe("M227136");
    expect(row.logId).toBe("M101074");
    expect(row.configId).toBe("SYNC_SHOPIFY_PRODUCT");
  });

  it("omits logId entirely when the run imported nothing", () => {
    const row = projectRow(RUN_WITHOUT_IMPORT, syncRunProjection as any, 1) as any;

    // Absent `logId` IS "consumed but never imported" — the state the summary tests for. It must not
    // coerce to 0 or "", or every run would look like it imported.
    expect("logId" in row).toBe(false);
    expect("totalRecordCount" in row).toBe(false);
    expect(row.statusId).toBe("SmsgConsumed");
  });

  it("keys on systemMessageId, so a late-attaching import updates the run in place", () => {
    // The domain re-reads the newest page every tick precisely so this transition lands: `initDate`
    // never moves when the import attaches, so a cursor on it would miss this.
    const before = projectRow(RUN_WITHOUT_IMPORT, syncRunProjection as any, 1) as any;
    const after = projectRow(
      { ...RUN_WITHOUT_IMPORT, logId: "M101099", logStatusId: "DmlsFinished", totalRecordCount: 3 },
      syncRunProjection as any,
      2,
    ) as any;

    expect(after.systemMessageId).toBe(before.systemMessageId);
    expect(after.logId).toBe("M101099");
    expect(after.totalRecordCount).toBe(3);
  });

  it("keeps the enrichment keys a consumer needs to fetch detail by id", () => {
    const row = projectRow(RUN_WITH_IMPORT, syncRunProjection as any, 1) as any;

    // These two ids are the whole point: per-id fetches always work, unlike bulk or shop-filtered
    // forms (multi-value `_op=in` returns 0 rows on both endpoints).
    expect(row.systemMessageId).toBeTruthy();
    expect(row.logId).toBeTruthy();
  });
});
