import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `POST oms/facilities/{facilityId}/groups` is `FacilityGroupMember` operation `store`, which
 * resolves the row on the EXACT primary key `(facilityGroupId, facilityId, fromDate)`.
 *
 * A revision whose `fromDate` does not match does not fail — it answers 200 and INSERTS a second
 * active membership. Verified live 2026-08-17 against the local OMS: omitting `fromDate` returned
 * `{fromDate: 1786965457977}` and added a row, and posting `1718341888000` against a row stored at
 * `1718341888240` added another. That is how a group's members get duplicated on save, so these
 * tests pin the two guards that stop it — normalize what we can, refuse what we cannot.
 */

const harness = vi.hoisted(() => ({
  api: vi.fn(),
  refreshAfterMutation: vi.fn(),
  resyncDomain: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("@common", () => ({
  api: (...args: any[]) => harness.api(...args),
  commonUtil: {
    hasError: (response: any) => Boolean(response?.data?._ERROR_MESSAGE_ ||
      response?.data?._ERROR_MESSAGE_LIST_?.length ||
      response?.data?.error),
  },
  logger: { error: (...args: any[]) => harness.loggerError(...args), warn: vi.fn(), info: vi.fn() },
  translate: (value: string) => value,
}));

vi.mock("@/services/appCacheBootstrap", () => ({
  bootstrapState: { running: false, written: {}, errors: {} },
  refreshAfterMutation: (...args: any[]) => harness.refreshAfterMutation(...args),
  resyncDomain: (...args: any[]) => harness.resyncDomain(...args),
}));

vi.mock("@/utils", () => ({
  getResponseErrorMessage: (error: any, fallback: string) => error?.message || fallback,
}));

import { useFacilityGroupMutations } from "@/composables/useFacilities";

/** Every `data` body posted to the membership endpoint, in call order. */
const postedBodies = () => harness.api.mock.calls
  .filter(([request]: any[]) => /^oms\/facilities\/.+\/groups$/.test(request.url) && request.method === "post")
  .map(([request]: any[]) => request.data);

beforeEach(() => {
  harness.api.mockReset();
  harness.api.mockResolvedValue({ data: {} });
  harness.refreshAfterMutation.mockReset();
  harness.loggerError.mockReset();
});

describe("saveMembers — fromDate must address an existing row exactly", () => {
  it("normalizes an ISO-string fromDate to epoch millis before revising a member", async () => {
    const { saveMembers } = useFacilityGroupMutations("SAMEDAY");

    await saveMembers([], [{ facilityId: "BROADWAY", fromDate: "2024-06-14T05:11:28.240Z", sequenceNum: 2 }]);

    expect(postedBodies()).toEqual([
      { facilityGroupId: "SAMEDAY", facilityId: "BROADWAY", fromDate: 1718341888240, sequenceNum: 2 },
    ]);
  });

  it("normalizes a numeric-string fromDate rather than echoing the server's shape back", async () => {
    const { saveMembers } = useFacilityGroupMutations("SAMEDAY");

    await saveMembers([], [{ facilityId: "BROADWAY", fromDate: "1718341888240", thruDate: 1786965457977 }]);

    expect(postedBodies()[0].fromDate).toBe(1718341888240);
  });

  it("leaves an epoch-millis fromDate untouched", async () => {
    const { saveMembers } = useFacilityGroupMutations("SAMEDAY");

    await saveMembers([], [{ facilityId: "BROADWAY", fromDate: 1718341888240, sequenceNum: 3 }]);

    expect(postedBodies()[0].fromDate).toBe(1718341888240);
  });

  it("refuses a revision with no fromDate instead of posting one that would insert a duplicate", async () => {
    const { saveMembers } = useFacilityGroupMutations("SAMEDAY");

    const { failed } = await saveMembers([], [{ facilityId: "BROADWAY", sequenceNum: 4 }]);

    expect(postedBodies()).toEqual([]);
    expect(failed).toBe(true);
    expect(harness.loggerError).toHaveBeenCalled();
  });

  it("still writes the addressable revisions when one of them is unusable", async () => {
    const { saveMembers } = useFacilityGroupMutations("SAMEDAY");

    const { failed } = await saveMembers([], [
      { facilityId: "BROADWAY", fromDate: 1718341888240, sequenceNum: 1 },
      { facilityId: "CENTERVILLE", fromDate: null, sequenceNum: 2 },
    ]);

    expect(postedBodies()).toEqual([
      { facilityGroupId: "SAMEDAY", facilityId: "BROADWAY", fromDate: 1718341888240, sequenceNum: 1 },
    ]);
    expect(failed).toBe(true);
  });

  it("does not normalize additions — they carry a brand-new fromDate, not an address", async () => {
    const { saveMembers } = useFacilityGroupMutations("SAMEDAY");

    await saveMembers([{ facilityId: "QUEENS", fromDate: 1786956309416, sequenceNum: 5 }], []);

    expect(postedBodies()).toEqual([
      { facilityGroupId: "SAMEDAY", facilityId: "QUEENS", fromDate: 1786956309416, sequenceNum: 5 },
    ]);
  });

  it("refreshes the member cache once writes were attempted", async () => {
    const { saveMembers } = useFacilityGroupMutations("SAMEDAY");

    await saveMembers([], [{ facilityId: "BROADWAY", fromDate: 1718341888240, sequenceNum: 2 }]);

    expect(harness.refreshAfterMutation).toHaveBeenCalledWith("facilityGroupMember", { facilityGroupId: "SAMEDAY" });
  });

  it("skips the cache refresh when every revision was refused, since nothing was written", async () => {
    const { saveMembers } = useFacilityGroupMutations("SAMEDAY");

    await saveMembers([], [{ facilityId: "BROADWAY", sequenceNum: 4 }]);

    expect(harness.refreshAfterMutation).not.toHaveBeenCalled();
  });
});
