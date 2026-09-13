import { effectScope, nextTick, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import { useShopifyUnsyncedProductCount } from "@/utils/shopifyUnsyncedProductCount";

describe("useShopifyUnsyncedProductCount", () => {
  it("refreshes when the cached last-sync timestamp changes", async () => {
    const lastSyncedAt = ref("2026-09-10T17:02:00.000Z");
    const load = vi.fn()
      .mockResolvedValueOnce(101)
      .mockResolvedValueOnce(6);
    const scope = effectScope();
    const state = scope.run(() => useShopifyUnsyncedProductCount({
      remoteId: "REMOTE",
      lastSyncedAt,
      load,
    }))!;

    await state.refresh();
    expect(state.count.value).toBe(101);

    lastSyncedAt.value = "2026-09-10T17:32:00.000Z";
    await nextTick();
    await vi.waitFor(() => expect(state.count.value).toBe(6));
    expect(load).toHaveBeenLastCalledWith("REMOTE", "2026-09-10T17:32:00.000Z");

    scope.stop();
  });

  it("can refresh again when revisiting the summary without a timestamp change", async () => {
    const load = vi.fn()
      .mockResolvedValueOnce(6)
      .mockResolvedValueOnce(4);
    const scope = effectScope();
    const state = scope.run(() => useShopifyUnsyncedProductCount({
      remoteId: "REMOTE",
      lastSyncedAt: "2026-09-10T17:32:00.000Z",
      load,
    }))!;

    await state.refresh();
    await state.refresh();

    expect(state.count.value).toBe(4);
    expect(load).toHaveBeenCalledTimes(2);

    scope.stop();
  });
});
