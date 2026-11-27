import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

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
 * `cookieHelper`, which has no browser context here) and the Dexie layer at `useLiveEntity`, which is
 * the read seam every cached entity in this composable goes through. `useServiceJobs` is deliberately
 * NOT stubbed: `updateJob`/`runNow` are the functions that produce the axios envelope, so leaving them
 * real is what makes "the envelope is unwrapped" a genuine end-to-end assertion rather than a
 * restatement of a mock.
 */

const harness = vi.hoisted(() => ({
  api: vi.fn(),
  search: vi.fn(),
  refreshAfterMutation: vi.fn(),
  connectorVersion: "4.4.0",
  shopsHydrated: null as ReturnType<typeof ref<boolean>> | null,
}));

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

const TABLE_TO_CACHE_KEY: Record<string, string> = {
  shopifyShops: "shops",
  productStores: "stores",
  systemMessageRemotes: "remotes",
  serviceJobs: "jobs",
  shops: "shops",
  stores: "stores",
  remotes: "remotes",
  jobs: "jobs",
};

vi.mock("@common", () => ({
  api: (...args: any[]) => harness.api(...args),
  useSolrSearch: () => ({ runSolrQuery: harness.search }),
  commonUtil: { hasError: () => false, showToast: vi.fn() },
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  translate: (value: string) => value,
  useLiveEntity: (entity: any, selectorOrOptions?: any) => {
    const raw = typeof entity === "string" ? entity : String(entity?.name ?? entity?.__kind ?? "");
    const key = TABLE_TO_CACHE_KEY[raw] || raw;
    let records = CACHE[key] ?? [];
    if (typeof selectorOrOptions === "function") {
      const criteria = selectorOrOptions();
      if (criteria?.equals) {
        records = records.filter((row: any) =>
          Object.entries(criteria.equals).every(([k, v]) => String(row?.[k]) === String(v))
        );
      }
    } else if (selectorOrOptions?.equals) {
      records = records.filter((row: any) =>
        Object.entries(selectorOrOptions.equals).every(([k, v]) => String(row?.[k]) === String(v))
      );
    } else if (selectorOrOptions?.scope) {
      const { field, value } = selectorOrOptions.scope;
      records = records.filter((row: any) => String(row?.[field]) === String(value));
    }
    return {
      rows: { value: [] },
      records: { value: records },
      first: { value: records[0] },
      count: { value: records.length },
      hydrated: key === "shops" && harness.shopsHydrated ? harness.shopsHydrated : { value: true },
    };
  },
}));

vi.mock("@/db/appDbSync", () => ({
  refreshAfterMutation: (...args: any[]) => harness.refreshAfterMutation(...args),
  bootstrapState: { running: false },
  activateSyncDomains: vi.fn().mockResolvedValue(undefined),
  deactivateSyncDomains: vi.fn().mockResolvedValue(undefined),
  syncNow: vi.fn().mockResolvedValue(undefined),
  syncDomainsError: ref(""),
}));


vi.mock("@/composables/useSystemMessage", () => ({
  useSystemMessage: () => ({
    requestSystemMessage: vi.fn(),
    requestSystemMessageErrors: vi.fn(),
    requestShopifyBulkOperation: vi.fn(),
  }),
}));
vi.mock("@/composables/useDataManager", () => ({
  useDataManager: () => ({ requestDataManagerLog: vi.fn() }),
  useRecentDataManagerLogs: () => ({
    logs: { value: [] }, totalFailedRecords: { value: 0 }, hydrated: { value: true },
  }),
}));
vi.mock("@/composables/useSeed", () => ({
  useStatuses: () => ({ labelFor: (s: string) => s }),
  useMaargConfig: () => ({ load: async () => {}, componentVersion: () => ref(harness.connectorVersion) }),
}));
import { normalizeLogOutcome, useShopifyOrderSync } from "@/composables/useShopify";
import { CacheReconciliationError } from "@/utils/db/cacheReconciliationError";

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
  harness.shopsHydrated = null;
  harness.connectorVersion = "4.4.0";
  harness.api.mockReset();
  harness.search.mockReset().mockResolvedValue(axiosResponse({ grouped: { orderId: { groups: [] } } }));
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

  // A run cannot be taken back: reporting it failed because only the cache refresh after it failed
  // invites the user to run the job a second time.
  it("resolves the queued run when only the cache refresh after it fails", async () => {
    respondWith([[/runNow/, { systemMessageId: "M228601" }]]);
    harness.refreshAfterMutation.mockRejectedValue(new CacheReconciliationError("serviceJob", { jobName: JOB_NAME }));
    const orderSync = boundOrderSync();

    const result = await orderSync.runNow({ shopId: SHOP_ID });

    expect(result.systemMessageId).toBe("M228601");
    expect(orderSync.error).toBe("");
  });

  it("still rejects when the run itself is refused", async () => {
    harness.api.mockRejectedValue(new Error("run refused"));
    const orderSync = boundOrderSync();

    await expect(orderSync.runNow({ shopId: SHOP_ID })).rejects.toThrow(/run refused/);
    expect(harness.refreshAfterMutation).not.toHaveBeenCalled();
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

  it("unwraps the LIVE proxy envelope, which nests the body under `response`, not `data`", async () => {
    // The real `shopify/graphql` proxy returns `{ response: { orders: … } }`. The `data`-shaped
    // fixtures above kept passing while every live search returned [] — found by QA driving the
    // search modal against the running backend.
    respondWith([[/shopify\/graphql/, {
      response: {
        orders: {
          edges: [{ node: { id: "gid://shopify/Order/6475855265946", legacyResourceId: "6475855265946", name: "HC#2690" } }],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    }]]);
    const orderSync = boundOrderSync();

    const result = await orderSync.searchShopifyOrders({ queryString: "name:HC#2690" });

    expect(result.orders.map((order: any) => order.name)).toEqual(["HC#2690"]);
    expect(result.hasNextPage).toBe(false);
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
    ["requestSelectedOrders", (o) => o.requestSelectedOrders({ ids: ["1"], shopId: OTHER_SHOP_ID })],
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

describe("on-demand order imports", () => {
  it("imports only the selected shop and IDs, once each, and reports unconfirmed orders", async () => {
    harness.api.mockResolvedValueOnce(axiosResponse({ orderId: "O1" })).mockRejectedValueOnce(new Error("upstream unavailable"))
      .mockResolvedValueOnce(axiosResponse({}));
    const result = await boundOrderSync().requestSelectedOrders({ ids: ["11", "12", "11", "13"], shopId: SHOP_ID });
    expect(result).toEqual({ imported: 1, failed: ["12", "13"] });
    expect(harness.api.mock.calls.map(([r]) => [r.url, r.data])).toEqual(["11", "12", "13"].map(shopifyOrderId =>
      ["sob/orders/import", { shopId: SHOP_ID, shopifyOrderId }]));
  });

  it("collects every page of the same updated-time window before importing, without editing the job", async () => {
    const page = (ids: string[], next: string | null) => axiosResponse({ response: { orders: {
      edges: ids.map(legacyResourceId => ({ node: { legacyResourceId } })),
      pageInfo: { hasNextPage: !!next, endCursor: next },
    } } });
    harness.api.mockResolvedValueOnce(page(["10"], "cursor")).mockResolvedValueOnce(page(["10", "20"], null))
      .mockResolvedValue(axiosResponse({ orderId: "OMS" }));
    expect(await boundOrderSync().replayOrdersFromDate({ fromDate: "2026-01-01T00:00:00Z", shopId: SHOP_ID }))
      .toEqual({ imported: 2, failed: [] });
    const calls = harness.api.mock.calls.map(([r]) => r);
    expect(calls.map(r => r.url)).toEqual(["shopify/graphql", "shopify/graphql", "sob/orders/import", "sob/orders/import"]);
    expect(calls[0].data.variables.query).toContain("updated_at:>='2026-01-01T00:00:00.000Z' updated_at:<=");
    expect(calls[1].data.variables).toEqual({ ...calls[0].data.variables, after: "cursor" });
  });

  it("does not import an incomplete search or report it as an empty replay", async () => {
    respondWith([[/shopify\/graphql/, { errors: [{ message: "Access denied" }] }]]);
    await expect(boundOrderSync().replayOrdersFromDate({ fromDate: "2026-01-01", shopId: SHOP_ID })).rejects.toThrow();
    expect(callsTo(/orders\/import/)).toHaveLength(0);
  });
});

describe("processed order history", () => {
  it("reads the connector's shop-scoped history array and primary OMS mapping", async () => {
    const sync = boundOrderSync();
    const row = { shopId: SHOP_ID, shopifyOrderId: "123", shopifyOrderName: "#321", lastUpdatedStamp: 12000, primaryOrder: { orderId: "O1" } };
    const timestamps = { orderId: "O1", orderDate: "2026-11-27T20:51:39Z", entryDate: "2026-11-27T20:54:50Z" };
    harness.search.mockResolvedValueOnce(axiosResponse({ grouped: { orderId: { groups: [{ doclist: { docs: [timestamps] } }] } } }));
    harness.api.mockResolvedValueOnce(axiosResponse([row, { ...row, shopId: OTHER_SHOP_ID }]));
    await sync.loadHistory(SHOP_ID);
    expect(harness.api).toHaveBeenCalledWith({ method: "get", url: `sob/shopify/syncHistory/${SHOP_ID}/order`,
      params: { pageSize: 100, orderByField: "-lastUpdatedStamp,shopifyOrderId" } });
    expect(sync.recentOrders).toEqual([{ shopId: SHOP_ID, shopifyOrderId: "123", orderName: "#321", orderId: "O1", historyUpdatedAt: 12000, orderDate: timestamps.orderDate, importedAt: timestamps.entryDate }]);
    expect(harness.search.mock.calls[0][0].json.filter).toContain("{!terms f=orderId}O1");
    expect(sync.historySource).toBe("history");
  });

  it("shows only confirmed Shopify mappings from the current shop on older connectors", async () => {
    harness.connectorVersion = "4.3.19";
    const sync = boundOrderSync();
    const node = { orderId: "O1", orderName: "#321", orderDate: "2026-11-27", shopifyOrder: { shopId: SHOP_ID, shopifyOrderId: "123" } };
    const nodes = [node, { ...node, shopifyOrder: null }, { ...node, shopifyOrder: { shopId: OTHER_SHOP_ID, shopifyOrderId: "456" } }];
    const data = { orders: { edges: nodes.map(node => ({ node })) } };
    harness.search.mockRejectedValueOnce(new Error("Index unavailable"));
    harness.api.mockResolvedValueOnce(axiosResponse({ data }));
    await sync.loadHistory(SHOP_ID);
    expect(harness.api.mock.calls.map(([config]) => [config.url, config.data.variables])).toEqual([
      ["graphql", { filter: 'productStoreId:"STORE" orderTypeId:SALES_ORDER', limit: 100 }],
    ]);
    expect(sync.recentOrders).toEqual([{ shopId: SHOP_ID, shopifyOrderId: "123", orderId: "O1", orderName: "#321", orderDate: "2026-11-27" }]);
    expect(sync.historySource).toBe("orders");
    harness.api.mockResolvedValueOnce(axiosResponse({ data, errors: [{ message: "Partial response" }] }));
    await sync.loadHistory(SHOP_ID);
    expect(sync.historyError).toBe(true);
    expect(sync.recentOrders).toHaveLength(1);
  });

  it("waits for the shop cache on direct navigation before querying OMS", async () => {
    harness.connectorVersion = "4.3.19";
    harness.shopsHydrated = ref(false);
    const sync = boundOrderSync();
    harness.api.mockResolvedValueOnce(axiosResponse({ data: { orders: { edges: [] } } }));
    const pending = sync.loadHistory(SHOP_ID);
    await Promise.resolve();
    expect(harness.api).not.toHaveBeenCalled();
    harness.shopsHydrated.value = true;
    await pending;
    expect(sync.historySource).toBe("orders");
    expect(sync.historyError).toBe(false);
  });

  it("distinguishes unavailable from a successful empty response", async () => {
    const sync = boundOrderSync();
    harness.api.mockRejectedValueOnce(new Error("404")).mockResolvedValueOnce(axiosResponse([]));
    await sync.loadHistory(SHOP_ID);
    expect(sync.historyError).toBe(true);
    await sync.loadHistory(SHOP_ID);
    expect(sync.historyError).toBe(false);
    expect(sync.recentOrders).toEqual([]);
  });
  it("ignores a previous shop's response", async () => {
    const sync = boundOrderSync();
    let finish!: (data: any) => void;
    harness.api.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = sync.loadHistory(SHOP_ID);
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    sync.resetForShop(OTHER_SHOP_ID);
    finish(axiosResponse({ invalid: true }));
    await pending;
    expect(sync.historyError).toBe(false);
  });
});

describe("order import outcomes", () => {
  it("only displays failed import logs linked to the selected shop's batch requests", () => {
    const message = { systemMessageTypeId: "ShopifyOrderSync", systemMessageRemoteId: REMOTE.systemMessageRemoteId };
    CACHE.systemMessages = [{ ...message, systemMessageId: "ours" }, { ...message, systemMessageId: "other", systemMessageRemoteId: "other-remote" }];
    CACHE.dataManagerLogs = ["ours", "other", "unlinked"].map(systemMessageId => ({
      systemMessageId, logId: systemMessageId, configId: "SYNC_SHOPIFY_ORDER", statusId: "DmlsCrashed",
    }));
    try {
      expect(boundOrderSync().failedDataManagerLogs.map(log => log.logId)).toEqual(["ours"]);
    } finally {
      delete CACHE.systemMessages;
      delete CACHE.dataManagerLogs;
    }
  });

  it("does not count unprocessed records as succeeded for a crashed import or override a reported zero", () => {
    const counts = { totalRecordCount: 12, failedRecordCount: 3 };
    expect(normalizeLogOutcome({ ...counts, statusId: "DmlsCrashed" })).toMatchObject({ state: "failed", successful: 0 });
    expect(normalizeLogOutcome({ ...counts, statusId: "DmlsFinished", successRecordCount: 0 })).toMatchObject({ state: "failed", successful: 0 });
    expect(normalizeLogOutcome({ ...counts, statusId: "DmlsFinished" })).toMatchObject({ state: "partial", successful: 9 });
  });
});
