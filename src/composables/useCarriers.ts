/* eslint-disable no-restricted-syntax -- carrier orchestration owns ordered multi-write consistency */
import { computed } from "vue";
import { api, commonUtil } from "@common";
import {
  bootstrapState,
  refreshAfterMutation,
  resyncDomain,
} from "@/services/appCacheBootstrap";
import { getResponseErrorMessage } from "@/utils";
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
  | "loading"
  | "ready"
  | "action-required"
  | "verification-unavailable"
  | "not-applicable";

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
  const configuredByType = new Map(
    configuredMethods.map((method) => [method.shipmentMethodTypeId, method]),
  );

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
      const sequence = row.sequenceNumber === null
        || row.sequenceNumber === undefined
        || row.sequenceNumber === ""
        || !Number.isFinite(parsed)
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
  if (!remote.hydrated) {
    tenant = "loading";
  } else if (remote.error) {
    tenant = "verification-unavailable";
  } else {
    const complete = Boolean(
      String(unigateRemote?.internalId ?? "").trim()
      && String(unigateRemote?.sendUrl ?? "").trim(),
    );
    tenant = complete ? "ready" : "action-required";
  }

  if (!automaticAddressValidationCapable) {
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
      if (method.partyId) byParty[method.partyId] = (byParty[method.partyId] ?? 0) + 1;
      return byParty;
    }, {} as Record<string, number>));
  const carriers = computed(() =>
    carrierRead.records.value.map((carrier) => ({
      ...carrier,
      shipmentMethodCount: counts.value[carrier.partyId] ?? 0,
    })));
  const hydrated = computed(() => carrierRead.hydrated.value && methodRead.hydrated.value);
  const catalogErrors = computed<Record<string, string>>(() =>
    ["carrier", "carrierShipmentMethod"].reduce((errors, domain) => {
      const message = bootstrapState.errors[domain];
      if (message) errors[domain] = message;
      return errors;
    }, {} as Record<string, string>));
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
    orderedCarrierMethods(
      mergeCarrierShipmentMethods(typeRead.records.value, configuredRead.records.value),
    ));

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
  const associations = computed(() =>
    associationRead.records.value.filter((row) =>
      row.roleTypeId === CARRIER_ROLE_TYPE_ID && activeAt(row)));
  const facilities = computed(() => {
    const byFacility = new Map(
      associations.value.map((association) => [association.facilityId, association]),
    );
    return facilityRead.records.value
      .filter((facility) =>
        facility.facilityTypeId !== "VIRTUAL_FACILITY"
        && facility.parentTypeId !== "VIRTUAL_FACILITY")
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
  const productStoreShipmentMethods = computed(() =>
    productStoreMethodRead.records.value.filter((row) =>
      (!row.roleTypeId || row.roleTypeId === CARRIER_ROLE_TYPE_ID) && activeAt(row)));
  const hydrated = computed(() =>
    carrierRead.hydrated.value
    && methodRead.hydrated.value
    && facilityRead.hydrated.value
    && productStoreRead.hydrated.value
    && productStoreMethodRead.hydrated.value
    && readinessRead.hydrated.value);
  const detailErrors = computed<Record<string, string>>(() =>
    CARRIER_DETAIL_DOMAINS.reduce((errors, domain) => {
      const message = bootstrapState.errors[domain];
      if (message) errors[domain] = message;
      return errors;
    }, {} as Record<string, string>));
  const readyForMutation = computed(() =>
    hydrated.value && Object.keys(detailErrors.value).length === 0);

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
  };
}

function assertSuccessful(response: any, fallback: string): void {
  if (commonUtil.hasError(response)) {
    throw new Error(getResponseErrorMessage(response, fallback));
  }
}

export async function createCarrier(input: {
  partyId: string;
  groupName: string;
}): Promise<string> {
  const partyId = input.partyId.trim().toUpperCase();
  const groupName = input.groupName.trim();
  if (!partyId || !groupName) throw new Error("Carrier ID and name are required.");

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
  if (!trimmedName) throw new Error("Carrier name is required.");
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
  const response: any = await api({
    url: "oms/shippingGateways/carrierShipmentMethods",
    method: "put",
    data: { ...carrierMethodData(partyId, shipmentMethodTypeId), ...fields },
  });
  assertSuccessful(response, "Failed to update the carrier shipment method.");
  await refreshAfterMutation("carrierShipmentMethod", { partyId });
}

async function resyncProductStoreMethodDomains(): Promise<void> {
  await Promise.all([
    resyncDomain("productStoreShippingMethod"),
    resyncDomain("productStoreShipmentCount"),
  ]);
}

/**
 * Close every active store association before deleting the carrier method's three-part PK.
 *
 * Re-enabling the carrier method deliberately does not recreate those product-store rows.
 */
export async function deleteCarrierShipmentMethod(
  partyId: string,
  shipmentMethodTypeId: string,
  productStoreAssociations: ProductStoreShipmentMethod[] = [],
): Promise<void> {
  const matchingAssociations = productStoreAssociations.filter((row) =>
    row.partyId === partyId
    && row.shipmentMethodTypeId === shipmentMethodTypeId
    && (!row.roleTypeId || row.roleTypeId === CARRIER_ROLE_TYPE_ID)
    && Boolean(row.productStoreId)
    && Boolean(row.productStoreShipMethId)
    && activeAt(row));

  const expirationResults = await Promise.allSettled(
    matchingAssociations.map((row) =>
      expireProductStoreShipmentMethod(
        row.productStoreId,
        row.productStoreShipMethId,
        Date.now(),
        { refresh: false },
      )),
  );
  const expiredCount = expirationResults.filter((result) => result.status === "fulfilled").length;
  if (expiredCount !== matchingAssociations.length) {
    await resyncProductStoreMethodDomains();
    throw new Error(
      `${expiredCount} of ${matchingAssociations.length} product-store associations were expired. ` +
      "The carrier shipment method was not deleted.",
    );
  }

  try {
    const response: any = await api({
      url: "oms/shippingGateways/carrierShipmentMethods",
      method: "delete",
      data: carrierMethodData(partyId, shipmentMethodTypeId),
    });
    assertSuccessful(response, "Failed to delete the carrier shipment method.");
  } catch (error) {
    if (expiredCount > 0) {
      await Promise.all([
        resyncProductStoreMethodDomains(),
        resyncDomain("carrierShipmentMethod"),
      ]);
      throw new Error(
        `${getResponseErrorMessage(error, "Failed to delete the carrier shipment method.")} ` +
        `${expiredCount} product-store associations were already expired.`,
        { cause: error },
      );
    }
    throw error;
  }

  const affectedProductStoreIds = [
    ...new Set(matchingAssociations.map((row) => row.productStoreId)),
  ];
  try {
    if (affectedProductStoreIds.length) {
      await Promise.all(
        affectedProductStoreIds.map((productStoreId) =>
          refreshAfterMutation("productStoreShippingMethod", { productStoreId })),
      );
      await resyncDomain("productStoreShipmentCount");
    }
    await refreshAfterMutation("carrierShipmentMethod", { partyId });
  } catch (error) {
    await Promise.all([
      ...(affectedProductStoreIds.length ? [resyncProductStoreMethodDomains()] : []),
      resyncDomain("carrierShipmentMethod"),
    ]);
    throw new Error(
      "The carrier shipment method was deleted, but its cached detail could not be refreshed.",
      { cause: error },
    );
  }
}

export async function resequenceCarrierShipmentMethods(
  partyId: string,
  shipmentMethods: Array<Pick<CarrierShipmentMethod, "shipmentMethodTypeId">>,
): Promise<void> {
  if (!shipmentMethods.length) return;
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
  const committed = results.filter((result) => result.status === "fulfilled").length;
  if (committed !== shipmentMethods.length) {
    await resyncDomain("carrierShipmentMethod");
    throw new Error(
      `${committed} of ${shipmentMethods.length} shipment methods were resequenced. ` +
      "The carrier methods were reloaded from the server.",
    );
  }

  await refreshAfterMutation("carrierShipmentMethod", { partyId });
}
