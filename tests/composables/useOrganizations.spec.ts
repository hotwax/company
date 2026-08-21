import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  refreshAfterMutation: vi.fn(),
  resyncDomain: vi.fn(),
<<<<<<< HEAD
}));

vi.mock("@common", () => ({
  api: mocks.api,
  commonUtil: {
    hasError: (response: any) =>
      Boolean(response?.data?._ERROR_MESSAGE_ || response?.data?._ERROR_MESSAGE_LIST_),
  },
}));

vi.mock("@/services/appCacheBootstrap", () => ({
  refreshAfterMutation: mocks.refreshAfterMutation,
  resyncDomain: mocks.resyncDomain,
}));

vi.mock("@/utils/cacheEntities", () => ({
  facilityCache: {},
  organizationCache: {},
  organizationRelationshipCache: {},
}));

vi.mock("@/composables/useCachedList", () => ({
  useCachedList: () => ({ records: ref([]), hydrated: ref(true) }),
  useCachedRecord: () => ({ record: ref(undefined), hydrated: ref(true) }),
}));

vi.mock("@/composables/sessionScope", () => ({
  onSessionCleared: vi.fn(),
}));

vi.mock("@/utils", () => ({
  getResponseErrorMessage: (error: any, fallback: string) => error?.message ?? fallback,
}));

import {
  type Organization,
  type OrganizationRelationship,
  createOrganization,
  deriveOrganizationForest,
  isOrganizationRelationshipActive,
  reparentOrganization,
  suggestOrganizationId,
  wouldCreateOrganizationCycle,
} from "@/composables/useOrganizations";

const organizations: Organization[] = [
  { partyId: "ROOT", groupName: "Root" },
  { partyId: "B", groupName: "Beta" },
  { partyId: "A", groupName: "Alpha" },
  { partyId: "LEAF", groupName: "Leaf" },
];

const relationship = (
  partyIdFrom: string,
  partyIdTo: string,
  extra: Partial<OrganizationRelationship> = {},
): OrganizationRelationship => ({
  partyIdFrom,
  partyIdTo,
  roleTypeIdFrom: "INTERNAL_ORGANIZATIO",
  roleTypeIdTo: "INTERNAL_ORGANIZATIO",
  partyRelationshipTypeId: "SUB_DIVISION",
  fromDate: 1_000,
  ...extra,
});

describe("organization hierarchy", () => {
  it("suggests a valid organization id from the display name", () => {
    expect(suggestOrganizationId("Rails Retail 1 NY LLC")).toBe("RAILS_RETAIL_1_NY_LL");
    expect(suggestOrganizationId("  Café & Company!  ")).toBe("CAFE_COMPANY");
  });

  it("keeps only active internal SUB_DIVISION relationships", () => {
    expect(isOrganizationRelationshipActive(relationship("ROOT", "A"), 2_000)).toBe(true);
    expect(isOrganizationRelationshipActive(relationship("ROOT", "A", { thruDate: 2_000 }), 2_000)).toBe(false);
    expect(isOrganizationRelationshipActive(relationship("ROOT", "A", { fromDate: 3_000 }), 2_000)).toBe(false);
    expect(isOrganizationRelationshipActive({
      ...relationship("ROOT", "A"),
      roleTypeIdTo: "CUSTOMER",
    }, 2_000)).toBe(false);
  });

  it("builds a stable forest and breadcrumb paths", () => {
    const result = deriveOrganizationForest(organizations, [
      relationship("ROOT", "B"),
      relationship("ROOT", "A"),
      relationship("A", "LEAF"),
    ], 2_000);

    expect(result.roots.map((node) => node.partyId)).toEqual(["ROOT"]);
    expect(result.roots[0].children.map((node) => node.partyId)).toEqual(["A", "B"]);
    expect(result.nodesById.get("LEAF")?.path).toEqual(["Root", "Alpha", "Leaf"]);
    expect(result.anomalies).toEqual([]);
  });

  it("surfaces missing endpoints and multiple parents without hiding organizations", () => {
    const result = deriveOrganizationForest(organizations, [
      relationship("MISSING", "A"),
      relationship("ROOT", "B"),
      relationship("A", "B"),
      relationship("ROOT", "GHOST"),
    ], 2_000);

    expect(result.anomalies.map((item) => item.code).sort()).toEqual([
      "missing-child",
      "missing-parent",
      "multiple-parents",
    ]);
    expect(result.roots.map((node) => node.partyId)).toEqual(["A", "B", "LEAF", "ROOT"]);
  });

  it("breaks cycles into visible roots and rejects descendant reparenting", () => {
    const result = deriveOrganizationForest(organizations, [
      relationship("A", "B"),
      relationship("B", "A"),
      relationship("A", "LEAF"),
    ], 2_000);

    expect(result.anomalies.filter((item) => item.code === "cycle")).toHaveLength(2);
    expect(result.roots.map((node) => node.partyId)).toContain("A");
    expect(result.roots.map((node) => node.partyId)).toContain("B");

    const valid = deriveOrganizationForest(organizations, [
      relationship("ROOT", "A"),
      relationship("A", "LEAF"),
    ], 2_000);
    expect(wouldCreateOrganizationCycle("ROOT", "LEAF", valid.parentById)).toBe(true);
    expect(wouldCreateOrganizationCycle("LEAF", "B", valid.parentById)).toBe(false);
  });
});

describe("organization mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.api.mockResolvedValue({ data: {} });
    mocks.refreshAfterMutation.mockResolvedValue(1);
    mocks.resyncDomain.mockResolvedValue(undefined);
  });

  it("creates Party, PartyGroup, internal role, and optional parent in order", async () => {
    await createOrganization({
      partyId: "new_org",
      groupName: "New Organization",
      externalId: "42",
      parentPartyId: "ROOT",
    });

    expect(mocks.api.mock.calls.map(([request]) => [request.method, request.url])).toEqual([
      ["post", "admin/organizations"],
      ["post", "admin/organizations/NEW_ORG"],
      ["post", "admin/organizations/NEW_ORG/roles"],
      ["post", "oms/partyRelationships"],
    ]);
    expect(mocks.api.mock.calls[2][0].data.roleTypeId).toBe("INTERNAL_ORGANIZATIO");
    expect(mocks.api.mock.calls[3][0].data).toEqual(expect.objectContaining({
      partyIdFrom: "ROOT",
      partyIdTo: "NEW_ORG",
      partyRelationshipTypeId: "SUB_DIVISION",
    }));
    expect(mocks.refreshAfterMutation).toHaveBeenNthCalledWith(1, "organization", { partyId: "NEW_ORG" });
    expect(mocks.refreshAfterMutation).toHaveBeenNthCalledWith(
      2,
      "organizationRelationship",
      { partyIdTo: "NEW_ORG" },
    );
||||||| 544075d
=======
  translate: vi.fn((key: string, params: Record<string, unknown> = {}) =>
    Object.entries(params).reduce(
      (message, [name, value]) => message.replace(`{${name}}`, String(value)),
      key,
    )),
}));

vi.mock("@common", () => ({
  api: mocks.api,
  commonUtil: {
    hasError: (response: any) =>
      Boolean(response?.data?._ERROR_MESSAGE_ || response?.data?._ERROR_MESSAGE_LIST_),
  },
  translate: mocks.translate,
}));

vi.mock("@/services/appCacheBootstrap", () => ({
  refreshAfterMutation: mocks.refreshAfterMutation,
  resyncDomain: mocks.resyncDomain,
}));

vi.mock("@/utils/cacheEntities", () => ({
  facilityCache: {},
  organizationCache: {},
  organizationRelationshipCache: {},
}));

vi.mock("@/composables/useCachedList", () => ({
  useCachedList: () => ({ records: ref([]), hydrated: ref(true) }),
  useCachedRecord: () => ({ record: ref(undefined), hydrated: ref(true) }),
}));

vi.mock("@/composables/sessionScope", () => ({
  onSessionCleared: vi.fn(),
}));

vi.mock("@/utils", () => ({
  getResponseErrorMessage: (error: any, fallback: string) => error?.message ?? fallback,
}));

import {
  type Organization,
  type OrganizationRelationship,
  createOrganization,
  deriveOrganizationForest,
  isOrganizationRelationshipActive,
  renameOrganization,
  reparentOrganization,
  suggestOrganizationId,
  updateOrganizationExternalId,
  wouldCreateOrganizationCycle,
} from "@/composables/useOrganizations";

const organizations: Organization[] = [
  { partyId: "ROOT", groupName: "Root" },
  { partyId: "B", groupName: "Beta" },
  { partyId: "A", groupName: "Alpha" },
  { partyId: "LEAF", groupName: "Leaf" },
];

const relationship = (
  partyIdFrom: string,
  partyIdTo: string,
  extra: Partial<OrganizationRelationship> = {},
): OrganizationRelationship => ({
  partyIdFrom,
  partyIdTo,
  roleTypeIdFrom: "INTERNAL_ORGANIZATIO",
  roleTypeIdTo: "INTERNAL_ORGANIZATIO",
  partyRelationshipTypeId: "SUB_DIVISION",
  fromDate: 1_000,
  ...extra,
});

describe("organization hierarchy", () => {
  it("suggests a valid organization id from the display name", () => {
    expect(suggestOrganizationId("Rails Retail 1 NY LLC")).toBe("RAILS_RETAIL_1_NY_LL");
    expect(suggestOrganizationId("  Café & Company!  ")).toBe("CAFE_COMPANY");
  });

  it("keeps only active internal SUB_DIVISION relationships", () => {
    expect(isOrganizationRelationshipActive(relationship("ROOT", "A"), 2_000)).toBe(true);
    expect(isOrganizationRelationshipActive(relationship("ROOT", "A", { thruDate: 2_000 }), 2_000)).toBe(false);
    expect(isOrganizationRelationshipActive(relationship("ROOT", "A", { fromDate: 3_000 }), 2_000)).toBe(false);
    expect(isOrganizationRelationshipActive({
      ...relationship("ROOT", "A"),
      roleTypeIdTo: "CUSTOMER",
    }, 2_000)).toBe(false);
  });

  it("builds a stable forest and breadcrumb paths", () => {
    const result = deriveOrganizationForest(organizations, [
      relationship("ROOT", "B"),
      relationship("ROOT", "A"),
      relationship("A", "LEAF"),
    ], 2_000);

    expect(result.roots.map((node) => node.partyId)).toEqual(["ROOT"]);
    expect(result.roots[0].children.map((node) => node.partyId)).toEqual(["A", "B"]);
    expect(result.nodesById.get("LEAF")?.path).toEqual(["Root", "Alpha", "Leaf"]);
    expect(result.anomalies).toEqual([]);
  });

  it("surfaces missing endpoints and multiple parents without hiding organizations", () => {
    const result = deriveOrganizationForest(organizations, [
      relationship("MISSING", "A"),
      relationship("ROOT", "B"),
      relationship("A", "B"),
      relationship("ROOT", "GHOST"),
    ], 2_000);

    expect(result.anomalies.map((item) => item.code).sort()).toEqual([
      "missing-child",
      "missing-parent",
      "multiple-parents",
    ]);
    expect(result.anomalies).toEqual(expect.arrayContaining([
      { code: "missing-parent", partyId: "A", relatedPartyId: "MISSING" },
      { code: "missing-child", partyId: "ROOT", relatedPartyId: "GHOST" },
    ]));
    expect(result.roots.map((node) => node.partyId)).toEqual(["A", "B", "LEAF", "ROOT"]);
  });

  it("breaks cycles into visible roots and rejects descendant reparenting", () => {
    const result = deriveOrganizationForest(organizations, [
      relationship("A", "B"),
      relationship("B", "A"),
      relationship("A", "LEAF"),
    ], 2_000);

    expect(result.anomalies.filter((item) => item.code === "cycle")).toHaveLength(2);
    expect(result.roots.map((node) => node.partyId)).toContain("A");
    expect(result.roots.map((node) => node.partyId)).toContain("B");

    const valid = deriveOrganizationForest(organizations, [
      relationship("ROOT", "A"),
      relationship("A", "LEAF"),
    ], 2_000);
    expect(wouldCreateOrganizationCycle("ROOT", "LEAF", valid.parentById)).toBe(true);
    expect(wouldCreateOrganizationCycle("LEAF", "B", valid.parentById)).toBe(false);
  });
});

describe("organization mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.api.mockResolvedValue({ data: {} });
    mocks.refreshAfterMutation.mockResolvedValue(1);
    mocks.resyncDomain.mockResolvedValue(undefined);
  });

  it("creates Party, PartyGroup, internal role, and optional parent in order", async () => {
    await createOrganization({
      partyId: "new_org",
      groupName: "New Organization",
      externalId: "42",
      parentPartyId: "ROOT",
    });

    expect(mocks.api.mock.calls.map(([request]) => [request.method, request.url])).toEqual([
      ["post", "admin/organizations"],
      ["post", "admin/organizations/NEW_ORG"],
      ["post", "admin/organizations/NEW_ORG/roles"],
      ["post", "oms/partyRelationships"],
    ]);
    expect(mocks.api.mock.calls[2][0].data.roleTypeId).toBe("INTERNAL_ORGANIZATIO");
    expect(mocks.api.mock.calls[3][0].data).toEqual(expect.objectContaining({
      partyIdFrom: "ROOT",
      partyIdTo: "NEW_ORG",
      partyRelationshipTypeId: "SUB_DIVISION",
    }));
    expect(mocks.refreshAfterMutation).toHaveBeenNthCalledWith(1, "organization", { partyId: "NEW_ORG" });
    expect(mocks.refreshAfterMutation).toHaveBeenNthCalledWith(
      2,
      "organizationRelationship",
      { partyIdTo: "NEW_ORG" },
    );
  });

  it("translates organization id validation failures before displaying them", async () => {
    await expect(createOrganization({
      partyId: "",
      groupName: "",
    })).rejects.toThrow("Organization ID and name are required.");
    await expect(createOrganization({
      partyId: "THIS_IDENTIFIER_IS_TOO_LONG",
      groupName: "Long identifier",
    })).rejects.toThrow("Organization ID must be 20 characters or fewer.");
    await expect(createOrganization({
      partyId: "NOT VALID",
      groupName: "Invalid identifier",
    })).rejects.toThrow("Organization ID may contain only letters, numbers, underscores, and hyphens.");

    expect(mocks.translate.mock.calls.map(([key]) => key)).toEqual([
      "Organization ID and name are required.",
      "Organization ID must be 20 characters or fewer.",
      "Organization ID may contain only letters, numbers, underscores, and hyphens.",
    ]);
    expect(mocks.api).not.toHaveBeenCalled();
  });

  it("translates backend fallbacks and partial-commit guidance during creation", async () => {
    mocks.api
      .mockResolvedValueOnce({ data: {} })
      .mockResolvedValueOnce({ data: { _ERROR_MESSAGE_: "backend failure" } });

    const creation = createOrganization({
      partyId: "NEW_ORG",
      groupName: "New Organization",
    });
    const partialCommitMessage =
      "Failed to save the organization name. The server already saved the party; review the organization before retrying.";
    await expect(creation).rejects.toThrow(partialCommitMessage);

    expect(mocks.translate.mock.calls.map(([key]) => key)).toEqual(expect.arrayContaining([
      "Failed to create the organization party.",
      "Failed to save the organization name.",
      "Organization creation failed.",
      "The server already saved the party; review the organization before retrying.",
    ]));
    expect(mocks.resyncDomain).toHaveBeenCalledWith("organization");
    expect(mocks.resyncDomain).toHaveBeenCalledWith("organizationRelationship");
  });

  it("translates rename and hierarchy validation failures", async () => {
    mocks.api.mockResolvedValueOnce({ data: { _ERROR_MESSAGE_: "backend failure" } });
    await expect(renameOrganization("A", "Renamed")).rejects.toThrow("Failed to rename the organization.");

    const cycleMove = reparentOrganization(
      "ROOT",
      "A",
      [],
      new Map([["A", "ROOT"]]),
    );
    await expect(cycleMove).rejects.toThrow("The selected parent would create an organization cycle.");

    const ambiguousMove = reparentOrganization(
      "A",
      "B",
      [relationship("ROOT", "A"), relationship("LEAF", "A")],
      new Map(),
    );
    const ambiguousParentMessage =
      "This organization has multiple active parents. Resolve the data conflict before moving it.";
    await expect(ambiguousMove).rejects.toThrow(ambiguousParentMessage);

    expect(mocks.translate.mock.calls.map(([key]) => key)).toEqual(expect.arrayContaining([
      "Failed to rename the organization.",
      "The selected parent would create an organization cycle.",
      "This organization has multiple active parents. Resolve the data conflict before moving it.",
    ]));
  });

  it("updates and clears the external id through the Party endpoint", async () => {
    await updateOrganizationExternalId("A/B", " 42 ");

    expect(mocks.api).toHaveBeenNthCalledWith(1, {
      url: "oms/parties/A%2FB",
      method: "put",
      data: { externalId: "42" },
    });
    expect(mocks.refreshAfterMutation).toHaveBeenNthCalledWith(
      1,
      "organization",
      { partyId: "A/B" },
    );

    await updateOrganizationExternalId("A/B", " ");

    expect(mocks.api).toHaveBeenNthCalledWith(2, {
      url: "oms/parties/A%2FB",
      method: "put",
      data: { externalId: "" },
    });
  });

  it("keeps the organization cache unchanged when the subsidiary update fails", async () => {
    mocks.api.mockResolvedValueOnce({ data: { _ERROR_MESSAGE_: "backend failure" } });

    await expect(updateOrganizationExternalId("A", "42"))
      .rejects.toThrow("Failed to update external ID.");
    expect(mocks.refreshAfterMutation).not.toHaveBeenCalled();
>>>>>>> refactor/vue-views-composable-extraction-9050245222670725615
  });

  it("expires the old parent before creating and refreshing the new relationship", async () => {
    const oldRelationship = relationship("ROOT", "A");
    await reparentOrganization(
      "A",
      "B",
      [oldRelationship],
      new Map([["A", "ROOT"]]),
    );

    expect(mocks.api).toHaveBeenNthCalledWith(1, expect.objectContaining({
      method: "put",
      url: "oms/partyRelationships",
      data: expect.objectContaining({ partyIdFrom: "ROOT", partyIdTo: "A", thruDate: expect.any(Number) }),
    }));
    expect(mocks.api).toHaveBeenNthCalledWith(2, expect.objectContaining({
      method: "post",
      url: "oms/partyRelationships",
      data: expect.objectContaining({ partyIdFrom: "B", partyIdTo: "A" }),
    }));
    expect(mocks.refreshAfterMutation).toHaveBeenCalledTimes(2);
  });
});
