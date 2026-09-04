import { describe, expect, it } from "vitest";

import {
  findSuitable,
  isPaused,
  isSuitable,
  lifecycleState,
  parameterMap,
  type ServiceJob,
  type ServiceJobSuitability,
} from "@/utils/serviceJob";

/** L1 pure behaviors for the ServiceJob entity — no mocks, no DOM. */

const makeJob = (over: Partial<ServiceJob>): ServiceJob => ({
  jobName: "queue_ShopifyOrderSync_10010",
  parentJobName: "queue_ShopifyOrderSync",
  paused: "N",
  serviceJobParameters: [
    { parameterName: "systemMessageRemoteId", parameterValue: "SHOPIFY_10010" },
    { parameterName: "systemMessageTypeId", parameterValue: "ShopifyOrderSync" },
    { parameterName: "runAsBatch", parameterValue: "true" },
  ],
  ...over,
});

const orderSync: ServiceJobSuitability = {
  templateJobName: "queue_ShopifyOrderSync",
  remoteId: "SHOPIFY_10010",
  messageType: "ShopifyOrderSync",
  requireBatch: true,
};

describe("parameterMap", () => {
  it("maps parameter rows to a name → value lookup", () => {
    expect(parameterMap(makeJob({}))).toEqual({
      systemMessageRemoteId: "SHOPIFY_10010",
      systemMessageTypeId: "ShopifyOrderSync",
      runAsBatch: "true",
    });
  });

  it("returns an empty map for a missing job or no parameters", () => {
    expect(parameterMap(null)).toEqual({});
    expect(parameterMap(makeJob({ serviceJobParameters: undefined }))).toEqual({});
  });
});

describe("isPaused", () => {
  it("reads the exact Y/N indicator", () => {
    expect(isPaused(makeJob({ paused: "Y" }))).toBe(true);
    expect(isPaused(makeJob({ paused: "N" }))).toBe(false);
    expect(isPaused(makeJob({ paused: undefined }))).toBe(false);
    expect(isPaused(null)).toBe(false);
  });
});

describe("isSuitable", () => {
  it("accepts a job cloned by declared parent with matching remote, type, and batch", () => {
    expect(isSuitable(makeJob({}), orderSync)).toBe(true);
  });

  it("accepts a legacy clone named from the template even without declared provenance", () => {
    expect(isSuitable(makeJob({ parentJobName: undefined, jobName: "queue_ShopifyOrderSync_10010" }), orderSync)).toBe(true);
  });

  it("rejects the template job itself", () => {
    expect(isSuitable(makeJob({ jobName: "queue_ShopifyOrderSync", parentJobName: undefined }), orderSync)).toBe(false);
  });

  it("rejects a job cloned from a different template", () => {
    expect(isSuitable(makeJob({ parentJobName: "queue_Other", jobName: "queue_Other_1" }), orderSync)).toBe(false);
  });

  it("rejects the wrong remote, wrong message type, or a missing batch flag", () => {
    expect(isSuitable(makeJob({}), { ...orderSync, remoteId: "SHOPIFY_99999" })).toBe(false);
    expect(isSuitable(makeJob({ serviceJobParameters: [{ parameterName: "systemMessageRemoteId", parameterValue: "SHOPIFY_10010" }, { parameterName: "systemMessageTypeId", parameterValue: "BulkOrderHistoryQuery" }, { parameterName: "runAsBatch", parameterValue: "true" }] }), orderSync)).toBe(false);
    expect(isSuitable(makeJob({ serviceJobParameters: [{ parameterName: "systemMessageRemoteId", parameterValue: "SHOPIFY_10010" }, { parameterName: "systemMessageTypeId", parameterValue: "ShopifyOrderSync" }] }), orderSync)).toBe(false);
  });

  it("skips the batch check when it is not required", () => {
    const noBatch = makeJob({ serviceJobParameters: [{ parameterName: "systemMessageRemoteId", parameterValue: "SHOPIFY_10010" }, { parameterName: "systemMessageTypeId", parameterValue: "ShopifyOrderSync" }] });
    expect(isSuitable(noBatch, { ...orderSync, requireBatch: false })).toBe(true);
  });

  it("rejects when the scope has no remote", () => {
    expect(isSuitable(makeJob({}), { ...orderSync, remoteId: "" })).toBe(false);
  });
});

describe("findSuitable", () => {
  it("returns the first suitable job, or null when none match", () => {
    const other = makeJob({ jobName: "queue_Other_1", parentJobName: "queue_Other" });
    expect(findSuitable([other, makeJob({})], orderSync)?.jobName).toBe("queue_ShopifyOrderSync_10010");
    expect(findSuitable([other], orderSync)).toBeNull();
  });
});

describe("lifecycleState", () => {
  it("maps missing / paused / active", () => {
    expect(lifecycleState(null)).toBe("missing");
    expect(lifecycleState(makeJob({ paused: "Y" }))).toBe("paused");
    expect(lifecycleState(makeJob({ paused: "N" }))).toBe("active");
  });
});
