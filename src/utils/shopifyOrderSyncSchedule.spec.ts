import { describe, expect, it } from "vitest";

import {
  SHOPIFY_ORDER_SYNC_SCHEDULE_PRESETS,
  createShopifyOrderSyncScheduleDraft,
  describeShopifyOrderSyncCronExpression,
  getNextShopifyOrderSyncRun,
  isShopifyOrderSyncScheduleDirty,
  normalizeShopifyOrderSyncCronExpression,
  validateShopifyOrderSyncCronExpression
} from "./shopifyOrderSyncSchedule";

describe("Shopify Order Sync schedule contract", () => {
  it("preserves the inherited template schedule exactly and starts paused", () => {
    const inherited = "  0  */15 * ? * *  ";
    const draft = createShopifyOrderSyncScheduleDraft(inherited);

    expect(draft).toEqual({ cronExpression: inherited, active: false });
    expect(isShopifyOrderSyncScheduleDirty(draft, { ...draft })).toBe(false);
  });

  it("accepts each Product Sync sibling preset and a valid custom Quartz expression", () => {
    for (const preset of SHOPIFY_ORDER_SYNC_SCHEDULE_PRESETS) {
      expect(validateShopifyOrderSyncCronExpression(preset.expression, { timeZone: "UTC" })).toMatchObject({
        valid: true,
        code: null,
        previewSupported: true,
        normalizedExpression: preset.expression
      });
    }

    const custom = "0 5 9 ? * MON-FRI";
    expect(validateShopifyOrderSyncCronExpression(custom, { timeZone: "America/New_York" }).valid).toBe(true);
    expect(describeShopifyOrderSyncCronExpression(custom, { timeZone: "America/New_York" }))
      .toBe("At 09:05 AM, Monday through Friday");
  });

  it("accepts the real Moqui template expression", () => {
    const expression = "0 0/5 * * * ?";
    const validation = validateShopifyOrderSyncCronExpression(expression, { timeZone: "UTC" });

    expect(validation).toMatchObject({
      valid: true,
      code: null,
      previewSupported: true,
      normalizedExpression: expression
    });
    expect(getNextShopifyOrderSyncRun(expression, {
      timeZone: "UTC",
      currentDate: new Date("2026-07-22T12:01:00.000Z")
    })?.toISOString()).toBe("2026-07-22T12:05:00.000Z");
  });

  it("accepts advanced Quartz W, L, hash, and optional-year forms used by Moqui", () => {
    const advancedExpressions = [
      "0 0 9 15W * ?",
      "0 0 9 L * ?",
      "0 0 9 LW * ?",
      "0 0 9 L-3 * ?",
      "0 0 9 ? * MON#2",
      "0 0 9 ? * FRI#5",
      "0 0 9 ? * 2L",
      "0 0 9 ? * MON-FRI 2026"
    ];

    for (const expression of advancedExpressions) {
      expect(validateShopifyOrderSyncCronExpression(expression, { timeZone: "UTC" }).valid).toBe(true);
    }

    const nearestWeekday = validateShopifyOrderSyncCronExpression("0 0 9 15W * ?", { timeZone: "UTC" });
    const optionalYear = validateShopifyOrderSyncCronExpression("0 0 9 ? * MON-FRI 2026", { timeZone: "UTC" });

    expect(nearestWeekday.previewSupported).toBe(false);
    expect(optionalYear.previewSupported).toBe(false);
    expect(getNextShopifyOrderSyncRun("0 0 9 15W * ?", { timeZone: "UTC" })).toBeNull();
    expect(describeShopifyOrderSyncCronExpression("0 0 9 15W * ?", { timeZone: "UTC" }))
      .toBe("At 09:00 AM, on the weekday nearest day 15 of the month");
  });

  it("distinguishes required, wrong-field-count, invalid-timezone, and invalid-syntax failures", () => {
    expect(validateShopifyOrderSyncCronExpression("", { timeZone: "UTC" }).code).toBe("required");
    // cron-parser accepts five-field Unix cron, but this UI contract requires six-field Quartz cron.
    expect(validateShopifyOrderSyncCronExpression("*/15 * * * *", { timeZone: "UTC" }).code).toBe("field-count");
    expect(validateShopifyOrderSyncCronExpression("0 0 9 ? * MON * 2026", { timeZone: "UTC" }).code)
      .toBe("field-count");
    expect(validateShopifyOrderSyncCronExpression("0 */15 * ? * *", { timeZone: "Mars/Olympus" }).code)
      .toBe("invalid-time-zone");
    expect(validateShopifyOrderSyncCronExpression("0 bananas * ? * *", { timeZone: "UTC" }).code)
      .toBe("invalid-expression");
    expect(describeShopifyOrderSyncCronExpression("0 bananas * ? * *", { timeZone: "UTC" })).toBeNull();
    expect(getNextShopifyOrderSyncRun("0 bananas * ? * *", { timeZone: "UTC" })).toBeNull();
  });

  it("rejects Quartz range violations and syntax the OMS parser rejects", () => {
    const invalidExpressions = [
      "60 0 9 * * ?",
      "0 60 9 * * ?",
      "0 0 24 * * ?",
      "0 0 9 32 * ?",
      "0 0 9 0W * ?",
      "0 0 9 * 13 ?",
      "0 0 9 ? * 8",
      "0 0 9 ? * MON#6",
      "0 0 9 ? * MON#7",
      "0 0 9 ? * MON#8",
      "0 0 9 * * ? 1969",
      "0 0 9 * * ? 2100",
      "0 0 9 * * ? 2027-2025",
      "0 */0 9 * * ?",
      "0 0 9 * * *",
      "0 0 9 ? * ?"
    ];

    for (const expression of invalidExpressions) {
      expect(validateShopifyOrderSyncCronExpression(expression, { timeZone: "UTC" })).toMatchObject({
        valid: false,
        code: "invalid-expression",
        previewSupported: false
      });
    }
  });

  it("calculates the next run in the selected timezone", () => {
    const currentDate = new Date("2026-07-22T12:00:00.000Z");
    const expression = "0 0 0 ? * *";

    const nextUtcRun = getNextShopifyOrderSyncRun(expression, { timeZone: "UTC", currentDate });
    const nextNewYorkRun = getNextShopifyOrderSyncRun(expression, {
      timeZone: "America/New_York",
      currentDate
    });
    const nextKolkataRun = getNextShopifyOrderSyncRun(expression, {
      timeZone: "Asia/Kolkata",
      currentDate
    });

    expect(nextUtcRun?.toISOString()).toBe("2026-07-23T00:00:00.000Z");
    expect(nextNewYorkRun?.toISOString()).toBe("2026-07-23T04:00:00.000Z");
    expect(nextKolkataRun?.toISOString()).toBe("2026-07-22T18:30:00.000Z");
  });

  it("marks an active/paused toggle dirty even when the cron expression is unchanged", () => {
    const original = { cronExpression: "0 */15 * ? * *", active: false };

    expect(isShopifyOrderSyncScheduleDirty(original, { ...original, active: true })).toBe(true);
    expect(isShopifyOrderSyncScheduleDirty(original, { ...original })).toBe(false);
  });

  it("ignores save-time edge whitespace without rewriting internal inherited spacing", () => {
    expect(normalizeShopifyOrderSyncCronExpression("  0 */15 * ? * *\t")).toBe("0 */15 * ? * *");
    expect(normalizeShopifyOrderSyncCronExpression(" 0  */15 * ? * * ")).toBe("0  */15 * ? * *");
    expect(isShopifyOrderSyncScheduleDirty(
      { cronExpression: "0 */15 * ? * *", active: true },
      { cronExpression: "  0 */15 * ? * *  ", active: true }
    )).toBe(false);
  });
});
