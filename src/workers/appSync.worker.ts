/**
 * The app's single sync worker.
 *
 * All domain definitions (common seed reference domains and Company app-specific domains)
 * are explicitly imported and registered via `registerDomains(...)` prior to exposing the harness.
 */
import { commonDomains } from "@common/db/domains/commonDomains";
import { registerDomains } from "@common/db/sync/registerDomains";

import { dataManagerLogDomain } from "./domains/dataManagerLogDomain";
import { systemMessageDomain } from "./domains/systemMessageDomain";
import { serviceJobRunDomain } from "./domains/serviceJobRunDomain";
import { syncRunDomain } from "./domains/syncRunDomain";
import { productUpdateHistoryDomain } from "./domains/productUpdateHistoryDomain";
import { organizationDomain } from "./domains/organizationDomain";
import {
  shopifyInventoryEventFeedDomain,
  inventoryChannelDomain,
  shopifyInventoryAdjustmentDetailDomain,
} from "./domains/shopifyInventoryMonitoringDomain";
import { shopifyLocationInventoryAdjustmentDetailDomain } from "./domains/shopifyLocationInventoryDomain";
import { shopifyTransferSyncDomain } from "./domains/shopifyTransferSyncDomain";
import { netSuiteOrderPushDomain } from "./domains/netSuiteOrderPushDomain";
import { referenceDomains } from "./domains/referenceDomains";

import { exposeWorkerHarness } from "@common/db/sync/pollingWorkerHarness";
import { companyDb } from "@/db/companyDb";

/**
 * Common seed domains that Company registers without custom overrides.
 * Overridden seed tables (carriers, carrierShipmentMethods, shopifyShops, facilityGroups, statuses)
 * are defined with Company-specific config in `referenceDomains.ts`.
 */
const companySeedDomains = [
  commonDomains.productStore,
  commonDomains.enum,
  commonDomains.enumType,
  commonDomains.facility,
  commonDomains.facilityType,
  commonDomains.groupFacility,
  commonDomains.geo,
  commonDomains.geoAssoc,
  commonDomains.shipmentMethodType,
  commonDomains.paymentMethodType,
  commonDomains.returnReason,
  commonDomains.returnType,
  commonDomains.returnItemType,
  commonDomains.roleType,
  commonDomains.orderAdjustmentType,
  commonDomains.contactMechPurposeType,
  commonDomains.communicationEventType,
  commonDomains.partyRelationshipType,
  commonDomains.statusFlowTransition,
  commonDomains.productStoreFacility,
  commonDomains.productStoreFacilityGroup,
  commonDomains.productStoreShipmentMethod,
  commonDomains.productStoreEmailSetting,
  commonDomains.shopifyShopLocation,
];

registerDomains([
  ...companySeedDomains,
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
]);

// Each worker realm is a separate JS realm with its own module instances, so the resolver has to
// be registered here as well as on the main thread. The harness hands us the instance on start().
exposeWorkerHarness((omsInstance) => {
  companyDb.setOmsInstanceResolver(() => omsInstance);
  return companyDb.get(omsInstance);
});
