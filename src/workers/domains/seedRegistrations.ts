import { companyDb } from "@/db/companyDb";
import { registerSeedDomains } from "@common/db/sync/registerSeedDomains";

/**
 * Seed domains that Company registers with custom configuration (byPk, listParams, strictCollection, etc.)
 * in `referenceDomains.ts` or `statusDomain.ts` — excluded here to prevent duplicate domain registration.
 */
const OVERRIDDEN_SEED_DOMAINS = [
  "carriers",
  "carrierShipmentMethods",
  "shopifyShops",
  "facilityGroups",
  "statuses",
];

registerSeedDomains(companyDb, { exclude: OVERRIDDEN_SEED_DOMAINS });
