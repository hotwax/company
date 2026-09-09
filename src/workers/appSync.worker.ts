/**
 * The app's single sync worker.
 *
 * Importing a domain module registers it (side effect), then the harness exposes the Comlink API
 * and runs whichever activated domains are due. Add a domain by importing it here — one worker
 * thread serves them all.
 *
 * `./domains/seedRegistrations` is imported FIRST, before any other domain module. Registration
 * order sets tick order, and `productStoreShippingMethod` / `facilityGroupProductStore` (both
 * registered below, in `referenceDomains`) fan out over rows cached by `productStore`, which is
 * now seed-registered. Import a fan-out child before its parent and it ticks against an empty
 * parent table on first login and silently caches nothing.
 *
 * This MUST be a side-effect `import`, not a bare statement placed above the other imports: ESM
 * hoists every `import` declaration and evaluates all of them, in source order, before any of
 * THIS module's own statements run — so a statement here, even textually first, would still run
 * after every domain module below had already registered itself. Making the seed registration its
 * own module and importing it is what lets it participate in that same import-order sequencing.
 */
import "./domains/seedRegistrations";

import "./domains/dataManagerLogDomain";
import "./domains/systemMessageDomain";
import "./domains/serviceJobRunDomain";
import "./domains/syncRunDomain";
import "./domains/productUpdateHistoryDomain";
import "./domains/organizationDomain";
import "./domains/shopifyInventoryMonitoringDomain";
import "./domains/netSuiteOrderPushDomain";
import "./domains/referenceDomains";

// The harness must be imported last: it calls expose(), and every domain has to be registered
// by the time the main thread can invoke domains() or start().
import { exposeWorkerHarness } from "@common/db/sync/pollingWorkerHarness";
import { companyDb } from "@/db/companyDb";

// Each worker realm is a separate JS realm with its own module instances, so the resolver has to
// be registered here as well as on the main thread. The harness hands us the instance on start().
exposeWorkerHarness((omsInstance) => {
  companyDb.setOmsInstanceResolver(() => omsInstance);
  return companyDb.get(omsInstance);
});
