/* eslint-disable no-restricted-syntax -- carrier orchestration owns ordered multi-write consistency */
import { computed } from "vue";
import { api, commonUtil } from "@common";
import {
  bootstrapState,
  refreshAfterMutation,
  resyncDomain,
  startReferenceSync,
} from "@/services/appCacheBootstrap";
import { getResponseErrorMessage } from "@/utils";
import { CacheReconciliationError } from "@/utils/cacheReconciliationError";
import {
  carrierCache,
  carrierFacilityCache,
  carrierShipmentMethodCache,
  facilityCache,
  productStoreCache,
  productStoreShippingMethodCache,
  shipmentMethodTypeCache,
  systemMessageRemoteCache,
} from "@/utils/cacheEntities";
import { isEffectiveNow } from "@/utils/cacheProjection";
import { expireProductStoreShipmentMethod } from "./useProductStores";
import { useCachedList, useCachedRecord } from "./useCachedList";
import { useEffectiveNow } from "./useEffectiveNow";

export const CARRIER_ROLE_TYPE_ID = "CARRIER";
export const UNIGATE_REMOTE_ID = "UNIGATE_CONFIG";
export const AUTOMATIC_ADDRESS_VALIDATION_CARRIER_ID = "FEDEX";
export const CARRIER_DETAIL_DOMAINS = [
  "carrier",
  "carrierShipmentMethod",
  "carrierFacility",
  "facility",
  "productStore",
  "productStoreShippingMethod",
  "shipmentMethodType",
  "systemMessageRemote",
] as const;

export interface CarrierRecord {
  partyId: string;
  groupName?: string;
  partyTypeId?: string;
  roleTypeId?: string;
  statusId?: string;
  shipmentMethodCount?: number;
}

export interface CarrierShipmentMethod {
  partyId?: string;
  roleTypeId?: string;
  shipmentMethodTypeId: string;
  description?: string;
  sequenceNumber?: string | number;
  carrierServiceCode?: string;
  deliveryDays?: string | number;
  isConfigured?: boolean;
  [key: string]: any;
}

export interface ProductStoreShipmentMethod {
  productStoreShipMethId: string;
  productStoreId: string;
  partyId: string;
  roleTypeId?: string;
  shipmentMethodTypeId: string;
  fromDate?: string | number;
  thruDate?: string | number;
  [key: string]: any;
}

export type CarrierReadinessStatus =
  | "loading" |
  "ready" |
  "action-required" |
  "verification-unavailable" |
  "not-applicable";

export interface RemoteReadState {
  hydrated: boolean;
  error?: string | null;
}

export interface CarrierReadiness {
  carrierPartyId: string;
  automaticAddressValidationCapable: boolean;
  remote: { hydrated: boolean; error: string | null };
  tenant: CarrierReadinessStatus;
  credential: CarrierReadinessStatus;
  storeLink: CarrierReadinessStatus;
  automaticAddressValidation: CarrierReadinessStatus;
}

/** Date-effective association check that accepts Moqui's numeric, numeric-string, and ISO values. */
export function activeAt(row: Record<string, unknown> | undefined, now = Date.now()): boolean {
  return isEffectiveNow(row, now);
}

/**
 * Join global shipment-method identity with one carrier's fields.
 *
 * Global identity is spread last deliberately: a stale carrier-side `description` must never
 * rename the shared shipment-method type, and neither input array is mutated.
 */
export function mergeCarrierShipmentMethods(
  shipmentMethodTypes: CarrierShipmentMethod[],
  configuredMethods: CarrierShipmentMethod[],
): CarrierShipmentMethod[] {
  const configuredByType = new Map(configuredMethods.map((method) => [method.shipmentMethodTypeId, method]),);

  return shipmentMethodTypes.map((type) => {
    const configured = configuredByType.get(type.shipmentMethodTypeId);

    return configured
      ? { ...configured, ...type, isConfigured: true }
      : { ...type, isConfigured: false };
  });
}

/** Stable carrier sequence: explicit positions first, unsequenced methods last. */
export function orderedCarrierMethods<T extends CarrierShipmentMethod>(rows: T[]): T[] {
  return rows
    .map((row, index) => {
      const parsed = Number(row.sequenceNumber);
      const sequence = row.sequenceNumber === null ||
        row.sequenceNumber === undefined ||
        row.sequenceNumber === "" ||
        !Number.isFinite(parsed)
        ? Number.POSITIVE_INFINITY
        : parsed;

      return { row, index, sequence };
    })
    .sort((left, right) => left.sequence - right.sequence || left.index - right.index)
    .map(({ row }) => row);
}

/** Pure readiness derivation; absence is actionable only after the remote domain hydrated cleanly. */
export function deriveCarrierReadiness(
  carrier: Pick<CarrierRecord, "partyId"> | null | undefined,
  unigateRemote: Record<string, any> | null | undefined,
  remoteState: RemoteReadState,
): CarrierReadiness {
  const carrierPartyId = String(carrier?.partyId ?? "");
  const automaticAddressValidationCapable =
    carrierPartyId.toUpperCase() === AUTOMATIC_ADDRESS_VALIDATION_CARRIER_ID;
  const remote = {
    hydrated: remoteState.hydrated,
    error: remoteState.error ? String(remoteState.error) : null,
  };

  let tenant: CarrierReadinessStatus;
  if(!remote.hydrated) {
    tenant = "loading";
  } else if(remote.error) {
    tenant = "verification-unavailable";
  } else {
    const complete = Boolean(String(unigateRemote?.internalId ?? "").trim() &&
      String(unigateRemote?.sendUrl ?? "").trim(),);
    tenant = complete ? "ready" : "action-required";
  }

  if(!automaticAddressValidationCapable) {
    return {
      carrierPartyId,
      automaticAddressValidationCapable,
      remote,
      tenant,
      credential: "not-applicable",
      storeLink: "not-applicable",
      automaticAddressValidation: "not-applicable",
    };
  }

  const automaticAddressValidation: CarrierReadinessStatus =
    tenant === "loading"
      ? "loading"
      : tenant === "action-required"
        ? "action-required"
        : "verification-unavailable";

  return {
    carrierPartyId,
    automaticAddressValidationCapable,
    remote,
    tenant,
    credential: "verification-unavailable",
    storeLink: "verification-unavailable",
    automaticAddressValidation,
  };
}

/** Carrier catalog with method counts derived from the carrier-method cache. */
export function useCarriers() {
  const carrierRead = useCachedList<CarrierRecord>(carrierCache);
  const methodRead = useCachedList<CarrierShipmentMethod>(carrierShipmentMethodCache);
  const counts = computed<Record<string, number>>(() =>
    methodRead.records.value.reduce((byParty, method) => {
      if(method.partyId) {byParty[method.partyId] = (byParty[method.partyId] ?? 0) + 1;}

      return byParty;
    }, {} as Record<string, number>));
  const carriers = computed(() =>
    carrierRead.records.value.map((carrier) => ({
      ...carrier,
      shipmentMethodCount: counts.value[carrier.partyId] ?? 0,
    })));
  const hydrated = computed(() => carrierRead.hydrated.value && methodRead.hydrated.value);
  const catalogErrors = computed<Record<string, string>>(() => {
    const errors = ["carrier", "carrierShipmentMethod"].reduce((next, domain) => {
      const message = bootstrapState.errors[domain];
      if(message) {next[domain] = message;}

      return next;
    }, {} as Record<string, string>);
    if(bootstrapState.errors.__start) {errors.__start = bootstrapState.errors.__start;}

    return errors;
  });
  const readyForDisplay = computed(() =>
    hydrated.value && Object.keys(catalogErrors.value).length === 0);
  const refreshCarriers = () => Promise.all([
    resyncDomain("carrier"),
    resyncDomain("carrierShipmentMethod"),
  ]);

  return {
    carriers,
    records: carrierRead.records,
    hydrated,
    catalogErrors,
    readyForDisplay,
    refreshCarriers,
  };
}

export const useCarrierRecord = (partyId: string | undefined) =>
  useCachedRecord<CarrierRecord>(carrierCache, "partyId", partyId);

/** All global types joined to the selected carrier's configured rows. */
export function useCarrierShipmentMethods(partyId: string) {
  const configuredRead = useCachedList<CarrierShipmentMethod>(carrierShipmentMethodCache, {
    scope: { field: "partyId", value: partyId },
  });
  const typeRead = useCachedList<CarrierShipmentMethod>(shipmentMethodTypeCache);
  const configuredMethods = computed(() => orderedCarrierMethods(configuredRead.records.value));
  const shipmentMethods = computed(() =>
    orderedCarrierMethods(mergeCarrierShipmentMethods(typeRead.records.value, configuredRead.records.value),));

  return {
    shipmentMethods,
    configuredMethods,
    records: configuredRead.records,
    hydrated: computed(() => configuredRead.hydrated.value && typeRead.hydrated.value),
  };
}

/** Physical facilities plus the selected carrier's active FacilityParty association, when present. */
export function useCarrierFacilities(partyId: string) {
  const associationRead = useCachedList<any>(carrierFacilityCache, {
    scope: { field: "partyId", value: partyId },
  });
  const facilityRead = useCachedList<any>(facilityCache);
  const effectiveNow = useEffectiveNow(associationRead.records);
  const associations = computed(() =>
    associationRead.records.value.filter((row) =>
      row.roleTypeId === CARRIER_ROLE_TYPE_ID && activeAt(row, effectiveNow.value)));
  const facilities = computed(() => {
    const byFacility = new Map(associations.value.map((association) => [association.facilityId, association]),);

    return facilityRead.records.value
      .filter((facility) =>
        facility.facilityTypeId !== "VIRTUAL_FACILITY" &&
        facility.parentTypeId !== "VIRTUAL_FACILITY")
      .map((facility) => {
        const association = byFacility.get(facility.facilityId);

        return {
          ...facility,
          ...(association ?? {}),
          facilityId: facility.facilityId,
          isConfigured: Boolean(association),
        };
      });
  });

  return {
    facilities,
    associations,
    records: associationRead.records,
    hydrated: computed(() => associationRead.hydrated.value && facilityRead.hydrated.value),
  };
}

/** Read Unigate only from the cached remote domain and retain its hydration/error state. */
export function useCarrierReadiness(
  partyId: string,
  carrier?: ReturnType<typeof useCarrierRecord>["record"],
) {
  const remoteRead = useCachedList<any>(systemMessageRemoteCache);
  const fallbackCarrier = carrier ?? useCarrierRecord(partyId).record;
  const remote = computed(() =>
    remoteRead.records.value.find((row) => row.systemMessageRemoteId === UNIGATE_REMOTE_ID) ?? null);
  const error = computed(() => bootstrapState.errors.systemMessageRemote ?? null);
  const readiness = computed(() =>
    deriveCarrierReadiness(fallbackCarrier.value, remote.value, {
      hydrated: remoteRead.hydrated.value,
      error: error.value,
    }));

  return { readiness, remote, error, hydrated: remoteRead.hydrated };
}

/** One cache-only aggregate for the carrier detail route, with a single trustworthy hydration flag. */
export function useCarrier(partyId: string) {
  const carrierRead = useCarrierRecord(partyId);
  const methodRead = useCarrierShipmentMethods(partyId);
  const facilityRead = useCarrierFacilities(partyId);
  const productStoreRead = useCachedList<any>(productStoreCache);
  const productStoreMethodRead = useCachedList<ProductStoreShipmentMethod>(
    productStoreShippingMethodCache,
    { scope: { field: "partyId", value: partyId } },
  );
  const readinessRead = useCarrierReadiness(partyId, carrierRead.record);
  const productStoreMethodNow = useEffectiveNow(productStoreMethodRead.records);
  const productStoreShipmentMethods = computed(() =>
    productStoreMethodRead.records.value.filter((row) =>
      (!row.roleTypeId || row.roleTypeId === CARRIER_ROLE_TYPE_ID) &&
      activeAt(row, productStoreMethodNow.value)));
  const hydrated = computed(() =>
    carrierRead.hydrated.value &&
    methodRead.hydrated.value &&
    facilityRead.hydrated.value &&
    productStoreRead.hydrated.value &&
    productStoreMethodRead.hydrated.value &&
    readinessRead.hydrated.value);
  const detailErrors = computed<Record<string, string>>(() => {
    const errors = CARRIER_DETAIL_DOMAINS.reduce((next, domain) => {
      const message = bootstrapState.errors[domain];
      if(message) {next[domain] = message;}

      return next;
    }, {} as Record<string, string>);
    if(bootstrapState.errors.__start) {errors.__start = bootstrapState.errors.__start;}

    return errors;
  });
  const readyForMutation = computed(() =>
    hydrated.value && Object.keys(detailErrors.value).length === 0);
  const refreshDetails = async () => {
    // Snapshot this attempt's failures. A successful startup may clear the reactive error object
    // while it seeds the cache, but the user's Retry still owns precisely the domains that were
    // visibly failed when they clicked it.
    const errors = detailErrors.value;
    const failedDomains = CARRIER_DETAIL_DOMAINS.filter((domain) => Boolean(errors[domain]));

    if(errors.__start) {
      await startReferenceSync();
      if(bootstrapState.errors.__start) {
        throw new Error(bootstrapState.errors.__start);
      }
    }

    await Promise.all(failedDomains.map((domain) => resyncDomain(domain)));
  };

  return {
    carrier: carrierRead.record,
    shipmentMethods: methodRead.shipmentMethods,
    configuredShipmentMethods: methodRead.configuredMethods,
    facilities: facilityRead.facilities,
    facilityAssociations: facilityRead.associations,
    productStores: productStoreRead.records,
    productStoreShipmentMethods,
    readiness: readinessRead.readiness,
    remote: readinessRead.remote,
    remoteError: readinessRead.error,
    hydrated,
    detailErrors,
    readyForMutation,
    refreshDetails,
  };
}

function assertSuccessful(response: any, fallback: string): void {
  if(commonUtil.hasError(response)) {
    throw new Error(getResponseErrorMessage(response, fallback));
  }
}

export async function createCarrier(input: {
  partyId: string;
  groupName: string;
}): Promise<string> {
  const partyId = input.partyId.trim().toUpperCase();
  const groupName = input.groupName.trim();
  if(!partyId || !groupName) {throw new Error("Carrier ID and name are required.");}

  const response: any = await api({
    url: "oms/shippingGateways/carrierParties",
    method: "post",
    data: { partyId, groupName },
  });
  assertSuccessful(response, "Failed to create the carrier.");
  const createdPartyId = String(response?.data?.partyId || partyId);
  await refreshAfterMutation("carrier", { partyId: createdPartyId });

  return createdPartyId;
}

export async function renameCarrier(partyId: string, groupName: string): Promise<void> {
  const trimmedName = groupName.trim();
  if(!trimmedName) {throw new Error("Carrier name is required.");}
  const response: any = await api({
    url: `admin/organizations/${encodeURIComponent(partyId)}`,
    method: "post",
    data: { partyId, groupName: trimmedName },
  });
  assertSuccessful(response, "Failed to rename the carrier.");
  await refreshAfterMutation("carrier", { partyId });
}

const carrierMethodData = (partyId: string, shipmentMethodTypeId: string) => ({
  partyId,
  roleTypeId: CARRIER_ROLE_TYPE_ID,
  shipmentMethodTypeId,
});

export async function enableCarrierShipmentMethod(
  partyId: string,
  shipmentMethodTypeId: string,
): Promise<void> {
  const response: any = await api({
    url: "oms/shippingGateways/carrierShipmentMethods",
    method: "post",
    data: carrierMethodData(partyId, shipmentMethodTypeId),
  });
  assertSuccessful(response, "Failed to enable the carrier shipment method.");
  await refreshAfterMutation("carrierShipmentMethod", { partyId });
}

export async function updateCarrierShipmentMethod(
  partyId: string,
  shipmentMethodTypeId: string,
  fields: Pick<CarrierShipmentMethod, "carrierServiceCode" | "deliveryDays" | "sequenceNumber">,
): Promise<void> {
  const mutableFields = {
    ...(fields.carrierServiceCode !== undefined
      ? { carrierServiceCode: fields.carrierServiceCode }
      : {}),
    ...(fields.deliveryDays !== undefined ? { deliveryDays: fields.deliveryDays } : {}),
    ...(fields.sequenceNumber !== undefined ? { sequenceNumber: fields.sequenceNumber } : {}),
  };
  const response: any = await api({
    url: "oms/shippingGateways/carrierShipmentMethods",
    method: "put",
    data: {
      ...mutableFields,
      // The selected row owns its complete identity; caller fields can never redirect the store.
      ...carrierMethodData(partyId, shipmentMethodTypeId),
    },
  });
  assertSuccessful(response, "Failed to update the carrier shipment method.");
  await refreshAfterMutation("carrierShipmentMethod", { partyId });
}

const PRODUCT_STORE_ASSOCIATION_PAGE_SIZE = 100;
const PRODUCT_STORE_ASSOCIATION_MAX_PAGES = 40;

function productStoreAssociationKey(row: ProductStoreShipmentMethod): string {
  return String(row.productStoreShipMethId ||
    [
      row.productStoreId,
      row.partyId,
      row.roleTypeId,
      row.shipmentMethodTypeId,
      row.fromDate,
    ].join("|"),);
}

async function loadCarrierProductStoreAssociations(
  partyId: string,
  shipmentMethodTypeId: string,
): Promise<ProductStoreShipmentMethod[]> {
  const associations: ProductStoreShipmentMethod[] = [];
  const seen = new Set<string>();

  for(let pageIndex = 0; ; pageIndex += 1) {
    if(pageIndex >= PRODUCT_STORE_ASSOCIATION_MAX_PAGES) {
      throw new Error("The carrier product-store association list reached the " +
        `${PRODUCT_STORE_ASSOCIATION_MAX_PAGES}-page safety limit; ` +
        "the carrier shipment method was not deleted.",);
    }
    const response: any = await api({
      url: `oms/shippingGateways/carrierParties/${encodeURIComponent(partyId)}/productStoreShipmentMethods`,
      method: "get",
      params: {
        shipmentMethodTypeId,
        roleTypeId: CARRIER_ROLE_TYPE_ID,
        pageSize: PRODUCT_STORE_ASSOCIATION_PAGE_SIZE,
        pageIndex,
      },
    });
    assertSuccessful(response, "Failed to load the carrier's product-store shipment methods.");
    if(!Array.isArray(response?.data)) {
      throw new Error("The carrier product-store association endpoint must return an array; " +
        "the complete dependency set cannot be proven and the carrier shipment method was not deleted.",);
    }
    const page: ProductStoreShipmentMethod[] = response.data.map((row: ProductStoreShipmentMethod) => ({
      ...row,
      // This nested route owns the parent scope even when its projected rows omit or stale it.
      partyId,
      roleTypeId: row.roleTypeId ?? CARRIER_ROLE_TYPE_ID,
    }));
    let added = 0;
    for(const row of page) {
      const key = productStoreAssociationKey(row);
      if(seen.has(key)) {continue;}
      seen.add(key);
      associations.push(row);
      added += 1;
    }

    if(page.length === PRODUCT_STORE_ASSOCIATION_PAGE_SIZE && added === 0) {
      throw new Error("The carrier product-store association endpoint returned a repeated page " +
        `${pageIndex}; the complete dependency set cannot be proven and the carrier ` +
        "shipment method was not deleted.",);
    }
    if(page.length < PRODUCT_STORE_ASSOCIATION_PAGE_SIZE) {break;}
  }

  return associations;
}

async function resyncDomainsBestEffort(domains: string[]): Promise<string[]> {
  const uniqueDomains = [...new Set(domains)];
  const results = await Promise.allSettled(uniqueDomains.map((domain) => resyncDomain(domain)));

  return results.flatMap((result, index) =>
    result.status === "rejected" ? [uniqueDomains[index]] : []);
}

/**
 * Close every active store association before deleting the carrier method's three-part PK.
 *
 * Re-enabling the carrier method deliberately does not recreate those product-store rows.
 */
export async function deleteCarrierShipmentMethod(
  partyId: string,
  shipmentMethodTypeId: string,
  /** @deprecated Retained for caller compatibility; live OMS data is always authoritative. */
  _legacyProductStoreAssociations?: ProductStoreShipmentMethod[],
): Promise<void> {
  void _legacyProductStoreAssociations;
  const productStoreAssociations = await loadCarrierProductStoreAssociations(
    partyId,
    shipmentMethodTypeId,
  );
  const unsafeDependencies = productStoreAssociations.filter((row) =>
    row.roleTypeId === CARRIER_ROLE_TYPE_ID &&
    activeAt(row) &&
    (
      !row.shipmentMethodTypeId ||
      (
        row.shipmentMethodTypeId === shipmentMethodTypeId &&
        (!row.productStoreId || !row.productStoreShipMethId)
      )
    ));
  if(unsafeDependencies.length) {
    const identifiers = unsafeDependencies.map((row) =>
      row.productStoreShipMethId || row.productStoreId || "unidentified association");
    throw new Error("Active product-store dependencies could not be classified or expired safely: " +
      `${identifiers.join(", ")}. The carrier shipment method was not deleted.`,);
  }
  const matchingAssociations = productStoreAssociations.filter((row) =>
    row.partyId === partyId &&
    row.shipmentMethodTypeId === shipmentMethodTypeId &&
    (!row.roleTypeId || row.roleTypeId === CARRIER_ROLE_TYPE_ID) &&
    Boolean(row.productStoreId) &&
    Boolean(row.productStoreShipMethId) &&
    activeAt(row));

  const expirationResults = await Promise.allSettled(matchingAssociations.map((row) =>
    expireProductStoreShipmentMethod(
      row.productStoreId,
      row.productStoreShipMethId,
      Date.now(),
      { refresh: false },
    )),);
  const committedAssociationIds = expirationResults.flatMap((result, index) =>
    result.status === "fulfilled"
      ? [matchingAssociations[index].productStoreShipMethId]
      : []);
  const failedAssociationIds = expirationResults.flatMap((result, index) =>
    result.status === "rejected"
      ? [matchingAssociations[index].productStoreShipMethId]
      : []);
  const expiredCount = committedAssociationIds.length;
  if(failedAssociationIds.length) {
    const failedReconciliationDomains = await resyncDomainsBestEffort([
      "productStoreShippingMethod",
      "productStoreShipmentCount",
    ]);
    throw new Error(`Committed product-store association IDs: ${committedAssociationIds.join(", ") || "none"}. ` +
      `Failed product-store association IDs: ${failedAssociationIds.join(", ")}. ` +
      `The carrier shipment method was not deleted.${
        failedReconciliationDomains.length
          ? " Cache reconciliation also failed for domains: " +
          `${failedReconciliationDomains.join(", ")}.`
          : ""}`,);
  }

  try {
    const response: any = await api({
      url: "oms/shippingGateways/carrierShipmentMethods",
      method: "delete",
      data: carrierMethodData(partyId, shipmentMethodTypeId),
    });
    assertSuccessful(response, "Failed to delete the carrier shipment method.");
  } catch (error) {
    if(expiredCount > 0) {
      const failedReconciliationDomains = await resyncDomainsBestEffort([
        "productStoreShippingMethod",
        "productStoreShipmentCount",
        "carrierShipmentMethod",
      ]);
      throw new Error(
        `${getResponseErrorMessage(error, "Failed to delete the carrier shipment method.")} ` +
        `Committed product-store association IDs: ${committedAssociationIds.join(", ")}. ` +
        `Failed carrier shipment method ID: ${shipmentMethodTypeId}.${
          failedReconciliationDomains.length
            ? " Cache reconciliation also failed for domains: " +
            `${failedReconciliationDomains.join(", ")}.`
            : ""}`,
        { cause: error },
      );
    }
    throw error;
  }

  const affectedProductStoreIds = [
    ...new Set(matchingAssociations.map((row) => row.productStoreId)),
  ];
  try {
    if(affectedProductStoreIds.length) {
      await Promise.all(affectedProductStoreIds.map((productStoreId) =>
        refreshAfterMutation("productStoreShippingMethod", { productStoreId })),);
      await resyncDomain("productStoreShipmentCount");
    }
    await refreshAfterMutation("carrierShipmentMethod", { partyId });
  } catch (error) {
    await resyncDomainsBestEffort([
      ...(affectedProductStoreIds.length
        ? ["productStoreShippingMethod", "productStoreShipmentCount"]
        : []),
      "carrierShipmentMethod",
    ]);
    throw new CacheReconciliationError(
      "carrierShipmentMethod",
      { partyId, shipmentMethodTypeId },
      error,
    );
  }
}

export async function resequenceCarrierShipmentMethods(
  partyId: string,
  shipmentMethods: Array<Pick<CarrierShipmentMethod, "shipmentMethodTypeId">>,
): Promise<void> {
  if(!shipmentMethods.length) {return;}
  const results = await Promise.allSettled(shipmentMethods.map(async (method, index) => {
    const response: any = await api({
      url: "oms/shippingGateways/carrierShipmentMethods",
      method: "put",
      data: {
        ...carrierMethodData(partyId, method.shipmentMethodTypeId),
        sequenceNumber: index + 1,
      },
    });
    assertSuccessful(response, `Failed to resequence ${method.shipmentMethodTypeId}.`);

    return method.shipmentMethodTypeId;
  }));
  const committedMethodIds = results.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : []);
  const failedMethodIds = results.flatMap((result, index) =>
    result.status === "rejected" ? [shipmentMethods[index].shipmentMethodTypeId] : []);
  if(failedMethodIds.length) {
    const failedReconciliationDomains = await resyncDomainsBestEffort([
      "carrierShipmentMethod",
    ]);
    throw new Error(`Committed shipment method IDs: ${committedMethodIds.join(", ") || "none"}. ` +
      `Failed shipment method IDs: ${failedMethodIds.join(", ")}. ${
        failedReconciliationDomains.length
          ? "Cache reconciliation also failed for domains: " +
          `${failedReconciliationDomains.join(", ")}.`
          : "The carrier methods were reloaded from the server."}`,);
  }

  await refreshAfterMutation("carrierShipmentMethod", { partyId });
}
