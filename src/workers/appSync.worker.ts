/**
 * The app's single sync worker.
 *
 * Importing a domain module registers it (side effect), then the harness exposes the Comlink API
 * and runs whichever activated domains are due. Add a domain by importing it here — one worker
 * thread serves them all.
 *
 * `registerCompanySeedDomains` runs FIRST, before any domain module import. Registration order
 * sets tick order, and three Company domains fan out over rows a parent domain caches —
 * `carrierFacility` over `carrier`, and `productStoreShippingMethod` / `facilityGroupProductStore`
 * over `productStore` — where the parent is now seed-registered here while the child stays
 * Company's own registration below. Import the domain modules before the seed registration and a
 * fan-out child ticks against an empty parent table on first login and silently caches nothing.
 *
 * This calls Company's own adapter (`./domains/registerSeedDomains`), NOT the framework's
 * `@common/db/sync/registerSeedDomains` — see that file for why: the framework helper registers
 * into a registry Company's harness never reads.
 */
import { registerCompanySeedDomains } from "./domains/registerSeedDomains";
import { companyDb } from "@/db/companyDb";

registerCompanySeedDomains(companyDb.seed);

import "./domains/dataManagerLogDomain";
import "./domains/systemMessageDomain";
import "./domains/serviceJobRunDomain";
import "./domains/syncRunDomain";
import "./domains/productUpdateHistoryDomain";
import "./domains/organizationDomain";
import "./domains/shopifyInventoryMonitoringDomain";
import "./domains/netSuiteOrderPushDomain";
import "./domains/referenceDomains";

// The harness must be imported last: it calls `expose()`, and every domain has to be registered
// by the time the main thread can invoke `domains()` or `start()`.
import "./pollingWorkerHarness";
