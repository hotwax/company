import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ api: vi.fn() }));

vi.mock("@common", () => ({
  api: (...args: any[]) => harness.api(...args),
  commonUtil: { hasError: (resp: any) => Boolean(resp?.data?.errors), showToast: vi.fn() },
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  translate: (value: string, params: Record<string, unknown> = {}) => Object.entries(params)
    .reduce((text, [name, param]) => text.replace(`{${name}}`, String(param)), value),
  useProducts: () => ({ products: { value: new Map() }, resolve: vi.fn(), reset: vi.fn() }),
}));

vi.mock("@/services/appCacheBootstrap", () => ({
  refreshAfterMutation: vi.fn(),
  resyncDomain: vi.fn(),
  bootstrapState: { running: false },
}));

vi.mock("@/composables/useCachedList", () => ({
  useCachedList: () => ({ rows: { value: [] }, records: { value: [] }, hydrated: { value: true } }),
  useCachedRecord: () => ({ record: { value: undefined }, hydrated: { value: true } }),
  byDescription: () => 0,
}));

import { clearSessionScopedState } from "@/composables/sessionScope";
import { useInventoryEventSources } from "@/composables/useShopify";

/** A cycle count resolves through one call to `varianceDecisions`, so it is the cheapest probe. */
const countLookup = (eventReferenceId = "PI_1") => ({
  eventTypeId: "CYCLE_COUNT",
  eventReferenceId,
  productId: "P1",
  facilityIds: ["FAC_1"],
});

/** A receipt needs the facility walk, which is what the cold-cache case turns on. */
const receiptLookup = (facilityIds: string[]) => ({
  eventTypeId: "RECEIPT",
  eventReferenceId: "R_1",
  productId: "P1",
  facilityIds,
});

const decisionRow = (workEffortName: string) => ({
  data: [{ workEffortId: "WE_1", workEffortName, decidedByUserLoginId: "mfadmin" }],
});

describe("useInventoryEventSources — asking once, retrying only when it helps", () => {
  beforeEach(() => {
    harness.api.mockReset();
    clearSessionScopedState();
  });

  it("resolves a source once and does not ask again on a later pass", async () => {
    harness.api.mockResolvedValue(decisionRow("Weekly count"));
    const { sources, resolve, sourceKeyOf } = useInventoryEventSources();

    await resolve([countLookup()]);
    const calls = harness.api.mock.calls.length;
    await resolve([countLookup()]);

    expect(sources.value.get(sourceKeyOf("CYCLE_COUNT", "PI_1"))?.label).toContain("Weekly count");
    expect(harness.api.mock.calls.length).toBe(calls);
  });

  /**
   * The retry storm: the caller re-fires on every ten-second cache tick, and an unconditional
   * un-mark on failure turned an endpoint this OMS does not expose into one request per tick forever.
   */
  it("stops retrying a lookup that keeps failing, and says so on the row", async () => {
    harness.api.mockRejectedValue(new Error("404"));
    const { sources, resolve, sourceKeyOf } = useInventoryEventSources();

    for(let tick = 0; tick < 8; tick += 1) {
      await resolve([countLookup()]);
    }

    // Three attempts, then the page stops asking — not one per tick for the life of the session.
    expect(harness.api.mock.calls.length).toBe(3);
    expect(harness.api.mock.calls.every(([args]: any[]) => String(args?.url).includes("varianceDecisions"))).toBe(true);
    expect(sources.value.get(sourceKeyOf("CYCLE_COUNT", "PI_1"))?.unresolved)
      .toContain("no longer being retried");
  });

  it("retries a transient failure rather than marking the row permanently unresolvable", async () => {
    harness.api
      .mockRejectedValueOnce(new Error("blip"))
      .mockResolvedValue(decisionRow("Weekly count"));
    const { sources, resolve, sourceKeyOf } = useInventoryEventSources();

    await resolve([countLookup()]);
    await resolve([countLookup()]);

    expect(sources.value.get(sourceKeyOf("CYCLE_COUNT", "PI_1"))?.label).toContain("Weekly count");
  });

  /**
   * A row opened before the facility-group cache hydrates used to keep "no cached member facilities"
   * for the rest of the session, because a RETURNED unresolved was never re-asked.
   */
  it("re-asks a cache-dependent answer once the cache it needed is warm", async () => {
    const { sources, resolve, sourceKeyOf } = useInventoryEventSources();
    const key = sourceKeyOf("RECEIPT", "R_1");

    await resolve([receiptLookup([])], { fanOut: true });
    expect(sources.value.get(key)?.unresolved).toContain("no cached member facilities");
    expect(harness.api).not.toHaveBeenCalled();

    harness.api.mockResolvedValue({ data: [{ orderId: "SO_1", orderName: "SO-10042" }] });
    await resolve([receiptLookup(["FAC_1"])], { fanOut: true });

    expect(sources.value.get(key)?.label).toContain("SO-10042");
  });

  it("does not re-queue keys a concurrent pass is already resolving", async () => {
    let release: (value: unknown) => void = () => {};
    harness.api.mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));
    const { resolve } = useInventoryEventSources();

    const first = resolve([countLookup()]);
    // A scroll or a cache tick lands while the first pass is still awaiting.
    await resolve([countLookup()]);
    release(decisionRow("Weekly count"));
    await first;

    // One decision lookup, not two. (The operator-name call is a separate endpoint.)
    const decisionCalls = harness.api.mock.calls
      .filter(([args]: any[]) => String(args?.url).includes("varianceDecisions"));
    expect(decisionCalls.length).toBe(1);
  });

  it("resolves independent lookups concurrently instead of one round trip at a time", async () => {
    let inFlight = 0;
    let peak = 0;
    harness.api.mockImplementation(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight -= 1;

      return decisionRow("Weekly count");
    });
    const { resolve } = useInventoryEventSources();

    await resolve(Array.from({ length: 4 }, (_, index) => countLookup(`PI_${index}`)));

    expect(peak).toBeGreaterThan(1);
  });
});
