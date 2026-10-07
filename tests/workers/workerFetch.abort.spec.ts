/* eslint-disable require-await -- the transport mock preserves the production async API */
import { describe, expect, it, vi } from "vitest";

/**
 * A walk the caller has abandoned must stop asking for pages. The transfer sync domain gives up on a
 * slow segment after a timeout; before the walk took a signal, it kept requesting page after page of
 * a query that cost the OMS ~30 seconds each, and threw every result away.
 */
const transport = vi.hoisted(() => ({ requests: [] as string[], onRequest: undefined as undefined | (() => void) }));

vi.mock("@common/core/workerRemoteApi", () => ({
  default: async ({ url }: { url: string }) => {
    transport.requests.push(url);
    transport.onRequest?.();
    const page = Number(new URLSearchParams(url.split("?")[1]).get("pageIndex"));

    // Two full pages, so an unaborted walk would go on to a third.
    return page < 2 ? [{ id: `${page}-a` }, { id: `${page}-b` }] : [];
  },
}));

const ctx = { maargUrl: "https://x.test/", token: "t" };

describe("pageAll abort", () => {
  it("requests no further page once its signal is aborted", async () => {
    const { pageAll } = await import("@/workers/domains/workerFetch");
    const controller = new AbortController();
    const reason = new Error("timed out");
    transport.requests = [];
    transport.onRequest = () => controller.abort(reason);

    await expect(pageAll({ ctx, url: "sob/x", batchSize: 2, signal: controller.signal })).rejects.toBe(reason);
    expect(transport.requests).toHaveLength(1);
  });

  it("walks every page when never aborted", async () => {
    const { pageAll } = await import("@/workers/domains/workerFetch");
    transport.requests = [];
    transport.onRequest = undefined;

    await expect(pageAll({ ctx, url: "sob/x", batchSize: 2, signal: new AbortController().signal }))
      .resolves.toHaveLength(4);
    expect(transport.requests).toHaveLength(3);
  });
});
