import type { SeedEntity } from "@common/db/domains/seedEntities";
import { registerSnapshotDomain } from "./snapshotDomain";

/**
 * Registers Company's picked seed entities (Task 3/5) as Company's own sync domains.
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
 * Company's own `registerSnapshotDomain` factory (`./snapshotDomain.ts`) already accepts the same
 * config shape a seed entity's `source` carries (`listUrl`, `collectionKey`, `fanOut`, `byPk`,
 * `refetchScope`, …) and already reads/writes through `companyDb` directly, so each entity is fed
 * through unchanged — the adopted domains behave exactly like Company's hand-written ones: same
 * registry, same harness tick, same force-resync, same row count.
 */
export function registerCompanySeedDomains(entities: readonly SeedEntity[]): void {
  for (const entity of entities) {
    registerSnapshotDomain({
      name: entity.name,
      table: entity.table,
      projection: entity.projection,
      ...entity.source,
    } as Parameters<typeof registerSnapshotDomain>[0]);
  }
}
