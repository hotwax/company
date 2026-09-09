import { describe, expect, it, vi } from "vitest";

/**
 * Same boundary stub as the other Order Sync derivation specs: the composable module wires the cache
 * and the api client, so importing it pulls `@common` → `useAuth` → `cookieHelper`, which has no
 * browser context here. Stubbing it keeps this a pure L1 check of the derivation.
 */
vi.mock("@common", () => ({
  api: vi.fn(),
  commonUtil: { hasError: () => false, showToast: vi.fn() },
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  translate: (value: string) => value,
}));

import {
  isOrderSyncBatchActive,
  orderSyncCardSnapshot,
  orderSyncSummary,
  ORDER_SYNC_PROGRESS_BADGE_LABELS,
  type OrderSyncBatchLike,
  type DataManagerLogLike,
} from "@/composables/useShopify";

/**
 * L1 unit — the Order Sync card snapshot, end to end from cached rows.
 *
 * The card renders whatever this returns and nothing else, so these are the assertions that decide
 * whether a real shop's connection page tells the truth. Each case is built from the SHAPES the cache
 * actually holds — Moqui `SystemMessage` status IDs and `DataManagerLog` rows — and run through the
 * real `orderSyncSummary`, not a hand-made summary, so the two functions are pinned together.
 *
 * The regression this file exists for: the card previously read from a Pinia store that was deleted,
 * and because the component declared its own structurally-identical snapshot type, nothing failed to
 * compile — the card just rendered zeroes. A type cannot catch that; only asserting real values can.
 */

const CONFIGURED_JOB = { jobName: "queue_ShopifyOrderSync_10000", paused: "N" };
const PAUSED_JOB = { jobName: "queue_ShopifyOrderSync_10000", paused: "Y" };

function snapshotFor(
  batches: OrderSyncBatchLike[],
  importsBySystemMessageId: Record<string, DataManagerLogLike[]>,
  job: Record<string, any> | null,
  extra: { hydrated?: boolean; error?: string | null } = {},
) {
  const summary = orderSyncSummary(batches, importsBySystemMessageId, job, null);
  return orderSyncCardSnapshot({ shopId: "10000", summary, job, ...extra });
}

describe("orderSyncCardSnapshot — configuration state", () => {
  it("reports a shop with no order-sync job as needing setup", () => {
    const snapshot = snapshotFor([], {}, null);

    expect(snapshot.configurationState).toBe("missing");
    expect(snapshot.actionable).toBe(true); // the configure route exists for exactly this state
  });

  /**
   * The `"N"`/`"Y"` spelling is the point. Moqui returns the string `"N"` for a running job, which is
   * JS-truthy — a naive `job.paused ? …` reports an ACTIVE job as paused, which is the bug
   * `isServiceJobPaused` was written to kill. Asserting both spellings keeps it dead.
   */
  it("reads Moqui's string 'N' as active, not as paused", () => {
    expect(snapshotFor([], {}, CONFIGURED_JOB).configurationState).toBe("configured-active");
  });

  it("reads Moqui's string 'Y' as paused", () => {
    const snapshot = snapshotFor([], {}, PAUSED_JOB);

    expect(snapshot.configurationState).toBe("configured-paused");
    expect(snapshot.nextRunLabel).toBe("Paused");
  });
});

describe("orderSyncCardSnapshot — progress rows", () => {
  it("names both rows as not-yet-run when the shop has no batches", () => {
    const snapshot = snapshotFor([], {}, CONFIGURED_JOB);

    // Verbatim strings: the component special-cases these to render its own empty copy.
    expect(snapshot.batchDetail).toBe("No batch request yet");
    expect(snapshot.importDetail).toBe("No import yet");
    expect(snapshot.batchStatus).toBe("Waiting");
    expect(snapshot.importStatus).toBe("Waiting");
  });

  it("surfaces the batch's system message id as the batch detail", () => {
    const snapshot = snapshotFor(
      [{ systemMessageId: "SM-1001", statusId: "SmsgSent", initDate: 1_700_000_000_000 }],
      {},
      CONFIGURED_JOB,
    );

    expect(snapshot.batchDetail).toBe("SM-1001");
  });

  it("counts imports on the detail line, singular and plural", () => {
    const one = snapshotFor(
      [{ systemMessageId: "SM-1", statusId: "SmsgConsumed", initDate: 2 }],
      { "SM-1": [{ logId: "L1", statusId: "Completed", successRecordCount: 3, totalRecordCount: 3 }] },
      CONFIGURED_JOB,
    );
    const two = snapshotFor(
      [{ systemMessageId: "SM-1", statusId: "SmsgConsumed", initDate: 2 }],
      {
        "SM-1": [
          { logId: "L1", statusId: "Completed", successRecordCount: 3, totalRecordCount: 3 },
          { logId: "L2", statusId: "Completed", successRecordCount: 1, totalRecordCount: 1 },
        ],
      },
      CONFIGURED_JOB,
    );

    expect(one.importDetail).toBe("1 import");
    expect(two.importDetail).toBe("2 imports");
  });

  /**
   * Badge text is load-bearing for COLOUR — the card resolves danger/warning/success/primary by
   * matching this text. "Partially completed" must keep the word "partial" or a half-failed import
   * renders green.
   */
  it("uses badge wording the card can colour, and never the ' · ' separator", () => {
    const labels = Object.values(ORDER_SYNC_PROGRESS_BADGE_LABELS);

    expect(ORDER_SYNC_PROGRESS_BADGE_LABELS.partial.toLowerCase()).toContain("partial");
    expect(ORDER_SYNC_PROGRESS_BADGE_LABELS.failed.toLowerCase()).toContain("fail");
    expect(ORDER_SYNC_PROGRESS_BADGE_LABELS.completed.toLowerCase()).toContain("complete");
    expect(ORDER_SYNC_PROGRESS_BADGE_LABELS.active.toLowerCase()).toContain("processing");
    for (const label of labels) expect(label).not.toContain("·");
  });

  it("reports a half-failed import as partial rather than as a success", () => {
    const snapshot = snapshotFor(
      [{ systemMessageId: "SM-1", statusId: "SmsgConsumed", initDate: 2 }],
      {
        "SM-1": [
          { logId: "L1", statusId: "Completed", successRecordCount: 4, totalRecordCount: 4 },
          { logId: "L2", statusId: "Failed", failedRecordCount: 2, totalRecordCount: 2 },
        ],
      },
      CONFIGURED_JOB,
    );

    expect(snapshot.importStatus).toBe("Partially completed");
  });
});

describe("orderSyncCardSnapshot — counts and completion", () => {
  it("reports processed orders, pending batches and the last completed timestamp", () => {
    const batches: OrderSyncBatchLike[] = [
      // Newest, still in flight — pending, and NOT the last completed batch.
      { systemMessageId: "SM-3", statusId: "SmsgSending", initDate: 3_000 },
      // Finished and imported — this is the one "last completed" must report.
      { systemMessageId: "SM-2", statusId: "SmsgConsumed", initDate: 2_000 },
    ];
    const imports: Record<string, DataManagerLogLike[]> = {
      "SM-2": [{
        logId: "L2",
        statusId: "Completed",
        successRecordCount: 7,
        totalRecordCount: 7,
        finishDateTime: 2_500,
      }],
    };

    const snapshot = snapshotFor(batches, imports, CONFIGURED_JOB);

    expect(snapshot.pendingCount).toBe(1);          // only SM-3 is still moving
    expect(snapshot.lastCompletedLabel).toBe("2500"); // from SM-2's import, not from SM-3
    expect(snapshot.configurationState).toBe("configured-active");
  });

  it("counts the latest completed batch's successful records, not the whole history", () => {
    const snapshot = snapshotFor(
      [{ systemMessageId: "SM-1", statusId: "SmsgConsumed", initDate: 1_000 }],
      {
        "SM-1": [{
          logId: "L1", statusId: "Completed", successRecordCount: 12, totalRecordCount: 12,
        }],
      },
      CONFIGURED_JOB,
    );

    expect(snapshot.processedCount).toBe(12);
    expect(snapshot.pendingCount).toBe(0);
    expect(snapshot.importStatus).toBe("Completed");
  });

  /**
   * REGRESSION: "Orders processed" must not collapse to 0 when a new request is produced.
   *
   * It used to read the NEWEST batch's import row, so the headline number dropped to zero the moment
   * a request was queued and climbed back when its import landed — on a shop syncing every few
   * minutes, wrong most of the time. It must stay on the last batch that actually finished.
   */
  it("keeps the last completed count while a newer batch is still in flight", () => {
    const snapshot = snapshotFor(
      [
        { systemMessageId: "SM-NEW", statusId: "SmsgProduced", initDate: 2_000 },
        { systemMessageId: "SM-DONE", statusId: "SmsgConsumed", initDate: 1_000 },
      ],
      {
        "SM-DONE": [{
          logId: "L1", statusId: "Completed", successRecordCount: 7, totalRecordCount: 7,
          finishDateTime: 2_500,
        }],
      },
      CONFIGURED_JOB,
    );

    expect(snapshot.processedCount).toBe(7);
    expect(snapshot.pendingCount).toBe(1);
  });
});

/**
 * The summary drives the WORKER'S CADENCE through `isOrderSyncBatchActive`, so "no batch at all"
 * must not read as "a batch is moving".
 */
describe("isOrderSyncBatchActive", () => {
  it("is false for a shop that has never run order sync", () => {
    // REGRESSION: an empty summary derives `overallStatus === "pending"`, identical to a genuinely
    // queued request. Reading the state alone pinned the connection page's worker at its 10s active
    // poll permanently for every never-synced shop, and made "Run now" claim a batch was in flight.
    expect(orderSyncSummary([], {}, null, null).overallStatus).toBe("pending");
    expect(isOrderSyncBatchActive(orderSyncSummary([], {}, null, null))).toBe(false);
  });

  it("is true once a real batch is queued", () => {
    const summary = orderSyncSummary(
      [{ systemMessageId: "SM-1", statusId: "SmsgProduced", initDate: 1_000 }], {}, null, null);
    expect(isOrderSyncBatchActive(summary)).toBe(true);
  });

  it("is false once the batch and its import are both terminal", () => {
    const summary = orderSyncSummary(
      [{ systemMessageId: "SM-1", statusId: "SmsgConsumed", initDate: 1_000 }],
      { "SM-1": [{ logId: "L1", statusId: "Completed", successRecordCount: 3, totalRecordCount: 3 }] },
      null, null);
    expect(isOrderSyncBatchActive(summary)).toBe(false);
  });
});

describe("orderSyncCardSnapshot — loading and error", () => {
  it("is loading only until every cached table it joins has emitted", () => {
    expect(snapshotFor([], {}, null, { hydrated: false }).loading).toBe(true);
    expect(snapshotFor([], {}, null, { hydrated: true }).loading).toBe(false);
    // Omitted entirely means "the caller is not tracking hydration" — never a stuck skeleton.
    expect(snapshotFor([], {}, null).loading).toBe(false);
  });

  /**
   * An unreadable shop must NOT collapse into the actionable "Setup required" state — that invites an
   * operator to reconfigure a shop that is merely unreachable.
   */
  it("keeps the error distinct from a genuinely unconfigured shop", () => {
    const snapshot = snapshotFor([], {}, null, { error: "Shop could not be loaded." });

    expect(snapshot.error).toBe("Shop could not be loaded.");
    expect(snapshot.loading).toBe(false);
  });
});

describe("orderSyncSummary — a zero-order batch must not erase the last completed batch", () => {
  /**
   * Observed live the moment a queued run returned zero orders: the newest batch was consumed with NO
   * import log, `deriveSyncProgress` reports that import half as "completed" (nothing was required),
   * so the batch won the `latestCompletedBatch` pick — and its empty logs produced no
   * `lastCompletedAt`. The card then claimed "No completed batch recorded" for a shop whose real last
   * completed import was days old and still cached. One idle run poisoned the headline.
   */
  const REAL_COMPLETED = { systemMessageId: "M228520", statusId: "SmsgConsumed", initDate: 1_784_000_000_000 };
  const ZERO_ORDER = { systemMessageId: "M228622", statusId: "SmsgConsumed", initDate: 1_785_000_000_000 };
  const IMPORTS = {
    M228520: [{
      logId: "M101276",
      configId: "SYNC_SHOPIFY_ORDER",
      statusId: "DmlsFinished",
      successRecordCount: 1,
      totalRecordCount: 1,
      failedRecordCount: 0,
      finishDateTime: 1_784_000_500_000,
    }],
  };

  it("keeps the older batch WITH an import as the last completed one", () => {
    const summary = orderSyncSummary([ZERO_ORDER, REAL_COMPLETED], IMPORTS, CONFIGURED_JOB, null);

    expect(summary.latestCompletedBatch?.systemMessageId).toBe("M228520");
    expect(summary.lastCompletedAt).toBe(1_784_000_500_000);
    expect(summary.processedOrderCount).toBe(1);
  });

  it("still reports the zero-order batch as the LATEST batch, just not the last completed one", () => {
    const summary = orderSyncSummary([ZERO_ORDER, REAL_COMPLETED], IMPORTS, CONFIGURED_JOB, null);

    expect(summary.latestBatch?.systemMessageId).toBe("M228622");
    // Not pending either — a consumed batch with nothing to import is settled work.
    expect(summary.pendingBatchRequests).toBe(0);
  });

  it("reports no completed batch when genuinely nothing ever imported", () => {
    const summary = orderSyncSummary([ZERO_ORDER], {}, CONFIGURED_JOB, null);

    expect(summary.latestCompletedBatch).toBeUndefined();
    expect(summary.lastCompletedAt).toBeUndefined();
  });
});
