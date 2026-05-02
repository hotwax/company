export type ProductSyncWizardStep =
  | "home"
  | "product-store"
  | "identifier"
  | "product-types"
  | "review"
  | "progress"
  | "reconcile";

export type ProductSyncExperienceMode = "first-time" | "returning" | "auto";
export type ProductSyncExperienceView = "first-time" | "returning";

export type ProductSyncMessageState =
  | "SmsgProduced"
  | "SmsgSent"
  | "SmsgConfirmed"
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
  "product-types",
  "review",
  "progress",
  "reconcile"
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

  if (step === "product-types") {
    return true;
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

export function normalizeProductSyncStatus(progress: ProductSyncProgressSnapshot = {}): string {
  if (progress.completed) {
    return "completed";
  }

  if (progress.status) {
    return progress.status.toLowerCase();
  }

  switch (progress.systemMessageState) {
    case "SmsgProduced":
      return "queued";
    case "SmsgSent":
      return "running";
    case "SmsgConfirmed":
      return "completed";
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

export function canShowProductSyncReconcile(progress: ProductSyncProgressSnapshot = {}): boolean {
  return normalizeProductSyncStatus(progress) === "completed";
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

