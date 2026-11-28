import { computed, ref } from "vue";
import { api, logger, useLiveEntity } from "@common";
import { serviceState } from "@common/db";
import { companyDb } from "@/db/companyDb";
import { resyncDomain } from "@/db/appDbSync";
import {
  NETSUITE_REVIEW_DEPARTMENTS_DOMAIN, NETSUITE_REVIEW_LOCATIONS_DOMAIN, NETSUITE_REVIEW_SHARING_DOMAIN, NETSUITE_REVIEW_SUBSIDIARIES_DOMAIN,
} from "@/config/appSyncConfig";
import { readableError, useNetSuiteConnection, useNetSuiteSubsidiaries } from "@/composables/useNetSuiteSubsidiaries";

const UNFIXABLE_SUBSIDIARY_DIFFERENCES = ["MORE_THAN_ONE_ORGANIZATION", "ELIMINATION_HAS_ORGANIZATION"];

const byNumericId = (field: string) => (first: any, second: any) => Number(first[field]) - Number(second[field]);

function reviewList(table: any, domain: string, idField: string) {
  const { records, hydrated } = useLiveEntity<any>(table);
  const loadError = computed(() => readableError(serviceState.errors[domain]));
  const isFirstPassPending = computed(() => !serviceState.syncedAt[domain] && !loadError.value && !serviceState.errors.__start);
  return {
    rows: computed(() => [...records.value].sort(byNumericId(idField))),
    hydrated,
    loadError,
    isLoading: computed(() => !hydrated.value || (!records.value.length && isFirstPassPending.value)),
  };
}

export function useNetSuiteSetupReview() {
  const subsidiaries = reviewList(companyDb.tables.netSuiteReviewSubsidiaries, NETSUITE_REVIEW_SUBSIDIARIES_DOMAIN, "subsidiaryId");
  const locations = reviewList(companyDb.tables.netSuiteReviewLocations, NETSUITE_REVIEW_LOCATIONS_DOMAIN, "netSuiteLocationId");
  const departments = reviewList(companyDb.tables.netSuiteReviewDepartments, NETSUITE_REVIEW_DEPARTMENTS_DOMAIN, "departmentId");
  const sharing = reviewList(companyDb.tables.netSuiteReviewSharing, NETSUITE_REVIEW_SHARING_DOMAIN, "relationshipId");
  const { records: problemFacilities } = useLiveEntity<any>(companyDb.tables.netSuiteReviewFacilities);
  const { records: accountFeatures } = useLiveEntity<any>(companyDb.tables.netSuiteAccountFeatures);
  const { records: unknownDepartments } = useLiveEntity<any>(companyDb.tables.netSuiteReviewUnknownDepartments);

  const facilitiesWithoutId = computed(() => problemFacilities.value.filter((facility: any) => facility.problem === "WITHOUT_ID"));
  const facilitiesWithUnknownId = computed(() => problemFacilities.value.filter((facility: any) => facility.problem === "UNKNOWN_ID"));
  const locationSections = computed(() => {
    const rows = locations.rows.value;
    const hasWarnings = (row: any) => Boolean(row.warnings?.length);
    return {
      wrongCompany: rows.filter((row: any) => row.reviewStatus === "DIFFERS"),
      byHand: rows.filter((row: any) => row.reviewStatus !== "DIFFERS" && hasWarnings(row)),
      unused: rows.filter((row: any) => row.reviewStatus === "NEW" && row.isInactive !== "Y" && !hasWarnings(row)),
      matching: rows.filter((row: any) => row.reviewStatus === "MATCHES" && !hasWarnings(row)),
    };
  });
  const subsidiarySections = computed(() => {
    const rows = subsidiaries.rows.value;
    const needsHandFix = (row: any) => row.differences.some((difference: string) => UNFIXABLE_SUBSIDIARY_DIFFERENCES.includes(difference));
    const differs = rows.filter((row: any) => (row.reviewStatus === "NEW" && row.isInactive !== "Y") || (row.reviewStatus === "DIFFERS" && !needsHandFix(row)));
    const byHand = rows.filter((row: any) => row.reviewStatus === "DIFFERS" && needsHandFix(row));
    const matching = rows.filter((row: any) => row.reviewStatus === "MATCHES");
    const unused = rows.filter((row: any) => !differs.includes(row) && !byHand.includes(row) && !matching.includes(row));
    return { differs, byHand, unused, matching };
  });
  const departmentSections = computed(() => {
    const rows = departments.rows.value;
    return {
      differs: rows.filter((row: any) => row.reviewStatus === "DIFFERS"),
      unused: rows.filter((row: any) => row.reviewStatus === "NOT_USED"),
      matching: rows.filter((row: any) => row.reviewStatus === "MATCHES"),
    };
  });
  const actionCounts = computed<Record<string, number>>(() => ({
    subsidiaries: subsidiarySections.value.differs.length + subsidiarySections.value.byHand.length,
    locations: locationSections.value.wrongCompany.length + facilitiesWithoutId.value.length,
    departments: departmentSections.value.differs.length + unknownDepartments.value.length,
  }));

  const companyNameByParty = computed(() => Object.fromEntries(subsidiaries.rows.value
    .filter((subsidiary: any) => subsidiary.partyId)
    .map((subsidiary: any) => [subsidiary.partyId, `${subsidiary.name} (${subsidiary.subsidiaryId})`])));
  const companyNameBySubsidiary = computed(() => Object.fromEntries(subsidiaries.rows.value
    .map((subsidiary: any) => [subsidiary.subsidiaryId, `${subsidiary.name} (${subsidiary.subsidiaryId})`])));

  return {
    subsidiaries,
    locations,
    departments,
    sharing,
    isSharingOff: computed(() => accountFeatures.value.some((feature: any) => feature.featureId === "LOCATION_SHARING" && feature.isEnabled === "N")),
    departmentsWithUnknownId: computed(() => [...unknownDepartments.value].sort((first: any, second: any) => String(first.partyId).localeCompare(String(second.partyId)))),
    facilitiesWithoutId,
    facilitiesWithUnknownId,
    locationSections,
    subsidiarySections,
    departmentSections,
    actionCounts,
    companyName: (partyId?: string) => (partyId ? companyNameByParty.value[partyId] ?? partyId : undefined),
    subsidiaryName: (subsidiaryId?: string) => (subsidiaryId ? companyNameBySubsidiary.value[subsidiaryId] ?? subsidiaryId : undefined),
  };
}

export const REFUSAL_REASONS: Record<string, string> = {
  NOT_IN_NETSUITE: "NetSuite no longer has it.",
  ELIMINATION: "It exists only for accounting.",
  ELIMINATION_HAS_ORGANIZATION: "It exists only for accounting, but an organization holds its id. Fix this by hand.",
  MORE_THAN_ONE_ORGANIZATION: "More than one organization holds its id. Fix this by hand.",
  INACTIVE_IN_NETSUITE: "It is inactive in NetSuite.",
  PARENT_NOT_SET_UP: "Its parent company is not set up. Save the parent too.",
  PICKED_TWICE: "The same NetSuite location or OMS location was picked twice.",
  ALREADY_HELD: "An OMS location already has this NetSuite id.",
  FACILITY_NOT_FREE: "The picked OMS location already has a NetSuite id, or is not a physical location.",
  COMPANY_NOT_SET_UP: "A company it belongs to is not set up yet. Save that company too.",
  NO_OMS_LOCATION: "No OMS location has this NetSuite id.",
  NOT_USED_IN_OMS: "The OMS does not use this department.",
};

const COMPANY_NOT_SET_UP_STATUSES = ["ROLE_MISSING", "DUPLICATE", "NOT_SET_UP"];

export const SETUP_STATUS_DOMAINS = [{ name: NETSUITE_REVIEW_LOCATIONS_DOMAIN }, { name: NETSUITE_REVIEW_DEPARTMENTS_DOMAIN }];

export function useNetSuiteSetupStatus() {
  const connection = useNetSuiteConnection();
  const { subsidiaries, isLoading: isSubsidiariesLoading } = useNetSuiteSubsidiaries();
  const { locations, actionCounts } = useNetSuiteSetupReview();

  const companiesNotSetUp = computed(() => subsidiaries.value
    .filter((subsidiary: any) => COMPANY_NOT_SET_UP_STATUSES.includes(subsidiary.status) && subsidiary.isInactive !== "Y"));

  const state = computed(() => {
    if (connection.isLoading.value) return "LOADING";
    if (!connection.accountId.value) return "NO_LOGIN";
    if (isSubsidiariesLoading.value || !locations.hydrated.value) return "LOADING";
    if (!subsidiaries.value.length) return "NOT_READ";
    if (companiesNotSetUp.value.length) return "COMPANIES_NOT_SET_UP";
    if (!locations.rows.value.length) return "NOT_CHECKED";
    if (actionCounts.value.locations || actionCounts.value.departments) return "DIFFERS";
    return "MATCHES";
  });

  const FLOW_WARNINGS: Record<string, string> = {
    COMPANIES_NOT_SET_UP: "Set up the companies first.",
    NOT_CHECKED: "Company setup is not checked yet.",
    DIFFERS: "Company setup differs from NetSuite.",
  };

  return {
    state,
    companiesNotSetUp,
    actionCounts,
    tabToFix: computed(() => (state.value === "COMPANIES_NOT_SET_UP" ? "subsidiaries" : actionCounts.value.locations ? "locations" : "departments")),
    flowWarning: computed<string | undefined>(() => FLOW_WARNINGS[state.value]),
    isCompanyNotSetUp: (subsidiary: any) => COMPANY_NOT_SET_UP_STATUSES.includes(subsidiary?.status),
  };
}

export function reviewRoute(tab: string, id?: string) {
  return { path: "/netsuite/setup-review", query: id ? { tab, id } : { tab } };
}

export interface NetSuiteSetupReviewChoices {
  subsidiaryIds: string[];
  locationIds: string[];
  locationPicks: { netSuiteLocationId: string; facilityId: string }[];
  departmentIds: string[];
}

const SAVED_REVIEW_DOMAINS = [NETSUITE_REVIEW_SUBSIDIARIES_DOMAIN, NETSUITE_REVIEW_LOCATIONS_DOMAIN, NETSUITE_REVIEW_DEPARTMENTS_DOMAIN];

export function useNetSuiteSetupReviewSave() {
  const lastSave = ref<{ username: string; savedDate: number } | undefined>();
  const isSaving = ref(false);

  const loadLastSave = async () => {
    const lastSaveRead = (await api({ url: "netsuite/setupReview/lastSave", method: "get" }) as any).data;
    lastSave.value = lastSaveRead?.savedDate
      ? { username: lastSaveRead.savedByUsername ?? lastSaveRead.savedByUserId, savedDate: Number(lastSaveRead.savedDate) }
      : undefined;
  };

  const save = async (choices: NetSuiteSetupReviewChoices) => {
    isSaving.value = true;
    try {
      const saveResult = (await api({ url: "netsuite/setupReview", method: "post", data: choices }) as any).data;
      return { savedRows: saveResult.savedRows ?? [], refusedRows: saveResult.refusedRows ?? [] };
    } finally {
      const refreshes = await Promise.allSettled([...SAVED_REVIEW_DOMAINS.map((domain) => resyncDomain(domain)), loadLastSave()]);
      refreshes.filter((refresh) => refresh.status === "rejected")
        .forEach((refresh) => logger.error("Could not refresh the NetSuite setup review after saving", (refresh as PromiseRejectedResult).reason));
      isSaving.value = false;
    }
  };

  return { lastSave, isSaving, loadLastSave, save };
}
