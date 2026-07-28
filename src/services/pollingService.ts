import type { Remote } from "comlink";
import { commonUtil } from "@common";
import { WorkerFactory } from "@common/core/workerFactory";
import { createTokenPublisher } from "@/utils/pollingTokenChannel";
import { deleteLegacyCaches } from "@/utils/appCacheDb";
import type { ActiveDomain } from "@/workers/syncRegistry";
import type { SyncHarness } from "@/workers/pollingWorkerHarness";

/**
 * Main-thread half of the sync service (app-local; promotes to `@common/core`).
 *
 * Framework-owned so no single app dev can break the dangerous parts:
 *   - spawns + terminates the single sync worker (via the existing `WorkerFactory`);
 *   - hands the worker the current token at start, then keeps it fresh by PUSH over
 *     BroadcastChannel — the push is event-driven, never in the worker's per-tick hot path;
 *   - routes the worker's `auth-error` to the app's re-auth hook.
 *
 * The worker owns its own cadence, so nothing here gates the sync loop.
 */
export interface SyncServiceOptions {
  /** Domains to activate, with per-activation args. */
  domains: ActiveDomain[];
  /** How often the worker re-evaluates which domains are due (default 5s). */
  baseTickMs?: number;
  /** Status messages the worker posts: sync-start | sync-end | sync-error | auth-error | refetch-end. */
  onStatus?: (status: Record<string, any>) => void;
  /** Called when the worker reports an auth failure; wire to the app's re-auth/logout. */
  onAuthError?: (message: string) => void;
  /**
   * App-local token-change watcher cadence. A tiny main-thread check that re-broadcasts the
   * token when it rotates. NOT the sync loop (that lives in the worker). On promotion to
   * `@common` this is replaced by an auth-layer rotation event and removed.
   */
  tokenWatchMs?: number;
}

export interface SyncService {
  start: () => Promise<void>;
  /** Force every activated domain to run now. */
  syncNow: () => Promise<void>;
  /** Change the activated domain set without respawning the worker. */
  setDomains: (domains: ActiveDomain[]) => Promise<void>;
  /** Force one domain to re-sync now. */
  syncDomainNow: (domain: string) => Promise<number>;
  /** After a successful mutation: refetch that record by PK and upsert it into the cache. */
  refetchOne: (domain: string, pk: Record<string, unknown>) => Promise<number>;
  /** Diagnostics: domains this worker build knows about. */
  registeredDomains: () => Promise<string[]>;
  stop: () => void;
}

export function createSyncService(opts: SyncServiceOptions): SyncService {
  let harness: Remote<SyncHarness> | null = null;
  let terminate: (() => void) | null = null;
  let publisher: ReturnType<typeof createTokenPublisher> | null = null;
  let tokenWatch: ReturnType<typeof setInterval> | null = null;
  let lastToken = "";

  function pushTokenIfChanged() {
    const current = commonUtil.getToken() || "";
    if (current && current !== lastToken) {
      lastToken = current;
      publisher?.publish(current);
    }
  }

  function handleMessage(event: MessageEvent) {
    const data = event.data || {};
    if (data.type === "auth-error") {
      pushTokenIfChanged(); // token may have just rotated — push the latest at once
      opts.onAuthError?.(String(data.message ?? "auth error"));
    }
    opts.onStatus?.(data);
  }

  async function start() {
    // Best-effort: drop the superseded single-purpose cache DB from before CompanyCacheDB.
    void deleteLegacyCaches();

    // Construct the Worker here (not inside WorkerFactory) so Vite's worker transform can
    // statically analyze `new Worker(new URL(...))` and emit a real chunk. Passing a URL through
    // a factory hides it from Vite, which then inlines the worker as a `data:video/mp2t` asset.
    const appSyncWorker = new Worker(
      new URL("../workers/appSync.worker.ts", import.meta.url),
      { type: "module" },
    );
    const { api, terminate: term, worker } = WorkerFactory.fromWorker<SyncHarness>(
      appSyncWorker,
      "appSync.worker.ts",
    );
    harness = api;
    terminate = term;
    worker.onmessage = handleMessage;

    publisher = createTokenPublisher();
    lastToken = commonUtil.getToken() || "";

    await api.start({
      maargUrl: commonUtil.getMaargURL(),
      token: lastToken,
      baseTickMs: opts.baseTickMs,
      domains: opts.domains,
    });

    tokenWatch = setInterval(pushTokenIfChanged, opts.tokenWatchMs ?? 15_000);
  }

  return {
    start,
    syncNow: async () => { if (harness) await harness.syncNow(); },
    syncDomainNow: async (domain) => (harness ? harness.syncDomainNow(domain) : 0),
    setDomains: async (domains) => { if (harness) await harness.setDomains(domains); },
    refetchOne: async (domain, pk) => (harness ? harness.refetchOne({ domain, pk }) : 0),
    registeredDomains: async () => (harness ? harness.domains() : []),
    stop: () => {
      if (tokenWatch) { clearInterval(tokenWatch); tokenWatch = null; }
      if (publisher) { publisher.close(); publisher = null; }
      if (terminate) { terminate(); terminate = null; } // kills the worker + its timer
      harness = null;
    },
  };
}
