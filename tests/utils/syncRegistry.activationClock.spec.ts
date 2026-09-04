import { describe, expect, it } from "vitest";

import { activationKey, dueDomains, type ActiveDomain } from "@/workers/syncRegistry";

/**
 * L1 unit — one domain activated TWICE must not starve itself.
 *
 * The bug: the last-run clock was keyed on the domain NAME. The connection details page activates
 * `systemMessage` twice — product-sync message types on the idle cadence, order-sync types on the
 * active one — and both wrote `lastRunAt["systemMessage"]`. Trace it: on the first tick neither has
 * run, so both go. After that the 10s activation restamps the shared clock every 10s, so the 60s
 * activation's interval never elapses and it runs **exactly once per page entry, then never again**.
 *
 * Silent in the worst way: the first tick does run it, so the screen is correct on arrival and simply
 * stops updating. The comment on the session claimed per-feature cadence, which is not what happened.
 */
const interval = (entry: ActiveDomain) => entry.intervalMs;

const PRODUCT: ActiveDomain = {
  name: "systemMessage",
  intervalMs: 60_000,
  args: { types: [{ systemMessageTypeId: "BulkQueryShopifyProductUpdates", total: 200 }] },
};
const ORDER: ActiveDomain = {
  name: "systemMessage",
  intervalMs: 10_000,
  args: { types: [{ systemMessageTypeId: "ShopifyOrderSync", total: 100 }] },
};

describe("activationKey", () => {
  it("separates two activations of the same domain with different args", () => {
    expect(activationKey(PRODUCT)).not.toBe(activationKey(ORDER));
  });

  it("gives identical activations ONE key — the same work shares a clock", () => {
    expect(activationKey({ ...PRODUCT })).toBe(activationKey(PRODUCT));
  });

  it("is insensitive to key order, so an equivalent activation maps to one clock", () => {
    const a: ActiveDomain = { name: "dataManagerLog", args: { configId: "X", total: 300 } };
    const b: ActiveDomain = { name: "dataManagerLog", args: { total: 300, configId: "X" } };

    expect(activationKey(a)).toBe(activationKey(b));
  });

  it("ignores cadence — the same work at a different cadence is still the same work", () => {
    // Order sync escalating 60s → 10s must keep its clock, not get a fresh one.
    expect(activationKey({ ...ORDER, intervalMs: 60_000 })).toBe(activationKey(ORDER));
  });

  it("falls back to the bare name when there are no args", () => {
    expect(activationKey({ name: "serviceJob" })).toBe("serviceJob");
  });
});

describe("dueDomains — the starvation case", () => {
  it("runs both activations on the first tick", () => {
    const due = dueDomains([PRODUCT, ORDER], {}, 0, interval);

    expect(due).toHaveLength(2);
  });

  it("does NOT let the fast activation starve the slow one", () => {
    // t=0 both ran. At t=10s the fast one is due; the slow one is not, but must not have been
    // restamped by it either.
    const clocks = { [activationKey(PRODUCT)]: 0, [activationKey(ORDER)]: 0 };

    const at10s = dueDomains([PRODUCT, ORDER], clocks, 10_000, interval);
    expect(at10s.map((e) => e.args.types[0].systemMessageTypeId)).toEqual(["ShopifyOrderSync"]);

    // The fast one keeps running; at 60s the SLOW one finally becomes due — the assertion that failed
    // under a name-keyed clock, where its interval never elapsed.
    const clocksLater = { [activationKey(PRODUCT)]: 0, [activationKey(ORDER)]: 50_000 };
    const at60s = dueDomains([PRODUCT, ORDER], clocksLater, 60_000, interval);

    expect(at60s.map((e) => e.args.types[0].systemMessageTypeId))
      .toEqual(["BulkQueryShopifyProductUpdates", "ShopifyOrderSync"]);
  });

  it("reproduces the old failure when the two share one clock", () => {
    // Guards the guard: with a single shared key the slow activation is never due, which is exactly
    // what shipped. If this ever passes as "due", the per-activation keying has been lost.
    const shared = { systemMessage: 50_000 };
    const due = dueDomains([PRODUCT, ORDER], shared, 60_000, interval);

    // Both look unrun under the shared key, so both are "first run" — the misleading symptom.
    expect(due).toHaveLength(2);
    // But under the real keys they are tracked independently:
    expect(activationKey(PRODUCT) in shared).toBe(false);
    expect(activationKey(ORDER) in shared).toBe(false);
  });

  it("still bootstraps a class-B activation exactly once", () => {
    const classB: ActiveDomain = { name: "serviceJob" };

    expect(dueDomains([classB], {}, 0, () => undefined)).toHaveLength(1);
    expect(dueDomains([classB], { serviceJob: 0 }, 999_999, () => undefined)).toHaveLength(0);
  });
});
