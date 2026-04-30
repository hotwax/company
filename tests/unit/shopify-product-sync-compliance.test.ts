import assert from "assert";
import fs from "fs";
import path from "path";

const readProjectFile = (relativePath: string) => {
  return fs.readFileSync(path.resolve(__dirname, "../..", relativePath), "utf8");
};

const collectProjectFiles = (relativeDirectory: string): string[] => {
  const directory = path.resolve(__dirname, "../..", relativeDirectory);

  return fs.readdirSync(directory).flatMap((entry) => {
    const absolutePath = path.join(directory, entry);
    const stat = fs.statSync(absolutePath);

    if (stat.isDirectory()) {
      return collectProjectFiles(path.join(relativeDirectory, entry));
    }

    return /\.(js|ts|vue)$/.test(entry) ? [path.relative(path.resolve(__dirname, "../.."), absolutePath)] : [];
  });
};

describe("shopify product sync implementation compliance", () => {
  test("product sync views do not use inline styles, grid layouts, or localStorage state", () => {
    const files = [
      "src/views/ShopifyProductSync.vue",
      "src/views/ShopifyProductSyncHistory.vue",
      "src/components/ShopifyProductSyncHistoryView.vue",
      "src/components/ShopifyProductSyncReturningView.vue",
      "src/components/ShopifyProductSyncWizardView.vue"
    ];

    for (const file of files) {
      const source = readProjectFile(file);

      assert.equal(/\sstyle=/.test(source), false, `${file} should not add inline styles`);
      assert.equal(/<ion-grid|<ion-row|<ion-col/.test(source), false, `${file} should not use ionic grid`);
      assert.equal(/localStorage/.test(source), false, `${file} should not use localStorage`);
    }
  });

  test("product sync child components emit kebab-case events that match parent listeners", () => {
    const productSyncSource = readProjectFile("src/views/ShopifyProductSync.vue");
    const wizardSource = readProjectFile("src/components/ShopifyProductSyncWizardView.vue");
    const returningSource = readProjectFile("src/components/ShopifyProductSyncReturningView.vue");
    const requiredEvents = [
      "go-next",
      "go-back",
      "product-store-change",
      "identifier-change",
      "open-history",
      "open-unsynced-updates",
      "open-step-details",
      "open-sync-job-details",
      "start-product-sync"
    ];

    for (const eventName of requiredEvents) {
      assert.equal(productSyncSource.includes(`@${eventName}`), true, `parent should listen for ${eventName}`);
      assert.equal(
        wizardSource.includes(`'${eventName}'`) || wizardSource.includes(`"${eventName}"`) ||
          returningSource.includes(`'${eventName}'`) || returningSource.includes(`"${eventName}"`),
        true,
        `child should emit ${eventName}`
      );
    }

    assert.equal(/\$emit\('(goNext|goBack|openHistory|openUnsyncedUpdates|openSyncJobDetails|openStepDetails|productStoreChange|identifierChange|startProductSync)'/.test(wizardSource + returningSource), false);
  });

  test("product sync service does not call Shopify directly or fake import success", () => {
    const service = readProjectFile("src/services/ShopifyProductSyncService.ts");

    assert.equal(/myshopify|admin\/api|bulkOperationRunQuery|client\(/.test(service), false);
    assert.equal(/DUMMY_/.test(service), false);
    assert.equal(service.includes("productSync/setup"), false);
    assert.equal(service.includes("productSync/productStores"), false);
    assert.equal(service.includes("oms/productUpdateHistory"), true);
  });

  test("production source does not contain dummy or product sync fallback implementations", () => {
    const forbiddenPatterns = [
      /\bDUMMY_[A-Z0-9_]*\b/,
      /\bfallbackHistory\b/,
      /\bfallbackProgress\b/,
      /\bfallbackPreflight\b/,
      /\bfallbackSetupState\b/
    ];

    const matches = collectProjectFiles("src").flatMap((file) => {
      const source = readProjectFile(file);
      return forbiddenPatterns
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${file}: ${pattern.source}`);
    });

    assert.deepEqual(matches, []);
  });

  test("returning history uses a dedicated vue router route", () => {
    const routerSource = readProjectFile("src/router/index.ts");

    assert.equal(routerSource.includes("/shopify-connection-details/:id/product-sync/history"), true);
    assert.equal(routerSource.includes("name: 'ShopifyProductSyncHistory'"), true);
  });

  test("product sync history sorts system message runs", () => {
    const historySource = readProjectFile("src/views/ShopifyProductSyncHistory.vue");

    assert.equal(historySource.includes('sortOrder: "newest"'), true);
    assert.equal(historySource.includes('return filters.sortOrder === "oldest" ? "initDate" : "-initDate"'), true);
    assert.equal(historySource.includes('translate("Newest first")'), true);
    assert.equal(historySource.includes('translate("Oldest first")'), true);
    assert.equal(historySource.includes("sortSystemMessagesBySelectedOrder"), true);
    assert.equal(historySource.includes("orderByField: '-initDate'"), false);
    assert.equal(historySource.includes("orderByField: 'initDate DESC'"), false);
    assert.equal(historySource.includes('translate("Product sync history")'), true);
    assert.equal(historySource.includes("remoteMessageId?.startsWith"), false);
    assert.equal(historySource.includes("const PAGE_SIZE = 25"), true);
    assert.equal(historySource.includes("ion-infinite-scroll"), true);
    assert.equal(historySource.includes("fetchSystemMessageLogDetailsPage"), true);
    assert.equal(historySource.includes("initDate_from"), false);
    assert.equal(historySource.includes("initDate_thru"), false);
  });

  test("product sync system message queries are scoped by type and remote, not direction", () => {
    const historySource = readProjectFile("src/views/ShopifyProductSyncHistory.vue");
    const serviceSource = readProjectFile("src/services/ShopifyProductSyncService.ts");
    const productSyncSource = readProjectFile("src/views/ShopifyProductSync.vue");

    for (const source of [historySource, serviceSource, productSyncSource]) {
      assert.equal(/isoutgoing/i.test(source), false);
    }

    assert.equal(historySource.includes("systemMessageTypeId"), true);
    assert.equal(historySource.includes("systemMessageRemoteId"), true);
    assert.equal(historySource.includes("fetchSystemMessageLogDetailsPage"), true);
    assert.equal(historySource.includes("if (!hasDateFilters.value) break"), false);
    assert.equal(historySource.includes("bufferedSystemMessages"), true);
    assert.equal(historySource.includes("appendSystemMessagesToHistoryPage"), true);
  });

  test("product sync history keeps query content available on history runs", () => {
    const historySource = readProjectFile("src/views/ShopifyProductSyncHistory.vue");
    const syncRunSource = readProjectFile("src/composables/useShopifyProductSyncRun.ts");

    assert.equal(syncRunSource.includes("shopifyBulkOperation?.query"), true);
    assert.equal(historySource.includes("queryContent"), true);
    assert.equal(historySource.includes("queryContent: shopifyBulkOperation?.query"), true);
  });

  test("product sync history time formatting accepts string and numeric dates", () => {
    const historyViewSource = readProjectFile("src/components/ShopifyProductSyncHistoryView.vue");
    const systemMessageHistorySource = readProjectFile("src/utils/systemMessageHistory.ts");

    assert.equal(historyViewSource.includes("parseSystemMessageDateTime"), true);
    assert.equal(systemMessageHistorySource.includes("DateTime.fromMillis"), true);
    assert.equal(systemMessageHistorySource.includes("DateTime.fromISO"), true);
    assert.equal(systemMessageHistorySource.includes("typeof value === \"string\""), true);
  });

  test("product sync history status filters include received and consumed messages", () => {
    const historySource = readProjectFile("src/views/ShopifyProductSyncHistory.vue");

    assert.equal(historySource.includes('value: "SmsgReceived"'), true);
    assert.equal(historySource.includes('value: "SmsgConsumed"'), true);
  });

  test("product sync history disables infinite scroll after failed history loads", () => {
    const historySource = readProjectFile("src/views/ShopifyProductSyncHistory.vue");

    const catchBlock = historySource.match(/catch \(error: any\) \{[\s\S]*?\} finally/);
    const disabledOccurrences = historySource.match(/hasMoreBackendHistory\.value = false/g) || [];

    assert.notEqual(catchBlock, null);
    assert.equal(catchBlock?.[0].includes("hasMoreBackendHistory.value = false"), true);
    assert.equal(disabledOccurrences.length >= 2, true);
  });

  test("data manager logs are fetched by exact system message id", () => {
    const dataManagerLogSource = readProjectFile("src/composables/useDataManagerLog.ts");
    const syncRunSource = readProjectFile("src/composables/useShopifyProductSyncRun.ts");

    assert.equal(dataManagerLogSource.includes('systemMessageId_op: "equals"'), true);
    assert.equal(dataManagerLogSource.includes("pageSize: 1"), true);
    assert.equal(syncRunSource.includes("fetchMdmLogBySystemMessageIds(mdmLogSystemMessageIds)"), true);
    assert.equal(syncRunSource.includes("relatedSystemMessageIds"), true);
  });

  test("product sync history ignores stale overlapping loads", () => {
    const historySource = readProjectFile("src/views/ShopifyProductSyncHistory.vue");

    assert.equal(historySource.includes("historyLoadToken"), true);
    assert.equal(historySource.includes("isStaleHistoryLoad"), true);
    assert.equal(historySource.includes("appendSystemMessagesToHistoryPage"), true);
  });

  test("product sync run details return local response data instead of shared composable state", () => {
    const dataManagerLogSource = readProjectFile("src/composables/useDataManagerLog.ts");
    const systemMessageSource = readProjectFile("src/composables/useSystemMessage.ts");

    assert.equal(dataManagerLogSource.includes("const mdmLogDetails ="), true);
    assert.equal(dataManagerLogSource.includes("return mdmLogDetails"), true);
    assert.equal(systemMessageSource.includes("const systemMessage = response.data.systemMessages[0]"), true);
    assert.equal(systemMessageSource.includes("return systemMessage"), true);
    assert.equal(systemMessageSource.includes("return payload"), true);
  });

  test("first-time wizard progress owns the Figma sync progress experience", () => {
    const productSyncSource = readProjectFile("src/views/ShopifyProductSync.vue");
    const wizardSource = readProjectFile("src/components/ShopifyProductSyncWizardView.vue");
    const historyViewSource = readProjectFile("src/components/ShopifyProductSyncHistoryView.vue");

    assert.equal(wizardSource.includes('currentStep === \'progress\''), true);
    assert.equal(wizardSource.includes("Product export request payload"), true);
    assert.equal(wizardSource.includes("Pending bulk operations"), true);
    assert.equal(wizardSource.includes("Bulk file process"), true);
    assert.equal(wizardSource.includes("getProductSyncBulkOperationProgress"), true);
    assert.equal(wizardSource.includes("reviewStats?.shopifyProductCount"), true);
    assert.equal(wizardSource.includes("currentSyncRun?.bulkOperation?.objectCount"), true);
    assert.equal(wizardSource.includes("queuedJobsAhead"), true);
    assert.equal(productSyncSource.includes("await loadReviewStats();"), true);
    assert.equal(historyViewSource.includes("Product export request payload"), false);
    assert.equal(historyViewSource.includes("getProductSyncBulkOperationProgress"), false);
  });

  test("product sync history can download raw Shopify files from data manager logs", () => {
    const historySource = readProjectFile("src/views/ShopifyProductSyncHistory.vue");
    const historyViewSource = readProjectFile("src/components/ShopifyProductSyncHistoryView.vue");
    const dataManagerLogSource = readProjectFile("src/composables/useDataManagerLog.ts");
    const syncRunSource = readProjectFile("src/composables/useShopifyProductSyncRun.ts");

    assert.equal(historyViewSource.includes("downloadOutline"), true);
    assert.equal(historyViewSource.includes("downloadRawFile"), true);
    assert.equal(historyViewSource.includes("@click.stop=\"emitDownloadRawFile(run)\""), true);
    assert.equal(historyViewSource.includes("IonAlert"), false);
    assert.equal(historySource.includes("downloadRawShopifyFile"), true);
    assert.equal(historySource.includes("mdmLogContentId"), true);
    assert.equal(historySource.includes("mdmLogConfigId"), true);
    assert.equal(dataManagerLogSource.includes("downloadDataManagerFile"), true);
    assert.equal(dataManagerLogSource.includes("admin/dataManager/downloadDataManagerFile"), true);
    assert.equal(syncRunSource.includes("logContentId: mdmLog?.logContentId"), true);
  });
});
