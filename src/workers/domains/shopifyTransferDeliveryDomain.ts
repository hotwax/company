import { dataManagerLogCache } from "@/utils/cacheEntities";
import { toMillis } from "@/utils/cacheProjection";
import { TRANSFER_DELIVERY_CONFIGS, transferOrdersInFile } from "@/utils/shopifyTransferDelivery";
import { registerSyncDomain } from "../syncRegistry";
import { workerGet, workerPost } from "./workerFetch";

// A bounded shop-scoped window. In-flight logs are rechecked; immutable source membership is
// loaded once. The parameter document also finds update logs whose job result has logIds:[null].
registerSyncDomain({
  name: "shopifyTransferDelivery",
  intervalMs: 10_000,
  async sync(ctx, args: { shopId?: string } = {}) {
    const shopId = String(args.shopId || "").trim();
    if(!shopId) {return 0;}
    const cached = await dataManagerLogCache.all();
    let written = 0;
    for(const configId of Object.values(TRANSFER_DELIVERY_CONFIGS)) {
      const response = await workerPost(ctx, "oms/dataDocumentView", {
        dataDocumentId: "DATA_MANAGER_LOG_AND_PARAMETER",
        customParametersMap: { parameterName: "transferShopId", parameterValue: shopId, configId, orderByField: "-logId" },
        pageSize: 5, pageIndex: 0,
      });
      if(!Array.isArray(response?.entityValueList) || response._ERROR_MESSAGE_ || response._ERROR_MESSAGE_LIST_?.length || response.errors?.length) {
        throw new Error("Transfer delivery discovery response could not be verified.");
      }
      const rows = response.entityValueList;
      for(const row of rows) {
        if(row.parameterName !== "transferShopId" || String(row.parameterValue) !== shopId || row.configId !== configId || !row.logId) {
          throw new Error("Transfer delivery scope could not be verified.");
        }
      }
      // Recheck up to five recent in-flight logs even after they leave the discovery window.
      const discovered = new Set(rows.map((row: any) => String(row.logId)));
      const unfinished = cached.map(row => row.raw as any).filter(log =>
        log.transferShopId === shopId && log.configId === configId && log.logId &&
        !discovered.has(String(log.logId)) && !log.finishDateTime &&
        ["DmlsPending", "DmlsQueued", "DmlsRunning"].includes(log.statusId) &&
        (toMillis(log.createdDate) ?? 0) > Date.now() - 6 * 60 * 60 * 1000)
        .sort((left, right) => (toMillis(right.createdDate) ?? 0) - (toMillis(left.createdDate) ?? 0))
        .slice(0, 5);
      for(const row of [...rows, ...unfinished]) {
        const previous = cached.find(log => log.logId === String(row.logId))?.raw as any;
        if(previous?.transferShopId === shopId && previous.finishDateTime && previous.transferMembershipChecked && !previous.transferMembershipError &&
          toMillis(previous.finishDateTime) === toMillis(row.finishDateTime) &&
          Number(previous.failedRecordCount) === Number(row.failedRecordCount)) {continue;}
        const detail = await workerGet(ctx, "admin/dataManager/details", { logId: row.logId, pageSize: 1 });
        const log = detail?.dataManagerLogs?.[0];
        if(!log || String(log.logId) !== String(row.logId) || log.configId !== configId) {
          throw new Error("Transfer delivery log could not be verified.");
        }
        let orderIds = previous?.transferOrderIds;
        let membershipError = "";
        // Large batch files stay at batch scope rather than loading unbounded payloads for UI.
        if(!orderIds && log.logContentId && Number(log.fileSize) > 0 && Number(log.fileSize) <= 256_000) {
          try {
            const file = await workerGet(ctx, "admin/dataManager/downloadDataManagerFile", { configId, logContentId: log.logContentId });
            orderIds = transferOrdersInFile(file?.csvData ?? file, shopId);
          } catch {membershipError = "Individual transfers in this file could not be verified.";}
        }
        written += await dataManagerLogCache.upsertMany([{ ...log, transferShopId: shopId, transferOrderIds: orderIds, transferMembershipChecked: true, transferMembershipError: membershipError }]);
      }
    }

    return written;
  },
});
