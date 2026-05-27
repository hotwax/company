export type ProductSyncWizardStep =
  | "home"
  | "product-store"
  | "identifier"
  | "review"
  | "progress";

export type ProductSyncExperienceMode = "first-time" | "returning" | "auto";
export type ProductSyncExperienceView = "first-time" | "returning";

export type ProductSyncMessageState =
  | "SmsgProduced"
  | "SmsgSent"
  | "SmsgConfirmed"
  | "SmsgConsumed"
  | "SmsgCancelled"
  | "SmsgError";

export interface ProductSyncWizardDraft {
  selectedProductStoreId: string;
  productStoreVerified: boolean;
  selectedIdentifierEnumId: string;
  startConfirmed: boolean;
  syncStarted: boolean;
}

export interface ProductSyncGateContext {
  draft: ProductSyncWizardDraft;
  identifierLocked?: boolean;
  productStoreLocked?: boolean;
  reviewReady?: boolean;
  progressComplete?: boolean;
}

export interface ProductSyncPreflightSummary {
  matched: number;
  sampled: number;
}

export interface ProductSyncProgressSnapshot {
  status?: string;
  systemMessageState?: ProductSyncMessageState | string;
  logStatusId?: string;
  logId?: string;
  completed?: boolean;
}

export interface ProductSyncBulkOperationProgress {
  processedCount: number;
  totalCount: number;
  value: number;
  hasTotalCount: boolean;
}

export const productSyncWizardSteps: ProductSyncWizardStep[] = [
  "home",
  "product-store",
  "identifier",
  "review",
  "progress"
];

export function createProductSyncWizardDraft(payload: Partial<ProductSyncWizardDraft> = {}): ProductSyncWizardDraft {
  return {
    selectedProductStoreId: payload.selectedProductStoreId || "",
    productStoreVerified: !!payload.productStoreVerified,
    selectedIdentifierEnumId: payload.selectedIdentifierEnumId || "",
    startConfirmed: !!payload.startConfirmed,
    syncStarted: !!payload.syncStarted
  };
}

export function selectProductStore(
  draft: ProductSyncWizardDraft,
  selectedProductStoreId: string
): ProductSyncWizardDraft {
  return {
    ...draft,
    selectedProductStoreId,
    productStoreVerified: draft.selectedProductStoreId === selectedProductStoreId ? draft.productStoreVerified : false
  };
}

export function canAdvanceProductSyncStep(step: ProductSyncWizardStep, context: ProductSyncGateContext): boolean {
  const { draft } = context;

  if (step === "home") {
    return true;
  }

  if (step === "product-store") {
    return !!draft.selectedProductStoreId && (!!context.productStoreLocked || draft.productStoreVerified);
  }

  if (step === "identifier") {
    return !!context.identifierLocked || !!draft.selectedIdentifierEnumId;
  }

  if (step === "review") {
    return !!context.reviewReady;
  }

  if (step === "progress") {
    return !!context.progressComplete;
  }

  return false;
}

export function nextProductSyncStep(step: ProductSyncWizardStep): ProductSyncWizardStep {
  const currentIndex = productSyncWizardSteps.indexOf(step);
  if (currentIndex < 0 || currentIndex === productSyncWizardSteps.length - 1) {
    return step;
  }
  return productSyncWizardSteps[currentIndex + 1];
}

export function previousProductSyncStep(step: ProductSyncWizardStep): ProductSyncWizardStep {
  const currentIndex = productSyncWizardSteps.indexOf(step);
  if (currentIndex <= 0) {
    return step;
  }
  return productSyncWizardSteps[currentIndex - 1];
}

export function getReviewImportAction() {
  return {
    opensStartConfirmation: true,
    startsSync: false
  };
}

export function canStartProductSync(startConfirmed: boolean): boolean {
  return !!startConfirmed;
}

export function shouldShowProductSyncProgress(startResult: { success?: boolean; syncJobId?: string; progress?: { syncJobId?: string } } = {}): boolean {
  return !!startResult.success && !!(startResult.syncJobId || startResult.progress?.syncJobId);
}

export function canShowProductSyncReconcile(progress: ProductSyncProgressSnapshot = {}): boolean {
  return progress.status === "completed" || progress.systemMessageState === "SmsgConfirmed" || progress.systemMessageState === "SmsgConsumed";
}

export function normalizeProductSyncStatus(progress: ProductSyncProgressSnapshot = {}): string {
  if (progress.status === "error") {
    return "error";
  }

  const systemMessageState = progress.systemMessageState;
  const logStatusId = progress.logStatusId;
  const logId = progress.logId;

  // A sync run is considered terminal (completed) if:
  // 1. There is an MDM log AND it is finished or errored
  // 2. There is NO MDM log AND the system message is consumed (handling empty Shopify runs)
  const isTerminal = (logId && (logStatusId === "DmlsFinished" || logStatusId === "DmlsError")) ||
                     (!logId && (systemMessageState === "SmsgConsumed" || systemMessageState === "SmsgError" || systemMessageState === "SmsgCancelled"));

  if (isTerminal) {
    if (logStatusId === "DmlsError" || systemMessageState === "SmsgError") return "error";
    if (systemMessageState === "SmsgCancelled") return "cancelled";
    return "completed";
  }

  if (logStatusId === "DmlsRunning" || logStatusId === "DmlsPending") {
    return "importing";
  }

  switch (systemMessageState) {
    case "SmsgProduced":
      return "queued";
    case "SmsgSent":
      return "running";
    case "SmsgConfirmed":
    case "SmsgConsumed":
      return "importing";
    case "SmsgCancelled":
      return "cancelled";
    case "SmsgError":
      return "error";
    default:
      return "queued";
  }
}

export function getProductSyncBulkOperationProgress(objectCount?: number | string, totalProductCount?: number | string): ProductSyncBulkOperationProgress {
  const processedCount = Math.max(Number(objectCount || 0), 0);
  const totalCount = Math.max(Number(totalProductCount || 0), 0);
  const value = totalCount > 0 ? Math.min(processedCount / totalCount, 1) : 0;

  return {
    processedCount,
    totalCount,
    value,
    hasTotalCount: totalCount > 0
  };
}



export function requiresPreflightConfirmation(summary: ProductSyncPreflightSummary): boolean {
  if (!summary.sampled) {
    return true;
  }

  if (summary.sampled >= 10) {
    return summary.matched < 7;
  }

  return summary.matched / summary.sampled < 0.7;
}

export function resolveProductSyncExperienceMode(
  mode: ProductSyncExperienceMode,
  hasLinkedOmsProducts = false
): ProductSyncExperienceView {
  if (mode === "first-time" || mode === "returning") {
    return mode;
  }

  return hasLinkedOmsProducts ? "returning" : "first-time";
}

export function getRawShopifyFileName(run: { mdmLogFileName?: string; logId?: string; id?: string }) {
  const fileName = String(run.mdmLogFileName || "").split(/[\\/]/).pop();
  return fileName || `shopify-product-sync-${run.logId || run.id}.json`;
}
