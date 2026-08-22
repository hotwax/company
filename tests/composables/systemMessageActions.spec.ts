import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * L1 unit — the SystemMessage recovery actions the fulfillment queue drives.
 *
 * Each wrapper owns exactly one server route, and the queue's three unstick paths map onto them:
 *   - retry a produced/errored message  → POST admin/systemMessages/{id}/send
 *   - clear the SmsgError give-up state → POST admin/systemMessages/{id}/resetError
 *   - free a message stranded in SmsgSending → POST admin/systemMessages/{id}/update
 * Mocked transport ONLY — the dev pairing is a production OMS, so these must never be "verified"
 * by calling the real thing from a test.
 */

const harness = vi.hoisted(() => ({
  api: vi.fn(),
  hasError: vi.fn(() => false),
}));

vi.mock("@common", () => ({
  api: (...args: any[]) => harness.api(...args),
  commonUtil: { hasError: (...args: any[]) => harness.hasError(...args), showToast: vi.fn() },
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  translate: (value: string) => value,
}));

vi.mock("@/services/appCacheBootstrap", () => ({
  refreshAfterMutation: vi.fn(),
  bootstrapState: { running: false },
}));

import { useSystemMessage } from "@/composables/useSystemMessage";

describe("system message actions", () => {
  beforeEach(() => {
    harness.api.mockReset();
    harness.api.mockResolvedValue({ data: { systemMessageId: "M228628" } });
    harness.hasError.mockReturnValue(false);
  });

  it("resends through the message's own send route, payload untouched", async () => {
    const { resendSystemMessage } = useSystemMessage();

    const result = await resendSystemMessage("M228628");

    expect(harness.api).toHaveBeenCalledWith({
      url: "admin/systemMessages/M228628/send",
      method: "POST",
      data: { systemMessageId: "M228628" },
    });
    expect(result).toEqual({ systemMessageId: "M228628" });
  });

  it("clears the error state through resetError", async () => {
    const { resetSystemMessageError } = useSystemMessage();

    await resetSystemMessageError("M228628");

    expect(harness.api).toHaveBeenCalledWith({
      url: "admin/systemMessages/M228628/resetError",
      method: "POST",
      data: { systemMessageId: "M228628" },
    });
  });

  it("forces an explicit status through update — the SmsgSending unstick", async () => {
    const { forceSystemMessageStatus } = useSystemMessage();

    await forceSystemMessageStatus("M228628", "SmsgProduced");

    expect(harness.api).toHaveBeenCalledWith({
      url: "admin/systemMessages/M228628/update",
      method: "POST",
      data: { systemMessageId: "M228628", statusId: "SmsgProduced" },
    });
  });

  it("escapes the id into the path so a hostile id cannot re-route the call", async () => {
    const { resetSystemMessageError } = useSystemMessage();

    await resetSystemMessageError("M1/../danger");

    expect(harness.api).toHaveBeenCalledWith(expect.objectContaining({
      url: `admin/systemMessages/${encodeURIComponent("M1/../danger")}/resetError`,
    }));
  });

  it("surfaces a server rejection as a thrown error, never a silent success", async () => {
    harness.hasError.mockReturnValue(true);
    const { forceSystemMessageStatus, resendSystemMessage, resetSystemMessageError } = useSystemMessage();

    await expect(resendSystemMessage("M228628")).rejects.toThrow("The OMS rejected the resend request.");
    await expect(resetSystemMessageError("M228628")).rejects.toThrow("The OMS rejected the reset request.");
    await expect(forceSystemMessageStatus("M228628", "SmsgProduced"))
      .rejects.toThrow("The OMS rejected the status update.");
  });

  it("refuses to call the server without the required identifiers", async () => {
    const { forceSystemMessageStatus, resendSystemMessage, resetSystemMessageError } = useSystemMessage();

    await expect(resendSystemMessage("")).rejects.toThrow();
    await expect(resetSystemMessageError("")).rejects.toThrow();
    await expect(forceSystemMessageStatus("", "SmsgProduced")).rejects.toThrow();
    await expect(forceSystemMessageStatus("M228628", "")).rejects.toThrow();
    expect(harness.api).not.toHaveBeenCalled();
  });
});
