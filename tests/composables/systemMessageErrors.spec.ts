import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  errorCacheAll: vi.fn(),
  errorCacheUpsertMany: vi.fn(),
}));

vi.mock("@common", () => ({
  api: (...args: any[]) => mocks.api(...args),
  commonUtil: { hasError: () => false, showToast: vi.fn() },
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  translate: (value: string) => value,
}));

vi.mock("@/utils/cacheEntities", () => ({
  shopifyBulkOperationCache: { all: vi.fn(), upsertMany: vi.fn() },
  systemMessageCache: { all: vi.fn(), upsertMany: vi.fn() },
  systemMessageErrorCache: {
    all: (...args: any[]) => mocks.errorCacheAll(...args),
    upsertMany: (...args: any[]) => mocks.errorCacheUpsertMany(...args),
  },
  systemMessageRemoteCache: { all: vi.fn(), upsertMany: vi.fn() },
}));

import { clearSessionScopedState } from "@/composables/sessionScope";
import { systemMessageMayHaveErrors, useSystemMessage } from "@/composables/useSystemMessage";

beforeEach(() => {
  clearSessionScopedState();
  mocks.api.mockReset();
  mocks.errorCacheAll.mockReset();
  mocks.errorCacheAll.mockResolvedValue([]);
  mocks.errorCacheUpsertMany.mockReset();
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
  it("retries after a request failure instead of permanently treating it as a clean result", async () => {
    mocks.api
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValue({ data: [] });
    const { ensureSystemMessageErrors } = useSystemMessage();

    expect(await ensureSystemMessageErrors("MSG_1")).toEqual([]);
    expect(await ensureSystemMessageErrors("MSG_1")).toEqual([]);
    expect(mocks.api).toHaveBeenCalledTimes(2);

    // The successful empty response is the point at which the session memo becomes authoritative.
    expect(await ensureSystemMessageErrors("MSG_1")).toEqual([]);
    expect(mocks.api).toHaveBeenCalledTimes(2);
  });

  it("clears confirmed-clean results with the rest of the session", async () => {
    mocks.api.mockResolvedValue({ data: [] });
    const { ensureSystemMessageErrors } = useSystemMessage();

    await ensureSystemMessageErrors("MSG_2");
    await ensureSystemMessageErrors("MSG_2");
    expect(mocks.api).toHaveBeenCalledTimes(1);

    clearSessionScopedState();

    await ensureSystemMessageErrors("MSG_2");
    expect(mocks.api).toHaveBeenCalledTimes(2);
  });

  it("does not let a late empty response from the previous session restore the memo", async () => {
    let resolveOld!: (value: any) => void;
    const oldResponse = new Promise((resolve) => { resolveOld = resolve; });
    mocks.api
      .mockReturnValueOnce(oldResponse)
      .mockResolvedValue({ data: [] });
    const { ensureSystemMessageErrors } = useSystemMessage();

    const oldRequest = ensureSystemMessageErrors("MSG_3");
    clearSessionScopedState();
    resolveOld({ data: [] });
    await oldRequest;

    await ensureSystemMessageErrors("MSG_3");
    expect(mocks.api).toHaveBeenCalledTimes(2);
  });
});
