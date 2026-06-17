# Shopify Inventory (and Order) Bulk-Import Fix — companion to mantle-shopify-connector#356

**Status:** proposal · adversarially verified against source (workflow, 2026-06-17) · no new endpoints
**Repos:** `mantle-shopify-connector` (primary), `hotwax-shopify-oms-bridge` (context)
**Relationship to PRs:** complementary to **#356** (`fix/bulk-import-memory-limit`). Neither alone is sufficient.

## TL;DR

The Shopify→OMS inventory-reset bulk import strands silently. The OMS→Shopify half works (a real Shopify bulk op completes with ~13.7k inventory objects); the inbound import never lands. Root cause is **not** a missing result URL or a null `receivePath` (those were first-pass red herrings) — it is that a **download failure is swallowed as a soft error**, which trips Moqui's pre-service error gate and **skips the status transition + consume**, leaving the message stuck and **never retried**.

The fix is two small, generic changes in `mantle-shopify-connector` plus landing #356; it fixes both inventory reset and (separately) the product-update bulk flow, and leaves order history untouched.

## Validation (live, 2026-06-17)

Confirmed end-to-end on an isolated JUNE-15 instance (cloned `notnaked` DB, hc-sandbox shop) **with #356 applied and driving the correct new-path poller** (`poll_ShopifyBulkOperationResult`, **not** the legacy `poll_BulkOperationResult_ShopifyBulkQuery`):

- Shopify bulk inventory query → COMPLETED, **13,726 objects / 3.5 MB JSONL**
- `process#ShopifyBulkOperationResult` downloaded to `receiveMovePath/{id}.jsonl` → message `SmsgReceived → SmsgConsumed`
- DataManagerLog `RESET_SHOPIFY_INVENTORY` → **DmlsFinished, 2,572 records (129 failed)**
- **`external_inventory_reset`: 9,560 → 19,239 (+9,679)** and **`inventory_item_detail`: 12,659 → 22,338 (+9,679)** — real per-facility/per-product reset rows (YONKERS, WEST_VALLEY_CITY, TIMES_SQUARE, …) with Shopify on-hand values
- Outbound echo correctly self-suppressed (resets skipped while `SHOPIFY_INV_SYNC ≠ Y`)

**Takeaway:** the *happy path* works once #356 makes the large-file download succeed **and** the correct (new-path) poller is used. The PRIMARY code change below is therefore **robustness hardening** — it ensures a *failed* download (e.g., expired URL) becomes a bounded, retryable `SmsgError` instead of a silently-stranded message — rather than being strictly required for the success path. Both should land for a reliable cold start.

## Pipeline (new path — what inventory reset uses)

`sync#ShopifyInventoryReset` → produces a `BulkQueryShopifyInventoryReset` SystemMessage (parent `ShopifyBulkQuery`) → `send#…` sends the bulk query to Shopify → **`poll_ShopifyBulkOperationResult` → `process#ShopifyBulkOperationResult`** fetches the fresh result URL (`statusResponse.response.url`) and downloads the JSONL to `receiveMovePath/{systemMessageId}.jsonl` → transitions the message to `SmsgReceived` → `consume#ReceivedSystemMessage` → bridge `consume#ShopifyInventoryResetDataFile` reads that file → `upload#DataManagerFile` (RESET_SHOPIFY_INVENTORY) → `import#ShopifyInventoryReset` → poorti `reset#ProductFacilityInventory` → `ExternalInventoryReset` rows.

This type intentionally has `receiveMovePath` set and **no** `receivePath`; the new poller does not use `receivePath` or `messageText`.

## Root cause (RC#3, adversarially verified)

In `service/co/hotwax/shopify/system/ShopifySystemMessageServices.xml`, `process#ShopifyBulkOperationResult` (~lines 436–464) does the result-file **download before** the `SmsgReceived` transition. The download service `store#BulkOperationResultFile` (`service/co/hotwax/shopify/graphQL/ShopifyBulkImportServices.xml:172–175`) reports failure as a **soft error**:

```groovy
} catch (Exception e) {
    ec.message.addError("Failed to download bulk operation result file ... ${downloadUrl}, Error: ${e.getMessage()}")
    return
}
```

Once an error is pending in the message facade, Moqui's `ServiceCallSyncImpl.callSingle` (ServiceCallSyncImpl.java:135–136) **skips every subsequent service-call** — so the `update#SystemMessage → SmsgReceived` and the `consume#ReceivedSystemMessage` are **both skipped**. The message is stranded (at `SmsgSent`/`SmsgConfirmed`), **no `SystemMessageError` is written**, `failCount` is never incremented, and the normal retry job (`consume_AllReceivedSystemMessages_frequent`, which only acts on `SmsgReceived`) never sees it. Re-running the poll just re-downloads and fails the same way.

- **Why Jun-13 worked / now fails:** the download used to succeed; once the full-catalog (13,726-object) result file started failing to download (the OOM/streaming problem **#356** fixes), the swallowed error path began stranding the message.
- **Regression boundary:** connector commit `79c4ec3` (May 5) moved the unchecked download to just before the `SmsgReceived` transition.
- **Symptom correction:** the “consume NPE on `InputStreamReader`” seen when poking the *legacy* poller is a side-symptom; `ShopifyHelper.transformShopifyJsonl` guards null refs, and on the **new** path the consume reader is never reached — the real user-visible symptom is a stranded message.

## The fix (no new endpoints)

### PRIMARY — make a failed download retryable instead of silently skipped
`mantle-shopify-connector/service/co/hotwax/shopify/system/ShopifySystemMessageServices.xml`, in `process#ShopifyBulkOperationResult` (~436–464), reorder + guard:

1. On `completed`, **first** `update#SystemMessage` → `statusId: SmsgReceived`, `isOutgoing: 'N'`, `transaction: force-new` (so the status commits before consume).
2. **Then** download to `receiveMovePath/{systemMessageId}.jsonl`.
3. **Then** check `ec.message.hasError()`:
   - if **true**: capture errors, `ec.message.clearErrors()`, `create#SystemMessageError` (`attemptedStatusId: SmsgConsumed`, errorText), and `return` — leaving the message at `SmsgReceived` so `consume_AllReceivedSystemMessages_frequent` retries it and escalates to `SmsgError` after `retryLimit`.
   - if **false**: call `consume#ReceivedSystemMessage` (unchanged happy path).
4. Keep the no-`downloadUrl` branch (warn + `SmsgConsumed`).

Net: the `SmsgReceived` transition can no longer be skipped by the poisoned facade, and a transient download failure becomes **bounded, visible, retryable** (`SmsgReceived → SmsgError` after N tries) instead of an infinite silent loop. This is the inverse of the regressing commit `79c4ec3`.

### DEFENSE-IN-DEPTH (gated on PRIMARY + coordinated with #356)
`mantle-shopify-connector/service/co/hotwax/shopify/graphQL/ShopifyBulkImportServices.xml:172–175` — make `store#BulkOperationResultFile` **throw** instead of `addError`+return:

```groovy
} catch (Exception e) {
    throw new org.moqui.BaseException("Failed to download bulk operation result file from Shopify at URL: ${downloadUrl}", e)
}
```
All callers run under a `consume`/try wrapper, so a throw becomes a clean retryable failure. **#356 rewrites this exact service to streaming `copyURLToFile`** — coordinate so the merged version still **surfaces** failure (throw/addError) and never writes a truncated/empty file.

### OPERATIONAL precondition (deployment, not code)
Ensure the **new** poller `poll_ShopifyBulkOperationResult` is the active one for the `ShopifyBulkQuery` inventory-reset/product-update family, and the **legacy** `poll_BulkOperationResult_ShopifyBulkQuery` stays the poller for order-history/metafield/product-tag legacy types. Both jobs select `limit=1` `SmsgSent` under `parentTypeId=ShopifyBulkQuery`, so **only one may be un-paused per family** (otherwise it's a race). Seed pause-state does not auto-correct live `ServiceJob` rows — confirm on the running instance.

## Rejected alternatives (verified harmful / no-op)

- **Repoint `poll_BulkOperationResult_ShopifyBulkQuery` → `poll#ShopifyBulkOperationResult`** — *harmful.* That legacy job is the sole poller for `BulkOrderHistoryQuery` and all legacy `ShopifyBulkQuery` children (metafields, product/order bulk), which use `receivePath` + `messageText` semantics and have no `receiveMovePath`. Repointing breaks order-history and product/metafield import.
- **Add `receivePath` to the `BulkQueryShopifyInventoryReset` seed** — *no-op.* `receivePath` is only read by the legacy `consume#BulkOperationResult`, which is not this type's consume service; under the new poller it's ignored.

## Regression analysis

- **Happy path / Jun-13:** safe — a successful download still flows `SmsgReceived → consume → SmsgConsumed`.
- **Product-update bulk (`BulkQueryShopifyProductUpdates`):** safe and improved — same new path, benefits identically.
- **Order-history (`BulkOrderHistoryQuery`):** safe — on the untouched legacy path. (It carries the *same class* of latent defect in `process#BulkOperationResult` — terminal `SmsgConfirmed` before download — worth a **follow-up**, out of scope here.)
- **Echo-suppression / `SHOPIFY_INV_SYNC` ordering:** safe — orthogonal (outbound SECA path), untouched.

## Residual risk

1. **Necessary, not sufficient alone** — this + #356 are complementary: #356 makes the large-file download *succeed*; this makes failures *retryable/visible* instead of silently stranding. Land both.
2. **Shopify result URLs are time-limited** — bounded retries may escalate to `SmsgError` if a URL expires mid-retry (acceptable + visible; `failCount` now lives on the consume side).
3. **Dual-poller race** — enforce exactly one active `ShopifyBulkQuery` poller per family.
4. **Order-history latent defect** — recommended follow-up.

## Recommendation

File this as a companion PR to **#356** against `mantle-shopify-connector` (PRIMARY + the coordinated `store#BulkOperationResultFile` change), with the operational note about which poller to un-pause. No bridge code or new endpoints required.
