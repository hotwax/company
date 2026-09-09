import type { Entity } from "@common/db/defineEntity";
import type { SeedSource } from "@common/db/domains/seedDomains";
import { registerSnapshotDomain } from "@common/db";

export interface SeedPick {
  name: string;
  table: string;
  projection: Entity;
  source: SeedSource;
}

/**
 * Registers Company's picked seed entities as Company's own sync domains.
 *
 * Deliberately NOT the framework's `registerSeedDomains` (`@common/db/sync/registerSeedDomains`):
 * that helper feeds `common/db/sync/snapshotDomain.ts`, which registers into the framework's OWN
 * registry (`common/db/sync/syncRegistry.ts`) — a `Map` entirely separate from Company's
 * (`../syncRegistry.ts`, the one `pollingWorkerHarness.ts` actually reads `dueDomains` /
 * `getSyncDomain` from). Calling the framework helper here would register every adopted domain
 * into a registry the harness never queries: the domains would exist, look correct in a
 * completeness check, and NEVER run — the exact "registers two things, only one survives" class of
 * silent failure this task exists to avoid, just one layer down. The two `SyncDomain` shapes also
 * differ (framework: `sync(ctx)` / `refetchOne(pk, ctx)`, both `Promise<void>`; Company:
 * `sync(ctx, args?, options?)` / `refetchOne(ctx, pk, args?)`, both `Promise<number>`), so even a
 * type-compatible registration would call the wrong contract.
 *
 * The framework's `registerSnapshotDomain` factory (`@common/db/sync/snapshotDomain`) accepts the same
 * config shape a seed entity's `source` carries (`listUrl`, `collectionKey`, `fanOut`, `byPk`,
 * `refetchScope`, …) and reads/writes through the registered `companyDb`, so each entity is fed
 * through unchanged — the adopted domains behave exactly like Company's hand-written ones: same
 * registry, same harness tick, same force-resync, same row count.
 */
export function registerCompanySeedDomains(picks: readonly SeedPick[]): void {
  for (const pick of picks) {
    registerSnapshotDomain({
      name: pick.name,
      table: pick.table as any,
      projection: pick.projection,
      ...pick.source,
    } as Parameters<typeof registerSnapshotDomain>[0]);
  }
}
