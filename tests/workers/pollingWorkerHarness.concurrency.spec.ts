import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

interface ExposedHarness {
  start: (payload: Record<string, unknown>) => Promise<void>;
  syncNow: () => Promise<void>;
  stop: () => void;
}

const harnessState = vi.hoisted(() => ({
  exposed: undefined as ExposedHarness | undefined,
  messages: [] as Array<Record<string, unknown>>,
  domains: {} as Record<string, { sync: () => Promise<number>; intervalMs?: number }>,
}));

vi.mock("comlink", () => ({
  expose: (harness: ExposedHarness) => { harnessState.exposed = harness; },
}));

vi.mock("@/utils/appCacheDb", () => ({
  ensureCacheReady: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/utils/pollingTokenChannel", () => ({
  subscribeToken: vi.fn(),
}));

vi.mock("@/workers/syncRegistry", () => ({
  activationKey: (entry: { name: string }) => entry.name,
  dueDomains: (active: Array<{ name: string }>) => active,
  effectiveInterval: (entry: { name: string }) => harnessState.domains[entry.name]?.intervalMs,
  getSyncDomain: (name: string) => harnessState.domains[name],
  registeredDomainNames: () => Object.keys(harnessState.domains),
}));

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });

  return { promise, resolve };
}

async function loadHarness(): Promise<ExposedHarness> {
  vi.resetModules();
  await import("@/workers/pollingWorkerHarness");
  if(!harnessState.exposed) {throw new Error("worker harness was not exposed");}

  return harnessState.exposed;
}

describe("polling worker tick concurrency", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    harnessState.exposed = undefined;
    harnessState.messages = [];
    harnessState.domains = {};
    vi.stubGlobal("self", {
      postMessage: (message: Record<string, unknown>) => { harnessState.messages.push(message); },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("queues and coalesces forced refreshes behind an in-flight scheduled tick", async () => {
    const initial = deferred<number>();
    const forced = deferred<number>();
    let calls = 0;
    harnessState.domains.live = {
      intervalMs: 10_000,
      sync: vi.fn(() => {
        calls += 1;

        return calls === 1 ? initial.promise : forced.promise;
      }),
    };
    const harness = await loadHarness();
    const start = harness.start({
      maargUrl: "https://example.test",
      token: "token",
      baseTickMs: 60_000,
      domains: [{ name: "live" }],
    });
    for(let microtask = 0; microtask < 5 && calls === 0; microtask += 1) {
      await Promise.resolve();
    }
    expect(calls).toBe(1);

    let firstRefreshDone = false;
    let secondRefreshDone = false;
    const firstRefresh = harness.syncNow().then(() => { firstRefreshDone = true; });
    const secondRefresh = harness.syncNow().then(() => { secondRefreshDone = true; });

    expect(calls).toBe(1);
    expect(firstRefreshDone).toBe(false);
    expect(secondRefreshDone).toBe(false);

    initial.resolve(1);
    await start;
    await vi.advanceTimersByTimeAsync(0);

    expect(calls).toBe(2);
    expect(firstRefreshDone).toBe(false);
    expect(secondRefreshDone).toBe(false);

    forced.resolve(1);
    await Promise.all([firstRefresh, secondRefresh]);

    expect(calls).toBe(2);
    expect(firstRefreshDone).toBe(true);
    expect(secondRefreshDone).toBe(true);
    harness.stop();
  });

  it("posts one cycle boundary around every domain in a tick", async () => {
    harnessState.domains.first = { sync: vi.fn(() => Promise.resolve(2)) };
    harnessState.domains.second = { sync: vi.fn(() => Promise.resolve(3)) };
    const harness = await loadHarness();

    await harness.start({
      maargUrl: "https://example.test",
      token: "token",
      baseTickMs: 60_000,
      domains: [{ name: "first" }, { name: "second" }],
    });

    expect(harnessState.messages.map(({ type }) => type)).toEqual([
      "sync-cycle-start",
      "sync-start",
      "sync-end",
      "sync-start",
      "sync-end",
      "sync-cycle-end",
    ]);
    expect(harnessState.messages[0]).toMatchObject({
      domains: ["first", "second"],
      force: false,
    });
    harness.stop();
  });
});
