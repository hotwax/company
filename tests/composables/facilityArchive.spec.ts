import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const harness = vi.hoisted(() => ({
  api: vi.fn(),
  refreshAfterMutation: vi.fn(),
  resyncDomain: vi.fn(),
  /** The archive group's stored row, as the live read holds it. */
  storedArchiveGroup: undefined as any,
}));

vi.mock("@common", () => ({
  api: (...args: any[]) => harness.api(...args),
  commonUtil: { hasError: (response: any) => Boolean(response?.data?.error) },
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  translate: (value: string) => value,
  useLiveEntity: () => ({ first: harness.storedArchiveGroup, records: ref([]), hydrated: ref(true) }),
}));
vi.mock("@/db/appDbSync", () => ({
  refreshAfterMutation: (...args: any[]) => harness.refreshAfterMutation(...args),
  resyncDomain: (...args: any[]) => harness.resyncDomain(...args),
}));
vi.mock("@/db/companyDb", () => ({ companyDb: { tables: new Proxy({}, { get: (_target, table) => table }) } }));
vi.mock("@/utils", () => ({ getResponseErrorMessage: (error: any, fallback: string) => error?.message || fallback }));
vi.mock("@/composables/useShopify", () => ({ useShopifyFacilityMappings: vi.fn() }));
vi.mock("@/composables/useSeed", () => ({ useTypedEnums: vi.fn() }));

import { useFacilityArchive } from "@/composables/useFacilities";

const associationCalls = () => harness.api.mock.calls.filter(([config]) => String(config.url).endsWith("/association"));
const groupCalls = () => harness.api.mock.calls.filter(([config]) => String(config.url).startsWith("oms/facilityGroups"));

beforeEach(() => {
  for (const mock of [harness.api, harness.refreshAfterMutation, harness.resyncDomain]) mock.mockReset();
  harness.storedArchiveGroup = ref({ facilityGroupId: "ARCHIVE" });
  harness.api.mockResolvedValue({ data: {} });
  harness.refreshAfterMutation.mockResolvedValue(1);
  harness.resyncDomain.mockResolvedValue(undefined);
});

describe("useFacilityArchive — the archive group", () => {
  it("archives into the stored group without asking whether it exists", async () => {
    await useFacilityArchive().archive("PARKING_1");

    expect(groupCalls()).toHaveLength(0);
    expect(associationCalls()[0][0]).toMatchObject({ url: "admin/facilityGroups/ARCHIVE/facilities/PARKING_1/association", method: "post" });
    expect(harness.refreshAfterMutation).toHaveBeenCalledWith("groupFacility", { facilityGroupId: "ARCHIVE" });
  });

  it("confirms with the server when the group is not stored, and does not create one that exists", async () => {
    harness.storedArchiveGroup = ref(undefined);
    harness.api.mockImplementation(async (config: any) =>
      config.url === "oms/facilityGroups/ARCHIVE" ? { data: { facilityGroupId: "ARCHIVE" } } : { data: {} });

    await useFacilityArchive().archive("PARKING_1");

    expect(groupCalls().map(([config]) => config.method)).toEqual(["get"]);
    // The stored snapshot was behind the server, so it is re-read.
    expect(harness.resyncDomain).toHaveBeenCalledWith("facilityGroup");
    expect(associationCalls()).toHaveLength(1);
  });

  it("creates the group only when the server has none either", async () => {
    harness.storedArchiveGroup = ref(undefined);
    harness.api.mockImplementation(async (config: any) => {
      if (config.url === "oms/facilityGroups/ARCHIVE") throw new Error("404");
      return { data: {} };
    });

    await useFacilityArchive().archive("PARKING_1");

    expect(groupCalls().map(([config]) => config.method)).toEqual(["get", "post"]);
    expect(harness.refreshAfterMutation).toHaveBeenCalledWith("facilityGroup", {});
    expect(associationCalls()).toHaveLength(1);
  });

  it("uses the group as soon as the live read stores it", async () => {
    harness.storedArchiveGroup = ref(undefined);
    const { archive } = useFacilityArchive();
    harness.storedArchiveGroup.value = { facilityGroupId: "ARCHIVE" };

    await archive("PARKING_1");

    expect(groupCalls()).toHaveLength(0);
  });
});
