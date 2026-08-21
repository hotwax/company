import { computed, ref } from "vue";
import { DateTime } from "luxon";
import { api, commonUtil, logger, translate } from "@common";
import { getResponseErrorMessage } from "@/utils";
import { isEffectiveNow, toCount, toMillis } from "@/utils/cacheProjection";
import { facilityGroupTypeLabel } from "@/utils/facilityGroupTypeLabels";
import { refreshAfterMutation, resyncDomain } from "@/services/appCacheBootstrap";
import { facilityCache, facilityGroupCache, facilityTypeCache, groupFacilityCache } from "@/utils/cacheEntities";
import { facilityGroupProductStoreCache, productStoreFacilityCache } from "@/utils/cacheEntities";
import { useShopifyFacilityMappings } from "./useShopify";
import { useTypedEnums } from "./useSeed";
import { useFacilityIdentifications } from "./useNetSuite";
import { byDescription, useCachedList, useCachedRecord } from "./useCachedList";

/**
 * Facility master entity — facilities, their types, and facility GROUPS with their memberships.
 *
 * Groups live here rather than in a file of their own because they are part of the facility
 * aggregate: a group is meaningless without the facilities in it, and the member count is a fold
 * over the same data. Application logic for anything facility-shaped belongs in this file.
 */

// ---------------------------------------------------------------------------------------------
// Facilities
// ---------------------------------------------------------------------------------------------

/**
 * A virtual facility — a parking/holding location rather than a physical one.
 *
 * The type is nested: these rows carry `facilityTypeId` values like `BACKORDER` or `NA` with
 * `parentTypeId = VIRTUAL_FACILITY`, so checking `facilityTypeId` alone misses them. The server
 * equivalent is `admin/facilities?facilityTypeId=VIRTUAL_FACILITY&facilityTypeId_not=Y`, which
 * filters on the hierarchy.
 */
export function isVirtualFacility(facility: any): boolean {
  return facility?.facilityTypeId === "VIRTUAL_FACILITY" || facility?.parentTypeId === "VIRTUAL_FACILITY";
}

/** Parties rendered in Facility Details' staff section, excluding login and carrier associations. */
export function isFacilityStaffParty(party: any): boolean {
  return party?.roleTypeId !== "FAC_LOGIN" && party?.roleTypeId !== "CARRIER";
}

export interface FacilityFilters {
  /**
   * Drop virtual (parking) facilities. The physical-facility screens need this: the cache holds
   * EVERY facility, whereas those screens previously fetched with the virtual types excluded
   * server-side, so reading the cache unfiltered surfaces parkings that never used to appear.
   */
  excludeVirtual?: boolean;
  /** Keep only these `facilityTypeId` values. */
  facilityTypeIds?: string[];
  /** Keep only these `parentTypeId` values. */
  parentTypeIds?: string[];
  /** Arbitrary extra predicate for anything the flags above do not express. */
  where?: (facility: any) => boolean;
}

/**
 * Cached facilities, narrowed by `filters`.
 *
 * Filtering happens locally over the complete cached set — the whole point of caching it — so a
 * screen states which facilities it wants rather than issuing a scoped request.
 */
export function useFacilities(filters: FacilityFilters = {}) {
  const { records, hydrated } = useCachedList<any>(facilityCache);

  const facilities = computed(() => records.value.filter((facility: any) => {
    if (filters.excludeVirtual && isVirtualFacility(facility)) return false;
    if (filters.facilityTypeIds?.length && !filters.facilityTypeIds.includes(facility.facilityTypeId)) return false;
    if (filters.parentTypeIds?.length && !filters.parentTypeIds.includes(facility.parentTypeId)) return false;
    if (filters.where && !filters.where(facility)) return false;
    return true;
  }));

  return { facilities, records, hydrated };
}

export const useFacilityRecord = (facilityId: string | undefined) =>
  useCachedRecord(facilityCache, "facilityId", facilityId);

export interface FacilityTypeFilters {
  /**
   * Drop the virtual (parking) type hierarchy, leaving only physical facility types.
   *
   * On the current seed data this yields exactly: Distribution Center, Outlet Store, Outlet
   * Warehouse, Physical Store, Retail Store, Warehouse. Expressed as a rule rather than an id
   * allowlist so a newly added physical type appears automatically, while any new parking type
   * stays out.
   */
  excludeVirtual?: boolean;
  /** Keep only these ids, when a screen needs an explicit set. */
  facilityTypeIds?: string[];
}

/** Facility types, description-ordered for pickers, narrowed by `filters`. */
export function useFacilityTypes(filters: FacilityTypeFilters = {}) {
  const { records, hydrated } = useCachedList<any>(facilityTypeCache);

  const facilityTypes = computed(() => records.value
    .filter((type: any) => {
      // A type row carries the same `facilityTypeId` / `parentTypeId` shape as a facility row,
      // so the virtual-hierarchy rule applies unchanged.
      if (filters.excludeVirtual && isVirtualFacility(type)) return false;
      if (filters.facilityTypeIds?.length && !filters.facilityTypeIds.includes(type.facilityTypeId)) return false;
      return true;
    })
    .sort(byDescription));

  return { facilityTypes, hydrated };
}

/** The group parkings are archived into. Archiving is a group membership, not a facility change. */
export const ARCHIVE_FACILITY_GROUP_ID = "ARCHIVE";

/**
 * Virtual (parking) facilities — the complement of what the physical-facility screens show.
 *
 * Archived parkings are excluded, because archiving does not change the facility row: an archived
 * parking is still a `VIRTUAL_FACILITY` in the facility table and only its ARCHIVE group membership
 * marks it. Filtering on the facility rows alone would keep showing it in the active list.
 */
export function useFacilityPartitions() {
  const { records, hydrated } = useCachedList<any>(facilityCache);
  const { archivedIds } = useArchivedFacilities();

  const allVirtual = computed(() => records.value.filter(isVirtualFacility));

  return {
    virtualFacilities: computed(() => allVirtual.value.filter((facility: any) => !archivedIds.value.has(facility.facilityId))),
    /** Including archived — for screens that need the whole set. */
    allVirtualFacilities: allVirtual,
    hydrated,
  };
}

/**
 * Parkings archived into the ARCHIVE group.
 *
 * Returns MEMBERSHIP rows, not facility rows, and that matters: unarchiving closes a date-effective
 * association, so it needs the association's original `fromDate` — which only the membership row
 * carries. Joining the facility row in supplies the name/description the modal renders.
 */
export function useArchivedFacilities() {
  const { active, hydrated: membershipsHydrated } = useGroupMembershipIndex();
  const { records: facilities, hydrated: facilitiesHydrated } = useCachedList<any>(facilityCache);

  const archivedMembers = computed(() =>
    active.value.filter((row: any) => row.facilityGroupId === ARCHIVE_FACILITY_GROUP_ID));

  const archivedIds = computed(() =>
    new Set(archivedMembers.value.map((row: any) => row.facilityId)));

  const archivedFacilities = computed(() => {
    const byId = new Map(facilities.value.map((facility: any) => [facility.facilityId, facility]));
    return archivedMembers.value.map((row: any) => ({
      ...(byId.get(row.facilityId) ?? { facilityId: row.facilityId, facilityName: row.facilityName }),
      // `fromDate` identifies the association to close — keep the membership's value, never the
      // facility's, and keep it last so a facility field can never shadow it.
      fromDate: row.fromDate,
    }));
  });

  return {
    archivedFacilities,
    archivedMembers,
    archivedIds,
    hydrated: computed(() => membershipsHydrated.value && facilitiesHydrated.value),
  };
}

// ---------------------------------------------------------------------------------------------
// Facility groups (part of the facility aggregate)
// ---------------------------------------------------------------------------------------------

/** Groups with their member counts folded in — what the group list renders. */
export function useFacilityGroups() {
  const { records, hydrated } = useCachedList<any>(facilityGroupCache);
  const { facilityCountByGroup } = useGroupFacilityCounts();

  const { productStoreCountByGroup } = useFacilityGroupProductStoreCounts();

  const facilityGroups = computed(() => records.value.map((group: any) => ({
    ...group,
    facilityCount: facilityCountByGroup.value[group.facilityGroupId] ?? 0,
    productStoreCount: productStoreCountByGroup.value[group.facilityGroupId] ?? 0,
  })));

  return { facilityGroups, records, hydrated };
}

export const useFacilityGroupRecord = (facilityGroupId: string | undefined) =>
  useCachedRecord(facilityGroupCache, "facilityGroupId", facilityGroupId);

/**
 * Members of one group, or every membership when no group is given.
 *
 * `fromDate`/`thruDate` are served from the PROJECTION, not the raw server row. `useCachedList`
 * hands back `row.raw`, i.e. whatever shape the OMS emitted the timestamp as, and the group screen
 * echoes `fromDate` back on every membership revision. Since `store` matches the row on the exact
 * timestamp, echoing an un-normalized value inserts a duplicate member instead of updating one —
 * see `useFacilityGroupMutations.saveMembers`. The projected value is always epoch millis.
 *
 * `sequenceNum` is coerced for the same reason one step removed: the screen decides which members to
 * rewrite by comparing the stored number against the renumbered one, and a `"3"` never equals a `3`.
 * That comparison failing marks EVERY member as resequenced, so a single unmatched `fromDate` stops
 * being one duplicate row and becomes a duplicate of the whole group.
 */
export function useGroupFacilities(facilityGroupId?: string) {
  const { rows, records, hydrated } = useCachedList<any>(
    groupFacilityCache,
    facilityGroupId ? { scope: { field: "facilityGroupId", value: facilityGroupId } } : {},
  );
  const members = computed<any[]>(() => rows.value.map((row: any) => {
    const raw = row.raw ?? {};
    const sequenceNum = toCount(raw.sequenceNum);
    return {
      ...raw,
      facilityGroupId: row.facilityGroupId,
      facilityId: row.facilityId,
      fromDate: row.fromDate,
      ...(row.thruDate === undefined ? {} : { thruDate: row.thruDate }),
      ...(sequenceNum === undefined ? {} : { sequenceNum }),
    };
  }));
  return { members, records, hydrated };
}

/** facilityGroupId → member count, honoring `thruDate` (memberships are date-effective). */
export function useGroupFacilityCounts() {
  const { records, hydrated } = useCachedList<any>(groupFacilityCache);
  return {
    facilityCountByGroup: computed<Record<string, number>>(() => {
      const now = Date.now();
      return records.value.reduce((map: Record<string, number>, row: any) => {
        const thru = row.thruDate ? Number(row.thruDate) : null;
        if (thru && thru < now) return map; // expired membership
        map[row.facilityGroupId] = (map[row.facilityGroupId] ?? 0) + 1;
        return map;
      }, {});
    }),
    hydrated,
  };
}

/**
 * Membership indexes derived from the cached membership table — both directions the pages need.
 * Expired memberships (`thruDate` in the past) are excluded, matching the server's `filterByDate`.
 */
export function useGroupMembershipIndex() {
  const { records, hydrated } = useCachedList<any>(groupFacilityCache);

  const active = computed(() => {
    const now = Date.now();
    return records.value.filter((row: any) => !row.thruDate || Number(row.thruDate) >= now);
  });

  /** facilityId → the groups it belongs to (what the facility list renders). */
  const groupsByFacility = computed<Record<string, any[]>>(() =>
    active.value.reduce((map: Record<string, any[]>, row: any) => {
      (map[row.facilityId] ||= []).push(row);
      return map;
    }, {}));

  /** facilityGroupId → member facility ids (what the group filter needs). */
  const facilityIdsByGroup = computed<Record<string, string[]>>(() =>
    active.value.reduce((map: Record<string, string[]>, row: any) => {
      (map[row.facilityGroupId] ||= []).push(row.facilityId);
      return map;
    }, {}));

  return { groupsByFacility, facilityIdsByGroup, active, hydrated };
}

/**
 * The facility group types actually in use, derived from the cached groups.
 *
 * There is no endpoint for these. `oms/facilityGroups/types` — which the Pinia store also called —
 * returns a 200 with an EMPTY BODY and no paging headers, the signature of an unmatched route
 * rather than an empty table; `FacilityGroupType` appears in no `.rest.xml` in the OMS. So the type
 * filter and picker have always been blank.
 *
 * Deriving the distinct ids off `facilityGroups` makes them work.
 */
export function useFacilityGroupTypes() {
  const { records, hydrated } = useCachedList<any>(facilityGroupCache);
  const facilityGroupTypes = computed(() => {
    const seen = new Set<string>();
    for (const group of records.value as any[]) {
      if (group?.facilityGroupTypeId) seen.add(group.facilityGroupTypeId);
    }
    return [...seen].sort().map((facilityGroupTypeId) => ({
      facilityGroupTypeId,
      description: facilityGroupTypeLabel(facilityGroupTypeId),
    }));
  });
  return { facilityGroupTypes, hydrated };
}

/**
 * Types the app must be able to assign to a group that does not exist yet.
 *
 * Derivation can only ever surface a type some group already uses, so on its own it makes the FIRST
 * group of a type impossible to create — the type is absent from the picker until a group already
 * has it. These ids are the ones the OMS and the sibling apps act on, so they stay assignable on an
 * instance that has no group of that type yet.
 */
const ASSIGNABLE_FACILITY_GROUP_TYPE_IDS = [
  // order brokering / routing groups
  "BROKERING_GROUP",
  // inventory channel ("sell online") groups
  "CHANNEL_FAC_GROUP",
  "FEATURING",
  "PICKUP",
];

/**
 * The types offered when creating or editing a group.
 *
 * Deliberately not the same list as `useFacilityGroupTypes`: that one describes what the instance
 * actually has and so is right for the type *filter*, where an option matching no group is a dead
 * end. Assigning a type is the opposite case — the whole point is to use a type no group has yet.
 */
export function useFacilityGroupTypeOptions() {
  const { facilityGroupTypes, hydrated } = useFacilityGroupTypes();
  const facilityGroupTypeOptions = computed(() => {
    const seen = new Set<string>(ASSIGNABLE_FACILITY_GROUP_TYPE_IDS);

    for (const type of facilityGroupTypes.value) {
      seen.add(type.facilityGroupTypeId);
    }

    return [...seen].sort().map((facilityGroupTypeId) => ({
      facilityGroupTypeId,
      description: facilityGroupTypeLabel(facilityGroupTypeId),
    }));
  });
  return { facilityGroupTypeOptions, hydrated };
}


/**
 * Facility ↔ product store associations, cached at app load (fanned out over product stores).
 *
 * Pass a facilityId to get the stores one facility belongs to; omit it to read the whole map,
 * which is what lets the facility list filter by product store.
 */
export function useFacilityProductStores(facilityId?: string) {
  const { records, hydrated } = useCachedList<any>(
    productStoreFacilityCache,
    facilityId ? { scope: { field: "facilityId", value: facilityId } } : {},
  );

  /** facilityId → productStoreId[] — the index the facility list filters on. */
  const storesByFacility = computed<Record<string, string[]>>(() =>
    records.value.reduce((map: Record<string, string[]>, row: any) => {
      (map[row.facilityId] ||= []).push(row.productStoreId);
      return map;
    }, {}));

  return { associations: records, storesByFacility, records, hydrated };
}


/**
 * Shopify mappings for a facility, re-exported from the Shopify domain so facility pages have a
 * single import surface. Resolved from cache by joining shop locations with shops.
 */
export const useFacilityShopifyMappings = (facilityId: string | undefined) =>
  useShopifyFacilityMappings(facilityId);


/**
 * Facility group ↔ product store associations (`ProductStoreFacilityGroup`).
 *
 * Date-effective, so expired rows (`thruDate` in the past) are excluded — the same rule the
 * membership counts use.
 */
export function useFacilityGroupProductStores(facilityGroupId?: string) {
  const { records, hydrated } = useCachedList<any>(
    facilityGroupProductStoreCache,
    facilityGroupId ? { scope: { field: "facilityGroupId", value: facilityGroupId } } : {},
  );
  // `Date.now()` belongs INSIDE the computed. Read once at setup it freezes the cutoff at the
  // moment the composable ran, so a row expired later in the same session still counts as active —
  // the group's product-store count stayed put after a removal until a reload, and two pages that
  // mounted at different times disagreed. Same rule as `useGroupFacilityCounts`.
  const active = computed(() => {
    const now = Date.now();
    return records.value.filter((row: any) => !row.thruDate || Number(row.thruDate) > now);
  });
  return { associations: active, all: records, hydrated };
}

/** facilityGroupId → number of active product stores, for the group list. */
export function useFacilityGroupProductStoreCounts() {
  const { associations, hydrated } = useFacilityGroupProductStores();
  return {
    productStoreCountByGroup: computed<Record<string, number>>(() =>
      associations.value.reduce((map: Record<string, number>, row: any) => {
        map[row.facilityGroupId] = (map[row.facilityGroupId] ?? 0) + 1;
        return map;
      }, {})),
    hydrated,
  };
}

/**
 * Everything the facility detail page reads, behind one import.
 *
 * The page must not know which parts came from the local cache and which from the network, so the
 * three sources are merged into a single `current` object shaped exactly like the old
 * `facilityStore.current` aggregate. What the page DOES get is three independent readiness flags,
 * so each section can paint as its own data arrives instead of waiting on the slowest request:
 *
 *   - `hydrated`            cached parts are on screen (immediate on a warm cache)
 *   - `loadingAssociations` live per-facility data still in flight
 *   - `loadingVolatile`     order counts still in flight
 *
 * Volatile data is deliberately NOT merged into the cached row — see `refreshVolatile`.
 */
/**
 * Today's allocated-order count per facility — volatile, never cached.
 *
 * `admin/facilities/orderCount` is a TIME SERIES: one row per facility per `entryDate`, oldest
 * first, paged at 20. Two mistakes follow from assuming it returns one row per facility:
 *   - taking the first match yields the OLDEST day on record (BROADWAY's first row is June 2024);
 *   - the field is `lastOrderCount` — there is no `orderCount`, so reading that always gave 0.
 * Filtering to today is what makes the number mean "orders allocated today", which is what every
 * screen binding it claims to show.
 */
/**
 * The facility-search filter state, shared across visits to the find screen.
 *
 * Module-level on purpose: it is view state, not domain data, so it does not belong in the cache —
 * but it does need to survive navigating to a facility and back, which a component-local ref would
 * not. It is intentionally NOT persisted across reloads; a fresh load starts unfiltered.
 */
export interface FacilitySearchQuery {
  queryString: string;
  productStoreId: string;
  facilityTypeId: string;
  facilityGroupId: string;
}

const facilitySearchQuery = ref<FacilitySearchQuery>({
  queryString: "", productStoreId: "", facilityTypeId: "", facilityGroupId: "",
});

export function useFacilitySearchQuery() {
  const setQuery = (next: Partial<FacilitySearchQuery>) => {
    facilitySearchQuery.value = { ...facilitySearchQuery.value, ...next };
  };
  const resetQuery = () => {
    facilitySearchQuery.value = { queryString: "", productStoreId: "", facilityTypeId: "", facilityGroupId: "" };
  };
  return { query: facilitySearchQuery, setQuery, resetQuery };
}

/**
 * Group membership read straight from the SERVER for a set of facilities.
 *
 * Deliberately not the cache: this backs the bulk sell-online write, where acting on a stale
 * membership would create a duplicate association or close the wrong row. It runs only on that
 * write path, so it costs nothing on page load.
 */
export function useFacilityGroupMembershipReader() {
  async function fetchGroupMemberships(facilityIds: string[]): Promise<Record<string, any[]>> {
    const byFacility: Record<string, any[]> = {};
    await Promise.all(facilityIds.map(async (facilityId) => {
      try {
        const resp: any = await api({
          url: `oms/facilities/${encodeURIComponent(facilityId)}/groups`,
          method: "get",
          params: { pageNoLimit: true },
        });
        byFacility[facilityId] = Array.isArray(resp?.data) ? resp.data : [];
      } catch (error) {
        logger.error(`Failed to read groups for ${facilityId}`, error);
        byFacility[facilityId] = [];
      }
    }));
    return byFacility;
  }
  return { fetchGroupMemberships };
}

/**
 * Toggle a facility's membership of a "sell inventory online" channel group.
 *
 * A composite rather than a raw endpoint wrapper, because "sells online" is domain knowledge, not
 * an API concept: it means holding an active membership of a `CHANNEL_FAC_GROUP`, adding is a POST
 * and removing is a POST of a `thruDate` against the existing row's `fromDate`. It re-reads
 * membership from the server afterwards so the caller reflects committed state, not its guess.
 *
 * Returns the fresh membership, or null if the write failed.
 */
export function useFacilitySellOnline() {
  const { fetchGroupMemberships } = useFacilityGroupMembershipReader();

  async function setGroupMembership(facility: any, facilityGroup: any, enable: boolean) {
    const facilityId = facility?.facilityId;
    const facilityGroupId = facilityGroup?.facilityGroupId;
    if (!facilityId || !facilityGroupId) return null;

    const mutations = useFacilityMutations(facilityId);
    try {
      let resp: any;
      if (enable) {
        resp = await mutations.addToGroup({ facilityGroupId, fromDate: DateTime.now().toMillis() });
      } else {
        const existing = (facility.groupInformation ?? [])
          .find((group: any) => group.facilityGroupId === facilityGroupId);
        if (!existing) return null;
        resp = await mutations.updateGroupAssociation({
          facilityGroupId,
          fromDate: existing.fromDate,
          thruDate: DateTime.now().toMillis(),
        });
      }
      if (commonUtil.hasError(resp)) throw resp.data;

      commonUtil.showToast(translate(
        enable ? "is now selling on" : "no longer sells on",
        { facilityName: facility.facilityName, facilityGroupId: facilityGroup.facilityGroupName },
      ));

      const byFacility = await fetchGroupMemberships([facilityId]);
      const groupInformation = byFacility[facilityId] ?? [];
      return {
        groupInformation,
        sellOnline: groupInformation.some((group: any) => group.facilityGroupTypeId === "CHANNEL_FAC_GROUP"),
      };
    } catch (error) {
      commonUtil.showToast(translate("Failed to update sell inventory online setting"));
      logger.error("Failed to update sell inventory online setting", error);
      return null;
    }
  }

  return { setGroupMembership };
}

/**
 * Facility identification ("external mapping") types, from the cached enums.
 *
 * `FACILITY_IDENTITY` enums only — NOT the whole enum catalog. `SHOPIFY_FAC_ID` is excluded from
 * `selectable` because the mapping popover offers Shopify as its own dedicated option; it is still
 * present in `byId` so an existing Shopify identification can be labelled.
 */
export function useFacilityIdentificationTypes() {
  const { values } = useTypedEnums("FACILITY_IDENTITY");

  const byId = computed<Record<string, string>>(() =>
    values.value.reduce((map: Record<string, string>, row: any) => {
      if (row.enumId) map[row.enumId] = row.description ?? row.enumId;
      return map;
    }, {}));

  const selectable = computed<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(byId.value).filter(([enumId]) => enumId !== "SHOPIFY_FAC_ID")));

  return { byId, selectable };
}

/**
 * Facility operating-hours calendars.
 *
 * Two halves with different maturity:
 *
 *  - **Association** (`saveCalendar` / `removeCalendar` in `useFacilityMutations`) works today
 *    against `oms/facilities/{id}/calendars`, and the facility's current calendar is read by the
 *    detail façade from that same route.
 *  - **The calendar catalog and custom-schedule create** below target `oms/calendars/techData`
 *    and `oms/calendars/techData/week`. ⚠️ Those routes do NOT exist on the instance yet — probed
 *    live, both 404 ("Resource calendars not valid"). They are the contract the legacy store was
 *    written against and are pending a backend merge, so they are implemented here to that shape
 *    and degrade to an empty catalog rather than throwing. Once the API lands, the picker
 *    populates with no further change here.
 */
export function useFacilityCalendars() {
  const calendarOptions = ref<any[]>([]);
  const catalogAvailable = ref(true);

  /** The selectable calendars, each merged with its week timings. */
  async function loadCalendarOptions(): Promise<any[]> {
    try {
      const [catalogResp, weekResp]: any[] = await Promise.all([
        api({ url: "oms/calendars/techData", method: "get", params: { pageNoLimit: true } }),
        api({ url: "oms/calendars/techData/week", method: "get", params: { pageNoLimit: true } }),
      ]);
      const catalog: any[] = Array.isArray(catalogResp?.data) ? catalogResp.data : [];
      const weeks: any[] = Array.isArray(weekResp?.data) ? weekResp.data : [];
      calendarOptions.value = catalog.map((calendar: any) => ({
        ...calendar,
        ...weeks.find((week: any) => week.calendarWeekId === calendar.calendarWeekId),
      }));
      catalogAvailable.value = true;
    } catch (error) {
      // Expected until the techData routes merge — an empty picker, not a broken page.
      catalogAvailable.value = false;
      calendarOptions.value = [];
      logger.error("Calendar catalog unavailable (oms/calendars/techData)", error);
    }
    return calendarOptions.value;
  }

  /**
   * Create a custom weekly schedule and attach it to a facility in one call. The nested body is
   * the OFBiz entity shape the endpoint expects — a TechDataCalendar carrying a FacilityCalendar.
   */
  async function createCalendar(payload: Record<string, any>) {
    const { description, facilityId, fromDate, facilityCalendarTypeId, ...weekTimings } = payload;
    return api({
      url: "oms/calendars/techData/week",
      method: "post",
      data: {
        ...weekTimings,
        "org.apache.ofbiz.manufacturing.techdata.TechDataCalendar": {
          description,
          "org.apache.ofbiz.product.facility.FacilityCalendar": { facilityId, fromDate, facilityCalendarTypeId },
        },
      },
    }) as Promise<any>;
  }

  /** The facility's currently effective OPERATING_HOURS calendar, or {}. */
  async function fetchFacilityCalendar(facilityId: string): Promise<Record<string, any>> {
    try {
      const resp: any = await api({
        url: `oms/facilities/${encodeURIComponent(facilityId)}/calendars`,
        method: "get",
        params: { pageNoLimit: true },
      });
      const rows: any[] = Array.isArray(resp?.data) ? resp.data : [];
      const now = Date.now();
      return rows.find((row) => row.facilityCalendarTypeId === "OPERATING_HOURS" && isEffectiveNow(row, now)) ?? {};
    } catch (error) {
      logger.error("Failed to read facility calendar", error);
      return {};
    }
  }

  return { calendarOptions, catalogAvailable, loadCalendarOptions, createCalendar, fetchFacilityCalendar };
}

export function usePartyQueries() {
  const fetchPartyRoleDetails = async (roleTypeId: string, params: Record<string, any>) => {
    return api({ url: `oms/parties/roles/${roleTypeId}`, method: "get", params });
  };

  return { fetchPartyRoleDetails };
}

export function useFacilityOrderCounts() {
  async function fetchOrderCounts(facilityIds: string[]): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    if (!facilityIds.length) return counts;
    try {
      const resp: any = await api({
        url: "admin/facilities/orderCount",
        method: "get",
        params: {
          facilityId: facilityIds,
          facilityId_op: "in",
          entryDate: DateTime.now().toFormat("yyyy-MM-dd"),
          pageSize: facilityIds.length,
        },
      });
      const rows: any[] = Array.isArray(resp?.data) ? resp.data : [];
      for (const row of rows) {
        if (row?.facilityId) counts[row.facilityId] = Number(row.lastOrderCount ?? 0);
      }
    } catch (error) {
      logger.error("Failed to fetch facility order counts", error);
    }
    return counts;
  }

  async function fetchFacilityOrderCountsHistory(facilityId: string, params: Record<string, any> = {}) {
    return api({
      url: "oms/facilities/facilityOrderCounts",
      method: "get",
      params: { facilityId, ...params }
    });
  }

  return { fetchOrderCounts, fetchFacilityOrderCountsHistory };
}

export function useFacilityDetail(facilityId: string) {
  // ---------------------------------------------------------------- cached (instant)
  const { record: facility, hydrated } = useFacilityRecord(facilityId);
  const { associations: productStoreLinks } = useFacilityProductStores(facilityId);
  const { mappings: shopifyFacilityMappings } = useFacilityShopifyMappings(facilityId);
  const { groupsByFacility } = useGroupMembershipIndex();
  // Cached globally (one list for every facility) — narrow to this one.
  const { identifications: allIdentifications } = useFacilityIdentifications();
  const identifications = computed(() =>
    allIdentifications.value.filter((row: any) => row.facilityId === facilityId));

  // ------------------------------------------------------- live, per visit (not cached)
  const postalAddress = ref<Record<string, any>>({});
  const contactDetails = ref<Record<string, any>>({});
  const calendar = ref<Record<string, any>>({});
  const parties = ref<any[]>([]);
  const locations = ref<any[]>([]);
  const calendarOptions = ref<any[]>([]);
  const loadingAssociations = ref(false);

  // ----------------------------------------------------------------- volatile
  const orderCount = ref<number | null>(null);
  const loadingVolatile = ref(false);
  const { fetchOrderCounts } = useFacilityOrderCounts();

  const get = async (url: string, params: Record<string, any> = {}) =>
    (await api({ url, method: "get", params })) as any;

  /**
   * Contact mechs arrive as one flat list and are split by `contactMechTypeId`, matching the
   * shape the template already binds (`postalAddress`, `contactDetails.telecomNumber`, …).
   */
  async function loadContactMechs() {
    const resp = await get("oms/facilityContactMechs", { facilityId, pageNoLimit: true });
    const rows = resp?.data?.facilityContactMechs ?? [];
    const address: Record<string, any> = {};
    const details: Record<string, any> = {};
    for (const item of rows) {
      if (item.contactMechTypeId === "POSTAL_ADDRESS") Object.assign(address, item);
      else if (item.contactMechTypeId === "TELECOM_NUMBER") {
        details.telecomNumber = { contactMechId: item.contactMechId, contactNumber: item.contactNumber, countryCode: item.countryCode };
      } else if (item.contactMechTypeId === "EMAIL_ADDRESS") {
        details.emailAddress = { contactMechId: item.contactMechId, infoString: item.infoString };
      } else if (item.contactMechTypeId === "MAP_URL") {
        details.googleMapUrl = { contactMechId: item.contactMechId, infoString: item.infoString };
      }
    }
    postalAddress.value = address;
    contactDetails.value = details;
  }

  /**
   * Staff on this facility. Two things the raw response does not give us:
   *
   * - `fullName`, which the roster binds — parties are either people (firstName/lastName) or
   *   organisations (groupName), so it is composed here rather than in the template.
   * - date-effectivity. This endpoint returns thru-dated rows (BROADWAY alone had 4 closed
   *   memberships listed as current staff), and "remove staff" closes a row with a `thruDate`,
   *   so without this filter removal silently appears to do nothing.
   */
  async function loadParties() {
    const resp = await get(`oms/facilities/${encodeURIComponent(facilityId)}/parties`, { pageNoLimit: true });
    const rows: any[] = Array.isArray(resp?.data) ? resp.data : []; // verified: bare array
    const now = Date.now();
    parties.value = rows
      .filter((party) => isEffectiveNow(party, now))
      .map((party) => ({
        ...party,
        fullName: party.groupName
          || [party.firstName, party.lastName].filter(Boolean).join(" ").trim()
          || party.partyId,
      }));
  }

  async function loadLocations() {
    const resp = await get(`oms/facilities/${encodeURIComponent(facilityId)}/locations`, { pageNoLimit: true });
    locations.value = Array.isArray(resp?.data) ? resp.data : []; // verified: bare array
  }

  /**
   * NOTE: the route is `.../calendars`, NOT `.../calendars/operatingHours`.
   *
   * The store called the `/operatingHours` variant, which 404s ("Resource operatingHours not
   * valid") — verified live. So the facility calendar has never actually loaded, and the page has
   * always rendered its "no operating hours" branch. Filtering by type happens client-side.
   */
  async function loadCalendar() {
    const resp = await get(`oms/facilities/${encodeURIComponent(facilityId)}/calendars`, { pageNoLimit: true });
    const rows: any[] = Array.isArray(resp?.data) ? resp.data : [];
    calendar.value = rows.find((row) => row.facilityCalendarTypeId === "OPERATING_HOURS") ?? rows[0] ?? {};
  }

  /**
   * The old `oms/calendars/techData` endpoint does NOT exist — it 404s ("Resource calendars not
   * valid") and appears in no REST definition, so the store's calendar picker has always been
   * empty. Left unimplemented rather than guessing at a replacement: the correct source needs to
   * be identified before the picker can work.
   */
  async function loadCalendarOptions() {
    calendarOptions.value = [];
  }

  /** Live per-facility data. Runs on entry and after any mutation that touches it. */
  async function loadAssociations() {
    loadingAssociations.value = true;
    try {
      await Promise.all([
        loadContactMechs().catch((e) => logger.error("facility contact mechs", e)),
        loadParties().catch((e) => logger.error("facility parties", e)),
        loadLocations().catch((e) => logger.error("facility locations", e)),
        loadCalendar().catch((e) => logger.error("facility calendar", e)),
        loadCalendarOptions().catch((e) => logger.error("calendar options", e)),
      ]);
    } finally {
      loadingAssociations.value = false;
    }
  }

  /**
   * Order count — refetched on every entry and never cached.
   *
   * It is kept OUT of the cached facility row on purpose: the old store merged it onto the record,
   * so caching the record would have served a constantly-changing number from IndexedDB. Here it
   * stays a separate ref and is merged only in the `current` view below.
   */
  async function refreshVolatile() {
    loadingVolatile.value = true;
    try {
      // Shared with the find/parking lists. Previously this took the first row of an unfiltered
      // response, which is the OLDEST entry in the series — BROADWAY reported a June 2024 count.
      const counts = await fetchOrderCounts([facilityId]);
      orderCount.value = counts[facilityId] ?? 0;
    } finally {
      loadingVolatile.value = false;
    }
  }

  /** Everything, in the aggregate shape the template already binds. */
  const current = computed<Record<string, any>>(() => {
    const base = (facility.value as any)?.raw ?? facility.value ?? {};
    const maximumOrderLimit = base.maximumOrderLimit;
    const groups = groupsByFacility.value[facilityId] ?? [];
    // These four are NOT facility fields — they are derived from group membership, exactly as
    // the store did. The fulfillment toggles bind to them, so omitting them silently renders
    // every toggle "off" no matter what the facility actually belongs to.
    const inGroup = (id: string) => groups.some((g: any) => g.facilityGroupId === id);
    return {
      ...base,
      orderLimitType: maximumOrderLimit === 0 ? "no-capacity" : (maximumOrderLimit ? "custom" : "unlimited"),
      orderCount: orderCount.value ?? 0,
      postalAddress: postalAddress.value,
      contactDetails: contactDetails.value,
      calendar: calendar.value,
      parties: parties.value,
      locations: locations.value,
      identifications: identifications.value,
      shopifyFacilityMappings: shopifyFacilityMappings.value,
      groupInformation: groups,
      allowPickup: inGroup("PICKUP"),
      useOMSFulfillment: inGroup("OMS_FULFILLMENT"),
      generateShippingLabel: inGroup("AUTO_SHIPPING_LABEL"),
      sellOnline: groups.some((g: any) => g.facilityGroupTypeId === "CHANNEL_FAC_GROUP"),
      productStores: productStoreLinks.value,
    };
  });

  async function load() {
    await Promise.all([loadAssociations(), refreshVolatile()]);
  }

  return {
    current,
    hydrated,
    loadingAssociations,
    loadingVolatile,
    calendarOptions,
    load,
    reloadAssociations: loadAssociations,
    refreshVolatile,
  };
}

// =============================================================================================
// Writes
// =============================================================================================

/**
 * Every write a facility page performs — no Pinia, no `facilityStore`.
 *
 * Two rules this file exists to enforce, both of which were easy to forget when 26 mutations were
 * scattered across a view and 12 child components:
 *
 * 1. **Moqui returns nothing useful from a write.** `create` gives back the PK, `update`
 *    effectively nothing (see docs/cache-sync-rollout-plan.md F1). The new state is only knowable
 *    by re-reading, so every mutation that touches CACHED data ends with a cache refresh here
 *    rather than at the call site.
 * 2. **Only cached domains need that refresh.** Address, contact mechs, locations, parties and
 *    calendars are live-fetched per visit, so their mutations return and the caller simply
 *    re-runs its own loader. Calling a cache refresh for them would be a no-op that reads as
 *    intent.
 *
 * Callers get a plain promise and handle their own toast — the composable owns the API call and
 * the cache consequence, nothing about presentation.
 */
/**
 * Contact-mech writes must carry the purpose type — the server rejects them otherwise.
 * `contactMechId` is required when superseding an existing record.
 */
export interface ContactMechPayload extends Record<string, any> {
  contactMechPurposeTypeId: string;
  contactMechId?: string;
}

export interface CarrierFacilityAssociationInput {
  partyId: string;
  facilityId: string;
  enabled: boolean;
  /** Required when closing the exact date-effective FacilityParty row. */
  fromDate?: string | number;
}

/** Create or close a CARRIER FacilityParty row, then prune/refill that carrier's cache partition. */
export async function setCarrierFacilityAssociation(
  input: CarrierFacilityAssociationInput,
): Promise<any> {
  if (!input.enabled && (input.fromDate === null || input.fromDate === undefined || input.fromDate === "")) {
    throw new Error("The active carrier-facility association fromDate is required.");
  }
  const response: any = await api({
    url: `oms/facilities/${encodeURIComponent(input.facilityId)}/parties`,
    method: input.enabled ? "post" : "put",
    data: {
      partyId: input.partyId,
      facilityId: input.facilityId,
      roleTypeId: "CARRIER",
      ...(input.enabled
        ? { fromDate: Date.now() }
        : { fromDate: input.fromDate, thruDate: Date.now() }),
    },
  });
  if (commonUtil.hasError(response)) {
    throw new Error(getResponseErrorMessage(
      response,
      "Failed to update the carrier-facility association.",
    ));
  }
  await refreshAfterMutation("carrierFacility", { partyId: input.partyId });
  return response;
}

export function useFacilityMutations(facilityId: string) {
  const put = (url: string, data: any) => api({ url, method: "put", data }) as Promise<any>;
  const post = (url: string, data: any) => api({ url, method: "post", data }) as Promise<any>;
  const del = (url: string, data?: any) => api({ url, method: "delete", data }) as Promise<any>;

  /** The facility row itself is cached — re-read it after any core change. */
  const refreshFacility = () => refreshAfterMutation("facility", { facilityId });

  return {
    // ---------------------------------------------------------------- core (CACHED)
    /**
     * Every field on the facility row goes through here — time zone, days-to-ship, name, type,
     * order limit, fulfillment toggles. One function per (method + path), so the cache refresh
     * exists once instead of being copied per UI intent. Callers keep their own intent-shaped
     * wrapper, e.g. `saveTimeZone = (tz) => updateFacility({ facilityTimeZone: tz })`.
     */
    async updateFacility(payload: Record<string, any>) {
      const resp = await put(`oms/facilities/${encodeURIComponent(facilityId)}`, { ...payload, facilityId });
      await refreshFacility();
      return resp;
    },

    // ------------------------------------------------- groups (CACHED: groupFacilities)
    async addToGroup(payload: Record<string, any>) {
      const resp = await post(`oms/facilities/${encodeURIComponent(facilityId)}/groups`, { ...payload, facilityId });
      await refreshAfterMutation("facilityGroupMember", { facilityGroupId: payload.facilityGroupId });
      return resp;
    },
    async updateGroupAssociation(payload: Record<string, any>) {
      const resp = await put(
        `oms/facilities/${encodeURIComponent(facilityId)}/groups/${encodeURIComponent(payload.facilityGroupId)}`,
        { ...payload, facilityId },
      );
      await refreshAfterMutation("facilityGroupMember", { facilityGroupId: payload.facilityGroupId });
      return resp;
    },
    async createGroup(payload: Record<string, any>) {
      const resp = await post("oms/facilityGroups", payload);
      // A brand-new group is not in the login snapshot — re-snapshot the small set.
      await resyncDomain("facilityGroup");
      return resp;
    },

    // ------------------------------- product stores (CACHED: productStoreFacilities)
    async addProductStore(payload: Record<string, any>) {
      const resp = await post(`oms/facilities/${encodeURIComponent(facilityId)}/productStores`, { ...payload, facilityId });
      await refreshAfterMutation("productStoreFacility", { productStoreId: payload.productStoreId });
      return resp;
    },
    async updateProductStore(payload: Record<string, any>) {
      const resp = await put(
        `oms/facilities/${encodeURIComponent(facilityId)}/productStores/${encodeURIComponent(payload.productStoreId)}`,
        { ...payload, facilityId },
      );
      await refreshAfterMutation("productStoreFacility", { productStoreId: payload.productStoreId });
      return resp;
    },

    // ------------------------- identifications (CACHED: facilityIdentifications, global list)
    async saveIdentification(payload: Record<string, any>) {
      const resp = await post(`oms/facilities/${encodeURIComponent(facilityId)}/identifications`, { ...payload, facilityId });
      await resyncDomain("facilityIdentification"); // global endpoint — no by-PK route
      return resp;
    },

    // ----------------------------------- shopify locations (CACHED: shopifyLocations)
    async createShopifyLocation(payload: Record<string, any>) {
      const resp = await post("oms/shopifyShops/locations", { ...payload, facilityId });
      await refreshAfterMutation("shopifyLocation", { shopId: payload.shopId });
      return resp;
    },
    async updateShopifyLocation(payload: Record<string, any>) {
      const resp = await post(`oms/shopifyShops/${encodeURIComponent(payload.shopId)}/locations`, { ...payload, facilityId });
      await refreshAfterMutation("shopifyLocation", { shopId: payload.shopId });
      return resp;
    },
    async deleteShopifyLocation(payload: { shopId: string } & Record<string, any>) {
      const resp = await del(
        `oms/shopifyShops/locations/${encodeURIComponent(payload.shopId)}/${encodeURIComponent(facilityId)}`,
      );
      await refreshAfterMutation("shopifyLocation", { shopId: payload.shopId });
      return resp;
    },

    // ------------------------------------------------------------- LIVE data (no cache refresh)
    // These read paths are fetched per visit, so the caller re-runs its own loader after a write.
    //
    // ⚠️ CONTACT MECHS REQUIRE `contactMechPurposeTypeId`. Omitting it fails with
    // "Required field Contact Mech Purpose Type ID is missing" (verified live — both PUTs 400'd
    // until it was supplied). Read the purpose off the existing row: PRIMARY_PHONE for telecom,
    // PRIMARY_LOCATION for the postal address.
    //
    // ⚠️ These are NOT in-place updates. A successful PUT returns a NEW `contactMechId` — Moqui
    // supersedes the contact mech and re-points the purpose. So the caller MUST re-read after a
    // write; any locally held contactMechId is stale immediately.
    createPostalAddress: (payload: ContactMechPayload) =>
      post("oms/facilityContactMechs/facilityAddress", { ...payload, facilityId }),
    updatePostalAddress: (payload: ContactMechPayload) =>
      put("oms/facilityContactMechs/facilityAddress", { ...payload, facilityId }),
    createTelecomNumber: (payload: ContactMechPayload) =>
      post("oms/facilityContactMechs/facilityPhone", { ...payload, facilityId }),
    updateTelecomNumber: (payload: ContactMechPayload) =>
      put("oms/facilityContactMechs/facilityPhone", { ...payload, facilityId }),
    createEmailAddress: (payload: ContactMechPayload) =>
      post("oms/facilityContactMechs/facilityEmail", { ...payload, facilityId }),
    updateEmailAddress: (payload: ContactMechPayload) =>
      put("oms/facilityContactMechs/facilityEmail", { ...payload, facilityId }),
    createMapUrl: (payload: ContactMechPayload) =>
      post("oms/facilityContactMechs/facilityMapUrl", { ...payload, facilityId }),
    updateMapUrl: (payload: ContactMechPayload) =>
      put("oms/facilityContactMechs/facilityMapUrl", { ...payload, facilityId }),
    deleteMapUrl: (payload: Record<string, any>) =>
      del("oms/facilityContactMechs/facilityMapUrl", { ...payload, facilityId }),

    /** Upsert: create and update were always the same POST, distinguished only by locationSeqId. */
    saveLocation: (payload: Record<string, any>) =>
      post(`oms/facilities/${encodeURIComponent(facilityId)}/locations`, { ...payload, facilityId }),
    deleteLocation: (payload: { locationSeqId: string } & Record<string, any>) =>
      del(`oms/facilities/${encodeURIComponent(facilityId)}/locations/${encodeURIComponent(payload.locationSeqId)}`),

    addParty: (payload: Record<string, any>) =>
      post(`oms/facilities/${encodeURIComponent(facilityId)}/parties`, { ...payload, facilityId }),
    removeParty: (payload: Record<string, any>) =>
      put(`oms/facilities/${encodeURIComponent(facilityId)}/parties`, { ...payload, facilityId }),
    setCarrierAssociation: (
      partyId: string,
      enabled: boolean,
      fromDate?: string | number,
    ) => setCarrierFacilityAssociation({ partyId, facilityId, enabled, fromDate }),

    /** The calendar association endpoint. Associating and removing are both POSTs to it. */
    saveCalendar: (payload: Record<string, any>) =>
      post(`oms/facilities/${encodeURIComponent(facilityId)}/calendars`, { ...payload, facilityId }),

    /**
     * The one alias kept deliberately. It is not a restated UI intent — it encodes a fact about
     * the data: the association is date-effective, so "remove" means POSTing a `thruDate` to close
     * it, not issuing a DELETE. Left as a named function so that knowledge lives here instead of
     * being re-derived by every component that removes operating hours.
     */
    removeCalendar: (payload: Record<string, any> = {}) =>
      post(`oms/facilities/${encodeURIComponent(facilityId)}/calendars`, {
        ...payload, facilityId, facilityCalendarTypeId: "OPERATING_HOURS", thruDate: Date.now(),
      }),

    // `createCalendar` (POST oms/calendars/techData/week) is REMOVED: that route does not exist.
    // Its sibling `oms/calendars/techData` 404s ("Resource calendars not valid") and neither
    // appears in any Moqui REST definition — verified live 2026-07-26. The calendar picker needs a
    // real source identified before it can work.
  };
}

/** The id of the group parkings are archived into. Created on first archive if absent. */

/**
 * Creating a facility — the one write with no facility id to scope to.
 *
 * The list pages read facilities from the cache, so a create MUST end in a cache write or the new
 * row simply does not appear until the next login sync. `byPk` re-read is used rather than a full
 * re-snapshot: one GET for the row just created.
 */
export function useFacilityCreation() {
  async function create(payload: Record<string, any>) {
    const resp: any = await api({ url: "oms/facilities", method: "post", data: payload });
    if (commonUtil.hasError(resp)) return resp;
    // Moqui create echoes the PK back, but the client generated it here anyway (see
    // `generateInternalId`), so fall back to the payload rather than skipping the refresh.
    const facilityId = resp?.data?.facilityId || payload.facilityId;
    if (facilityId) await refreshAfterMutation("facility", { facilityId });
    return resp;
  }

  return {
    createFacility: create,
    /**
     * A parking is a facility of type `VIRTUAL_FACILITY` — same endpoint, same cache consequence.
     * Named separately because the caller reads as parking, not facility.
     */
    createVirtualFacility: (payload: Record<string, any>) =>
      create({ ...payload, facilityTypeId: "VIRTUAL_FACILITY" }),
  };
}

/**
 * Facility-group writes: the group row, its facility members, and its product-store associations.
 *
 * Each lands in a DIFFERENT cached domain, and getting that wrong is silent — the write succeeds,
 * the toast says so, and the screen keeps showing the old value:
 *   - group name/description/type → `facilityGroup`
 *   - members added/removed/resequenced → `facilityGroupMember` (scoped re-list, so removals prune)
 *   - product stores linked/unlinked → `facilityGroupProductStore`
 */
export function useFacilityGroupMutations(facilityGroupId?: string) {
  const groupId = () => {
    if (!facilityGroupId) throw new Error("useFacilityGroupMutations: facilityGroupId is required for this write");
    return encodeURIComponent(facilityGroupId);
  };

  return {
    /**
     * The group's current member facilities, read live.
     *
     * The edit screen diffs against this before saving, so it must reflect committed state rather
     * than the login-time snapshot — a stale membership would produce a wrong add/remove set.
     */
    async fetchMembers(id: string = facilityGroupId as string): Promise<any[]> {
      try {
        const resp: any = await api({
          url: `admin/facilityGroups/${encodeURIComponent(id)}/facilities`,
          method: "get",
          params: { pageNoLimit: true },
        });
        return Array.isArray(resp?.data) ? resp.data : [];
      } catch (error) {
        logger.error("Failed to fetch group facilities", error);
        return [];
      }
    },

    /**
     * Does a group with this id exist? A live read rather than a cache lookup on purpose: the
     * caller uses it to decide between create and reuse, and acting on a stale cache would attempt
     * a duplicate create.
     */
    async findGroup(id: string) {
      try {
        const resp: any = await api({ url: `oms/facilityGroups/${encodeURIComponent(id)}`, method: "get" });
        return commonUtil.hasError(resp) ? undefined : resp.data?.facilityGroupId;
      } catch (error) {
        logger.error("Failed to read facility group", error);
        return undefined;
      }
    },

    /** Create is not group-scoped, so it is callable without a `facilityGroupId`. */
    async createGroup(payload: Record<string, any>) {
      const resp: any = await api({ url: "oms/facilityGroups", method: "post", data: payload });
      // No by-PK GET is in use for groups, and the set is small — re-snapshot the whole list so the
      // new group appears wherever groups are listed.
      if (!commonUtil.hasError(resp)) await refreshAfterMutation("facilityGroup", {});
      return resp;
    },

    async updateGroup(payload: Record<string, any>) {
      const resp: any = await api({
        url: `admin/facilityGroups/${groupId()}`,
        method: "put",
        data: { ...payload, facilityGroupId },
      });
      if (!commonUtil.hasError(resp)) await refreshAfterMutation("facilityGroup", {});
      return resp;
    },

    /**
     * Member changes: `additions` are new memberships, `revisions` expire (thruDate) or resequence
     * existing ones. Both are the SAME write — see below — so they are one call here.
     *
     * ⚠️ This does NOT post to `oms/facilityGroups/{id}/facilities`, which is what the screen used
     * to do. That route does not exist: `oms.rest.xml` defines `facilityGroups/{facilityGroupId}`
     * with GET/PUT/DELETE and no nested `facilities` resource, so every member save 404'd (verified
     * live 2026-07-27 — `POST oms/facilityGroups/CACHE_TEST_GROUP/facilities` → 404). It also sent
     * an ARRAY body to an auto-entity endpoint, which Moqui does not accept.
     *
     * The real route is per-facility `POST oms/facilities/{facilityId}/groups` →
     * `FacilityGroupMember` operation `store`, i.e. an UPSERT keyed on
     * (facilityGroupId, facilityId, fromDate). One shape therefore covers all three intents:
     * add (new fromDate), expire (send thruDate), resequence (send sequenceNum). It is the same
     * endpoint `useFacilityMutations.addToGroup` already uses, so no new API is introduced.
     *
     * ⚠️ `store` resolves the row on the EXACT `(facilityGroupId, facilityId, fromDate)` timestamp.
     * A revision whose `fromDate` is missing or even slightly off does NOT fail — it answers 200 and
     * INSERTS a second active membership. Verified live 2026-08-17 against `POST
     * oms/facilities/BROADWAY/groups`: omitting `fromDate` returned `{fromDate: 1786965457977}` and
     * added a row, and sending `1718341888000` for a row stored at `...888240` added another. That
     * is what duplicates a group's members on save, so every revision is normalized to epoch millis
     * here and one that cannot be resolved is refused rather than sent.
     */
    async saveMembers(additions: any[], revisions: any[]) {
      // A revision addresses an existing row, so it MUST carry an exact `fromDate`. `toMillis`
      // normalizes whatever shape the OMS emitted it as (millis, numeric string, ISO string) to the
      // one unambiguous form; anything it cannot read is a bug we refuse to turn into a duplicate.
      const unaddressable: any[] = [];
      const normalizedRevisions = revisions.flatMap((row) => {
        const fromDate = toMillis(row.fromDate);
        if (fromDate === undefined) { unaddressable.push(row); return []; }
        return [{ ...row, fromDate }];
      });
      if (unaddressable.length) {
        logger.error(
          "Refusing to revise facility group memberships with no resolvable fromDate — posting them " +
          "would create duplicate members instead of updating them",
          unaddressable,
        );
      }

      const rows = [...additions, ...normalizedRevisions];
      const results = await Promise.allSettled(rows.map((row) => api({
        url: `oms/facilities/${encodeURIComponent(row.facilityId)}/groups`,
        method: "post",
        data: { ...row, facilityGroupId },
      }) as Promise<any>));

      // A 4xx rejects, but the api wrapper can also RESOLVE carrying an error body — check both, or
      // a failed save reports success.
      const failed = unaddressable.length > 0 || results.some((result) =>
        result.status === "rejected" || commonUtil.hasError((result as PromiseFulfilledResult<any>).value));

      // Refresh even on partial failure: some writes may have landed, and the cache must reflect
      // what the server actually holds rather than what was attempted.
      if (rows.length) await refreshAfterMutation("facilityGroupMember", { facilityGroupId });
      return { failed, results };
    },

    /**
     * Product-store associations are date-effective, so "remove" is a POST that closes the row with
     * a thruDate — same endpoint as "add", which is why both are handled here together.
     */
    async saveProductStores(
      additions: string[],
      removals: Array<{ productStoreId: string; fromDate: number | string }>,
    ) {
      const now = Date.now();
      const requests = [
        ...additions.map((productStoreId) => api({
          url: `oms/productStores/${encodeURIComponent(productStoreId)}/facilityGroups`,
          method: "post",
          data: { facilityGroupId, fromDate: now },
        }) as Promise<any>),
        ...removals.map((removal) => api({
          url: `oms/productStores/${encodeURIComponent(removal.productStoreId)}/facilityGroups`,
          method: "post",
          data: { facilityGroupId, fromDate: removal.fromDate, thruDate: now },
        }) as Promise<any>),
      ];

      const results = await Promise.allSettled(requests);
      // Same as `saveMembers`: a resolved response can still carry an error body.
      const failed = results.some((result) =>
        result.status === "rejected" || commonUtil.hasError((result as PromiseFulfilledResult<any>).value));
      if (requests.length) await refreshAfterMutation("facilityGroupProductStore", { facilityGroupId });
      return { failed, results };
    },
  };
}

/**
 * Archiving a parking, which is membership of the ARCHIVE facility group — NOT a change to the
 * facility row.
 *
 * That distinction is the whole reason this is separate: refreshing the `facility` domain here
 * would fetch a row that did not change and leave the archived list stale. The cache consequence
 * belongs to `facilityGroupMember`, re-listed for the one group so a removed member is pruned.
 */
export function useFacilityArchive() {
  /** Resolve the archive group, creating it once if this OMS has never had one. */
  async function ensureArchiveGroup(): Promise<string> {
    // Cache first — the group list is a login snapshot, so a hit costs no request at all.
    const cached = await facilityGroupCache.all();
    if (cached.some((group: any) => group.facilityGroupId === ARCHIVE_FACILITY_GROUP_ID)) return ARCHIVE_FACILITY_GROUP_ID;

    // A cache miss is not proof of absence (the group may have been created outside this app since
    // login), so confirm against the server before trying to create it.
    try {
      const resp: any = await api({ url: `oms/facilityGroups/${ARCHIVE_FACILITY_GROUP_ID}`, method: "get" });
      if (!commonUtil.hasError(resp) && resp.data?.facilityGroupId) {
        await resyncDomain("facilityGroup"); // cache was stale — fix it while we know
        return ARCHIVE_FACILITY_GROUP_ID;
      }
    } catch {
      // not found — fall through and create it
    }

    try {
      const resp: any = await api({
        url: "oms/facilityGroups",
        method: "post",
        data: { facilityGroupId: ARCHIVE_FACILITY_GROUP_ID, facilityGroupName: "Archive" },
      });
      if (!commonUtil.hasError(resp)) {
        await refreshAfterMutation("facilityGroup", {});
        return ARCHIVE_FACILITY_GROUP_ID;
      }
    } catch (error) {
      logger.error("Failed to create archive group", error);
    }
    return "";
  }

  const refreshArchive = () =>
    refreshAfterMutation("facilityGroupMember", { facilityGroupId: ARCHIVE_FACILITY_GROUP_ID });

  return {
    async archive(facilityId: string) {
      const facilityGroupId = await ensureArchiveGroup();
      if (!facilityGroupId) return { data: { error: "Archive group unavailable" } };
      const resp: any = await api({
        url: `admin/facilityGroups/${encodeURIComponent(facilityGroupId)}/facilities/${encodeURIComponent(facilityId)}/association`,
        method: "post",
        data: { fromDate: Date.now() },
      });
      if (!commonUtil.hasError(resp)) await refreshArchive();
      return resp;
    },

    /**
     * Unarchive closes the association with a thruDate rather than deleting it — the membership is
     * date-effective. `fromDate` identifies which association to close, so it must come from the
     * cached membership row.
     */
    async unarchive(facilityId: string, fromDate: number | string) {
      const resp: any = await api({
        url: `admin/facilityGroups/${ARCHIVE_FACILITY_GROUP_ID}/facilities/${encodeURIComponent(facilityId)}/association`,
        method: "post",
        data: { fromDate, thruDate: Date.now() },
      });
      if (!commonUtil.hasError(resp)) await refreshArchive();
      return resp;
    },
  };
}
