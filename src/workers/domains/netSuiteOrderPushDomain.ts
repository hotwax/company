import {
  netSuiteDecisionRuleCache,
  netSuiteOrderPushBacklogCache,
  netSuiteRuleGroupCache,
  netSuiteRuleGroupRunCache,
} from "@/utils/cacheEntities";
import { keepNewerThan } from "@/utils/cacheProjection";
import { registerSyncDomain, type SyncContext } from "../syncRegistry";
import { pageNewestFirst, workerGet } from "./workerFetch";

/**
 * NetSuite order push — the live half of the sync monitor.
 *
 * One domain rather than three because the three reads are not independent: the rule groups decide
 * which run histories are worth fetching, so splitting them would mean either duplicating the group
 * read per tick or racing two domains that write caches the monitor joins.
 *
 * Per tick:
 *   1. rule groups of type RG_NS_ORDER_PUSH for the product store (small, re-read whole);
 *   2. the decision rules inside them, conditions included;
 *   3. run history per group, cursored on `startDate`;
 *   4. the pending-to-sync backlog count.
 *
 * Steps 1-2 are config that changes only when someone edits it, but they are re-read each tick
 * anyway: the whole set is two small requests, and a rule enabled in another tab has to show up here
 * without a reload for the monitor to be trustworthy.
 */

/** The rule group type Deepak's order push registers under (mantle-netsuite-connector v3.1.0). */
export const NETSUITE_ORDER_PUSH_GROUP_TYPE = "RG_NS_ORDER_PUSH";

/**
 * Rule-group statuses worth showing. Archived groups are excluded rather than filtered client-side
 * so they never enter the cache and cannot leak into a count.
 */
const ACTIVE_GROUP_STATUS = "ATP_RG_ACTIVE";

const RULE_STATUSES = ["ATP_RULE_ACTIVE", "ATP_RULE_ARCHIVED"];

export interface NetSuiteOrderPushArgs {
  /** The product store NetSuite is mapped to. Nothing syncs without it — see the guard in `sync`. */
  productStoreId?: string;
  /** Run-history depth per rule group. */
  runsPerGroup?: number;
}

/**
 * `available-to-promise/*` entity endpoints answer with a BARE ARRAY (Moqui's entity `list`
 * operation returns `ef.list().getValueMapList()` directly), unlike the service-backed endpoints
 * that wrap in a named collection.
 */
const BARE_ARRAY = null;

async function syncRuleGroups(ctx: SyncContext, productStoreId: string): Promise<any[]> {
  const resp = await workerGet(ctx, "available-to-promise/ruleGroups", {
    productStoreId,
    groupTypeEnumId: NETSUITE_ORDER_PUSH_GROUP_TYPE,
    statusId: ACTIVE_GROUP_STATUS,
    pageSize: 50,
  });
  const groups: any[] = Array.isArray(resp) ? resp : [];
  await netSuiteRuleGroupCache.upsertMany(groups);
  return groups;
}

async function syncDecisionRules(ctx: SyncContext, ruleGroupIds: string[]): Promise<number> {
  if (!ruleGroupIds.length) return 0;

  // One request for every group's rules rather than one per group: `ruleGroupId` accepts a list with
  // the `_op=in` companion, the same way the safety-stock screens read theirs.
  const resp = await workerGet(ctx, "available-to-promise/decisionRules", {
    ruleGroupId: ruleGroupIds,
    ruleGroupId_op: "in",
    statusId: RULE_STATUSES,
    statusId_op: "in",
    orderByField: "sequenceNum",
    pageSize: 200,
  });
  const rules: any[] = Array.isArray(resp) ? resp : [];
  return netSuiteDecisionRuleCache.upsertMany(rules);
}

async function syncRuns(ctx: SyncContext, ruleGroupId: string, total: number): Promise<number> {
  const cursor = await netSuiteRuleGroupRunCache.newestCursor("startDate", {
    field: "ruleGroupId",
    value: ruleGroupId,
  });

  const runs = await pageNewestFirst({
    ctx,
    url: `available-to-promise/ruleGroups/${encodeURIComponent(ruleGroupId)}/ruleGroupRuns`,
    collectionKey: BARE_ARRAY,
    total,
    batchSize: Math.min(total, 25),
    params: { orderByField: "-startDate" },
    keep: cursor === undefined ? undefined : (page) => keepNewerThan(page, "startDate", cursor),
  });

  // `ruleGroupId` IS echoed on RuleGroupRun rows (it is a real column, unlike ServiceJobRun's
  // jobName), so no stamping is needed — but a defensive fill costs nothing and keeps the per-group
  // cursor correct if a future master trims the field.
  return netSuiteRuleGroupRunCache.upsertMany(
    runs.map((run: any) => ({ ...run, ruleGroupId: run?.ruleGroupId ?? ruleGroupId })),
  );
}

/**
 * The pending-to-sync backlog.
 *
 * ⚠️ `netsuite/orderPushPending/count` is NEW in mantle-netsuite-connector — an instance that has
 * not taken that release answers 404. That is recorded as `isSupported: "N"` rather than a zero,
 * because "the OMS cannot tell me" and "there is no backlog" are opposite operational answers and a
 * monitor that renders them identically is worse than one that renders neither.
 */
async function syncBacklog(ctx: SyncContext, productStoreId: string): Promise<number> {
  let pendingCount = 0;
  let isSupported = "Y";

  try {
    const resp = await workerGet(ctx, "netsuite/orderPushPending/count", { productStoreId });
    // Moqui's entity `count` operation answers `{count: N}`; tolerate a bare number defensively.
    const raw = typeof resp === "number" ? resp : resp?.count;
    if (raw === undefined || raw === null) {
      isSupported = "N";
    } else {
      pendingCount = Number(raw) || 0;
    }
  } catch {
    // Any failure here is "unknown", not "zero". The next tick retries, so a transient blip
    // self-heals and a genuinely absent endpoint stays reported as unsupported.
    isSupported = "N";
  }

  return netSuiteOrderPushBacklogCache.upsertMany([
    { productStoreId, pendingCount, isSupported, checkedAt: Date.now() },
  ]);
}

registerSyncDomain({
  name: "netSuiteOrderPush",
  intervalMs: 15_000,
  async sync(ctx, args: NetSuiteOrderPushArgs = {}) {
    const productStoreId = String(args.productStoreId ?? "").trim();
    // No store, no scope. Reading rule groups unscoped would pull every store's NetSuite config
    // into a cache the monitor reads as "this store's", which is the same class of bug the
    // inventory domain guards against with its channel check.
    if (!productStoreId) return 0;

    let written = 0;

    const groups = await syncRuleGroups(ctx, productStoreId);
    written += groups.length;

    const ruleGroupIds = groups
      .map((group: any) => String(group?.ruleGroupId ?? ""))
      .filter(Boolean);

    written += await syncDecisionRules(ctx, ruleGroupIds);

    for (const ruleGroupId of ruleGroupIds) {
      written += await syncRuns(ctx, ruleGroupId, args.runsPerGroup ?? 25);
    }

    written += await syncBacklog(ctx, productStoreId);

    return written;
  },
});
