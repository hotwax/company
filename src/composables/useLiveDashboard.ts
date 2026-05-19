import { onBeforeUnmount, ref } from "vue";
import logger from "@/logger";

export interface LiveDashboardOptions {
  /** How often the tick callback fires while the dashboard is active. Defaults to 15s. */
  tickIntervalMs?: number;
  /** Fires on every tick. Receives the current epoch ms used by the view for relative-time labels. */
  onTick?: (ctx: { currentTimeMs: number }) => void | Promise<void>;
  /** Fires when the tab becomes visible again. Use to trigger an immediate refresh. */
  onVisible?: () => void | Promise<void>;
}

/**
 * Owns the timing + in-flight guard for a live, dashboard-feel page.
 *
 * - Drives a single `currentTimeMs` ref the view binds to for relative-time labels.
 * - Calls `onTick` on each interval so the view can decide whether a refresh is needed.
 * - Calls `onVisible` when the tab regains focus.
 * - Exposes `runRefresh()` which guards against overlapping refreshes.
 *
 * The view supplies the trigger logic (e.g. scheduled-run boundary, activity probe) inside `onTick`
 * and calls `runRefresh(loadFn)` to perform the work — this composable does not own the data tiers.
 */
export function useLiveDashboard(options: LiveDashboardOptions = {}) {
  const tickIntervalMs = options.tickIntervalMs ?? 15000;
  const currentTimeMs = ref(Date.now());
  const isRefreshInFlight = ref(false);

  let tickHandle: number | undefined;
  let visibilityListener: (() => void) | null = null;
  let stopped = true;

  async function fireTick() {
    currentTimeMs.value = Date.now();
    try {
      await options.onTick?.({ currentTimeMs: currentTimeMs.value });
    } catch (err) {
      logger.error("useLiveDashboard onTick failed", err);
    }
  }

  function start() {
    stop();
    stopped = false;
    currentTimeMs.value = Date.now();
    tickHandle = window.setInterval(() => { void fireTick(); }, tickIntervalMs);

    if (typeof document !== "undefined") {
      visibilityListener = () => {
        if (stopped) return;
        if (document.visibilityState === "visible") {
          currentTimeMs.value = Date.now();
          try {
            const result = options.onVisible?.();
            if (result && typeof (result as Promise<void>).catch === "function") {
              (result as Promise<void>).catch((err) => logger.error("useLiveDashboard onVisible failed", err));
            }
          } catch (err) {
            logger.error("useLiveDashboard onVisible failed", err);
          }
        }
      };
      document.addEventListener("visibilitychange", visibilityListener);
    }
  }

  function stop() {
    stopped = true;
    if (tickHandle) {
      window.clearInterval(tickHandle);
      tickHandle = undefined;
    }
    if (visibilityListener) {
      document.removeEventListener("visibilitychange", visibilityListener);
      visibilityListener = null;
    }
  }

  /** Guarded refresh — drops the call if another refresh is already in flight. */
  async function runRefresh(refresh: () => Promise<void>) {
    if (isRefreshInFlight.value) return false;
    isRefreshInFlight.value = true;
    try {
      await refresh();
      return true;
    } finally {
      isRefreshInFlight.value = false;
    }
  }

  onBeforeUnmount(() => stop());

  return {
    currentTimeMs,
    isRefreshInFlight,
    start,
    stop,
    runRefresh,
  };
}
