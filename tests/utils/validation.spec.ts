import { describe, it, expect } from "vitest";
import { isValidPhone } from "@/utils";

describe("isValidPhone", () => {
  it("validates standard formats", () => {
    expect(isValidPhone("+1-800-555-0199")).toBe(true);
    expect(isValidPhone("(555) 019-2834")).toBe(true);
    expect(isValidPhone("+1 (555) 019-2834")).toBe(true);
    expect(isValidPhone("+44 20 7946 0919")).toBe(true);
    expect(isValidPhone("1234567")).toBe(true);
    expect(isValidPhone("123-456-7890")).toBe(true);
  });

  it("rejects invalid characters and malformed structures", () => {
    expect(isValidPhone("")).toBe(false);
    expect(isValidPhone("   ")).toBe(false);
    expect(isValidPhone("1234567+")).toBe(false);
    expect(isValidPhone("++1234567")).toBe(false);
    expect(isValidPhone("+")).toBe(false);
    expect(isValidPhone("123456")).toBe(false);
    expect(isValidPhone("123456789012345678901")).toBe(false);
    expect(isValidPhone("abc")).toBe(false);
    expect(isValidPhone("(123")).toBe(false);
    expect(isValidPhone("123)")).toBe(false);
    expect(isValidPhone("((123))")).toBe(false);
  });
});
