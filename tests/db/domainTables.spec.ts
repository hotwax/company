import { describe, expect, it } from "vitest";
import { companyDb } from "@/db/companyDb";
import { entityKeyOf, projectRow } from "@common/db/projection";
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
} from "@/workers/domains/shopifyInventoryMonitoringDomain";
import { inventoryEventDomains } from "@/workers/domains/inventoryEventDomains";
import { shopifyTransferSyncDomain } from "@/workers/domains/shopifyTransferSyncDomain";
import { shopifyTransferDeliveryDomain } from "@/workers/domains/shopifyTransferDeliveryDomain";
import { shopifyFulfillmentHistoryDomain } from "@/workers/domains/shopifyFulfillmentHistoryDomain";
import { shopifyPendingFulfillmentDomain } from "@/workers/domains/shopifyPendingFulfillmentDomain";
import { shopifyFulfillmentHealthDomain } from "@/workers/domains/shopifyFulfillmentHealthDomain";
import { shopifyOrderSyncHistoryDomain } from "@/workers/domains/shopifyOrderSyncHistoryDomain";
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
  ...inventoryEventDomains,
  shopifyTransferSyncDomain,
  shopifyTransferDeliveryDomain,
  shopifyFulfillmentHistoryDomain,
  shopifyPendingFulfillmentDomain,
  shopifyFulfillmentHealthDomain,
  shopifyOrderSyncHistoryDomain,
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

describe("inventory ledger identity", () => {
  const ledger = companyDb.entities.shopifyLocationInventoryAdjustmentDetails;
  const source = { eventTypeId: "SIE_RECEIPT", eventReferenceId: "R1", shopId: "S1", shopifyLocationId: "L1" };

  it("does not overwrite one inventory item with another from the same source event", () => {
    const first = projectRow({ ...source, shopifyInventoryItemId: "I1", computedInventoryChange: 2 }, ledger, 0)!;
    const second = projectRow({ ...source, shopifyInventoryItemId: "I2", computedInventoryChange: 3 }, ledger, 0)!;

    expect(entityKeyOf(first, ledger)).not.toEqual(entityKeyOf(second, ledger));
    expect(first.computedInventoryChange).toBe(2);
    expect(second.computedInventoryChange).toBe(3);
  });

  it("rejects a location event without an inventory item identity", () => {
    expect(projectRow(source, ledger, 0)).toBeNull();
  });

  it("keys the channel ledger on its four real key members", () => {
    const channelLedger = companyDb.entities.shopifyInventoryAdjustmentDetails;
    const row = projectRow({
      eventTypeId: "EVT", eventReferenceId: "REF", inventoryChannelId: "CHAN", shopifyInventoryItemId: "ITEM", shopId: "S1",
    }, channelLedger, 0)!;

    expect(entityKeyOf(row, channelLedger)).toEqual(["EVT", "REF", "CHAN", "ITEM"]);
    expect(projectRow({ eventTypeId: "EVT" }, channelLedger, 0)).toBeNull();
  });
});
