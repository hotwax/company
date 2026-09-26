// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

vi.mock("@common", () => ({
  api: vi.fn(async () => ({ data: {} })),
  commonUtil: {
    getOmsURL: () => "https://example.test/api/",
    hasError: () => false,
    isMoqui: () => true,
    showToast: vi.fn(),
  },
  emitter: { emit: vi.fn(), on: vi.fn(), off: vi.fn() },
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
  translate: (key: string) => key,
}));

vi.mock("@/services/appCacheBootstrap", () => ({
  refreshAfterMutation: vi.fn(),
  resyncDomain: vi.fn(),
}));

vi.mock("@/composables/useShopify", () => ({
  useShopifyFacilityMappings: vi.fn(),
}));

vi.mock("@/composables/useSeed", () => ({
  useTypedEnums: vi.fn(),
}));

vi.mock("@/composables/useNetSuite", () => ({
  useFacilityIdentifications: vi.fn(),
}));

describe("Facility Details staff role scope", () => {
  it("excludes facility logins and carriers while preserving every other staff role", async () => {
    const facilities = await import("@/composables/useFacilities");
    const isFacilityStaffParty = (facilities as any).isFacilityStaffParty;
    expect(isFacilityStaffParty).toBeTypeOf("function");

    const parties = [
      { partyId: "LOGIN_1", roleTypeId: "FAC_LOGIN" },
      { partyId: "FEDEX", roleTypeId: "CARRIER" },
      { partyId: "MANAGER_1", roleTypeId: "FAC_MANAGER" },
      { partyId: "PICKER_1", roleTypeId: "PICKER" },
    ];

    expect(parties.filter(isFacilityStaffParty).map((party) => party.partyId))
      .toEqual(["MANAGER_1", "PICKER_1"]);
  });
});
