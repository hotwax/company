import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";

import { formatDateTime, parseDateTimeValue } from "@/utils";

/**
 * L1 unit — the shared date parser behind every timestamp these screens render.
 *
 * The regression that prompted these: `parseDateTimeValue` accepted a Luxon DateTime, a number and a
 * string, but a native `Date` fell through the `typeof value !== "string"` bail and returned null.
 * `formatDateTime` turns null into "", and callers turn "" into "Not available" — so Order Sync's
 * "next batch sync" reported no schedule for a job whose preview was computing fine.
 * `getNextSyncRun` returns a native Date, which is how a working schedule rendered as missing.
 */
describe("parseDateTimeValue", () => {
  const instant = Date.UTC(2026, 6, 27, 6, 15, 0);

  it("parses a native Date — the case that used to silently return null", () => {
    const parsed = parseDateTimeValue(new Date(instant));

    expect(parsed?.isValid).toBe(true);
    expect(parsed?.toMillis()).toBe(instant);
  });

  it("rejects an invalid Date rather than producing an invalid DateTime", () => {
    expect(parseDateTimeValue(new Date("nonsense"))).toBeNull();
  });

  it("still parses the shapes it already handled", () => {
    expect(parseDateTimeValue(instant)?.toMillis()).toBe(instant);
    expect(parseDateTimeValue(String(instant))?.toMillis()).toBe(instant);
    expect(parseDateTimeValue("2026-07-27T06:15:00.000Z")?.toMillis()).toBe(instant);
    expect(parseDateTimeValue(DateTime.fromMillis(instant))?.toMillis()).toBe(instant);
  });

  it("returns null for empty input instead of a bogus epoch date", () => {
    expect(parseDateTimeValue("")).toBeNull();
    expect(parseDateTimeValue(0)).toBeNull();
  });
});

describe("formatDateTime", () => {
  it("formats a native Date rather than returning the empty string", () => {
    const formatted = formatDateTime(new Date(Date.UTC(2026, 6, 27, 6, 15, 0)), "yyyy-MM-dd");

    expect(formatted).toBe("2026-07-27");
  });

  it("returns '' for unparseable input, which is what callers fall back on", () => {
    expect(formatDateTime(new Date("nonsense"))).toBe("");
    expect(formatDateTime(null)).toBe("");
  });
});
