/**
 * Company Dexie database instance.
 *
 * Scoped per OMS instance, so switching instances lands on a different IndexedDB database
 * instead of reading the previous tenant's rows.
 *
 * Deep imports, never the `@common/db` barrel: the barrel re-exports modules that import
 * `vue`, and the sync worker imports this file — Vite must emit that chunk as a single iife.
 * This module must likewise never import `commonUtil`; `main.ts` registers the resolver.
 */

import { defineAppDb } from "@common/db/defineAppDb";
import { defineSchema, mergeSchemas } from "@common/db/defineSchema";
import { commonSchema } from "@common/db/domains/commonSchema";
import { companySchema } from "./companySchema";

/**
 * The 17 seed tables Company takes wholesale from the framework. Each was verified field-by-field
 * against Company's pre-adoption config to be a genuine drop-in equivalent.
 */
const COMPANY_SEED_TABLES = [
  "productStores",
  "statuses",
  "enums",
  "enumTypes",
  "facilities",
  "facilityTypes",
  "facilityGroups",
  "geos",
  "geoAssocs",
  "carriers",
  "shipmentMethodTypes",
  "paymentMethodTypes",
  "roleTypes",
  "shopifyShops",
  "groupFacilities",
  "carrierShipmentMethods",
  "productStoreFacilities",
] as const;

export const companyDb = defineAppDb({
  suffix: "CompanyDB",
  version: 1,
  schema: mergeSchemas(commonSchema.pick([...COMPANY_SEED_TABLES]), companySchema),
});

// Default resolver for unit tests / fallback before main.ts or worker harness registers the live resolver.
companyDb.setOmsInstanceResolver(() => "default");

