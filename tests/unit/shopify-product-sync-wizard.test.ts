import assert from "assert";
import {
  canAdvanceProductSyncStep,
  canShowProductSyncReconcile,
  canStartProductSync,
  createProductSyncWizardDraft,
  getProductSyncBulkOperationProgress,
  getReviewImportAction,
  requiresPreflightConfirmation,
  resolveProductSyncExperienceMode,
  selectProductStore,
  shouldShowProductSyncProgress
} from "../../src/utils/shopifyProductSyncWizard";

describe("shopify product sync wizard state", () => {
  test("product store verification resets when selection changes", () => {
    const verifiedDraft = createProductSyncWizardDraft({
      selectedProductStoreId: "STORE_A",
      productStoreVerified: true
    });

    assert.equal(selectProductStore(verifiedDraft, "STORE_A").productStoreVerified, true);
    assert.equal(selectProductStore(verifiedDraft, "STORE_B").productStoreVerified, false);
  });

  test("Next is disabled until product store and identifier gates pass", () => {
    assert.equal(
      canAdvanceProductSyncStep("product-store", {
        draft: createProductSyncWizardDraft()
      }),
      false
    );

    assert.equal(
      canAdvanceProductSyncStep("product-store", {
        draft: createProductSyncWizardDraft({
          selectedProductStoreId: "STORE_A",
          productStoreVerified: false
        })
      }),
      false
    );

    assert.equal(
      canAdvanceProductSyncStep("product-store", {
        draft: createProductSyncWizardDraft({
          selectedProductStoreId: "STORE_A",
          productStoreVerified: true
        })
      }),
      true
    );

    assert.equal(
      canAdvanceProductSyncStep("identifier", {
        draft: createProductSyncWizardDraft()
      }),
      false
    );

    assert.equal(
      canAdvanceProductSyncStep("identifier", {
        draft: createProductSyncWizardDraft({ selectedIdentifierEnumId: "SHOPIFY_PRODUCT_SKU" })
      }),
      true
    );
  });

  test("identifier locked state is read-only but advanceable", () => {
    assert.equal(
      canAdvanceProductSyncStep("identifier", {
        draft: createProductSyncWizardDraft(),
        identifierLocked: true
      }),
      true
    );
  });

  test("locked product store still requires a selected store", () => {
    assert.equal(
      canAdvanceProductSyncStep("product-store", {
        draft: createProductSyncWizardDraft(),
        productStoreLocked: true
      }),
      false
    );

    assert.equal(
      canAdvanceProductSyncStep("product-store", {
        draft: createProductSyncWizardDraft({ selectedProductStoreId: "STORE_A" }),
        productStoreLocked: true
      }),
      true
    );
  });

  test("review and progress steps wait for readiness gates", () => {
    assert.equal(
      canAdvanceProductSyncStep("review", {
        draft: createProductSyncWizardDraft()
      }),
      false
    );

    assert.equal(
      canAdvanceProductSyncStep("review", {
        draft: createProductSyncWizardDraft(),
        reviewReady: true
      }),
      true
    );

    assert.equal(
      canAdvanceProductSyncStep("progress", {
        draft: createProductSyncWizardDraft()
      }),
      false
    );

    assert.equal(
      canAdvanceProductSyncStep("progress", {
        draft: createProductSyncWizardDraft(),
        progressComplete: true
      }),
      true
    );
  });

  test("review import opens confirmation instead of starting directly", () => {
    assert.deepEqual(getReviewImportAction(), {
      opensStartConfirmation: true,
      startsSync: false
    });
  });

  test("start sync requires checkbox confirmation", () => {
    assert.equal(canStartProductSync(false), false);
    assert.equal(canStartProductSync(true), true);
  });

  test("progress only appears after a successful start", () => {
    assert.equal(shouldShowProductSyncProgress({}), false);
    assert.equal(shouldShowProductSyncProgress({ success: true }), false);
    assert.equal(shouldShowProductSyncProgress({ syncJobId: "SMSG_1" }), false);
    assert.equal(shouldShowProductSyncProgress({ success: true, syncJobId: "SMSG_1" }), true);
  });

  test("reconcile only appears after complete status", () => {
    assert.equal(canShowProductSyncReconcile({ systemMessageState: "SmsgProduced" }), false);
    assert.equal(canShowProductSyncReconcile({ systemMessageState: "SmsgSent" }), false);
    assert.equal(canShowProductSyncReconcile({ systemMessageState: "SmsgError" }), false);
    assert.equal(canShowProductSyncReconcile({ systemMessageState: "SmsgConfirmed" }), true);
    assert.equal(canShowProductSyncReconcile({ status: "completed" }), true);
  });

  test("bulk operation progress uses object count against the review product count", () => {
    assert.deepEqual(
      getProductSyncBulkOperationProgress(25, 100),
      { processedCount: 25, totalCount: 100, value: 0.25, hasTotalCount: true }
    );
    assert.deepEqual(
      getProductSyncBulkOperationProgress(125, 100),
      { processedCount: 125, totalCount: 100, value: 1, hasTotalCount: true }
    );
    assert.deepEqual(
      getProductSyncBulkOperationProgress(25, 0),
      { processedCount: 25, totalCount: 0, value: 0, hasTotalCount: false }
    );
  });

  test("preflight warning thresholds require confirmation below seven of ten", () => {
    assert.equal(requiresPreflightConfirmation({ matched: 4, sampled: 10 }), true);
    assert.equal(requiresPreflightConfirmation({ matched: 6, sampled: 10 }), true);
    assert.equal(requiresPreflightConfirmation({ matched: 7, sampled: 10 }), false);
  });

  test("experience mode can be forced or resolved from Shopify shop product count", () => {
    assert.equal(resolveProductSyncExperienceMode("first-time", 10), "first-time");
    assert.equal(resolveProductSyncExperienceMode("returning", 0), "returning");
    assert.equal(resolveProductSyncExperienceMode("auto", 0), "first-time");
    assert.equal(resolveProductSyncExperienceMode("auto", 1), "returning");
  });
});
