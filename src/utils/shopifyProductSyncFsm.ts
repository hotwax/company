import { translate } from "@/i18n";

export type ProductSyncFsmActionId = "send" | "poll" | "cancel";

export interface ProductSyncFsmAction {
  id: ProductSyncFsmActionId;
  label: string;
  kind: "primary" | "secondary";
}

export interface ProductSyncFsmNextJob {
  id: string;
  label: string;
  nextRunLabel: string;
  relativeNextRunLabel: string;
  paused: boolean;
  /** Epoch ms of the next scheduled run, if known. Drives the depleting progress bar. */
  nextRunAtMs: number | null;
  /** Epoch ms of the previous run (or previous cron firing), used as the bar's start point. */
  previousRunAtMs: number | null;
}

export interface ProductSyncFsmState {
  statusId: string;
  statusLabel: string;
  primaryAction: ProductSyncFsmAction | null;
  secondaryActions: ProductSyncFsmAction[];
  nextJob: ProductSyncFsmNextJob | null;
  nextJobReason: string;
}

interface ProductSyncFsmInput {
  statusId?: string;
  statusLabel?: string;
  sendJob?: any;
  pollJob?: any;
  sendJobNextRunLabel?: string;
  sendJobRelativeNextRunLabel?: string;
  sendJobNextRunAtMs?: number | null;
  sendJobPreviousRunAtMs?: number | null;
  pollJobNextRunLabel?: string;
  pollJobRelativeNextRunLabel?: string;
  pollJobNextRunAtMs?: number | null;
  pollJobPreviousRunAtMs?: number | null;
  isSendJobPaused?: boolean;
  isPollJobPaused?: boolean;
}

function normalizeStatusId(statusId = "") {
  return String(statusId || "").trim();
}

function buildNextJob(
  job: any,
  label: string,
  nextRunLabel: string,
  relativeNextRunLabel: string,
  paused: boolean,
  nextRunAtMs: number | null = null,
  previousRunAtMs: number | null = null
): ProductSyncFsmNextJob | null {
  if (!job?.jobName) return null;

  return {
    id: job.jobName,
    label,
    nextRunLabel: nextRunLabel || translate("Not scheduled"),
    relativeNextRunLabel: relativeNextRunLabel || "",
    paused,
    nextRunAtMs,
    previousRunAtMs
  };
}

export function getProductSyncFsmState(input: ProductSyncFsmInput): ProductSyncFsmState {
  const statusId = normalizeStatusId(input.statusId);
  const statusLabel = input.statusLabel || translate("Pending");
  const cancelAction: ProductSyncFsmAction = { id: "cancel", label: translate("Cancel"), kind: "secondary" };

  switch (statusId) {
    case "SmsgProduced":
    case "SmsgSending":
      return {
        statusId,
        statusLabel,
        primaryAction: { id: "send", label: translate("Send now"), kind: "primary" },
        secondaryActions: [cancelAction],
        nextJob: buildNextJob(
          input.sendJob,
          translate("Send update request"),
          input.sendJobNextRunLabel || "",
          input.sendJobRelativeNextRunLabel || "",
          !!input.isSendJobPaused,
          input.sendJobNextRunAtMs ?? null,
          input.sendJobPreviousRunAtMs ?? null
        ),
        nextJobReason: translate("The next logical step is to send the produced bulk query to Shopify.")
      };

    case "SmsgSent":
      return {
        statusId,
        statusLabel,
        primaryAction: { id: "poll", label: translate("Poll now"), kind: "primary" },
        secondaryActions: [cancelAction],
        nextJob: buildNextJob(
          input.pollJob,
          translate("Import completed requests"),
          input.pollJobNextRunLabel || "",
          input.pollJobRelativeNextRunLabel || "",
          !!input.isPollJobPaused,
          input.pollJobNextRunAtMs ?? null,
          input.pollJobPreviousRunAtMs ?? null
        ),
        nextJobReason: translate("The next logical step is to check whether Shopify finished the bulk operation.")
      };

    case "SmsgReceived":
    case "SmsgConsuming":
    case "SmsgError":
      return {
        statusId,
        statusLabel,
        primaryAction: null,
        secondaryActions: [cancelAction],
        nextJob: null,
        nextJobReason: translate("No forward action is available. You can only discard this run if you no longer want to use it.")
      };

    case "SmsgConsumed":
    case "SmsgConfirmed":
    case "SmsgCancelled":
      return {
        statusId,
        statusLabel,
        primaryAction: null,
        secondaryActions: [],
        nextJob: null,
        nextJobReason: translate("No automated next step")
      };

    default:
      return {
        statusId,
        statusLabel,
        primaryAction: null,
        secondaryActions: [],
        nextJob: null,
        nextJobReason: translate("No automated next step")
      };
  }
}
