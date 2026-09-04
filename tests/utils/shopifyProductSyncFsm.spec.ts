import { describe, expect, it, vi } from "vitest";
import { getProductSyncFsmState } from "@/utils/shopifyProductSyncFsm";

vi.mock("@/i18n", () => ({
  translate: (key: string) => key
}));

describe("getProductSyncFsmState", () => {
  it("returns default state for unknown statusId", () => {
    const state = getProductSyncFsmState({ statusId: "Unknown" });
    expect(state.statusId).toBe("Unknown");
    expect(state.statusLabel).toBe("Pending");
    expect(state.primaryAction).toBeNull();
    expect(state.secondaryActions).toEqual([]);
    expect(state.nextJob).toBeNull();
    expect(state.nextJobReason).toBe("No automated next step");
  });

  it("returns correct state for SmsgProduced", () => {
    const state = getProductSyncFsmState({ statusId: "SmsgProduced" });
    expect(state.statusId).toBe("SmsgProduced");
    expect(state.primaryAction).toEqual({ id: "send", label: "Send now", kind: "primary" });
    expect(state.secondaryActions).toEqual([{ id: "cancel", label: "Cancel", kind: "secondary" }]);
    expect(state.nextJob).toBeNull();
    expect(state.nextJobReason).toBe("The next logical step is to send the produced bulk query to Shopify.");
  });

  it("returns correct state for SmsgSending", () => {
    const state = getProductSyncFsmState({ statusId: "SmsgSending" });
    expect(state.statusId).toBe("SmsgSending");
    expect(state.primaryAction).toEqual({ id: "send", label: "Send now", kind: "primary" });
    expect(state.secondaryActions).toEqual([{ id: "cancel", label: "Cancel", kind: "secondary" }]);
    expect(state.nextJob).toBeNull();
    expect(state.nextJobReason).toBe("The next logical step is to send the produced bulk query to Shopify.");
  });

  it("builds nextJob for SmsgProduced when sendJob is provided", () => {
    const state = getProductSyncFsmState({
      statusId: "SmsgProduced",
      sendJob: { jobName: "job-123" },
      sendJobNextRunLabel: "Tomorrow",
      isSendJobPaused: true,
      sendJobNextRunAtMs: 1000,
      sendJobPreviousRunAtMs: 500
    });
    expect(state.nextJob).toEqual({
      id: "job-123",
      label: "Send update request",
      nextRunLabel: "Tomorrow",
      relativeNextRunLabel: "",
      paused: true,
      nextRunAtMs: 1000,
      previousRunAtMs: 500
    });
  });

  it("returns correct state for SmsgSent", () => {
    const state = getProductSyncFsmState({ statusId: "SmsgSent" });
    expect(state.statusId).toBe("SmsgSent");
    expect(state.primaryAction).toEqual({ id: "poll", label: "Poll now", kind: "primary" });
    expect(state.secondaryActions).toEqual([{ id: "cancel", label: "Cancel", kind: "secondary" }]);
    expect(state.nextJob).toBeNull();
    expect(state.nextJobReason).toBe("The next logical step is to check whether Shopify finished the bulk operation.");
  });

  it("builds nextJob for SmsgSent when pollJob is provided", () => {
    const state = getProductSyncFsmState({
      statusId: "SmsgSent",
      pollJob: { jobName: "job-456" },
      pollJobNextRunLabel: "Next Week",
      isPollJobPaused: false,
      pollJobNextRunAtMs: 2000,
      pollJobPreviousRunAtMs: 1000
    });
    expect(state.nextJob).toEqual({
      id: "job-456",
      label: "Import completed requests",
      nextRunLabel: "Next Week",
      relativeNextRunLabel: "",
      paused: false,
      nextRunAtMs: 2000,
      previousRunAtMs: 1000
    });
  });

  it.each(["SmsgReceived", "SmsgConsuming", "SmsgError"])("returns correct state for %s", (statusId) => {
    const state = getProductSyncFsmState({ statusId });
    expect(state.primaryAction).toBeNull();
    expect(state.secondaryActions).toEqual([{ id: "cancel", label: "Cancel", kind: "secondary" }]);
    expect(state.nextJob).toBeNull();
    expect(state.nextJobReason).toBe("No forward action is available. You can only discard this run if you no longer want to use it.");
  });

  it.each(["SmsgConsumed", "SmsgConfirmed", "SmsgCancelled"])("returns correct state for %s", (statusId) => {
    const state = getProductSyncFsmState({ statusId });
    expect(state.primaryAction).toBeNull();
    expect(state.secondaryActions).toEqual([]);
    expect(state.nextJob).toBeNull();
    expect(state.nextJobReason).toBe("No automated next step");
  });
});
