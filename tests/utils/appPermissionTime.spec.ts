import { describe, expect, it } from "vitest";
import { toEpochMillis } from "@/utils/appPermissionTime";

describe("toEpochMillis", () => {
  it("returns undefined for null, undefined, and empty string", () => {
    expect(toEpochMillis(null)).toBeUndefined();
    expect(toEpochMillis(undefined)).toBeUndefined();
    expect(toEpochMillis("")).toBeUndefined();
  });

  it("returns the number itself for valid numeric epochs", () => {
    const epoch = 1672531200000;
    expect(toEpochMillis(epoch)).toBe(epoch);
    expect(toEpochMillis(0)).toBe(0);
    expect(toEpochMillis(-1000)).toBe(-1000);
  });

  it("returns undefined for non-finite numbers", () => {
    expect(toEpochMillis(NaN)).toBeUndefined();
    expect(toEpochMillis(Infinity)).toBeUndefined();
    expect(toEpochMillis(-Infinity)).toBeUndefined();
  });

  it("returns undefined for whitespace-only strings", () => {
    expect(toEpochMillis("   ")).toBeUndefined();
    expect(toEpochMillis("\t\n")).toBeUndefined();
  });

  it("parses string composed of numeric digits as a number", () => {
    const epoch = 1672531200000;
    expect(toEpochMillis(String(epoch))).toBe(epoch);
    expect(toEpochMillis("0")).toBe(0);
    expect(toEpochMillis("   1672531200000  ")).toBe(epoch);
  });

  it("parses valid ISO date strings to epoch timestamp", () => {
    const dateStr = "2023-01-01T00:00:00.000Z";
    const expectedEpoch = Date.parse(dateStr);
    expect(toEpochMillis(dateStr)).toBe(expectedEpoch);

    // Also with whitespace
    expect(toEpochMillis(`  ${dateStr}  `)).toBe(expectedEpoch);
  });

  it("returns undefined for invalid date strings", () => {
    expect(toEpochMillis("nonsense")).toBeUndefined();
    expect(toEpochMillis("2023-13-45T25:99:99Z")).toBeUndefined(); // Invalid ISO string
  });
});
