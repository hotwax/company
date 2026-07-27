import { expose } from "comlink";
import { ensureCacheReady } from "@/utils/appCacheDb";
import { subscribeToken } from "@/utils/pollingTokenChannel";
import {
  type ActiveDomain,
  type SyncContext,
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

async function runDomain(entry: ActiveDomain, force = false): Promise<void> {
  const domain = getSyncDomain(entry.name);
  if (!domain) {
    post({ type: "sync-error", domain: entry.name, message: `unregistered domain "${entry.name}"` });
    return;
  }
  post({ type: "sync-start", domain: entry.name });
  try {
    const written = await domain.sync(ctx, entry.args, { force });
    lastRunAt[entry.name] = Date.now();
    post({ type: "sync-end", domain: entry.name, written, at: lastRunAt[entry.name] });
  } catch (err) {
    // Record the attempt so one failing domain can't spin every base tick.
    lastRunAt[entry.name] = Date.now();
    const { isAuth, message } = classifyError(err);
    post({ type: isAuth ? "auth-error" : "sync-error", domain: entry.name, message });
  }
}

async function tick(force = false): Promise<void> {
  if (running || !ctx.token) return; // don't overlap; wait until start() supplies a token
  running = true;
  try {
    const now = Date.now();
    const due = force
      ? active
      : dueDomains(active, lastRunAt, now, (entry) => effectiveInterval(entry, getSyncDomain(entry.name)));
    // Sequential: these share one thread and one backend; parallel bursts buy nothing here.
    for (const entry of due) await runDomain(entry, force);
  } finally {
    running = false;
  }
}

function stop(): void {
  if (timer) {
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
    post({ type: "sync-error", message: `cache open failed: ${(err as any)?.message ?? err}` });
    return;
  }
  for (const key of Object.keys(lastRunAt)) delete lastRunAt[key];
  await tick(); // immediate first pass (seeds the cache for every activated domain)
  timer = setInterval(() => void tick(), baseTickMs);
}

function setDomains(domains: ActiveDomain[]): void {
  active = domains ?? [];
  // Drop run history for domains no longer active so re-activation bootstraps again.
  const names = new Set(active.map((entry) => entry.name));
  for (const key of Object.keys(lastRunAt)) if (!names.has(key)) delete lastRunAt[key];
}

async function refetchOne(request: { domain: string; pk: Record<string, unknown> }): Promise<number> {
  const domain = getSyncDomain(request.domain);
  if (!domain?.refetchOne) {
    post({ type: "sync-error", domain: request.domain, message: "domain has no refetchOne" });
    return 0;
  }
  const entry = active.find((candidate) => candidate.name === request.domain);
  try {
    const written = await domain.refetchOne(ctx, request.pk, entry?.args);
    post({ type: "refetch-end", domain: request.domain, written });
    return written;
  } catch (err) {
    const { isAuth, message } = classifyError(err);
    post({ type: isAuth ? "auth-error" : "sync-error", domain: request.domain, message });
    return 0;
  }
}

async function syncDomainNow(domain: string): Promise<number> {
  const entry = active.find((candidate) => candidate.name === domain) ?? { name: domain };
  await runDomain(entry, true);
  return lastRunAt[domain] ? 1 : 0;
}

expose({
  start,
  syncNow: () => tick(true),
  syncDomainNow,
  refetchOne,
  setDomains,
  stop,
  domains: () => registeredDomainNames(),
} satisfies SyncHarness);
