import { computed, ref } from "vue";
import { api, commonUtil, logger } from "@common";
import {
  productStoreCache,
  productStoreFacilityCache,
  productStoreShipmentCountCache,
  productStoreShippingMethodCache,
} from "@/utils/cacheEntities";
import { refreshAfterMutation, resyncDomain } from "@/services/appCacheBootstrap";
import { useCachedList, useCachedRecord } from "./useCachedList";

/**
 * Product store master entity — stores and the configuration hanging off them (shipment-method
 * counts, configured shipping methods). Store-shaped application logic belongs here.
 */

/**
 * Shipping methods for ONE product store, read live.
 *
 * Distinct from `useProductStoreShippingMethods`, which reads the login-time cache pinned to a
 * single store id. Onboarding needs the methods of a store that may have been created minutes ago
 * and therefore cannot be in that snapshot, so this issues a real request.
 */
export function useProductStoreShippingMethodsLive() {
  async function fetchShippingMethodsFor(productStoreId: string): Promise<any[]> {
    if (!productStoreId) return [];
    const all: any[] = [];
    let pageIndex = 0;
    try {
      // Paged because a store can carry more methods than one page holds.
      for (;;) {
        const resp: any = await api({
          url: `admin/productStores/${encodeURIComponent(productStoreId)}/shippingMethods`,
          method: "get",
          params: { productStoreId, pageSize: 100, pageIndex },
        });
        const rows: any[] = Array.isArray(resp?.data) ? resp.data : [];
        all.push(...rows);
        if (rows.length < 100) break;
        pageIndex += 1;
      }
    } catch (error) {
      logger.error("Failed to load product store shipping methods", error);
    }
    return all;
  }

  return { fetchShippingMethodsFor };
}

/** How many facilities each product store is associated with, from the cached association table. */
export function useProductStoreFacilityCounts() {
  const { records } = useCachedList<any>(productStoreFacilityCache);
  const counts = computed<Record<string, number>>(() =>
    records.value.reduce((map: Record<string, number>, row: any) => {
      if (row.productStoreId) map[row.productStoreId] = (map[row.productStoreId] ?? 0) + 1;
      return map;
    }, {}));
  return { counts };
}

/** The store list, with its per-store facility and shipment-method counts folded in. */
export function useProductStores() {
  const { records, hydrated } = useCachedList<any>(productStoreCache);
  const { counts } = useProductStoreShipmentCounts();
  const { counts: facilityCounts } = useProductStoreFacilityCounts();

  const productStores = computed(() => records.value.map((store: any) => ({
    ...store,
    // Derived from the association cache. `store.facilityCount` was read straight off the store
    // record, but neither the projection nor `admin/productStores` carries that field, so the list
    // reported "0 facilities" for every store regardless of how many were linked.
    facilityCount: facilityCounts.value[store.productStoreId] ?? 0,
    shipmentMethodCount: counts.value[store.productStoreId] ?? 0,
  })));

  return { productStores, records, hydrated };
}

export const useProductStoreRecord = (productStoreId: string | undefined) =>
  useCachedRecord(productStoreCache, "productStoreId", productStoreId);

/**
 * The product store mapped to a NetSuite subsidiary, derived from the cache.
 *
 * The subsidiary id is the store's `externalId`, so this is server truth. It replaces a persisted
 * local mirror in the product-store Pinia store, which could drift from the server whenever the
 * externalId changed outside this screen.
 */
export function useNetSuiteProductStore() {
  const { records, hydrated } = useCachedList<any>(productStoreCache);

  const netSuiteProductStore = computed(() => {
    const mapped = records.value.find((store: any) => !!store.externalId);
    if (!mapped) return null;
    return { productStoreId: mapped.productStoreId, subsidiaryId: mapped.externalId };
  });

  return { netSuiteProductStore, hydrated };
}

/** productStoreId → shipment-method count. */
export function useProductStoreShipmentCounts() {
  const { records, hydrated } = useCachedList<any>(productStoreShipmentCountCache);
  return {
    counts: computed<Record<string, number>>(() => records.value.reduce(
      (map: Record<string, number>, row: any) => {
        map[row.productStoreId] = Number(row.shipmentMethodCount ?? 0);
        return map;
      }, {})),
    hydrated,
  };
}

/** Shipping methods configured on a store. */
export function useProductStoreShippingMethods(productStoreId?: string) {
  const { records, hydrated } = useCachedList<any>(
    productStoreShippingMethodCache,
    productStoreId ? { scope: { field: "productStoreId", value: productStoreId } } : {},
  );
  return { shippingMethods: records, hydrated };
}

// ---------------------------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------------------------

/**
 * Writes against an EXISTING product store.
 *
 * Which cache each one touches — getting this wrong is silent, since the write succeeds and the
 * screen simply keeps showing the old value:
 *   - the store row → `productStore` (byPk re-read)
 *   - a facility association → `productStoreFacility` (scoped re-list, so removals prune)
 *   - a shipment method → BOTH `productStoreShippingMethod` and `productStoreShipmentCount`,
 *     because the store list renders the count and it changes with every added method
 *   - settings → nothing. Store settings are NOT cached; the screens read them per visit, so a
 *     refresh here would be a no-op that reads as intent.
 */
/**
 * Everything the product-store detail page reads, behind one import.
 *
 * Mirrors the facility detail façade: the cached row paints immediately, then the fuller
 * `admin/productStores/{id}` record and the live settings overlay it. Settings are per-visit live
 * data — they are date-effective and edited in place, so caching them would only add a staleness
 * problem the page does not otherwise have.
 */
export function useProductStoreDetail(productStoreId: string) {
  const { record: cachedRecord, hydrated } = useProductStoreRecord(productStoreId);
  const detail = ref<Record<string, any>>({});
  const settings = ref<Record<string, any>>({});
  const loading = ref(false);

  const storeId = () => encodeURIComponent(productStoreId);

  async function loadDetail() {
    try {
      const resp: any = await api({ url: `admin/productStores/${storeId()}`, method: "get" });
      detail.value = resp?.data && typeof resp.data === "object" ? resp.data : {};
    } catch (error) {
      logger.error("Failed to load product store detail", error);
    }
  }

  /** Keyed by `settingTypeEnumId`, active only — a thru-dated setting is no longer in force. */
  async function loadSettings() {
    try {
      const resp: any = await api({ url: `admin/productStores/${storeId()}/settings`, method: "get" });
      const rows: any[] = Array.isArray(resp?.data) ? resp.data : [];
      const byType: Record<string, any> = {};
      for (const row of rows) {
        if (!row?.thruDate && row?.settingTypeEnumId) byType[row.settingTypeEnumId] = row;
      }
      settings.value = byType;
    } catch (error) {
      logger.error("Failed to load product store settings", error);
    }
  }

  async function load() {
    loading.value = true;
    try {
      await Promise.all([loadDetail(), loadSettings()]);
    } finally {
      loading.value = false;
    }
  }

  /** Cached row first so the page is never blank, then the authoritative detail record on top. */
  const current = computed<Record<string, any>>(() => ({
    ...((cachedRecord.value as any)?.raw ?? cachedRecord.value ?? {}),
    ...detail.value,
  }));

  return { current, settings, hydrated, loading, load, reloadDetail: loadDetail, reloadSettings: loadSettings };
}

export function useProductStoreMutations(productStoreId: string) {
  const storeId = () => encodeURIComponent(productStoreId);
  const refreshStore = () => refreshAfterMutation("productStore", { productStoreId });

  return {
    async updateStore(payload: Record<string, any>) {
      const resp: any = await api({
        url: `admin/productStores/${storeId()}`,
        method: "put",
        data: { ...payload, productStoreId },
      });
      if (!commonUtil.hasError(resp)) await refreshStore();
      return resp;
    },

    /** LIVE data — settings are re-read per visit, so the caller re-runs its own loader. */
    saveSettings: (payload: Record<string, any>) => api({
      url: `admin/productStores/${storeId()}/settings`,
      method: "post",
      data: { ...payload, productStoreId },
    }) as Promise<any>,

    async addFacility(payload: { facilityId: string; fromDate?: number }) {
      const resp: any = await api({
        url: `admin/productStores/${storeId()}/facilities/${encodeURIComponent(payload.facilityId)}/association`,
        method: "post",
        data: { productStoreId, facilityId: payload.facilityId, fromDate: payload.fromDate || Date.now() },
      });
      if (!commonUtil.hasError(resp)) await refreshAfterMutation("productStoreFacility", { productStoreId });
      return resp;
    },

    async addShipmentMethod(payload: {
      /** Optional: omit to let the server sequence the PK, which the Shopify screen relies on. */
      productStoreShipMethId?: string;
      shipmentMethodTypeId: string;
      partyId: string;
      roleTypeId?: string;
      sequenceNumber?: number;
    }) {
      // Two implementations of this write existed — `productStoreStore` posted to
      // `oms/productStores/{id}/shipmentMethods` and `utilStore` to
      // `admin/productStores/{id}/shippingMethods`. Both routes exist, but `oms/productStores` is
      // marked "Deprecated (since maarg 4.4.0): Use admin/productStores" in oms.rest.xml, and the
      // admin route is what the cached read (`productStoreShippingMethod`) already lists from — so
      // the write now matches the read.
      const resp: any = await api({
        url: `admin/productStores/${storeId()}/shippingMethods`,
        method: "post",
        // `roleTypeId` defaults to CARRIER — the server requires it and every caller means carrier.
        data: { ...payload, productStoreId, roleTypeId: payload.roleTypeId || "CARRIER" },
      });
      if (commonUtil.hasError(resp)) return resp;
      // Both snapshots are whole-list (the shipping-method domain is even pinned to one store id),
      // so there is no by-PK route to re-read — re-snapshot each.
      await Promise.all([
        resyncDomain("productStoreShippingMethod"),
        resyncDomain("productStoreShipmentCount"),
      ]);
      return resp;
    },
  };
}

/**
 * Creating a product store, plus the two writes that only ever happen alongside a create.
 *
 * Separate from `useProductStoreMutations` because there is no store id to scope to yet.
 */
export function useProductStoreCreation() {
  return {
    async createStore(payload: Record<string, any>) {
      const resp: any = await api({ url: "admin/productStores", method: "post", data: payload });
      if (commonUtil.hasError(resp)) return resp;
      // The list pages read stores from the cache, so a create must land there or the new store is
      // invisible until the next login sync. Prefer the echoed PK, fall back to the payload.
      const newId = resp?.data?.productStoreId || payload.productStoreId;
      if (newId) await refreshAfterMutation("productStore", { productStoreId: newId });
      return resp;
    },

    /** Operating countries are geo ASSOCIATIONS, cached as their own snapshot. */
    async addDbicCountries(payload: Record<string, any>) {
      const resp: any = await api({ url: "admin/geos/assocs", method: "post", data: payload });
      if (!commonUtil.hasError(resp)) await resyncDomain("geoAssoc");
      return resp;
    },

    /** The owning organization. Not cached — no refresh. */
    updateCompany: (payload: Record<string, any> & { partyId: string }) => api({
      url: `admin/organizations/${encodeURIComponent(payload.partyId)}`,
      method: "post",
      data: payload,
    }) as Promise<any>,
  };
}
