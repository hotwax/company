/**
 * SHOPIFY — the whole integration in one composable module.
 *
 * One file per master entity is the rule in this app, and Shopify is one entity: the shops, what
 * hangs off them (locations, type mappings, carrier shipments), and the two sync functions that run
 * against them (products and orders). Splitting those into separate composables made a screen import
 * three modules to describe one connection, so they are merged here.
 *
 * Sections, in order:
 *   1. Shops, locations, type mappings, carrier shipments   — cached reads + shop-scoped writes
 *   2. Sync features                                        — the descriptor that makes 3 generic
 *   3. Sync core                                            — the reads product sync and order sync share
 *   4. Product sync                                         — the run join (message ⋈ bulk op ⋈ MDM log)
 *   5. Order sync                                           — entities, derivations, view model, mutations
 *   6. Order sync schedule                                  — cron validation/preview (pure)
 *   7. Order sync session                                   — worker activation, not main-thread polling
 *
 * Everything reads from IndexedDB through `useCachedList`; the sync worker owns all cadence. The only
 * live reads left are the ones that cannot be cached — Shopify GraphQL, webhook subscriptions, the
 * order-sync history projection, and landmark system properties.
 */


import {
  computed, onBeforeUnmount, reactive, ref, toRefs, toValue, watch,
  type ComputedRef, type MaybeRefOrGetter,
} from "vue";
import { onIonViewDidEnter, onIonViewDidLeave } from "@ionic/vue";
import { api, commonUtil, logger, translate } from "@common";
import { refreshAfterMutation } from "@/services/appCacheBootstrap";
import { onSessionCleared } from "./sessionScope";
import { parseDateTimeValue } from "@/utils";
import {
  dataManagerLogCache,
  productStoreCache,
  serviceJobCache,
  shopifyBulkOperationCache,
  shopifyCarrierShipmentCache,
  shopifyLocationCache,
  shopifyShopCache,
  shopifyTypeMappingCache,
  systemMessageCache,
  syncRunCache,
  systemMessageErrorCache,
  systemMessageRemoteCache,
} from "@/utils/cacheEntities";
import {
  getReferencedBulkOperationSystemMessageIds,
  getSystemMessageBulkOperationId,
} from "@/utils/shopifyBulkOperation";
import { resolveShopRemoteIds, shopRemoteCandidates, sortRemotesByAccess } from "@/utils/systemMessage";
import type { ActiveDomain } from "@/workers/syncRegistry";
import { useCacheSync } from "./useCacheSync";
import { useCachedList, useCachedRecord } from "./useCachedList";
import { useStatuses } from "./useSeed";
import { useServiceJob } from "./useServiceJobs";
import { useDataManager } from "./useDataManager";
import { useSystemMessage } from "./useSystemMessage";

// =============================================================================================
// 1. Shops, locations, type mappings, carrier shipments
// =============================================================================================

/**
 * Shopify master entity — connections (shops) and everything scoped to a shop: inventory
 * locations, type mappings, and carrier/shipment mappings.
 *
 * Each of these tables holds EVERY shop's rows in one unscoped snapshot, so a page reads its
 * slice with a `shopId` scope instead of issuing a per-shop fetch.
 */

// ---------------------------------------------------------------------------------------------
// Shops (connections)
// ---------------------------------------------------------------------------------------------

export function useShopifyShops() {
  const { records, hydrated } = useCachedList<any>(shopifyShopCache);
  return { shops: records, records, hydrated };
}

/** One shop by shopId. Replaces the old `shopifyStore.getShopById` getter. */
export const useShopifyShop = (shopId: string | undefined) =>
  useCachedRecord(shopifyShopCache, "shopId", shopId);

export function useShopsForProductStore(productStoreId: string | undefined) {
  const { records, hydrated } = useCachedList<any>(
    shopifyShopCache,
    productStoreId ? { scope: { field: "productStoreId", value: productStoreId } } : {},
  );
  return { shops: records, hydrated };
}

// ---------------------------------------------------------------------------------------------
// Inventory locations
// ---------------------------------------------------------------------------------------------

/**
 * Stable ordering for a shop-scoped table read WITHOUT a shop scope.
 *
 * ⚠️ Several pages read these tables across every shop on purpose — the NetSuite mapping screens have
 * no shop context and show Shopify values as reference. That is fine. What is NOT fine is that they then
 * `find(...)` or `reduce(...)` a single winner out of rows from several shops, so the value displayed
 * depends on IndexedDB iteration order: nondeterministic between reloads, not merely arbitrary.
 *
 * Sorting by `shopId` makes the winner STABLE. It does not make it right — where more than one shop maps
 * the same thing, the honest display is the set, and callers that care should use the `*ByKey` grouping
 * a composable exposes alongside its collapsed map. This removes the flakiness; the product question of
 * what to show is left visible at the call site.
 */
function stableByShop<T extends Record<string, any>>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => String(a?.shopId ?? "").localeCompare(String(b?.shopId ?? "")));
}

export function useShopifyLocations(shopId: string | undefined) {
  const { records: unordered, hydrated } = useCachedList<any>(
    shopifyLocationCache,
    shopId ? { scope: { field: "shopId", value: shopId } } : {},
  );

  // Stable order so an unscoped read's `find`/`reduce` winner does not vary — see `stableByShop`.
  const records = computed(() => stableByShop(unordered.value));

  /** shopifyLocationId → facilityId, the shape mapping editors work in. */
  const facilityByLocation = computed<Record<string, string>>(() =>
    records.value.reduce((map: Record<string, string>, row: any) => {
      if (row.shopifyLocationId) map[row.shopifyLocationId] = row.facilityId ?? "";
      return map;
    }, {}));

  /**
   * facilityId → shopifyLocationId — the INVERSE, for screens that list facilities and show each
   * one's mapped Shopify id. Provided as a map because callers otherwise index the records array
   * by facilityId, which silently yields undefined and renders every row as unmapped.
   */
  const locationByFacility = computed<Record<string, string>>(() =>
    records.value.reduce((map: Record<string, string>, row: any) => {
      if (row.facilityId) map[row.facilityId] = row.shopifyLocationId ?? "";
      return map;
    }, {}));

  return { locations: records, facilityByLocation, locationByFacility, records, hydrated };
}

// ---------------------------------------------------------------------------------------------
// Type mappings — one table backs every mapping page, sliced by shop + mappedTypeId
// ---------------------------------------------------------------------------------------------

export function useShopifyTypeMappings(shopId: string | undefined, mappedTypeId: string) {
  const { records: unordered, hydrated } = useCachedList<any>(
    shopifyTypeMappingCache,
    shopId ? { scope: { field: "shopId", value: shopId } } : {},
  );

  // Stable order so an unscoped read's `find` returns the same row every reload — see `stableByShop`.
  const records = computed(() => stableByShop(unordered.value));

  const mappings = computed(() => records.value.filter((row: any) => row.mappedTypeId === mappedTypeId));

  /** OMS value → Shopify key, the direction mapping editors read. */
  const keyByValue = computed<Record<string, string>>(() =>
    mappings.value.reduce((map: Record<string, string>, row: any) => {
      if (row.mappedValue) map[row.mappedValue] = row.mappedKey ?? "";
      return map;
    }, {}));

  return { mappings, keyByValue, hydrated };
}

export function useShopifyCarrierShipments(shopId: string | undefined) {
  const { records: unordered, hydrated } = useCachedList<any>(
    shopifyCarrierShipmentCache,
    shopId ? { scope: { field: "shopId", value: shopId } } : {},
  );

  // Stable order so the collapsed map below picks the same row every reload — see `stableByShop`.
  const records = computed(() => stableByShop(unordered.value));

  /**
   * `${carrierPartyId}_${shipmentMethodTypeId}` → row.
   *
   * The shipment-method screens index this map directly (matching a shipping method's `partyId`
   * to a carrier), so the keyed shape is part of their contract — an array would break the
   * lookups silently.
   */
  const byCarrierAndMethod = computed<Record<string, any>>(() =>
    records.value.reduce((map: Record<string, any>, row: any) => {
      if (row.carrierPartyId && row.shipmentMethodTypeId) {
        map[`${row.carrierPartyId}_${row.shipmentMethodTypeId}`] = row;
      }
      return map;
    }, {}));

  /**
   * The SAME key → EVERY matching row, not one winner.
   *
   * ⚠️ `byCarrierAndMethod` has no shop in its key, so on an unscoped read two shops mapping the same
   * carrier + method collapse into one entry and one of them is silently dropped. That is invisible in
   * the UI — a map collapse renders as a normal single value. Callers reading across shops should use
   * this and decide what to show; `length > 1` is the signal that a single value would be a lie.
   */
  const allByCarrierAndMethod = computed<Record<string, any[]>>(() =>
    records.value.reduce((map: Record<string, any[]>, row: any) => {
      if (row.carrierPartyId && row.shipmentMethodTypeId) {
        (map[`${row.carrierPartyId}_${row.shipmentMethodTypeId}`] ||= []).push(row);
      }
      return map;
    }, {}));

  return { carrierShipments: records, byCarrierAndMethod, allByCarrierAndMethod, hydrated };
}


/**
 * Shopify mappings for ONE facility — the local equivalent of `oms/ShopFacilityMappings`.
 *
 * That endpoint returns `ShopifyShopLocationView`, which is simply `ShopifyShop ⋈
 * ShopifyShopLocation` with every field of both aliased. Both sides are already cached, so this
 * is a client-side join instead of a request: no new domain, no extra sync.
 */
export function useShopifyFacilityMappings(facilityId: string | undefined) {
  const { records: locations, hydrated } = useCachedList<any>(
    shopifyLocationCache,
    facilityId ? { scope: { field: "facilityId", value: facilityId } } : {},
  );
  const { records: shops } = useCachedList<any>(shopifyShopCache);

  const mappings = computed(() => {
    const shopById = shops.value.reduce((map: Record<string, any>, shop: any) => {
      map[shop.shopId] = shop;
      return map;
    }, {});
    return locations.value.map((location: any) => ({
      ...(shopById[location.shopId] ?? {}),
      ...location,
    }));
  });

  return { mappings, hydrated };
}

// ---------------------------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------------------------

/**
 * Locations as SHOPIFY reports them — remote truth, never cached.
 *
 * Used by the location audit, which compares what Shopify has against the cached OMS mappings to
 * find locations that exist on one side only. The OMS half comes from `useShopifyLocations`, so this
 * is the only request the audit needs.
 */
export async function fetchLocationsFromShopify(shopId: string): Promise<any[]> {
  const resp: any = await api({
    url: `shopify/shops/${encodeURIComponent(shopId)}/shopify-locations`,
    method: "get",
  });
  return (resp?.data?.locations?.edges ?? []).map((edge: any) => edge?.node).filter(Boolean);
}

export interface WriteOptions {
  /**
   * Refresh the affected cache after this write. Default true.
   *
   * Pass `false` in a "save all" loop and call the matching `refresh*` method once afterwards:
   * refreshing per row turns one user action into N scoped re-lists.
   */
  refresh?: boolean;
}

/**
 * Every write scoped to one Shopify shop.
 *
 * The cache consequence lives here rather than at the call site, which is the whole point: these
 * five writes had 30 call sites across 8 screens, 13 of which hand-wrote their own
 * `refreshAfterMutation(...)` with the scope spelled out inline. Spelling a scope out 13 times is
 * 13 chances to pass the wrong key — and that had already happened for shops (see the
 * `shopifyShop` domain note in referenceDomains.ts).
 *
 * Type mappings are the subtle one: the table holds EVERY mapping type for the shop, so a refresh
 * must carry `mappedTypeId` as well or a payment-method save re-lists under the wrong slice.
 */
/**
 * The Shopify shop id for a product store, keyed by `shopifyShopId` (NOT `shopId`).
 *
 * The distinction matters: `shopId` is the local record id (e.g. "10000") while `shopifyShopId` is
 * Shopify's own id (e.g. "6973849727"), and it is the latter that doubles as the facility group id
 * in `primaryFacilityGroupId`.
 */
export function useShopifyShopIdForProductStore() {
  const { shops } = useShopifyShops();
  const shopifyShopIdFor = (productStoreId: string) =>
    shops.value.find((shop: any) => shop.productStoreId === productStoreId)?.shopifyShopId ?? "";
  return { shopifyShopIdFor };
}

export function useShopifyShopQueries(shopId: string) {
  const fetchTypeMappingsForShop = async (mappedTypeId: string) => {
    let mappings: any[] = [];
    let pageIndex = 0;
    let resp: any;
    do {
      resp = await api({
        url: "oms/shopifyShops/typeMappings",
        method: "get",
        params: { shopId, mappedTypeId, pageSize: 100, pageIndex }
      });
      if (!commonUtil.hasError(resp) && resp.data) {
        mappings = [...mappings, ...resp.data];
      } else {
        break;
      }
      pageIndex++;
    } while (resp.data && resp.data.length >= 100);
    return mappings;
  };

  const fetchCarrierShipmentsForShop = async () => {
    let shipments: any[] = [];
    let pageIndex = 0;
    let resp: any;
    do {
      resp = await api({
        url: "oms/shopifyShops/carrierShipments",
        method: "get",
        params: { shopId, pageSize: 100, pageIndex }
      });
      if (!commonUtil.hasError(resp) && resp.data) {
        shipments = [...shipments, ...resp.data];
      } else {
        break;
      }
      pageIndex++;
    } while (resp.data && resp.data.length >= 100);
    return shipments;
  };

  return {
    fetchTypeMappingsForShop,
    fetchCarrierShipmentsForShop
  };
}

export function useShopifyShopMutations(shopId: string) {
  const shop = () => encodeURIComponent(shopId);
  const wants = (options?: WriteOptions) => options?.refresh !== false;

  /**
   * Re-read the affected slice. Exposed so batch callers can refresh exactly once.
   *
   * Type mappings refresh SHOP-WIDE, deliberately — takes no `mappedTypeId`. The cache prunes by a
   * single scope field (`shopId`), so a per-type refresh would delete the shop's other mapping
   * types; see the domain note in referenceDomains.ts.
   */
  const refreshTypeMappings = () => refreshAfterMutation("shopifyTypeMapping", { shopId });
  const refreshLocations = () => refreshAfterMutation("shopifyLocation", { shopId });
  const refreshCarrierShipments = () => refreshAfterMutation("shopifyCarrierShipment", { shopId });

  return {
    refreshTypeMappings,
    refreshLocations,
    refreshCarrierShipments,

    async updateShop(payload: Record<string, any>, options?: WriteOptions) {
      const resp: any = await api({
        url: `oms/shopifyShops/shops/${shop()}`,
        method: "put",
        data: { ...payload, shopId },
      });
      if (!commonUtil.hasError(resp) && wants(options)) await refreshAfterMutation("shopifyShop", { shopId });
      return resp;
    },

    /**
     * Upsert a type mapping. The endpoint is `store`, and the entity PK is
     * (shopId, mappedKey) — so re-saving the same key overwrites its value, while a NEW key inserts
     * a new row and leaves the old key behind (see `removeTypeMapping`).
     */
    async saveTypeMapping(
      payload: { mappedTypeId: string; mappedKey: string; mappedValue?: string },
      options?: WriteOptions,
    ) {
      const resp: any = await api({
        url: "oms/shopifyShops/typeMappings",
        method: "post",
        data: { ...payload, shopId },
      });
      if (!commonUtil.hasError(resp) && wants(options)) await refreshTypeMappings();
      return resp;
    },

    /**
     * Retire a mapping key by CLEARING its value — the alternate to a delete route that does not
     * exist.
     *
     * `oms.rest.xml` defines `shopifyShops/typeMappings` with `get` and `post` only; there are zero
     * delete methods anywhere under `oms/shopifyShops`, and `DELETE` answers 405. Path-scoped and
     * `admin/`-prefixed variants 404 (probed live 2026-07-27). This used to issue that DELETE, which
     * meant every RENAME of an existing mapping died on the 405 before its replacement `POST` ran —
     * the edit wrote nothing at all, and the sales-channel screen showed no error while doing it.
     *
     * The endpoint is `store` and the PK is (shopId, mappedKey), so re-posting the old key with an
     * empty `mappedValue` unmaps it in place: the row survives as a key with no value, which is
     * exactly what the reader treats as unmapped (`keyByValue` skips value-less rows). Verified
     * live: the read-back row keeps `mappedKey` and no longer carries `mappedValue`.
     */
    async retireTypeMapping(payload: { mappedTypeId: string; mappedKey: string }, options?: WriteOptions) {
      const resp: any = await api({
        url: "oms/shopifyShops/typeMappings",
        method: "post",
        data: { ...payload, shopId, mappedValue: "" },
      });
      if (!commonUtil.hasError(resp) && wants(options)) await refreshTypeMappings();
      return resp;
    },

    async saveCarrierShipment(payload: Record<string, any>, options?: WriteOptions) {
      const resp: any = await api({
        url: "oms/shopifyShops/carrierShipments",
        method: "post",
        data: { ...payload, shopId },
      });
      if (!commonUtil.hasError(resp) && wants(options)) await refreshCarrierShipments();
      return resp;
    },

    /** Upsert a location↔facility mapping (`ShopifyShopLocation` `store`). */
    async saveLocation(payload: Record<string, any>, options?: WriteOptions) {
      const resp: any = await api({
        url: "oms/shopifyShops/locations",
        method: "post",
        data: { ...payload, shopId },
      });
      if (!commonUtil.hasError(resp) && wants(options)) await refreshLocations();
      return resp;
    },
  };
}

// =============================================================================================
// 2. Sync features — the generic core both product sync and order sync run on
// =============================================================================================

/**
 * What makes one Shopify sync feature different from another.
 *
 * Everything else about a sync — which shop, which remote, which job, which messages, which import
 * logs, how progress is derived, how the worker is activated — is identical between product sync and
 * order sync. Only these values differ, so they are declared once per feature and the machinery below
 * is shared.
 *
 * Deliberately NOT here: whether a run has a Shopify bulk operation. That is discoverable from the
 * message itself (`remoteMessageId` holds the operation gid), so it needs no configuration.
 */
export interface ShopifySyncFeature {
  id: "product" | "order";
  /** Message types the feature's screens read; also what the worker is told to sync. */
  messageTypeIds: string[];
  /** DataManagerLog `configId`s the feature's imports land under. */
  importConfigIds: string[];
  /** The template job clones are made from. */
  templateJobName: string;
  /**
   * How a job is matched to a shop.
   *
   * ALWAYS by job PARAMETER, never by job name. `queue_ShopifyOrderSync_10010` carries
   * `systemMessageRemoteId=HCDemoShopifyConfig`, which belongs to shop 10000 — matching on the name
   * picks the wrong job silently. `matchOn` says which id the parameter is compared against.
   */
  jobMatch: {
    parameterKeys: string[];
    matchOn: "remoteId" | "shopId";
    /** Extra parameter equality the job must satisfy, e.g. order sync's `runAsBatch=true`. */
    requiredParameters?: Array<{ keys: string[]; equals?: string; truthy?: boolean }>;
  };
  /** Additional jobs a screen watches (product sync's bulk-op send/poll pair). */
  auxJobNames?: string[];
  adminPermission: string;
  activePollMs: number;
  idlePollMs: number;
}

/** The message that REQUESTS a product pull; `BulkOperationsFinish` is the completion signal. */
export const PRODUCT_SYNC_REQUEST_MESSAGE_TYPE = "BulkQueryShopifyProductUpdates";

/**
 * How deep the product-sync run window goes — ONE number for the fetch and the read.
 *
 * ⚠️ These must not drift. The worker window and the composable's read limit are the same window seen
 * from two ends: if the read is shallower than the fetch, rows the cache holds are invisible to the
 * join. Measured live with a 200-row window and a 100-row read: 15 messages had matching imports and
 * every one of them sat in rows 101–200, so the summary still reported "no completed sync" from a
 * cache that held the answer.
 *
 * Depth matters because the newest runs frequently import nothing — the pick is "newest run that
 * actually imported", which can be a long way back.
 */
export const PRODUCT_SYNC_RUN_WINDOW = 200;

export const PRODUCT_SYNC_FEATURE: ShopifySyncFeature = {
  id: "product",
  messageTypeIds: ["BulkQueryShopifyProductUpdates", "BulkOperationsFinish"],
  importConfigIds: ["SYNC_SHOPIFY_PRODUCT"],
  templateJobName: "sync_ShopifyProductUpdates",
  jobMatch: { parameterKeys: ["shopId", "shopifyShopId"], matchOn: "shopId" },
  auxJobNames: [
    "send_ProducedBulkOperationSystemMessage_ShopifyBulkQuery",
    "poll_ShopifyBulkOperationResult",
  ],
  adminPermission: Actions.APP_SHOPIFY_SYNC_ADMIN,
  activePollMs: 10_000,
  idlePollMs: 60_000,
};


/** Is this job a clone of the feature's template (and not the template itself)? */
function isFeatureJobClone(job: ServiceJobLike, feature: ShopifySyncFeature): boolean {
  const jobName = valueText(job?.jobName);
  if (!jobName || jobName === feature.templateJobName) return false;

  const declaredTemplate = firstText(job, [
    "parentJobName", "templateJobName", "sourceJobName", "clonedFromJobName",
  ]);
  if (declaredTemplate) return declaredTemplate === feature.templateJobName;

  // Clones predating persisted provenance are named `<template>_<something>`.
  return jobName.startsWith(`${feature.templateJobName}_`);
}

/**
 * Does this job belong to the given shop, for this feature?
 *
 * Generic replacement for the per-feature matchers. Parameter-based by construction — see the
 * `jobMatch` note on why names are never trusted.
 */
export function isSuitableSyncJob(
  job: ServiceJobLike | null | undefined,
  feature: ShopifySyncFeature,
  expected: { remoteId?: string; shopId?: string },
): job is ServiceJobLike {
  if (!job || !isFeatureJobClone(job, feature)) return false;

  const wanted = feature.jobMatch.matchOn === "remoteId" ? expected.remoteId : expected.shopId;
  if (!wanted) return false;
  if (parameterText(job, feature.jobMatch.parameterKeys) !== String(wanted)) return false;

  for (const rule of feature.jobMatch.requiredParameters ?? []) {
    const actual = parameterText(job, rule.keys);
    if (rule.equals !== undefined && normalizeToken(actual) !== normalizeToken(rule.equals)) return false;
    if (rule.truthy && !isTruthy(actual)) return false;
  }
  return true;
}

/** `null`, not `undefined`, when nothing matches — "this shop has no job" is a state screens render. */
export function findSuitableSyncJob(
  jobs: readonly ServiceJobLike[],
  feature: ShopifySyncFeature,
  expected: { remoteId?: string; shopId?: string },
): ServiceJobLike | null {
  return jobs.find((job) => isSuitableSyncJob(job, feature, expected)) ?? null;
}

// =============================================================================================
// 3. Sync core — the reads both sync features share
// =============================================================================================

/**
 * PRODUCT SYNC AND ORDER SYNC ARE THE SAME SCREEN WITH DIFFERENT IDS.
 *
 * Both resolve a shop to its remote, find that shop's clone of a template job, list the SystemMessages
 * of their type, group the DataManagerLogs their import wrote, and roll the three up into a status.
 * Everything that actually differs — message types, import config ids, template job name, how a job is
 * matched to a shop, poll cadence — is data, and lives on `ShopifySyncFeature`.
 *
 * So the reads below take a descriptor and are shared verbatim between the two features. A
 * feature-level composable (`useShopifyOrderSync`, `useShopifyProductSync`) is then an assembly of
 * these plus whatever is genuinely unique to it, which for order sync is three live endpoints and for
 * product sync is the bulk-operation join.
 *
 * Every function here is a projection over `liveQuery`: no fetch, no loading state, no refresh entry
 * point. Values re-derive themselves when the sync worker commits, which is what lets these screens
 * show progress without a main-thread poll.
 */

/** A shop id as a plain string, a ref, or a getter — screens hold it in all three shapes. */
export type ShopIdSource = MaybeRefOrGetter<string | undefined>;

export interface ShopifySyncContext {
  /** The selected shop, or null before one is chosen / before the cache hydrates. */
  shop: ComputedRef<any>;
  productStore: ComputedRef<any>;
  /** The shop's SystemMessageRemote — best access scope first. */
  remote: ComputedRef<any>;
  /** That remote's `systemMessageRemoteId`, or "". The scope key for messages and job matching. */
  remoteId: ComputedRef<string>;
  /**
   * EVERY remote this shop owns, best access scope first.
   *
   * A shop can have more than one remote (different access scopes against the same Shopify store),
   * and a history view wants messages from all of them, not just the best one. `remoteId` is simply
   * the head of this list.
   */
  remoteIds: ComputedRef<string[]>;
  shopId: ComputedRef<string>;
  /** True once shops, remotes AND product stores have all emitted — see the note in the body. */
  hydrated: ComputedRef<boolean>;
}

/**
 * Resolve a shop id to the records every sync screen starts from.
 *
 * The shop↔remote link lives on the REMOTE (`remoteId` holds the shop's `shopifyShopId`, `internalId`
 * its `shopId`) and never on the shop row — reading `shop.systemMessageRemoteId` returns undefined,
 * which is precisely the bug that left the systemMessage worker domain fetching nothing. This uses the
 * same rule the worker uses (`shopRemoteCandidates`), so a screen and the worker cannot disagree about
 * which remote a shop owns.
 */
export function useShopifySyncContext(shopIdSource: ShopIdSource): ShopifySyncContext {
  const { records: shops, hydrated: shopsHydrated } = useCachedList<any>(shopifyShopCache);
  const { records: productStores, hydrated: storesHydrated } = useCachedList<any>(productStoreCache);
  const { records: remotes, hydrated: remotesHydrated } = useCachedList<any>(systemMessageRemoteCache);

  /**
   * Hydrated means EVERY table this context joins has emitted, not just the shop table.
   *
   * The join is shops ⋈ remotes ⋈ productStores, and those three subscriptions settle independently.
   * A caller that waited on the shop table alone would run while `remoteIds` was still empty and
   * conclude the shop has no remote — which is exactly how the product sync history page failed with
   * "Could not resolve systemMessageRemoteIds" on a cold entry.
   */
  const hydrated = computed(() => shopsHydrated.value && storesHydrated.value && remotesHydrated.value);

  const shopId = computed(() => String(toValue(shopIdSource) ?? ""));

  const shop = computed<any>(() =>
    shopId.value ? shops.value.find((row: any) => String(row.shopId) === shopId.value) ?? null : null);

  const productStore = computed<any>(() => {
    const id = shop.value?.productStoreId;
    return id
      ? productStores.value.find((row: any) => String(row.productStoreId) === String(id)) ?? null
      : null;
  });

  const candidates = computed<any[]>(() =>
    shop.value ? sortRemotesByAccess(shopRemoteCandidates(remotes.value as any[], shop.value)) : []);

  const remote = computed<any>(() => candidates.value[0] ?? null);
  const remoteId = computed(() => String(remote.value?.systemMessageRemoteId ?? ""));

  const remoteIds = computed<string[]>(() => {
    const seen = new Set<string>();
    for (const row of candidates.value) {
      const id = String(row?.systemMessageRemoteId ?? "").trim();
      if (id) seen.add(id);
    }
    return [...seen];
  });

  return { shop, productStore, remote, remoteId, remoteIds, shopId, hydrated };
}

/**
 * The shop's job for one sync feature, plus the state a configuration screen renders.
 *
 * ⚠️ The job is matched on PARAMETERS, never on name. Live proof that names lie:
 * `queue_ShopifyOrderSync_10010` carries `systemMessageRemoteId=HCDemoShopifyConfig`, whose shop is
 * 10000 — the numeric suffix is not the shop id, so a `_${shopId}` convention would hand one shop
 * another shop's job. `findSuitableSyncJob` reads `serviceJobParameters` straight off the cached row
 * (the LIST endpoint returns them for 144 of 156 jobs, so matching costs no request) and compares the
 * keys the descriptor names.
 */
export function useShopifySyncJob(
  feature: ShopifySyncFeature,
  ctx: Pick<ShopifySyncContext, "remoteId" | "shopId">,
  options: {
    loading?: MaybeRefOrGetter<boolean | undefined>;
    error?: MaybeRefOrGetter<string | undefined>;
  } = {},
) {
  const { records: jobs, hydrated } = useCachedList<any>(serviceJobCache);

  const templateJob = computed<any>(() =>
    jobs.value.find((row: any) => String(row.jobName) === feature.templateJobName) ?? null);

  const job = computed<any>(() =>
    findSuitableSyncJob(jobs.value as any[], feature, {
      remoteId: ctx.remoteId.value,
      shopId: ctx.shopId.value,
    }) ?? null);

  /** Helper jobs the feature depends on but does not own — pollers, message producers. */
  const auxJobs = computed<any[]>(() => {
    const wanted = new Set(feature.auxJobNames ?? []);
    return wanted.size ? jobs.value.filter((row: any) => wanted.has(String(row.jobName))) : [];
  });

  const jobName = computed(() => String(job.value?.jobName ?? ""));
  const isConfigured = computed(() => Boolean(job.value));
  const isPaused = computed(() => (job.value ? isServiceJobPaused(job.value as any) : false));
  const cronExpression = computed(() => String(job.value?.cronExpression ?? ""));

  const configurationState = computed(() => deriveSyncConfigurationState({
    job: job.value as any,
    loading: Boolean(toValue(options.loading)),
    // Passed raw: `deriveSyncConfigurationState` now treats a blank error as no error, so the local
    // `|| undefined` that used to be needed here (and was missing everywhere else) is gone.
    error: toValue(options.error),
  }));

  return {
    jobs, templateJob, job, auxJobs, jobName,
    isConfigured, isPaused, cronExpression, configurationState, hydrated,
  };
}

/**
 * This feature's SystemMessages for this shop's remote, newest first.
 *
 * Scoped by remote AND by the descriptor's message types, which is what keeps one feature's screen from
 * rendering the other's traffic — the cache holds every type for every remote in one table.
 */
export function useShopifySyncMessages(
  feature: ShopifySyncFeature,
  ctx: Pick<ShopifySyncContext, "remoteId"> & Partial<Pick<ShopifySyncContext, "remoteIds">>,
  options: { limit?: number; types?: readonly string[] } = {},
) {
  const { records: messages, hydrated } = useCachedList<any>(systemMessageCache, { dateField: "initDate" });

  const wantedTypes = computed(() =>
    new Set((options.types?.length ? options.types : feature.messageTypeIds).map(String)));

  /**
   * ALL of the shop's remotes, not just the best one.
   *
   * A shop can own several `SystemMessageRemote` rows (different access scopes against the same
   * store) and its traffic is spread across them — scoping to the head of the list silently hides
   * messages that belong to this shop. `remoteId` remains the fallback for callers that only have it.
   */
  const scopedRemoteIds = computed<Set<string>>(() => {
    const all = ctx.remoteIds?.value ?? [];
    const ids = all.length ? all : [ctx.remoteId.value];
    return new Set(ids.filter(Boolean).map(String));
  });

  const records = computed<any[]>(() => {
    const remoteIds = scopedRemoteIds.value;
    if (!remoteIds.size) return [];
    const types = wantedTypes.value;
    const rows = messages.value.filter((row: any) =>
      remoteIds.has(String(row.systemMessageRemoteId)) && types.has(String(row.systemMessageTypeId)));
    return options.limit ? rows.slice(0, options.limit) : rows;
  });

  /** Same rows, split by type — for a screen that renders more than one of the feature's types. */
  const byType = computed<Record<string, any[]>>(() => {
    const grouped: Record<string, any[]> = {};
    for (const row of records.value) (grouped[String(row.systemMessageTypeId)] ||= []).push(row);
    return grouped;
  });

  const newest = computed<any>(() => records.value[0] ?? null);

  return { records, byType, newest, hydrated };
}

/**
 * This shop's sync runs — SPINE from `syncRuns`, DETAIL from the message and import tables.
 *
 * The read contract, in order:
 *   1. `syncRuns` says which runs this shop has and which import each became. It is the only
 *      shop-scoped source of that pairing, so it decides membership.
 *   2. The full SystemMessage and DataManagerLog come from their own cached tables.
 *   3. Anything still missing is fetched by id, written to the cache, and returned — so a miss
 *      resolves once and never again (terminal records are immutable).
 *
 * Step 3 exists because the worker's enrichment is bounded per tick: a screen opened seconds after a
 * new run appears would otherwise render a hole. It is deduplicated and bounded here too, so a run
 * whose records genuinely do not exist is attempted once per session rather than on every re-render.
 */
export function useShopifySyncRuns(
  ctx: Pick<ShopifySyncContext, "shopId">,
  systemMessageTypeIds: readonly string[],
  options: { limit?: number; hydrateMax?: number } = {},
) {
  const { ensureSystemMessageById } = useSystemMessage();
  const { ensureDataManagerLog } = useDataManager();

  // `rows`, not `records`: `shopId` is renamed from the document's `remoteInternalId` and so exists
  // only after projection. Filtering `records` by it compares against undefined and matches nothing.
  const { rows: runRows, hydrated } = useCachedList<any>(syncRunCache, { dateField: "initDate" });
  const { records: messages } = useCachedList<any>(systemMessageCache, { dateField: "initDate" });
  const { records: logs } = useCachedList<any>(dataManagerLogCache, { dateField: "createdDate" });

  const wantedTypes = computed(() => new Set(systemMessageTypeIds.map(String)));

  /** Membership: this shop's runs of these types, newest first. */
  const spine = computed<any[]>(() => {
    const shopId = ctx.shopId.value;
    if (!shopId) return [];
    const types = wantedTypes.value;
    const matched = runRows.value.filter((row: any) =>
      String(row.shopId) === shopId && types.has(String(row.systemMessageTypeId)));
    return options.limit ? matched.slice(0, options.limit) : matched;
  });

  const messagesById = computed(() => {
    const byId: Record<string, any> = {};
    for (const row of messages.value) byId[String(row?.systemMessageId ?? "")] = row;
    return byId;
  });

  const logsById = computed(() => {
    const byId: Record<string, any> = {};
    for (const row of logs.value) byId[String(row?.logId ?? "")] = row;
    return byId;
  });

  /**
   * Spine ⋈ detail. Run fields win where they overlap: they came from the document that established
   * this run belongs to this shop, and the enriched records are only ever additive.
   */
  const runs = computed<any[]>(() => spine.value.map(({ raw, cachedAt, ...run }: any) => ({
    ...(raw as object),
    ...run,
    systemMessage: messagesById.value[String(run.systemMessageId)] ?? null,
    mdmLog: run.logId ? logsById.value[String(run.logId)] ?? null : null,
  })));

  /** Attempted ids, so a genuinely absent record is not re-requested on every render. */
  const attempted = new Set<string>();

  watch(runs, (current) => {
    const limit = options.hydrateMax ?? 5;
    let budget = limit;

    for (const run of current) {
      if (budget <= 0) break;

      const messageId = String(run.systemMessageId ?? "");
      if (messageId && !run.systemMessage && !attempted.has(`m:${messageId}`)) {
        attempted.add(`m:${messageId}`);
        budget -= 1;
        void ensureSystemMessageById(messageId);
      }

      const logId = String(run.logId ?? "");
      if (logId && !run.mdmLog && !attempted.has(`l:${logId}`)) {
        attempted.add(`l:${logId}`);
        budget -= 1;
        void ensureDataManagerLog(logId);
      }
    }
  }, { immediate: true });

  return { records: runs, spine, hydrated };
}

/** An import failed if its own status says so, or if any record inside it did. */
function isFailedImport(log: any): boolean {
  const status = String(log?.statusId ?? "").toLowerCase();
  return status.includes("fail") || status.includes("crash") || status.includes("cancel") ||
    Number(log?.failedRecordCount ?? 0) > 0;
}

/**
 * The DataManagerLogs this feature's import wrote, grouped by the message that produced them.
 *
 * Grouped rather than filtered per message because a history list needs every group at once, and one
 * pass over the cached table is cheaper than N filters — the join key is `systemMessageId`.
 */
export function useShopifySyncImports(feature: ShopifySyncFeature) {
  const { records: logs, hydrated } = useCachedList<any>(dataManagerLogCache, { dateField: "createdDate" });

  const wanted = new Set(feature.importConfigIds.map(String));

  const records = computed<any[]>(() =>
    logs.value.filter((row: any) => wanted.has(String(row?.configId))));

  const bySystemMessageId = computed<Record<string, any[]>>(() => {
    const grouped: Record<string, any[]> = {};
    for (const log of records.value) {
      const id = String(log?.systemMessageId ?? "");
      if (!id) continue;
      (grouped[id] ||= []).push(log);
    }
    return grouped;
  });

  const failed = computed<any[]>(() => records.value.filter(isFailedImport));

  return { records, bySystemMessageId, failed, hydrated };
}

/** The `mappedTypeId` values the order pipeline needs mapped before it can place an order. */
export const SHOPIFY_SALES_CHANNEL_MAPPED_TYPE = "SHOPIFY_ORDER_SOURCE";
export const SHOPIFY_PAYMENT_METHOD_MAPPED_TYPE = "SHOPIFY_PAYMENT_TYPE";

/**
 * Mapping readiness for a shop — a composable function over cached mappings, with no state anywhere.
 *
 * The three families live in two different tables (type mappings for sales channel and payment method,
 * carrier shipments for shipping), which is why this exists rather than each screen filtering twice.
 */
export function useShopifySyncMappings(shopIdSource: ShopIdSource) {
  const { records: typeMappings } = useCachedList<any>(shopifyTypeMappingCache);
  const { records: carrierShipments, hydrated } = useCachedList<any>(shopifyCarrierShipmentCache);

  const shopId = computed(() => String(toValue(shopIdSource) ?? ""));
  const forShop = (rows: any[]) => rows.filter((row: any) => String(row.shopId) === shopId.value);

  /**
   * A row with no `mappedValue` is a RETIRED key, not a mapping — retiring is a value-clearing write
   * because the endpoint has no delete (see `retireTypeMapping`). Counting those rows would report a
   * family as ready after its only mapping was cleared.
   */
  const isMapped = (row: any) => Boolean(row?.mappedValue);
  const salesChannelMappings = computed(() =>
    forShop(typeMappings.value).filter((row: any) => row.mappedTypeId === SHOPIFY_SALES_CHANNEL_MAPPED_TYPE && isMapped(row)));
  const paymentMethodMappings = computed(() =>
    forShop(typeMappings.value).filter((row: any) => row.mappedTypeId === SHOPIFY_PAYMENT_METHOD_MAPPED_TYPE && isMapped(row)));
  const shippingMethodMappings = computed(() => forShop(carrierShipments.value));

  const readiness = computed(() => deriveOrderSyncMappingReadiness({
    salesChannelMappings: salesChannelMappings.value as any,
    paymentMethodMappings: paymentMethodMappings.value as any,
    shippingMethodMappings: shippingMethodMappings.value as any,
  }));

  return { salesChannelMappings, paymentMethodMappings, shippingMethodMappings, readiness, hydrated };
}

/** Window depths for one feature's domain set. Split out so both callers name the same options. */
export interface SyncFeatureDomainOptions {
  /** Window depth per (remote, type) for messages. Honoured via the domain's backfill pass. */
  messageTotal?: number;
  /**
   * Window depth for the import (DataManagerLog) feed.
   *
   * ⚠️ This window is per `configId` and SHARED ACROSS SHOPS, unlike messages. No endpoint keys logs
   * to a shop: `admin/dataManager/details` ignores shop filters outright (verified — a nonexistent
   * shop id returns the full unfiltered set) and `DATA_MANAGER_LOG_AND_PARAMETER`, which does scope by
   * shop, does not return `systemMessageId` and so cannot be joined to a message. Depth is therefore
   * the only control: it must be deep enough that a quiet shop's logs still land inside the window
   * when a busy shop dominates recent traffic.
   *
   * It is per `configId`, so two features composed into one session do NOT share a budget — product
   * sync's `SYNC_SHOPIFY_PRODUCT` and order sync's `SYNC_SHOPIFY_ORDER` each get their own window.
   */
  importTotal?: number;
}

export interface ShopifySyncSessionOptions extends SyncFeatureDomainOptions {
  /** True while work is in flight — selects the worker's fast cadence over its idle one. */
  active: () => boolean;
  /** Reload the pieces that genuinely cannot be cached. Omit if the feature has none. */
  refresh?: () => Promise<void>;
  onError?: (error: unknown) => void;
  /** Worker domains this feature needs beyond its messages and imports (job runs, and so on). */
  extraDomains?: (intervalMs: number) => ActiveDomain[];
}

/**
 * The class-A domains ONE sync feature needs — its messages and the imports they produce.
 *
 * Exported because a page can render more than one feature (connection details shows both product
 * sync and order sync) and every `useCacheSync()` call owns its own worker. Composing two features'
 * domain lists into a single session is therefore the difference between one worker and two.
 *
 * ⚠️ The message domain is scoped to THIS feature's types. The app config lists every type any screen
 * might want, and syncing all of them costs one request per (type × remote) per tick — twelve for a
 * screen that renders one type. Declaring the types here is what keeps a tick at two requests.
 *
 * `intervalMs` is stamped per domain, and `effectiveInterval` prefers the active domain's value over
 * the registered default, so features composed into one session keep their own cadences.
 */
export function syncFeatureDomains(
  feature: ShopifySyncFeature,
  intervalMs: number,
  options: SyncFeatureDomainOptions = {},
): ActiveDomain[] {
  return [
    ...feature.messageTypeIds.map((systemMessageTypeId) => ({
      name: "systemMessage",
      intervalMs,
      args: { types: [{ systemMessageTypeId, total: options.messageTotal ?? 50 }] },
    })),
    // Every import config, because an import is matched to its message by `systemMessageId` and a
    // missing log makes a finished run look like it never imported.
    ...feature.importConfigIds.map((configId) => ({
      name: "dataManagerLog",
      intervalMs,
      args: { configId, ...(options.importTotal ? { total: options.importTotal } : {}) },
    })),
  ];
}

/** The active/idle cadence choice for one feature, in one place. */
export function syncFeatureInterval(feature: ShopifySyncFeature, active: boolean): number {
  return active ? feature.activePollMs : feature.idlePollMs;
}

/**
 * A sync screen's worker session — activation and cadence, NOT a main-thread poller.
 *
 * Nothing here fetches on this thread. It tells the worker which domains to run and how often, and
 * the screen's entity reads are `liveQuery` subscriptions that update themselves as the worker
 * commits. Cadence is the one live decision: the feature's `activePollMs` while work is moving,
 * `idlePollMs` when it is not.
 */
export function useShopifySyncSession(
  feature: ShopifySyncFeature,
  options: ShopifySyncSessionOptions,
) {
  const { start, stop } = useCacheSync();

  const isPageActive = ref(false);
  /** True only during a manual/live refresh — never for observing cached progress. */
  const isRefreshing = ref(false);

  /**
   * The domain set, as a COMPUTED over everything that can change it.
   *
   * Deliberately not `watch(() => options.active())`, which was the previous trigger: that re-scopes
   * only when this feature's own predicate flips and is blind to anything `extraDomains` depends on.
   * Two live consequences — a screen whose `jobNames()` resolved after activation never picked up its
   * `serviceJobRun` domain, and a page composing a SECOND feature's domains (connection details, which
   * runs product sync and order sync on one worker) could never escalate that feature's cadence.
   *
   * Tracking the assembled list instead makes any reactive input a re-scope trigger, which is what a
   * caller assembling domains from live state already assumes.
   */
  const activeDomainSet = computed<ActiveDomain[]>(() => {
    const intervalMs = syncFeatureInterval(feature, options.active());
    return [
      ...syncFeatureDomains(feature, intervalMs, options),
      ...(options.extraDomains?.(intervalMs) ?? []),
    ];
  });

  async function activate() {
    isPageActive.value = true;
    try {
      await start(activeDomainSet.value);
    } catch (error) {
      logger.error(`Failed to activate ${feature.id} sync domains`, error);
      options.onError?.(error);
    }
  }

  function deactivate() {
    isPageActive.value = false;
    stop();
  }

  /** `start` swaps the domain set on the running worker rather than respawning it, so this is cheap. */
  watch(activeDomainSet, (domains) => {
    if (!isPageActive.value) return;
    void start(domains).catch((error) => {
      logger.error(`Failed to re-scope ${feature.id} sync domains`, error);
    });
  });

  async function manualRefresh(): Promise<void> {
    if (!options.refresh || isRefreshing.value) return;
    isRefreshing.value = true;
    try {
      await options.refresh();
    } catch (error) {
      options.onError?.(error);
    } finally {
      isRefreshing.value = false;
    }
  }

  /**
   * Self-activating on the Ionic view lifecycle: a view constructs this and expects monitoring to run.
   *
   * The initial `manualRefresh` covers the live-only pieces. Cached entities need no initial fetch —
   * they are already in IndexedDB and render on the first frame.
   */
  onIonViewDidEnter(() => { void activate().then(() => manualRefresh()); });
  onIonViewDidLeave(() => deactivate());
  onBeforeUnmount(() => deactivate());

  return { isPageActive, isRefreshing, manualRefresh, activate, deactivate };
}

// =============================================================================================
// 4. Product sync — the feature composable and the run join
// =============================================================================================

/** One product-sync run as the summary cards read it: the message, plus its import's counts. */
export interface ProductSyncRunSummaryRow extends Record<string, any> {
  systemMessageId?: string;
  statusId?: string;
  initDate?: string | number;
  /** Present only once an import actually ran — the field callers test for "did this import". */
  logId?: string;
  totalRecordCount?: number;
  failedRecordCount?: number;
  successRecordCount?: number;
}

export interface ProductSyncRunState {
  systemMessages: ProductSyncRunSummaryRow[];
  latestSystemMessage: ProductSyncRunSummaryRow | null;
  latestConfirmedSystemMessage: ProductSyncRunSummaryRow | null;
  latestConsumedSystemMessage: ProductSyncRunSummaryRow | null;
  lastSyncedAt: string | number | "";
}

const CONSUMED_STATUSES = new Set(["smsgconsumed", "consumed", "smsgconfirmed", "confirmed"]);

/**
 * The product-sync run state, DERIVED from cache — a local reproduction of the
 * `SYSTEM_MESSAGE_DATA_MANAGER_LOG` DataDocument.
 *
 * That DataDocument is a server-side join of SystemMessage ⋈ DataManagerLog scoped by message type
 * and by the remote's internal id. Both sides are class-A cached domains and the shop→remote link is
 * cached too, so the whole document is a local computation. It was the single largest cluster of
 * requests across the Shopify screens: the connection details page alone asked for it three times per
 * entry, in three slightly different shapes.
 *
 * REACTIVE, so a screen binds to it once and new runs appear as the worker commits — there is nothing
 * to re-invoke and no loading state between states. The screen must activate the `systemMessage` and
 * `dataManagerLog` domains (see `useShopifyConnectionSyncSession`), otherwise this is legitimately empty.
 */
export function useShopifyProductSyncRunState(shopIdSource: ShopIdSource) {
  const ctx = useShopifySyncContext(shopIdSource);

  /**
   * Runs from the SPINE — `syncRuns` decides membership (it is the only shop-scoped source of the
   * message↔import pairing), and the message and import records come from their own tables, fetched by
   * id on a miss.
   *
   * Depth is `PRODUCT_SYNC_RUN_WINDOW`, the same constant the worker fetches with, so the read can
   * never be shallower than the cache.
   */
  const { records: runs, hydrated: runsHydrated } = useShopifySyncRuns(
    ctx, [PRODUCT_SYNC_REQUEST_MESSAGE_TYPE], { limit: PRODUCT_SYNC_RUN_WINDOW });

  /**
   * Flattened to the shape the summary reads.
   *
   * `logId` comes off the SPINE, not off the joined record: the run knows an import exists the moment
   * the document reports it, whereas the log row may still be a tick behind. Treating a pending
   * enrichment as "no import" is what would report a completed sync as never having run.
   */
  const systemMessages = computed<ProductSyncRunSummaryRow[]>(() => runs.value.map((run: any) => ({
    ...(run.systemMessage ?? {}),
    systemMessageId: run.systemMessageId,
    statusId: run.statusId ?? run.systemMessage?.statusId,
    initDate: run.initDate ?? run.systemMessage?.initDate,
    logId: run.logId,
    // The import's own status, off the SPINE first for the same reason as `logId`: the document
    // reports it the moment the import exists, while the enriched log row can be a tick behind.
    // `normalizeProductSyncStatus` (the wizard FSM) keys on this — omitting it made every completed
    // import look "in progress" to the progress card.
    logStatusId: run.logStatusId ?? run.mdmLog?.statusId,
    finishDateTime: run.mdmLog?.finishDateTime,
    totalRecordCount: run.totalRecordCount ?? run.mdmLog?.totalRecordCount,
    failedRecordCount: run.failedRecordCount ?? run.mdmLog?.failedRecordCount,
    successRecordCount: run.mdmLog?.successRecordCount,
  })));

  const latestSystemMessage = computed(() => systemMessages.value[0] ?? null);

  const latestConfirmedSystemMessage = computed(() =>
    systemMessages.value.find((row) =>
      row.statusId === "SmsgConfirmed" || row.statusId === "SmsgConsumed") ?? null);

  /**
   * "Consumed" means the message reached a terminal status AND produced an import. A confirmed
   * message with no `logId` synced nothing, so treating it as the last sync would report a sync that
   * never moved a record.
   */
  const latestConsumedSystemMessage = computed(() =>
    systemMessages.value.find((row) =>
      CONSUMED_STATUSES.has(String(row.statusId ?? "").toLowerCase()) && row.logId) ?? null);

  const runState = computed<ProductSyncRunState>(() => ({
    systemMessages: systemMessages.value,
    latestSystemMessage: latestSystemMessage.value,
    latestConfirmedSystemMessage: latestConfirmedSystemMessage.value,
    latestConsumedSystemMessage: latestConsumedSystemMessage.value,
    lastSyncedAt: latestConsumedSystemMessage.value?.initDate ?? "",
  }));

  /**
   * ⚠️ WINDOW LIMITATION, stated rather than papered over.
   *
   * This join sees the overlap of two independent windows: the newest N messages for the shop and the
   * newest N imports for the config. If a shop's most recent import predates its message window,
   * `latestConsumedSystemMessage` is null and the summary reads "no completed sync" even though one
   * happened further back.
   *
   * There is deliberately NO automatic server fallback. Two attempts at one were removed after live
   * measurement: `dataManagerLog` rows are fetched by `configId` GLOBALLY, with no shop on the row and
   * no way to attribute one to a shop without its message. An unmatched import therefore says nothing
   * about THIS shop, so any gap test built on it fires for every shop that shares the config — it
   * turned one request into five on the product sync page and four on connection details, and in
   * every case the server returned exactly the answer the cache already had (verified live on shops
   * 10000 and 10010).
   *
   * The fix is to key the LOG fetch to (shop, config) the way the message fetch is already keyed to
   * (remote, type), so 100 logs means 100 per shop. `DATA_MANAGER_LOG_AND_PARAMETER` supports it via
   * `parameterName: "shopId"`. Not a guess per render.
   */

  /** Requests produced but not yet processed — the "pending requests" count. */
  const pendingRequests = computed(() =>
    systemMessages.value.filter((row) => row.statusId === "SmsgProduced"));

  const hydrated = computed(() => ctx.hydrated.value && runsHydrated.value);

  return { ...ctx, runState, systemMessages, pendingRequests, hydrated };
}

/**
 * Normalise a cached date to the ISO 8601 form Shopify's search syntax accepts.
 *
 * Cached date fields are millis (the projection's `date` coercion), API payloads are ISO strings, and
 * a few carry `yyyy-MM-dd HH:mm:ss`. All three reach here, so all three are handled; anything
 * unparseable returns "" so the caller omits the filter rather than sending a malformed query.
 */
function toShopifyTimestamp(value: string | number | undefined | null): string {
  if (value === undefined || value === null || value === "") return "";

  const millis = typeof value === "number" ? value : Number(value);
  if (Number.isFinite(millis) && millis > 0) return new Date(millis).toISOString();

  const parsed = new Date(String(value).replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

/** Escapes a value for interpolation into a Shopify GraphQL string literal. */
const escapeShopifyQueryValue = (value: string) => String(value).replace(/(["\\])/g, "\\$1");

/**
 * How many products changed in Shopify since the last completed sync.
 *
 * The ONE part of the old product-sync dashboard that is genuinely a request: only Shopify knows what
 * changed on its side. `lastSyncedAt` comes from the cached run state, so the caller supplies it
 * rather than this re-deriving it with another round trip (the store version fell back to a whole
 * `fetchProductUpdateSyncRunState` when the date was missing).
 *
 * Returns 0 rather than throwing when there is no remote or no prior sync — a count is a display
 * value and a failure to obtain it must not take a page down.
 */
export async function fetchUnsyncedProductUpdateCount(
  systemMessageRemoteId: string,
  lastSyncedAt?: string | number,
): Promise<number> {
  if (!systemMessageRemoteId) return 0;

  /**
   * ⚠️ Shopify needs an ISO 8601 timestamp here, NOT epoch millis.
   *
   * The cache projection coerces every date field to millis, so passing a cached `initDate` straight
   * through produced `updated_at:>'1784618182975'` and Shopify answered 400
   * `INTERNAL_SERVER_ERROR` — which this function's own catch turned into a count of 0. A wrong
   * number that looks like a real one, with a swallowed error behind it.
   */
  const isoLastSyncedAt = toShopifyTimestamp(lastSyncedAt);
  const filter = isoLastSyncedAt
    ? `(query: "updated_at:>'${escapeShopifyQueryValue(isoLastSyncedAt)}'")`
    : "";
  const resp: any = await api({
    url: "shopify/graphql",
    method: "post",
    data: {
      systemMessageRemoteId,
      queryText: `query UnsyncedProductUpdatesCount { productsCount${filter} { count precision } }`,
    },
  });

  const payload = resp?.data?.response ?? resp?.data?.data ?? resp?.data ?? resp;
  const errors = resp?.data?.errors ?? payload?.errors;
  // Reported, not swallowed: a failed count is indistinguishable from a genuine zero otherwise, which
  // is how a 400 sat unnoticed behind "Unsynced events 0".
  if (errors) throw new Error(`Shopify unsynced product count failed: ${JSON.stringify(errors)}`);

  const count = payload?.data?.productsCount?.count ?? payload?.productsCount?.count;
  return Number(count ?? 0) || 0;
}

/**
 * Product sync's domains BEYOND its messages and imports.
 *
 * Used by the connection details session. `ShopifyProductSync.vue` still hand-rolls its own
 * equivalent list (see the tracker) rather than calling this, which runs this feature
 * alongside order sync on one worker — so the run cursor and job-run watch are defined once.
 */
export interface ConfigureProductSyncJobInput {
  shopId: string;
  productStoreId?: string;
  productIdentifierEnumId?: string;
}

/**
 * Give a shop its own product-sync job by cloning the template.
 *
 * Two GENERIC `admin/serviceJobs` calls — clone, then set the shop's parameters — so this needs none
 * of the bespoke Shopify surface. It moved off `store/shopifyProductSync.configureSyncJob` unchanged
 * except for the two things the store version lacked:
 *
 *  - it REFRESHES the cached `serviceJob` row. `serviceJob` is class B and snapshots once per login,
 *    so without this the new job is invisible to every cached read — the Upgrade Assistant would
 *    schedule a job and then still render "no job configured" until the next login.
 *  - it returns the resolved job rather than the raw `AxiosResponse`, so a caller can verify what
 *    landed instead of reading `undefined` off an axios envelope.
 *
 * The job is created PAUSED, which is deliberate: activation is a separate, reviewed step.
 */
export async function configureProductSyncJob(input: ConfigureProductSyncJobInput) {
  const { shopId, productStoreId, productIdentifierEnumId } = input;
  if (!shopId) throw new Error("A shop is required to configure the product sync job.");

  const jobName = `${PRODUCT_SYNC_FEATURE.templateJobName}_${shopId}`;

  await api({
    url: `admin/serviceJobs/${PRODUCT_SYNC_FEATURE.templateJobName}/clone`,
    method: "POST",
    data: { newJobName: jobName },
  });

  const serviceJobParameters: Array<{ parameterName: string; parameterValue: string }> = [
    { parameterName: "shopId", parameterValue: shopId },
  ];
  if (productStoreId) {
    serviceJobParameters.push({ parameterName: "productStoreIds", parameterValue: productStoreId });
  }
  if (productIdentifierEnumId) {
    serviceJobParameters.push({
      parameterName: "shopifyProductIdentifier",
      parameterValue: productIdentifierEnumId,
    });
  }

  const resp: any = await api({
    url: `admin/serviceJobs/${jobName}`,
    method: "PUT",
    data: { jobName, paused: "Y", serviceJobParameters },
  });

  await refreshAfterMutation("serviceJob", { jobName });

  const body = resp?.data?.jobDetail ?? resp?.data ?? {};
  return { shopId, jobName, paused: "Y", serviceJobParameters, ...body };
}

/**
 * Give a shop its own ORDER sync job by cloning the template — the generic-API alternate to the
 * broken bespoke route.
 *
 * `POST shopify/order-sync/{shopId}/job` 400s (`Cannot get property 'hotwax' on null object`,
 * verified live 2026-07-26) and is a backend contract we do not control. But the job it was meant to
 * create is an ordinary ServiceJob clone, and the exact same two generic calls that
 * `configureProductSyncJob` uses are proven live. Parameter set copied from the working clone
 * (`queue_ShopifyOrderSync_10010`, read from the cache):
 *
 *   systemMessageRemoteId=<the shop's remote>   systemMessageTypeId=ShopifyOrderSync   runAsBatch=true
 *
 * The job is matched to its shop by these PARAMETERS (`findSuitableSyncJob`), never by name, so the
 * `_${shopId}` suffix is only a human-readable convention. Created PAUSED: activation is a separate,
 * reviewed step on the configure screen, same as product sync.
 */
export async function configureOrderSyncJob(input: { shopId: string; systemMessageRemoteId: string }) {
  const { shopId, systemMessageRemoteId } = input;
  if (!shopId) throw new Error("A shop is required to configure the Order Sync job.");
  if (!systemMessageRemoteId) {
    throw new Error("The shop's SystemMessageRemote must exist before Order Sync can be configured.");
  }

  const jobName = `${ORDER_SYNC_FEATURE.templateJobName}_${shopId}`;

  await api({
    url: `admin/serviceJobs/${ORDER_SYNC_FEATURE.templateJobName}/clone`,
    method: "POST",
    data: { newJobName: jobName },
  });

  const serviceJobParameters = [
    { parameterName: "systemMessageRemoteId", parameterValue: systemMessageRemoteId },
    { parameterName: "systemMessageTypeId", parameterValue: SHOPIFY_ORDER_SYNC_MESSAGE_TYPE },
    // String "true", not "Y" — copied from the live working clone; `isTruthy` accepts both.
    { parameterName: "runAsBatch", parameterValue: "true" },
  ];

  const resp: any = await api({
    url: `admin/serviceJobs/${jobName}`,
    method: "PUT",
    data: { jobName, paused: "Y", serviceJobParameters },
  });

  await refreshAfterMutation("serviceJob", { jobName });

  const body = resp?.data?.jobDetail ?? resp?.data ?? {};
  return { shopId, jobName, paused: "Y", serviceJobParameters, ...body };
}

export function productSyncExtraDomains(intervalMs: number, jobNames: readonly string[] = []): ActiveDomain[] {
  const names = jobNames.filter(Boolean);
  return [
    /**
     * The shop-scoped cursor. It decides WHICH runs this shop has and enriches the message and log
     * records they name, so the message⋈log join no longer depends on two shared windows lining up.
     */
    {
      name: "syncRun",
      intervalMs,
      args: {
        systemMessageTypeIds: [PRODUCT_SYNC_REQUEST_MESSAGE_TYPE],
        total: PRODUCT_SYNC_RUN_WINDOW,
      },
    },
    ...(names.length ? [{ name: "serviceJobRun", intervalMs, args: { jobNames: names } }] : []),
  ];
}

/**
 * A Shopify product sync RUN — the join of the three records that describe one sync attempt.
 *
 *     systemMessage ──remoteMessageId──▶ shopifyBulkOperation   (what Shopify did)
 *           │
 *           └────systemMessageId────▶ dataManagerLog            (what the OMS imported)
 *
 * LOCAL-FIRST AND REACTIVE. Every read is a `liveQuery` over IndexedDB, so the run re-derives itself
 * whenever the sync worker commits — the UI updates seamlessly with no main-thread refresh, no
 * re-fetch to observe a status change, and therefore no loading state between states.
 *
 * That replaces a main-thread refresh architecture: the previous version awaited three fetches per
 * run and had to be re-invoked (on a timer, on visibility, after every action) to show progress,
 * flashing a loader each time. A history of N runs cost 3N requests. As a join it costs none, and
 * progress simply appears as the worker writes.
 *
 * The returned SHAPE is unchanged (`systemMessage` / `bulkOperation` / `mdmLog` / `status` /
 * `statusColor` / `completed`) and `fetchSyncRun(id)` remains the entry point, because three views
 * bind to that contract. What changed is that it is now a projection of cached state rather than the
 * result of a fetch cascade.
 *
 * Two pieces stay ON DEMAND (class C) because they only matter for a run being inspected: the
 * message's ERRORS and the Shopify BULK OPERATION. `fetchSyncRun` primes both once; each writes
 * through to the cache, after which they are read reactively like everything else.
 */
export function useShopifyProductSyncRun() {
  const { ensureSystemMessageErrors, fetchShopifyBulkOperation } = useSystemMessage();
  const { labelFor } = useStatuses();

  /** Which run is displayed. Set by `fetchSyncRun`; everything below derives from it. */
  const targetMessageId = ref('');
  /** True only while the two on-demand primes are in flight — never for observing progress. */
  const loading = ref(false);

  // One live subscription per table. Whole-table reads because the lookup key is reactive, and
  // re-subscribing on every id change would churn subscriptions for no gain at these volumes.
  const { records: messages } = useCachedList<any>(systemMessageCache, { dateField: 'initDate' });
  const { records: bulkOperations } = useCachedList<any>(shopifyBulkOperationCache);
  const { records: mdmLogs } = useCachedList<any>(dataManagerLogCache, { dateField: 'createdDate' });
  const { records: messageErrors } = useCachedList<any>(systemMessageErrorCache, { dateField: 'errorDate' });

  /**
   * Status → colour, by string matching rather than a status-id map, because the three sources speak
   * different vocabularies: SystemMessage uses `Smsg*` ids, DataManagerLog uses `Dml*`, and a Shopify
   * bulk operation uses its own GraphQL enum (COMPLETED / FAILED / CANCELED).
   */
  const getStatusColor = (status: string) => {
    if (!status) return 'medium';
    const s = status.toLowerCase();
    if (s.includes('success') || s.includes('completed') || s.includes('consumed') || s.includes('confirmed') || s.includes('finished') || s === 'dmlsuccess') return 'success';
    if (s.includes('error') || s.includes('failed') || s.includes('rejected') || s === 'dmlerror') return 'danger';
    if (s.includes('running') || s.includes('sent') || s.includes('produced') || s.includes('smsg')) return 'primary';
    if (s === 'skipped') return 'warning';
    return 'medium';
  };

  /** Label from the CACHED status catalog, falling back to the vocabularies above. */
  const getStatusLabel = (status: string) => {
    if (!status) return translate('Pending');

    const cached = labelFor(status);
    if (cached && cached !== status) return cached;

    const s = status.toLowerCase();
    if (s === 'running') return translate('Running');
    if (s === 'completed') return translate('Complete');
    if (s === 'failed') return translate('Error');
    if (s === 'canceled' || s === 'cancelled') return translate('Canceled');
    if (s === 'skipped') return translate('Skipped');
    return status;
  };

  const systemMessage = computed<any>(() =>
    targetMessageId.value
      ? messages.value.find((row: any) => String(row.systemMessageId) === targetMessageId.value)
      : undefined);

  const systemMessageErrors = computed<any[]>(() =>
    targetMessageId.value
      ? messageErrors.value.filter((row: any) => String(row.systemMessageId) === targetMessageId.value)
      : []);

  const errorText = computed<string>(() => {
    for (const error of systemMessageErrors.value) {
      const text = String(error?.errorText ?? '').trim();
      if (text) return text;
    }
    return '';
  });

  const bulkOperationId = computed<string>(() => getSystemMessageBulkOperationId(systemMessage.value) || '');

  const bulkOperation = computed<any>(() =>
    bulkOperationId.value
      ? bulkOperations.value.find((row: any) => row.id === bulkOperationId.value)
      : undefined);

  /**
   * The MDM log for this run. A bulk-operation run can span a parent message and its children, so
   * the referenced ids are tried too — the same rule the imperative version used.
   */
  const mdmLog = computed<any>(() => {
    if (!targetMessageId.value) return undefined;
    const referenced = getReferencedBulkOperationSystemMessageIds(systemMessage.value) ?? [];
    const candidates = new Set([targetMessageId.value, ...referenced].filter(Boolean).map(String));
    return mdmLogs.value.find((row: any) => candidates.has(String(row.systemMessageId)));
  });

  /**
   * "Completed but imported nothing" is reported as skipped.
   *
   * A bulk operation that finishes with `objectCount: 0` produces no MDM log at all, so without this
   * the run would sit on "pending" forever with nothing to wait for.
   */
  const skippedEmptyImport = computed<boolean>(() =>
    String(bulkOperation.value?.status ?? '').toUpperCase() === 'COMPLETED' &&
    Number(bulkOperation.value?.objectCount ?? 0) === 0);

  const effectiveStatus = computed<string>(() =>
    mdmLog.value?.statusId ||
    (skippedEmptyImport.value ? 'skipped' : bulkOperation.value?.status) ||
    systemMessage.value?.statusId ||
    '');

  /** The run view model — the contract the views already bind to, now fully derived. */
  const currentSyncRun = computed(() => {
    if (!targetMessageId.value) return {} as Record<string, any>;

    const message = systemMessage.value ?? {};
    const operation = bulkOperation.value;
    const log = mdmLog.value;
    const mdmStatus = log?.statusId || (skippedEmptyImport.value ? 'skipped' : undefined);

    return {
      systemMessageId: targetMessageId.value,
      systemMessage: {
        ...message,
        systemMessageErrors: systemMessageErrors.value,
        errorText: errorText.value,
        messageText: String(message?.messageText ?? '').trim(),
        statusLabel: getStatusLabel(message?.statusId),
        statusColor: getStatusColor(message?.statusId),
      },
      bulkOperation: {
        id: operation?.id || bulkOperationId.value,
        status: operation?.status || message?.statusId,
        // With no operation record the message's own status is the best available signal.
        isStatusUnavailable: !operation,
        statusLabel: getStatusLabel(operation?.status || message?.statusId),
        statusColor: getStatusColor(operation?.status || message?.statusId),
        objectCount: operation?.objectCount,
        rootObjectCount: operation?.rootObjectCount,
        createdAt: operation?.createdAt,
        completedAt: operation?.completedAt,
        query: operation?.query,
      },
      mdmLog: {
        id: log?.logId,
        statusId: mdmStatus,
        statusLabel: getStatusLabel(mdmStatus),
        statusColor: getStatusColor(mdmStatus),
        startDate: log?.startDateTime,
        endDate: log?.finishDateTime,
        finishDateTime: log?.finishDateTime,
        createdDate: log?.createdDate,
        createdStamp: log?.createdStamp,
        lastUpdatedStamp: log?.lastUpdatedStamp,
        totalRecordCount: log?.totalRecordCount,
        failedRecordCount: log?.failedRecordCount,
        successRecordCount: log?.successRecordCount,
        configId: log?.configId,
        logContentId: log?.logContentId,
        fileName: log?.fileName,
      },
      status: getStatusLabel(effectiveStatus.value),
      statusColor: getStatusColor(effectiveStatus.value),
      completed: log?.statusId === 'DmlSuccess' ||
        log?.statusId === 'DmlError' ||
        skippedEmptyImport.value,
    } as Record<string, any>;
  });

  /**
   * Point this composable at a run and prime the two on-demand pieces.
   *
   * Callers do NOT need to call this again to see progress — `currentSyncRun` keeps updating from the
   * cache on its own. It returns the derived run so existing `await fetchSyncRun(id)` sites keep
   * working, but the returned object is a snapshot of a computed value, not the live source.
   */
  const fetchSyncRun = async (systemMessageId: string, systemMessageData?: any) => {
    const id = String(systemMessageId || systemMessageData?.systemMessageId || '');
    if (!id) return null;

    targetMessageId.value = id;
    loading.value = true;
    try {
      // Cached after the first look, so this is a no-op on revisit.
      await ensureSystemMessageErrors(id);

      // Cache-first inside `fetchShopifyBulkOperation`, which short-circuits once the operation is
      // terminal (immutable), so a finished run never hits Shopify again.
      const message = systemMessage.value ?? systemMessageData;
      const operationId = getSystemMessageBulkOperationId(message);
      const remoteId = message?.systemMessageRemoteId;
      if (operationId && remoteId && !bulkOperation.value) {
        await fetchShopifyBulkOperation(operationId, remoteId).catch(() => undefined);
      }
      return currentSyncRun.value;
    } finally {
      loading.value = false;
    }
  };

  /**
   * Stop showing a run.
   *
   * `currentSyncRun` is derived, so it cannot be assigned to — clearing means pointing at nothing.
   */
  const clearSyncRun = () => { targetMessageId.value = ''; };

  return { currentSyncRun, loading, fetchSyncRun, clearSyncRun, systemMessage, bulkOperation, mdmLog };
}

// =============================================================================================
// 5. Order sync — entities, derivations, view model, mutations
// =============================================================================================

export const SHOPIFY_ORDER_SYNC_TEMPLATE_JOB = "queue_ShopifyOrderSync";
export const SHOPIFY_ORDER_SYNC_MESSAGE_TYPE = "ShopifyOrderSync";
export const SHOPIFY_ORDER_SYNC_ADMIN_PERMISSION = Actions.APP_SHOPIFY_SYNC_ADMIN;
export const SHOPIFY_ORDER_SYNC_ACTIVE_POLL_MS = 10_000;
export const SHOPIFY_ORDER_SYNC_IDLE_POLL_MS = 60_000;
export const SHOPIFY_ORDER_SYNC_RESULT_LIMIT = 100;

/** Order sync's slice of the generic sync core (see `ShopifySyncFeature`). */
export const ORDER_SYNC_FEATURE: ShopifySyncFeature = {
  id: "order",
  messageTypeIds: [SHOPIFY_ORDER_SYNC_MESSAGE_TYPE],
  importConfigIds: ["SYNC_SHOPIFY_ORDER", "UPDATE_SHOPIFY_ORDER"],
  templateJobName: SHOPIFY_ORDER_SYNC_TEMPLATE_JOB,
  jobMatch: {
    parameterKeys: ["systemMessageRemoteId", "remoteId", "shopifyRemoteId"],
    matchOn: "remoteId",
    requiredParameters: [
      { keys: ["systemMessageTypeId", "messageTypeId", "typeId"], equals: SHOPIFY_ORDER_SYNC_MESSAGE_TYPE },
      { keys: ["runAsBatch", "batch", "isBatch"], truthy: true },
    ],
  },
  adminPermission: SHOPIFY_ORDER_SYNC_ADMIN_PERMISSION,
  activePollMs: SHOPIFY_ORDER_SYNC_ACTIVE_POLL_MS,
  idlePollMs: SHOPIFY_ORDER_SYNC_IDLE_POLL_MS,
};

type UnknownRecord = Record<string, unknown>;
type ValueSource = UnknownRecord | null | undefined;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function valueText(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function firstValue(source: ValueSource, keys: readonly string[]): unknown {
  if (!source) return undefined;
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && valueText(value)) return value;
  }
  return undefined;
}

function firstText(source: ValueSource, keys: readonly string[]): string {
  return valueText(firstValue(source, keys));
}

function normalizeToken(value: unknown): string {
  return valueText(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isTruthy(value: unknown): boolean {
  if (value === true) return true;
  return ["true", "y", "yes", "1"].includes(valueText(value).toLowerCase());
}

function numberValue(source: ValueSource, keys: readonly string[]): number {
  const value = Number(firstValue(source, keys));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function timestampValue(value: unknown): number {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : 0;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 0 && value < 100_000_000_000 ? value * 1000 : value;
  }

  const text = valueText(value);
  if (!text) return 0;
  if (/^\d+(\.\d+)?$/.test(text)) return timestampValue(Number(text));
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function timestampFrom(source: ValueSource, keys: readonly string[]): number {
  return timestampValue(firstValue(source, keys));
}

function originalTimestamp(source: ValueSource, keys: readonly string[]): string | number | undefined {
  const value = firstValue(source, keys);
  return typeof value === "string" || typeof value === "number" ? value : undefined;
}

function boundedLimit(limit: unknown): number {
  const parsed = Math.trunc(Number(limit));
  if (!Number.isFinite(parsed) || parsed < 1) return SHOPIFY_ORDER_SYNC_RESULT_LIMIT;
  return Math.min(parsed, SHOPIFY_ORDER_SYNC_RESULT_LIMIT);
}

export interface ServiceJobParameterLike {
  parameterName?: string;
  name?: string;
  parameterValue?: unknown;
  value?: unknown;
  [key: string]: unknown;
}

export interface ServiceJobLike {
  jobName?: string;
  parentJobName?: string;
  templateJobName?: string;
  sourceJobName?: string;
  clonedFromJobName?: string;
  paused?: unknown;
  isPaused?: unknown;
  isActive?: unknown;
  systemMessageRemoteId?: string;
  remoteId?: string;
  systemMessageTypeId?: string;
  messageTypeId?: string;
  parameters?: UnknownRecord | ServiceJobParameterLike[];
  serviceJobParameters?: ServiceJobParameterLike[];
  [key: string]: unknown;
}

export interface SystemMessageRemoteLike {
  systemMessageRemoteId?: string;
  remoteId?: string;
  shopifyRemoteId?: string;
  id?: string;
  internalId?: string;
  shopId?: string;
  [key: string]: unknown;
}

export function getServiceJobParameterMap(job: ServiceJobLike | null | undefined): Record<string, unknown> {
  const parameters: Record<string, unknown> = {};
  if (!job) return parameters;

  if (isRecord(job.parameters)) Object.assign(parameters, job.parameters);

  const parameterRows = [
    ...(Array.isArray(job.parameters) ? job.parameters : []),
    ...(Array.isArray(job.serviceJobParameters) ? job.serviceJobParameters : [])
  ];
  parameterRows.forEach((parameter) => {
    const name = firstText(parameter, ["parameterName", "name"]);
    if (name) parameters[name] = firstValue(parameter, ["parameterValue", "value"]);
  });
  return parameters;
}

function parameterText(job: ServiceJobLike, aliases: readonly string[]): string {
  const parameters = getServiceJobParameterMap(job);
  return firstText(parameters, aliases) || firstText(job, aliases);
}

export type SyncConfigurationStateKind =
  | "loading"
  | "error"
  | "missing"
  | "configured-paused"
  | "configured-active";

export interface SyncConfigurationState {
  kind: SyncConfigurationStateKind;
  configured: boolean;
  paused: boolean | null;
  error: unknown | null;
}

export function isServiceJobPaused(job: ServiceJobLike): boolean {
  if (job.isPaused !== undefined) return isTruthy(job.isPaused);
  if (job.paused !== undefined) return isTruthy(job.paused);
  if (job.isActive !== undefined) return !isTruthy(job.isActive);
  return false;
}

export function deriveSyncConfigurationState(input: {
  loading?: boolean;
  error?: unknown;
  job?: ServiceJobLike | null;
}): SyncConfigurationState {
  /**
   * An API failure is never collapsed into the actionable "missing" state — but the ABSENCE of a
   * failure has to be recognised, and the sync sessions spell that as `error: ""` (a string field
   * reset on every load), not `undefined`.
   *
   * The old guard was `!== undefined && !== null`, which an empty string passes. Every caller that
   * forwarded a session's `error` straight through therefore got `kind: "error"` permanently — so on
   * the Order Sync configure screen the create-job button, the schedule editor and the activation
   * review were dead code, and a fully configured active shop rendered as "Waiting for setup".
   * Found by QA driving the page live; one caller had been masking it locally with `|| undefined`.
   */
  const hasError = input.error !== undefined && input.error !== null
    && !(typeof input.error === "string" && input.error.trim() === "");
  if (hasError) {
    return { kind: "error", configured: false, paused: null, error: input.error };
  }
  if (input.loading) return { kind: "loading", configured: false, paused: null, error: null };
  if (!input.job) return { kind: "missing", configured: false, paused: null, error: null };

  const paused = isServiceJobPaused(input.job);
  return {
    kind: paused ? "configured-paused" : "configured-active",
    configured: true,
    paused,
    error: null
  };
}

export type OrderSyncMappingFamilyId = "sales-channel" | "payment-method" | "shipping-method";

export interface OrderSyncMappingFamilyReadiness {
  id: OrderSyncMappingFamilyId;
  mappedTypeId: "SHOPIFY_ORDER_SOURCE" | "SHOPIFY_PAYMENT_TYPE" | null;
  label: string;
  ready: boolean;
  count: number;
  blocking: false;
  warning: string | null;
}

export interface OrderSyncMappingReadiness {
  families: readonly [
    OrderSyncMappingFamilyReadiness,
    OrderSyncMappingFamilyReadiness,
    OrderSyncMappingFamilyReadiness
  ];
  allReady: boolean;
  hasWarnings: boolean;
  blocking: false;
  warnings: string[];
}

export interface OrderSyncMappingInput {
  selectedShopId?: string;
  typeMappings?: readonly UnknownRecord[];
  salesChannelMappings?: readonly unknown[] | number | boolean;
  paymentMethodMappings?: readonly unknown[] | number | boolean;
  shippingMethodMappings?: readonly unknown[] | number | boolean;
  shipmentMethodMappings?: readonly unknown[] | number | boolean;
}

function selectedShopRecords(records: readonly UnknownRecord[], selectedShopId?: string): UnknownRecord[] {
  const shopId = valueText(selectedShopId);
  if (!shopId) return [...records];
  return records.filter((record) => firstText(record, ["shopId", "internalId", "shopifyShopId"]) === shopId);
}

function readinessCount(value: readonly unknown[] | number | boolean | undefined): number {
  if (Array.isArray(value)) return value.length;
  if (value === true) return 1;
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

export function deriveOrderSyncMappingReadiness(input: OrderSyncMappingInput): OrderSyncMappingReadiness {
  const typeMappings = selectedShopRecords(input.typeMappings || [], input.selectedShopId);
  // A value-less row is a retired key, not a mapping — see `retireTypeMapping`.
  const mappedRowsOfType = (mappedTypeId: string) => typeMappings.filter((record) =>
    firstText(record, ["mappedTypeId", "mappingTypeId"]) === mappedTypeId && Boolean(firstText(record, ["mappedValue"])));
  const salesCount = input.salesChannelMappings === undefined
    ? mappedRowsOfType("SHOPIFY_ORDER_SOURCE").length
    : readinessCount(input.salesChannelMappings);
  const paymentCount = input.paymentMethodMappings === undefined
    ? mappedRowsOfType("SHOPIFY_PAYMENT_TYPE").length
    : readinessCount(input.paymentMethodMappings);
  const shippingInput = input.shippingMethodMappings ?? input.shipmentMethodMappings;
  const shippingRecords = Array.isArray(shippingInput)
    ? selectedShopRecords(shippingInput.filter(isRecord), input.selectedShopId)
    : shippingInput;
  const shippingCount = readinessCount(shippingRecords);

  const makeFamily = (
    id: OrderSyncMappingFamilyId,
    label: string,
    count: number,
    mappedTypeId: OrderSyncMappingFamilyReadiness["mappedTypeId"]
  ): OrderSyncMappingFamilyReadiness => ({
    id,
    label,
    mappedTypeId,
    ready: count > 0,
    count,
    blocking: false,
    warning: count > 0 ? null : `${label} mapping is missing.`
  });

  const families = [
    makeFamily("sales-channel", "Sales Channel", salesCount, "SHOPIFY_ORDER_SOURCE"),
    makeFamily("payment-method", "Payment Method", paymentCount, "SHOPIFY_PAYMENT_TYPE"),
    makeFamily("shipping-method", "Shipping Method", shippingCount, null)
  ] as const;
  const warnings = families.flatMap((family) => family.warning ? [family.warning] : []);

  return {
    families,
    allReady: warnings.length === 0,
    hasWarnings: warnings.length > 0,
    blocking: false,
    warnings
  };
}

export interface SystemMessageLike extends UnknownRecord {
  systemMessageId?: string;
  statusId?: string;
}

export interface DataManagerLogLike extends UnknownRecord {
  logId?: string;
  configId?: string;
  statusId?: string;
  totalRecordCount?: number | string;
  failedRecordCount?: number | string;
  successRecordCount?: number | string;
}

export type SyncProgressState = "pending" | "active" | "completed" | "partial" | "failed";

export interface SyncProgressRow {
  id: "batch-request" | "hotwax-import";
  label: string;
  state: SyncProgressState;
  stateLabel: string;
  totalRecords: number;
  successfulRecords: number;
  failedRecords: number;
  logCount: number;
  configIds: string[];
}

const SYSTEM_MESSAGE_COMPLETE = new Set(["smsgsent", "sent", "smsgconsumed", "consumed", "smsgconfirmed", "confirmed"]);
const FAILURE_TOKENS = ["fail", "error", "reject", "cancel", "crash"];
const COMPLETE_TOKENS = ["complete", "success", "finish", "processed", "consumed", "confirmed"];
// "active" means a transfer is in progress (Sending/Consuming). Staged states
// (Triggered/Produced/Received) intentionally fall through to "pending".
const ACTIVE_TOKENS = ["active", "running", "inprogress", "started", "processing", "sending", "consuming"];

function tokenIncludes(token: string, fragments: readonly string[]): boolean {
  return fragments.some((fragment) => token.includes(fragment));
}

function systemMessageProgressState(message: SystemMessageLike | null | undefined): SyncProgressState {
  if (!message) return "pending";
  const status = normalizeToken(firstValue(message, ["statusId", "status", "messageStatusId"]));
  if (tokenIncludes(status, FAILURE_TOKENS)) return "failed";
  if (SYSTEM_MESSAGE_COMPLETE.has(status) || tokenIncludes(status, ["consumed", "confirmed"])) return "completed";
  if (tokenIncludes(status, ACTIVE_TOKENS)) return "active";
  return "pending";
}

interface NormalizedLogOutcome {
  key: string;
  configId: string;
  state: SyncProgressState;
  total: number;
  successful: number;
  failed: number;
}

function normalizeLogOutcome(log: DataManagerLogLike): NormalizedLogOutcome {
  const configId = firstText(log, ["configId", "dataManagerConfigId", "configName"]);
  const logId = firstText(log, ["logId", "dataManagerLogId", "id"]);
  const total = numberValue(log, ["totalRecordCount", "recordCount", "totalRecords"]);
  const failed = numberValue(log, ["failedRecordCount", "errorRecordCount", "failedRecords"]);
  const explicitSuccessful = numberValue(log, ["successRecordCount", "successfulRecordCount", "processedRecordCount"]);
  const successful = explicitSuccessful || Math.max(total - failed, 0);
  const status = normalizeToken(firstValue(log, ["statusId", "status", "runStatusId"]));
  const hasFinish = Boolean(firstValue(log, ["finishDateTime", "finishedDateTime", "completedDate", "processedDate"]));
  let state: SyncProgressState;

  if (tokenIncludes(status, FAILURE_TOKENS)) state = successful > 0 ? "partial" : "failed";
  else if (failed > 0) state = successful > 0 ? "partial" : "failed";
  else if (tokenIncludes(status, COMPLETE_TOKENS) || hasFinish) state = "completed";
  else if (tokenIncludes(status, ACTIVE_TOKENS) || total > 0) state = "active";
  else state = "pending";

  return {
    key: logId || [
      configId || "unknown",
      firstText(log, ["systemMessageId", "createdByJobRunId", "jobRunId"]),
      firstText(log, ["contentId", "logContentId", "errorLogContentId"]),
      status,
      total,
      failed,
      firstText(log, ["finishDateTime", "finishedDateTime", "completedDate", "processedDate"])
    ].join(":"),
    configId,
    state,
    total: Math.max(total, successful + failed),
    successful,
    failed
  };
}

function progressLabel(state: SyncProgressState, successful: number, failed: number): string {
  if (state === "completed") return `Completed · ${successful} ${successful === 1 ? "order" : "orders"}`;
  if (state === "partial") return `Partially completed · ${successful} processed · ${failed} failed`;
  if (state === "failed") return failed ? `Failed · ${failed} ${failed === 1 ? "record" : "records"}` : "Failed";
  if (state === "active") return "In progress";
  return "Waiting";
}

export function deriveSyncProgress(
  systemMessage: SystemMessageLike | null | undefined,
  logs: readonly DataManagerLogLike[]
): readonly [SyncProgressRow, SyncProgressRow] {
  const batchState = systemMessageProgressState(systemMessage);
  const seenLogs = new Set<string>();
  const normalizedLogs = logs
    .map(normalizeLogOutcome)
    .filter((log) => {
      if (seenLogs.has(log.key)) return false;
      seenLogs.add(log.key);
      return true;
    });

  const totals = normalizedLogs.reduce((result, log) => ({
    total: result.total + log.total,
    successful: result.successful + log.successful,
    failed: result.failed + log.failed
  }), { total: 0, successful: 0, failed: 0 });

  let importState: SyncProgressState;
  if (!normalizedLogs.length) {
    importState = batchState === "completed" ? "completed" : batchState === "failed" ? "failed" : "pending";
  } else {
    const states = normalizedLogs.map((log) => log.state);
    const hasFailed = states.some((state) => state === "failed" || state === "partial");
    const hasActive = states.some((state) => state === "active" || state === "pending");
    const hasCompleted = states.some((state) => state === "completed" || state === "partial");

    if (hasActive) importState = "active";
    else if (hasFailed && (hasCompleted || totals.successful > 0)) importState = "partial";
    else if (hasFailed) importState = "failed";
    else importState = "completed";
  }

  const batchRow: SyncProgressRow = {
    id: "batch-request",
    label: "Shopify order batch request",
    state: batchState,
    stateLabel: progressLabel(batchState, 0, 0),
    totalRecords: 0,
    successfulRecords: 0,
    failedRecords: 0,
    logCount: 0,
    configIds: []
  };
  const importRow: SyncProgressRow = {
    id: "hotwax-import",
    label: "HotWax order import",
    state: importState,
    stateLabel: progressLabel(importState, totals.successful, totals.failed),
    totalRecords: totals.total,
    successfulRecords: totals.successful,
    failedRecords: totals.failed,
    logCount: normalizedLogs.length,
    configIds: [...new Set(normalizedLogs.map((log) => log.configId).filter(Boolean))]
  };

  return [batchRow, importRow];
}

export function deriveSyncOverallState(
  batchRow: Pick<SyncProgressRow, "state">,
  importRow: Pick<SyncProgressRow, "state">
): SyncProgressState {
  if (batchRow.state === "active" || batchRow.state === "pending") return batchRow.state;
  if (importRow.state === "active" || importRow.state === "pending") return "active";
  if (batchRow.state === "failed") {
    return importRow.state === "completed" || importRow.state === "partial" ? "partial" : "failed";
  }
  return importRow.state;
}

const AUDIT_TIMESTAMPS = ["processedDate", "processedAt", "completedDate", "createdDate", "createdStamp", "lastUpdatedStamp"] as const;

export interface SuccessfulOrderAuditLike extends UnknownRecord {}

export interface RecentProcessedOrder {
  id: string;
  shopId: string;
  shopifyOrderId: string;
  orderName: string;
  orderId: string;
  outcome: "Created" | "Updated";
  processedAt?: string | number;
  processedAtMillis: number;
  systemMessageId: string;
  configId: string;
  logId: string;
  shopifyFetchVerified: boolean;
}

function auditOutcome(row: ValueSource): RecentProcessedOrder["outcome"] | null {
  const configId = valueText(row?.configId);
  if (configId !== "SYNC_SHOPIFY_ORDER" && configId !== "UPDATE_SHOPIFY_ORDER") return null;
  const declaredOutcome = valueText(row?.outcome);
  return declaredOutcome === "Created" || declaredOutcome === "Updated" ? declaredOutcome : null;
}

export function normalizeRecentProcessedOrders(
  rows: readonly SuccessfulOrderAuditLike[],
  options: { limit?: number; shopId?: string } = {}
): RecentProcessedOrder[] {
  const selectedShopId = valueText(options.shopId);
  if (!selectedShopId) return [];

  const normalized = rows.flatMap((row, index): RecentProcessedOrder[] => {
    const shopId = valueText(row.shopId);
    const systemMessageId = valueText(row.systemMessageId);
    const configId = valueText(row.configId);
    const logId = firstText(row, ["logId", "dataManagerLogId"]);
    const outcome = auditOutcome(row);
    const shopifyFetchVerified = row.shopifyFetchVerified;
    if (
      shopId !== selectedShopId
      || !systemMessageId
      || !configId
      || !logId
      || !outcome
      || typeof shopifyFetchVerified !== "boolean"
    ) return [];

    const shopifyOrderId = valueText(row.shopifyOrderId);
    const processedAtMillis = timestampFrom(row, AUDIT_TIMESTAMPS);
    const explicitId = firstText(row, ["auditId", "shopifyOrderSyncAuditId", "id"]);
    const id = explicitId || [systemMessageId, configId, logId, shopifyOrderId, outcome, processedAtMillis || index].join(":");

    return [{
      id,
      shopId,
      shopifyOrderId,
      orderName: firstText(row, ["orderName", "shopifyOrderName", "name"]),
      orderId: firstText(row, ["orderId", "hotWaxOrderId", "internalOrderId"]),
      outcome,
      processedAt: originalTimestamp(row, AUDIT_TIMESTAMPS),
      processedAtMillis,
      systemMessageId,
      configId,
      logId,
      shopifyFetchVerified,
    }];
  });

  normalized.sort((a, b) => b.processedAtMillis - a.processedAtMillis || a.id.localeCompare(b.id));
  const seen = new Set<string>();
  return normalized.filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  }).slice(0, boundedLimit(options.limit));
}

const ERROR_TIMESTAMPS = [
  "errorDate",
  "failedDate",
  "processedDate",
  "finishDateTime",
  "finishedDateTime",
  "createdDate",
  "createdStamp",
  "lastUpdatedStamp"
] as const;

export interface OrderErrorSourceLike extends UnknownRecord {
  records?: readonly UnknownRecord[];
  errorRecords?: readonly UnknownRecord[];
  rows?: readonly UnknownRecord[];
}

export interface RecentOrderError {
  id: string;
  shopId: string;
  shopifyOrderId: string;
  orderName: string;
  errorText: string;
  occurredAt?: string | number;
  occurredAtMillis: number;
  configId: string;
  logId: string;
  systemMessageId: string;
  batchId: string;
  retryable: boolean;
}

function errorText(row: ValueSource): string {
  const value = firstValue(row, ["errorText", "errorMessage", "message", "errors", "error"]);
  if (Array.isArray(value)) return value.map(valueText).filter(Boolean).join(", ");
  if (isRecord(value)) {
    try {
      return JSON.stringify(value);
    } catch (_error) {
      return valueText(value);
    }
  }
  return valueText(value);
}

function childRecords(source: OrderErrorSourceLike): readonly UnknownRecord[] | null {
  if (Array.isArray(source.records)) return source.records;
  if (Array.isArray(source.errorRecords)) return source.errorRecords;
  if (Array.isArray(source.rows)) return source.rows;
  return null;
}

function explicitShopifyOrderId(record: ValueSource): string {
  return firstText(record, [
    "shopifyOrderId",
    "orderShopifyId",
    "Shopify order ID",
    "Shopify Order ID"
  ]);
}

function isResolvableShopifyOrderId(value: string): boolean {
  const match = /^(?:gid:\/\/shopify\/Order\/)?(\d{1,30})$/.exec(value);
  return Boolean(match && !/^0+$/.test(match[1]));
}

function stableErrorId(parts: readonly string[]): string {
  return parts.map((part) => encodeURIComponent(part || "-")).join("|");
}

export function normalizeRecentOrderErrors(
  sources: readonly OrderErrorSourceLike[],
  options: { limit?: number; shopId?: string } = {}
): RecentOrderError[] {
  const selectedShopId = valueText(options.shopId);
  const normalized: RecentOrderError[] = [];

  sources.forEach((source, sourceIndex) => {
    const records = childRecords(source) || [source];
    records.forEach((record, recordIndex) => {
      const shopId = firstText(record, ["shopId", "shopifyShopId", "internalId"]) || firstText(source, ["shopId", "shopifyShopId", "internalId"]);
      if (selectedShopId && shopId !== selectedShopId) return;

      const configId = firstText(record, ["configId", "dataManagerConfigId"]) || firstText(source, ["configId", "dataManagerConfigId"]);
      const logId = firstText(record, ["logId", "dataManagerLogId"]) || firstText(source, ["logId", "dataManagerLogId"]);
      const systemMessageId = firstText(record, ["systemMessageId", "messageId"]) || firstText(source, ["systemMessageId", "messageId"]);
      const batchId = firstText(record, ["batchId", "jobRunId", "createdByJobRunId"]) || firstText(source, ["batchId", "jobRunId", "createdByJobRunId"]);
      const shopifyOrderId = explicitShopifyOrderId(record);
      const message = errorText(record) || errorText(source);
      const occurredAtMillis = timestampFrom(record, ERROR_TIMESTAMPS) || timestampFrom(source, ERROR_TIMESTAMPS);
      const explicitId = firstText(record, ["errorId", "recordId", "id"]);
      const sourceRecordId = explicitId || [
        shopifyOrderId,
        message,
        occurredAtMillis || `${sourceIndex}.${recordIndex}`
      ].join(":");
      const id = stableErrorId([
        shopId,
        configId,
        logId,
        batchId,
        systemMessageId,
        sourceRecordId
      ]);

      normalized.push({
        id,
        shopId,
        shopifyOrderId,
        orderName: firstText(record, ["orderName", "shopifyOrderName", "name"]),
        errorText: message,
        occurredAt: originalTimestamp(record, ERROR_TIMESTAMPS) || originalTimestamp(source, ERROR_TIMESTAMPS),
        occurredAtMillis,
        configId,
        logId,
        systemMessageId,
        batchId,
        retryable: isResolvableShopifyOrderId(shopifyOrderId)
      });
    });
  });

  normalized.sort((a, b) => b.occurredAtMillis - a.occurredAtMillis || a.id.localeCompare(b.id));
  const seen = new Set<string>();
  return normalized.filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  }).slice(0, boundedLimit(options.limit));
}

function matchesQuery(values: readonly unknown[], query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  return values.some((value) => valueText(value).toLocaleLowerCase().includes(needle));
}

export function searchLoadedProcessedOrders(rows: readonly RecentProcessedOrder[], query: string): RecentProcessedOrder[] {
  return rows.filter((row) => matchesQuery([
    row.shopifyOrderId,
    row.orderName
  ], query));
}

export function searchLoadedOrderErrors(rows: readonly RecentOrderError[], query: string): RecentOrderError[] {
  return rows.filter((row) => matchesQuery([
    row.shopifyOrderId,
    row.orderName,
    row.errorText,
    row.systemMessageId,
    row.configId,
    row.logId,
    row.batchId
  ], query));
}

export type PermissionInput =
  | readonly string[]
  | ReadonlySet<string>
  | { permissions?: readonly string[] | ReadonlySet<string>; hasPermission?: (permissionId: string) => boolean }
  | null
  | undefined;

function hasPermission(input: PermissionInput, permissionId: string): boolean {
  if (!input) return false;
  if (Array.isArray(input)) return input.some((permission) => permission === permissionId);
  if (input instanceof Set) return input.has(permissionId);
  if (typeof input === "object" && "hasPermission" in input && typeof input.hasPermission === "function") {
    return input.hasPermission(permissionId);
  }
  if (typeof input === "object" && "permissions" in input) return hasPermission(input.permissions, permissionId);
  return false;
}

export interface SyncCapabilities {
  canMonitor: true;
  canConfigure: boolean;
  canActivate: boolean;
  canEditSchedule: boolean;
  canRunNow: boolean;
  canRetryIndividualOrder: boolean;
}

/**
 * The feature decides which permission grants admin, so a future feature can gate on its own id
 * without a second copy of this. Order sync stays the default because it is what every existing
 * caller means.
 */
export function getSyncCapabilities(
  permissions: PermissionInput,
  feature: ShopifySyncFeature = ORDER_SYNC_FEATURE,
): SyncCapabilities {
  const isAdmin = hasPermission(permissions, feature.adminPermission);
  return {
    canMonitor: true,
    canConfigure: isAdmin,
    canActivate: isAdmin,
    canEditSchedule: isAdmin,
    canRunNow: isAdmin,
    canRetryIndividualOrder: isAdmin
  };
}

/**
 * VIEW-MODEL layer for Order Sync — pure functions that turn raw entities into what a screen binds.
 *
 * Deliberately thin: every judgement about sync state is made by the derivations ABOVE in this same
 * file (`deriveSyncProgress`, `deriveSyncOverallState`), which are
 * unit-tested. These functions only compose those results and shape them for the template, so there
 * is exactly one place where "is this sync healthy" is decided.
 *
 * Nothing in this section touches a store, the network, or the cache — it takes entities and returns
 * view state, which is what lets the same derivations serve a cached read and a unit test unchanged.
 */

/** A batch request — one `ShopifyOrderSync` system message and the run that produced it. */
export interface OrderSyncBatchLike extends SystemMessageLike {
  systemMessageId?: string;
  createdByJobRunId?: string;
  initDate?: string | number;
  statusId?: string;
}

export interface OrderSyncSummary {
  /** The newest batch request, or undefined before the first one exists. */
  latestBatch?: OrderSyncBatchLike;
  /** The newest batch whose import finished — what "last completed" reports. */
  latestCompletedBatch?: OrderSyncBatchLike;
  /** [batch request, HotWax import] for the latest batch. */
  progressRows: readonly [SyncProgressRow, SyncProgressRow];
  /** State of the batch-request half. */
  batchStatus: SyncProgressState;
  /** Rolled-up state across both halves. */
  overallStatus: SyncProgressState;
  /** Batch requests not yet complete — the queue depth a user watches. */
  pendingBatchRequests: number;
  /** Orders successfully imported across the latest batch's logs. */
  processedOrderCount: number;
  lastCompletedAt?: string | number;
  nextRunTime?: Date | null;
}

const TERMINAL_STATES = new Set<SyncProgressState>(["completed", "partial", "failed"]);

/** Newest first by `initDate`; the entity carries no other ordering signal. */
function byInitDateDesc(a: OrderSyncBatchLike, b: OrderSyncBatchLike): number {
  return Number(b?.initDate ?? 0) - Number(a?.initDate ?? 0);
}

/**
 * The Order Sync monitoring summary.
 *
 * `importsBySystemMessageId` maps a batch to the DataManagerLogs it produced — the join the cached
 * reads perform locally. A batch with no logs yet is normal, not an error: the request exists before
 * the import starts, which is exactly the state the progress rows are designed to show.
 */
export function orderSyncSummary(
  batches: readonly OrderSyncBatchLike[] | null | undefined,
  importsBySystemMessageId: Record<string, readonly DataManagerLogLike[]> | null | undefined,
  job: ServiceJobLike | null | undefined,
  productStore: { defaultTimeZone?: string; timeZone?: string } | null | undefined,
): OrderSyncSummary {
  const ordered = [...(batches ?? [])].sort(byInitDateDesc);
  const imports = importsBySystemMessageId ?? {};
  const logsFor = (batch: OrderSyncBatchLike | undefined) =>
    (batch?.systemMessageId ? imports[String(batch.systemMessageId)] : undefined) ?? [];

  const latestBatch = ordered[0];
  const progressRows = deriveSyncProgress(latestBatch, logsFor(latestBatch));
  const [batchRow, importRow] = progressRows;
  const overallStatus = deriveSyncOverallState(batchRow, importRow);

  // A batch is "pending" until BOTH halves reach a terminal state — an imported-but-unconfirmed
  // batch is still work in flight from the operator's point of view.
  const pendingBatchRequests = ordered.filter((batch) => {
    const [batchHalf, importHalf] = deriveSyncProgress(batch, logsFor(batch));
    return !(TERMINAL_STATES.has(batchHalf.state) && TERMINAL_STATES.has(importHalf.state));
  }).length;

  const latestCompletedBatch = ordered.find((batch) => {
    const logs = logsFor(batch);
    /**
     * ⚠️ Requires at least one ACTUAL import log, not just an import state of "completed".
     *
     * `deriveSyncProgress` reports a consumed batch with ZERO import logs as import "completed"
     * (nothing was required, so nothing is outstanding — defensible for the progress row). But that
     * meant one zero-order run poisoned this headline: the newest batch matched the predicate, its
     * empty logs produced no `lastCompletedAt`, and the card claimed "No completed batch recorded"
     * for a shop whose real last completed import was days old and still cached. Observed live the
     * moment a queued run returned zero orders. "Last completed batch" means "last batch that
     * actually imported", which is also what the retired store computed.
     */
    if (!logs.length) return false;
    const [batchHalf, importHalf] = deriveSyncProgress(batch, logs);
    return TERMINAL_STATES.has(batchHalf.state) && importHalf.state === "completed";
  });

  const completedLogs = logsFor(latestCompletedBatch);
  const lastCompletedAt = completedLogs
    .map((log: any) => log?.finishDateTime ?? log?.completedDate ?? log?.processedDate)
    .filter(Boolean)
    .sort((a: any, b: any) => Number(b) - Number(a))[0];

  /**
   * "Orders processed" describes the last COMPLETED batch, not the newest one.
   *
   * Reading it off `importRow` (the newest batch) makes the headline number collapse to 0 the moment
   * a new request is produced, then climb back when its import lands — so on a shop syncing every few
   * minutes the card shows 0 most of the time. The number must stay on the last batch that actually
   * finished, which is what the deleted store did.
   */
  const completedProgress = deriveSyncProgress(latestCompletedBatch, completedLogs);

  return {
    latestBatch,
    latestCompletedBatch,
    progressRows,
    batchStatus: batchRow.state,
    overallStatus,
    pendingBatchRequests,
    processedOrderCount: completedProgress[1].successfulRecords,
    lastCompletedAt,
    nextRunTime: job?.cronExpression
      ? getNextSyncRun(job.cronExpression, {
          timeZone: productStore?.defaultTimeZone || productStore?.timeZone,
        })
      : null,
  };
}


/** True while the latest batch is still moving — drives the live/idle polling cadence and spinners. */
export function isOrderSyncBatchActive(summary: OrderSyncSummary | null | undefined): boolean {
  /**
   * NO BATCH IS NOT AN ACTIVE BATCH.
   *
   * `"pending"` is ambiguous: `deriveSyncProgress(undefined, [])` yields it for a shop that has never
   * run, exactly as it does for a genuinely queued request. Reading the state alone therefore called
   * every never-synced shop "active" — and since this drives the worker's cadence, the connection
   * page pinned order sync at its 10s poll permanently for every such shop, which is every shop that
   * has not yet used order sync. It also made "Run now" report "a batch request is already in
   * progress" when none existed.
   */
  if (!summary?.latestBatch) return false;
  const state = summary.overallStatus;
  return state === "active" || state === "pending";
}

/**
 * Whether "Run now" is available.
 *
 * Blocked when there is no job, the job is paused, or a batch is already in flight — triggering a
 * second run while one is active produces overlapping imports of the same orders.
 */
export function canRunOrderSyncNow(
  job: ServiceJobLike | null | undefined,
  batches: readonly OrderSyncBatchLike[] | null | undefined,
): boolean {
  if (!job?.jobName) return false;
  if (isServiceJobPaused(job)) return false;
  return !(batches ?? []).some((batch) => {
    const status = String(batch?.statusId ?? "").toLowerCase();
    return status.includes("produced") || status.includes("sending") || status.includes("triggered");
  });
}

/** Why "Run now" is unavailable — shown as the button's tooltip, so it must name one clear cause. */
export function orderSyncRunNowDisabledReason(
  capabilities: SyncCapabilities | null | undefined,
  job: ServiceJobLike | null | undefined,
  summary: OrderSyncSummary | null | undefined,
): string {
  if (!capabilities?.canRunNow) return "You do not have permission to run Order Sync.";
  if (!job?.jobName) return "Order Sync is not configured yet.";
  if (isServiceJobPaused(job)) return "Order Sync is paused.";
  if (isOrderSyncBatchActive(summary)) return "A batch request is already in progress.";
  return "";
}

/** Client-side order search over the already-loaded rows. */
export function filterRecentOrders<T extends Record<string, any>>(
  orders: readonly T[] | null | undefined,
  query: string,
): T[] {
  return searchLoadedProcessedOrders((orders ?? []) as any, query) as unknown as T[];
}

/**
 * The Order Sync summary card, as rendered on the Shopify connection details page.
 *
 * THE CONTRACT IS THE COMPONENT'S. `ShopifyOrderSyncCard.vue` imports this type rather than declaring
 * its own copy, so a field rename here is a compile error there instead of a silently blank row.
 */
export interface ShopifyOrderSyncCardSnapshot {
  shopId: string;
  configurationState: "missing" | "configured-paused" | "configured-active";
  subtitle?: string;
  processedCount: number;
  pendingCount: number;
  nextRunLabel?: string;
  lastCompletedLabel?: string;
  actionable: boolean;
  batchStatus: string;
  batchDetail: string;
  importStatus: string;
  importDetail: string;
  loading: boolean;
  error: string | null;
}

/**
 * Badge text per progress state.
 *
 * NOT `SyncProgressRow.stateLabel`, which the deleted store used: that reads
 * `"Completed · 5 orders"` — too long for a badge, and it carries the ` · ` separator this app's UI
 * conventions prohibit. The counts belong on the detail line, which is where they already are.
 *
 * The wording is also load-bearing for COLOUR: the card resolves a badge colour by matching this text
 * (`failed|error` → danger, `partial|paused` → warning, `completed|success` → success,
 * `active|processing|running` → primary). "Partially completed" must therefore keep the word
 * "partial", and is tested against exactly that.
 */
export const ORDER_SYNC_PROGRESS_BADGE_LABELS: Record<SyncProgressState, string> = {
  pending: "Waiting",
  active: "Processing",
  completed: "Completed",
  partial: "Partially completed",
  failed: "Failed",
};

export interface OrderSyncCardInput {
  shopId: string;
  summary: OrderSyncSummary;
  job?: ServiceJobLike | null;
  /** False until every cached table the summary joins has emitted — drives the card's skeleton. */
  hydrated?: boolean;
  error?: string | null;
  /**
   * Whether the shop itself resolved from the cache.
   *
   * Separate from `shopId`, which is only the ROUTE parameter. A route id with no matching cached
   * shop row still yields a non-empty `shopId`, so gating `actionable` on that alone produced a card
   * rendered as a button whose click handler — which reads the resolved row — silently returned.
   */
  shopResolved?: boolean;
}

/**
 * Build the card snapshot from an already-computed summary. PURE — no Vue, no cache, no requests.
 *
 * Reproduces the shape the card was built against when `store/shopifyOrderSync` still fed it
 * (`cardFromSummary`), so the two detail strings the component special-cases —
 * `"No batch request yet"` / `"No import yet"` and the `"N imports"` form — are emitted verbatim.
 */
export function orderSyncCardSnapshot(input: OrderSyncCardInput): ShopifyOrderSyncCardSnapshot {
  const { summary, job } = input;
  const [batchRow, importRow] = summary.progressRows;
  const paused = job ? isServiceJobPaused(job) : false;

  return {
    shopId: input.shopId,
    configurationState: !job ? "missing" : paused ? "configured-paused" : "configured-active",
    processedCount: summary.processedOrderCount,
    pendingCount: summary.pendingBatchRequests,
    nextRunLabel: paused
      ? "Paused"
      : summary.nextRunTime
        ? String(summary.nextRunTime)
        : undefined,
    lastCompletedLabel: summary.lastCompletedAt === undefined
      ? undefined
      : String(summary.lastCompletedAt),
    // The order-sync routes exist for every state — `missing` opens the configure screen, the rest
    // open monitoring — so the card is actionable once there is a RESOLVED shop to open it for.
    // `shopResolved` defaults to "the id is enough" only when the caller does not know better.
    actionable: Boolean(input.shopId) && input.shopResolved !== false,
    batchStatus: ORDER_SYNC_PROGRESS_BADGE_LABELS[batchRow.state],
    batchDetail: summary.latestBatch?.systemMessageId || "No batch request yet",
    importStatus: ORDER_SYNC_PROGRESS_BADGE_LABELS[importRow.state],
    importDetail: importRow.logCount
      ? `${importRow.logCount} import${importRow.logCount === 1 ? "" : "s"}`
      : "No import yet",
    loading: input.hydrated === false,
    error: input.error ?? null,
  };
}

/**
 * The Order Sync card for ONE shop, live from the cache — the order-sync twin of
 * `useShopifyProductSyncRunState`.
 *
 * SHOP-SCOPED AND STATELESS, which is the whole reason it exists rather than the card reusing
 * `useShopifyOrderSync()`. That composable is a module-level singleton keyed on `state.selectedShopId`,
 * written by the three order-sync screens through `resetForShop`; a card rendering `props.id` on the
 * connection details page cannot drive it without fighting whichever screen owns the session. Every
 * input below is already shop-parameterised, so the card just composes them itself and owns nothing.
 *
 * REACTIVE, so the card follows a shop switch and a new batch arriving with nothing to re-invoke and
 * no loading state between states. The page must activate order sync's class-A domains (see
 * `useShopifyConnectionSyncSession`), otherwise these tables are legitimately empty and the card
 * would report "no batch request yet" for a shop with a long history.
 *
 * Reads the same two windows `useShopifyOrderSync()` does — messages by remote, imports by config —
 * deliberately, rather than the shop-scoped `syncRun` spine that product sync uses. The card links
 * straight to the monitoring screen, and a card reporting "3 pending" over a page reporting "1" is a
 * worse failure than the shared-window limitation both then share. Moving order sync onto the spine
 * should move the card and the screen together.
 */
export function useShopifyOrderSyncCard(
  shopIdSource: ShopIdSource,
  options: { error?: MaybeRefOrGetter<string | null | undefined> } = {},
) {
  const ctx = useShopifySyncContext(shopIdSource);

  const { job, isPaused, isConfigured, hydrated: jobsHydrated } =
    useShopifySyncJob(ORDER_SYNC_FEATURE, ctx);

  const { records: batches, hydrated: messagesHydrated } =
    useShopifySyncMessages(ORDER_SYNC_FEATURE, ctx, { limit: SHOPIFY_ORDER_SYNC_RESULT_LIMIT });

  const { bySystemMessageId: importsBySystemMessageId, hydrated: importsHydrated } =
    useShopifySyncImports(ORDER_SYNC_FEATURE);

  /** Every table the join touches, for the same reason `useShopifySyncContext` gates on all three. */
  const hydrated = computed(() =>
    ctx.hydrated.value && jobsHydrated.value && messagesHydrated.value && importsHydrated.value);

  const summary = computed(() => orderSyncSummary(
    batches.value,
    importsBySystemMessageId.value,
    job.value,
    ctx.productStore.value,
  ));

  /** Drives the worker's fast cadence while a batch is moving. */
  const batchActive = computed(() => isOrderSyncBatchActive(summary.value));

  const snapshot = computed<ShopifyOrderSyncCardSnapshot>(() => orderSyncCardSnapshot({
    shopId: ctx.shopId.value,
    summary: summary.value,
    job: job.value,
    hydrated: hydrated.value,
    // Only once the tables have settled — before that "not found" is indistinguishable from
    // "not emitted yet", and treating it as unresolved would make the card briefly inert.
    shopResolved: !hydrated.value || Boolean(ctx.shop.value),
    error: toValue(options.error) ?? null,
  }));

  return {
    ...ctx,
    job, isPaused, isConfigured,
    batches, importsBySystemMessageId,
    summary, batchActive, snapshot, hydrated,
  };
}


/**
 * Shopify Order Sync — the local-first replacement for the 1,959-line `shopifyOrderSync` Pinia store.
 *
 * WHAT COMES FROM INDEXEDDB (reactive, zero requests): the shop, its product store, its
 * SystemMessageRemote, the sync ServiceJob and its template, the three mapping families, the batch
 * requests (`ShopifyOrderSync` system messages) and the imports those batches produced
 * (DataManagerLogs). Monitoring used to cost `admin/systemMessages` + a
 * `SYSTEM_MESSAGE_DATA_MANAGER_LOG` DataDocument + several context reads on every poll; all of it is
 * now a join over cached tables that the worker keeps current.
 *
 * WHAT STAYS LIVE (per-visit, uncacheable): Shopify order search (`shopify/graphql` — remote truth),
 * the `shopify/order-sync/{id}/history` projection, and the landmark dates in `admin/systemProperties`.
 *
 * MUTATIONS use GENERIC Moqui endpoints, not the bespoke `shopify/order-sync/*` surface. That whole
 * surface except `/history` is server-broken by one `hotwax`-null bug — `GET/PUT /job` and
 * `POST /retry` all return 400 `Cannot get property 'hotwax' on null object` (verified live
 * 2026-07-25/26 on shops 10000 and 10010). Schedule, status and run-now therefore go through
 * `admin/serviceJobs`, which is proven; `configure` and the retry/request paths remain blocked on a
 * backend contract and are documented as such at their call sites rather than silently failing.
 *
 * State is MODULE-LEVEL because three views and several modals share one monitoring session, which
 * is the semantic the store provided.
 */

const ORDER_SYNC_LANDMARK_PROPERTY_IDS = {
  launchDate: "newOrderSync.launchDate",
  historyLastSyncDate: "orderSyncHistory.lastSyncDate",
} as const;

export type LandmarkDateKey = keyof typeof ORDER_SYNC_LANDMARK_PROPERTY_IDS;

export type LandmarkDatesStatus = "idle" | "loading" | "ready" | "error";

export interface ShopLandmarkDates {
  status: LandmarkDatesStatus;
  launchDate: string;
  historyLastSyncDate: string;
  error: string | null;
}

const EMPTY_LANDMARK_DATES: ShopLandmarkDates = {
  status: "idle", launchDate: "", historyLastSyncDate: "", error: null,
};

/**
 * ⚠️ LANDMARK DATES ARE PER SHOP.
 *
 * `SystemProperty`'s primary key is (`systemResourceId`, `systemPropertyId`), and for these two
 * properties the resource id IS the shop id. Live on this instance:
 *
 *     10000  newOrderSync.launchDate        2026-06-11 01:40:57
 *     10000  orderSyncHistory.lastSyncDate  2026-04-14 03:12:45
 *     10010  newOrderSync.launchDate        2026-06-11 02:04:04
 *
 * The previous reader took `rows.find(r => r.systemPropertyId === id)` — the FIRST row with that
 * property id, whichever shop it belonged to. On shop 10010's page that displayed shop 10000's launch
 * date, and the writer sent no `systemResourceId` at all, so saving from one shop's screen did not
 * address that shop's row. Both are fixed by keying everything on the shop.
 */
const landmarkState = reactive({
  status: "idle" as LandmarkDatesStatus,
  error: null as string | null,
  /** shopId → that shop's two dates. Every shop arrives in the one request. */
  byShopId: {} as Record<string, { launchDate: string; historyLastSyncDate: string }>,
});

/**
 * The in-flight promise is memoised, not just the result, so two screens mounting in the same tick
 * share ONE request rather than racing. A successful load is never repeated; a failed one is
 * retryable. Only a write invalidates it, and a write updates the state directly rather than
 * re-reading — see `saveLandmarkDate`.
 */
let landmarkDatesRequest: Promise<void> | null = null;

// Module state survives an SPA logout — without this, user B reads user A's landmark dates.
onSessionCleared(() => {
  landmarkDatesRequest = null;
  landmarkState.status = "idle";
  landmarkState.error = null;
  landmarkState.byShopId = {};
});

async function fetchLandmarkDates(): Promise<void> {
  landmarkState.status = "loading";
  try {
    const resp: any = await api({
      url: "admin/systemProperties",
      method: "get",
      params: {
        systemPropertyId: Object.values(ORDER_SYNC_LANDMARK_PROPERTY_IDS),
        systemPropertyId_op: "in",
        pageSize: 100,
      },
    });
    const rows: any[] = Array.isArray(resp?.data) ? resp.data : resp?.data?.systemPropertyList ?? [];

    // One pass, grouped by the shop the row belongs to. Every shop's dates land in one request, which
    // is why switching shops never costs another.
    const byShopId: Record<string, { launchDate: string; historyLastSyncDate: string }> = {};
    for (const row of rows) {
      const shopId = String(row?.systemResourceId ?? "").trim();
      if (!shopId) continue;
      const bucket = (byShopId[shopId] ||= { launchDate: "", historyLastSyncDate: "" });
      const value = String(row?.systemPropertyValue ?? "");
      if (row?.systemPropertyId === ORDER_SYNC_LANDMARK_PROPERTY_IDS.launchDate) bucket.launchDate = value;
      if (row?.systemPropertyId === ORDER_SYNC_LANDMARK_PROPERTY_IDS.historyLastSyncDate) bucket.historyLastSyncDate = value;
    }

    landmarkState.byShopId = byShopId;
    landmarkState.status = "ready";
    landmarkState.error = null;
  } catch (error: any) {
    landmarkState.status = "error";
    landmarkState.error = error?.message ?? "failed";
    landmarkDatesRequest = null; // retryable
    throw error;
  }
}

/** Idempotent: the first caller fetches, everyone after reuses the resolved state. */
function ensureLandmarkDates(): Promise<void> {
  landmarkDatesRequest ||= fetchLandmarkDates().catch(() => undefined);
  return landmarkDatesRequest;
}

/**
 * Write one shop's landmark date, then fold the new value into local state.
 *
 * `systemResourceId` is REQUIRED: without it the write does not address this shop's row. On success
 * the state is updated in place rather than re-fetched — the server was just told the value, so
 * asking it back is a wasted round trip.
 */
async function saveLandmarkDate(shopId: string, key: LandmarkDateKey, value: string): Promise<void> {
  const systemPropertyId = ORDER_SYNC_LANDMARK_PROPERTY_IDS[key];
  if (!systemPropertyId) throw new Error("Unknown landmark date.");
  if (!shopId) throw new Error("Select a Shopify shop before setting a landmark date.");

  await api({
    url: "admin/systemProperties",
    method: "put",
    data: { systemResourceId: shopId, systemPropertyId, systemPropertyValue: value },
  });

  const bucket = (landmarkState.byShopId[shopId] ||= { launchDate: "", historyLastSyncDate: "" });
  bucket[key] = value;
  landmarkState.status = "ready";
  landmarkState.error = null;
}

/**
 * One shop's landmark dates — fetched once per session, served from state thereafter.
 *
 * A composable function with its own state: no store, no props threading, and no per-screen copy.
 * Both order-sync screens call this and share the single load.
 */
export function useOrderSyncLandmarkDates(shopIdSource: ShopIdSource) {
  const shopId = computed(() => String(toValue(shopIdSource) ?? ""));

  const landmarkDates = computed<ShopLandmarkDates>(() => {
    const dates = landmarkState.byShopId[shopId.value];
    return {
      status: landmarkState.status,
      error: landmarkState.error,
      launchDate: dates?.launchDate ?? "",
      historyLastSyncDate: dates?.historyLastSyncDate ?? "",
    };
  });

  return {
    landmarkDates,
    /** Load once for the whole session. Safe to call on every view entry. */
    load: () => ensureLandmarkDates(),
    save: (key: LandmarkDateKey, value: string) => saveLandmarkDate(shopId.value, key, value),
    EMPTY_LANDMARK_DATES,
  };
}

export interface ShopifyOrderSyncBatch extends Record<string, any> {
  systemMessageId?: string;
  systemMessageTypeId?: string;
  systemMessageRemoteId?: string;
  statusId?: string;
  initDate?: string | number;
  createdByJobRunId?: string;
}

export interface ShopifyOrderSyncImport extends Record<string, any> {
  logId?: string;
  configId?: string;
  statusId?: string;
  systemMessageId?: string;
  totalRecordCount?: number;
  failedRecordCount?: number;
  successRecordCount?: number;
  startDateTime?: string | number;
  finishDateTime?: string | number;
}

export interface ShopifyOrderSyncRecentOrder extends Record<string, any> {}
export interface ShopifyOrderSyncSearchResult extends Record<string, any> {}

/** Shared monitoring session state — the store's non-entity fields. */
const state = reactive({
  selectedShopId: "",
  runtimeTimeZone: "",
  loading: false,
  monitoringRefreshing: false,
  monitoringLoadedAt: null as number | null,
  monitoringError: "" as string,
  error: "" as string,
  activeMutation: "" as string,
  lastRunResult: null as any,
  recentOrders: [] as ShopifyOrderSyncRecentOrder[],
  recentErrors: [] as any[],
  recentRequestErrors: [] as any[],
  recentAudits: [] as any[],
});

export function useShopifyOrderSync() {
  const { updateJob, runNow: runJobNow } = useServiceJob();

  // ---------------------------------------------------------------------------------------------
  // Cached entity reads — every one of these comes from the shared sync core (section 3)
  // ---------------------------------------------------------------------------------------------

  const ctx = useShopifySyncContext(() => state.selectedShopId);
  const { shop, productStore, remote, remoteId } = ctx;

  const {
    templateJob, job, configurationState,
    /**
     * Use THESE, never `job.paused`. The cached row carries the Moqui string `"N"`, which is
     * JS-truthy — `job.paused ? "Paused" : "Active"` reports an active job as paused, which is
     * exactly what the monitoring screen did. `isServiceJobPaused` handles the `Y`/`N`/`isActive`
     * spellings and is unit-tested.
     */
    isPaused, isConfigured,
  } = useShopifySyncJob(ORDER_SYNC_FEATURE, ctx, {
    loading: () => state.loading,
    error: () => state.monitoringError || undefined,
  });

  /** Batch requests = this remote's `ShopifyOrderSync` messages, newest first. */
  const { records: batches, hydrated } = useShopifySyncMessages(ORDER_SYNC_FEATURE, ctx, {
    limit: SHOPIFY_ORDER_SYNC_RESULT_LIMIT,
  });

  /** Historical alias: order sync's only message type IS its batch request. */
  const systemMessages = batches;

  const { bySystemMessageId: importsBySystemMessageId, failed: failedDataManagerLogs } =
    useShopifySyncImports(ORDER_SYNC_FEATURE);

  const {
    salesChannelMappings, paymentMethodMappings, shippingMethodMappings,
    readiness: mappingReadiness,
  } = useShopifySyncMappings(() => state.selectedShopId);

  // Landmark dates own their own state and their own load-once rule; this screen just reads them.
  const { landmarkDates, load: loadLandmarkDates, save: saveLandmark } =
    useOrderSyncLandmarkDates(() => state.selectedShopId);

  // ---------------------------------------------------------------------------------------------
  // Session control
  // ---------------------------------------------------------------------------------------------

  function resetForShop(shopId: string) {
    state.selectedShopId = shopId;
    state.monitoringError = "";
    state.error = "";
    state.lastRunResult = null;
    state.recentOrders = [];
    state.recentErrors = [];
    state.recentRequestErrors = [];
    state.recentAudits = [];
  }

  /**
   * Bind the session to a shop.
   *
   * The entity reads above are reactive cache queries, so there is nothing to fetch here — this only
   * records which shop is selected and pulls the two genuinely live pieces. The screen renders from
   * cache immediately, which is why no skeleton is needed on a revisit.
   */
  async function loadMonitoring(shopId: string) {
    if (state.selectedShopId !== shopId) resetForShop(shopId);
    state.loading = !state.monitoringLoadedAt;
    state.monitoringRefreshing = true;
    try {
      await Promise.all([loadHistory(shopId), loadLandmarkDates()]);
      state.monitoringLoadedAt = Date.now();
      state.monitoringError = "";
    } catch (error: any) {
      state.monitoringError = error?.message || "Failed to load Order Sync monitoring.";
      logger.error("Order Sync monitoring failed", error);
    } finally {
      state.loading = false;
      state.monitoringRefreshing = false;
    }
  }

  /** Configuration needs no fetch: job, template, remote and mappings are all cached. */
  async function loadConfiguration(shopId: string) {
    if (state.selectedShopId !== shopId) resetForShop(shopId);
    await loadLandmarkDates();
  }

  /**
   * The processed-order history.
   *
   * `shopify/order-sync/{shopId}/history` is the ONE bespoke endpoint that works, and it is a
   * projection with no generic equivalent, so it stays live.
   */
  async function loadHistory(shopId: string) {
    try {
      const resp: any = await api({
        url: `shopify/order-sync/${encodeURIComponent(shopId)}/history`,
        method: "get",
        params: { pageSize: SHOPIFY_ORDER_SYNC_RESULT_LIMIT },
      });
      const rows = resp?.data?.orderSyncHistory ?? resp?.orderSyncHistory ?? [];
      state.recentOrders = normalizeRecentProcessedOrders(rows) as any[];
      state.recentAudits = state.recentOrders;
    } catch (error) {
      logger.error("Failed to load Order Sync history", error);
      state.recentOrders = [];
      state.recentAudits = [];
    }
  }

  async function refresh() {
    if (state.selectedShopId) await loadMonitoring(state.selectedShopId);
  }

  // ---------------------------------------------------------------------------------------------
  // Mutations — GENERIC endpoints only (see the module note on the broken bespoke surface)
  // ---------------------------------------------------------------------------------------------

  async function withMutation<T>(kind: string, run: () => Promise<T>): Promise<T> {
    if (state.activeMutation) throw new Error("Another Order Sync change is already in progress.");
    state.activeMutation = kind;
    state.error = "";
    try {
      return await run();
    } catch (error: any) {
      state.error = error?.message || `Failed to ${kind}.`;
      throw error;
    } finally {
      state.activeMutation = "";
    }
  }

  /**
   * Resolve the job a mutation must target, for an EXPLICIT shop when the caller names one.
   *
   * The callers all capture a `targetShopId` before awaiting and re-check it afterwards, because the
   * user can switch shops mid-request. Without honouring that id here the mutation would apply to
   * whatever `state.selectedShopId` happens to be when it runs — a wrong-shop write in exactly the
   * race the caller is guarding against.
   */
  function resolveJobName(shopId?: string): string {
    // REFUSE rather than guess. An order-sync job is matched by REMOTE, not by shop id, so resolving
    // one for a shop other than the bound session's would need that shop's remote resolved too —
    // and getting it wrong means writing a cron or a pause to another shop's job. Callers pass their
    // captured target id precisely to detect this race, so surfacing it is the intended outcome.
    if (shopId && shopId !== state.selectedShopId) {
      throw new Error("The selected Shopify shop changed before the Order Sync change completed.");
    }
    const jobName = job.value?.jobName;
    if (!jobName) throw new Error("Configure the selected shop's Order Sync job first.");
    return String(jobName);
  }

  /**
   * The job as the CALLER needs to see it after a write.
   *
   * `api()` resolves to a raw `AxiosResponse`, so returning it directly gave every caller
   * `resp.jobName === undefined`. The configure screen verifies a write landed on the job it meant to
   * change (`String(updatedJob?.jobName || "") !== targetJobName`), so an undefined name made that
   * guard fire on EVERY successful save — the schedule was written and the screen still reported
   * "the selected Order Sync job changed before the update completed". Returning the merged job makes
   * the guard test what it was written to test.
   */
  function jobResultFrom(resp: any, jobName: string, applied: Record<string, unknown>) {
    const payload = resp?.data ?? {};
    const body = payload?.jobDetail ?? payload;
    return { shopId: state.selectedShopId, jobName, ...body, ...applied };
  }

  /**
   * `PUT admin/serviceJobs/{jobName}` — proven live; the bespoke `/job` PUT returns 400.
   *
   * Refreshes the cached `serviceJob` row afterwards. `serviceJob` is a class-B domain that snapshots
   * ONCE per login, so without this the write lands on the server while every screen reading cached
   * job state — this one, the monitoring screen, the connection card — keeps rendering the old cron
   * and paused flag until the next login.
   */
  const updateSchedule = (cronExpression: string, shopId?: string) => withMutation("schedule", async () => {
    const jobName = resolveJobName(shopId);
    const cron = cronExpression.trim();
    if (!cron) throw new Error("A cron expression is required.");
    const resp = await updateJob({ jobName, cronExpression: cron });
    await refreshAfterMutation("serviceJob", { jobName });
    return jobResultFrom(resp, jobName, { cronExpression: cron });
  });

  /** Same generic mechanism, same cache refresh, as the schedule change. */
  const updateJobStatus = (paused: boolean, shopId?: string) => withMutation("status", async () => {
    const jobName = resolveJobName(shopId);
    const resp = await updateJob({ jobName, paused: paused ? "Y" : "N" });
    await refreshAfterMutation("serviceJob", { jobName });
    // `paused` is echoed as the BOOLEAN the caller passed, not Moqui's "Y"/"N" — the activation guard
    // tests `updatedJob?.paused !== false`, which "N" (truthy) would fail.
    return jobResultFrom(resp, jobName, { paused });
  });

  /** `POST admin/serviceJobs/{jobName}/runNow` — already generic. */
  const runNow = (options: { shopId?: string } = {}) => withMutation("run-now", async () => {
    const jobName = resolveJobName(options.shopId);
    const resp: any = await runJobNow(jobName);
    // Unwrapped for the same reason as the job writes: the caller reads `systemMessageId`/`jobRunId`
    // off this to link the queued run, and both live under `data`.
    const result = { jobName, ...(resp?.data ?? {}) };
    state.lastRunResult = result;
    return result;
  });

  /** `shopId` is the caller's captured target — checked, not used, for the reason in `assertShop`. */
  const setLandmarkDate = (input: { key: LandmarkDateKey; value: string; shopId?: string }) =>
    withMutation("landmark", () => {
      assertShop(input.shopId);
      return saveLandmark(input.key, input.value);
    });

  /** Same shop-race check the job mutations make, for the reads and writes that are not job-scoped. */
  function assertShop(shopId?: string) {
    if (shopId && shopId !== state.selectedShopId) {
      throw new Error("The selected Shopify shop changed before the Order Sync request completed.");
    }
  }

  /**
   * Shopify order search — remote truth, never cached.
   *
   * `pageInfo` is SPREAD into the result as well as nested. Callers read `hasNextPage`/`endCursor`
   * straight off the returned object to drive their paging loop, and nesting them only under
   * `pageInfo` left both undefined — a search silently stopped after its first page.
   */
  async function searchShopifyOrders(
    input: { queryString: string; after?: string; pageSize?: number; shopId?: string },
  ) {
    assertShop(input.shopId);
    const systemMessageRemoteId = remoteId.value;
    if (!systemMessageRemoteId) throw new Error("The selected Shopify shop remote is unavailable.");
    const resp: any = await api({
      url: "shopify/graphql",
      method: "post",
      data: {
        systemMessageRemoteId,
        queryText: ORDER_SEARCH_QUERY,
        variables: { query: input.queryString, first: input.pageSize ?? 25, after: input.after ?? null },
      },
    });
    // The live proxy wraps the GraphQL body under `response` (same envelope as
    // `fetchUnsyncedProductUpdateCount`); a raw GraphQL reply nests it under `data`. Missing the
    // `response` branch made every search return [] against the real backend — found by QA driving
    // the modal live, while the `data`-shaped unit fixtures kept passing.
    const payload = resp?.data?.response ?? resp?.data?.data ?? resp?.data ?? {};
    const edges = payload?.orders?.edges ?? [];
    const pageInfo = payload?.orders?.pageInfo ?? null;
    return {
      orders: edges.map((edge: any) => edge?.node).filter(Boolean) as any[],
      pageInfo,
      hasNextPage: Boolean(pageInfo?.hasNextPage),
      endCursor: (pageInfo?.endCursor ?? null) as string | null,
    };
  }

  /**
   * Targeted order retry — the WINDOW-REPLAY alternate to the broken bespoke endpoint.
   *
   * `POST shopify/order-sync/{shopId}/retry` 400s (`Cannot get property 'hotwax' on null object`,
   * verified live 2026-07-26), and the generic surface has no message-production route either:
   * `POST admin/systemMessages` and `admin/systemMessages/produce` both 405, and `runNow` ignores
   * body parameter overrides (all probed live 2026-07-27). What IS proven live (run M2399240 →
   * message M228628): the job's `fromDate` PARAMETER drives the sync window, `[fromDate, now]`.
   *
   * So a targeted retry becomes a WINDOW import: swap `fromDate` to just before the oldest selected
   * order's `updatedAt`, run the job once, restore the parameter. Orders inside the window that were
   * not selected re-import too — the import is idempotent, so the over-coverage is harmless — which
   * is why these mutations report one covering RUN, not per-order queue ids.
   */

  /** `yyyy-MM-dd HH:mm:ss`, read as UTC — the only timestamp format the job runner accepts (ISO
   * errored live: `Timestamp format must be yyyy-mm-dd hh:mm:ss[.fffffffff]`, run M2399238). */
  function toJobTimestamp(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) throw new Error("A valid from date is required to replay orders.");
    return date.toISOString().slice(0, 19).replace("T", " ");
  }

  /**
   * The primitive every retry path composes: PUT the job's parameter set with `fromDate` swapped in,
   * run the job once, restore the original set.
   *
   * The COMPLETE current set is re-sent rather than a one-parameter patch: merge-vs-replace semantics
   * of `serviceJobParameters` on the PUT are undocumented, and the full-set shape is the one proven
   * live. The restore runs in `finally` so a failed run cannot leave a stale window pinned to the
   * job. Known race: if the job's cron fires between swap and restore (~2s against a >=5-minute
   * cron), that scheduled run imports the replay window too — idempotent, so at worst a duplicate
   * import of the same orders.
   */
  async function replayWindow(fromDateIso: string, shopId?: string) {
    const jobName = resolveJobName(shopId);
    const currentParameters: any[] = Array.isArray(job.value?.serviceJobParameters)
      ? job.value.serviceJobParameters
      : [];
    const baseline = currentParameters.map((parameter: any) => ({
      parameterName: parameter.parameterName,
      parameterValue: parameter.parameterValue ?? null,
    }));
    // REFUSE on a parameter-less row rather than PUT a lone `fromDate`: if the PUT replaces the whole
    // set, that write would strip the remote/type parameters and orphan the job from its shop.
    if (!baseline.some((parameter) => parameter.parameterName === "systemMessageRemoteId" && parameter.parameterValue)) {
      throw new Error("The Order Sync job's parameters are unavailable. Refresh and try again.");
    }
    if (!baseline.some((parameter) => parameter.parameterName === "fromDate")) {
      baseline.push({ parameterName: "fromDate", parameterValue: null });
    }
    const swapped = baseline.map((parameter) =>
      parameter.parameterName === "fromDate"
        ? { ...parameter, parameterValue: toJobTimestamp(fromDateIso) }
        : parameter);
    await updateJob({ jobName, serviceJobParameters: swapped });
    try {
      const resp: any = await runJobNow(jobName);
      const result = { jobName, fromDate: fromDateIso, ...(resp?.data ?? {}) };
      state.lastRunResult = result;
      return result;
    } finally {
      await updateJob({ jobName, serviceJobParameters: baseline });
      await refreshAfterMutation("serviceJob", { jobName });
    }
  }

  /** Replay every order the shop changed since `fromDate` (ISO). The replay-modal path. */
  const replayOrdersFromDate = (input: { fromDate: string; shopId?: string }) =>
    withMutation("replay-orders", () => replayWindow(input.fromDate, input.shopId));

  const requestSelectedOrders = (input: {
    orders: Array<{ legacyResourceId?: string; id?: string; updatedAt?: string; createdAt?: string }>;
    shopId?: string;
  }) =>
    withMutation("request-orders", async () => {
      assertShop(input.shopId);
      const orders = (input.orders ?? []).filter((order) => order.legacyResourceId || order.id);
      if (!orders.length) throw new Error("Select at least one Shopify order to request.");
      const stamps = orders
        .map((order) => Date.parse(order.updatedAt || order.createdAt || ""))
        .filter((stamp) => !Number.isNaN(stamp));
      if (!stamps.length) {
        throw new Error("The selected Shopify orders are missing their update dates. Search again and retry.");
      }
      // One minute of cushion so a subsecond-truncated `updatedAt` cannot fall outside the window.
      const run = await replayWindow(new Date(Math.min(...stamps) - 60_000).toISOString(), input.shopId);
      return {
        queued: orders.map((order) => ({
          shopifyOrderId: String(order.legacyResourceId || order.id),
          jobRunId: run.jobRunId,
        })),
        failedOrderIds: [] as string[],
        ...run,
      };
    });

  /** `errorId` is accepted for caller compatibility; the window mechanism has no use for it. */
  const retryIndividualOrder = (input: { errorId?: string; shopifyOrderId: string; shopId?: string }) =>
    withMutation("retry-order", async () => {
      assertShop(input.shopId);
      const search = await searchShopifyOrders({
        queryString: `id:${input.shopifyOrderId}`,
        pageSize: 5,
        shopId: input.shopId,
      });
      const order = search.orders.find(
        (candidate: any) => String(candidate.legacyResourceId ?? "") === String(input.shopifyOrderId),
      ) ?? search.orders[0];
      if (!order) {
        throw new Error(`Shopify order ${input.shopifyOrderId} was not found on the connected shop.`);
      }
      const basis = Date.parse(order.updatedAt || order.createdAt || "");
      if (Number.isNaN(basis)) {
        throw new Error(`Shopify order ${input.shopifyOrderId} is missing its update date.`);
      }
      const run = await replayWindow(new Date(basis - 60_000).toISOString(), input.shopId);
      return { shopifyOrderId: input.shopifyOrderId, ...run };
    });

  /** ⚠️ Also blocked: wraps the same broken `/job` resource. See the module note. */
  const configure = (input: { shopId?: string } = {}) => withMutation("configure", async () => {
    assertShop(input.shopId);
    const shopId = state.selectedShopId;
    // Generic clone + parameters — the bespoke `POST shopify/order-sync/{id}/job` is broken on the
    // backend (400, verified live). See `configureOrderSyncJob` for the full story.
    return configureOrderSyncJob({ shopId, systemMessageRemoteId: remoteId.value });
  });

  async function suggestOldestOrderDate(): Promise<string> {
    return landmarkDates.value.launchDate || "";
  }

  const filteredErrors = (query: string) => searchLoadedOrderErrors(state.recentErrors as any, query);

  /**
   * Returned as ONE `reactive` object so callers keep store-style access — `orderSync.job`,
   * `orderSync.loading` — with reactivity intact.
   *
   * `reactive()` unwraps refs and computeds on property access, which `{ ...state }` does NOT: a
   * spread copies primitives by value and the caller would silently read a frozen snapshot of
   * `loading`/`error`. `toRefs` keeps the session fields live through the wrapper.
   */
  return reactive({
    // session state
    ...toRefs(state),
    hydrated,
    // cached entities
    shop, productStore, remote, job, templateJob, isPaused, isConfigured, landmarkDates,
    batches, systemMessages, importsBySystemMessageId, failedDataManagerLogs,
    salesChannelMappings, paymentMethodMappings, shippingMethodMappings,
    mappingReadiness, configurationState,
    // session control
    resetForShop, loadMonitoring, loadConfiguration, loadHistory, refresh, suggestOldestOrderDate,
    // mutations
    updateSchedule, updateJobStatus, runNow, setLandmarkDate,
    searchShopifyOrders, requestSelectedOrders, retryIndividualOrder, replayOrdersFromDate, configure,
    filteredErrors,
  });
}



const ORDER_SEARCH_QUERY = `
  query OrderSyncOrderSearch($query: String!, $first: Int!, $after: String) {
    orders(query: $query, first: $first, after: $after, sortKey: CREATED_AT, reverse: true) {
      edges {
        node { id legacyResourceId name createdAt updatedAt displayFulfillmentStatus displayFinancialStatus
          customer { displayName } totalPriceSet { shopMoney { amount currencyCode } } }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

// =============================================================================================
// 6. Order sync — schedule (cron) logic
// =============================================================================================

/**
 * Order Sync SCHEDULE logic — cron validation, presets, previews and dirty-checking.
 *
 * Lives in `composables/` with the rest of the Order Sync function rather than in a `utils/` module:
 * this app centralises domain logic per composable, so a screen imports one place for a domain.
 * Everything here is pure and Vue-free, which is what lets the schedule editor and its unit tests
 * share it unchanged.
 */
import { CronExpressionParser } from "cron-parser";
import cronstrue from "cronstrue";
import Actions from "@/authorization/actions";

export const SYNC_SCHEDULE_PRESETS = [
  { id: "every-15-minutes", label: "Every 15 minutes", expression: "0 */15 * ? * *" },
  { id: "every-30-minutes", label: "Every 30 minutes", expression: "0 */30 * ? * *" },
  { id: "every-hour", label: "Every hour", expression: "0 0 * ? * *" },
  { id: "daily-at-midnight", label: "Every day at midnight", expression: "0 0 0 ? * *" }
] as const;

export type SyncSchedulePreset = typeof SYNC_SCHEDULE_PRESETS[number];

export type SyncCronValidationCode =
  | "required"
  | "field-count"
  | "invalid-time-zone"
  | "invalid-expression";

export interface SyncCronOptions {
  timeZone?: string;
}

export interface SyncNextRunOptions extends SyncCronOptions {
  currentDate?: Date;
}

export interface SyncCronValidation {
  valid: boolean;
  normalizedExpression: string;
  timeZone: string;
  code: SyncCronValidationCode | null;
  message: string | null;
  /**
   * Whether cron-parser can calculate a local next-run preview for this
   * structurally valid Quartz expression. OMS still validates every saved
   * expression with Moqui's cron-utils Quartz parser.
   */
  previewSupported: boolean;
}

export interface SyncScheduleState {
  cronExpression: string | null | undefined;
  active: boolean;
}

const QUARTZ_CRON_MIN_FIELD_COUNT = 6;
const QUARTZ_CRON_MAX_FIELD_COUNT = 7;

const MONTH_ALIASES: Readonly<Record<string, number>> = {
  JAN: 1,
  FEB: 2,
  MAR: 3,
  APR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AUG: 8,
  SEP: 9,
  OCT: 10,
  NOV: 11,
  DEC: 12
};

const DAY_OF_WEEK_ALIASES: Readonly<Record<string, number>> = {
  SUN: 1,
  MON: 2,
  TUE: 3,
  WED: 4,
  THU: 5,
  FRI: 6,
  SAT: 7
};

interface QuartzFieldDefinition {
  min: number;
  max: number;
  aliases?: Readonly<Record<string, number>>;
  strictRangeOrder?: boolean;
}

const QUARTZ_FIELD_DEFINITIONS = [
  { min: 0, max: 59 },
  { min: 0, max: 59 },
  { min: 0, max: 23 },
  { min: 1, max: 31 },
  { min: 1, max: 12, aliases: MONTH_ALIASES },
  { min: 1, max: 7, aliases: DAY_OF_WEEK_ALIASES },
  { min: 1970, max: 2099, strictRangeOrder: true }
] as const satisfies readonly QuartzFieldDefinition[];

function getDefaultTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function getTimeZone(timeZone?: string): string {
  return timeZone?.trim() || getDefaultTimeZone();
}

function isValidTimeZone(timeZone: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone }).format(new Date(0));
    return true;
  } catch (_error) {
    return false;
  }
}

function parseQuartzFieldValue(value: string, definition: QuartzFieldDefinition): number | null {
  const alias = definition.aliases?.[value.toUpperCase()];
  if (alias !== undefined) return alias;
  if (!/^\d+$/.test(value)) return null;

  const numericValue = Number(value);
  return Number.isSafeInteger(numericValue)
    && numericValue >= definition.min
    && numericValue <= definition.max
    ? numericValue
    : null;
}

function isValidQuartzStep(value: string, definition: QuartzFieldDefinition): boolean {
  if (!/^\d+$/.test(value)) return false;

  const step = Number(value);
  // Mirrors cron-utils FieldConstraints.isPeriodInRange().
  const maxStep = Math.min(definition.max, definition.max - definition.min + 1);
  return Number.isSafeInteger(step) && step > 0 && step <= maxStep;
}

function isValidQuartzRange(value: string, definition: QuartzFieldDefinition): boolean {
  const rangeParts = value.split("-");
  if (rangeParts.length !== 2) return false;

  const start = parseQuartzFieldValue(rangeParts[0], definition);
  const end = parseQuartzFieldValue(rangeParts[1], definition);
  if (start === null || end === null) return false;

  // cron-utils configures a strict range only for the optional Quartz year.
  return !definition.strictRangeOrder || start <= end;
}

function isValidStandardQuartzListItem(value: string, definition: QuartzFieldDefinition): boolean {
  const stepParts = value.split("/");
  if (stepParts.length > 2 || !stepParts[0]) return false;

  const base = stepParts[0];
  if (stepParts.length === 2 && !isValidQuartzStep(stepParts[1], definition)) return false;

  return base === "*"
    || parseQuartzFieldValue(base, definition) !== null
    || isValidQuartzRange(base, definition);
}

function isValidDayOfMonthListItem(value: string): boolean {
  const definition = QUARTZ_FIELD_DEFINITIONS[3];
  const normalized = value.toUpperCase();

  if (normalized === "L" || normalized === "LW") return true;

  const lastOffsetMatch = normalized.match(/^L-(\d+)$/);
  if (lastOffsetMatch) return parseQuartzFieldValue(lastOffsetMatch[1], definition) !== null;

  const nearestWeekdayMatch = normalized.match(/^(\d+)W$/);
  if (nearestWeekdayMatch) return parseQuartzFieldValue(nearestWeekdayMatch[1], definition) !== null;

  // cron-utils accepts a numeric value before L for this field as well.
  const lastMatch = normalized.match(/^(\d+)L$/);
  if (lastMatch) return parseQuartzFieldValue(lastMatch[1], definition) !== null;

  return isValidStandardQuartzListItem(value, definition);
}

function isValidDayOfWeekListItem(value: string): boolean {
  const definition = QUARTZ_FIELD_DEFINITIONS[5];
  const normalized = value.toUpperCase();

  if (normalized === "L") return true;

  const lastOffsetMatch = normalized.match(/^L-(\d+)$/);
  if (lastOffsetMatch) return parseQuartzFieldValue(lastOffsetMatch[1], definition) !== null;

  const lastMatch = normalized.match(/^([A-Z]+|\d+)L$/);
  if (lastMatch) return parseQuartzFieldValue(lastMatch[1], definition) !== null;

  const nthMatch = normalized.match(/^([A-Z]+|\d+)#(\d+)$/);
  if (nthMatch) {
    const occurrence = Number(nthMatch[2]);
    return parseQuartzFieldValue(nthMatch[1], definition) !== null
      // Quartz defines the nth weekday occurrence as 1-5. cron-utils 9.2.1
      // accidentally reuses the day-of-week 1-7 range here, which can create
      // schedules that never have a matching date.
      && Number.isSafeInteger(occurrence)
      && occurrence >= 1
      && occurrence <= 5;
  }

  return isValidStandardQuartzListItem(value, definition);
}

function isValidQuartzFieldList(
  value: string,
  validateItem: (item: string) => boolean
): boolean {
  const items = value.split(",");
  return items.length > 0 && items.every((item) => item.length > 0 && validateItem(item));
}

/**
 * Performs a conservative structural check against the Quartz definition used
 * by Moqui cron-utils 9.2.1. This deliberately does not claim to replace the
 * authoritative server parser used when the job is saved.
 */
function isStructurallyValidQuartzExpression(fields: string[]): boolean {
  const [seconds, minutes, hours, dayOfMonth, month, dayOfWeek, year] = fields;

  if (!isValidQuartzFieldList(seconds, (item) => isValidStandardQuartzListItem(item, QUARTZ_FIELD_DEFINITIONS[0]))) {
    return false;
  }
  if (!isValidQuartzFieldList(minutes, (item) => isValidStandardQuartzListItem(item, QUARTZ_FIELD_DEFINITIONS[1]))) {
    return false;
  }
  if (!isValidQuartzFieldList(hours, (item) => isValidStandardQuartzListItem(item, QUARTZ_FIELD_DEFINITIONS[2]))) {
    return false;
  }
  if (!isValidQuartzFieldList(month, (item) => isValidStandardQuartzListItem(item, QUARTZ_FIELD_DEFINITIONS[4]))) {
    return false;
  }
  if (year !== undefined
      && !isValidQuartzFieldList(year, (item) => isValidStandardQuartzListItem(item, QUARTZ_FIELD_DEFINITIONS[6]))) {
    return false;
  }

  const dayOfMonthUnspecified = dayOfMonth === "?";
  const dayOfWeekUnspecified = dayOfWeek === "?";
  if (dayOfMonthUnspecified === dayOfWeekUnspecified) return false;

  return (dayOfMonthUnspecified || isValidQuartzFieldList(dayOfMonth, isValidDayOfMonthListItem))
    && (dayOfWeekUnspecified || isValidQuartzFieldList(dayOfWeek, isValidDayOfWeekListItem));
}

function supportsLocalCronPreview(expression: string, timeZone: string): boolean {
  try {
    CronExpressionParser.parse(expression, { tz: timeZone });
    return true;
  } catch (_error) {
    return false;
  }
}

/**
 * Normalizes only the whitespace that the save contract ignores. Internal
 * spacing is deliberately retained so an inherited expression is not
 * rewritten merely by opening the setup page.
 */
export function normalizeSyncCronExpression(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Creates the initial setup draft without normalizing the inherited schedule.
 * A newly cloned job therefore retains the template expression byte-for-byte
 * until an administrator explicitly edits and saves it.
 */
export function createSyncScheduleDraft(
  inheritedCronExpression: string | null | undefined,
  active = false
): SyncScheduleState {
  return {
    cronExpression: inheritedCronExpression ?? "",
    active
  };
}

export function validateSyncCronExpression(
  value: unknown,
  options: SyncCronOptions = {}
): SyncCronValidation {
  const normalizedExpression = normalizeSyncCronExpression(value);
  const timeZone = getTimeZone(options.timeZone);

  if (!normalizedExpression) {
    return {
      valid: false,
      normalizedExpression,
      timeZone,
      code: "required",
      message: "A cron expression is required.",
      previewSupported: false
    };
  }

  const fields = normalizedExpression.split(/\s+/);
  if (fields.length < QUARTZ_CRON_MIN_FIELD_COUNT || fields.length > QUARTZ_CRON_MAX_FIELD_COUNT) {
    return {
      valid: false,
      normalizedExpression,
      timeZone,
      code: "field-count",
      message: "Use a six- or seven-field Quartz cron expression.",
      previewSupported: false
    };
  }

  if (!isValidTimeZone(timeZone)) {
    return {
      valid: false,
      normalizedExpression,
      timeZone,
      code: "invalid-time-zone",
      message: "Use a valid IANA timezone.",
      previewSupported: false
    };
  }

  if (isStructurallyValidQuartzExpression(fields)) {
    return {
      valid: true,
      normalizedExpression,
      timeZone,
      code: null,
      message: null,
      previewSupported: supportsLocalCronPreview(normalizedExpression, timeZone)
    };
  }

  return {
    valid: false,
    normalizedExpression,
    timeZone,
    code: "invalid-expression",
    message: "Use a valid Quartz cron expression. OMS validates the expression when you save.",
    previewSupported: false
  };
}

export function isValidSyncCronExpression(
  value: unknown,
  options: SyncCronOptions = {}
): boolean {
  return validateSyncCronExpression(value, options).valid;
}

export function describeSyncCronExpression(
  value: unknown,
  options: SyncCronOptions = {}
): string | null {
  const validation = validateSyncCronExpression(value, options);
  if (!validation.valid) return null;

  try {
    return cronstrue.toString(validation.normalizedExpression);
  } catch (_error) {
    return null;
  }
}

export function getNextSyncRun(
  value: unknown,
  options: SyncNextRunOptions = {}
): Date | null {
  const validation = validateSyncCronExpression(value, options);
  if (!validation.valid || !validation.previewSupported) return null;

  try {
    const interval = CronExpressionParser.parse(validation.normalizedExpression, {
      tz: validation.timeZone,
      ...(options.currentDate ? { currentDate: options.currentDate } : {})
    });
    return interval.next().toDate();
  } catch (_error) {
    return null;
  }
}

export function isSyncScheduleDirty(
  original: SyncScheduleState,
  draft: SyncScheduleState
): boolean {
  return normalizeSyncCronExpression(original.cronExpression)
      !== normalizeSyncCronExpression(draft.cronExpression)
    || original.active !== draft.active;
}

// =============================================================================================
// 7. Order sync — monitoring session
// =============================================================================================

/**
 * Order Sync monitoring session — worker-driven, NOT a main-thread poller.
 *
 * The name is kept because the view imports it, but nothing here polls on this thread any more. It
 * activates the class-A sync domains the Order Sync screen reads and lets the worker own the cadence;
 * the screen's entity reads are `liveQuery` subscriptions, so new batches and imports appear
 * reactively with no refresh call and no loading state.
 *
 * `batchActive` still matters, and this is the interesting part: instead of choosing how often a
 * main-thread timer fires, it now chooses the WORKER's interval — 10s while a batch is moving, 60s
 * when idle. Same intent as the original adaptive cadence, one thread removed, and the tab no longer
 * does network work at all.
 *
 * `manualRefresh` exists for the pieces that genuinely cannot be cached — the
 * `shopify/order-sync/{id}/history` projection and the landmark system properties — plus the explicit
 * refresh button. It does not need to be called to observe sync progress.
 */
export interface OrderSyncSessionOptions {
  /** True while a batch request is in flight; selects the worker's polling interval. */
  batchActive: () => boolean;
  /** Reloads the live-only pieces (history + landmark dates). */
  refresh: () => Promise<void>;
  onError?: (error: unknown) => void;
  /** Message-remote ids to scope the message sync to. */
  remoteIds?: () => string[];
}

/** The DataManagerLog configs an order import writes under. */

export function useShopifyOrderSyncPolling(options: OrderSyncSessionOptions) {
  return useShopifySyncSession(ORDER_SYNC_FEATURE, {
    active: options.batchActive,
    refresh: options.refresh,
    onError: options.onError,
  });
}

export interface ConnectionSyncSessionOptions {
  /** Job names whose runs the product-sync column needs. */
  productSyncJobNames?: () => string[];
  /** True while an order-sync batch is moving — selects order sync's fast cadence only. */
  orderSyncActive?: () => boolean;
  onError?: (error: unknown) => void;
}

/**
 * The Shopify connection details page's session — BOTH sync features on ONE worker.
 *
 * Why this exists instead of the page composing two separate sessions and
 * `useShopifyOrderSyncPolling` side by side: each `useCacheSync()` owns its own `SyncService`, so two
 * sessions spawn two workers with two independent timers, both polling on behalf of one screen. This
 * composes the two features' domain lists and hands them to a single session instead.
 *
 * Cadence stays PER FEATURE. `intervalMs` is stamped on each `ActiveDomain` and `effectiveInterval`
 * prefers it over the registered default, so order sync can run its 10s active cadence while product
 * sync — which this page only summarises — stays on its 60s idle one. The page never needs product
 * sync live, so its `active` is fixed false; only order sync escalates.
 *
 * Import windows do not collide: they are keyed per `configId`, and the two features write under
 * different ones (`SYNC_SHOPIFY_PRODUCT` vs `SYNC_SHOPIFY_ORDER`/`UPDATE_SHOPIFY_ORDER`).
 */
export function useShopifyConnectionSyncSession(options: ConnectionSyncSessionOptions = {}) {
  const orderSyncActive = options.orderSyncActive ?? (() => false);

  return useShopifySyncSession(PRODUCT_SYNC_FEATURE, {
    // Product sync is a summary on this page — never the reason to poll fast.
    active: () => false,
    onError: options.onError,
    // 200 to match what the card reads: the summary picks the newest run that actually imported, and
    // the newest few frequently imported nothing.
    messageTotal: PRODUCT_SYNC_RUN_WINDOW,
    // Logs are NOT keyable by shop — no endpoint offers it — so this window is shared across shops
    // and depth is the only lever. 300 keeps a quiet shop's logs inside it when a busy shop dominates.
    importTotal: 300,
    extraDomains: (productIntervalMs) => [
      ...productSyncExtraDomains(productIntervalMs, options.productSyncJobNames?.() ?? []),
      // Order sync's own messages and imports, on order sync's own cadence.
      ...syncFeatureDomains(
        ORDER_SYNC_FEATURE,
        syncFeatureInterval(ORDER_SYNC_FEATURE, orderSyncActive()),
        { messageTotal: SHOPIFY_ORDER_SYNC_RESULT_LIMIT, importTotal: 300 },
      ),
    ],
  });
}


// =============================================================================================
// 7b. Shop connection — creation, credentials, access scopes, location import
// =============================================================================================

/**
 * Everything `store/shopify.ts` did, relocated. The store held four kinds of thing:
 *   - shop/mapping/location LISTS — already cached tables here (`useShopifyShops`,
 *     `useShopifyTypeMappings`, `useShopifyCarrierShipments`, `useShopifyLocations`), so those
 *     actions map to reads that already exist and are not re-ported;
 *   - connection mutations (create shop+remote, rotate credentials, import locations) — moved here
 *     with write-through, which the store versions lacked entirely: they pushed into their own
 *     `shops` array and every cached read stayed stale until relogin;
 *   - access scopes — `persist: true` state, reproduced below with explicit localStorage persistence;
 *   - `clearShopifyState` — replaced by the `sessionScope` registry.
 */

const ACCESS_SCOPES_STORAGE_KEY = "company.shopifyAccessScopes";

interface StoredAccessScopes {
  scopes: string[];
  lastRefreshed: number;
}

function readStoredAccessScopes(): Record<string, StoredAccessScopes> {
  try {
    return JSON.parse(localStorage.getItem(ACCESS_SCOPES_STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

/**
 * Last-known Shopify access scopes per remote.
 *
 * Persisted (the store was `persist: true`) so the config UI can show the scopes granted at the last
 * refresh without hitting Shopify on every page load — a scope refresh is a real Shopify round trip.
 * The stored copy is only ever a display cache; `refreshAccessScopes` is the sole writer.
 */
const accessScopesState = reactive<{ byRemoteId: Record<string, StoredAccessScopes> }>({
  byRemoteId: readStoredAccessScopes(),
});

onSessionCleared(() => {
  accessScopesState.byRemoteId = {};
  localStorage.removeItem(ACCESS_SCOPES_STORAGE_KEY);
});

export function useShopifyAccessScopes() {
  const scopesFor = (systemMessageRemoteId: string | undefined) =>
    systemMessageRemoteId ? accessScopesState.byRemoteId[systemMessageRemoteId] ?? null : null;

  /** Ask Shopify (via the OMS bridge) what is currently granted, and persist the answer. */
  const refreshAccessScopes = async (systemMessageRemoteId: string): Promise<string[]> => {
    const resp: any = await api({
      url: `sob/shop/remote/${systemMessageRemoteId}/accessScopes`,
      method: "post",
    });
    if (commonUtil.hasError(resp)) throw resp;
    const scopes: string[] = resp.data?.accessScopes ?? [];
    accessScopesState.byRemoteId = {
      ...accessScopesState.byRemoteId,
      [systemMessageRemoteId]: { scopes, lastRefreshed: Date.now() },
    };
    localStorage.setItem(ACCESS_SCOPES_STORAGE_KEY, JSON.stringify(accessScopesState.byRemoteId));
    return scopes;
  };

  return { scopesFor, refreshAccessScopes };
}

/**
 * Create a Shopify connection: the SystemMessageRemote (credentials + linkage) and the ShopifyShop.
 *
 * Moved verbatim from the store except the ending: the store pushed the new shop into its own array,
 * which no cached read ever saw — a freshly created connection was invisible on every converted page
 * until the next login snapshot. Write-through refreshes both cached sides instead.
 */
export async function createShopifyConnection(payload: {
  shopId: string;
  shopifyShopId: string;
  myshopifyDomain: string;
  shopAccessToken: string;
  clientId: string;
  clientSecret: string;
  name?: string;
  productStoreId?: string;
}) {
  // Predictable remote id so the remote↔shop linkage is self-describing.
  const systemMessageRemoteId = `${payload.shopId}_REMOTE`;
  const remoteResp: any = await api({
    url: "oms/systemMessageRemotes",
    method: "post",
    data: {
      systemMessageRemoteId,
      sendUrl: payload.myshopifyDomain,
      remoteAppCode: payload.clientId,
      sharedSecret: payload.clientSecret,
      sendSharedSecret: payload.shopAccessToken,
      password: payload.shopAccessToken,
      remoteId: payload.shopifyShopId,
      remoteIdType: "SHOPIFY_SHOP_ID",
      internalId: payload.shopId,
      internalIdType: "HOTWAX_SHOP_ID",
      authHeaderName: "X-Shopify-Access-Token",
      description: payload.name || payload.myshopifyDomain,
    },
  });
  if (commonUtil.hasError(remoteResp)) throw remoteResp;

  const shopResp: any = await api({
    url: "oms/shopifyShops/shops",
    method: "post",
    data: {
      shopId: payload.shopId,
      shopifyShopId: payload.shopifyShopId,
      myshopifyDomain: payload.myshopifyDomain,
      name: payload.name || payload.myshopifyDomain.split(".")[0],
      productStoreId: payload.productStoreId || undefined,
      isEnabled: "Y",
    },
  });
  if (commonUtil.hasError(shopResp)) throw shopResp;

  await refreshAfterMutation("systemMessageRemote", { systemMessageRemoteId });
  await refreshAfterMutation("shopifyShop", { shopId: payload.shopId });

  return {
    shopId: payload.shopId,
    shopifyShopId: payload.shopifyShopId,
    myshopifyDomain: payload.myshopifyDomain,
    name: payload.name || payload.myshopifyDomain.split(".")[0],
    productStoreId: payload.productStoreId || null,
    isEnabled: "Y",
  };
}

/** Rotate/replace a shop remote's Shopify credentials. Returns the server's response data. */
export async function updateShopifyRemote(payload: {
  myShopifydomain: string;
  shopifyShopId: string;
  shopAccessToken: string;
  clientId: string;
  clientSecret: string;
  oldClientSecret?: string;
  name?: string;
  hotwaxShopId?: string;
}) {
  const resp: any = await api({ url: "sob/shop/remote", method: "post", data: payload });
  if (commonUtil.hasError(resp)) throw resp;
  return resp.data;
}

/**
 * One shop's ShopifyLocation↔facility mapping rows, fetched live.
 *
 * The cached `shopifyLocations` table holds the same rows, but the import modal reads this
 * immediately BEFORE and AFTER a mutation to diff what changed — a read-your-own-write it cannot
 * get from a cache the worker refreshes asynchronously.
 */
export async function fetchShopifyShopLocations(shopId: string, pageSize = 100): Promise<any[]> {
  const resp: any = await api({
    url: "oms/shopifyShops/locations",
    method: "get",
    params: { shopId, pageSize },
  });
  if (commonUtil.hasError(resp)) throw resp;
  return Array.isArray(resp.data) ? resp.data : [];
}

/**
 * One shop's type mappings / carrier shipments, fetched LIVE.
 *
 * For WIZARD DECISIONS immediately after a mutation ("does this shop have a product-type mapping yet,
 * or do I create the starter one?"), not for display — display reads the cached tables. A decision
 * must read its own write; the cache commits through the worker and a liveQuery emission later, so a
 * synchronous read straight after `await mutation()` can still be one tick stale, and acting on that
 * staleness would re-create mappings that already exist.
 */
export async function fetchShopifyTypeMappings(shopId: string, mappedTypeId: string): Promise<any[]> {
  const rows: any[] = [];
  let pageIndex = 0;
  let page: any[] = [];
  do {
    const resp: any = await api({
      url: "oms/shopifyShops/typeMappings",
      method: "get",
      params: { shopId, mappedTypeId, pageSize: 100, pageIndex },
    });
    if (commonUtil.hasError(resp)) throw resp;
    page = Array.isArray(resp.data) ? resp.data : [];
    rows.push(...page);
    pageIndex += 1;
  } while (page.length >= 100);
  return rows;
}

/** See `fetchShopifyTypeMappings` — the carrier-shipment sibling, same read-your-own-write purpose. */
export async function fetchShopifyCarrierShipments(shopId: string): Promise<any[]> {
  const rows: any[] = [];
  let pageIndex = 0;
  let page: any[] = [];
  do {
    const resp: any = await api({
      url: "oms/shopifyShops/carrierShipments",
      method: "get",
      params: { shopId, pageSize: 100, pageIndex },
    });
    if (commonUtil.hasError(resp)) throw resp;
    page = Array.isArray(resp.data) ? resp.data : [];
    rows.push(...page);
    pageIndex += 1;
  } while (page.length >= 100);
  return rows;
}

/**
 * Import Shopify locations as facilities (POST) and write-through the shop's cached location rows,
 * so the mapping pages see the import without waiting for the next login snapshot.
 */
export async function importShopifyFacilities(shopId: string, locations: any[]): Promise<any> {
  const resp: any = await api({
    url: `shopify/shops/${shopId}/shopify-locations`,
    method: "post",
    data: locations,
  });
  if (commonUtil.hasError(resp)) throw resp;
  await refreshAfterMutation("shopifyLocation", { shopId });
  return resp;
}

// =============================================================================================
// 8. Product sync — live Shopify/OMS calls and mutations
// =============================================================================================

/**
 * Everything the product sync screens do that is NOT a cached read.
 *
 * Moved here verbatim from `store/shopifyProductSync.ts`, which was a Pinia store in name only — it
 * held no state (`state: () => ({})`) and its actions were one-line delegates to these module
 * functions. So this is a relocation, not a rewrite: the views stop importing a store and Shopify
 * logic lives in the Shopify composable, per the one-composable-per-master-entity rule.
 *
 * Most of what follows is permanently live and that is correct — Shopify GraphQL, webhook
 * subscription state, and the product-store count documents are remote truth with no cacheable
 * equivalent. The cached reads they used to be bundled with (`syncRuns`, job config, the shop remote)
 * now come from sections 2–4; what is left here is the part that must ask a server.
 */
export interface ShopifyProductSyncSetupState {
  hasLinkedOmsProducts: boolean;
  productStoreLocked: boolean;
  identifierLocked: boolean;
  selectedProductStoreId: string;
  selectedIdentifierEnumId: string;
  shopifyAccessState?: ShopifyProductSyncAccessState;
  syncJobId?: string;
  completed?: boolean;
}

export interface ShopifyProductSyncAccessState {
  systemMessageRemoteId: string;
  accessScopeEnumId: string;
  hasWriteAccess: boolean;
  status: "write" | "read-only" | "unavailable" | "update-required";
  label: string;
}

export interface ShopifyProductSyncReviewStats {
  shopifyProductCount: number;
  shopifyVariantCount: number;
  omsProductCount?: number;
  omsVariantCount?: number;
  linkedShopCount: number;
  loaded: boolean;
}

export interface ShopifyProductSyncPreflightResult {
  matched: number;
  sampled: number;
  status: "matched" | "warning" | "conflict";
  items: any[];
}

export interface ShopifyProductSyncProgressState {
  syncJobId: string;
  status: "queued" | "sent" | "running" | "waiting" | "completed" | "cancelled" | "error";
  systemMessageState: string;
  completed: boolean;
  bulkOperationId?: string;
  bulkOperationStatus?: string;
  objectCount?: number;
  rootObjectCount?: number;
  queuedJobsAhead?: number;
}

export interface ShopifyShopProductCount {
  count: number;
  lastSyncedAt?: string;
}

export interface ShopifyProductUpdateSyncRunState {
  latestSystemMessage?: any;
  latestConfirmedSystemMessage?: any;
  latestConsumedSystemMessage?: any;
  lastSyncedAt?: string;
  systemMessageRemoteId: string;
  systemMessages?: any[];
}

export interface ShopifyPendingProductUpdateRequestsState {
  count: number;
  latestSystemMessage?: any;
}

export interface ShopifyProductSyncDashboardSummary {
  syncRunState: ShopifyProductUpdateSyncRunState;
  pendingRequests: ShopifyPendingProductUpdateRequestsState;
  runningOperation: ShopifyRunningBulkOperation | null;
  unsyncedUpdates: ShopifyShopProductCount;
  updateFilesToProcess: number;
}

export interface ShopifyRunningBulkOperation {
  id: string;
  status: string;
  type: string;
  createdAt: string;
  objectCount: number;
}

export interface ShopifyUnsyncedProductUpdate {
  id: string;
  legacyResourceId?: string;
  title: string;
  handle: string;
  updatedAt: string;
  vendor: string;
  productType: string;
  status: string;
  totalInventory?: number;
  imageUrl?: string;
  imageAltText?: string;
  variantsCount: number;
}

export interface ShopifyProductSyncProductSearchResult {
  id: string;
  legacyResourceId: string;
  title: string;
  handle: string;
  updatedAt: string;
  vendor: string;
  productType: string;
  status: string;
  totalInventory?: number;
  imageUrl?: string;
  imageAltText?: string;
  variantsCount: number;
  cursor: string;
}

export interface ShopifyProductSyncProductSearchState {
  products: ShopifyProductSyncProductSearchResult[];
  hasNextPage: boolean;
  endCursor: string;
}

export interface ShopifyProductSyncOnDemandResult {
  systemMessageId?: string;
  syncedProductId?: string[];
  missingProductId?: string[];
  failedProductId?: string[];
  rejectedProductId?: string[];
  acceptedCount?: number;
  syncedCount?: number;
  failedCount?: number;
  rejectedCount?: number;
}

export interface ShopifyProductSyncActionResult {
  jobOutput?: string;
  message?: string;
  systemMessageId?: string;
}

export interface ShopifyProductSyncHistoryOperation {
  id: string;
  title: string;
  subtitle: string;
  status: string;
  statusLabel: string;
  metricValue?: number | string;
  metricLabel?: string;
  actionLabel?: string;
  detailType: string;
}

export interface ShopifyProductSyncHistoryRun {
  id: string;
  systemMessageId: string;
  createdTime: string;
  bulkOperationStatus: string;
  bulkOperationStatusLabel: string;
  mdmStatus: string;
  mdmStatusLabel: string;
  bulkOperationId: string;
  objectCount: number;
  mdmImportId: string;
  totalRecordCount: number;
  failedRecordCount: number;
  operations: ShopifyProductSyncHistoryOperation[];
}

export type { ShopifyProductSyncRun } from "@/types/shopifyProductSync";


export interface ShopifyShopProductCount {
  count: number;
  lastSyncedAt?: string;
}

export interface ShopifyProductUpdateSyncRunState {
  latestSystemMessage?: any;
  latestConfirmedSystemMessage?: any;
  latestConsumedSystemMessage?: any;
  lastSyncedAt?: string;
  systemMessageRemoteId: string;
  systemMessages?: any[];
}

export interface ShopifyPendingProductUpdateRequestsState {
  count: number;
  latestSystemMessage?: any;
}

export interface ShopifyProductSyncDashboardSummary {
  syncRunState: ShopifyProductUpdateSyncRunState;
  pendingRequests: ShopifyPendingProductUpdateRequestsState;
  runningOperation: ShopifyRunningBulkOperation | null;
  unsyncedUpdates: ShopifyShopProductCount;
  updateFilesToProcess: number;
}

export interface ShopifyRunningBulkOperation {
  id: string;
  status: string;
  type: string;
  createdAt: string;
  objectCount: number;
}

export interface ShopifyUnsyncedProductUpdate {
  id: string;
  legacyResourceId?: string;
  title: string;
  handle: string;
  updatedAt: string;
  vendor: string;
  productType: string;
  status: string;
  totalInventory?: number;
  imageUrl?: string;
  imageAltText?: string;
  variantsCount: number;
}

export interface ShopifyProductSyncProductSearchResult {
  id: string;
  legacyResourceId: string;
  title: string;
  handle: string;
  updatedAt: string;
  vendor: string;
  productType: string;
  status: string;
  totalInventory?: number;
  imageUrl?: string;
  imageAltText?: string;
  variantsCount: number;
  cursor: string;
}

export interface ShopifyProductSyncProductSearchState {
  products: ShopifyProductSyncProductSearchResult[];
  hasNextPage: boolean;
  endCursor: string;
}

export interface ShopifyProductSyncOnDemandResult {
  systemMessageId?: string;
  syncedProductId?: string[];
  missingProductId?: string[];
  failedProductId?: string[];
  rejectedProductId?: string[];
  acceptedCount?: number;
  syncedCount?: number;
  failedCount?: number;
  rejectedCount?: number;
}

export interface ShopifyProductSyncActionResult {
  jobOutput?: string;
  message?: string;
  systemMessageId?: string;
}

export interface ShopifyProductSyncHistoryOperation {
  id: string;
  title: string;
  subtitle: string;
  status: string;
  statusLabel: string;
  metricValue?: number | string;
  metricLabel?: string;
  actionLabel?: string;
  detailType: string;
}

export interface ShopifyProductSyncHistoryRun {
  id: string;
  systemMessageId: string;
  createdTime: string;
  bulkOperationStatus: string;
  bulkOperationStatusLabel: string;
  mdmStatus: string;
  mdmStatusLabel: string;
  bulkOperationId: string;
  objectCount: number;
  mdmImportId: string;
  totalRecordCount: number;
  failedRecordCount: number;
  operations: ShopifyProductSyncHistoryOperation[];
}

export interface ShopifyProductSyncHistoryState {
  runs: ShopifyProductSyncHistoryRun[];
}

interface ShopifyGraphqlResponse {
  response?: any;
  data?: any;
  errors?: any[];
}

interface SystemMessagesResponse {
  systemMessages?: any[];
  systemMessagesCount?: number;
}

interface SystemMessageRemotesResponse {
  systemMessageRemoteList?: any[];
}

const PRODUCT_UPDATE_SYNC_MESSAGE_TYPE_ID = "BulkQueryShopifyProductUpdates";
const SHOPIFY_NO_ACCESS_SCOPE_ENUM_ID = "SHOP_NO_ACCESS";
// SHOP_RW_ACCESS is the official read-write access scope. SHOP_READ_WRITE_ACCESS is the
// deprecated full-form enum and requires updating (it is being phased out / force-replaced).
const SHOPIFY_LEGACY_READ_WRITE_ACCESS_SCOPE_ENUM_ID = "SHOP_READ_WRITE_ACCESS";
const SHOPIFY_READ_WRITE_ACCESS_SCOPE_ENUM_ID = "SHOP_RW_ACCESS";
const LIVE_CATALOG_COUNTS_QUERY = `
query WizardLiveCatalogCounts {
  productsCount {
    count
    precision
  }
  productVariantsCount {
    count
    precision
  }
}
`;

const RUNNING_BULK_OPERATIONS_QUERY = `
query RunningBulkOperations {
  bulkOperations(first: 1, query: "status:running operation_type:query", sortKey: CREATED_AT, reverse: true) {
    nodes {
      id
      status
      type
      createdAt
      objectCount
    }
  }
}
`;

function buildProductUpdatesCountQuery(fromDate?: string | number) {
  // Normalised HERE so every caller is safe: the spine's `lastSyncedAt` is epoch millis (the cache
  // projection's `date` coercion), and interpolating millis raw produced `updated_at:>'178461…'`,
  // which Shopify answers with 400 — the exact bug `fetchUnsyncedProductUpdateCount` already fixed
  // on its own path.
  const iso = toShopifyTimestamp(fromDate);
  const filterQuery = iso ? `(query: "updated_at:>'${escapeGraphqlString(iso)}'")` : "";
  return `
query UnsyncedProductUpdatesCount {
  productsCount${filterQuery} {
    count
    precision
  }
}
`;
}

function buildProductUpdatesListQuery(fromDate?: string | number, first = 100) {
  const pageSize = Math.min(Math.max(Number(first) || 100, 1), 100);
  // Same millis→ISO normalisation as the count query above.
  const iso = toShopifyTimestamp(fromDate);
  const filterQuery = iso ? `, query: "updated_at:>'${escapeGraphqlString(iso)}'"` : "";
  return `
query UnsyncedProductUpdates {
  products(first: ${pageSize}${filterQuery}, sortKey: UPDATED_AT, reverse: true) {
    nodes {
      id
      legacyResourceId
      title
      handle
      updatedAt
      vendor
      productType
      status
      totalInventory
      variantsCount {
        count
      }
      featuredMedia {
        ... on MediaImage {
          image {
            url
            altText
          }
        }
      }
    }
  }
}
`;
}

function buildProductSearchQuery(queryString: string, first = 20, after?: string) {
  const pageSize = Math.min(Math.max(Number(first) || 20, 1), 50);
  const afterQuery = after ? `, after: "${escapeGraphqlString(after)}"` : "";
  return `
query ProductSyncProductSearch {
  products(first: ${pageSize}, query: "${escapeGraphqlString(queryString)}", sortKey: TITLE${afterQuery}) {
    edges {
      cursor
      node {
        id
        legacyResourceId
        title
        handle
        updatedAt
        vendor
        productType
        status
        totalInventory
        variantsCount {
          count
        }
        featuredMedia {
          ... on MediaImage {
            image {
              url
              altText
            }
          }
        }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
`;
}

function buildProductByIdQuery(productGid: string) {
  return `
query ProductSyncProductById {
  product(id: "${escapeGraphqlString(productGid)}") {
    id
    legacyResourceId
    title
    handle
    updatedAt
    vendor
    productType
    status
    totalInventory
    variantsCount {
      count
    }
    featuredMedia {
      ... on MediaImage {
        image {
          url
          altText
        }
      }
    }
  }
}
`;
}

function getExactShopifyProductGid(queryString: string) {
  const normalizedQuery = queryString.trim();
  if (/^gid:\/\/shopify\/Product\/\d+$/.test(normalizedQuery)) {
    return normalizedQuery;
  }
  if (/^\d{8,}$/.test(normalizedQuery)) {
    return `gid://shopify/Product/${normalizedQuery}`;
  }
  return "";
}

function getShopifyProductLegacyId(productGid: string) {
  return productGid.split("/").pop() || "";
}

function mapShopifyProductNode(product: any, cursor = ""): ShopifyProductSyncProductSearchResult {
  return {
    id: product.id,
    legacyResourceId: String(product.legacyResourceId || ""),
    title: product.title,
    handle: product.handle,
    updatedAt: product.updatedAt,
    vendor: product.vendor,
    productType: product.productType,
    status: product.status,
    totalInventory: product.totalInventory,
    imageUrl: product.featuredMedia?.image?.url,
    imageAltText: product.featuredMedia?.image?.altText,
    variantsCount: Number(product.variantsCount?.count || 0),
    cursor
  };
}

async function requestBackend<T>(request: any, context = "Shopify product sync backend request"): Promise<T> {
  try {
    const resp = await api(request) as any;
    if (typeof resp?.data === "undefined" || resp.data === null) {
      throw new Error(`${context} returned no response data.`);
    }
    return resp.data as T;
  } catch (error) {
    const details = getApiErrorDetails(error);
    throw new Error(`${context} failed${details ? ` (${details})` : ""}.`);
  }
}

function getApiErrorDetails(error: any): string {
  const status = error?.response?.status;
  const responseMessage = error?.response?.data?.message || error?.response?.data?.error;
  const message = responseMessage || error?.message || "";
  return [status ? `status ${status}` : "", message].filter(Boolean).join(": ");
}

function assertPlainObject(value: any, context: string): asserts value is Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${context} returned an invalid response shape.`);
  }
}

function assertBooleanField(value: any, fieldName: string, context: string) {
  if (typeof value !== "boolean") {
    throw new Error(`${context} response must include boolean ${fieldName}.`);
  }
}

function assertStringField(value: any, fieldName: string, context: string) {
  if (typeof value !== "string") {
    throw new Error(`${context} response must include string ${fieldName}.`);
  }
}

function assertArrayField(value: any, fieldName: string, context: string) {
  if (!Array.isArray(value)) {
    throw new Error(`${context} response must include array ${fieldName}.`);
  }
}

function validateSetupState(response: any): ShopifyProductSyncSetupState {
  const context = "Product sync setup state";
  assertPlainObject(response, context);
  assertBooleanField(response.hasLinkedOmsProducts, "hasLinkedOmsProducts", context);
  assertBooleanField(response.productStoreLocked, "productStoreLocked", context);
  assertBooleanField(response.identifierLocked, "identifierLocked", context);
  assertStringField(response.selectedProductStoreId, "selectedProductStoreId", context);
  assertStringField(response.selectedIdentifierEnumId, "selectedIdentifierEnumId", context);
  if (typeof response.syncJobId !== "undefined") assertStringField(response.syncJobId, "syncJobId", context);
  if (typeof response.completed !== "undefined") assertBooleanField(response.completed, "completed", context);
  return response as ShopifyProductSyncSetupState;
}



function getRequiredCount(payload: any, key: string, context: string): number {
  const value = payload?.[key]?.count ?? payload?.response?.[key]?.count ?? payload?.data?.[key]?.count;
  if (typeof value === "undefined" || value === null || Number.isNaN(Number(value))) {
    throw new Error(`${context} response is missing ${key}.count.`);
  }
  return Number(value);
}

function escapeGraphqlString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function getTimestampValue(value: any): number {
  return parseDateTimeValue(value)?.toMillis() || 0;
}

function getTimestampDate(value: any): string | undefined {
  return parseDateTimeValue(value)?.toISO() || undefined;
}

function getEntityValueList(response: any, context: string): any[] {
  if (Array.isArray(response?.entityValueList)) return response.entityValueList;
  if (Number(response?.entityValueListCount || 0) === 0) return [];
  throw new Error(`${context} response must include array entityValueList.`);
}

function resolveSystemMessageRemoteId(payload: any): string {
  if (typeof payload === "string") return payload;
  return payload.systemMessageRemoteId ||
    payload.shop?.systemMessageRemoteId ||
    payload.shopId ||
    "";
}

/**
 * Shop → its remotes. Delegates to the shared rule in `@/utils/systemMessage`, which the sync
 * WORKER also uses — the match must not exist twice, because a drift between the two would mean the
 * screen and the poller disagree about which remote a shop owns.
 */
function getShopRemoteCandidates(systemMessageRemoteList: any[], payload: any) {
  return shopRemoteCandidates(systemMessageRemoteList as any[], {
    shopId: String(payload.shopId || payload.shop?.shopId || ""),
    shopifyShopId: String(payload.shopifyShopId || payload.shop?.shopifyShopId || ""),
  }) as any[];
}

const sortShopRemoteCandidates = (candidates: any[]) => sortRemotesByAccess(candidates as any[]) as any[];

function hasShopifyWriteAccess(accessScopeEnumId: string) {
  const normalizedScope = String(accessScopeEnumId || "").trim().toUpperCase();
  return normalizedScope === SHOPIFY_READ_WRITE_ACCESS_SCOPE_ENUM_ID;
}

function getShopifyAccessStateFromCandidate(candidate: any): ShopifyProductSyncAccessState {
  const accessScopeEnumId = String(candidate?.accessScopeEnumId || "").trim();
  const hasWriteAccess = hasShopifyWriteAccess(accessScopeEnumId);

  if (!candidate?.systemMessageRemoteId) {
    return {
      systemMessageRemoteId: "",
      accessScopeEnumId: "",
      hasWriteAccess: false,
      status: "unavailable",
      label: "Unavailable"
    };
  }

  return {
    systemMessageRemoteId: String(candidate.systemMessageRemoteId || "").trim(),
    accessScopeEnumId,
    hasWriteAccess,
    status: hasWriteAccess ? "write" : (
      accessScopeEnumId === SHOPIFY_LEGACY_READ_WRITE_ACCESS_SCOPE_ENUM_ID ? "update-required" :
        accessScopeEnumId === SHOPIFY_NO_ACCESS_SCOPE_ENUM_ID ? "unavailable" : "read-only"
    ),
    label: hasWriteAccess ? "Write access" : (
      accessScopeEnumId === SHOPIFY_LEGACY_READ_WRITE_ACCESS_SCOPE_ENUM_ID ? "Update required" :
        accessScopeEnumId === SHOPIFY_NO_ACCESS_SCOPE_ENUM_ID ? "Unavailable" : "Read only"
    )
  };
}

/**
 * Candidate remotes for a shop, read from the cached remote list.
 *
 * This ran three times on a single connection-details load, each time re-fetching the whole remote
 * list to filter it client-side. The list is cached seed data, so the filtering happens locally and
 * the request disappears. Network fallback only while the cache is unpopulated.
 */
async function fetchShopRemoteCandidates(payload: any) {
  try {
    const cached = await systemMessageRemoteCache.all();
    if (cached.length) {
      const remotes = cached.map((row: any) => row.raw);
      return sortShopRemoteCandidates(getShopRemoteCandidates(remotes, payload));
    }
  } catch (error) {
    logger.warn("System message remote cache unavailable; falling back to the server", error);
  }

  const response = await requestBackend<SystemMessageRemotesResponse>({
    url: "oms/systemMessageRemotes",
    method: "get"
  });

  return sortShopRemoteCandidates(getShopRemoteCandidates(response?.systemMessageRemoteList || [], payload));
}

export const fetchShopSystemMessageRemoteId = async (payload: any): Promise<any> => {
  const shopifyShopId = payload.shopifyShopId || payload.shop?.shopifyShopId;
  if (!shopifyShopId) {
    throw new Error("Shopify shop id is required to resolve SystemMessageRemote.remoteId.");
  }

  const candidates = await fetchShopRemoteCandidates(payload);
  if (!candidates.length) {
    throw new Error(`No SystemMessageRemote found with remoteId ${shopifyShopId}.`);
  }

  if (payload.returnAllSystemMessageRemoteIds) {
    return candidates
      .map((candidate: any) => String(candidate.systemMessageRemoteId || "").trim())
      .filter((systemMessageRemoteId: string, index: number, list: string[]) => {
        return systemMessageRemoteId && list.indexOf(systemMessageRemoteId) === index;
      });
  }

  // Extract unique remote IDs from candidates
  const remoteIds = candidates
    .map((candidate: any) => candidate.systemMessageRemoteId)
    .filter((id: string, index: number, self: any[]) => id && self.indexOf(id) === index);

  if (!remoteIds.length) return candidates[0]?.systemMessageRemoteId;

  try {
    const response = await requestBackend<SystemMessagesResponse>({
      url: "admin/systemMessages",
      method: "get",
      params: {
        systemMessageTypeId: PRODUCT_UPDATE_SYNC_MESSAGE_TYPE_ID,
        systemMessageRemoteId: remoteIds,
        systemMessageRemoteId_op: "in",
        pageSize: remoteIds.length
      }
    });

    const validRemoteIds = new Set(response?.systemMessages?.map((msg: any) => msg.systemMessageRemoteId));
    // Pick the first remoteId from the original candidates list that is valid
    const firstValid = remoteIds.find(id => validRemoteIds.has(id));

    if (firstValid) {
      return firstValid;
    }
  } catch (e) {
    logger.error("Failed to resolve system message remote IDs in bulk", e);
  }

  return candidates[0].systemMessageRemoteId;
};

export const fetchShopifyAccessState = async (payload: any): Promise<ShopifyProductSyncAccessState> => {
  const shopifyShopId = payload.shopifyShopId || payload.shop?.shopifyShopId;
  if (!shopifyShopId) {
    throw new Error("Shopify shop id is required to resolve Shopify access scope.");
  }

  const candidates = await fetchShopRemoteCandidates(payload);
  if (!candidates.length) {
    return {
      systemMessageRemoteId: "",
      accessScopeEnumId: "",
      hasWriteAccess: false,
      status: "unavailable",
      label: "Unavailable"
    };
  }

  return getShopifyAccessStateFromCandidate(candidates[0]);
};


const getSystemMessageRank = (systemMessage: any) => {
  const statusId = String(systemMessage?.statusId || "").toLowerCase();
  const logStatusId = String(systemMessage?.logStatusId || "").toLowerCase();
  const logId = systemMessage?.logId;

  // Terminal status:
  // 1. mdm logId is present AND its statusId is DmlsFinished or DmlsError
  // 2. mdm logId is NOT present AND statusId is SmsgConsumed (handles empty Shopify runs)
  const isTerminal = (logId && (logStatusId === "dmlsfinished" || logStatusId === "dmlserror")) ||
                     (!logId && (statusId === "smsgconsumed" || statusId === "consumed"));

  if (isTerminal) {
    return 1;
  }

  // Any other case is considered "In Progress" and gets a higher rank (>= 2)
  if (logStatusId === "dmlsrunning") return 5;
  if (logStatusId === "dmlspending" || statusId === "smsgconsumed" || statusId === "consumed") return 4.5;
  if (statusId === "smsgreceived") return 3.5;
  if (statusId === "msgsent" || statusId === "smsgsent" || statusId === "sent") return 3;
  if (statusId === "msgproduced" || statusId === "smsgproduced" || statusId === "produced") return 2.5;

  // Default for any unknown in-progress status
  return 0;
};

function getLatestSystemMessage(systemMessages: any[]) {
  return systemMessages.reduce((latest: any, current: any) => {
    if (!latest) return current;

    const latestRank = getSystemMessageRank(latest);
    const currentRank = getSystemMessageRank(current);

    if (currentRank > latestRank) {
      return current;
    }
    if (currentRank < latestRank) {
      return latest;
    }

    const currentTimestamp = getTimestampValue(current.lastUpdatedStamp);
    const latestTimestamp = getTimestampValue(latest.lastUpdatedStamp);

    if (currentTimestamp > latestTimestamp) {
      return current;
    }
    return latest;
  }, undefined);
}

export const fetchProductUpdateSyncRunState = async (payload: any): Promise<ShopifyProductUpdateSyncRunState> => {
  const systemMessageRemoteId = typeof payload === "string" ? payload : resolveSystemMessageRemoteId(payload);
  const shopId = payload.shopId || payload.shop?.shopId;
  if (!shopId) {
    throw new Error("Shop ID is required to find product update sync system messages.");
  }

  const systemMessageId = payload.systemMessageId;
  const pageSize = systemMessageId ? 1 : 100;

  // CACHE-FIRST — see `cachedSyncMessageHistory`; the DataDocument is only asked when the cache
  // cannot answer.
  const cachedHistory = await cachedSyncMessageHistory({
    shopId,
    systemMessageId,
    systemMessageTypeId: "BulkQueryShopifyProductUpdates",
    pageSize,
  });

  const systemMessages = cachedHistory ?? getEntityValueList(
    await requestBackend<any>({
      url: "oms/dataDocumentView",
      method: "post",
      data: {
        dataDocumentId: "SYSTEM_MESSAGE_DATA_MANAGER_LOG",
        customParametersMap: {
          systemMessageId,
          systemMessageTypeId: "BulkQueryShopifyProductUpdates",
          remoteInternalId: shopId,
          remoteInternalIdType: "HOTWAX_SHOP_ID",
          orderByField: "-lastUpdatedStamp"
        },
        pageSize,
        pageIndex: 0
      }
    }),
    "Product sync system message history",
  );

  const confirmedMessages = systemMessages.filter((systemMessage: any) => systemMessage.statusId === "SmsgConfirmed" || systemMessage.statusId === "SmsgConsumed");
  const consumedMessages = systemMessages.filter((systemMessage: any) => {
    const statusId = String(systemMessage.statusId || "").toLowerCase();
    const isConsumed = statusId === "smsgconsumed" || statusId === "consumed" || statusId === "smsgconfirmed" || statusId === "confirmed";
    return isConsumed && systemMessage.logId;
  });
  const latestConfirmedSystemMessage = getLatestSystemMessage(confirmedMessages);
  const latestConsumedSystemMessage = getLatestSystemMessage(consumedMessages);
  const latestSystemMessage = getLatestSystemMessage(systemMessages);


  return {
    latestSystemMessage,
    latestConfirmedSystemMessage,
    latestConsumedSystemMessage,
    lastSyncedAt: getTimestampDate(latestConsumedSystemMessage?.initDate),
    systemMessageRemoteId,
    systemMessages
  };
};

/**
 * Local reproduction of `dataDocumentId: SYSTEM_MESSAGE_DATA_MANAGER_LOG`.
 *
 * That DataDocument is a server-side join of SystemMessage ⋈ DataManagerLog, scoped by message type
 * and by the REMOTE's internal id (the shop id, `remoteInternalIdType: HOTWAX_SHOP_ID`). Every input
 * is already cached: messages and logs are class-A domains, and the shop→remote link lives on the
 * cached remote as `internalId`. So the document is DERIVED here rather than requested — it was the
 * largest cluster of calls on the product-sync page.
 *
 * Returns `null` when the cache cannot answer (no remote resolved, or nothing cached yet), which
 * callers treat as "fall back to the server" rather than "no results" — the distinction matters,
 * because an empty array is a legitimate answer.
 */
async function cachedSyncMessageHistory(query: {
  shopId: string;
  systemMessageTypeId: string;
  systemMessageId?: string;
  statusId?: string;
  pageSize?: number;
}): Promise<any[] | null> {
  try {
    const remotes = (await systemMessageRemoteCache.all()).map((row: any) => row.raw ?? row);
    const remoteIds = new Set(
      remotes
        .filter((remote: any) => String(remote?.internalId ?? "") === String(query.shopId))
        .map((remote: any) => String(remote.systemMessageRemoteId)),
    );
    if (!remoteIds.size) return null;

    const messages = (await systemMessageCache.all()).map((row: any) => row.raw ?? row);
    if (!messages.length) return null;

    const logs = (await dataManagerLogCache.all()).map((row: any) => row.raw ?? row);
    const logByMessageId = new Map<string, any>();
    for (const log of logs) {
      const key = String(log?.systemMessageId ?? "");
      if (key && !logByMessageId.has(key)) logByMessageId.set(key, log);
    }

    let rows = messages.filter((message: any) =>
      remoteIds.has(String(message?.systemMessageRemoteId)) &&
      String(message?.systemMessageTypeId) === query.systemMessageTypeId);

    /**
     * ⚠️ An EMPTY scoped result is "cannot answer", not "no runs".
     *
     * The message table hydrates per (remote, type), so mid-hydration it can hold SOME shops' rows
     * while this shop's have not landed yet. Observed live on a cold profile: the first-ever visit to
     * the product sync page read the cache after another remote's tick had committed, got zero rows
     * for THIS shop, concluded `hasLinkedOmsProducts: false`, and dropped a shop with months of sync
     * history into the first-time wizard — a reload "fixed" it, which is the signature of a
     * hydration race. Deferring to the server document costs one request only for shops that
     * genuinely have no runs (the real wizard case), and is correct for everyone else.
     */
    if (!rows.length) return null;

    if (query.systemMessageId) {
      rows = rows.filter((message: any) => String(message.systemMessageId) === String(query.systemMessageId));
    }
    if (query.statusId) {
      rows = rows.filter((message: any) => String(message.statusId) === query.statusId);
    }

    // The document orders by `-lastUpdatedStamp`; messages carry none (verified live), so
    // `processedDate` then `initDate` is the equivalent recency signal.
    rows.sort((a: any, b: any) =>
      Number(b.processedDate ?? b.initDate ?? 0) - Number(a.processedDate ?? a.initDate ?? 0));

    // `logId` is the field callers test to decide whether a message actually imported anything.
    const joined = rows.map((message: any) => {
      const log = logByMessageId.get(String(message.systemMessageId));
      if (!log) return { ...message };
      return {
        ...message,
        logId: log.logId,
        totalRecordCount: log.totalRecordCount,
        failedRecordCount: log.failedRecordCount,
        successRecordCount: log.successRecordCount,
        finishDateTime: log.finishDateTime,
      };
    });

    return query.pageSize ? joined.slice(0, query.pageSize) : joined;
  } catch (error) {
    logger.warn("Cached sync message history unavailable; falling back to the server", error);
    return null;
  }
}

export const fetchPendingProductUpdateRequests = async (payload: any): Promise<ShopifyPendingProductUpdateRequestsState> => {
  const shopId = payload.shopId || payload.shop?.shopId;
  if (!shopId) {
    throw new Error("Shop ID is required to count pending product update requests.");
  }

  // CACHE-FIRST: the same document, narrowed to messages still awaiting processing.
  const cachedPending = await cachedSyncMessageHistory({
    shopId,
    systemMessageTypeId: "BulkQueryShopifyProductUpdates",
    statusId: "SmsgProduced",
  });
  if (cachedPending) {
    return { count: cachedPending.length, latestSystemMessage: cachedPending[0] };
  }

  const response = await requestBackend<any>({
    url: "oms/dataDocumentView",
    method: "post",
    data: {
      dataDocumentId: "SYSTEM_MESSAGE_DATA_MANAGER_LOG",
      customParametersMap: {
        systemMessageTypeId: "BulkQueryShopifyProductUpdates",
        remoteInternalId: shopId,
        remoteInternalIdType: "HOTWAX_SHOP_ID",
        statusId: "SmsgProduced"
      },
      pageSize: payload.pageSize || 1,
      pageIndex: 0,
      orderByField: "-initDate"
    }
  }, "Pending product update requests");

  return {
    count: Number(response?.entityValueListCount || 0),
    latestSystemMessage: response?.entityValueList?.[0]
  };
};

export const fetchLiveCatalogCounts = async (payload: any): Promise<ShopifyProductSyncReviewStats> => {
  const systemMessageRemoteId = resolveSystemMessageRemoteId(payload);
  if (!systemMessageRemoteId) {
    throw new Error("Shopify systemMessageRemoteId is required to fetch live catalog counts.");
  }

  const response = await requestBackend<ShopifyGraphqlResponse>({
    url: "shopify/graphql",
    method: "post",
    data: {
      systemMessageRemoteId,
      queryText: LIVE_CATALOG_COUNTS_QUERY
    }
  });

  const graphQlPayload = response?.response || response?.data || response;
  if (response?.errors?.length || graphQlPayload?.errors?.length) {
    throw new Error(`Shopify live catalog count query returned errors: ${JSON.stringify(response?.errors || graphQlPayload.errors)}`);
  }

  return {
    shopifyProductCount: getRequiredCount(graphQlPayload, "productsCount", "Shopify live catalog count query"),
    shopifyVariantCount: getRequiredCount(graphQlPayload, "productVariantsCount", "Shopify live catalog count query"),
    linkedShopCount: payload.linkedShopCount || 0,
    loaded: true
  };
};

export const fetchRunningBulkOperation = async (payload: any): Promise<ShopifyRunningBulkOperation | null> => {
  const systemMessageRemoteId = resolveSystemMessageRemoteId(payload);
  if (!systemMessageRemoteId) {
    throw new Error("Shopify systemMessageRemoteId is required to fetch running bulk operations.");
  }

  const response = await requestBackend<ShopifyGraphqlResponse>({
    url: "shopify/graphql",
    method: "post",
    data: {
      systemMessageRemoteId,
      queryText: RUNNING_BULK_OPERATIONS_QUERY
    }
  });

  const graphQlPayload = response?.response || response?.data || response;
  if (response?.errors?.length || graphQlPayload?.errors?.length) {
    throw new Error(`Shopify running bulk operation query returned errors: ${JSON.stringify(response?.errors || graphQlPayload.errors)}`);
  }

  const runningOperation = graphQlPayload?.bulkOperations?.nodes?.[0];
  if (!runningOperation) return null;

  return {
    id: runningOperation.id,
    status: runningOperation.status,
    type: runningOperation.type,
    createdAt: runningOperation.createdAt,
    objectCount: Number(runningOperation.objectCount || 0)
  }
}

export const fetchSetupState = async (payload: any): Promise<ShopifyProductSyncSetupState> => {
  const [syncRunState, shopifyAccessState] = await Promise.all([
    fetchProductUpdateSyncRunState(payload),
    fetchShopifyAccessState(payload).catch(() => ({
      systemMessageRemoteId: "",
      accessScopeEnumId: "",
      hasWriteAccess: false,
      status: "unavailable",
      label: "Unavailable"
    } as ShopifyProductSyncAccessState))
  ]);

  const hasLinkedOmsProducts = !!syncRunState.latestSystemMessage;

  return validateSetupState({
    hasLinkedOmsProducts,
    shopifyAccessState,
    productStoreLocked: hasLinkedOmsProducts,
    identifierLocked: hasLinkedOmsProducts,
    selectedProductStoreId: payload.shop?.productStoreId || payload.productStore?.productStoreId || "",
    selectedIdentifierEnumId: payload.productStore?.productIdentifierEnumId || ""
  });
};

export const fetchShopifyShopProductCount = async (payload: any): Promise<ShopifyShopProductCount> => {
  const systemMessageRemoteId = resolveSystemMessageRemoteId(payload);
  if (!systemMessageRemoteId) {
    throw new Error("Shopify systemMessageRemoteId is required to fetch unsynced product update counts.");
  }

  const lastSyncedAt = payload.lastSyncedAt || payload.syncRunState?.lastSyncedAt ||
    (await fetchProductUpdateSyncRunState(payload)).lastSyncedAt;
  const response = await requestBackend<ShopifyGraphqlResponse>({
    url: "shopify/graphql",
    method: "post",
    data: {
      systemMessageRemoteId,
      queryText: buildProductUpdatesCountQuery(lastSyncedAt)
    }
  });

  const graphQlPayload = response?.response || response?.data || response;
  if (response?.errors?.length || graphQlPayload?.errors?.length) {
    throw new Error(`Shopify unsynced product update count query returned errors: ${JSON.stringify(response?.errors || graphQlPayload.errors)}`);
  }

  return {
    count: getRequiredCount(graphQlPayload, "productsCount", "Shopify unsynced product update count query"),
    lastSyncedAt
  };
}

export const fetchUnsyncedProductUpdates = async (payload: any): Promise<ShopifyUnsyncedProductUpdate[]> => {
  const systemMessageRemoteId = resolveSystemMessageRemoteId(payload);
  if (!systemMessageRemoteId) {
    throw new Error("Shopify systemMessageRemoteId is required to fetch unsynced product updates.");
  }

  const lastSyncedAt = payload.lastSyncedAt || payload.syncRunState?.lastSyncedAt ||
    (await fetchProductUpdateSyncRunState(payload)).lastSyncedAt;
  const response = await requestBackend<ShopifyGraphqlResponse>({
    url: "shopify/graphql",
    method: "post",
    data: {
      systemMessageRemoteId,
      queryText: buildProductUpdatesListQuery(lastSyncedAt, payload.pageSize || 100)
    }
  });

  const graphQlPayload = response?.response || response?.data || response;
  if (response?.errors?.length || graphQlPayload?.errors?.length) {
    throw new Error(`Shopify unsynced product update list query returned errors: ${JSON.stringify(response?.errors || graphQlPayload.errors)}`);
  }
  if (!Array.isArray(graphQlPayload?.products?.nodes)) {
    throw new Error("Shopify unsynced product update list query response is missing products.nodes.");
  }

  return graphQlPayload.products.nodes.map((product: any) => ({
    id: product.id,
    legacyResourceId: String(product.legacyResourceId || ""),
    title: product.title,
    handle: product.handle,
    updatedAt: product.updatedAt,
    vendor: product.vendor,
    productType: product.productType,
    status: product.status,
    totalInventory: product.totalInventory,
    imageUrl: product.featuredMedia?.image?.url,
    imageAltText: product.featuredMedia?.image?.altText,
    variantsCount: Number(product.variantsCount?.count || 0)
  }));
};

export const fetchRecentlyUpdatedShopifyProducts = async (payload: any): Promise<ShopifyProductSyncProductSearchState> => {
  const systemMessageRemoteId = resolveSystemMessageRemoteId(payload);
  if (!systemMessageRemoteId) {
    throw new Error("Shopify systemMessageRemoteId is required to fetch recently updated products.");
  }

  const response = await requestBackend<ShopifyGraphqlResponse>({
    url: "shopify/graphql",
    method: "post",
    data: {
      systemMessageRemoteId,
      queryText: buildProductUpdatesListQuery(undefined, payload.pageSize || 15)
    }
  }, "Shopify recently updated products query");

  const graphQlPayload = response?.response || response?.data || response;
  if (response?.errors?.length || graphQlPayload?.errors?.length) {
    throw new Error(`Shopify recently updated products query returned errors: ${JSON.stringify(response?.errors || graphQlPayload.errors)}`);
  }
  if (!Array.isArray(graphQlPayload?.products?.nodes)) {
    throw new Error("Shopify recently updated products query response is missing products.nodes.");
  }

  return {
    products: graphQlPayload.products.nodes.map((product: any) => mapShopifyProductNode(product)),
    hasNextPage: false,
    endCursor: ""
  };
};

export const searchShopifyProducts = async (payload: any): Promise<ShopifyProductSyncProductSearchState> => {
  const systemMessageRemoteId = resolveSystemMessageRemoteId(payload);
  if (!systemMessageRemoteId) {
    throw new Error("Shopify systemMessageRemoteId is required to search products.");
  }

  const queryString = String(payload.queryString || "").trim();
  if (!queryString) {
    return {
      products: [],
      hasNextPage: false,
      endCursor: ""
    };
  }

  const exactProductGid = !payload.after ? getExactShopifyProductGid(queryString) : "";
  if (exactProductGid) {
    const response = await requestBackend<ShopifyGraphqlResponse>({
      url: "shopify/graphql",
      method: "post",
      data: {
        systemMessageRemoteId,
        queryText: buildProductByIdQuery(exactProductGid)
      }
    }, "Shopify product ID lookup query");

    const graphQlPayload = response?.response || response?.data || response;
    if (response?.errors?.length || graphQlPayload?.errors?.length) {
      throw new Error(`Shopify product ID lookup query returned errors: ${JSON.stringify(response?.errors || graphQlPayload.errors)}`);
    }
    const productNode = graphQlPayload?.product || graphQlPayload?.data?.product || graphQlPayload?.response?.product || graphQlPayload?.response?.data?.product;
    if (productNode) {
      return {
        products: [mapShopifyProductNode(productNode)],
        hasNextPage: false,
        endCursor: ""
      };
    }
  }

  const searchQueryString = exactProductGid ? `id:${getShopifyProductLegacyId(exactProductGid)}` : queryString;
  const response = await requestBackend<ShopifyGraphqlResponse>({
    url: "shopify/graphql",
    method: "post",
    data: {
      systemMessageRemoteId,
      queryText: buildProductSearchQuery(searchQueryString, payload.pageSize || 20, payload.after)
    }
  }, "Shopify product search query");

  const graphQlPayload = response?.response || response?.data || response;
  if (response?.errors?.length || graphQlPayload?.errors?.length) {
    throw new Error(`Shopify product search query returned errors: ${JSON.stringify(response?.errors || graphQlPayload.errors)}`);
  }
  if (!Array.isArray(graphQlPayload?.products?.edges)) {
    throw new Error("Shopify product search query response is missing products.edges.");
  }

  return {
    products: graphQlPayload.products.edges.map((edge: any) => {
      return mapShopifyProductNode(edge.node || {}, edge.cursor);
    }),
    hasNextPage: !!graphQlPayload.products.pageInfo?.hasNextPage,
    endCursor: graphQlPayload.products.pageInfo?.endCursor || ""
  };
};

export const syncShopifyProductsOnDemand = async (payload: any): Promise<ShopifyProductSyncOnDemandResult> => {
  if (!payload.shopId) {
    throw new Error("Shopify shop id is required to sync products on demand.");
  }
  if (!payload.shopifyProductId) {
    throw new Error("Shopify product id is required to sync products on demand.");
  }

  const data: any = {
    shopId: payload.shopId,
    shopifyProductId: payload.shopifyProductId
  };
  if (payload.namespace) data.namespace = payload.namespace;
  if (payload.additionalParameters) data.additionalParameters = payload.additionalParameters;

  return requestBackend<ShopifyProductSyncOnDemandResult>({
    url: "sob/shopify/syncShopifyProductsOnDemand",
    method: "post",
    data
  }, "Shopify product sync on demand endpoint");
};

export const syncShopifyProducts = async (payload: any): Promise<ShopifyProductSyncOnDemandResult> => {
  if (!payload.shopId) {
    throw new Error("Shopify shop id is required to sync products.");
  }

  const data: any = {
    shopId: payload.shopId,
    includeAll: payload.includeAll || false
  };

  if (payload.fromDate) data.fromDate = payload.fromDate;
  if (payload.thruDate) data.thruDate = payload.thruDate;
  if (payload.namespace) data.namespace = payload.namespace;
  if (payload.filterQuery) data.filterQuery = payload.filterQuery;

  return requestBackend<ShopifyProductSyncOnDemandResult>({
    url: "shopify/products/sync",
    method: "post",
    data
  }, "Shopify product sync endpoint");
};

const sendShopifyBulkQueryMessage = async (payload: any): Promise<ShopifyProductSyncActionResult> => {
  const systemMessageRemoteId = String(payload?.systemMessageRemoteId || "").trim();
  const queryText = String(payload?.queryText || "").trim();

  if (!systemMessageRemoteId) {
    throw new Error("System message remote id is required to send a Shopify bulk query message.");
  }
  if (!queryText) {
    throw new Error("Query text is required to send a Shopify bulk query message.");
  }

  return requestBackend<ShopifyProductSyncActionResult>({
    url: "shopify/graphql",
    method: "post",
    data: {
      systemMessageRemoteId,
      queryText
    }
  }, "Shopify GraphQL send endpoint");
};

const pollBulkOperationResult = async (payload: any): Promise<ShopifyProductSyncActionResult> => {
  const parentSystemMessageTypeId = String(payload?.parentSystemMessageTypeId || "").trim();
  if (!parentSystemMessageTypeId) {
    throw new Error("Parent system message type id is required to poll a Shopify bulk operation result.");
  }

  return requestBackend<ShopifyProductSyncActionResult>({
    url: "shopify/bulk/result/poll",
    method: "post",
    data: {
      parentSystemMessageTypeId
    }
  }, "Shopify bulk result poll endpoint");
};

export const cancelSystemMessage = async (systemMessageId: string): Promise<ShopifyProductSyncActionResult> => {
  if (!String(systemMessageId || "").trim()) {
    throw new Error("System message id is required to cancel a Shopify product sync message.");
  }

  return requestBackend<ShopifyProductSyncActionResult>({
    url: `admin/systemMessages/${encodeURIComponent(systemMessageId)}`,
    method: "put",
    data: {
      systemMessageId,
      statusId: "SmsgCancelled"
    }
  }, "System message status update endpoint");
};
;

export const fetchReviewStats = async (payload: any): Promise<ShopifyProductSyncReviewStats> => {
  const stats = await fetchLiveCatalogCounts(payload);

  try {
    const omsProductResp = await requestBackend<any>({
      url: "oms/dataDocumentView",
      method: "post",
      data: {
        dataDocumentId: "PRODUCT_STORE_PRODUCT",
        pageIndex: 0,
        pageSize: 1,
        customParametersMap: {
          productStoreId: payload.productStoreId,
          isVirtual: "Y"
        },
        fieldsToSelect: "productCount,productStoreId"
      }
    });

    const omsVariantResp = await requestBackend<any>({
      url: "oms/dataDocumentView",
      method: "post",
      data: {
        dataDocumentId: "PRODUCT_STORE_PRODUCT",
        pageIndex: 0,
        pageSize: 1,
        customParametersMap: {
          productStoreId: payload.productStoreId,
          isVariant: "Y"
        },
        fieldsToSelect: "productCount,productStoreId"
      }
    });

    logger.info("Oms product and variant counts", { omsProductResp, omsVariantResp });

    stats.omsProductCount = omsProductResp?.entityValueList?.[0]?.productCount || 0;
    stats.omsVariantCount = omsVariantResp?.entityValueList?.[0]?.productCount || 0;
  } catch (error) {
    logger.warn("Failed to fetch OMS counts using dataDocumentView", error);
  }

  return stats;
};

export const fetchPreflight = async (payload: any): Promise<any[]> => {
  const { systemMessageRemoteId, productStoreId, productIdentifierEnumId } = payload;

  try {
    const shopifyResp = await api({
      url: "shopify/graphql",
      method: "post",
      data: {
        systemMessageRemoteId,
        queryText: `
          query WizardVariantSample($first: Int!) {
            productVariants(first: $first) {
              nodes {
                id
                sku
                barcode
                legacyResourceId
              }
            }
          }
        `,
        variables: { first: 10 }
      }
    }) as any;

    const graphQlPayload = shopifyResp?.data;
    const shopifyVariants = graphQlPayload?.response?.productVariants?.nodes || [];
    if (shopifyVariants.length === 0) return [];

    const shopifyVariantIds = shopifyVariants.map((v: any) => v.legacyResourceId);

    const omsResp = await api({
      url: "oms/dataDocumentView",
      method: "post",
      data: {
        dataDocumentId: "PRODUCT_STORE_PRODUCT",
        customParametersMap: {
          productStoreId,
          shopifyProductId: shopifyVariantIds
        },
        fieldsToSelect: "shopifyProductId,internalName"
      }
    }) as any;

    const omsProducts = omsResp?.data?.entityValueList || [];

    return shopifyVariants.map((v: any) => {
      const omsProduct = omsProducts.find((p: any) => p.shopifyProductId === v.legacyResourceId);

      let shopifyValue = "";
      switch (productIdentifierEnumId) {
        case "SHOPIFY_PRODUCT_SKU":
          shopifyValue = v.sku;
          break;
        case "SHOPIFY_BARCODE":
          shopifyValue = v.barcode;
          break;
        case "SHOPIFY_PRODUCT_ID":
          shopifyValue = v.legacyResourceId;
          break;
      }

      return {
        shopifyVariantId: v.id,
        shopifyProductId: v.legacyResourceId,
        shopifyValue,
        omsValue: omsProduct ? omsProduct.internalName : null,
        isMatched: omsProduct ? (omsProduct.internalName === shopifyValue) : false
      };
    });
  } catch (error) {
    logger.error("Failed to fetch preflight data", error);
    throw error;
  }
};


export const fetchSyncJobConfig = async (payload: any): Promise<{ isConfigured: boolean; jobName: string }> => {
  const shopId = payload.shopId;

  try {
    const resp = await api({
      url: "oms/dataDocumentView",
      method: "post",
      data: {
        dataDocumentId: "SERVICE_JOB_PARAMETER",
        pageIndex: 0,
        pageSize: 1,
        customParametersMap: {
          parameterName: "shopId",
          parameterValue: shopId,
          parentJobName: "sync_ShopifyProductUpdates"
        }
      }
    }) as any;

    const entityValueList = resp?.data?.entityValueList || [];
    if (entityValueList.length > 0) {
      return { isConfigured: true, jobName: entityValueList[0].jobName };
    }
  } catch (error) {
    logger.warn("Failed to fetch sync job config using dataDocumentView", error);
  }

  return { isConfigured: false, jobName: "" };
};


// `configureSyncJob` from the store is NOT ported here: `configureProductSyncJob` (section 2)
// already replaces it and additionally refreshes the cached `serviceJob` row, which the store version
// did not — without that the new job stays invisible to every cached read until the next login.


const fetchErrorRecordCount = async (payload: any): Promise<number> => {
  const { shopId, configId } = payload;
  const finishDateTimeFrom = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago in ms

  try {
    const response = await requestBackend<any>({
      url: "oms/dataDocumentView",
      method: "post",
      data: {
        dataDocumentId: "DATA_MANAGER_LOG_AND_PARAMETER",
        customParametersMap: {
          configId: configId || "SYNC_SHOPIFY_PRODUCT",
          parameterName: "shopId",
          parameterValue: shopId,
          failedRecordCount: 0,
          failedRecordCount_op: "equals",
          failedRecordCount_not: "true",
          finishDateTime_from: finishDateTimeFrom.toString()
        },
        fieldsToSelect: "failedRecordCount"
      }
    });

    return Number(response?.entityValueList?.[0]?.failedRecordCount || 0);
  } catch (error) {
    logger.warn("Failed to fetch error record count using dataDocumentView", error);
    return 0;
  }
};

export const fetchUpdateFilesToProcessCount = async (payload: any): Promise<number> => {
  const { shopId, configId } = payload;
  try {
    const response = await requestBackend<any>({
      url: "oms/dataDocumentView",
      method: "post",
      data: {
        dataDocumentId: "DATA_MANAGER_LOG_AND_PARAMETER",
        pageSize: 1,
        pageIndex: 0,
        customParametersMap: {
          configId: configId || "SYNC_SHOPIFY_PRODUCT",
          parameterName: "shopId",
          parameterValue: shopId,
          statusId: ["DmlSuccess", "DmlError", "DmlCancelled"],
          statusId_not: "true"
        }
      }
    });

    return Number(response?.entityValueListCount || 0);
  } catch (error: any) {
    logger.warn("Failed to fetch update files to process count using dataDocumentView", error);
    return 0;
  }
};

export const fetchDashboardSummary = async (payload: any): Promise<ShopifyProductSyncDashboardSummary> => {
  const { systemMessageRemoteId } = payload;

  const [syncRunState, pendingRequests, runningOperation, updateFilesToProcess] = await Promise.all([
    fetchProductUpdateSyncRunState(payload).catch(e => { logger.error("Failed to fetch product update sync run state", e); return { systemMessages: [], lastSyncedAt: "" } as any }),
    fetchPendingProductUpdateRequests(payload).catch(e => { logger.error("Failed to fetch pending product update requests", e); return { count: 0 } as any }),
    fetchRunningBulkOperation(payload).catch(e => { logger.warn("Failed to fetch running bulk operation (likely GraphQL error)", e); return null }),
    fetchUpdateFilesToProcessCount(payload).catch(e => { logger.error("Failed to fetch update files to process count", e); return 0 })
  ]);

  let unsyncedUpdates = { count: 0, products: [] } as any;
  try {
    unsyncedUpdates = await fetchShopifyShopProductCount({
      ...payload,
      systemMessageRemoteId,
      syncRunState
    });
  } catch (error) {
    logger.warn("Failed to fetch unsynced product updates (likely GraphQL error)", error);
  }

  return {
    syncRunState,
    pendingRequests,
    runningOperation,
    unsyncedUpdates,
    updateFilesToProcess
  };
};

export const fetchWebhookSubscriptions = async (payload: any): Promise<any> => {
  const response = await requestBackend<any>({
    url: "shopify/webhook-subscription",
    method: "get",
    params: {
      systemMessageRemoteId: payload.systemMessageRemoteId,
      queryParams: {
        topics: payload.topic
      }
    }
  });

  return response?.webhookList || [];
}

export const subscribeWebhook = async (payload: any): Promise<any> => {
  return await requestBackend<any>({
    url: "shopify/webhook-subscription",
    method: "post",
    data: {
      systemMessageRemoteId: payload.systemMessageRemoteId,
      topic: payload.topic
    }
  });
};

export const unsubscribeWebhook = async (payload: any): Promise<any> => {
  return await requestBackend<any>({
    url: "shopify/webhook-subscription",
    method: "delete",
    data: {
      systemMessageRemoteId: payload.systemMessageRemoteId,
      webhookSubscriptionId: payload.webhookSubscriptionId
    }
  });
};
