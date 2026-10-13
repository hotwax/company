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

describe("ensureSystemMessageErrors", () => {
  it("asks the systemMessageError domain and reads the message's stored errors, newest first", async () => {
    const { ensureSystemMessageErrors } = useSystemMessage();

    await ensureSystemMessageErrors("MSG_0");
    expect(mocks.refreshRecord).toHaveBeenCalledWith("systemMessageError", { systemMessageId: "MSG_0" });
    expect(mocks.errorCacheQuery).toHaveBeenCalledWith({ equals: { systemMessageId: "MSG_0" }, dateField: "errorDate" });
    expect(mocks.api).not.toHaveBeenCalled();
  });

  it("retries after a request failure instead of permanently treating it as a clean result", async () => {
    mocks.refreshRecord
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValue(0);
    const { ensureSystemMessageErrors } = useSystemMessage();

    expect(await ensureSystemMessageErrors("MSG_1")).toEqual([]);
    expect(await ensureSystemMessageErrors("MSG_1")).toEqual([]);
    expect(mocks.refreshRecord).toHaveBeenCalledTimes(2);

    // The successful empty response is the point at which the session memo becomes authoritative.
    expect(await ensureSystemMessageErrors("MSG_1")).toEqual([]);
    expect(mocks.refreshRecord).toHaveBeenCalledTimes(2);
  });

  it("clears confirmed-clean results with the rest of the session", async () => {
    const { ensureSystemMessageErrors } = useSystemMessage();

    await ensureSystemMessageErrors("MSG_2");
    await ensureSystemMessageErrors("MSG_2");
    expect(mocks.refreshRecord).toHaveBeenCalledTimes(1);

    clearSessionScopedState();

    await ensureSystemMessageErrors("MSG_2");
    expect(mocks.refreshRecord).toHaveBeenCalledTimes(2);
  });

  it("drops a confirmed-clean answer once a fresh fetch finds a retry's error", async () => {
    const retryError = { systemMessageId: "MSG_4", errorText: "Shopify timed out", errorDate: 5 };
    const { ensureSystemMessageErrors, fetchSystemMessageErrors } = useSystemMessage();

    expect(await ensureSystemMessageErrors("MSG_4")).toEqual([]);
    mocks.errorCacheQuery.mockResolvedValue([retryError]);
    expect(await fetchSystemMessageErrors("MSG_4")).toEqual([retryError]);

    expect(await ensureSystemMessageErrors("MSG_4")).toEqual([retryError]);
  });

  it("does not let a late empty response from the previous session restore the memo", async () => {
    let resolveOld!: (value: number) => void;
    mocks.refreshRecord
      .mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }))
      .mockResolvedValue(0);
    const { ensureSystemMessageErrors } = useSystemMessage();

    const oldRequest = ensureSystemMessageErrors("MSG_3");
    clearSessionScopedState();
    resolveOld(0);
    await oldRequest;

    await ensureSystemMessageErrors("MSG_3");
    expect(mocks.refreshRecord).toHaveBeenCalledTimes(2);
  });
});
