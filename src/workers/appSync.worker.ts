/**
 * The app's single sync worker.
 *
 * All domain definitions (common seed reference domains and Company app-specific domains)
 * are explicitly imported and registered via `registerDomains(...)` prior to exposing the harness.
 */
import { registerDomains } from "@common/db/sync/syncRegistry";
import { exposeWorkerHarness } from "@common/db/sync/pollingWorkerHarness";
import { companyDb } from "@/db/companyDb";
import { appSyncDomains } from "./appSyncDomains";

registerDomains(appSyncDomains);

// Each worker realm is a separate JS realm with its own module instances, so the resolver has to
// be registered here as well as on the main thread. The harness hands us the instance on start().
exposeWorkerHarness((omsInstance) => {
  companyDb.setOmsInstanceResolver(() => omsInstance);
  return companyDb.get(omsInstance);
});
