import assert from "assert";
import {
  getSystemMessageTime,
  hasMoreForwardSystemMessagePages,
  parseSystemMessageDateTime,
  shouldReadSystemMessagePagesBackwards,
  sortSystemMessagesNewestFirst
} from "../../src/utils/systemMessageHistory";

describe("system message history pagination", () => {
  test("detects old-first backend pages so history can page backwards", () => {
    const systemMessages = [
      { systemMessageId: "old", initDate: "2026-04-01T00:00:00.000Z" },
      { systemMessageId: "newer", initDate: "2026-04-02T00:00:00.000Z" }
    ];

    assert.equal(shouldReadSystemMessagePagesBackwards(systemMessages, 50, 25), true);
  });

  test("keeps newest-first backend pages moving forward", () => {
    const systemMessages = [
      { systemMessageId: "newer", initDate: "2026-04-02T00:00:00.000Z" },
      { systemMessageId: "old", initDate: "2026-04-01T00:00:00.000Z" }
    ];

    assert.equal(shouldReadSystemMessagePagesBackwards(systemMessages, 50, 25), false);
  });

  test("sorts returned system messages newest first", () => {
    const systemMessages = sortSystemMessagesNewestFirst([
      { systemMessageId: "old", initDate: "2026-04-01T00:00:00.000Z" },
      { systemMessageId: "new", initDate: "2026-04-03T00:00:00.000Z" },
      { systemMessageId: "middle", initDate: "2026-04-02T00:00:00.000Z" }
    ]);

    assert.deepEqual(systemMessages.map((message: any) => message.systemMessageId), ["new", "middle", "old"]);
  });

  test("parses Moqui and numeric system message initDate values", () => {
    assert.equal(parseSystemMessageDateTime(1774958400000)?.toMillis(), 1774958400000);
    assert.equal(parseSystemMessageDateTime("1774958400000")?.toMillis(), 1774958400000);
    assert.equal(parseSystemMessageDateTime("2026-04-01T00:00:00.000Z")?.isValid, true);
    assert.equal(parseSystemMessageDateTime("2026-04-01 00:00:00.000")?.isValid, true);
    assert.equal(parseSystemMessageDateTime("not-a-date"), null);
  });

  test("returns zero timestamp for invalid system message initDate values", () => {
    assert.equal(getSystemMessageTime({ systemMessageId: "bad", initDate: "not-a-date" }), 0);
  });

  test("keeps paging after a full backend page even when count is capped", () => {
    const fullPage = Array.from({ length: 25 }, (_, index) => ({ systemMessageId: `message-${index}` }));

    assert.equal(hasMoreForwardSystemMessagePages(fullPage, 1, 25, 25), true);
    assert.equal(hasMoreForwardSystemMessagePages(fullPage, 1, 100, 25), true);
    assert.equal(hasMoreForwardSystemMessagePages(fullPage.slice(0, 10), 1, 10, 25), false);
    assert.equal(hasMoreForwardSystemMessagePages([], 2, 100, 25), false);
  });
});
