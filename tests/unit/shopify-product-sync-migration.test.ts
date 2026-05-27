import assert from "assert";

const setUnitMock = (global as any).__setUnitMock;

setUnitMock("@/api", { default: async () => ({ data: {} }) });
setUnitMock("@/logger", { default: { warn: () => undefined, error: () => undefined } });
setUnitMock("@/config/productSyncMigration", {
  PRODUCT_SYNC_MIGRATION_CONFIG: {
    minimumComponentRelease: "product-sync",
    incoming: {
      serviceJobs: {},
      systemMessageTypes: {},
      dataManagerConfig: ""
    },
    outgoing: {
      systemMessageTypes: [],
      serviceJobs: []
    }
  },
  isProductSyncMigrationEligibleRelease: () => true
});
setUnitMock("@/services/ShopifyProductSyncService", {
  ShopifyProductSyncService: {}
});

const {
  buildLegacySystemMessageItem,
  describeLegacyServiceJobState,
  describeLegacySystemMessageTypeState
} = require("../../src/services/ShopifyProductSyncMigrationService");

describe("shopify product sync migration state", () => {
  test("marks service jobs partially deactivated when only one teardown field changed", () => {
    const pausedOnly = describeLegacyServiceJobState({
      jobName: "poll_SystemMessageFileSftp_ShopifyNewProductsFeed",
      paused: "Y",
      serviceName: "org.hotwax.shopify.LegacyPoll"
    });

    assert.equal(pausedOnly.status, "partial");
    assert.equal(pausedOnly.note, "Job is paused. Service still points to org.hotwax.shopify.LegacyPoll.");
  });

  test("describes service job teardown only when both pause and service cleanup are complete", () => {
    const deactivated = describeLegacyServiceJobState({
      jobName: "poll_SystemMessageFileSftp_ShopifyNewProductsFeed",
      paused: "Y",
      serviceName: "_NA_",
      description: "Legacy poll job"
    });

    assert.equal(deactivated.status, "deactivated");
    assert.equal(deactivated.note, "Job is paused. Service is cleared.");
  });

  test("uses the fetched system message type description as the visible label after deprecation", () => {
    const deprecated = describeLegacySystemMessageTypeState("ShopifyNewProductsFeed", {
      systemMessageTypeId: "ShopifyNewProductsFeed",
      description: "ShopifyNewProductsFeed [Deprecated]",
      sendServiceName: "",
      consumeServiceName: "",
      sendPath: "",
      receivePath: "",
      receiveMovePath: "",
      receiveFilePattern: "",
      receiveResponseEnumId: ""
    });

    assert.equal(deprecated.status, "deprecated");
    assert.equal(deprecated.label, "ShopifyNewProductsFeed [Deprecated]");
    assert.equal(deprecated.note, "Send service cleared. Consume service cleared. File handling cleared. Name is marked deprecated.");
  });

  test("formats legacy system message init dates for display", () => {
    const item = buildLegacySystemMessageItem({
      systemMessageId: "M111200",
      systemMessageTypeId: "ShopifyNewProductsFeed",
      statusId: "SmsgCreated",
      initDate: "1744254089563"
    });

    assert.equal(item.status, "active");
    assert.match(item.note, /^SmsgCreated · Apr \d+, 2025,/);
  });

  test("does not show terminal legacy system messages in the teardown list", () => {
    const item = buildLegacySystemMessageItem({
      systemMessageId: "M111201",
      systemMessageTypeId: "ShopifyNewProductsFeed",
      statusId: "SmsgConsumed",
      initDate: "1744254089563"
    });

    assert.equal(item, null);
  });
});
