import { computed, type Ref } from "vue";
import { api, commonUtil, logger } from "@common";
import {
  netSuiteDecisionRuleCache,
  netSuiteOrderPushBacklogCache,
  netSuiteRuleGroupCache,
  netSuiteRuleGroupRunCache,
} from "@/utils/cacheEntities";
import { useCachedList } from "./useCachedList";

/**
 * NetSuite order-push monitoring and rule-group management.
 *
 * The order push Deepak built is a `RuleGroup` of `DecisionRule`s over the SHARED `co.hotwax.rule.*`
 * model — the same tables the safety-stock screens drive. So every write here goes through the
 * existing `available-to-promise/*` API rather than anything NetSuite-specific; the only NetSuite
 * part is the `RG_NS_ORDER_PUSH` group type that scopes the reads.
 *
 * Reads come from the cache the `netSuiteOrderPush` worker domain writes, so the monitor renders
 * with no main-thread request and updates itself as the worker ticks. Writes call the API directly
 * and then ask the worker to re-sync, because these endpoints return the stored PK rather than the
 * updated row.
 */

export const NETSUITE_ORDER_PUSH_GROUP_TYPE = "RG_NS_ORDER_PUSH";
export const RULE_GROUP_ACTIVE = "ATP_RG_ACTIVE";
export const RULE_ACTIVE = "ATP_RULE_ACTIVE";
export const RULE_ARCHIVED = "ATP_RULE_ARCHIVED";

/**
 * `RuleCondition.conditionTypeEnumId` values — and there are TWO live conventions for them.
 *
 * `ENTCT_ATP_FILTER` / `ENTCT_ATP_SORT_BY` are the rule-engine's own, seeded by
 * `DE_ExtSeed_AE_AtpSeedData.xml` and written by the ATP screens and the `available-to-promise`
 * API. Every NetSuite order-push rule created through that API therefore carries these.
 *
 * `ENTCT_FILTER` / `ENTCT_SORT_BY` belong to poorti's pick profiles — a different component.
 *
 * ⚠️ `co.hotwax.netsuite.OrderServices.run#NetSuiteOrderFeedRule` matches only the POORTI pair, so a
 * rule authored through the normal ATP API has its conditions silently ignored by the feed: the
 * template renders with no filters and exports every eligible order in the store. Verified on
 * rails-uat, where rule M100102's `orderDate > ...` condition is `ENTCT_ATP_FILTER` and is dropped.
 *
 * Both are accepted HERE so the screen shows the operator what is actually stored. Displaying a
 * condition does not mean the feed honours it — that is a backend fix.
 */
export const FILTER_CONDITION_TYPES = ["ENTCT_ATP_FILTER", "ENTCT_FILTER"];
export const SORT_CONDITION_TYPES = ["ENTCT_ATP_SORT_BY", "ENTCT_SORT_BY"];

/** The pair `run#NetSuiteOrderFeedRule` actually honours today. */
export const FEED_HONOURED_FILTER_TYPE = "ENTCT_FILTER";
export const FEED_HONOURED_SORT_TYPE = "ENTCT_SORT_BY";

// =============================================================================================
// Reads — all cache-backed, all reactive
// =============================================================================================

/**
 * The pending-to-sync backlog for a store.
 *
 * `isSupported` is deliberately surfaced instead of being collapsed into the number: the count
 * endpoint ships in a newer mantle-netsuite-connector, and an instance without it must render
 * "unavailable", never "0". A zero backlog and an unanswerable question look identical in a bare
 * integer and mean opposite things to whoever is on call.
 */
export function useNetSuiteOrderPushBacklog(productStoreId: () => string | undefined) {
  const { records, hydrated } = useCachedList<any>(netSuiteOrderPushBacklogCache);

  const row = computed<any>(() => {
    const wanted = String(productStoreId() ?? "");
    if (!wanted) return undefined;
    return records.value.find((entry: any) => String(entry?.productStoreId ?? "") === wanted);
  });

  return {
    row,
    hydrated,
    isSupported: computed<boolean>(() => row.value?.isSupported !== "N"),
    /** `undefined` when unknown — callers must not coerce this to 0. */
    pendingCount: computed<number | undefined>(() =>
      row.value && row.value.isSupported !== "N" ? Number(row.value.pendingCount ?? 0) : undefined),
    checkedAt: computed<number | undefined>(() => row.value?.checkedAt),
  };
}

/** NetSuite order-push rule groups for a store, sequence order. */
export function useNetSuiteRuleGroups(productStoreId: () => string | undefined) {
  const { records, hydrated } = useCachedList<any>(netSuiteRuleGroupCache);

  const groups = computed<any[]>(() => {
    const wanted = String(productStoreId() ?? "");
    if (!wanted) return [];
    return records.value
      .filter((group: any) =>
        String(group?.productStoreId ?? "") === wanted
        && group?.groupTypeEnumId === NETSUITE_ORDER_PUSH_GROUP_TYPE)
      .sort((a: any, b: any) => Number(a?.sequenceNum ?? 0) - Number(b?.sequenceNum ?? 0));
  });

  return { groups, hydrated };
}

/**
 * Rules in a group, sequence order — the order the push actually evaluates them in.
 *
 * Archived rules are kept in the cache but split out here: the monitor shows active rules as the
 * live configuration and archived ones only on request, matching how the safety-stock screen
 * separates them.
 */
export function useNetSuiteDecisionRules(ruleGroupId: () => string | undefined) {
  const { records, hydrated } = useCachedList<any>(netSuiteDecisionRuleCache);

  const all = computed<any[]>(() => {
    const wanted = String(ruleGroupId() ?? "");
    if (!wanted) return [];
    return records.value
      .filter((rule: any) => String(rule?.ruleGroupId ?? "") === wanted)
      .sort((a: any, b: any) => Number(a?.sequenceNum ?? 0) - Number(b?.sequenceNum ?? 0));
  });

  return {
    rules: computed<any[]>(() => all.value.filter((rule: any) => rule?.statusId === RULE_ACTIVE)),
    archivedRules: computed<any[]>(() => all.value.filter((rule: any) => rule?.statusId === RULE_ARCHIVED)),
    all,
    hydrated,
  };
}

/**
 * Every cached rule grouped by its rule group — what the group list's per-row rule count reads.
 *
 * Separate from `useNetSuiteDecisionRules` on purpose: that one is scoped to a single group and
 * correctly returns nothing when given no id, so it cannot double as an "all groups" read.
 */
export function useNetSuiteRulesByGroup() {
  const { records, hydrated } = useCachedList<any>(netSuiteDecisionRuleCache);

  const byGroup = computed<Record<string, any[]>>(() => {
    const grouped: Record<string, any[]> = {};
    for (const rule of records.value) {
      if (rule?.statusId !== RULE_ACTIVE) continue;
      (grouped[String(rule?.ruleGroupId ?? "")] ||= []).push(rule);
    }
    return grouped;
  });

  return {
    byGroup,
    hydrated,
    countFor: (ruleGroupId: string) => byGroup.value[ruleGroupId]?.length ?? 0,
  };
}

/**
 * Run history for a group, newest first.
 *
 * ⚠️ Empty does NOT mean "never ran" — see the warning on `netSuiteRuleGroupRunProjection`. Only the
 * rule-group scheduler writes these rows; a group invoked as a plain ServiceJob leaves job runs and
 * MDM logs instead. The monitor says so rather than rendering a bare "no runs".
 */
export function useNetSuiteRuleGroupRuns(ruleGroupId: () => string | undefined, limit = 25) {
  const { records, hydrated } = useCachedList<any>(netSuiteRuleGroupRunCache, { dateField: "startDate" });

  const runs = computed<any[]>(() => {
    const wanted = String(ruleGroupId() ?? "");
    if (!wanted) return [];
    return records.value
      .filter((run: any) => String(run?.ruleGroupId ?? "") === wanted)
      .slice(0, limit);
  });

  return {
    runs,
    hydrated,
    latest: computed<any>(() => runs.value[0]),
    failed: computed<any[]>(() => runs.value.filter((run: any) => run?.hasError === "Y")),
  };
}

/** Every cached run across the store's groups, newest first — the monitor's activity feed. */
export function useNetSuiteRecentRuns(ruleGroupIds: () => string[], limit = 25) {
  const { records, hydrated } = useCachedList<any>(netSuiteRuleGroupRunCache, { dateField: "startDate" });

  const runs = computed<any[]>(() => {
    const wanted = new Set(ruleGroupIds().filter(Boolean).map(String));
    if (!wanted.size) return [];
    return records.value
      .filter((run: any) => wanted.has(String(run?.ruleGroupId ?? "")))
      .slice(0, limit);
  });

  return { runs, hydrated, failed: computed<any[]>(() => runs.value.filter((run: any) => run?.hasError === "Y")) };
}

// =============================================================================================
// Writes — `available-to-promise/*`, the same endpoints the safety-stock screens use
// =============================================================================================

function unwrap<T = any>(resp: any): T {
  if (commonUtil.hasError(resp)) throw resp?.data ?? resp;
  return resp?.data as T;
}

export function useNetSuiteRuleGroupMutations() {
  /** Create or update a rule group. Moqui's `store` operation covers both. */
  async function saveRuleGroup(payload: Record<string, any>) {
    const resp = await api({
      url: "available-to-promise/ruleGroups",
      method: "POST",
      data: {
        groupTypeEnumId: NETSUITE_ORDER_PUSH_GROUP_TYPE,
        statusId: RULE_GROUP_ACTIVE,
        ...payload,
      },
    });
    return unwrap(resp);
  }

  /** Create or update a rule. Conditions are sent nested, as the safety-stock screens send theirs. */
  async function saveRule(payload: Record<string, any>) {
    const resp = await api({
      url: "available-to-promise/decisionRules",
      method: "POST",
      data: payload,
    });
    return unwrap(resp);
  }

  /**
   * Enable or disable a rule.
   *
   * Archiving rather than deleting is the model's own convention — `RULE_ARCHIVED` keeps the rule and
   * its conditions for audit, and the push only ever reads `ATP_RULE_ACTIVE`.
   */
  async function setRuleEnabled(ruleId: string, enabled: boolean) {
    const resp = await api({
      url: `available-to-promise/decisionRules/${encodeURIComponent(ruleId)}`,
      method: "POST",
      data: { ruleId, statusId: enabled ? RULE_ACTIVE : RULE_ARCHIVED },
    });
    return unwrap(resp);
  }

  async function deleteCondition(ruleId: string, conditionSeqId: string) {
    const resp = await api({
      url: `available-to-promise/decisionRules/${encodeURIComponent(ruleId)}/conditions`,
      method: "delete",
      data: { ruleId, conditionSeqId },
    });
    return unwrap(resp);
  }

  /**
   * Run a group now.
   *
   * This schedules the group's job through the rule engine rather than invoking the NetSuite feed
   * service directly, so the run is recorded and picked up by the monitor like any scheduled run.
   */
  async function runNow(ruleGroupId: string) {
    const resp = await api({
      url: `available-to-promise/ruleGroups/${encodeURIComponent(ruleGroupId)}/runNow`,
      method: "POST",
    });
    return unwrap(resp);
  }

  async function fetchSchedule(ruleGroupId: string) {
    try {
      const resp = await api({
        url: `available-to-promise/ruleGroups/${encodeURIComponent(ruleGroupId)}/schedule`,
        method: "GET",
      }) as any;
      return resp?.data?.schedule ?? null;
    } catch (error) {
      logger.error("Failed to read NetSuite rule group schedule", ruleGroupId, error);
      return null;
    }
  }

  async function saveSchedule(payload: Record<string, any>) {
    const resp = await api({
      url: `available-to-promise/ruleGroups/${encodeURIComponent(payload.ruleGroupId)}/schedule`,
      method: "POST",
      data: payload,
    });
    return unwrap(resp);
  }

  return { saveRuleGroup, saveRule, setRuleEnabled, deleteCondition, runNow, fetchSchedule, saveSchedule };
}

// =============================================================================================
// Presentation helpers
// =============================================================================================

/**
 * A rule's filter conditions rendered as readable clauses.
 *
 * The stored shape is the raw SQL fragment input (`fieldName`, `operator`, `fieldValue`) that
 * `EligibleOrdersQuery.sql.ftl` assembles through `MaargUtil.makeSqlWhere`. Showing that verbatim is
 * how an operator confirms a rule matches what they meant, so this formats rather than interprets.
 */
export function describeConditions(rule: any): string[] {
  const conditions: any[] = Array.isArray(rule?.ruleConditions) ? rule.ruleConditions : [];
  return conditions
    .filter((condition: any) => FILTER_CONDITION_TYPES.includes(condition?.conditionTypeEnumId))
    .sort((a: any, b: any) => Number(a?.sequenceNum ?? 0) - Number(b?.sequenceNum ?? 0))
    .map((condition: any) => {
      const field = String(condition?.fieldName ?? "").trim();
      const operator = String(condition?.joinOperator || condition?.operator || "equals").trim();
      const value = String(condition?.fieldValue ?? "").trim();
      return [field, operator, value].filter(Boolean).join(" ");
    })
    .filter(Boolean);
}

/** The sort clauses a rule applies, in order. */
export function describeSortBy(rule: any): string[] {
  const conditions: any[] = Array.isArray(rule?.ruleConditions) ? rule.ruleConditions : [];
  return conditions
    .filter((condition: any) => SORT_CONDITION_TYPES.includes(condition?.conditionTypeEnumId))
    .sort((a: any, b: any) => Number(a?.sequenceNum ?? 0) - Number(b?.sequenceNum ?? 0))
    .map((condition: any) => String(condition?.fieldName ?? "").trim())
    .filter(Boolean);
}

/**
 * Conditions the feed will silently ignore — those not carrying the enum
 * `run#NetSuiteOrderFeedRule` matches on.
 *
 * Surfaced in the UI because the failure is invisible otherwise: the rule looks configured, the run
 * succeeds, and the only symptom is that far more orders were exported than the rule described.
 */
export function ignoredConditions(rule: any): string[] {
  const conditions: any[] = Array.isArray(rule?.ruleConditions) ? rule.ruleConditions : [];
  return conditions
    .filter((condition: any) => {
      const type = condition?.conditionTypeEnumId;
      const known = FILTER_CONDITION_TYPES.includes(type) || SORT_CONDITION_TYPES.includes(type);
      const honoured = type === FEED_HONOURED_FILTER_TYPE || type === FEED_HONOURED_SORT_TYPE;
      return known && !honoured;
    })
    .map((condition: any) => String(condition?.fieldName ?? "").trim())
    .filter(Boolean);
}

/** Milliseconds a run took, or `undefined` while it is still going. */
export function runDurationMs(run: any): number | undefined {
  const start = Number(run?.startDate ?? 0);
  const end = Number(run?.endDate ?? 0);
  if (!start || !end || end < start) return undefined;
  return end - start;
}

export type RuleGroupRef = Ref<string | undefined>;
