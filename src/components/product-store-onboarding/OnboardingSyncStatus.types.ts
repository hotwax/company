export type OnboardingSyncConfigurationStatus = "configured" | "not-configured" | "unknown"

export type OnboardingSyncRunStatus = "not-started" |
  "pending" |
  "queued" |
  "sent" |
  "running" |
  "importing" |
  "skipped" |
  "completed" |
  "error" |
  "cancelled" |
  "unavailable" |
  "unknown"

export type OnboardingSyncCheckStatus = "complete" | "missing" | "unknown"

export interface OnboardingSyncCheck {
  id: string
  label: string
  status: OnboardingSyncCheckStatus
  detail?: string
}

/**
 * Small, already-sanitized pieces of source evidence that explain a failed stage.
 *
 * `detail` is backend/runtime text, not an i18n key. The component renders it as escaped text and
 * never as HTML.
 */
export interface OnboardingSyncDiagnostic {
  id: string
  label: string
  detail: string
}

export interface OnboardingSyncStage {
  id: string
  label: string
  status: OnboardingSyncRunStatus
  detail?: string
  totalRecordCount?: number
  failedRecordCount?: number
  countUnit?: "records" | "objects"
  diagnostics?: OnboardingSyncDiagnostic[]
}

export interface OnboardingSyncConfiguration {
  status: OnboardingSyncConfigurationStatus
  summary: string
  checks?: OnboardingSyncCheck[]
}

export interface OnboardingSyncRun {
  status: OnboardingSyncRunStatus
  summary: string
  lastRunLabel?: string
  totalRecordCount?: number
  failedRecordCount?: number
  progress?: number
  stages?: OnboardingSyncStage[]
  recoveryHint?: string
}

export type OnboardingSyncBusyAction = "save" | "run" | "refresh" | "details" | null
