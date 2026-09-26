import { readonly, ref } from "vue";
import { inventoryEventAreaDomains } from "@/config/appSyncConfig";
import { createCacheSync } from "@/services/cacheSync";

/**
 * THE INVENTORY SYNC AREA — one polling lifecycle for every page under a shop's
 * `/shopify-connection-details/:id/inventory-sync`, rather than one per view.
 *
 * The monitor, the two event histories, job runs and activations are separate Ionic pages, and a
 * view-scoped worker stopped and restarted on every move between them, so the history opened on a cache
 * that had not been polled since the last page left. Following the ROUTE instead means the ledgers,
 * their delivery statuses and their products are being polled from the moment the user enters the
 * area until they leave it, and every page in it reads a cache that is already current.
 *
 * Driven by `router.afterEach`, so it needs no view to remember to start or stop it; leaving the area
 * (including to /login on logout) terminates the worker.
 */
const INVENTORY_SYNC_AREA = /^\/shopify-connection-details\/([^/]+)\/inventory-sync(?:\/|$)/;

const sync = createCacheSync();
const activeShopId = ref("");

/** The shop whose inventory area a path belongs to, or "" outside the area. */
export function inventorySyncAreaShopId(path: string): string {
  const match = String(path ?? "").match(INVENTORY_SYNC_AREA);

  return match ? decodeURIComponent(match[1]) : "";
}

export async function followInventorySyncArea(to: { path: string }): Promise<void> {
  const shopId = inventorySyncAreaShopId(to.path);
  if(!shopId) {
    if(activeShopId.value) {
      sync.stop();
      activeShopId.value = "";
    }

    return;
  }
  if(shopId === activeShopId.value) {return;}
  activeShopId.value = shopId;
  // A second shop reuses the running worker: `start` swaps the domain set rather than respawning.
  await sync.start(inventoryEventAreaDomains(shopId));
}

/** What a page in the area reads about the area's polling: health, and a manual refresh. */
export function useInventorySyncArea() {
  return {
    shopId: readonly(activeShopId),
    ready: sync.ready,
    busy: sync.busy,
    manualRefreshing: sync.manualRefreshing,
    error: sync.error,
    /** Each failing domain's latest message; steady between ticks, so safe to render from. */
    failingDomains: sync.failingDomains,
    syncNow: sync.syncNow,
    afterMutation: sync.afterMutation,
  };
}
