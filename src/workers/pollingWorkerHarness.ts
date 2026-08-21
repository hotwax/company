import { expose } from "comlink";
import { ensureCacheReady, hasSyncedThisLogin } from "@/utils/appCacheDb";
import { cacheScopeKey } from "@/utils/cacheScopeKey";
import { subscribeToken } from "@/utils/pollingTokenChannel";
import {
  type ActiveDomain,
  type SyncContext,
  activationKey,
  dueDomains,
  effectiveInterval,
  getSyncDomain,
  registeredDomainNames,
} from "./syncRegistry";

/**
 * Reusable worker-side sync harness (app-local; promotes to `@common/core`).
 *
 * OWNS the parts an app dev must not get wrong:
 *   - the poll cadence, running on the worker's own event loop so main-thread jank can never
 *     delay or skip a sync;
 *   - the held bearer token, kept fresh by push over BroadcastChannel — never snapshotted;
 *   - 401 detection → an `auth-error` status message so the main thread can re-authenticate;
 *   - teardown (one timer, cleared on stop).
 *
 * Domains supply only their own `sync` / `refetchOne` work via the registry. One base tick runs
 * whichever activated domains are due, so N domains share one thread and one token subscription.
 */
export interface HarnessStartPayload {
  maargUrl: string;
  token: string;
  /** How often the harness re-evaluates which domains are due. */
  baseTickMs?: number;
  domains: ActiveDomain[];
}

export interface SyncHarness {
  start: (payload: HarnessStartPayload) => void | Promise<void>;
  /** Force every activated domain to run now (manual refresh, routed from the main thread). */
  syncNow: () => void | Promise<void>;
  /** Force one domain to re-sync now, bypassing the once-per-login guard. */
  syncDomainNow: (domain: string) => Promise<number>;
  /** Refetch one record after a mutation: `{ domain, pk }`. */
  refetchOne: (request: { domain: string; pk: Record<string, unknown> }) => Promise<number>;
  /** Replace the activated domain set without respawning the worker. */
  setDomains: (domains: ActiveDomain[]) => void;
  stop: () => void;
  /** Diagnostics: which domains this worker build knows about. */
  domains: () => string[];
}

const DEFAULT_BASE_TICK_MS = 5_000;

let ctx: SyncContext = { maargUrl: "", token: "" };
let active: ActiveDomain[] = [];
let baseTickMs = DEFAULT_BASE_TICK_MS;
let timer: ReturnType<typeof setInterval> | null = null;
let running = false;
const lastRunAt: Record<string, number> = {};
const refetchQueues = new Map<string, Promise<void>>();
const domainExclusiveQueues = new Map<string, Promise<void>>();
const domainSharedOperations = new Map<string, Set<Promise<void>>>();

// Token stays fresh via push from the main thread — held, never frozen at start().
subscribeToken((next) => { ctx = { ...ctx, token: next }; });

const post = (msg: Record<string, unknown>) => self.postMessage(msg);

function classifyError(err: any): { isAuth: boolean; message: string } {
  const message = err?.message ?? (typeof err === "string" ? err : JSON.stringify(err ?? ""));
  const status = err?.status ?? err?.statusCode ?? err?.response?.status;
  // workerRemoteApi throws the parsed error body (no status), so also sniff the message.
  const isAuth = status === 401 || /unauthor|not authorized|invalid.*token|\b401\b/i.test(message);

  return { isAuth, message };
}

/**
 * Run a full snapshot exclusively with respect to targeted refetches for the same domain.
 *
 * The exclusive tail is installed immediately, before this operation starts, so a later refetch
 * cannot overtake it. Capturing the currently registered shared operations provides the opposite
 * ordering too: a snapshot requested after a mutation waits for every earlier targeted read.
 */
function runExclusiveDomainOperation<T>(
  domain: string,
  action: () => Promise<T>,
): Promise<T> {
  const previousExclusive = domainExclusiveQueues.get(domain) ?? Promise.resolve();
  const previousShared = [...(domainSharedOperations.get(domain) ?? [])];
  const operation = Promise.all([previousExclusive, ...previousShared]).then(() => action());
  const tail = operation.then(() => undefined, () => undefined);
  domainExclusiveQueues.set(domain, tail);

  return operation.finally(() => {
    if(domainExclusiveQueues.get(domain) === tail) {domainExclusiveQueues.delete(domain);}
  });
}

/**
 * Run a targeted refetch concurrently with other scopes, but never across a full snapshot for the
 * same domain. Different domains do not share either map and remain fully independent.
 */
function runSharedDomainOperation<T>(
  domain: string,
  action: () => Promise<T>,
): Promise<T> {
  const previousExclusive = domainExclusiveQueues.get(domain) ?? Promise.resolve();
  const operation = previousExclusive.then(() => action());
  const tail = operation.then(() => undefined, () => undefined);
  const active = domainSharedOperations.get(domain) ?? new Set<Promise<void>>();
  active.add(tail);
  domainSharedOperations.set(domain, active);

  return operation.finally(() => {
    active.delete(tail);
    if(!active.size && domainSharedOperations.get(domain) === active) {
      domainSharedOperations.delete(domain);
    }
  });
}

async function executeDomain(
  entry: ActiveDomain,
  force = false,
  propagateError = false,
): Promise<number> {
  const domain = getSyncDomain(entry.name);
  if(!domain) {
    const error = new Error(`unregistered domain "${entry.name}"`);
    post({ type: "sync-error", domain: entry.name, message: error.message });
    if(propagateError) {throw error;}

    return 0;
  }
  post({ type: "sync-start", domain: entry.name });
  // Per-ACTIVATION clock, not per-domain: one page can activate the same domain twice with different
  // args and cadences, and a shared clock lets the faster one starve the slower. See `activationKey`.
  const clockKey = activationKey(entry);
  try {
    const written = await domain.sync(ctx, entry.args, { force });
    const interval = effectiveInterval(entry, domain);
    // A class-B sync can deliberately refuse a destructive snapshot and return 0 without throwing.
    // Its durable login marker is the completion signal: until that marker exists, leave the
    // activation unclocked so the next base tick retries it. Cadenced domains and forced runs use
    // the in-memory clock as before.
    const completed = force || interval !== undefined || await hasSyncedThisLogin(entry.name);
    const at = Date.now();
    if(completed) {lastRunAt[clockKey] = at;}
    post({ type: "sync-end", domain: entry.name, written, at, retryPending: !completed });

    return written;
  } catch (err) {
    // Cadenced domains record failed attempts so one bad endpoint cannot spin faster than its
    // declared interval. A no-cadence/class-B domain must remain due until one pass succeeds.
    if(effectiveInterval(entry, domain) !== undefined) {lastRunAt[clockKey] = Date.now();}
    const { isAuth, message } = classifyError(err);
    post({ type: isAuth ? "auth-error" : "sync-error", domain: entry.name, message });
    if(propagateError) {throw err;}

    return 0;
  }
}

function runDomain(
  entry: ActiveDomain,
  force = false,
  propagateError = false,
): Promise<number> {
  return runExclusiveDomainOperation(
    entry.name,
    () => executeDomain(entry, force, propagateError),
  );
}

async function tick(force = false, propagateErrors = false): Promise<void> {
  if(running || !ctx.token) {return;} // don't overlap; wait until start() supplies a token
  running = true;
  try {
    const now = Date.now();
    const due = force
      ? active
      : dueDomains(active, lastRunAt, now, (entry) => effectiveInterval(entry, getSyncDomain(entry.name)));
    // Sequential: these share one thread and one backend; parallel bursts buy nothing here.
    const failures: Array<{ domain: string; error: unknown }> = [];
    for(const entry of due) {
      try {
        await runDomain(entry, force, propagateErrors);
      } catch (error) {
        failures.push({ domain: entry.name, error });
      }
    }
    if(failures.length) {
      throw new Error(
        `Failed to sync domains: ${failures.map(({ domain }) => domain).join(", ")}.`,
        { cause: failures[0].error },
      );
    }
  } finally {
    running = false;
  }
}

function stop(): void {
  if(timer) {
    clearInterval(timer);
    timer = null;
  }
}

async function start(payload: HarnessStartPayload): Promise<void> {
  stop(); // restart cleanly if called again
  ctx = { maargUrl: payload.maargUrl, token: payload.token };
  active = payload.domains ?? [];
  baseTickMs = payload.baseTickMs ?? DEFAULT_BASE_TICK_MS;
  // Recreate the cache if its stored schema is stale — otherwise every write below no-ops.
  try {
    await ensureCacheReady();
  } catch (err) {
    const error = new Error(`cache open failed: ${(err as any)?.message ?? err}`, { cause: err });
    post({ type: "sync-error", domain: "__start", message: error.message });
    throw error;
  }
  for(const key of Object.keys(lastRunAt)) {delete lastRunAt[key];}
  await tick(); // immediate first pass (seeds the cache for every activated domain)
  timer = setInterval(() => void tick(), baseTickMs);
}

function setDomains(domains: ActiveDomain[]): void {
  active = domains ?? [];
  /**
   * Drop run history for activations no longer active so re-activation bootstraps again.
   *
   * Keyed per activation, so swapping cadence (order sync escalating to 10s) keeps each activation's
   * own clock instead of resetting or sharing one.
   */
  const keys = new Set(active.map(activationKey));
  for(const key of Object.keys(lastRunAt)) {if(!keys.has(key)) {delete lastRunAt[key];}}
}

async function runTargetedRefetch(
  request: { domain: string; pk: Record<string, unknown> },
  scope: string,
): Promise<number> {
  const domain = getSyncDomain(request.domain);
  if(!domain?.refetchOne) {
    const error = new Error("domain has no refetchOne");
    post({ type: "sync-error", domain: request.domain, scope, message: error.message });
    throw error;
  }
  const entry = active.find((candidate) => candidate.name === request.domain);
  try {
    const written = await domain.refetchOne(ctx, request.pk, entry?.args);
    post({ type: "refetch-end", domain: request.domain, scope, written });

    return written;
  } catch (err) {
    const { isAuth, message } = classifyError(err);
    post({
      type: isAuth ? "auth-error" : "sync-error",
      domain: request.domain,
      scope,
      message,
    });
    // The HTTP write has already succeeded when callers reach this path. Rejecting is deliberate:
    // resolving 0 lets a mutation UI report success while its cache stays stale and its controls
    // are disabled by the recorded domain error.
    throw err;
  }
}

function refetchOne(request: {
  domain: string;
  pk: Record<string, unknown>;
}): Promise<number> {
  const scope = cacheScopeKey(request.pk);
  const queueKey = `${request.domain}:${scope}`;
  const previous = refetchQueues.get(queueKey) ?? Promise.resolve();
  // Same-scope reads must preserve call order: an older HTTP response must never land after a
  // newer one and prune the newer cache state. Independent PK scopes remain concurrent.
  const operation = runSharedDomainOperation(
    request.domain,
    () => previous.then(() => runTargetedRefetch(request, scope)),
  );
  const tail = operation.then(() => undefined, () => undefined);
  refetchQueues.set(queueKey, tail);

  return operation.finally(() => {
    if(refetchQueues.get(queueKey) === tail) {refetchQueues.delete(queueKey);}
  });
}

function syncDomainNow(domain: string): Promise<number> {
  const entry = active.find((candidate) => candidate.name === domain) ?? { name: domain };

  // Forced/manual work must propagate failure. A timestamp records an attempt for throttling; it is
  // never evidence that the snapshot succeeded.
  return runDomain(entry, true, true);
}

expose({
  start,
  syncNow: () => tick(true, true),
  syncDomainNow,
  refetchOne,
  setDomains,
  stop,
  domains: () => registeredDomainNames(),
} satisfies SyncHarness);
