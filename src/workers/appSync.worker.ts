/**
 * The app's single sync worker.
 *
 * Importing a domain module registers it (side effect), then the harness exposes the Comlink API
 * and runs whichever activated domains are due. Add a domain by importing it here — one worker
 * thread serves them all.
 */
import "./domains/dataManagerLogDomain";
import "./domains/systemMessageDomain";
import "./domains/serviceJobRunDomain";
import "./domains/syncRunDomain";
import "./domains/productUpdateHistoryDomain";
import "./domains/organizationDomain";
<<<<<<< HEAD
||||||| 544075d
=======
import "./domains/shopifyInventoryMonitoringDomain";
import "./domains/netSuiteOrderPushDomain";
>>>>>>> refactor/vue-views-composable-extraction-9050245222670725615
import "./domains/referenceDomains";

// The harness must be imported last: it calls `expose()`, and every domain has to be registered
// by the time the main thread can invoke `domains()` or `start()`.
import "./pollingWorkerHarness";
