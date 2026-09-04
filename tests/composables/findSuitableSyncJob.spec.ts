import { describe, expect, it, vi } from "vitest";

/**
 * Same boundary stub as the other composable specs: importing `useShopify` pulls `@common` →
 * `useAuth` → `cookieHelper`, which needs a browser. The matcher itself is pure.
 */
vi.mock("@common", () => ({
  api: vi.fn(),
  commonUtil: { hasError: () => false, showToast: vi.fn() },
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  translate: (value: string) => value,
}));

import {
  ORDER_SYNC_FEATURE,
  PRODUCT_SYNC_FEATURE,
  findSuitableSyncJob,
  isSuitableSyncJob,
} from "@/composables/useShopify";

/**
 * L1 unit — which ServiceJob belongs to which shop.
 *
 * This is the single most dangerous decision either sync screen makes: pick the wrong job and an
 * operator edits another shop's schedule, pauses another shop's sync, or runs it on demand. The rule
 * is that the answer comes from the job's PARAMETERS and never from its name.
 *
 * That is not a stylistic preference. On the live instance, `queue_ShopifyOrderSync_10010` carries
 * `systemMessageRemoteId=HCDemoShopifyConfig`, whose shop is 10000 — the numeric suffix is not the
 * shop id. A `${template}_${shopId}` convention would hand shop 10010 a job that drives shop 10000.
 * The first test below is that exact record.
 */

const param = (name: string, value: unknown) => ({ parameterName: name, parameterValue: value });

/** Shaped like the cached row: `serviceJobParameters` comes back on the LIST endpoint. */
const orderJob = (jobName: string, parameters: Array<Record<string, unknown>>) => ({
  jobName,
  serviceJobParameters: parameters,
});

describe("isSuitableSyncJob — order sync", () => {
  const wellFormed = [
    param("systemMessageRemoteId", "HCDemoShopifyConfig"),
    param("systemMessageTypeId", "ShopifyOrderSync"),
    param("runAsBatch", "Y"),
  ];

  it("matches on the remote parameter, ignoring a name suffix that says otherwise", () => {
    // The real row: named _10010, parameterised for the remote owned by shop 10000.
    const job = orderJob("queue_ShopifyOrderSync_10010", wellFormed);

    expect(isSuitableSyncJob(job, ORDER_SYNC_FEATURE, { remoteId: "HCDemoShopifyConfig" })).toBe(true);
  });

  it("does NOT match the shop its name suggests", () => {
    const job = orderJob("queue_ShopifyOrderSync_10010", wellFormed);

    expect(isSuitableSyncJob(job, ORDER_SYNC_FEATURE, { remoteId: "SomeOtherRemote" })).toBe(false);
  });

  it("rejects the template job itself, which belongs to no shop", () => {
    const job = orderJob("queue_ShopifyOrderSync", wellFormed);

    expect(isSuitableSyncJob(job, ORDER_SYNC_FEATURE, { remoteId: "HCDemoShopifyConfig" })).toBe(false);
  });

  it("rejects a clone that is not a batch run", () => {
    const job = orderJob("queue_ShopifyOrderSync_a", [
      param("systemMessageRemoteId", "HCDemoShopifyConfig"),
      param("systemMessageTypeId", "ShopifyOrderSync"),
      param("runAsBatch", "N"),
    ]);

    expect(isSuitableSyncJob(job, ORDER_SYNC_FEATURE, { remoteId: "HCDemoShopifyConfig" })).toBe(false);
  });

  it("rejects a clone driving a different message type on the same remote", () => {
    const job = orderJob("queue_ShopifyOrderSync_b", [
      param("systemMessageRemoteId", "HCDemoShopifyConfig"),
      param("systemMessageTypeId", "ShopifyOrderCancel"),
      param("runAsBatch", "Y"),
    ]);

    expect(isSuitableSyncJob(job, ORDER_SYNC_FEATURE, { remoteId: "HCDemoShopifyConfig" })).toBe(false);
  });

  it("returns false rather than guessing when no remote is resolved yet", () => {
    const job = orderJob("queue_ShopifyOrderSync_10010", wellFormed);

    expect(isSuitableSyncJob(job, ORDER_SYNC_FEATURE, {})).toBe(false);
    expect(isSuitableSyncJob(job, ORDER_SYNC_FEATURE, { remoteId: "" })).toBe(false);
  });

  it("accepts a clone that declares its template explicitly instead of by name prefix", () => {
    const job = { ...orderJob("nightly_orders_west", wellFormed), parentJobName: "queue_ShopifyOrderSync" };

    expect(isSuitableSyncJob(job, ORDER_SYNC_FEATURE, { remoteId: "HCDemoShopifyConfig" })).toBe(true);
  });
});

describe("isSuitableSyncJob — product sync", () => {
  it("matches on shopId, because that is what its descriptor says to match on", () => {
    const job = {
      jobName: "sync_ShopifyProductUpdates_x",
      serviceJobParameters: [param("shopId", "10000")],
    };

    expect(isSuitableSyncJob(job, PRODUCT_SYNC_FEATURE, { shopId: "10000" })).toBe(true);
    expect(isSuitableSyncJob(job, PRODUCT_SYNC_FEATURE, { shopId: "10010" })).toBe(false);
  });

  it("ignores a remoteId, since product sync jobs are not parameterised by remote", () => {
    const job = {
      jobName: "sync_ShopifyProductUpdates_x",
      serviceJobParameters: [param("shopId", "10000")],
    };

    expect(isSuitableSyncJob(job, PRODUCT_SYNC_FEATURE, { remoteId: "10000" })).toBe(false);
  });
});

describe("findSuitableSyncJob", () => {
  const jobs = [
    orderJob("queue_ShopifyOrderSync", [param("systemMessageTypeId", "ShopifyOrderSync")]),
    orderJob("queue_ShopifyOrderSync_10010", [
      param("systemMessageRemoteId", "HCDemoShopifyConfig"),
      param("systemMessageTypeId", "ShopifyOrderSync"),
      param("runAsBatch", "Y"),
    ]),
    orderJob("queue_ShopifyOrderSync_10000", [
      param("systemMessageRemoteId", "OtherShopifyConfig"),
      param("systemMessageTypeId", "ShopifyOrderSync"),
      param("runAsBatch", "Y"),
    ]),
  ];

  it("picks the job whose parameters match, not the one whose name matches", () => {
    const found = findSuitableSyncJob(jobs, ORDER_SYNC_FEATURE, { remoteId: "OtherShopifyConfig" });

    expect(found?.jobName).toBe("queue_ShopifyOrderSync_10000");
  });

  it("returns null when the shop has no job, so the screen can offer to configure one", () => {
    expect(findSuitableSyncJob(jobs, ORDER_SYNC_FEATURE, { remoteId: "UnconfiguredRemote" })).toBeNull();
  });

  it("returns null for an empty job cache rather than throwing", () => {
    expect(findSuitableSyncJob([], ORDER_SYNC_FEATURE, { remoteId: "HCDemoShopifyConfig" })).toBeNull();
  });
});
