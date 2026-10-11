import { describe, expect, it, vi } from "vitest";
import { computed, ref } from "vue";

const records = ref<any[]>([]);

vi.mock("@common", () => ({
  api: vi.fn(),
  commonUtil: { hasError: () => false },
  logger: { error: vi.fn() },
  useDb: () => ({ records, hydrated: ref(true), first: computed(() => records.value[0]) }),
}));

describe("useNetSuiteRuleGroups", () => {
  it("does not render a group that is no longer active, even before the worker prunes it", async () => {
    const { useNetSuiteRuleGroups } = await import("@/composables/useNetSuiteSync");
    records.value = [
      { ruleGroupId: "G1", productStoreId: "STORE", groupTypeEnumId: "RG_NS_ORDER_PUSH", statusId: "ATP_RG_ACTIVE", sequenceNum: 1 },
      { ruleGroupId: "G2", productStoreId: "STORE", groupTypeEnumId: "RG_NS_ORDER_PUSH", statusId: "ATP_RG_ARCHIVED", sequenceNum: 2 },
      // A row with no status echoed is the active read's own row, so it still renders.
      { ruleGroupId: "G3", productStoreId: "STORE", groupTypeEnumId: "RG_NS_ORDER_PUSH", sequenceNum: 3 },
    ];

    const { groups } = useNetSuiteRuleGroups(() => "STORE");

    expect(groups.value.map((group: any) => group.ruleGroupId)).toEqual(["G1", "G3"]);
  });
});
