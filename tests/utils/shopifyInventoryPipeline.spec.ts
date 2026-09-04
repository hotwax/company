import { describe, expect, it } from "vitest";
import { SYSTEM_MESSAGE_STATUS_IDS } from "@/utils/systemMessage";
import {
  DETAIL_STATUS_IDS,
  deltaOutcome,
  deliveryStatusOf,
  isDeliveryTerminalFailure,
  isDeliveryUnsettled,
  isWaitingDetail,
  roundDelta,
  sectionOfBatch,
  sectionOfEvent,
  sumDelta,
} from "@/utils/shopifyInventoryPipeline";

const SECTIONS = ["waiting", "inFlight", "quarantined", "settled"];
const SETTLED_MESSAGE_STATUS_IDS = ["SmsgSent", "SmsgConsumed", "SmsgConfirmed"];

const detail = (overrides: Record<string, any> = {}) => ({
  detailStatusId: "DETAIL_ASSIGNED",
  systemMessageId: "BATCH_1",
  systemMessageStatusId: "SmsgProduced",
  ...overrides,
});

describe("sectionOfEvent — every row lands in exactly one section", () => {
  /**
   * The regression this file exists for: the first cut enumerated only the statuses a healthy
   * instance produces, so a rejected or cancelled batch matched no section and vanished from the page.
   */
  it("classifies every ledger status against every message status, with no gaps", () => {
    const unclassified: string[] = [];

    for (const detailStatusId of [...DETAIL_STATUS_IDS, "DETAIL_SOMETHING_NEW", "", undefined]) {
      for (const statusId of [...SYSTEM_MESSAGE_STATUS_IDS, "SmsgSomethingNew", ""]) {
        for (const systemMessageId of ["BATCH_1", ""]) {
          const section = sectionOfEvent(detail({ detailStatusId, systemMessageId }), statusId);
          if (!SECTIONS.includes(section)) {
            unclassified.push(`${detailStatusId}/${statusId}/${systemMessageId || "no-batch"} -> ${section}`);
          }
        }
      }
    }

    expect(unclassified).toEqual([]);
  });

  it("keeps a rejected or cancelled batch on the page instead of dropping it", () => {
    for (const statusId of ["SmsgRejected", "SmsgCancelled"]) {
      expect(sectionOfEvent(detail(), statusId)).toBe("inFlight");
      expect(sectionOfBatch(statusId)).toBe("inFlight");
      expect(isDeliveryTerminalFailure(statusId)).toBe(true);
    }
  });

  it("treats an unknown backend status as unsettled rather than hiding the row", () => {
    expect(sectionOfEvent(detail(), "SmsgSomethingNew")).toBe("inFlight");
    expect(sectionOfBatch("SmsgSomethingNew")).toBe("inFlight");
  });

  it("settles a row once Shopify confirms it, whichever terminal success it is", () => {
    for (const statusId of SETTLED_MESSAGE_STATUS_IDS) {
      expect(sectionOfEvent(detail(), statusId)).toBe("settled");
      expect(sectionOfBatch(statusId)).toBe("settled");
      expect(isDeliveryUnsettled(statusId)).toBe(false);
    }
  });

  it("lets the ledger's terminal states win over the delivery state", () => {
    // A refused row is finished even if the batch it was once in went on to send.
    expect(sectionOfEvent(detail({ detailStatusId: "DETAIL_ERROR" }), "SmsgSent")).toBe("quarantined");
    expect(sectionOfEvent(detail({ detailStatusId: "DETAIL_NOOP" }), "SmsgError")).toBe("settled");
  });

  it("counts a row with no batch as waiting whatever its ledger status says", () => {
    expect(sectionOfEvent(detail({ detailStatusId: "DETAIL_PENDING", systemMessageId: "" }))).toBe("waiting");
    expect(sectionOfEvent(detail({ detailStatusId: "DETAIL_ASSIGNED", systemMessageId: "" }))).toBe("waiting");
    expect(isWaitingDetail(detail({ detailStatusId: "DETAIL_PENDING", systemMessageId: "" }))).toBe(true);
  });

  /**
   * The publisher can stamp `systemMessageId` before flipping `detailStatusId`. The monitor badge and
   * the Waiting section must agree about that row or the badge counts rows the section does not show.
   */
  it("does not call a pending row that already has a batch 'waiting'", () => {
    const claimed = detail({ detailStatusId: "DETAIL_PENDING", systemMessageId: "BATCH_1" });
    expect(isWaitingDetail(claimed)).toBe(false);
    expect(sectionOfEvent(claimed, "SmsgProduced")).toBe("inFlight");
  });
});

describe("deliveryStatusOf", () => {
  it("prefers the live message status over the status denormalized on the ledger row", () => {
    expect(deliveryStatusOf(detail({ systemMessageStatusId: "SmsgProduced" }), "SmsgSent")).toBe("SmsgSent");
  });

  it("falls back to the ledger row when the message cache has not caught up", () => {
    expect(deliveryStatusOf(detail({ systemMessageStatusId: "SmsgProduced" }), null)).toBe("SmsgProduced");
  });

  it("is empty for a row that has no batch", () => {
    expect(deliveryStatusOf(detail({ systemMessageId: "" }), "SmsgSent")).toBe("");
  });
});

describe("delta arithmetic", () => {
  it("settles float noise as no change instead of previewing it as a publish", () => {
    const delta = sumDelta([0.1, 0.2, -0.3]);
    expect(delta).toBe(0);
    expect(deltaOutcome(delta)).toBe("noChange");
  });

  it("still quarantines a genuinely fractional delta", () => {
    expect(deltaOutcome(sumDelta([1.5]))).toBe("quarantine");
  });

  it("publishes a whole-number delta", () => {
    expect(deltaOutcome(sumDelta([2, -1]))).toBe("publish");
    expect(sumDelta(["3", null, undefined, 1])).toBe(4);
  });

  it("never yields negative zero, which reads as a decrease that is not one", () => {
    expect(Object.is(roundDelta(-0.0000001), 0)).toBe(true);
  });
});
