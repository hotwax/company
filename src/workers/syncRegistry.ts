/**
 * Sync domain registry.
 *
 * One worker serves every domain instead of one worker per domain (twelve domains would mean
 * twelve OS threads and twelve token subscriptions). Each domain declares its own cadence; a
 * single base tick runs whichever domains are due.
 *
 * Class A (live, append-mostly) domains set `intervalMs` and are activated while a view that
 * needs them is open. Class B (reference/config) domains omit `intervalMs`: they sync once on
 * activation (app load) and then only when a mutation asks for a refetch.
 */
export interface SyncContext {
  maargUrl: string;
  token: string;
}

export interface SyncDomain {
  /** Stable identifier used to activate the domain and to label its status messages. */
  name: string;
  /** Poll cadence for class A. Omit for class B / on-demand domains. */
  intervalMs?: number;
  /**
   * One sync pass. Returns the number of cache rows written.
   * `options.force` bypasses the once-per-login guard (manual resync).
   */
  sync: (ctx: SyncContext, args?: any, options?: { force?: boolean }) => Promise<number>;
  /** Refetch a single record by primary key after a mutation (class B). */
  refetchOne?: (ctx: SyncContext, pk: Record<string, unknown>, args?: any) => Promise<number>;
}

/** A domain the caller has switched on, with its per-activation arguments. */
export interface ActiveDomain {
  name: string;
  /** Overrides the domain's default cadence when present. */
  intervalMs?: number;
  /** Domain-specific arguments (filters, configId, watched job names, …). */
  args?: any;
}

const registry = new Map<string, SyncDomain>();

/** Register a domain. Called at worker module load by each domain module. */
export function registerSyncDomain(domain: SyncDomain): void {
  registry.set(domain.name, domain);
}

export function getSyncDomain(name: string): SyncDomain | undefined {
  return registry.get(name);
}

export function registeredDomainNames(): string[] {
  return [...registry.keys()];
}

/** The effective cadence for an activation: explicit override, else the domain default. */
export function effectiveInterval(active: ActiveDomain, domain: SyncDomain | undefined): number | undefined {
  return active.intervalMs ?? domain?.intervalMs;
}

/**
 * Which activated domains are due to run now.
 *
 * - A domain with no cadence (class B) is due only if it has never run — activation bootstrap.
 * - A domain with a cadence is due when its interval has elapsed since its last run.
 *
 * Pure so the scheduling rule is unit-testable without a worker or a timer.
 */
export function dueDomains(
  active: readonly ActiveDomain[],
  lastRunAt: Readonly<Record<string, number>>,
  now: number,
  intervalFor: (active: ActiveDomain) => number | undefined,
): ActiveDomain[] {
  return active.filter((entry) => {
    const last = lastRunAt[entry.name];
    const interval = intervalFor(entry);
    if (interval === undefined) return last === undefined; // class B: bootstrap once
    if (last === undefined) return true; // first run is immediate
    return now - last >= interval;
  });
}
