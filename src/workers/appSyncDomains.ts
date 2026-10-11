/**
 * Every sync domain Company registers: the common seed domains for the seed tables its database
 * has, plus its own.
 *
 * Kept apart from the worker entry so the main thread can read the same list. Settings builds its
 * Data Fetch Status card from it, which then lists Company's domains even before the worker is up
 * or after it failed to start, when the per-domain Refresh is the way back. The worker registers
 * exactly this array, so the two never disagree.
 *
 * Worker-safe: it imports nothing the worker entry did not already import.
 */
import type { SyncDomain } from "@common/db/types";
import { commonDomains } from "@common/db/seed/seedDomains";

import { dataManagerLogDomain } from "./domains/dataManagerLogDomain";
import { systemMessageDomain } from "./domains/systemMessageDomain";
import { serviceJobRunDomain } from "./domains/serviceJobRunDomain";
import { syncRunDomain } from "./domains/syncRunDomain";
import { productUpdateHistoryDomain } from "./domains/productUpdateHistoryDomain";
import { organizationDomain } from "./domains/organizationDomain";
import {
  shopifyInventoryEventFeedDomain,
  inventoryChannelDomain,
} from "./domains/shopifyInventoryMonitoringDomain";
import { inventoryEventDomains } from "./domains/inventoryEventDomains";
import { shopifyTransferSyncDomain } from "./domains/shopifyTransferSyncDomain";
import { shopifyTransferDeliveryDomain } from "./domains/shopifyTransferDeliveryDomain";
import { shopifyFulfillmentHistoryDomain } from "./domains/shopifyFulfillmentHistoryDomain";
import { shopifyPendingFulfillmentDomain } from "./domains/shopifyPendingFulfillmentDomain";
import { shopifyFulfillmentHealthDomain } from "./domains/shopifyFulfillmentHealthDomain";
import { shopifyOrderSyncHistoryDomain } from "./domains/shopifyOrderSyncHistoryDomain";
import { netSuiteOrderPushDomain } from "./domains/netSuiteOrderPushDomain";
import { referenceDomains } from "./domains/referenceDomains";

import { companyDb } from "@/db/companyDb";

/**
 * Common seed domains for the seed tables Company's database actually has.
 *
 * Derived from the composed schema rather than listed by hand: a hand list registered twelve seed
 * domains whose tables Company never picked, and each one failed on every login sync.
 * Overridden seed tables (carriers, carrierShipmentMethods, shopifyShops, facilityGroups, statuses)
 * are registered with Company-specific config in `referenceDomains.ts`, which wins on name.
 */
const OVERRIDDEN_SEED_TABLES = new Set(["carriers", "carrierShipmentMethods", "shopifyShops", "facilityGroups", "statuses"]);
const companySeedDomains = Object.values(commonDomains).filter((domain) =>
  domain.table && companyDb.seedTables.has(domain.table) && !OVERRIDDEN_SEED_TABLES.has(domain.table));

export const appSyncDomains: SyncDomain[] = [
  ...companySeedDomains,
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
