import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { checkDomainWiring, checkSyncLifecycle } from "@common/db/testing/appDbWiring";
import { companyDb } from "@/db/companyDb";
import { appSyncDomains } from "@/workers/appSyncDomains";

const source = (path: string) => readFileSync(resolve(process.cwd(), "src", path), "utf8");

describe("Company app database wiring", () => {
  it("fills every table from a registered domain, and every domain's table exists", () => {
    expect(checkDomainWiring({
      tables: Object.keys(companyDb.tables),
      domains: appSyncDomains,
      filledBy: {
        netSuiteDecisionRules: "netSuiteOrderPush",
        netSuiteRuleGroupRuns: "netSuiteOrderPush",
        netSuiteOrderPushBacklog: "netSuiteOrderPush",
        shopifyFulfillmentHistorySupport: "shopifyFulfillmentHistory",
        shopifyPendingFulfillmentStatus: "shopifyPendingFulfillment",
      },
      unfilled: {
        users: "declared when the old cache was ported; nothing registers, fills or reads it",
        facilityGroupTypes: "declared when the old cache was ported; nothing registers, fills or reads it",
      },
    })).toEqual([]);
  });

  it("starts the sync on authentication, restarts it on login and stops it on logout", () => {
    expect(checkSyncLifecycle({ appVue: source("App.vue"), userStore: source("store/user.ts") })).toEqual([]);
  });
});
