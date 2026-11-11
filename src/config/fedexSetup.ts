export type FedexSetupStepId = "unigate" | "credentials" | "label" | "readiness"

export type FedexSetupStepStatus = "not-started" | "in-progress" | "complete" | "attention"

export interface FedexSetupStep {
  id: FedexSetupStepId
  group: "setup" | "review"
  label: string
  summary: string
}

export const FEDEX_SETUP_GROUPS = [
  { id: "setup", label: "Setup" },
  { id: "review", label: "Review" }
]

/** Connect-only: saving the account also links the store, so there is no separate mapping step. */
export const FEDEX_SETUP_STEPS: FedexSetupStep[] = [
  { id: "unigate", group: "setup", label: "Unigate connection", summary: "FedEx labels are requested through Unigate, so it must be connected first." },
  { id: "credentials", group: "setup", label: "FedEx account", summary: "Save the credentials and account number for a product store." },
  { id: "label", group: "setup", label: "Sample label", summary: "Prove the connection by generating a real label." },
  { id: "readiness", group: "review", label: "Readiness review", summary: "Review the outcome of every step." }
]

export const FEDEX_SETUP_STEP_IDS = FEDEX_SETUP_STEPS.map((step) => step.id)
export const FEDEX_SETUP_SETUP_STEP_IDS = FEDEX_SETUP_STEP_IDS.filter((id) => id !== "readiness")
/** The sample label proves the connection but is not required to finish. */
export const FEDEX_SETUP_REQUIRED_STEP_IDS = FEDEX_SETUP_SETUP_STEP_IDS.filter((id) => id !== "label")
