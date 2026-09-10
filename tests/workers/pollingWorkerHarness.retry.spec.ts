/* eslint-disable require-await -- mocked async boundaries intentionally match worker/cache contracts */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  completedDomains: new Set<string>(),
  exposed: null as any,
  postMessage: vi.fn(),
}));

vi.mock("comlink", () => ({
  expose: (api: any) => { state.exposed = api; },
}));

vi.mock("@/utils/appCacheDb", () => ({
  ensureCacheReady: vi.fn(async () => undefined),
  hasSyncedThisLogin: vi.fn(async (domain: string) => state.completedDomains.has(domain)),
}));

vi.mock("@/utils/pollingTokenChannel", () => ({
  subscribeToken: vi.fn(),
}));

let registerSyncDomain: typeof import("@/workers/syncRegistry").registerSyncDomain;

beforeAll(async () => {
  vi.stubGlobal("self", { postMessage: state.postMessage });
  ({ registerSyncDomain } = await import("@/workers/syncRegistry"));
  await import("@/workers/pollingWorkerHarness");
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  state.completedDomains.clear();
  state.postMessage.mockClear();
});

afterEach(() => {
  state.exposed?.stop();
  vi.useRealTimers();
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("polling worker one-shot retries", () => {
  it("retries a no-cadence domain after its first attempt throws", async () => {
    const sync = vi.fn()
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockImplementationOnce(async () => {
        state.completedDomains.add("retry-after-error");

        return 0;
      });
    registerSyncDomain({ name: "retry-after-error", sync });

    await state.exposed.start({
      maargUrl: "https://example.test",
      token: "token",
      baseTickMs: 100,
      domains: [{ name: "retry-after-error" }],
    });
    expect(sync).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(100);

    expect(sync).toHaveBeenCalledTimes(2);
  });

  it("retries a no-cadence domain that refuses its first snapshot", async () => {
    const sync = vi.fn()
      .mockResolvedValueOnce(0)
      .mockImplementationOnce(async () => {
        state.completedDomains.add("retry-after-refusal");

        return 0;
      });
    registerSyncDomain({ name: "retry-after-refusal", sync });

    await state.exposed.start({
      maargUrl: "https://example.test",
      token: "token",
      baseTickMs: 100,
      domains: [{ name: "retry-after-refusal" }],
    });
    expect(sync).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(100);

    expect(sync).toHaveBeenCalledTimes(2);
  });
});
