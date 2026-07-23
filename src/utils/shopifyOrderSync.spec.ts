import { describe, expect, it } from "vitest";
import {
  deriveOrderSyncConfigurationState,
  deriveOrderSyncErrorResolution,
  deriveOrderSyncMappingReadiness,
  deriveShopifyOrderSyncOverallState,
  deriveShopifyOrderSyncProgress,
  extractOrderErrorRecordDetails,
  findSuitableShopifyOrderSyncJob,
  getShopifyOrderSyncCapabilities,
  getShopifyOrderSyncPollingDelay,
  isSuitableShopifyOrderSyncJob,
  normalizeRecentOrderErrors,
  normalizeRecentProcessedOrders,
  searchLoadedOrderErrors,
  searchLoadedProcessedOrders
} from "./shopifyOrderSync";

describe("Shopify Order Sync job readiness", () => {
  const remote = { systemMessageRemoteId: "SHOPIFY_10010", internalId: "10010" };
  const suitableJob = {
    jobName: "queue_ShopifyOrderSync_10010",
    parentJobName: "queue_ShopifyOrderSync",
    paused: "Y",
    serviceJobParameters: [
      { parameterName: "systemMessageRemoteId", parameterValue: "SHOPIFY_10010" },
      { parameterName: "systemMessageTypeId", parameterValue: "ShopifyOrderSync" },
      { parameterName: "runAsBatch", parameterValue: "true" }
    ]
  };

  it("requires clone provenance, the selected shop remote, and the order-sync message type", () => {
    expect(isSuitableShopifyOrderSyncJob(suitableJob, remote)).toBe(true);
    expect(isSuitableShopifyOrderSyncJob({ ...suitableJob, parentJobName: "another_template" }, remote)).toBe(false);
    expect(isSuitableShopifyOrderSyncJob({
      ...suitableJob,
      serviceJobParameters: [
        { parameterName: "systemMessageRemoteId", parameterValue: "SHOPIFY_OTHER" },
        { parameterName: "systemMessageTypeId", parameterValue: "ShopifyOrderSync" },
        { parameterName: "runAsBatch", parameterValue: "true" }
      ]
    }, remote)).toBe(false);
    expect(isSuitableShopifyOrderSyncJob({
      ...suitableJob,
      serviceJobParameters: [
        { parameterName: "systemMessageRemoteId", parameterValue: "SHOPIFY_10010" },
        { parameterName: "systemMessageTypeId", parameterValue: "BulkOrderHistoryQuery" },
        { parameterName: "runAsBatch", parameterValue: "true" }
      ]
    }, remote)).toBe(false);
    expect(isSuitableShopifyOrderSyncJob({
      ...suitableJob,
      serviceJobParameters: suitableJob.serviceJobParameters.filter(({ parameterName }) => parameterName !== "runAsBatch")
    }, remote)).toBe(false);
  });

  it("finds an existing equivalent job, including legacy clones named from the standard template", () => {
    const legacyClone = {
      jobName: "queue_ShopifyOrderSync_10010",
      parameters: {
        remoteId: "SHOPIFY_10010",
        messageTypeId: "ShopifyOrderSync",
        runAsBatch: "true"
      }
    };
    expect(findSuitableShopifyOrderSyncJob([
      { jobName: "queue_ShopifyOrderSync" },
      { ...legacyClone, parameters: { remoteId: "SHOPIFY_OTHER", messageTypeId: "ShopifyOrderSync", runAsBatch: "true" } },
      legacyClone
    ], remote)).toBe(legacyClone);
  });

  it("keeps loading, API error, missing, paused, and active states distinct", () => {
    expect(deriveOrderSyncConfigurationState({ loading: true }).kind).toBe("loading");
    expect(deriveOrderSyncConfigurationState({ error: new Error("offline") }).kind).toBe("error");
    expect(deriveOrderSyncConfigurationState({ error: "offline" }).kind).not.toBe("missing");
    expect(deriveOrderSyncConfigurationState({}).kind).toBe("missing");
    expect(deriveOrderSyncConfigurationState({ job: suitableJob }).kind).toBe("configured-paused");
    expect(deriveOrderSyncConfigurationState({ job: { ...suitableJob, paused: "N" } }).kind).toBe("configured-active");
  });
});

describe("Shopify Order Sync mapping readiness", () => {
  it("reports exactly the three confirmed families as non-blocking warnings", () => {
    const readiness = deriveOrderSyncMappingReadiness({
      selectedShopId: "10010",
      typeMappings: [
        { shopId: "10010", mappedTypeId: "SHOPIFY_ORDER_SOURCE" },
        { shopId: "other", mappedTypeId: "SHOPIFY_PAYMENT_TYPE" },
        { shopId: "10010", mappedTypeId: "SHOPIFY_PRODUCT_TYPE" }
      ],
      shippingMethodMappings: []
    });

    expect(readiness.families.map(({ id }) => id)).toEqual([
      "sales-channel",
      "payment-method",
      "shipping-method"
    ]);
    expect(readiness.families.map(({ ready }) => ready)).toEqual([true, false, false]);
    expect(readiness.warnings).toEqual([
      "Payment Method mapping is missing.",
      "Shipping Method mapping is missing."
    ]);
    expect(readiness.blocking).toBe(false);
    expect(readiness.hasWarnings).toBe(true);
  });

  it("accepts the existing carrier-shipment mapping family without treating Product Type as order readiness", () => {
    const readiness = deriveOrderSyncMappingReadiness({
      salesChannelMappings: true,
      paymentMethodMappings: 2,
      shipmentMethodMappings: [{ shopId: "10010", carrierPartyId: "UPS" }]
    });
    expect(readiness.allReady).toBe(true);
    expect(readiness.warnings).toEqual([]);
  });
});

describe("Shopify Order Sync two-row progress", () => {
  it("derives Completed with zero orders when a consumed batch produced no MDM logs", () => {
    const rows = deriveShopifyOrderSyncProgress({ statusId: "SmsgConsumed" }, []);
    expect(rows).toHaveLength(2);
    expect(rows.map(({ id }) => id)).toEqual(["batch-request", "hotwax-import"]);
    expect(rows[1]).toMatchObject({ state: "completed", successfulRecords: 0, failedRecords: 0, logCount: 0 });
    expect(rows[1].stateLabel).toBe("Completed · 0 orders");
  });

  it("treats the connector's sent state with no imports as a completed zero-change batch", () => {
    const rows = deriveShopifyOrderSyncProgress({ statusId: "SmsgSent" }, []);
    expect(rows[0].state).toBe("completed");
    expect(rows[1]).toMatchObject({ state: "completed", successfulRecords: 0, logCount: 0 });
  });

  it("aggregates one completed MDM import", () => {
    const rows = deriveShopifyOrderSyncProgress({ statusId: "confirmed" }, [{
      logId: "new-1",
      configId: "SYNC_SHOPIFY_ORDER",
      statusId: "Completed",
      totalRecordCount: 3,
      failedRecordCount: 0
    }]);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      state: "completed",
      totalRecords: 3,
      successfulRecords: 3,
      failedRecords: 0,
      logCount: 1,
      configIds: ["SYNC_SHOPIFY_ORDER"]
    });
  });

  it("keeps two MDM imports visible as a partial outcome and deduplicates repeated log responses", () => {
    const createdLog = {
      logId: "new-1",
      configId: "SYNC_SHOPIFY_ORDER",
      statusId: "Completed",
      totalRecordCount: 2,
      failedRecordCount: 0
    };
    const rows = deriveShopifyOrderSyncProgress({ statusId: "SmsgConsumed" }, [
      createdLog,
      createdLog,
      {
        logId: "update-1",
        configId: "UPDATE_SHOPIFY_ORDER",
        statusId: "Failed",
        totalRecordCount: 1,
        failedRecordCount: 1
      }
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      state: "partial",
      totalRecords: 3,
      successfulRecords: 2,
      failedRecords: 1,
      logCount: 2,
      configIds: ["SYNC_SHOPIFY_ORDER", "UPDATE_SHOPIFY_ORDER"]
    });
    expect(rows[1].stateLabel).toContain("Partially completed");
  });

  it("keeps the import active until every related MDM log is terminal", () => {
    const rows = deriveShopifyOrderSyncProgress({ statusId: "SmsgSent" }, [
      {
        logId: "new-failed",
        configId: "SYNC_SHOPIFY_ORDER",
        statusId: "DmlsFailed",
        totalRecordCount: 1,
        failedRecordCount: 1
      },
      {
        logId: "update-pending",
        configId: "UPDATE_SHOPIFY_ORDER",
        statusId: "DmlsPending",
        totalRecordCount: 0,
        failedRecordCount: 0
      }
    ]);

    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      state: "active",
      stateLabel: "In progress",
      successfulRecords: 0,
      failedRecords: 1,
      logCount: 2
    });
  });

  it.each(["DmlsFailed", "DmlsCrashed", "DmlsCancelled"])(
    "treats terminal %s imports as failed",
    (statusId) => {
      const rows = deriveShopifyOrderSyncProgress({ statusId: "SmsgSent" }, [{
        logId: `failed-${statusId}`,
        configId: "SYNC_SHOPIFY_ORDER",
        statusId,
        totalRecordCount: 0,
        failedRecordCount: 0
      }]);

      expect(rows[1]).toMatchObject({ state: "failed", logCount: 1 });
    }
  );
});

describe("Shopify Order Sync overall run state", () => {
  const state = (batchState: string, importState: string) => deriveShopifyOrderSyncOverallState(
    { state: batchState as never },
    { state: importState as never }
  );

  it("keeps a pending or active batch request as the overall state", () => {
    expect(state("pending", "pending")).toBe("pending");
    expect(state("active", "pending")).toBe("active");
  });

  it("stays active while the import has not reached a terminal state", () => {
    expect(state("completed", "active")).toBe("active");
    expect(state("completed", "pending")).toBe("active");
  });

  it("mirrors the terminal import outcome once the request completed", () => {
    expect(state("completed", "completed")).toBe("completed");
    expect(state("completed", "partial")).toBe("partial");
    expect(state("completed", "failed")).toBe("failed");
  });

  it("downgrades a failed request to partial only when the import still landed records", () => {
    expect(state("failed", "completed")).toBe("partial");
    expect(state("failed", "partial")).toBe("partial");
    expect(state("failed", "failed")).toBe("failed");
  });
});

describe("Shopify Order Sync error resolution guidance", () => {
  it("maps every safe error projection to a distinct operator next step", () => {
    const safeMessages = [
      "Duplicate or conflicting order data prevented import.",
      "Required order data is missing.",
      "A required order mapping is unavailable.",
      "Shopify order validation failed.",
      "The order import service failed.",
      "Shopify order import failed.",
      "Shopify order request failed before import.",
      "Error details could not be safely read.",
    ];

    const nextSteps = safeMessages.map((errorText) => deriveOrderSyncErrorResolution({ errorText }).nextStep);

    expect(new Set(nextSteps).size).toBe(safeMessages.length);
    nextSteps.forEach((nextStep) => expect(nextStep.length).toBeGreaterThan(10));
  });

  it("routes only the missing-mapping category to Order Sync setup review", () => {
    const mapping = deriveOrderSyncErrorResolution({ errorText: "A required order mapping is unavailable." });

    expect(mapping.needsSetupReview).toBe(true);
    expect(mapping.nextStep).toContain("Order Sync setup");
    expect(deriveOrderSyncErrorResolution({ errorText: "Shopify order import failed." }).needsSetupReview).toBe(false);
  });

  it("explains the withheld-error safety boundary instead of hiding it", () => {
    const withheld = deriveOrderSyncErrorResolution({ errorText: "Error details could not be safely read." });

    expect(withheld.nextStep).toContain("withheld");
    expect(withheld.nextStep).toContain("DataManager run");
  });

  it("falls back to a diagnostic next step for unknown or empty error text", () => {
    const unknown = deriveOrderSyncErrorResolution({ errorText: "Some raw backend text" });
    const empty = deriveOrderSyncErrorResolution({ errorText: "" });

    expect(unknown.nextStep).toBe("Open the import and SystemMessage details to diagnose this record.");
    expect(empty.nextStep).toBe(unknown.nextStep);
    expect(unknown.needsSetupReview).toBe(false);
  });
});

describe("Shopify Order Sync failed record extraction", () => {
  const records = [
    { payload: "{\"order\":{\"id\":\"gid://shopify/Order/6475855265946\",\"name\":\"HC#2690\"}}", _ERROR_MESSAGE_: "Payment method mapping SHOPIFY_PAYMENT_TYPE not found for gift_card" },
    { payload: "{\"order\":{\"id\":\"gid://shopify/Order/1111\",\"name\":\"HC#1\"}}", errorMessage: "Different failure" },
  ];

  it("matches the failed record by Shopify order ID inside the serialized payload", () => {
    const details = extractOrderErrorRecordDetails(records, { shopifyOrderId: "6475855265946", orderName: "" });

    expect(details.record).toBe(records[0]);
    expect(details.message).toBe("Payment method mapping SHOPIFY_PAYMENT_TYPE not found for gift_card");
  });

  it("matches by order name when the ID is unresolved and reads alternate message keys", () => {
    const details = extractOrderErrorRecordDetails(records, { shopifyOrderId: "", orderName: "HC#1" });

    expect(details.record).toBe(records[1]);
    expect(details.message).toBe("Different failure");
  });

  it("falls back to a sole record and reports no match otherwise", () => {
    const sole = [{ errorText: "only failure" }];
    expect(extractOrderErrorRecordDetails(sole, { shopifyOrderId: "", orderName: "" }).message).toBe("only failure");

    const unmatched = extractOrderErrorRecordDetails(records, { shopifyOrderId: "999999", orderName: "" });
    expect(unmatched.record).toBeNull();
    expect(unmatched.message).toBe("");
  });
});

describe("bounded recent Shopify order records", () => {
  it("returns the selected shop's globally newest 100 successful create/update audits", () => {
    const audits = Array.from({ length: 105 }, (_, index) => ({
      auditId: `audit-${index}`,
      shopId: "10010",
      shopifyOrderId: `shopify-${index}`,
      orderId: `order-${index}`,
      outcome: index % 2 ? "Updated" : "Created",
      configId: index % 2 ? "UPDATE_SHOPIFY_ORDER" : "SYNC_SHOPIFY_ORDER",
      logId: `log-${index}`,
      processedDate: new Date(Date.UTC(2026, 6, 22, 10, index)).toISOString(),
      systemMessageId: `message-${index}`,
      shopifyFetchVerified: index % 3 === 0
    }));
    // Add a newer record from another shop and an exact duplicate; neither may displace valid rows.
    audits.push({ ...audits[104], auditId: "other-shop", shopId: "other", processedDate: "2026-07-23T00:00:00Z" });
    audits.push({ ...audits[104] });

    const rows = normalizeRecentProcessedOrders(audits, { shopId: "10010" });
    expect(rows).toHaveLength(100);
    expect(rows[0].id).toBe("audit-104");
    expect(rows[99].id).toBe("audit-5");
    expect(new Set(rows.map(({ outcome }) => outcome))).toEqual(new Set(["Created", "Updated"]));
    expect(rows.every((row, index) => index === 0 || rows[index - 1].processedAtMillis >= row.processedAtMillis)).toBe(true);
  });

  it("shows only selected-shop audits with canonical batch, config, and DataManager log correlation", () => {
    const correlatedAudit = {
      auditId: "correlated",
      shopId: "10010",
      shopifyOrderId: "123456",
      outcome: "Created",
      configId: "SYNC_SHOPIFY_ORDER",
      dataManagerLogId: "log-1",
      systemMessageId: "message-1",
      processedDate: "2026-07-22T12:00:00Z",
      shopifyFetchVerified: true
    };
    const incompleteOrCrossShop = [
      { ...correlatedAudit, auditId: "wrong-shop", shopId: "other" },
      { ...correlatedAudit, auditId: "missing-message", systemMessageId: "", messageId: "message-alias" },
      { ...correlatedAudit, auditId: "missing-config", configId: "", dataManagerConfigId: "SYNC_SHOPIFY_ORDER" },
      { ...correlatedAudit, auditId: "missing-log", dataManagerLogId: "", importId: "log-alias" },
      { ...correlatedAudit, auditId: "unsupported-config", configId: "BULK_ORDER_HISTORY" },
      { ...correlatedAudit, auditId: "missing-provenance", shopifyFetchVerified: undefined }
    ];

    expect(normalizeRecentProcessedOrders([correlatedAudit, ...incompleteOrCrossShop])).toEqual([]);
    expect(normalizeRecentProcessedOrders([correlatedAudit, ...incompleteOrCrossShop], { shopId: "10010" }))
      .toEqual([expect.objectContaining({
        id: "correlated",
        shopId: "10010",
        systemMessageId: "message-1",
        configId: "SYNC_SHOPIFY_ORDER",
        logId: "log-1",
        outcome: "Created",
        shopifyFetchVerified: true
      })]);

    expect(normalizeRecentProcessedOrders([{
      ...correlatedAudit,
      auditId: "create-config-updated-order",
      outcome: "Updated",
      shopifyFetchVerified: false
    }], { shopId: "10010" })).toEqual([
      expect.objectContaining({
        id: "create-config-updated-order",
        configId: "SYNC_SHOPIFY_ORDER",
        outcome: "Updated",
        shopifyFetchVerified: false
      })
    ]);
  });

  it("aggregates globally newest errors across multiple new/update files and retains their context", () => {
    const makeRecords = (prefix: string, count: number, baseMinute: number) => Array.from({ length: count }, (_, index) => ({
      errorId: `${prefix}-${index}`,
      shopifyOrderId: String((prefix === "new" ? 100_000 : 200_000) + index),
      errorMessage: `${prefix} failed ${index}`,
      errorDate: new Date(Date.UTC(2026, 6, 22, 10, baseMinute + index)).toISOString()
    }));
    const rows = normalizeRecentOrderErrors([
      {
        shopId: "10010",
        configId: "SYNC_SHOPIFY_ORDER",
        logId: "new-log",
        systemMessageId: "batch-message",
        jobRunId: "batch-run",
        records: makeRecords("new", 60, 0)
      },
      {
        shopId: "10010",
        configId: "UPDATE_SHOPIFY_ORDER",
        logId: "update-log",
        systemMessageId: "batch-message",
        jobRunId: "batch-run",
        errorRecords: makeRecords("update", 60, 30)
      }
    ], { shopId: "10010" });

    expect(rows).toHaveLength(100);
    expect(rows[0]).toMatchObject({
      configId: "UPDATE_SHOPIFY_ORDER",
      logId: "update-log",
      systemMessageId: "batch-message",
      batchId: "batch-run",
      retryable: true
    });
    expect(rows[0].id).toContain("UPDATE_SHOPIFY_ORDER|update-log|batch-run|batch-message|update-59");
    expect(new Set(rows.map(({ configId }) => configId))).toEqual(new Set([
      "SYNC_SHOPIFY_ORDER",
      "UPDATE_SHOPIFY_ORDER"
    ]));
    expect(rows.every((row, index) => index === 0 || rows[index - 1].occurredAtMillis >= row.occurredAtMillis)).toBe(true);
  });

  it("searches only the already loaded rows and preserves newest-first order", () => {
    const processed = normalizeRecentProcessedOrders([
      {
        auditId: "2", shopId: "10010", shopifyOrderId: "gid://shopify/Order/222", orderName: "#222",
        outcome: "Updated", configId: "UPDATE_SHOPIFY_ORDER", logId: "log-2", systemMessageId: "message-2",
        orderId: "HOTWAX-222", processedDate: "2026-07-22T12:00:00Z", shopifyFetchVerified: true
      },
      {
        auditId: "1", shopId: "10010", shopifyOrderId: "gid://shopify/Order/111", orderName: "#111",
        outcome: "Created", configId: "SYNC_SHOPIFY_ORDER", logId: "log-1", systemMessageId: "message-1",
        orderId: "HOTWAX-111", processedDate: "2026-07-22T11:00:00Z", shopifyFetchVerified: false
      }
    ], { shopId: "10010" });
    const errors = normalizeRecentOrderErrors([
      { errorId: "e2", shopifyOrderId: "222", errorText: "Postal code invalid", errorDate: "2026-07-22T12:00:00Z" },
      { errorId: "e1", shopifyOrderId: "111", errorText: "Payment missing", errorDate: "2026-07-22T11:00:00Z" }
    ]);

    expect(searchLoadedProcessedOrders(processed, "222").map(({ id }) => id)).toEqual(["2"]);
    expect(searchLoadedProcessedOrders(processed, "#111").map(({ id }) => id)).toEqual(["1"]);
    expect(searchLoadedProcessedOrders(processed, "created")).toEqual([]);
    expect(searchLoadedProcessedOrders(processed, "HOTWAX-222")).toEqual([]);
    expect(searchLoadedProcessedOrders(processed, "message-1")).toEqual([]);
    expect(searchLoadedProcessedOrders(processed, "SYNC_SHOPIFY_ORDER")).toEqual([]);
    expect(searchLoadedOrderErrors(errors, "postal").map(({ id }) => id)).toEqual([errors[0].id]);
    expect(searchLoadedProcessedOrders(processed, "")).toEqual(processed);
  });

  it("never treats a generic HotWax order ID as a Shopify-resolvable retry target", () => {
    const [genericOrder] = normalizeRecentOrderErrors([{
      errorId: "e-hotwax",
      orderId: "10000",
      errorText: "Payment missing"
    }]);
    const [shopifyOrder] = normalizeRecentOrderErrors([{
      errorId: "e-shopify",
      shopifyOrderId: "gid://shopify/Order/123456",
      errorText: "Payment missing"
    }]);

    expect(genericOrder.retryable).toBe(false);
    expect(genericOrder.shopifyOrderId).toBe("");
    expect(shopifyOrder.retryable).toBe(true);
  });

  it("requires explicit Shopify provenance and a positive identifier of at most 30 digits for retry", () => {
    const values = normalizeRecentOrderErrors([
      { errorId: "numeric", shopifyOrderId: "123456", errorText: "numeric" },
      { errorId: "gid", orderShopifyId: "gid://shopify/Order/987654", errorText: "gid" },
      { errorId: "max", shopifyOrderId: "123456789012345678901234567890", errorText: "max" },
      { errorId: "zero", shopifyOrderId: "0", errorText: "zero" },
      { errorId: "zero-gid", shopifyOrderId: "gid://shopify/Order/000", errorText: "zero-gid" },
      { errorId: "too-long", shopifyOrderId: "1234567890123456789012345678901", errorText: "too-long" },
      { errorId: "external", externalOrderId: "123456", errorText: "external" },
      { errorId: "generic-shopify", shopifyId: "gid://shopify/Order/123456", errorText: "generic-shopify" },
      { errorId: "legacy", legacyResourceId: "123456", errorText: "legacy" },
      {
        shopifyOrderId: "123456",
        records: [{ errorId: "child-without-provenance", externalOrderId: "123456", errorText: "child-without-provenance" }]
      }
    ]);
    const byError = Object.fromEntries(values.map((row) => [row.errorText, row]));

    expect(byError.numeric.retryable).toBe(true);
    expect(byError.gid.retryable).toBe(true);
    expect(byError.max.retryable).toBe(true);
    expect(byError.zero.retryable).toBe(false);
    expect(byError["zero-gid"].retryable).toBe(false);
    expect(byError["too-long"].retryable).toBe(false);
    expect(byError.external).toMatchObject({ shopifyOrderId: "", retryable: false });
    expect(byError["generic-shopify"]).toMatchObject({ shopifyOrderId: "", retryable: false });
    expect(byError.legacy).toMatchObject({ shopifyOrderId: "", retryable: false });
    expect(byError["child-without-provenance"]).toMatchObject({ shopifyOrderId: "", retryable: false });
  });

  it("includes config, log, and batch context in stable error IDs", () => {
    const rows = normalizeRecentOrderErrors([
      {
        shopId: "10010",
        configId: "SYNC_SHOPIFY_ORDER",
        logId: "create-log",
        batchId: "batch-1",
        systemMessageId: "message-1",
        records: [{ errorId: "record-7", shopifyOrderId: "123456", errorText: "same error" }]
      },
      {
        shopId: "10010",
        configId: "UPDATE_SHOPIFY_ORDER",
        logId: "update-log",
        batchId: "batch-2",
        systemMessageId: "message-2",
        records: [{ errorId: "record-7", shopifyOrderId: "123456", errorText: "same error" }]
      }
    ], { shopId: "10010" });

    expect(rows).toHaveLength(2);
    expect(new Set(rows.map(({ id }) => id)).size).toBe(2);
    expect(rows.map(({ id }) => id)).toEqual(expect.arrayContaining([
      "10010|SYNC_SHOPIFY_ORDER|create-log|batch-1|message-1|record-7",
      "10010|UPDATE_SHOPIFY_ORDER|update-log|batch-2|message-2|record-7"
    ]));
  });
});

describe("polling lifecycle and permissions", () => {
  it("polls every 10 seconds while active, 60 seconds while idle, and stops off-page", () => {
    expect(getShopifyOrderSyncPollingDelay({ pageActive: true, batchActive: true })).toBe(10_000);
    expect(getShopifyOrderSyncPollingDelay({ pageActive: true, batchActive: false })).toBe(60_000);
    expect(getShopifyOrderSyncPollingDelay({ pageActive: false, batchActive: true })).toBeNull();
  });

  it("keeps monitoring broad and restricts all mutations to COMMON_ADMIN", () => {
    expect(getShopifyOrderSyncCapabilities([])).toEqual({
      canMonitor: true,
      canConfigure: false,
      canActivate: false,
      canEditSchedule: false,
      canRunNow: false,
      canRetryIndividualOrder: false
    });
    expect(getShopifyOrderSyncCapabilities(new Set(["COMMON_ADMIN"]))).toEqual({
      canMonitor: true,
      canConfigure: true,
      canActivate: true,
      canEditSchedule: true,
      canRunNow: true,
      canRetryIndividualOrder: true
    });
  });

  it("does not grant mutations for normalized or near-match permission IDs", () => {
    for (const nearMatch of ["common_admin", "COMMON-ADMIN", "COMMONADMIN", " COMMON_ADMIN ", "COMMON_ADMIN_EXTRA"]) {
      expect(getShopifyOrderSyncCapabilities([nearMatch])).toMatchObject({
        canMonitor: true,
        canConfigure: false,
        canActivate: false,
        canEditSchedule: false,
        canRunNow: false,
        canRetryIndividualOrder: false
      });
      expect(getShopifyOrderSyncCapabilities(new Set([nearMatch])).canRunNow).toBe(false);
    }
  });
});
