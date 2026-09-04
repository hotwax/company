import { describe, expect, it, vi } from "vitest";

/**
 * A response body that fails to parse must NOT be reported as "no records".
 *
 * "No records" flows straight into `snapshotReplace`, which prunes everything the fetch did not
 * return — so misclassifying a soft failure as an empty collection empties the table, and
 * `assertWrote(0, 0)` then marks the domain synced so nothing retries it for the rest of the login.
 *
 * Only a genuinely EMPTY body is a real empty result (some endpoints answer 200 with zero bytes,
 * e.g. `oms/facilityGroups/types` on an instance with no group types).
 */
const transport = vi.hoisted(() => ({ body: "" }));

vi.mock("@common/core/workerRemoteApi", () => ({
  default: async () => JSON.parse(transport.body),
}));

const ctx = { maargUrl: "https://x.test/", token: "t" };

describe("workerGet body handling", () => {
  it("treats a zero-byte body as an empty result", async () => {
    const { workerGet } = await import("@/workers/domains/workerFetch");
    transport.body = "";
    await expect(workerGet(ctx, "oms/facilityGroups/types", {})).resolves.toBeNull();
  });

  it("rethrows a gateway HTML error page instead of reporting no records", async () => {
    const { workerGet } = await import("@/workers/domains/workerFetch");
    transport.body = "<html><body>502 Bad Gateway</body></html>";
    await expect(workerGet(ctx, "admin/productStores", {})).rejects.toThrow();
  });

  it("rethrows a truncated JSON body", async () => {
    const { workerGet } = await import("@/workers/domains/workerFetch");
    transport.body = '{"productStoreId":"STORE"';
    await expect(workerGet(ctx, "admin/productStores", {})).rejects.toThrow();
  });

  it("rethrows a plain-text error body", async () => {
    const { workerGet } = await import("@/workers/domains/workerFetch");
    transport.body = "Service Unavailable";
    await expect(workerGet(ctx, "admin/productStores", {})).rejects.toThrow();
  });

  it("still returns a genuinely empty collection unchanged", async () => {
    const { workerGet, unwrapCollection } = await import("@/workers/domains/workerFetch");
    transport.body = "[]";
    const resp = await workerGet(ctx, "admin/productStores", {});
    expect(unwrapCollection(resp, null)).toEqual([]);
  });
});

describe("strict collection response handling", () => {
  it.each([
    ["payload-level error", "{\"_ERROR_MESSAGE_\":\"permission denied\"}"],
    ["unsupported object envelope", "{\"entityValueList\":[]}"],
    ["null body", "null"],
  ])("rejects a %s instead of treating it as an empty bare-array snapshot", async (_label, body) => {
    const { pageAll } = await import("@/workers/domains/workerFetch");
    transport.body = body;

    await expect(pageAll({
      ctx,
      url: "oms/shippingGateways/carrierParties",
      collectionKey: null,
      strictCollection: true,
      label: "carrier",
    })).rejects.toThrow(/carrier.*bare array/i);
  });

  it("still accepts the explicitly supported bare-array shape", async () => {
    const { pageAll } = await import("@/workers/domains/workerFetch");
    transport.body = "[{\"partyId\":\"FEDEX\"}]";

    await expect(pageAll({
      ctx,
      url: "oms/shippingGateways/carrierParties",
      collectionKey: null,
      strictCollection: true,
      label: "carrier",
    })).resolves.toEqual([{ partyId: "FEDEX" }]);
  });
});
