import { computed, ref } from "vue";
import { api, commonUtil, logger } from "@common";
import { resyncDomain } from "@/services/appCacheBootstrap";
import {
  currencyCache,
  enumCache,
  enumTypeCache,
  geoAssocCache,
  geoCache,
  paymentMethodTypeCache,
  productTypeCache,
  roleTypeCache,
  shipmentMethodTypeCache,
  statusCache,
  systemMessageTypeCache,
} from "@/utils/cacheEntities";
import { byDescription, useCachedList } from "./useCachedList";

/**
 * SEED data — the reference sets that are not tied to any single model: statuses, enumerations,
 * and the type tables (product / shipment method / payment method / role).
 *
 * Grouped by that shared character rather than by entity, because no one master entity owns them:
 * they are the picker and label sources the whole app reads. Replaces `utilStore`.
 */

// --- statuses -------------------------------------------------------------------------------

export function useStatuses() {
  const { records, hydrated } = useCachedList<any>(statusCache);

  /** statusId → description, the map templates index into. */
  const statusItems = computed<Record<string, string>>(() =>
    records.value.reduce((map: Record<string, string>, row: any) => {
      map[row.statusId] = row.description ?? row.statusId;
      return map;
    }, {}));

  const labelFor = (statusId: string | undefined) =>
    (statusId ? statusItems.value[statusId] ?? statusId : "");

  /** Statuses of one statusTypeId (e.g. order vs shipment status sets). */
  const ofType = (statusTypeId: string) =>
    records.value.filter((row: any) => row.statusTypeId === statusTypeId).sort(byDescription);

  return { statuses: records, statusItems, labelFor, ofType, hydrated };
}

// --- enumerations ---------------------------------------------------------------------------

/** The generic enumeration catalog (id → description). */
export function useEnums() {
  const { records, hydrated } = useCachedList<any>(enumCache);
  const enumItems = computed<Record<string, string>>(() =>
    records.value.reduce((map: Record<string, string>, row: any) => {
      map[row.enumId] = row.description ?? row.enumId;
      return map;
    }, {}));
  return { enums: records, enumItems, hydrated };
}

/**
 * Enum values for ONE enumTypeId, sliced from the complete `enums` table.
 *
 * No per-type registration: `admin/enums` is the `EnumerationAndType` view which aliases every
 * Enumeration field, so `enumTypeId` is present on every cached row and any type can be read
 * without adding a domain.
 */
export function useTypedEnums(enumTypeId: string) {
  const { records, hydrated } = useCachedList<any>(
    enumCache,
    { scope: { field: "enumTypeId", value: enumTypeId } },
  );
  const values = computed(() => [...records.value].sort(byDescription));
  /**
   * enumId → description. The Pinia state these replaced was a map, and templates index it
   * directly (`locationTypes[location.locationTypeEnumId]`); handing back only the array made
   * every such lookup silently `undefined`.
   */
  const descriptionById = computed<Record<string, string>>(() =>
    records.value.reduce((map: Record<string, string>, row: any) => {
      if (row.enumId) map[row.enumId] = row.description ?? row.enumId;
      return map;
    }, {}));
  return { values, descriptionById, hydrated };
}

/** The enumeration type catalog. */
export function useEnumTypes() {
  const { records, hydrated } = useCachedList<any>(enumTypeCache);
  return { enumTypes: computed(() => [...records.value].sort(byDescription)), hydrated };
}

/**
 * Geo reference straight from Moqui — replaces `utilStore` states / operating countries.
 * `useGeos()` is the flat catalog; `statesOf(countryGeoId)` walks the association table.
 */
export function useGeos() {
  const { records: geos, hydrated } = useCachedList<any>(geoCache);
  const { records: assocs } = useCachedList<any>(geoAssocCache);

  const byId = computed<Record<string, any>>(() =>
    geos.value.reduce((map: Record<string, any>, geo: any) => { map[geo.geoId] = geo; return map; }, {}));

  const countries = computed(() => geos.value
    .filter((geo: any) => String(geo.geoTypeEnumId ?? "").includes("COUNTRY"))
    .sort((a: any, b: any) => String(a.geoName ?? "").localeCompare(String(b.geoName ?? ""))));

  /**
   * Child geos (states / provinces / regions) of a country, resolved through GeoAssoc.
   * Direction verified live: `geoId` is the country, `toGeoId` the region (ARE → AE-AJ).
   * Restricted to `GAT_REGIONS`; `GAT_GROUP_MEMBER` is a different relationship (geo groups).
   */
  /**
   * Countries in the DBIC association group.
   *
   * No dedicated fetch: `admin/geos/assocs?toGeoId=DBIC` was its own request, but the geoAssoc
   * domain already snapshots that same endpoint unfiltered, so DBIC is just a slice of the cache.
   * One fewer login call, and it stays correct as associations change.
   */
  const dbicCountries = computed(() => assocs.value
    .filter((assoc: any) => assoc.toGeoId === "DBIC")
    .map((assoc: any) => byId.value[assoc.geoId] ?? { geoId: assoc.geoId })
    .filter(Boolean));

  const statesOf = (countryGeoId: string) => assocs.value
    .filter((assoc: any) => assoc.geoId === countryGeoId && assoc.geoAssocTypeEnumId === "GAT_REGIONS")
    .map((assoc: any) => byId.value[assoc.toGeoId])
    .filter(Boolean)
    .sort((a: any, b: any) => String(a.geoName ?? "").localeCompare(String(b.geoName ?? "")));

  return { geos, countries, statesOf, dbicCountries, byId, hydrated };
}

// --- type tables ----------------------------------------------------------------------------

function sortedTypes(cache: Parameters<typeof useCachedList>[0]) {
  const { records, hydrated } = useCachedList<any>(cache);
  return { records: computed(() => [...records.value].sort(byDescription)), hydrated };
}

export function useProductTypes() {
  const { records, hydrated } = sortedTypes(productTypeCache);
  return { productTypes: records, hydrated };
}

/**
 * Create a shipment method type. Reference data, so the create re-snapshots that one domain —
 * callers must not resync it themselves.
 */
export function useShipmentMethodTypeMutations() {
  async function createShipmentMethodType(payload: { shipmentMethodTypeId: string; description: string }) {
    const resp: any = await api({
      url: "oms/shippingGateways/shipmentMethodTypes",
      method: "post",
      data: payload,
    });
    if (commonUtil.hasError(resp)) throw resp;
    await resyncDomain("shipmentMethodType");
    return resp;
  }
  return { createShipmentMethodType };
}

/** Currencies (UOMs of type UT_CURRENCY_MEASURE), cached at login. */
export function useCurrencies() {
  const { records, hydrated } = sortedTypes(currencyCache);
  return { currencies: records, hydrated };
}

export function useShipmentMethodTypes() {
  const { records, hydrated } = sortedTypes(shipmentMethodTypeCache);
  return { shipmentMethodTypes: records, hydrated };
}

export function usePaymentMethodTypes() {
  const { records, hydrated } = sortedTypes(paymentMethodTypeCache);
  return { paymentMethodTypes: records, hydrated };
}

/**
 * Create a payment method type, then re-snapshot the cached set.
 *
 * The type catalog is a cached class-B domain, so a new type must land in the cache or the pickers
 * that read it will not show it. This replaces a store action plus a hand-maintained local mirror
 * (`upsertPaymentMethodType`) that pushed the new row into store state — the mirror could disagree
 * with the server, and nothing read it once the pickers moved to the cache.
 */
export async function createPaymentMethodType(payload: { paymentMethodTypeId: string; description: string }) {
  const resp: any = await api({ url: "oms/paymentMethodTypes", method: "post", data: payload });
  if (!commonUtil.hasError(resp)) await resyncDomain("paymentMethodType");
  return resp;
}

export function useRoleTypes() {
  const { records, hydrated } = sortedTypes(roleTypeCache);
  /** roleTypeId → description, matching the map the party-role templates index. */
  const descriptionById = computed<Record<string, string>>(() =>
    records.value.reduce((map: Record<string, string>, row: any) => {
      if (row.roleTypeId) map[row.roleTypeId] = row.description || row.roleTypeId;
      return map;
    }, {}));
  return { roleTypes: records, descriptionById, hydrated };
}

/**
 * System message types — the type catalog sync screens label messages with.
 *
 * Seed data: small, static within a session, and previously fetched one-type-at-a-time (11 requests
 * on a single page load, for 9 distinct ids). Cached as one set, so labelling is a local lookup.
 */
export function useSystemMessageTypes() {
  const { records, hydrated } = useCachedList<any>(systemMessageTypeCache);

  /** systemMessageTypeId → description. */
  const typeItems = computed<Record<string, string>>(() =>
    records.value.reduce((map: Record<string, string>, row: any) => {
      map[row.systemMessageTypeId] = row.description ?? row.systemMessageTypeId;
      return map;
    }, {}));

  const labelFor = (systemMessageTypeId: string | undefined) =>
    (systemMessageTypeId ? typeItems.value[systemMessageTypeId] ?? systemMessageTypeId : "");

  /** Types whose `parentTypeId` matches — how the sync screens group feed types. */
  const childrenOf = (parentTypeId: string) =>
    records.value.filter((row: any) => row.parentTypeId === parentTypeId);

  return {
    systemMessageTypes: computed(() => [...records.value].sort(byDescription)),
    typeItems, labelFor, childrenOf, hydrated,
  };
}


// =============================================================================================
// Maarg server configuration
//
// Seed data like the rest of this file, but stored in localStorage rather than IndexedDB: it is a
// small, flat, read-only object of server config properties, so it needs none of the cache's
// projection / prune / liveQuery machinery. Grouped here because its ROLE is the same as the other
// seed sets — reference data no single model owns — and callers should not care where it is kept.
// =============================================================================================
const MAARG_STORAGE_KEY = "company:maargConfig";

export interface MaargInstanceInfo {
  instancePurpose?: string;
  instanceName?: string;
  omsInstanceUrl?: string | null;
  componentRelease?: string;
}

export interface MaargComponent {
  name: string;
  version: string;
}

export interface MaargConfig {
  instanceInfo: MaargInstanceInfo;
  components: MaargComponent[];
  /** When this copy was read from the server. */
  fetchedAt: number;
}

function readStored(): MaargConfig | null {
  try {
    const raw = localStorage.getItem(MAARG_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as MaargConfig;
  } catch {
    return null; // corrupt entry — treat as absent and re-read from the server
  }
}

// Module-scoped so every consumer shares one copy and one in-flight request.
const config = ref<MaargConfig | null>(readStored());
let inFlight: Promise<void> | null = null;

/**
 * The operating organization's partyId — the `ownerPartyId` stamped on facilities this app creates.
 *
 * One scalar with one consumer, so it is a module-level memo rather than a cache table: the value
 * is stable for the life of an instance and re-fetching it per page load would be pure noise.
 */
const organizationPartyId = ref("");
let organizationInFlight: Promise<string> | null = null;
const organizationCompany = ref<Record<string, any>>({});
let companyInFlight: Promise<Record<string, any>> | null = null;

// The retired `store/util` was `persist: true`; drop its stale localStorage copy once.
try { localStorage.removeItem("util") } catch { /* no localStorage (node test) — ignore */ }

/** The roles every operating company needs (moved with `bootstrapOrganization` from `store/util`). */
const DEFAULT_COMPANY_ROLE_TYPE_IDS = [
  "BILL_FROM_VENDOR",
  "SHIP_FROM_VENDOR",
  "BILL_TO_CUSTOMER",
  "INTERNAL_ORGANIZATIO",
  "SUPPLIER",
  "VENDOR",
  "CONTACT",
  "_NA_",
];

/**
 * The instance's available time zones.
 *
 * A static reference list with two consumers (the facility switcher and the user timezone modal),
 * so it is memoised per session rather than given a cache table — same reasoning as
 * `useOrganization`.
 */
const availableTimeZones = ref<any[]>([]);
let timeZonesInFlight: Promise<any[]> | null = null;

/**
 * Solr-backed geocode lookup (`api/geocode`).
 *
 * Not cached — it is a query, not reference data. Note this endpoint needs Solr reachable; on an
 * instance without it the call 400s, which callers should treat as "no result" rather than an error
 * worth surfacing.
 */
export function useGeocode() {
  async function geocode(payload: any): Promise<any> {
    const resp: any = await api({ url: "api/geocode", method: "POST", data: payload });
    return resp?.data;
  }

  /** Latitude/longitude for a postal code, or null when nothing matches. */
  async function latLongForPostalCode(postalCode: string): Promise<{ latitude: any; longitude: any } | null> {
    // A leading zero is significant but often stored trimmed, so query both forms.
    const query = postalCode.startsWith("0") ? `${postalCode} OR ${postalCode.substring(1)}` : postalCode;
    try {
      const data = await geocode({ json: { params: { q: `postcode: ${query}` } } });
      const doc = data?.response?.docs?.[0];
      return doc ? { latitude: doc.latitude, longitude: doc.longitude } : null;
    } catch (error) {
      logger.error("Geocode lookup failed", error);
      return null;
    }
  }

  return { geocode, latLongForPostalCode };
}

export function useTimeZones() {
  async function loadTimeZones(): Promise<any[]> {
    if (availableTimeZones.value.length) return availableTimeZones.value;
    if (timeZonesInFlight) return timeZonesInFlight;

    timeZonesInFlight = (async () => {
      try {
        const resp: any = await api({ url: "admin/user/getAvailableTimeZones", method: "get", cache: true });
        const data = resp?.data;
        availableTimeZones.value = data?.timeZones ?? (Array.isArray(data) ? data : []);
      } catch (error) {
        logger.error("Failed to load available time zones", error);
      } finally {
        timeZonesInFlight = null;
      }
      return availableTimeZones.value;
    })();

    return timeZonesInFlight;
  }

  return { timeZones: availableTimeZones, loadTimeZones };
}

export function useOrganization() {
  async function loadOrganizationPartyId(): Promise<string> {
    if (organizationPartyId.value) return organizationPartyId.value;
    if (organizationInFlight) return organizationInFlight;

    organizationInFlight = (async () => {
      try {
        const resp: any = await api({
          url: "admin/organizations",
          method: "get",
          params: { roleTypeId: "INTERNAL_ORGANIZATIO", pageSize: 1 },
        });
        organizationPartyId.value = resp?.data?.[0]?.partyId ?? "";
      } catch (error) {
        logger.error("Failed to load the organization partyId", error);
      } finally {
        organizationInFlight = null;
      }
      return organizationPartyId.value;
    })();

    return organizationInFlight;
  }

  /**
   * The owning organization's record, including `companyName`.
   *
   * Two calls, unavoidably: the list route (`?roleTypeId=INTERNAL_ORGANIZATIO`) returns only
   * `partyId` and `roleTypeId` — verified live — so the name has to come from the by-id route.
   * They are sequenced here rather than left to the caller, which is what previously went wrong:
   * the store read a partyId that another module was expected to have populated, and once that
   * prefetch went away it issued `admin/organizations/?partyId=` and silently returned nothing.
   */
  async function loadCompany(): Promise<Record<string, any>> {
    if (Object.keys(organizationCompany.value).length) return organizationCompany.value;
    if (companyInFlight) return companyInFlight;

    companyInFlight = (async () => {
      try {
        const partyId = await loadOrganizationPartyId();
        if (!partyId) throw new Error("No internal organization is configured.");
        const resp: any = await api({
          url: `admin/organizations/${encodeURIComponent(partyId)}`,
          method: "get",
          params: { partyId },
        });
        // `groupName` is the organization's name; the product-store screens call it companyName.
        organizationCompany.value = { ...resp?.data, companyName: resp?.data?.groupName };
      } catch (error) {
        logger.error("Failed to load the organization record", error);
      } finally {
        companyInFlight = null;
      }
      return organizationCompany.value;
    })();

    return companyInFlight;
  }

  /** Drop the memo after a write so the next read reflects the new name. */
  function clearCompany(): void {
    organizationCompany.value = {};
  }

  /**
   * First-run organization setup (moved from `store/util`): ensure the party group exists, name it,
   * grant the default company roles, and record it as `ORGANIZATION_PARTY`. Idempotent — every write
   * is a create-or-update — so re-running against an existing organization only renames it. On
   * success the partyId memo is set and the company memo cleared so the next `loadCompany()` reads
   * the fresh name.
   */
  async function bootstrapOrganization(payload: { partyId?: string; groupName?: string } = {}) {
    try {
      const partyId = payload.partyId?.trim() || "COMPANY";
      const groupName = payload.groupName?.trim() || "Default Company";

      const existingOrganizationResp: any = await api({
        url: `admin/organizations/${partyId}`,
        method: "get",
        params: { partyId },
      });

      if (commonUtil.hasError(existingOrganizationResp)) {
        const partyResp: any = await api({
          url: "admin/organizations",
          method: "post",
          data: { partyId, partyTypeId: "PARTY_GROUP" },
        });
        if (commonUtil.hasError(partyResp)) throw partyResp.data;
      }

      const partyGroupResp: any = await api({
        url: `admin/organizations/${partyId}`,
        method: "post",
        data: { partyId, groupName },
      });
      if (commonUtil.hasError(partyGroupResp)) throw partyGroupResp.data;

      for (const roleTypeId of DEFAULT_COMPANY_ROLE_TYPE_IDS) {
        const roleResp: any = await api({
          url: `admin/organizations/${partyId}/roles`,
          method: "post",
          data: { partyId, roleTypeId },
        });
        if (commonUtil.hasError(roleResp)) throw roleResp.data;
      }

      const systemPropertyResp: any = await api({
        url: "admin/systemProperties",
        method: "put",
        data: {
          systemResourceId: "general",
          systemPropertyId: "ORGANIZATION_PARTY",
          systemPropertyValue: partyId,
          description: "The default organizationPartyId for setup, dropdowns, and reports",
        },
      });
      if (commonUtil.hasError(systemPropertyResp)) throw systemPropertyResp.data;

      organizationPartyId.value = partyId;
      clearCompany();

      return { partyId, groupName, roleTypeIds: DEFAULT_COMPANY_ROLE_TYPE_IDS };
    } catch (error) {
      logger.error(error);
    }

    return null;
  }

  return {
    organizationPartyId, loadOrganizationPartyId, bootstrapOrganization,
    company: organizationCompany, loadCompany, clearCompany,
  };
}

export function useMaargConfig() {
  /**
   * Read the config, from localStorage when present. `force` re-reads from the server (used by an
   * explicit refresh); otherwise a stored copy is reused for the whole session.
   */
  async function load(force = false): Promise<void> {
    if (config.value && !force) return;
    if (inFlight) return inFlight;

    inFlight = (async () => {
      try {
        const resp: any = await api({ url: "admin/maarg", method: "get" });
        const data = resp?.data;
        if (!data || typeof data !== "object") throw new Error("Maarg config response is unavailable.");
        const next: MaargConfig = {
          instanceInfo: data.instanceInfo ?? {},
          components: Array.isArray(data.components) ? data.components : [],
          fetchedAt: Date.now(),
        };
        config.value = next;
        localStorage.setItem(MAARG_STORAGE_KEY, JSON.stringify(next));
      } catch (error) {
        logger.error("Failed to load Maarg configuration", error);
      } finally {
        inFlight = null;
      }
    })();

    return inFlight;
  }

  /** Drop the stored copy (called on logout alongside the cache wipe). */
  function clear(): void {
    config.value = null;
    try { localStorage.removeItem(MAARG_STORAGE_KEY); } catch { /* ignore */ }
  }

  const componentVersion = (name: string) =>
    computed(() => config.value?.components.find((component) => component.name === name)?.version ?? null);

  return {
    config,
    instanceInfo: computed(() => config.value?.instanceInfo ?? {}),
    components: computed(() => config.value?.components ?? []),
    isLoaded: computed(() => !!config.value),
    componentVersion,
    load,
    clear,
  };
}
