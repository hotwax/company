import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, ref, type EffectScope } from "vue";

const ionicLifecycle = vi.hoisted(() => ({
  enter: undefined as (() => void) | undefined,
  leave: undefined as (() => void) | undefined
}));

vi.mock("@ionic/vue", () => ({
  onIonViewDidEnter: (callback: () => void) => {
    ionicLifecycle.enter = callback;
  },
  onIonViewDidLeave: (callback: () => void) => {
    ionicLifecycle.leave = callback;
  }
}));

import {
  useShopifyOrderSyncPolling,
  type ShopifyOrderSyncPollingOptions
} from "./useShopifyOrderSyncPolling";

const scopes: EffectScope[] = [];

function createPolling(options: ShopifyOrderSyncPollingOptions) {
  const scope = effectScope();
  scopes.push(scope);

  const polling = scope.run(() => useShopifyOrderSyncPolling(options));
  if (!polling) throw new Error("Polling composable did not initialize");
  return { polling, scope };
}

async function flushPromises() {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  ionicLifecycle.enter = undefined;
  ionicLifecycle.leave = undefined;
});

afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop());
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useShopifyOrderSyncPolling", () => {
  it("refreshes immediately, then uses the active and idle cadences", async () => {
    const batchActive = ref(true);
    const refresh = vi.fn().mockResolvedValue(undefined);
    createPolling({ batchActive, refresh });

    ionicLifecycle.enter?.();
    await flushPromises();
    expect(refresh).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(9_999);
    expect(refresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(refresh).toHaveBeenCalledTimes(2);

    batchActive.value = false;
    await nextTick();
    await vi.advanceTimersByTimeAsync(59_999);
    expect(refresh).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it("queues exactly one follow-up for coalesced manual refreshes during an in-flight request", async () => {
    const refreshResolvers: Array<() => void> = [];
    const refresh = vi.fn(() => new Promise<void>((resolve) => {
      refreshResolvers.push(resolve);
    }));
    const { polling } = createPolling({ batchActive: ref(true), refresh });

    ionicLifecycle.enter?.();
    await flushPromises();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(polling.isRefreshing.value).toBe(true);

    const firstManualRefresh = polling.manualRefresh();
    const secondManualRefresh = polling.manualRefresh();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(refresh).toHaveBeenCalledTimes(1);

    let firstManualRefreshSettled = false;
    void firstManualRefresh.then(() => {
      firstManualRefreshSettled = true;
    });

    refreshResolvers.shift()?.();
    await flushPromises();
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(firstManualRefreshSettled).toBe(false);
    expect(polling.isRefreshing.value).toBe(true);

    refreshResolvers.shift()?.();
    await Promise.all([firstManualRefresh, secondManualRefresh]);
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(firstManualRefreshSettled).toBe(true);
    expect(polling.isRefreshing.value).toBe(false);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it("stops while the document is hidden and refreshes immediately when visible", async () => {
    let documentHidden = false;
    const documentTarget = new EventTarget();
    Object.defineProperty(documentTarget, "hidden", {
      configurable: true,
      get: () => documentHidden
    });
    vi.stubGlobal("document", documentTarget);

    const refresh = vi.fn().mockResolvedValue(undefined);
    createPolling({ batchActive: ref(true), refresh });

    ionicLifecycle.enter?.();
    await flushPromises();
    expect(refresh).toHaveBeenCalledTimes(1);

    documentHidden = true;
    documentTarget.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(120_000);
    expect(refresh).toHaveBeenCalledTimes(1);

    documentHidden = false;
    documentTarget.dispatchEvent(new Event("visibilitychange"));
    await flushPromises();
    expect(refresh).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(9_999);
    expect(refresh).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(refresh).toHaveBeenCalledTimes(3);

    ionicLifecycle.leave?.();
    documentHidden = true;
    documentTarget.dispatchEvent(new Event("visibilitychange"));
    documentHidden = false;
    documentTarget.dispatchEvent(new Event("visibilitychange"));
    await flushPromises();
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it("stops on page leave and scope disposal, then restarts on page enter", async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { scope } = createPolling({ batchActive: ref(true), refresh });

    ionicLifecycle.enter?.();
    await flushPromises();
    expect(refresh).toHaveBeenCalledTimes(1);

    ionicLifecycle.leave?.();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(refresh).toHaveBeenCalledTimes(1);

    ionicLifecycle.enter?.();
    await flushPromises();
    expect(refresh).toHaveBeenCalledTimes(2);

    scope.stop();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("continues polling after a refresh error without owning caller data", async () => {
    const error = new Error("temporary monitoring failure");
    const onError = vi.fn();
    const refresh = vi.fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue(undefined);
    const { polling } = createPolling({ batchActive: ref(true), refresh, onError });

    ionicLifecycle.enter?.();
    await flushPromises();
    expect(onError).toHaveBeenCalledWith(error);
    expect(polling.isRefreshing.value).toBe(false);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("exposes manual refresh and resets the next cadence from that refresh", async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { polling } = createPolling({ batchActive: ref(true), refresh });

    ionicLifecycle.enter?.();
    await flushPromises();
    await vi.advanceTimersByTimeAsync(5_000);

    await polling.manualRefresh();
    expect(refresh).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(9_999);
    expect(refresh).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(refresh).toHaveBeenCalledTimes(3);
  });
});
