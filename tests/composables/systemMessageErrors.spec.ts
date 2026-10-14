import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  refreshRecord: vi.fn(),
  errorCacheQuery: vi.fn(),
}));

vi.mock("@common", () => ({
  api: (...args: any[]) => mocks.api(...args),
  commonUtil: { hasError: () => false, showToast: vi.fn() },
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  translate: (value: string) => value,
}));

vi.mock("@/db/companyDb", () => ({
  companyDb: { tables: new Proxy({}, { get: (_target, table) => table }) as any,
    entity: (table: string) => {
      if (table === "systemMessageErrors") {
        return { query: (...args: any[]) => mocks.errorCacheQuery(...args) };
      }
      return { get: vi.fn(async () => undefined), query: vi.fn(async () => []) };
    },
  },
}));
vi.mock("@/services/appDbSync", () => ({ refreshRecord: (...args: any[]) => mocks.refreshRecord(...args) }));

import { clearSessionScopedState } from "@/composables/sessionScope";
import { systemMessageMayHaveErrors, useSystemMessage } from "@/composables/useSystemMessage";

beforeEach(() => {
  clearSessionScopedState();
  mocks.api.mockReset();
  mocks.refreshRecord.mockReset().mockResolvedValue(0);
  mocks.errorCacheQuery.mockReset().mockResolvedValue([]);
});

/**
 * L1 unit — the gate that removed the product sync history page's N+1.
 *
 * That page asked `admin/systemMessages/{id}/errors` once PER ROW on every entry, and every one of
 * those rows was a successful message with no errors. `SystemMessageError` rows are written on
 * failure, and the UI shows no error text for a successful row anyway, so the request could not
 * change what the user sees.
 *
 * The direction of the default matters: an unrecognised status must be treated as "might have
 * errors", so introducing a new failure status never silently hides a real error — it just costs a
 * request until someone lists it here.
 */
describe("systemMessageMayHaveErrors", () => {
  it("skips messages that reached a successful terminal status", () => {
    expect(systemMessageMayHaveErrors({ statusId: "SmsgConsumed" })).toBe(false);
    expect(systemMessageMayHaveErrors({ statusId: "SmsgConfirmed" })).toBe(false);
    expect(systemMessageMayHaveErrors({ statusId: "SmsgSent" })).toBe(false);
  });

  it("still asks for messages that failed", () => {
    expect(systemMessageMayHaveErrors({ statusId: "SmsgError" })).toBe(true);
    expect(systemMessageMayHaveErrors({ statusId: "SmsgRejected" })).toBe(true);
    expect(systemMessageMayHaveErrors({ statusId: "SmsgCancelled" })).toBe(true);
  });

  it("still asks for messages that are in flight", () => {
    expect(systemMessageMayHaveErrors({ statusId: "SmsgProduced" })).toBe(true);
  });

  it("defaults to asking when the status is unknown or missing", () => {
    // Fail-open: a status nobody listed must never silently suppress a real error.
    expect(systemMessageMayHaveErrors({ statusId: "SmsgSomeNewStatus" })).toBe(true);
    expect(systemMessageMayHaveErrors({})).toBe(true);
    expect(systemMessageMayHaveErrors(null)).toBe(true);
  });

  it("is case-insensitive, because the three sources spell statuses differently", () => {
    expect(systemMessageMayHaveErrors({ statusId: "smsgconsumed" })).toBe(false);
    expect(systemMessageMayHaveErrors({ statusId: "CONSUMED" })).toBe(false);
  });
});

describe("requestSystemMessageErrors", () => {
  it("asks the systemMessageError domain, and stores and reads nothing itself", async () => {
    const { requestSystemMessageErrors } = useSystemMessage();

    expect(await requestSystemMessageErrors("MSG_0")).toBeUndefined();
    expect(mocks.refreshRecord).toHaveBeenCalledWith("systemMessageError", { systemMessageId: "MSG_0" });
    expect(mocks.errorCacheQuery).not.toHaveBeenCalled();
    expect(mocks.api).not.toHaveBeenCalled();
  });

  it("retries after a request failure instead of permanently treating it as a clean result", async () => {
    mocks.refreshRecord
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValue(0);
    const { requestSystemMessageErrors } = useSystemMessage();

    await expect(requestSystemMessageErrors("MSG_1")).rejects.toThrow("network unavailable");
    await requestSystemMessageErrors("MSG_1");
    expect(mocks.refreshRecord).toHaveBeenCalledTimes(2);

    // The successful empty response is the point at which the session memo becomes authoritative.
    await requestSystemMessageErrors("MSG_1");
    expect(mocks.refreshRecord).toHaveBeenCalledTimes(2);
  });

  it("clears confirmed-clean results with the rest of the session", async () => {
    const { requestSystemMessageErrors } = useSystemMessage();

    await requestSystemMessageErrors("MSG_2");
    await requestSystemMessageErrors("MSG_2");
    expect(mocks.refreshRecord).toHaveBeenCalledTimes(1);

    clearSessionScopedState();

    await requestSystemMessageErrors("MSG_2");
    expect(mocks.refreshRecord).toHaveBeenCalledTimes(2);
  });

  it("drops a confirmed-clean answer once a fresh fetch stores a retry's error", async () => {
    const { requestSystemMessageErrors, refreshSystemMessageErrors } = useSystemMessage();

    await requestSystemMessageErrors("MSG_4");
    // A fresh read always asks, even past the memo, and this one stores an error.
    mocks.refreshRecord.mockResolvedValueOnce(1);
    await refreshSystemMessageErrors("MSG_4");
    expect(mocks.refreshRecord).toHaveBeenCalledTimes(2);

    await requestSystemMessageErrors("MSG_4");
    expect(mocks.refreshRecord).toHaveBeenCalledTimes(3);
  });

  it("does not let a late empty response from the previous session restore the memo", async () => {
    let resolveOld!: (value: number) => void;
    mocks.refreshRecord
      .mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }))
      .mockResolvedValue(0);
    const { requestSystemMessageErrors } = useSystemMessage();

    const oldRequest = requestSystemMessageErrors("MSG_3");
    clearSessionScopedState();
    resolveOld(0);
    await oldRequest;

    await requestSystemMessageErrors("MSG_3");
    expect(mocks.refreshRecord).toHaveBeenCalledTimes(2);
  });
});
