import { describe, expect, it } from "vitest";
import { companyDb } from "@/db/companyDb";
import type { SyncDomain } from "@common/db/types";

import { dataManagerLogDomain } from "@/workers/domains/dataManagerLogDomain";
import { systemMessageDomain } from "@/workers/domains/systemMessageDomain";
import { serviceJobRunDomain } from "@/workers/domains/serviceJobRunDomain";
import { syncRunDomain } from "@/workers/domains/syncRunDomain";
import { productUpdateHistoryDomain } from "@/workers/domains/productUpdateHistoryDomain";
import { organizationDomain } from "@/workers/domains/organizationDomain";
import {
  shopifyInventoryEventFeedDomain,
  inventoryChannelDomain,
  shopifyInventoryAdjustmentDetailDomain,
  detailKey,
} from "@/workers/domains/shopifyInventoryMonitoringDomain";
import { shopifyLocationInventoryAdjustmentDetailDomain } from "@/workers/domains/shopifyLocationInventoryDomain";
import { shopifyTransferSyncDomain } from "@/workers/domains/shopifyTransferSyncDomain";
import { netSuiteOrderPushDomain } from "@/workers/domains/netSuiteOrderPushDomain";
import { referenceDomains } from "@/workers/domains/referenceDomains";

/** Every domain the worker entry registers, minus the framework seed domains it shares unchanged. */
const companyOwnDomains: SyncDomain[] = [
  dataManagerLogDomain,
  systemMessageDomain,
  serviceJobRunDomain,
  syncRunDomain,
  productUpdateHistoryDomain,
  organizationDomain,
  shopifyInventoryEventFeedDomain,
  inventoryChannelDomain,
  shopifyInventoryAdjustmentDetailDomain,
  shopifyLocationInventoryAdjustmentDetailDomain,
  shopifyTransferSyncDomain,
  netSuiteOrderPushDomain,
  ...referenceDomains,
];

/**
 * A domain names the table it fills. If that table is not in the composed schema, Dexie has no such
 * store and every write throws at the first call — silently, inside the worker, where the only
 * symptom is a screen that never fills.
 */
describe("registered domains and the composed schema agree", () => {
  it("declares every table a Company domain writes to", () => {
    const declared = new Set(companyDb.tableNames);
    const missing = companyOwnDomains
      .map((domain) => domain.table)
      .filter((table): table is string => Boolean(table))
      .filter((table) => !declared.has(table));

    expect(missing).toEqual([]);
  });
});

describe("shopifyInventoryAdjustmentDetail key building", () => {
  it("builds a canonical key from the four real key members", () => {
    const key = detailKey({
      eventTypeId: "EVT",
      eventReferenceId: "REF",
      inventoryChannelId: "CHAN",
      shopifyInventoryItemId: "ITEM",
      ignored: "x",
    });

    expect(key).toBeDefined();
    expect(key).toContain("EVT");
  });

  it("returns undefined when a key member is missing, rather than throwing", () => {
    expect(detailKey({ eventTypeId: "EVT" })).toBeUndefined();
  });
});
