import { companyDb } from "@/db/companyDb";
import { NETSUITE_SUBSIDIARIES_DOMAIN } from "@/config/appSyncConfig";
import { defineSyncDomain } from "@common/db/sync/defineSyncDomain";
import { workerGet } from "@common/core/workerRemoteApi";

const netSuiteSubsidiaryEntity = companyDb.entity(companyDb.tables.netSuiteSubsidiaries);

export const netSuiteSubsidiariesDomain = defineSyncDomain({
  name: NETSUITE_SUBSIDIARIES_DOMAIN,
  table: companyDb.tables.netSuiteSubsidiaries,
  label: "NetSuite subsidiaries",
  syncClass: "A",
  intervalMs: 300_000,
  async sync(ctx) {
    const url = "netsuite/subsidiaries";
    const response = await workerGet(ctx, url, {});
    if (!Array.isArray(response?.subsidiaries)) {
      throw new Error(`${url} gave no subsidiary list`);
    }

    const subsidiaries = response.subsidiaries.map((subsidiary: any) => ({
      subsidiaryId: String(subsidiary.subsidiaryId),
      name: subsidiary.name,
      parentId: subsidiary.parentId,
      country: subsidiary.country,
      currencyId: subsidiary.currencyId,
      isElimination: subsidiary.isElimination ? "Y" : "N",
      isInactive: subsidiary.isInactive ? "Y" : "N",
      partyId: subsidiary.partyId,
      status: subsidiary.status,
      locationCount: subsidiary.locationCount ?? 0,
    }));

    const { written } = await netSuiteSubsidiaryEntity.snapshotReplace(subsidiaries);
    return written;
  },
});
