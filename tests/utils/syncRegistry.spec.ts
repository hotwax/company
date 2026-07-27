import { describe, expect, it } from "vitest";
import {
  type ActiveDomain,
  type SyncDomain,
  dueDomains,
  effectiveInterval,
} from "@/workers/syncRegistry";

const NOW = 1_700_000_000_000;

// Class A = cadenced (live, append-mostly). Class B = no cadence (reference/config).
const CLASS_A: SyncDomain = { name: "dataManagerLog", intervalMs: 10_000, sync: async () => 0 };
const CLASS_B: SyncDomain = { name: "productStore", sync: async () => 0 };

const intervalFor = (domains: Record<string, SyncDomain>) => (active: ActiveDomain) =>
  effectiveInterval(active, domains[active.name]);

describe("effectiveInterval", () => {
  it("prefers the activation override over the domain default", () => {
    expect(effectiveInterval({ name: "dataManagerLog", intervalMs: 30_000 }, CLASS_A)).toBe(30_000);
  });

  it("falls back to the domain default", () => {
    expect(effectiveInterval({ name: "dataManagerLog" }, CLASS_A)).toBe(10_000);
  });

  it("is undefined for a class-B domain with no override", () => {
    expect(effectiveInterval({ name: "productStore" }, CLASS_B)).toBeUndefined();
  });
});

describe("dueDomains", () => {
  const registry = { dataManagerLog: CLASS_A, productStore: CLASS_B };
  const lookup = intervalFor(registry);

  it("runs a cadenced domain immediately on first activation", () => {
    const due = dueDomains([{ name: "dataManagerLog" }], {}, NOW, lookup);
    expect(due.map((d) => d.name)).toEqual(["dataManagerLog"]);
  });

  it("does not run a cadenced domain again before its interval elapses", () => {
    const lastRunAt = { dataManagerLog: NOW - 4_000 };
    expect(dueDomains([{ name: "dataManagerLog" }], lastRunAt, NOW, lookup)).toEqual([]);
  });

  it("runs a cadenced domain once the interval has elapsed", () => {
    const lastRunAt = { dataManagerLog: NOW - 10_000 };
    const due = dueDomains([{ name: "dataManagerLog" }], lastRunAt, NOW, lookup);
    expect(due.map((d) => d.name)).toEqual(["dataManagerLog"]);
  });

  it("bootstraps a class-B domain exactly once, then never on cadence", () => {
    const active = [{ name: "productStore" }];
    expect(dueDomains(active, {}, NOW, lookup).map((d) => d.name)).toEqual(["productStore"]);

    // After its bootstrap run it must never come due again on a tick — class B is
    // mutation-driven, not interval-driven.
    const afterBootstrap = { productStore: NOW - 60 * 60 * 1000 };
    expect(dueDomains(active, afterBootstrap, NOW, lookup)).toEqual([]);
  });

  it("honors a per-activation interval override", () => {
    const active = [{ name: "dataManagerLog", intervalMs: 30_000 }];
    const lastRunAt = { dataManagerLog: NOW - 15_000 };
    // Not due at 15s when overridden to 30s, even though the default is 10s.
    expect(dueDomains(active, lastRunAt, NOW, lookup)).toEqual([]);
    expect(dueDomains(active, { dataManagerLog: NOW - 30_000 }, NOW, lookup)).toHaveLength(1);
  });

  it("evaluates each domain independently in a mixed activation", () => {
    const active = [{ name: "dataManagerLog" }, { name: "productStore" }];
    const lastRunAt = { dataManagerLog: NOW - 10_000, productStore: NOW - 10_000 };
    // Class A is due again; class B already bootstrapped and stays put.
    expect(dueDomains(active, lastRunAt, NOW, lookup).map((d) => d.name)).toEqual(["dataManagerLog"]);
  });
});
