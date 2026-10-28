import { companyDb } from "@/db/companyDb";
import { defineSyncDomain } from "@common/db/sync/defineSyncDomain";
import { workerGet } from "@common/core/workerRemoteApi";

const errorEntity = companyDb.entity(companyDb.tables.systemMessageErrors);

/**
 * SystemMessageError — class C: fetched for one message when it is inspected (`refreshAfterMutation`),
 * never polled. Only failed messages have errors, so polling every message's errors would be almost
 * entirely wasted requests.
 *
 * The endpoint answers a bare array (verified live: `[ ]` for a message with no errors) and does
 * not echo `systemMessageId` on each row — the id is only in the URL — so it is stamped in here;
 * without it the composite key cannot be built.
 */
export const systemMessageErrorDomain = defineSyncDomain({
  name: "systemMessageError",
  table: "systemMessageErrors",
  label: "System message errors",
  syncClass: "C",
  async sync() {
    return 0;
  },
  async refetchOne(ctx, pk) {
    const systemMessageId = String(pk?.systemMessageId ?? "");
    if (!systemMessageId) return 0;
    const response = await workerGet(ctx, `admin/systemMessages/${encodeURIComponent(systemMessageId)}/errors`, {
      orderByField: "-errorDate",
      pageSize: 50,
    });
    const errors: any[] = Array.isArray(response) ? response : [];
    return errors.length ? errorEntity.upsertMany(errors.map((error) => ({ ...error, systemMessageId }))) : 0;
  },
});
