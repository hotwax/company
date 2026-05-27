import assert from "assert";
import {
  getReferencedBulkOperationSystemMessageId,
  getReferencedBulkOperationSystemMessageIds,
  getSystemMessageCandidateIds,
  getSystemMessageBulkOperationId,
  normalizeShopifyBulkOperationId
} from "../../src/utils/shopifyBulkOperation";

describe("shopify bulk operation id resolution", () => {
  test("normalizes Shopify bulk operation ids from system message fields", () => {
    assert.equal(
      normalizeShopifyBulkOperationId("gid://shopify/BulkOperation/123"),
      "gid://shopify/BulkOperation/123"
    );
    assert.equal(normalizeShopifyBulkOperationId("123"), "gid://shopify/BulkOperation/123");
    assert.equal(normalizeShopifyBulkOperationId("BulkOperation/123"), "gid://shopify/BulkOperation/123");
  });

  test("prefers system message remoteMessageId over remote remoteId", () => {
    assert.equal(
      getSystemMessageBulkOperationId({
        remoteId: "10000",
        remoteMessageId: "gid://shopify/BulkOperation/20000"
      }),
      "gid://shopify/BulkOperation/20000"
    );
  });

  test("does not treat numeric SystemMessageRemote.remoteId as a bulk operation", () => {
    assert.equal(getSystemMessageBulkOperationId({ remoteId: "10000" }), "");
    assert.equal(getSystemMessageBulkOperationId({ remoteId: "gid://shopify/BulkOperation/20000" }), "gid://shopify/BulkOperation/20000");
  });

  test("detects consumed result rows that reference a sent system message", () => {
    assert.equal(
      getReferencedBulkOperationSystemMessageId({
        systemMessageId: "M333045",
        remoteMessageId: "M330574"
      }),
      "M330574"
    );
    assert.equal(
      getReferencedBulkOperationSystemMessageId({
        systemMessageId: "M333045",
        parentMessageId: "M330574"
      }),
      "M330574"
    );
    assert.equal(
      getReferencedBulkOperationSystemMessageId({
        systemMessageId: "M333045",
        remoteMessageId: "M333045"
      }),
      ""
    );
  });

  test("builds deduped system message id candidates for details lookups", () => {
    assert.deepEqual(
      getReferencedBulkOperationSystemMessageIds({
        systemMessageId: "M333045",
        parentMessageId: "M330574",
        remoteMessageId: "M330574"
      }),
      ["M330574"]
    );
    assert.deepEqual(
      getSystemMessageCandidateIds(
        {
          systemMessageId: "M333045",
          parentMessageId: "M330574"
        },
        [
          {
            systemMessageId: "M330574",
            remoteMessageId: "gid://shopify/BulkOperation/20000"
          }
        ]
      ),
      ["M333045", "M330574"]
    );
  });
});
