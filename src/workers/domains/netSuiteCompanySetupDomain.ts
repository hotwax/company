import { companyDb } from "@/db/companyDb";
import { NETSUITE_COMPANY_SETUP_DOMAIN } from "@/config/appSyncConfig";
import { defineSyncDomain } from "@common/db/sync/defineSyncDomain";
import { workerGet } from "@common/core/workerRemoteApi";

const netSuiteCompanySetupEntity = companyDb.entity(companyDb.tables.netSuiteCompanySetup);

export interface NetSuiteCompanySetupArgs {
  partyId?: string;
}

export const netSuiteCompanySetupDomain = defineSyncDomain({
  name: NETSUITE_COMPANY_SETUP_DOMAIN,
  table: companyDb.tables.netSuiteCompanySetup,
  label: "NetSuite company setup",
  syncClass: "A",
  intervalMs: 300_000,
  async sync(ctx, args: NetSuiteCompanySetupArgs = {}) {
    const partyId = String(args.partyId ?? "").trim();
    if (!partyId) return 0;

    const url = "netsuite/companySetup";
    const setup = await workerGet(ctx, url, { partyId });
    if (!Array.isArray(setup?.locations) || !Array.isArray(setup?.stores)) {
      throw new Error(`${url} gave no locations or stores for organization ${partyId}`);
    }

    return netSuiteCompanySetupEntity.upsertMany([{
      partyId,
      locations: setup.locations.map((location: any) => ({
        facilityId: location.facilityId,
        facilityName: location.facilityName,
        externalId: location.externalId,
      })),
      stores: setup.stores.map((store: any) => ({
        productStoreId: store.productStoreId,
        storeName: store.storeName,
        locationCount: store.locationCount ?? 0,
      })),
    }]);
  },
});
