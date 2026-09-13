import { ref, toValue, watch, type MaybeRefOrGetter } from "vue";

export interface ShopifyUnsyncedProductCountOptions {
  remoteId: MaybeRefOrGetter<string | null | undefined>;
  lastSyncedAt: MaybeRefOrGetter<string | number | null | undefined>;
  load: (remoteId: string, lastSyncedAt?: string | number) => Promise<number>;
  onError?: (error: unknown) => void;
}

/**
 * Keep a Shopify unsynced-product count aligned with the sync cursor.
 *
 * The count is remote truth, so it must be refreshed both when a new completed sync changes the
 * cursor and when a retained summary view becomes visible again. A sequence guard prevents an older
 * Shopify response from replacing a newer count after either event.
 */
export function useShopifyUnsyncedProductCount(options: ShopifyUnsyncedProductCountOptions) {
  const count = ref(0);
  const isLoading = ref(false);
  let requestSequence = 0;

  const refresh = async (): Promise<number> => {
    const sequence = ++requestSequence;
    const remoteId = String(toValue(options.remoteId) ?? "").trim();
    const lastSyncedAt = toValue(options.lastSyncedAt) || undefined;

    if (!remoteId) {
      if (sequence === requestSequence) {
        count.value = 0;
        isLoading.value = false;
      }
      return 0;
    }

    isLoading.value = true;
    try {
      const nextCount = await options.load(remoteId, lastSyncedAt);
      const numericCount = Number(nextCount);
      if (sequence === requestSequence) {
        count.value = Number.isFinite(numericCount) ? numericCount : 0;
      }
      return Number.isFinite(numericCount) ? numericCount : 0;
    } catch (error) {
      if (sequence === requestSequence) {
        count.value = 0;
        options.onError?.(error);
      }
      throw error;
    } finally {
      if (sequence === requestSequence) {
        isLoading.value = false;
      }
    }
  };

  watch(
    () => [
      String(toValue(options.remoteId) ?? "").trim(),
      toValue(options.lastSyncedAt) ?? "",
    ],
    () => {
      void refresh().catch(() => undefined);
    },
  );

  return { count, isLoading, refresh };
}
