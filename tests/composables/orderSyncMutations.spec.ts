import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * L1 unit — what an Order Sync mutation RESOLVES TO.
 *
 * The bug this file exists for: `api()` returns a raw `AxiosResponse` (`return axios(config)`), so the
 * payload lives at `.data`. The mutations used to hand that envelope straight back to their callers,
 * and every caller verifies the write landed on the job it meant to change:
 *
 *     const updatedJob = await orderSync.updateSchedule(cronExpression, targetShopId);
 *     if (!isCurrentJob(...) || String(updatedJob?.jobName || "") !== targetJobName || …) throw …
 *
 * `envelope.jobName` is `undefined`, so that guard fired on EVERY SUCCESSFUL SAVE — the cron was
 * written to the server and the screen reported "the selected Order Sync job changed before the
 * schedule update completed". Same shape of failure for activation (`updatedJob?.paused !== false`,
 * which Moqui's truthy `"N"` also fails) and for configure (`configuredJob?.shopId`).
 *
 * So these tests assert VALUES, not shapes: the exact job name, the exact trimmed cron, `paused`
 * strictly `false`, and — as the regression lock — that the resolved object is NOT the axios envelope.
 *
 * The api client is stubbed at `@common` (importing the composable otherwise pulls `useAuth` →
 * `cookieHelper`, which has no browser context here) and the Dexie layer at `useCachedList`, which is
 * the read seam every cached entity in this composable goes through. `useServiceJobs` is deliberately
 * NOT stubbed: `updateJob`/`runNow` are the functions that produce the axios envelope, so leaving them
 * real is what makes "the envelope is unwrapped" a genuine end-to-end assertion rather than a
 * restatement of a mock.
 */

const harness = vi.hoisted(() => ({
  api: vi.fn(),
  refreshAfterMutation: vi.fn(),
}));

vi.mock("@common", () => ({
  api: (...args: any[]) => harness.api(...args),
  commonUtil: { hasError: () => false, showToast: vi.fn() },
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  translate: (value: string) => value,
}));

vi.mock("@/services/appCacheBootstrap", () => ({
  refreshAfterMutation: (...args: any[]) => harness.refreshAfterMutation(...args),
  bootstrapState: { running: false },
}));

/**
 * The cached rows this session resolves from, in the shapes the live instance holds.
 *
 * The job is named `_10010` while its `systemMessageRemoteId` parameter belongs to shop 10000 — the
 * real record, kept because it is the reason a mutation must resolve its job through the cache rather
 * than from the shop id in its own arguments.
 */
const SHOP_ID = "10000";
const OTHER_SHOP_ID = "10010";
const JOB_NAME = "queue_ShopifyOrderSync_10010";

const SHOP = { shopId: SHOP_ID, shopifyShopId: "6973849727", productStoreId: "STORE" };

const REMOTE = {
  systemMessageRemoteId: "HCDemoShopifyConfig",
  internalId: SHOP_ID,
  internalIdType: "HOTWAX_SHOP_ID",
  remoteId: "6973849727",
  remoteIdType: "SHOPIFY_SHOP_ID",
  accessScopeEnumId: "SHOP_RW_ACCESS",
};

const JOB = {
  jobName: JOB_NAME,
  cronExpression: "0 0 * ? * *",
  cronDescription: "every hour UTC time",
  paused: "Y",
  serviceJobParameters: [
    { parameterName: "systemMessageRemoteId", parameterValue: "HCDemoShopifyConfig" },
    { parameterName: "systemMessageTypeId", parameterValue: "ShopifyOrderSync" },
    { parameterName: "runAsBatch", parameterValue: "Y" },
  ],
};

const CACHE: Record<string, any[]> = {
  shops: [SHOP],
  stores: [{ productStoreId: "STORE", storeName: "HC Demo" }],
  remotes: [REMOTE],
  jobs: [JOB],
};

vi.mock("@/composables/useCachedList", () => ({
  useCachedList: (entity: any) => ({
    rows: { value: [] },
    records: { value: CACHE[entity?.__kind] ?? [] },
    hydrated: { value: true },
  }),
  useCachedRecord: () => ({ record: { value: undefined }, hydrated: { value: true } }),
  byDescription: () => 0,
}));

vi.mock("@/utils/cacheEntities", () => ({
  dataManagerLogCache: { __kind: "logs" },
  productStoreCache: { __kind: "stores" },
  serviceJobCache: { __kind: "jobs" },
  serviceJobRunCache: { __kind: "jobRuns" },
  shopifyBulkOperationCache: { __kind: "bulkOps" },
  shopifyCarrierShipmentCache: { __kind: "carrierShipments" },
  shopifyLocationCache: { __kind: "locations" },
  shopifyShopCache: { __kind: "shops" },
  shopifyTypeMappingCache: { __kind: "typeMappings" },
  syncRunCache: { __kind: "syncRuns" },
  systemMessageCache: { __kind: "messages" },
  systemMessageErrorCache: { __kind: "errors" },
  systemMessageRemoteCache: { __kind: "remotes" },
}));

vi.mock("@/composables/useSystemMessage", () => ({
  useSystemMessage: () => ({
    ensureSystemMessageById: vi.fn(),
    ensureSystemMessageErrors: vi.fn(),
    fetchShopifyBulkOperation: vi.fn(),
  }),
}));
vi.mock("@/composables/useDataManager", () => ({
  useDataManager: () => ({ ensureDataManagerLog: vi.fn() }),
  useRecentDataManagerLogs: () => ({
    logs: { value: [] }, totalFailedRecords: { value: 0 }, hydrated: { value: true },
  }),
}));
vi.mock("@/composables/useSeed", () => ({ useStatuses: () => ({ labelFor: (s: string) => s }) }));
vi.mock("@/composables/useCacheSync", () => ({ useCacheSync: () => ({ start: vi.fn(), stop: vi.fn() }) }));

import { useShopifyOrderSync } from "@/composables/useShopify";

/** What `api()` really resolves to — the envelope whose `.data` the callers were reading through. */
function axiosResponse(data: any, config: Record<string, any> = {}) {
  return { data, status: 200, statusText: "OK", headers: {}, config };
}

/** Route the stub by url so a test states only the response it cares about. */
function respondWith(routes: Array<[RegExp, any]>) {
  harness.api.mockImplementation(async (config: any) => {
    const url = String(config?.url ?? "");
    for (const [pattern, data] of routes) if (pattern.test(url)) return axiosResponse(data, config);
    throw new Error(`Unexpected request in this test: ${config?.method} ${url}`);
  });
}

const callsTo = (pattern: RegExp) =>
  harness.api.mock.calls.map(([config]: any[]) => config).filter((c: any) => pattern.test(String(c?.url)));

/** A session bound to shop 10000 — what `loadMonitoring`/`loadConfiguration` leave behind. */
function boundOrderSync() {
  const orderSync = useShopifyOrderSync();
  orderSync.resetForShop(SHOP_ID);
  return orderSync;
}

beforeEach(() => {
  harness.api.mockReset();
  harness.refreshAfterMutation.mockReset();
});

describe("updateSchedule", () => {
  it("resolves the job the configure screen's guard checks, so the guard PASSES", async () => {
    respondWith([[/admin\/serviceJobs/, {}]]);
    const orderSync = boundOrderSync();

    // The screen normalises then trims; the composable trims again, and the trimmed value is what the
    // guard compares against.
    const cronExpression = "0 */15 * ? * *";
    const updatedJob = await orderSync.updateSchedule(`  ${cronExpression}  `, SHOP_ID);

    expect(updatedJob.jobName).toBe(JOB_NAME);
    expect(updatedJob.cronExpression).toBe(cronExpression);

    // Verbatim from ShopifyOrderSyncConfigure.saveSchedule — the expression that used to be true on
    // every successful save.
    const guardFires = String(updatedJob?.jobName || "") !== JOB_NAME
      || String(updatedJob?.cronExpression || updatedJob?.cronString || "") !== cronExpression;
    expect(guardFires).toBe(false);
  });

  it("writes the trimmed cron to THIS job's admin/serviceJobs route", async () => {
    respondWith([[/admin\/serviceJobs/, {}]]);
    const orderSync = boundOrderSync();

    await orderSync.updateSchedule("  0 0 * ? * *  ", SHOP_ID);

    const [request] = callsTo(/admin\/serviceJobs/);
    expect(request.url).toBe(`admin/serviceJobs/${JOB_NAME}`);
    expect(request.data).toEqual({ jobName: JOB_NAME, cronExpression: "0 0 * ? * *" });
  });

  it("refreshes the cached serviceJob row so every screen stops showing the old cron", async () => {
    respondWith([[/admin\/serviceJobs/, {}]]);
    const orderSync = boundOrderSync();

    await orderSync.updateSchedule("0 0 * ? * *");

    expect(harness.refreshAfterMutation).toHaveBeenCalledWith("serviceJob", { jobName: JOB_NAME });
  });

  it("keeps the caller's cron even when the server echoes the OLD one", async () => {
    // A PUT that replies with the pre-write entity would otherwise make the guard fire on a write
    // that landed. The applied value wins over the response body by design.
    respondWith([[/admin\/serviceJobs/, { jobName: JOB_NAME, cronExpression: "0 0 * ? * *" }]]);
    const orderSync = boundOrderSync();

    const updatedJob = await orderSync.updateSchedule("0 */30 * ? * *", SHOP_ID);

    expect(updatedJob.cronExpression).toBe("0 */30 * ? * *");
  });

  it("refuses an empty cron without issuing a write", async () => {
    respondWith([[/admin\/serviceJobs/, {}]]);
    const orderSync = boundOrderSync();

    await expect(orderSync.updateSchedule("   ", SHOP_ID)).rejects.toThrow(/cron expression is required/i);
    expect(callsTo(/admin\/serviceJobs/)).toHaveLength(0);
  });
});

describe("updateSchedule — the AxiosResponse regression", () => {
  /**
   * The lock on the original defect. `api()` is `return axios(config)`, so what the mutation used to
   * hand back had `jobName === undefined` no matter how well the write went. Asserting the resolved
   * object side by side with the envelope the transport produced is what makes this test able to fail
   * for the original reason.
   */
  it("resolves to the JOB, never to the axios envelope", async () => {
    const body = { jobName: JOB_NAME, cronExpression: "0 0 * ? * *" };
    respondWith([[/admin\/serviceJobs/, body]]);
    const orderSync = boundOrderSync();

    const updatedJob = await orderSync.updateSchedule("0 0 * ? * *", SHOP_ID);
    const envelope = axiosResponse(body) as Record<string, any>;

    // What the caller reads, on each of the two objects.
    expect(updatedJob.jobName).toBe(JOB_NAME);
    expect(envelope.jobName).toBeUndefined();

    // And the envelope's own fields are gone — nothing is passing the transport layer upwards.
    expect(updatedJob.data).toBeUndefined();
    expect(updatedJob.status).toBeUndefined();
    expect(updatedJob.headers).toBeUndefined();
  });
});

describe("updateJobStatus", () => {
  it("activates with paused strictly false, not Moqui's truthy 'N'", async () => {
    // The server echoes the entity spelling; the boolean the caller passed must win.
    respondWith([[/admin\/serviceJobs/, { jobName: JOB_NAME, paused: "N" }]]);
    const orderSync = boundOrderSync();

    const updatedJob = await orderSync.updateJobStatus(false, SHOP_ID);

    expect(updatedJob.paused).toBe(false);
    expect(updatedJob.jobName).toBe(JOB_NAME);
    // Verbatim from ShopifyOrderSyncConfigure.activateJob. `"N"` is truthy, so the old value failed it.
    expect(updatedJob?.paused !== false).toBe(false);
  });

  it("pauses with paused strictly true", async () => {
    respondWith([[/admin\/serviceJobs/, { jobName: JOB_NAME, paused: "Y" }]]);
    const orderSync = boundOrderSync();

    const updatedJob = await orderSync.updateJobStatus(true, SHOP_ID);

    expect(updatedJob.paused).toBe(true);
  });

  it("still sends Moqui's Y/N on the wire", async () => {
    respondWith([[/admin\/serviceJobs/, {}]]);
    const orderSync = boundOrderSync();

    await orderSync.updateJobStatus(false, SHOP_ID);
    await orderSync.updateJobStatus(true, SHOP_ID);

    expect(callsTo(/admin\/serviceJobs/).map((c: any) => c.data)).toEqual([
      { jobName: JOB_NAME, paused: "N" },
      { jobName: JOB_NAME, paused: "Y" },
    ]);
  });

  it("refreshes the cached serviceJob row", async () => {
    respondWith([[/admin\/serviceJobs/, {}]]);
    const orderSync = boundOrderSync();

    await orderSync.updateJobStatus(false);

    expect(harness.refreshAfterMutation).toHaveBeenCalledWith("serviceJob", { jobName: JOB_NAME });
  });
});

describe("runNow", () => {
  it("surfaces the queued run's systemMessageId from the response body", async () => {
    respondWith([[/runNow/, { systemMessageId: "M228601", jobRunId: "JR-4412" }]]);
    const orderSync = boundOrderSync();

    const result = await orderSync.runNow();

    expect(result.systemMessageId).toBe("M228601");
    expect(result.jobRunId).toBe("JR-4412");
    expect(result.jobName).toBe(JOB_NAME);
    // The link the monitoring screen draws would be dead if the envelope came back instead.
    expect(result.data).toBeUndefined();
    // The same unwrapped result is what the session exposes to the monitoring screen.
    expect(orderSync.lastRunResult.systemMessageId).toBe("M228601");
  });

  it("posts to the resolved job's runNow route", async () => {
    respondWith([[/runNow/, {}]]);
    const orderSync = boundOrderSync();

    await orderSync.runNow({ shopId: SHOP_ID });

    expect(callsTo(/runNow/)[0].url).toBe(`admin/serviceJobs/${JOB_NAME}/runNow`);
  });
});

describe("searchShopifyOrders", () => {
  const page = (hasNextPage: boolean, endCursor: string | null) => ({
    data: {
      orders: {
        edges: [
          { node: { id: "gid://shopify/Order/1", name: "#1001" } },
          { node: { id: "gid://shopify/Order/2", name: "#1002" } },
        ],
        pageInfo: { hasNextPage, endCursor },
      },
    },
  });

  it("exposes hasNextPage/endCursor at the TOP LEVEL, where the paging loop reads them", async () => {
    respondWith([[/shopify\/graphql/, page(true, "eyJsYXN0X2lkIjoy")]]);
    const orderSync = boundOrderSync();

    const result = await orderSync.searchShopifyOrders({ queryString: "created_at:>2026-01-01" });

    expect(result.hasNextPage).toBe(true);
    expect(result.endCursor).toBe("eyJsYXN0X2lkIjoy");
    // Still nested too — the previous callers of `pageInfo` keep working.
    expect(result.pageInfo).toEqual({ hasNextPage: true, endCursor: "eyJsYXN0X2lkIjoy" });
    expect(result.orders.map((order: any) => order.name)).toEqual(["#1001", "#1002"]);
  });

  it("reports no next page as false/null when Shopify returns no pageInfo", async () => {
    respondWith([[/shopify\/graphql/, { data: { orders: { edges: [] } } }]]);
    const orderSync = boundOrderSync();

    const result = await orderSync.searchShopifyOrders({ queryString: "name:#1001" });

    expect(result.hasNextPage).toBe(false);
    expect(result.endCursor).toBeNull();
    expect(result.orders).toEqual([]);
  });

  it("pages with the cursor it just reported", async () => {
    respondWith([[/shopify\/graphql/, page(false, null)]]);
    const orderSync = boundOrderSync();

    await orderSync.searchShopifyOrders({
      queryString: "created_at:>2026-01-01", after: "eyJsYXN0X2lkIjoy", pageSize: 50,
    });

    const [request] = callsTo(/shopify\/graphql/);
    expect(request.data.systemMessageRemoteId).toBe(REMOTE.systemMessageRemoteId);
    expect(request.data.variables).toMatchObject({ first: 50, after: "eyJsYXN0X2lkIjoy" });
  });
});

describe("shop race — a mutation must refuse a shop that is not the bound one", () => {
  /**
   * Every caller captures `targetShopId` before awaiting and re-checks it afterwards, because the user
   * can switch shops mid-request. An order-sync job is matched by REMOTE, not by shop id, so resolving
   * another shop's job here is not safe — refusing is the only correct answer, and it is what turns the
   * caller's captured id into an actual guarantee rather than a comment.
   */
  const attempts: Array<[string, (orderSync: any) => Promise<unknown>]> = [
    ["updateSchedule", (o) => o.updateSchedule("0 0 * ? * *", OTHER_SHOP_ID)],
    ["updateJobStatus", (o) => o.updateJobStatus(false, OTHER_SHOP_ID)],
    ["setLandmarkDate", (o) => o.setLandmarkDate({
      key: "launchDate", value: "2026-06-11 01:40:57", shopId: OTHER_SHOP_ID,
    })],
    ["searchShopifyOrders", (o) => o.searchShopifyOrders({ queryString: "x", shopId: OTHER_SHOP_ID })],
    ["requestSelectedOrders", (o) => o.requestSelectedOrders({
      orders: [{ legacyResourceId: "1", updatedAt: "2026-07-20T10:00:00Z" }], shopId: OTHER_SHOP_ID,
    })],
    ["retryIndividualOrder", (o) => o.retryIndividualOrder({
      errorId: "E-1", shopifyOrderId: "1", shopId: OTHER_SHOP_ID,
    })],
    ["replayOrdersFromDate", (o) => o.replayOrdersFromDate({
      fromDate: "2026-07-01T00:00:00.000Z", shopId: OTHER_SHOP_ID,
    })],
    ["configure", (o) => o.configure({ shopId: OTHER_SHOP_ID })],
  ];

  for (const [name, attempt] of attempts) {
    it(`${name} throws instead of writing to the bound shop's job`, async () => {
      respondWith([[/.*/, {}]]);
      const orderSync = boundOrderSync();

      await expect(attempt(orderSync)).rejects.toThrow(/selected Shopify shop changed/);
      expect(harness.api).not.toHaveBeenCalled();
      expect(harness.refreshAfterMutation).not.toHaveBeenCalled();
    });
  }

  it("proceeds when the captured shop IS the bound one", async () => {
    respondWith([[/admin\/serviceJobs/, {}]]);
    const orderSync = boundOrderSync();

    await expect(orderSync.updateSchedule("0 0 * ? * *", SHOP_ID)).resolves.toMatchObject({
      jobName: JOB_NAME,
    });
  });
});

/**
 * `POST shopify/order-sync/{shopId}/retry` and `.../job` both return 400
 * `Cannot get property 'hotwax' on null object` on the live instance — a backend defect, not a client
 * gap — and no generic message-production route exists (`POST admin/systemMessages` and `.../produce`
 * both 405, probed live 2026-07-27). These tests pin the GENERIC alternates that replaced them:
 * configure clones the template job, and every retry path swaps the job's `fromDate` parameter, runs
 * it once, and restores the parameter (proven live: run M2399240 → message M228628).
 */
describe("configure — template clone + parameters", () => {
  const NEW_JOB_NAME = `queue_ShopifyOrderSync_${SHOP_ID}`;

  it("clones the template, parameterises the clone paused, and reports the shop", async () => {
    respondWith([[/admin\/serviceJobs/, {}]]);
    const orderSync = boundOrderSync();

    const configuredJob = await orderSync.configure({ shopId: SHOP_ID });

    const [clone, put] = callsTo(/admin\/serviceJobs/);
    expect(clone.url).toBe("admin/serviceJobs/queue_ShopifyOrderSync/clone");
    expect(clone.data).toEqual({ newJobName: NEW_JOB_NAME });
    expect(put.url).toBe(`admin/serviceJobs/${NEW_JOB_NAME}`);
    expect(put.data.paused).toBe("Y");
    expect(put.data.serviceJobParameters).toEqual([
      { parameterName: "systemMessageRemoteId", parameterValue: REMOTE.systemMessageRemoteId },
      { parameterName: "systemMessageTypeId", parameterValue: "ShopifyOrderSync" },
      { parameterName: "runAsBatch", parameterValue: "true" },
    ]);
    expect(harness.refreshAfterMutation).toHaveBeenCalledWith("serviceJob", { jobName: NEW_JOB_NAME });

    // Verbatim from ShopifyOrderSyncConfigure.configureJob.
    expect(String(configuredJob?.shopId || "") !== SHOP_ID).toBe(false);
    expect(configuredJob.jobName).toBe(NEW_JOB_NAME);
    expect(configuredJob.data).toBeUndefined();
  });
});

describe("targeted retry — the fromDate window replay", () => {
  const jobRoute = new RegExp(`admin/serviceJobs/${JOB_NAME}$`);
  const runRoute = new RegExp(`admin/serviceJobs/${JOB_NAME}/runNow$`);

  /** The three parameters the cached job row holds, with `fromDate` appended at `value`. */
  const paramsWithFromDate = (value: string | null) => [
    { parameterName: "systemMessageRemoteId", parameterValue: "HCDemoShopifyConfig" },
    { parameterName: "systemMessageTypeId", parameterValue: "ShopifyOrderSync" },
    { parameterName: "runAsBatch", parameterValue: "Y" },
    { parameterName: "fromDate", parameterValue: value },
  ];

  it("requestSelectedOrders swaps fromDate to a minute before the OLDEST selected order, runs, restores", async () => {
    respondWith([[runRoute, { jobRunId: "M2399240" }], [jobRoute, {}]]);
    const orderSync = boundOrderSync();

    const result = await orderSync.requestSelectedOrders({
      orders: [
        { legacyResourceId: "6321001", updatedAt: "2026-07-21T11:30:00Z" },
        { legacyResourceId: "6321002", updatedAt: "2026-07-20T10:00:00Z" },
      ],
      shopId: SHOP_ID,
    });

    // Swap → run → restore, in that order, all against the job resolved from the cache.
    const jobWrites = callsTo(jobRoute);
    expect(jobWrites).toHaveLength(2);
    // `yyyy-MM-dd HH:mm:ss` UTC — ISO errored live (`Timestamp format must be yyyy-mm-dd hh:mm:ss`).
    expect(jobWrites[0].data.serviceJobParameters).toEqual(paramsWithFromDate("2026-07-20 09:59:00"));
    expect(jobWrites[1].data.serviceJobParameters).toEqual(paramsWithFromDate(null));
    expect(callsTo(runRoute)).toHaveLength(1);
    expect(harness.refreshAfterMutation).toHaveBeenCalledWith("serviceJob", { jobName: JOB_NAME });

    // The result reports one covering RUN for the selected ids — there are no per-order queue ids.
    expect(result.jobRunId).toBe("M2399240");
    expect(result.queued.map((entry: any) => entry.shopifyOrderId)).toEqual(["6321001", "6321002"]);
    expect(result.failedOrderIds).toEqual([]);
  });

  it("restores the original fromDate even when the run itself fails", async () => {
    harness.api.mockImplementation(async (config: any) => {
      const url = String(config?.url ?? "");
      if (runRoute.test(url)) throw new Error("run refused");
      if (jobRoute.test(url)) return axiosResponse({}, config);
      throw new Error(`Unexpected request in this test: ${url}`);
    });
    const orderSync = boundOrderSync();

    await expect(orderSync.replayOrdersFromDate({
      fromDate: "2026-07-01T00:00:00.000Z", shopId: SHOP_ID,
    })).rejects.toThrow(/run refused/);

    const jobWrites = callsTo(jobRoute);
    expect(jobWrites).toHaveLength(2);
    expect(jobWrites[1].data.serviceJobParameters).toEqual(paramsWithFromDate(null));
  });

  it("retryIndividualOrder derives its window from the order's live updatedAt", async () => {
    respondWith([
      [/shopify\/graphql/, {
        data: { orders: { edges: [{ node: {
          id: "gid://shopify/Order/6321001", legacyResourceId: "6321001", updatedAt: "2026-07-22T08:15:30Z",
        } }], pageInfo: { hasNextPage: false, endCursor: null } } },
      }],
      [runRoute, { jobRunId: "M2399241" }],
      [jobRoute, {}],
    ]);
    const orderSync = boundOrderSync();

    const result = await orderSync.retryIndividualOrder({
      errorId: "E-1", shopifyOrderId: "6321001", shopId: SHOP_ID,
    });

    expect(callsTo(jobRoute)[0].data.serviceJobParameters).toEqual(paramsWithFromDate("2026-07-22 08:14:30"));
    expect(result.shopifyOrderId).toBe("6321001");
    expect(result.jobRunId).toBe("M2399241");
  });

  it("refuses an order Shopify no longer returns, without touching the job", async () => {
    respondWith([[/shopify\/graphql/, { data: { orders: { edges: [] } } }], [jobRoute, {}]]);
    const orderSync = boundOrderSync();

    await expect(orderSync.retryIndividualOrder({
      shopifyOrderId: "999", shopId: SHOP_ID,
    })).rejects.toThrow(/was not found/);
    expect(callsTo(jobRoute)).toHaveLength(0);
  });

  it("surfaces a server failure instead of resolving with an empty result", async () => {
    harness.api.mockRejectedValue(new Error("Cannot get property 'hotwax' on null object"));
    const orderSync = boundOrderSync();

    await expect(orderSync.requestSelectedOrders({
      orders: [{ legacyResourceId: "1", updatedAt: "2026-07-20T10:00:00Z" }], shopId: SHOP_ID,
    })).rejects.toThrow(/hotwax/);
  });
});
