import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ api: vi.fn() }));

vi.mock("@common", () => ({
  api: (...args: any[]) => mocks.api(...args),
  commonUtil: { hasError: () => false, showToast: vi.fn() },
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  translate: (value: string) => value,
}));

import { clearSessionScopedState } from "@/composables/sessionScope";
import { useServiceJob } from "@/composables/useServiceJobs";

const storeBoundJob = { jobName: "sync_ShopifyProductUpdates_100002", serviceJobParameters: [{ parameterName: "productStoreIds", parameterValue: "STORE" }] };

describe("fetchJobDetail", () => {
  beforeEach(() => {
    mocks.api.mockReset();
    mocks.api.mockResolvedValue({ data: { jobDetail: storeBoundJob } });
  });

  it("returns a store-bound job as it is when no store is asked about, as the job modal does", async () => {
    expect((await useServiceJob().fetchJobDetail(storeBoundJob.jobName)).jobName).toBe(storeBoundJob.jobName);
  });

  it("still refuses a store-bound job for another store, and accepts it for its own", async () => {
    const { fetchJobDetail } = useServiceJob();

    await expect(fetchJobDetail(storeBoundJob.jobName, "STORE_UK")).rejects.toThrow(/unavailable/);
    expect((await fetchJobDetail(storeBoundJob.jobName, "STORE")).jobName).toBe(storeBoundJob.jobName);
  });

  it("does not hand an unscoped read the answer to a concurrent scoped one", async () => {
    const { fetchJobDetail } = useServiceJob();
    const [scoped, unscoped] = await Promise.allSettled([fetchJobDetail(storeBoundJob.jobName, "STORE_UK"), fetchJobDetail(storeBoundJob.jobName)]);

    expect(scoped.status).toBe("rejected");
    expect(unscoped.status).toBe("fulfilled");
    expect(mocks.api).toHaveBeenCalledTimes(2);
  });
});

describe("fetchUsernames", () => {
  beforeEach(() => {
    clearSessionScopedState();
    mocks.api.mockReset();
  });

  it("asks once per user per session, and keeps an unreadable user as its id", async () => {
    mocks.api.mockImplementation(({ url }: { url: string }) => (url.endsWith("/100002")
      ? Promise.resolve({ data: { userId: "100002", username: "aditya.patel" } })
      : Promise.reject(new Error("404"))));
    const { fetchUsernames } = useServiceJob();

    expect(await fetchUsernames(["100002", "100002", "_NA_"])).toEqual({ 100002: "aditya.patel", _NA_: "_NA_" });
    await fetchUsernames(["100002"]);
    expect(mocks.api.mock.calls.filter(([request]) => request.url.endsWith("/100002"))).toHaveLength(1);

    clearSessionScopedState();
    await fetchUsernames(["100002"]);
    expect(mocks.api.mock.calls.filter(([request]) => request.url.endsWith("/100002"))).toHaveLength(2);
  });
});
