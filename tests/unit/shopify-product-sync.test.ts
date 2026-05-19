
import assert from "assert";
import {
  selectTrackProgressSystemMessage,
  selectMostRecentSystemMessage,
  SystemMessage
} from "../../src/utils/shopifyProductSync";

describe("Shopify Product Sync Selection Utilities", () => {
  const messages: SystemMessage[] = [
    { systemMessageId: "MSG1", statusId: "SmsgConsumed", initDate: "2026-05-01T10:00:00Z" },
    { systemMessageId: "MSG2", statusId: "SmsgProduced", initDate: "2026-05-02T10:00:00Z" },
    { systemMessageId: "MSG3", statusId: "SmsgReceived", initDate: "2026-05-02T11:00:00Z" }
  ];

  test("selectTrackProgressSystemMessage picks the oldest pending message with precedence", () => {
    const selected = selectTrackProgressSystemMessage(messages);
    // MSG3 is Received, MSG2 is Produced. Received takes precedence over Produced.
    assert.strictEqual(selected?.systemMessageId, "MSG3");
  });

  test("selectMostRecentSystemMessage picks the absolute latest message", () => {
    const selected = selectMostRecentSystemMessage(messages);
    // MSG3 is the latest by date (11:00)
    assert.strictEqual(selected?.systemMessageId, "MSG3");
  });

  test("selectMostRecentSystemMessage picks newest even if all are consumed", () => {
    const allConsumed: SystemMessage[] = [
      { systemMessageId: "OLD", statusId: "SmsgConsumed", initDate: "2026-05-01T10:00:00Z" },
      { systemMessageId: "NEW", statusId: "SmsgConsumed", initDate: "2026-05-02T10:00:00Z" }
    ];
    const selected = selectMostRecentSystemMessage(allConsumed);
    assert.strictEqual(selected?.systemMessageId, "NEW");
  });

  test("returns null for empty list", () => {
    assert.strictEqual(selectTrackProgressSystemMessage([]), null);
    assert.strictEqual(selectMostRecentSystemMessage([]), null);
  });
});
