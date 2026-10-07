// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = vi.fn();

vi.mock("@common", () => ({
  api: (args: any) => apiMock(args),
  commonUtil: {
    hasError: (res: any) => Boolean(res?.data?.error || res?.data?._ERROR_MESSAGE_),
  },
  logger: {
    error: vi.fn(),
  },
  translate: (k: string) => k,
}));

vi.mock("@/services/appCacheBootstrap", () => ({
  resyncDomain: vi.fn().mockResolvedValue(undefined),
}));

import { useRejectionReasons } from "@/composables/useRejectionReasons";

describe("useRejectionReasons composable", () => {
  let rejectionReasonsComposable: ReturnType<typeof useRejectionReasons>;

  beforeEach(() => {
    vi.clearAllMocks();
    rejectionReasonsComposable = useRejectionReasons();
  });

  it("fetches reject reasons with parentTypeId filter", async () => {
    const mockReasons = [
      { enumId: "REJ_RSN_DAMAGED", enumName: "Damaged", sequenceNum: 1 },
      { enumId: "REJ_RSN_LOST", enumName: "Lost", sequenceNum: 2 },
    ];
    apiMock.mockResolvedValueOnce({ data: mockReasons });

    const { fetchRejectReasons, rejectReasons } = rejectionReasonsComposable;
    const reasons = await fetchRejectReasons();

    expect(reasons).toEqual(mockReasons);
    expect(rejectReasons.value).toEqual(mockReasons);
    expect(apiMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "/admin/enums",
        method: "GET",
        params: expect.objectContaining({
          parentTypeId: ["REPORT_AN_ISSUE", "RPRT_NO_VAR_LOG"],
          parentTypeId_op: "in",
        }),
      })
    );
  });

  it("fetches reject reason enum types", async () => {
    const mockEnumTypes = [
      { enumTypeId: "REPORT_VAR", description: "Report Variance" },
      { enumTypeId: "REPORT_NO_VAR", description: "No Variance" },
    ];
    apiMock.mockResolvedValueOnce({ data: mockEnumTypes });

    const { fetchRejectReasonEnumTypes, rejectReasonEnumTypes } = rejectionReasonsComposable;
    const types = await fetchRejectReasonEnumTypes();

    expect(types).toEqual(mockEnumTypes);
    expect(rejectReasonEnumTypes.value).toEqual(mockEnumTypes);
    expect(apiMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "/admin/enumTypes",
        method: "GET",
      })
    );
  });

  it("fetches active fulfillment reject reasons", async () => {
    const mockGroupMembers = [
      { enumId: "REJ_RSN_DAMAGED", enumerationGroupId: "FF_REJ_RSN_GRP" },
      { enumId: "REJ_RSN_EXPIRED", enumerationGroupId: "FF_REJ_RSN_GRP", thruDate: 1700000000 },
    ];
    apiMock.mockResolvedValueOnce({ data: mockGroupMembers });

    const { fetchFulfillmentRejectReasons, groupRejectReasons } = rejectionReasonsComposable;
    const activeMembers = await fetchFulfillmentRejectReasons();

    expect(Object.keys(activeMembers)).toEqual(["REJ_RSN_DAMAGED"]);
    expect(groupRejectReasons.value.FF_REJ_RSN_GRP["REJ_RSN_DAMAGED"]).toBeDefined();
  });

  it("creates and updates enumerations via API", async () => {
    apiMock
      .mockResolvedValueOnce({ data: { enumId: "NEW_REASON" } })
      .mockResolvedValueOnce({ data: { enumId: "NEW_REASON" } });

    const { createEnumeration, updateEnumeration } = rejectionReasonsComposable;

    const createResp = await createEnumeration({ enumId: "NEW_REASON", enumName: "New Reason" });
    expect(createResp.data.enumId).toBe("NEW_REASON");
    expect(apiMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "/admin/enums",
        method: "POST",
      })
    );

    const updateResp = await updateEnumeration({ enumId: "NEW_REASON", enumName: "Updated Reason" });
    expect(updateResp.data.enumId).toBe("NEW_REASON");
    expect(apiMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "/admin/enums/NEW_REASON",
        method: "PUT",
      })
    );
  });
});
