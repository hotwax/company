import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ api: vi.fn() }));

vi.mock("@common", () => ({
  api: (...args: any[]) => harness.api(...args),
  commonUtil: {
    hasError: (response: any) => Boolean(response?.data?._ERROR_MESSAGE_ || response?.data?.error),
  },
  translate: (value: string) => value,
}));

import { useShopifyTransferSyncMutations } from "@/composables/useShopifyTransferSync";

beforeEach(() => {
  harness.api.mockReset();
  harness.api.mockResolvedValue({ data: { available: true } });
});

describe("Shopify transfer sync mutation contracts", () => {
  it("posts the four actions to sibling transferSync resources", async () => {
    const mutations = useShopifyTransferSyncMutations();

    await mutations.retryUpdateLog("ORDER/1", "LOG-1");
    await mutations.resolveUpdateLog("ORDER/1", "LOG-2", "obsolete");
    await mutations.suppressActivityCandidate({
      shopId: "10000",
      orderId: "ORDER/1",
      sourceReferenceId: "STATUS-1",
      workEffortPurposeTypeId: "SUPRS_TO_SHIPPED",
      reason: "reconciled",
    });
    await mutations.cancelSuppressionTask("10000", "ORDER/1", "WE-1");

    expect(harness.api.mock.calls.map(([request]) => request)).toEqual([
      { url: "sob/shopify/transferSync/updateLogRetry", method: "POST", data: { logId: "LOG-1" } },
      { url: "sob/shopify/transferSync/updateLogResolve", method: "POST", data: { logId: "LOG-2", reason: "obsolete" } },
      {
        url: "sob/shopify/transferSync/activityCandidateSuppress",
        method: "POST",
        data: {
          shopId: "10000",
          orderId: "ORDER/1",
          sourceReferenceId: "STATUS-1",
          workEffortPurposeTypeId: "SUPRS_TO_SHIPPED",
          reason: "reconciled",
        },
      },
      {
        url: "sob/shopify/transferSync/suppressionCancel",
        method: "POST",
        data: { shopId: "10000", orderId: "ORDER/1", workEffortId: "WE-1" },
      },
    ]);
  });

  it("rejects an explicit unavailable action envelope", async () => {
    harness.api.mockResolvedValue({ data: { available: false, message: "Action service unavailable" } });

    await expect(useShopifyTransferSyncMutations().retryUpdateLog("ORDER-1", "LOG-1"))
      .rejects.toThrow("Action service unavailable");
  });
});
