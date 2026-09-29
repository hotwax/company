import { computed, ref } from "vue";
import { serviceState } from "@common/db";
import { INVENTORY_EVENT_DOMAINS, inventoryEventAreaDomains } from "@/config/appSyncConfig";
import {
  activateSyncDomains,
  createSyncDomainOwner,
  deactivateSyncDomains,
  refreshAfterMutation,
  syncNow as syncActiveDomains,
} from "@/services/appDbSync";
import type { InventoryEventKind } from "@/utils/inventoryEvents";

/**
 * Route-scoped class-A activation for every page under a shop's
 * `/shopify-connection-details/:id/inventory-sync`, driven by `router.afterEach`, so every page there
 * shares a warm cache. Leaving the area (including logout) retires the activation.
 *
 * The app has ONE worker holding ONE active set, so the area is an owner of it like any view. It
 * re-activates on every move inside the area: `afterEach` runs before the outgoing view's `didLeave`,
 * so the area takes ownership back and a departing page's owner-guarded teardown no longer matches.
 * A page in the area that needs more domains activates `[...its own, ...inventoryEventAreaDomains()]`.
 */
const INVENTORY_SYNC_AREA = /^\/shopify-connection-details\/([^/]+)\/inventory-sync(?:\/|$)/;

const AREA_OWNER = createSyncDomainOwner("inventorySyncArea");
const AREA_DOMAIN_NAMES: readonly string[] = Object.values(INVENTORY_EVENT_DOMAINS);

const activeShopId = ref("");
const pendingManualRefreshes = ref(0);

/** The shop whose inventory area a path belongs to, or "" outside the area. */
export function inventorySyncAreaShopId(path: string): string {
  const match = String(path ?? "").match(INVENTORY_SYNC_AREA);

  return match ? decodeURIComponent(match[1]) : "";
}

export async function followInventorySyncArea(to: { path: string }): Promise<void> {
  const shopId = inventorySyncAreaShopId(to.path);
  if(!shopId) {
    if(activeShopId.value) {
      activeShopId.value = "";
      await deactivateSyncDomains(AREA_OWNER);
    }

    return;
  }
  activeShopId.value = shopId;
  await activateSyncDomains(inventoryEventAreaDomains(shopId), AREA_OWNER);
}

/** Each area domain's latest failure, gone once it next succeeds. */
const failingDomains = computed<Record<string, string>>(() => Object.fromEntries(
  Object.entries(serviceState.errors).filter(([domain]) => domain === "__start" || AREA_DOMAIN_NAMES.includes(domain)),
));

const manualRefreshing = computed(() => pendingManualRefreshes.value > 0);

/** Manual refresh — routed to the worker, never fetched on the main thread. */
async function syncNow(): Promise<void> {
  pendingManualRefreshes.value += 1;
  try {
    await syncActiveDomains();
  } finally {
    pendingManualRefreshes.value = Math.max(0, pendingManualRefreshes.value - 1);
  }
}

/** After a successful mutation, re-read the affected rows through the domain's `refetchOne`. */
async function afterMutation(domain: string, pk: Record<string, unknown>): Promise<void> {
  await refreshAfterMutation(domain, pk);
}

/** What a page in the area reads about the area's polling. */
export function useInventorySyncArea() {
  /** Load a ledger's events back to `fromMs` into the table, for a date filter older than what is held. */
  const loadEventsFrom = (kind: InventoryEventKind, fromMs: number) =>
    afterMutation(INVENTORY_EVENT_DOMAINS[kind === "channel" ? "channelRows" : "locationRows"], { fromMs });

  /** Where the ledger starts on the server; a history page asks once when it loads. */
  const loadLedgerBounds = (kind: InventoryEventKind, shopId: string) =>
    afterMutation(INVENTORY_EVENT_DOMAINS.bounds, { kind, shopId });

  return { failingDomains, manualRefreshing, syncNow, afterMutation, loadEventsFrom, loadLedgerBounds };
}
