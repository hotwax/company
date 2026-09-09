import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Every seed domain Company registers must carry a real fetch target.
 *
 * `SEED_DOMAINS[table]` is an ENTRY — `{ name, label, source }` — and only its `source` holds the
 * fetch config (`listUrl`, `collectionKey`, `fanOut`, …). Handing the whole entry to
 * `registerCompanySeedDomains`, which spreads it into `registerSnapshotDomain`, produces a config
 * whose `listUrl` is `undefined` and whose `source` is a stray nested object: the domain registers,
 * appears in every completeness check, and then pages against `undefined` forever. This asserts the
 * config the factory actually receives, not the registry's post-registration name list, because a
 * name list cannot tell a working domain from a URL-less one.
 */
const configs = vi.hoisted(() => [] as any[]);

vi.mock("@common/db/sync/snapshotDomain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@common/db/sync/snapshotDomain")>();
  return {
    ...actual,
    registerSnapshotDomain: (config: any, getDb?: any) => {
      configs.push(config);
      return actual.registerSnapshotDomain(config, getDb);
    },
  };
});

describe("company seed domain registration", () => {
  beforeAll(async () => {
    configs.length = 0;
    await import("@/workers/domains/seedRegistrations");
  });

  it("registers at least one seed domain", () => {
    expect(configs.length).toBeGreaterThan(0);
  });

  it("gives every seed domain a fetch target", () => {
    const targetless = configs
      .filter((config) => !config.listUrl && !config.fanOut)
      .map((config) => config.name);

    expect(targetless).toEqual([]);
  });

  it("passes the source's fetch config, not the seed entry that wraps it", () => {
    // A nested `source` on the config is the fingerprint of spreading the entry wrapper.
    const leaked = configs
      .filter((config) => "source" in config)
      .map((config) => config.name);

    expect(leaked).toEqual([]);
  });
});
