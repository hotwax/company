import { describe, expect, it, vi } from "vitest";

vi.mock("@common", () => ({
  api: vi.fn(),
  commonUtil: { hasError: () => false, showToast: vi.fn() },
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  translate: (value: string) => value,
}));

import { systemMessageMayHaveErrors } from "@/composables/useSystemMessage";

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
