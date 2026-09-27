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

const JOB = "sync_ShopifyProductUpdates_100002";
beforeEach(() => {
  clearSessionScopedState();
  mocks.api.mockReset();
});

describe("useServiceJob", () => {
  it("returns a store-bound job unscoped (the job modal's read), but still refuses it for another store", async () => {
    mocks.api.mockResolvedValue({ data: { jobDetail: { jobName: JOB, serviceJobParameters: [{ parameterName: "productStoreIds", parameterValue: "STORE" }] } } });
    const { fetchJobDetail } = useServiceJob();
    // Concurrent on purpose: an unscoped read must not be handed the answer to a scoped one.
    const [unscoped, other] = await Promise.allSettled([fetchJobDetail(JOB), fetchJobDetail(JOB, "STORE_UK")]);

    expect(unscoped).toMatchObject({ status: "fulfilled", value: { jobName: JOB } });
    expect(other.status).toBe("rejected");
    expect((await fetchJobDetail(JOB, "STORE")).jobName).toBe(JOB);
  });

  it("asks for each username once per session, and keeps an unreadable user as its id", async () => {
    mocks.api.mockImplementation(({ url }: { url: string }) => (url.endsWith("/100002")
      ? Promise.resolve({ data: { username: "aditya.patel" } }) : Promise.reject(new Error("404"))));
    const { fetchUsernames } = useServiceJob();
    const lookups = () => mocks.api.mock.calls.filter(([request]) => request.url.endsWith("/100002")).length;

    expect(await fetchUsernames(["100002", "100002", "_NA_"])).toEqual({ 100002: "aditya.patel", _NA_: "_NA_" });
    await fetchUsernames(["100002"]);
    expect(lookups()).toBe(1);
    clearSessionScopedState();
    await fetchUsernames(["100002"]);
    expect(lookups()).toBe(2);
  });
});
