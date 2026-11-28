import { companyDb } from "@/db/companyDb";
import { NETSUITE_SHIPMENTS_SETUP_DOMAIN } from "@/config/appSyncConfig";
import { defineSyncDomain } from "@common/db/sync/defineSyncDomain";
import { workerGet } from "@common/core/workerRemoteApi";

const netSuiteShipmentsSetupEntity = companyDb.entity(companyDb.tables.netSuiteShipmentsSetup);

export const netSuiteShipmentsSetupDomain = defineSyncDomain({
  name: NETSUITE_SHIPMENTS_SETUP_DOMAIN,
  table: companyDb.tables.netSuiteShipmentsSetup,
  label: "NetSuite shipments setup",
  syncClass: "A",
  intervalMs: 60_000,
  async sync(ctx) {
    const setup = await workerGet(ctx, "netsuite/shipmentsFromNetSuite/setup", {});
    if (typeof setup?.warehouseCount !== "number") {
      throw new Error("netsuite/shipmentsFromNetSuite/setup gave no warehouse count");
    }
    return netSuiteShipmentsSetupEntity.upsertMany([{
      flow: "shipmentsFromNetSuite",
      warehouseCount: setup.warehouseCount,
      warehousesWithoutId: setup.warehousesWithoutId ?? [],
      readShipmentCount: setup.readShipmentCount,
      unmappedShipMethodIds: setup.unmappedShipMethodIds ?? [],
      shipmentsWithoutCarrierCount: setup.shipmentsWithoutCarrierCount,
      oldFeedJobNames: setup.oldFeedJobNames ?? [],
      oldFeedJobNamesOn: setup.oldFeedJobNamesOn ?? [],
    }]);
  },
});
