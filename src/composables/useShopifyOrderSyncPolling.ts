import { onScopeDispose, readonly, ref, unref, watch, type MaybeRef } from "vue";
import { onIonViewDidEnter, onIonViewDidLeave } from "@ionic/vue";
import { getShopifyOrderSyncPollingDelay } from "../utils/shopifyOrderSync";

export type ShopifyOrderSyncActivitySource = MaybeRef<boolean> | (() => boolean);

export interface ShopifyOrderSyncPollingOptions {
  batchActive: ShopifyOrderSyncActivitySource;
  refresh: () => void | Promise<void>;
  onError?: (error: unknown) => void;
}

/**
 * Owns only the Order Sync refresh lifecycle. The caller retains ownership of
 * loaded data and error presentation so a refresh never replaces stale data.
 */
export function useShopifyOrderSyncPolling(options: ShopifyOrderSyncPollingOptions) {
  const isPageActive = ref(false);
  const isRefreshing = ref(false);
  const isDocumentHidden = ref(typeof document !== "undefined" && document.hidden);

  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: Promise<void> | undefined;
  let lifecycleVersion = 0;
  let refreshAfterInFlight = false;
  let queuedManualRefresh: {
    promise: Promise<void>;
    resolve: () => void;
  } | undefined;

  const readBatchActive = () => typeof options.batchActive === "function"
    ? options.batchActive()
    : unref(options.batchActive);

  function clearTimer() {
    if (timer === undefined) return;
    clearTimeout(timer);
    timer = undefined;
  }

  function reportError(error: unknown) {
    try {
      options.onError?.(error);
    } catch {
      // A reporting callback must not stop the polling lifecycle.
    }
  }

  function canRefresh() {
    return isPageActive.value && !isDocumentHidden.value;
  }

  function getQueuedManualRefresh() {
    if (queuedManualRefresh) return queuedManualRefresh;

    let resolve!: () => void;
    const promise = new Promise<void>((promiseResolve) => {
      resolve = () => promiseResolve();
    });
    queuedManualRefresh = { promise, resolve };
    return queuedManualRefresh;
  }

  function cancelQueuedManualRefresh() {
    const queuedRefresh = queuedManualRefresh;
    queuedManualRefresh = undefined;
    queuedRefresh?.resolve();
  }

  function scheduleNextRefresh() {
    clearTimer();

    const delay = getShopifyOrderSyncPollingDelay({
      pageActive: canRefresh(),
      batchActive: readBatchActive()
    });
    if (delay === null || inFlight) return;

    const scheduledVersion = lifecycleVersion;
    timer = setTimeout(() => {
      timer = undefined;
      if (!canRefresh() || scheduledVersion !== lifecycleVersion) return;
      void runRefresh(scheduledVersion);
    }, delay);
  }

  function runQueuedRefresh(refreshVersion = lifecycleVersion): Promise<void> {
    refreshAfterInFlight = false;

    const queuedRefresh = queuedManualRefresh;
    queuedManualRefresh = undefined;
    const request = runRefresh(refreshVersion);

    if (queuedRefresh) {
      void request.then(queuedRefresh.resolve);
      return queuedRefresh.promise;
    }

    return request;
  }

  function runRefresh(refreshVersion = lifecycleVersion): Promise<void> {
    if (!canRefresh()) return Promise.resolve();
    if (inFlight) return inFlight;

    clearTimer();
    isRefreshing.value = true;

    const request = Promise.resolve()
      .then(() => options.refresh())
      .catch(reportError)
      .then(() => undefined)
      .finally(() => {
        if (inFlight === request) inFlight = undefined;
        isRefreshing.value = false;

        if (!isPageActive.value) {
          refreshAfterInFlight = false;
          cancelQueuedManualRefresh();
          return;
        }

        if (isDocumentHidden.value) {
          return;
        }

        if (refreshAfterInFlight || refreshVersion !== lifecycleVersion) {
          void runQueuedRefresh(lifecycleVersion);
          return;
        }

        scheduleNextRefresh();
      });

    inFlight = request;
    return request;
  }

  function startPolling() {
    if (isPageActive.value) return;

    isPageActive.value = true;
    lifecycleVersion += 1;
    clearTimer();

    if (inFlight) {
      refreshAfterInFlight = true;
      return;
    }

    if (canRefresh()) void runQueuedRefresh(lifecycleVersion);
  }

  function stopPolling() {
    isPageActive.value = false;
    lifecycleVersion += 1;
    refreshAfterInFlight = false;
    clearTimer();
    cancelQueuedManualRefresh();
  }

  function manualRefresh(): Promise<void> {
    if (!isPageActive.value) return Promise.resolve();

    if (inFlight || isDocumentHidden.value) {
      refreshAfterInFlight = true;
      return getQueuedManualRefresh().promise;
    }

    return runRefresh(lifecycleVersion);
  }

  function handleVisibilityChange() {
    isDocumentHidden.value = document.hidden;
    lifecycleVersion += 1;
    clearTimer();

    if (isDocumentHidden.value || !isPageActive.value) return;

    if (inFlight) {
      refreshAfterInFlight = true;
      return;
    }

    void runQueuedRefresh(lifecycleVersion);
  }

  const stopActivityWatch = watch(readBatchActive, () => {
    if (!isPageActive.value || inFlight) return;
    scheduleNextRefresh();
  });

  onIonViewDidEnter(startPolling);
  onIonViewDidLeave(stopPolling);
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", handleVisibilityChange);
  }
  onScopeDispose(() => {
    stopActivityWatch();
    stopPolling();
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    }
  });

  return {
    isPageActive: readonly(isPageActive),
    isRefreshing: readonly(isRefreshing),
    manualRefresh,
    startPolling,
    stopPolling
  };
}
