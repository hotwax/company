import { describe, expect, it, vi } from "vitest";

/**
 * L1 — the two conversions the AWS page leans on: SQS's 0 to 900 whole-second delay range, and seconds
 * rendered in the largest exact unit with singular forms.
 */

vi.mock("@common", () => ({
  translate: (key: string, values: Record<string, unknown> = {}) =>
    Object.entries(values).reduce((message, [name, value]) => message.replace(`{${name}}`, String(value)), key),
}));

describe("parseDelaySeconds", () => {
  it("accepts whole seconds inside SQS's 0 to 900 range and nothing else", async () => {
    const { parseDelaySeconds } = await import("@/utils/sqsQueue");

    expect(parseDelaySeconds("300")).toBe(300);
    expect(parseDelaySeconds(" 0 ")).toBe(0);
    expect(parseDelaySeconds(900)).toBe(900);
    expect(parseDelaySeconds("901")).toBeNull();
    expect(parseDelaySeconds("-1")).toBeNull();
    expect(parseDelaySeconds("12.5")).toBeNull();
    expect(parseDelaySeconds("")).toBeNull();
    expect(parseDelaySeconds(undefined)).toBeNull();
  });
});

describe("formatSeconds", () => {
  it("uses the largest exact unit and singular forms", async () => {
    const { formatSeconds } = await import("@/utils/sqsQueue");

    expect(formatSeconds(0)).toBe("0 seconds");
    expect(formatSeconds(1)).toBe("1 second");
    expect(formatSeconds(45)).toBe("45 seconds");
    expect(formatSeconds(60)).toBe("1 minute");
    expect(formatSeconds(90)).toBe("90 seconds");
    expect(formatSeconds(300)).toBe("5 minutes");
    expect(formatSeconds(3600)).toBe("1 hour");
    expect(formatSeconds(345600)).toBe("4 days");
    expect(formatSeconds(undefined)).toBe("Unknown");
  });
});

describe("queueNameFromArn", () => {
  it("keeps only the queue name", async () => {
    const { queueNameFromArn } = await import("@/utils/sqsQueue");

    expect(queueNameFromArn("arn:aws:sqs:us-east-1:123456789012:orders-dlq.fifo")).toBe("orders-dlq.fifo");
    expect(queueNameFromArn(undefined)).toBe("");
  });
});
