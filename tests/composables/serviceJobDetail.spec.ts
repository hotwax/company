import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ api: vi.fn() }));

vi.mock("@common", () => ({
  api: (...args: any[]) => mocks.api(...args),
  commonUtil: { hasError: () => false, showToast: vi.fn() },
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  translate: (value: string) => value,
}));

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
