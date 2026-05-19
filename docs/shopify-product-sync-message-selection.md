# Shopify Product Sync - Message Selection Logic

This document describes the logic used by the Company app to select the "latest" or most relevant System Message when loading the Shopify Product Sync dashboard.

## Overview

A single "Product Sync Run" is not a single database record but a combination of a **System Message**, a **Shopify Bulk Operation**, and an **MDM Log**. To display the status of the "latest" run on the dashboard, the system must first decide which System Message represents that latest run.

## Selection Process

The process happens in `src/services/ShopifyProductSyncService.ts` within the `fetchProductUpdateSyncRunState` function.

### 1. Fetching Candidate Messages

The system queries the backend for the most recent system messages matching the following criteria:

- **Type**: `BulkQueryShopifyProductUpdates`
- **Scope**: Filtered by the current shop's ID (`remoteInternalId`).
- **Sorting**: Ordered by `-lastUpdatedStamp` (most recently updated first).
- **Limit**: Capped at **100** messages (Page Size).

### 2. Ranking and Selection

Once the list of up to 100 candidate messages is retrieved, the `getLatestSystemMessage` function reduces the list to a single "best" message using the following rules:

#### Rule A: Status Ranking
Each message is assigned a rank based on its `statusId` and the associated `logStatusId`. Messages that have progressed further in the synchronization pipeline get a higher priority.

Here is the priority table (documented in the OMS repository and implemented in `getSystemMessageRank`):

| Priority | Where the Shopify bulk operation is | Code Status / Log Status | What this means for the user |
| :--- | :--- | :--- | :--- |
| **Highest** | HotWax is importing the Shopify product file. | `dmlsrunning` (Rank 5) | Shopify has already accepted the bulk request, prepared the product data file, and returned it to HotWax. HotWax is now applying that file. This is the most important active run because it can still change catalog data in HotWax. |
| **High** | HotWax has received Shopify's bulk operation response and is preparing the import. | `dmlspending` / `smsgconsumed` (Rank 4.5) | Shopify has responded to the bulk job. HotWax has enough information to continue toward file processing. |
| **Medium** | Shopify has the bulk operation request. | `msgsent` / `sent` (Rank 3) | HotWax has sent the product sync request to Shopify. Shopify is now responsible for preparing the product export file. |
| **Low** | Shopify bulk operation produced. | `msgproduced` / `produced` (Rank 2.5) | The request is in an early stage. |
| **Lowest** | No active bulk operation or import needs attention. | Completed or Failed (Rank 1 or 0) | The latest product sync run already moved through Shopify export and HotWax import. |

A message with a higher status rank will always be preferred over a message with a lower rank, even if the lower-ranked message is newer. This ensures the dashboard surfaces the run that needs attention (e.g., stuck in progress) rather than a newer one that hasn't started yet.

#### Rule B: Timestamp Tie-Breaker
If two messages have the same status rank, the system compares their `lastUpdatedStamp`. The message with the more recent timestamp is selected.

---

## Documentation vs. Implementation Gaps

An audit of the documentation in `product-sync-console.md` against the implementation in `ShopifyProductSyncService.ts` reveals the following gaps:

### 1. Missing Status in Documentation
The code includes a specific rank for the status `smsgreceived`:
```typescript
if (statusId === "smsgreceived") return 3.5;
```
This state sits between "Shopify has the request" (Rank 3) and "HotWax received response" (Rank 4.5). However, this status is **completely missing** from the table in the documentation.

### 2. Fallback Rank (0) vs. Terminal Rank (1)
In the code, terminal (completed/failed) runs return a rank of `1`.
Any other status that doesn't match the specific `if` conditions returns a fallback rank of `0`.
```typescript
// Default for any unknown in-progress status
return 0;
```
This creates a potential logic flaw: an active run that falls into an "unknown" or unhandled status will be assigned a rank of `0`. Consequently, the system will prefer an older, completed run (Rank 1) over this active run, effectively hiding it from the dashboard.

### 3. Ambiguity in "Queued" State
The documentation describes the lowest active priority as "HotWax has queued the request, but Shopify doesn't have it yet."
The code maps this to:
```typescript
if (statusId === "msgproduced" || statusId === "smsgproduced" || statusId === "produced") return 2.5;
```
In system message terminology, `produced` usually means the message has been generated but not necessarily that it is in a "queue" waiting to be sent.

### 4. Selection of Oldest vs. Newest Consumed Message
The documentation implies that when no active sync is running, the dashboard should display the status of the **most recent** completed/consumed run.
However, there is a potential bug or gap where the system might be showing the **oldest** consumed message instead of the newest.
The logic in `getLatestSystemMessage` uses a `reduce` function with a timestamp comparison:
```typescript
if (currentTimestamp > latestTimestamp) {
  return current;
}
return latest;
```
If the array of fetched messages is sorted from newest to oldest (as specified by `orderByField: "-lastUpdatedStamp"`), the first item is the newest. The comparison `currentTimestamp > latestTimestamp` will fail for subsequent (older) items, causing the function to retain the first (newest) item.
If the system is indeed showing the oldest message, it implies one of the following:
- The backend is returning the list in **ascending** order (oldest first) despite the order-by field, and the timestamp comparison is failing (e.g., returning `0` due to parsing issues), causing it to fallback to the first element (the oldest).
- The timestamp parsing in `getTimestampValue` is failing for the newest messages, causing them to evaluate to `0` and lose to older messages with valid timestamps.

---

## Technical Implications

### The 100-Message Limit Trade-off

Because the system only evaluates the **100 most recently updated messages**, there is an edge-case trade-off:

> [!WARNING]
> If a successful sync run (high rank) occurred in the past, but has been followed by more than 100 failed or pending attempts (low rank), the successful run will fall outside the evaluated window. The dashboard will then display the status of the "best" failed/pending run among the last 100, effectively "forgetting" the older successful run.
