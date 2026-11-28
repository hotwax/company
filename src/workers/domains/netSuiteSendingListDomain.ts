import { companyDb } from "@/db/companyDb";
import { NETSUITE_SENDING_LIST_DOMAIN, NETSUITE_STEP_LIST_PAGE } from "@/config/appSyncConfig";
import { findNetSuiteSendingList, findNetSuiteSendingWay } from "@/config/netSuiteSending";
import { defineSyncDomain } from "@common/db/sync/defineSyncDomain";
import { workerGet } from "@common/core/workerRemoteApi";

const netSuiteSendingListEntity = companyDb.entity(companyDb.tables.netSuiteSendingLists);

export interface NetSuiteSendingListArgs {
  way?: string;
  list?: string;
  limit?: number;
}

export const netSuiteSendingListDomain = defineSyncDomain({
  name: NETSUITE_SENDING_LIST_DOMAIN,
  table: companyDb.tables.netSuiteSendingLists,
  label: "NetSuite sending list",
  syncClass: "A",
  intervalMs: 60_000,
  async sync(ctx, args: NetSuiteSendingListArgs = {}) {
    const sendingWay = findNetSuiteSendingWay(String(args.way ?? ""));
    const sendingList = findNetSuiteSendingList(String(args.list ?? ""));
    if (!sendingWay || !sendingList) return 0;

    const url = "netsuite/batchMessages";
    const response = await workerGet(ctx, url, {
      parentSystemMessageTypeId: sendingWay.parentSystemMessageTypeId,
      messageList: sendingList.list,
      pageSize: args.limit ?? NETSUITE_STEP_LIST_PAGE,
    });
    if (!Array.isArray(response?.messages)) {
      throw new Error(`${url} gave no messages list for ${sendingWay.parentSystemMessageTypeId}`);
    }

    return netSuiteSendingListEntity.upsertMany([{
      way: sendingWay.way,
      list: sendingList.list,
      messageCount: response.messageCount,
      messages: response.messages,
    }]);
  },
});
