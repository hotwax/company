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

  /**
   * `processedCount` reads the LATEST batch, so an in-flight batch legitimately shows 0 processed
   * while a completed one behind it shows its own total. Pinning this stops a future "just show the
   * newest number" change from reporting the wrong batch's count as the current one.
   */
  it("counts the latest batch's successful records, not the whole history", () => {
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
