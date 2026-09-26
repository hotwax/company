import { translate } from "@common";

import { formatDateTime } from "@/utils";

/** Normalize both the run-history view and raw Moqui ServiceJobRun records. */
export function serviceJobRunStatus(run: Record<string, any>): string {
  if (run.hasError === 'Y' || run.hasError === true || run.errors) return 'Failed';
  const explicit = run.runStatus || run.statusId || run.status;
  if (explicit) return String(explicit);
  if (run.endTime || run.completedAt) {
    if (!run.startTime && !run.startedAt) return 'Terminated';
    return run.hasError === 'N' || run.hasError === false ? 'Completed' : '';
  }
  if (run.startTime || run.startedAt) return 'In progress';
  return '';
}

/**
 * Human labels for the ServiceJobRun `parameters` and `results` keys the inventory reset and
 * publisher jobs record.
 *
 * ⚠️ THIS EXISTS BECAUSE ServiceJobRun STORES BOTH AS OPAQUE JSON STRINGS.
 *
 * There is no OMS resource that describes these fields: they are whatever the invoked service chose
 * to put in its parameter map and return map, so nothing can be read to name them. Without a map the
 * run cards printed the payload as the service wrote it —
 * `{"inventoryChannelId":"M100051","maxChangeCount":100,…}` for parameters, and
 * `dataManagerLogId: M101123, batchCount: 19, candidateCount: 1874` for results.
 *
 * Every key below was read from the runs cached on a live instance, not from documentation. An
 * unmapped key keeps its raw name rather than being dropped, so a field a service starts returning
 * shows up visible and unlabelled instead of silently missing.
 */

/** Parameters that say WHAT a run covered. These are what an operator reads first. */
const RUN_SCOPE_PARAMETERS: Record<string, string> = {
  authUsername: "Run by",
  dataManagerConfigId: "Feed configuration",
  inventoryChannelId: "Inventory channel",
  shopId: "Shop",
  shopifyLocationId: "Shopify location",
};

/** Parameters that TUNE how it ran. Real, but noise next to the scope above. */
const RUN_TUNING_PARAMETERS: Record<string, string> = {
  groupByFields: "Grouped by",
  maxChangeCount: "Changes per batch",
  maxPassRetries: "Retries per pass",
  maxPasses: "Pass limit",
  mode: "Mode",
  retryLimit: "Retry limit",
  retryMinutes: "Retry window in minutes",
  staleSendingMinutes: "Stale send timeout in minutes",
};

const RUN_RESULT_LABELS: Record<string, string> = {
  ageOnlyDetailRecordsRemoved: "Removed for age only",
  assignedDetailRecordsRemoved: "Removed, already batched",
  batchCount: "Batches",
  cancelledEventCount: "Events cancelled",
  candidateCount: "Candidates",
  createdMessageCount: "Messages created",
  cutoffTimestamp: "Cutoff",
  failedPassCount: "Failed passes",
  passCount: "Passes run",
  recordsRemoved: "Records removed",
  remainingPendingCount: "Still pending",
  requeuedSendingCount: "Re-queued from sending",
  stoppedReason: "Stopped because",
  terminalDetailRecordsRemoved: "Removed, terminal",
  unassignedZeroRecordsRemoved: "Removed, zero change and unbatched",
};

/** `stoppedReason` reports a slug, not something anyone would say out loud. */
const STOPPED_REASONS: Record<string, string> = {
  "max-pass-retries": "it hit the retry limit",
  "max-passes": "it hit the pass limit",
  "queue-empty": "the queue was empty",
};

/**
 * `dataManagerLogId` is deliberately unmapped above: the import it names is already rendered as its
 * own panel directly under the card, so a result row for it states the same fact twice.
 */
const HIDDEN_RESULT_KEYS = new Set(["dataManagerLogId"]);

/** One labelled figure from a run's parameters or results. */
export interface RunDetailRow {
  key: string;
  label: string;
  value: string;
}

/** The parsed object, or undefined when there is nothing structured to read. */
function parseRunPayload(raw: unknown): Record<string, any> | undefined {
  const text = raw === undefined || raw === null ? "" : String(raw).trim();
  if(!text || text === "{}" || text === "[]") {return undefined;}

  try {
    const parsed = JSON.parse(text);

    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Rows for the keys `labels` covers, in the order `labels` declares them, so the same run always
 * reads the same way regardless of the order the service happened to serialise its map in.
 */
function rowsFor(payload: Record<string, any>, labels: Record<string, string>): RunDetailRow[] {
  return Object.entries(labels).flatMap(([key, label]) => {
    const value = formatRunValue(key, payload[key]);

    return value ? [{ key, label: translate(label), value }] : [];
  });
}

/** Keys no label covers, so a newly returned field is still visible under its own name. */
function unmappedRows(payload: Record<string, any>, ...covered: Record<string, string>[]): RunDetailRow[] {
  const known = new Set(covered.flatMap((labels) => Object.keys(labels)));

  return Object.keys(payload)
    .filter((key) => !known.has(key) && !HIDDEN_RESULT_KEYS.has(key))
    .sort()
    .flatMap((key) => {
      const value = formatRunValue(key, payload[key]);

      return value ? [{ key, label: key, value }] : [];
    });
}

function formatRunValue(key: string, value: unknown): string {
  if(value === undefined || value === null || value === "") {return "";}
  // A collection reports its SIZE: the members are what used to flood these cards.
  if(Array.isArray(value)) {return String(value.length);}
  if(typeof value === "object") {return "";}
  if(key === "cutoffTimestamp") {return formatDateTime(value) || String(value);}
  if(key === "stoppedReason") {return translate(STOPPED_REASONS[String(value)] ?? String(value));}

  return String(value);
}

/** A run's parameters, split into what it covered and how it was tuned. */
export function describeRunParameters(raw: unknown): { scope: RunDetailRow[]; tuning: RunDetailRow[] } {
  const payload = parseRunPayload(raw);
  if(!payload) {return { scope: [], tuning: [] };}

  return {
    scope: [...rowsFor(payload, RUN_SCOPE_PARAMETERS), ...unmappedRows(payload, RUN_SCOPE_PARAMETERS, RUN_TUNING_PARAMETERS)],
    tuning: rowsFor(payload, RUN_TUNING_PARAMETERS),
  };
}

/** A run's results as labelled figures. */
export function describeRunResult(raw: unknown): RunDetailRow[] {
  const payload = parseRunPayload(raw);
  if(!payload) {return [];}

  return [...rowsFor(payload, RUN_RESULT_LABELS), ...unmappedRows(payload, RUN_RESULT_LABELS)];
}

/** The mapped keys, for tests and for asserting locale coverage. */
export const runDetailLabels = [
  ...Object.values(RUN_SCOPE_PARAMETERS),
  ...Object.values(RUN_TUNING_PARAMETERS),
  ...Object.values(RUN_RESULT_LABELS),
  ...Object.values(STOPPED_REASONS),
];
