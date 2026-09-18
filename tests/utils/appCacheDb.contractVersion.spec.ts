import { beforeEach, describe, expect, it, vi } from "vitest";

/* eslint-disable require-await -- the Dexie fake deliberately implements an async API synchronously */

/**
 * A minimal in-memory Dexie. The identity check is bookkeeping over one table plus a whole-database
 * clear, which real IndexedDB is not needed to prove -- and faking it here avoids adding a
 * fake-indexeddb dependency for four assertions.
 */
vi.mock("dexie", () => {
  class FakeTable {
    rows = new Map<string, any>();
    private readonly keyField: string;

    constructor(spec: string) {
      // Dexie schema strings list the primary key first.
      this.keyField = spec.split(",")[0].trim();
    }

    async get(key: string) {return this.rows.get(key);}
    async put(row: any) {this.rows.set(String(row[this.keyField]), row);}
    async clear() {this.rows.clear();}
    async bulkDelete(keys: string[]) {keys.forEach((key) => this.rows.delete(key));}
    async toArray() {return [...this.rows.values()];}
    toCollection() {return { primaryKeys: async () => [...this.rows.keys()] };}
  }

  class FakeDexie {
    tables: FakeTable[] = [];
    private storeNames: string[] = [];
    private opened = false;

    version() {
      return {
        stores: (schema: Record<string, string>) => {
          for(const [name, spec] of Object.entries(schema)) {
            const table = new FakeTable(spec);
            this.tables.push(table);
            this.storeNames.push(name);
            (this as any)[name] = table;
          }
        },
      };
    }

    isOpen() {return this.opened;}
    async open() {
      this.opened = true;

      return this;
    }
    // Every declared store is present, so `schemaDrift()` reports none and cannot rebuild behind us.
    backendDB() {return { objectStoreNames: this.storeNames };}
    async delete() {this.tables.forEach((table) => table.clear()); this.opened = false;}
    static async delete() {}
  }

  return { default: FakeDexie, liveQuery: () => ({ subscribe: () => ({ unsubscribe() {} }) }) };
});

import { appCacheDb, ensureCacheIdentity } from "@/utils/appCacheDb";

const IDENTITY = "https://oms.example.com::user-1";

/** A ledger row as it was cached BEFORE the connector prefixed the vocabulary. */
const seedLegacyLedgerRow = async () => {
  await (appCacheDb as any).shopifyInventoryAdjustmentDetails.put({
    adjustmentKey: JSON.stringify(["RECEIPT", "R1", "IC_1", "ITEM_1"]),
    eventTypeId: "RECEIPT",
  });
};

const ledgerCount = async () =>
  (await (appCacheDb as any).shopifyInventoryAdjustmentDetails.toArray()).length;

const storedIdentity = async () =>
  (await (appCacheDb as any).syncMeta.get("identity"))?.identity;

describe("cache data-contract stamp", () => {
  beforeEach(async () => {
    for(const table of (appCacheDb as any).tables) {await table.clear();}
  });

  /**
   * The SIE_ rename in one test. An installation that cached rows under the old vocabulary carries
   * the pre-stamp identity; those rows key on `eventTypeId`, sync append-mostly with no snapshot
   * prune, and nothing else in the cache layer would ever remove them.
   */
  it("wipes an installation that predates the data-contract stamp", async () => {
    await (appCacheDb as any).syncMeta.put({ key: "identity", identity: IDENTITY, at: 1 });
    await seedLegacyLedgerRow();
    expect(await ledgerCount()).toBe(1);

    const wiped = await ensureCacheIdentity(IDENTITY);

    expect(wiped).toBe(true);
    expect(await ledgerCount()).toBe(0);
  });

  /**
   * A wipe on every load would re-sync ~30 domains each time the app starts, which is far worse
   * than the stale rows this is meant to clear.
   */
  it("wipes exactly once, not on every load", async () => {
    await ensureCacheIdentity(IDENTITY);
    await seedLegacyLedgerRow();

    expect(await ensureCacheIdentity(IDENTITY)).toBe(false);
    expect(await ensureCacheIdentity(IDENTITY)).toBe(false);
    // Rows cached after the one-time wipe survive.
    expect(await ledgerCount()).toBe(1);
  });

  /** The check's original job -- a different user or backend must still wipe. */
  it("still wipes when the user or the instance changes", async () => {
    await ensureCacheIdentity(IDENTITY);
    await seedLegacyLedgerRow();

    expect(await ensureCacheIdentity("https://oms.example.com::user-2")).toBe(true);
    expect(await ledgerCount()).toBe(0);
  });

  /** Without a version in the stored value, the NEXT contract change has nothing to compare. */
  it("stores the contract version alongside the identity", async () => {
    await ensureCacheIdentity(IDENTITY);

    const stored = await storedIdentity();
    expect(stored).not.toBe(IDENTITY);
    expect(stored).toMatch(/^v\d+::/);
    expect(stored).toContain(IDENTITY);
  });
});
