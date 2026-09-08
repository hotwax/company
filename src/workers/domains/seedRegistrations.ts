import { companyDb } from "@/db/companyDb";
import { registerCompanySeedDomains } from "./registerSeedDomains";

/**
 * Side-effect module: registers Company's picked seed domains at import time.
 *
 * This has to be its own module, imported FIRST among the domain modules in
 * `appSync.worker.ts`, rather than a bare statement placed above the other imports there. ESM
 * hoists every `import` declaration in a module and evaluates all of them, in source order,
 * before any of that module's own top-level statements run — so a statement written "above" the
 * imports in `appSync.worker.ts` still runs AFTER every imported domain module has already
 * registered itself. Proved this live: with the call as a bare statement, `carrierFacility`
 * (a fan-out child of `carrier`) landed at registry index 14 while `carrier` itself landed at 41
 * — the child registered first. Making the registration its own `import` fixes it, because now
 * it participates in import order like every other domain module.
 */
registerCompanySeedDomains(companyDb.seed);
