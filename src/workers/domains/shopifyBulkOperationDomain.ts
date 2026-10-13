import { companyDb } from "@/db/companyDb";
import { defineSyncDomain } from "@common/db/sync/defineSyncDomain";
import { workerPost } from "@common/core/workerRemoteApi";
import { BULK_OPERATION_QUERY, getGraphqlPayload } from "@/utils/shopifyBulkOperation";

const bulkOperationEntity = companyDb.entity(companyDb.tables.shopifyBulkOperations);

/**
 * Shopify BulkOperation — class C: fetched for one operation when a run is inspected
 * (`refreshRecord`), never polled.
 *
 * Shopify is reached through the shop's SystemMessageRemote, so `systemMessageRemoteId` travels in
 * the pk next to the key `id`. It is stored on the row too, which is how the cached row says which
 * shop it came from.
 */
export const shopifyBulkOperationDomain = defineSyncDomain({
  name: "shopifyBulkOperation",
  table: "shopifyBulkOperations",
  label: "Shopify bulk operations",
  syncClass: "C",
  async sync() {
    return 0;
  },
  async refetchOne(ctx, pk) {
    const id = String(pk?.id ?? "");
    const systemMessageRemoteId = String(pk?.systemMessageRemoteId ?? "");
    if (!id || !systemMessageRemoteId) return 0;
    const response = await workerPost(ctx, "shopify/graphql", {
      systemMessageRemoteId,
      queryText: BULK_OPERATION_QUERY,
      variables: { id },
    });
    const node = getGraphqlPayload(response)?.node;
    return node ? bulkOperationEntity.upsertMany([{ ...node, systemMessageRemoteId }]) : 0;
  },
});
