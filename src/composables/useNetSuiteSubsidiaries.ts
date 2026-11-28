import { computed } from "vue";
import { useLiveEntity } from "@common";
import { serviceState } from "@common/db";
import { companyDb } from "@/db/companyDb";
import { NETSUITE_COMPANY_SETUP_DOMAIN, NETSUITE_SUBSIDIARIES_DOMAIN } from "@/config/appSyncConfig";

const NETSUITE_REST_REMOTE_ID = "NETSUITE_REST_API";

export function readableError(error: unknown): string | undefined {
  if (!error) return undefined;
  const text = String(error);
  const jsonStart = text.indexOf("{");
  if (jsonStart < 0) return text;
  try {
    const parsed = JSON.parse(text.slice(jsonStart));
    return String(parsed.errors ?? parsed.errorMessage ?? text).trim();
  } catch {
    return text;
  }
}

export function useNetSuiteSubsidiaries() {
  const { records, hydrated } = useLiveEntity<any>(companyDb.tables.netSuiteSubsidiaries);

  const loadError = computed(() => readableError(serviceState.errors[NETSUITE_SUBSIDIARIES_DOMAIN]));
  const isFirstPassPending = computed(() =>
    !serviceState.syncedAt[NETSUITE_SUBSIDIARIES_DOMAIN] && !loadError.value && !serviceState.errors.__start);

  const subsidiaries = computed(() => [...records.value]
    .sort((first, second) => Number(first.subsidiaryId) - Number(second.subsidiaryId)));

  return {
    subsidiaries,
    loadError,
    isLoading: computed(() => !hydrated.value || (!records.value.length && isFirstPassPending.value)),
  };
}

export function useNetSuiteConnection() {
  const { first: remote, hydrated } = useLiveEntity<any>(
    companyDb.tables.systemMessageRemotes,
    () => ({ equals: { systemMessageRemoteId: NETSUITE_REST_REMOTE_ID } }),
  );

  const accountId = computed<string | undefined>(() => remote.value?.remoteId || undefined);

  return {
    isLoading: computed(() => !hydrated.value),
    accountId,
    isSandbox: computed(() => /-sb\d*$/i.test(accountId.value ?? "")),
  };
}

export function useNetSuiteSubsidiary(subsidiaryId: () => string) {
  const { subsidiaries, isLoading: isSubsidiariesLoading, loadError } = useNetSuiteSubsidiaries();
  const subsidiary = computed(() => subsidiaries.value.find((row: any) => row.subsidiaryId === subsidiaryId()));
  const partyId = computed<string | undefined>(() => subsidiary.value?.partyId || undefined);

  const { first: companySetup, hydrated: companySetupHydrated } = useLiveEntity<any>(
    companyDb.tables.netSuiteCompanySetup,
    () => (partyId.value ? { equals: { partyId: partyId.value } } : { filter: () => false }),
  );
  const { records: reviewLocations } = useLiveEntity<any>(companyDb.tables.netSuiteReviewLocations);

  const companyNameByParty = computed(() => Object.fromEntries(subsidiaries.value
    .filter((row: any) => row.partyId)
    .map((row: any) => [row.partyId, `${row.name} (${row.subsidiaryId})`])));
  const subsidiaryNameById = computed(() => Object.fromEntries(subsidiaries.value
    .map((row: any) => [row.subsidiaryId, `${row.name} (${row.subsidiaryId})`])));

  const reviewLocationById = computed(() => new Map(reviewLocations.value.map((location: any) => [location.netSuiteLocationId, location])));
  const hasReview = computed(() => reviewLocations.value.length > 0);

  const ownedLocations = computed(() => (companySetup.value?.locations ?? []).map((location: any) => {
    if (!location.externalId) return { ...location, state: "NO_ID" };
    if (!hasReview.value) return { ...location, state: "NOT_CHECKED" };
    const reviewLocation = reviewLocationById.value.get(location.externalId);
    if (!reviewLocation) return { ...location, state: "NOT_IN_NETSUITE" };
    if (reviewLocation.subsidiaryId === subsidiaryId()) return { ...location, state: "MATCHES" };
    return { ...location, state: "OTHER_SUBSIDIARY", netSuiteCompanyName: subsidiaryNameById.value[reviewLocation.subsidiaryId] ?? reviewLocation.subsidiaryId };
  }));

  const ownedFacilityIds = computed(() => new Set(ownedLocations.value.map((location: any) => location.facilityId)));
  const locationsOwnedElsewhere = computed(() => reviewLocations.value
    .filter((location: any) => location.subsidiaryId === subsidiaryId())
    .flatMap((location: any) => (location.facilities ?? [])
      .filter((facility: any) => !ownedFacilityIds.value.has(facility.facilityId))
      .map((facility: any) => ({
        facilityId: facility.facilityId,
        facilityName: facility.facilityName,
        externalId: location.netSuiteLocationId,
        state: "OTHER_OWNER",
        ownerName: facility.ownerPartyId ? companyNameByParty.value[facility.ownerPartyId] ?? facility.ownerPartyId : undefined,
      }))));

  const companySetupError = computed(() => readableError(serviceState.errors[NETSUITE_COMPANY_SETUP_DOMAIN]));

  return {
    subsidiary,
    partyId,
    loadError,
    companySetupError,
    isLoading: computed(() => isSubsidiariesLoading.value
      || Boolean(partyId.value && !companySetupError.value && (!companySetupHydrated.value || !companySetup.value))),
    locations: computed(() => [...ownedLocations.value, ...locationsOwnedElsewhere.value]),
    stores: computed(() => companySetup.value?.stores ?? []),
    hasReview,
  };
}
