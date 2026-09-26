import { ref } from "vue";
import { inventoryEventAreaDomains } from "@/config/appSyncConfig";
import { createCacheSync } from "@/services/cacheSync";

/**
 * One polling lifecycle for every page under a shop's `/shopify-connection-details/:id/inventory-sync`,
 * driven by `router.afterEach`: a view-scoped worker restarted on every move between those pages, so each
 * opened on a cold cache. Leaving the area (including logout) terminates the worker.
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

/** What a page in the area reads about the area's polling. */
export function useInventorySyncArea() {
  const { failingDomains, manualRefreshing, syncNow, afterMutation } = sync;

  return { failingDomains, manualRefreshing, syncNow, afterMutation };
}
