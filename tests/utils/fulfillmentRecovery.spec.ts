import { describe, expect, it } from "vitest";
import { fulfillmentRecovery, retryState } from "@/utils/fulfillmentRecovery";
describe("fulfillment recovery guidance", () => {
  it("separates attempts from stopped retries", () => {
    expect(retryState({statusId: "SmsgProduced", failCount: 0}).key).toBe("waiting");
    expect(retryState({statusId: "SmsgProduced", failCount: 1}).key).toBe("retry");
    expect(retryState({statusId: "SmsgError", failCount: 24}).key).toBe("stopped");
    expect(retryState({statusId: "SmsgSending", failCount: 1}).key).toBe("sending");
  });
  it("does not infer cancellation from a closed fulfillment order", () => {
    expect(fulfillmentRecovery("No fulfillable quantity left; [123:CLOSED]").title).toBe("Needs reconciliation: no fulfillable quantity");
    expect(fulfillmentRecovery("timeout").action).toContain("existing fulfillment");
    expect(fulfillmentRecovery("unrecognized error").title).toBe("This sync needs investigation");
  });
});
