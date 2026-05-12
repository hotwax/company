# Shopify Product Sync — Live Dashboard

This document describes the intended behavior of the Shopify Product Sync page (`/shopify-connection-details/:shopId/product-sync`) as a live, dashboard-feel surface. It supersedes the ad-hoc auto-refresh logic currently in [`src/views/ShopifyProductSync.vue`](../src/views/ShopifyProductSync.vue) (`progressPoll`, `nextSyncRefreshPoll`, `refreshScheduledJobStateIfNeeded`), which will be refactored to match this spec.

## 1. Goal & principles

The page should feel like a live dashboard: data arrives in place, the UI never blanks out on refresh, and nothing visibly "reloads".

- **Zero layout shift.** Containers reserve space; no element collapses or jumps when stale data is replaced with fresh data.
- **No skeletons or spinners on refresh.** Once a section has rendered real data at least once, it never shows a skeleton or spinner again for the rest of the session. Cold start is the exception — see §4a.
- **Organic transitions.** Numbers tween (count-up/down), lists FLIP, badges fade between states.
- **Refresh cadence is driven by what the data is**, not a single global interval.

## 2. Data tiers

Each tier has its own cadence and refresh strategy.

| Tier | Examples | Refresh strategy |
| --- | --- | --- |
| Always-live | In-flight run progress, current step, next-run countdown | Short tick (5s) while a run is active; tick is paused when nothing is running. |
| Event-driven | Product update history, MDM error logs, recent sync runs | Refetched when a tier-1 signal changes (run started, run ended, new activity detected by the probe in §3). |
| Slow-moving | Shop config, system message types, webhook subscriptions | Fetched on mount; refreshed only on user action or a major event (e.g. webhook toggle). |

## 3. Refresh triggers

Replaces the single 15s `nextSyncRefreshPoll` interval with a layered set of triggers:

- **Time-based.** Short tick (5s) only while a run is active. Long tick (60s) drives the "next run in X min" countdown labels. No tick when nothing is happening.
- **Scheduled-run boundary.** When a tracked job's `nextRunTime` passes, kick a single refresh and open a short grace window (~2 min) to catch backend lag.
- **Activity probe.** A lightweight `serviceJobRuns?pageSize=1` poll detects new `startTime`/`endTime` on the sync job. Only when a change is observed do we trigger a heavier tier-2 refetch.
- **User intent.** Page visibility change (tab refocus), manual refresh button, action completion (e.g. "run now", webhook toggle).

Tracked jobs are the dedup'd set of: `syncJob`, `bulkOperationSendJob`, `bulkOperationPollJob`, and any currently-open job-details job. Paused jobs are excluded.

## 4. UI mechanics — the "feel" rules

These apply once data has been loaded at least once.

- **Counts and durations** use a `useAnimatedNumber` composable that rAF-tweens from old → new value (~400ms ease-out). This covers totals, success counts, failed-record counts, elapsed/remaining time.
- **Lists** use `<transition-group name="list">` with FLIP. New items enter from the top, removed items fade out, position changes animate. The "Recently synced product updates" and "Parsed error details" sections are the primary consumers.
- **Cards** have a fixed `min-height` matching their populated layout, so transitioning from empty → filled never reflows surrounding sections.
- **Stale data stays visible during a refresh.** A subtle section-level indicator (thin progress line on the section header) signals that work is in progress, but the content itself is never replaced with a loader.
- **Empty states are first-class cards** — an intentional icon + short copy + optional CTA, sized to roughly match a populated card. They are not "No data" filler.
- **Badges and status pills** fade between states rather than hard-swapping.

### 4a. Cold start (no prior data)

The "no skeletons or spinners" rule applies to refreshes, not to first paint. On cold start the user *should* see what's loading.

- View-enter renders each section with a **skeleton** (for lists) or **spinner** (for single values), sized to match the populated layout so the swap to real data is in-place — not a reflow.
- Skeletons/spinners are **per section**, not page-wide. Sections fill in independently as their fetches resolve.
- Once a section has rendered real data once in the session, it flips into stale-while-revalidate mode and never shows a skeleton or spinner again — future refreshes keep the last-known-good data visible and update in place.
- Last-known-good data per tier is persisted in composable state, so navigating away and back skips cold-start skeletons.

## 5. State model

Each tier exposes a uniform shape:

```ts
{
  data: T,
  lastFetchedAt: number | null,
  isFetching: boolean,
  hasEverLoaded: boolean,
}
```

- The UI binds to `data` for rendering.
- `hasEverLoaded` selects the render mode:
  - `false` → skeleton (list) or spinner (single value).
  - `true` → render `data` with live transitions; `isFetching` drives only the section-level subtle indicator, never replaces content.
- `lastFetchedAt` and `isFetching` are surfaced for debugging and for the activity probe to decide whether a tier needs a refresh.

A single `useLiveDashboard` composable owns the tickers (§3) and exposes per-tier refs to the view. Views never own intervals directly.

## 6. What's being replaced

Pointers to the current implementation in [`src/views/ShopifyProductSync.vue`](../src/views/ShopifyProductSync.vue), for reference during the refactor:

- `progressPoll` (5s `setInterval` around `loadProgress`) — kept conceptually, but gated to active runs only via the tier-1 ticker.
- `nextSyncRefreshPoll` (15s `setInterval` + `refreshScheduledJobStateIfNeeded` heuristic) — replaced by the layered triggers in §3.
- `isSecondaryLoading` skeleton paths inside `ShopifyProductSyncReturningView.vue` — kept for cold start, removed from refresh paths.
- Inline `isScheduledJobRefreshInFlight`, `lastKnownJobRunStartTime`, `lastKnownJobRunEndTime`, `scheduledJobRefreshAtMs`, `scheduledJobRefreshGraceUntilMs` module-level state — moved into the composable.

## 7. Non-goals

- **Real-time push (SSE/websockets).** Out of scope for v1; polling-only.
- **Changing list ordering semantics.** Order rules don't change — only the transition between states.
- **Cross-page live updates.** Scope is the Product Sync page only; other pages keep their existing fetch-on-enter behavior.
