import { companyDb } from "@/db/companyDb";
import {
  NETSUITE_REVIEW_DEPARTMENTS_DOMAIN, NETSUITE_REVIEW_LOCATIONS_DOMAIN, NETSUITE_REVIEW_SHARING_DOMAIN, NETSUITE_REVIEW_SUBSIDIARIES_DOMAIN,
} from "@/config/appSyncConfig";
import { defineSyncDomain } from "@common/db/sync/defineSyncDomain";
import { workerGet } from "@common/core/workerRemoteApi";

const yesNo = (value: unknown) => (value ? "Y" : "N");

async function readList(ctx: any, url: string, listName: string) {
  const response = await workerGet(ctx, url, {});
  if (!Array.isArray(response?.[listName])) throw new Error(`${url} gave no ${listName} list`);
  return response;
}

const reviewSubsidiaryEntity = companyDb.entity(companyDb.tables.netSuiteReviewSubsidiaries);
const reviewLocationEntity = companyDb.entity(companyDb.tables.netSuiteReviewLocations);
const reviewFacilityEntity = companyDb.entity(companyDb.tables.netSuiteReviewFacilities);
const reviewDepartmentEntity = companyDb.entity(companyDb.tables.netSuiteReviewDepartments);
const reviewUnknownDepartmentEntity = companyDb.entity(companyDb.tables.netSuiteReviewUnknownDepartments);
const reviewSharingEntity = companyDb.entity(companyDb.tables.netSuiteReviewSharing);
const accountFeatureEntity = companyDb.entity(companyDb.tables.netSuiteAccountFeatures);

export const netSuiteReviewSubsidiariesDomain = defineSyncDomain({
  name: NETSUITE_REVIEW_SUBSIDIARIES_DOMAIN,
  table: companyDb.tables.netSuiteReviewSubsidiaries,
  label: "NetSuite setup review: subsidiaries",
  syncClass: "A",
  intervalMs: 600_000,
  async sync(ctx) {
    const { subsidiaries } = await readList(ctx, "netsuite/setupReview/subsidiaries", "subsidiaries");
    const { written } = await reviewSubsidiaryEntity.snapshotReplace(subsidiaries.map((subsidiary: any) => ({
      subsidiaryId: String(subsidiary.subsidiaryId),
      name: subsidiary.name,
      parentId: subsidiary.parentId,
      isElimination: yesNo(subsidiary.isElimination),
      isInactive: yesNo(subsidiary.isInactive),
      partyId: subsidiary.partyId,
      expectedParentPartyId: subsidiary.expectedParentPartyId,
      currentParentPartyIds: subsidiary.currentParentPartyIds ?? [],
      reviewStatus: subsidiary.reviewStatus,
      differences: subsidiary.differences ?? [],
    })));
    return written;
  },
});

export const netSuiteReviewLocationsDomain = defineSyncDomain({
  name: NETSUITE_REVIEW_LOCATIONS_DOMAIN,
  table: companyDb.tables.netSuiteReviewLocations,
  label: "NetSuite setup review: locations",
  syncClass: "A",
  intervalMs: 600_000,
  async sync(ctx) {
    const { locations, facilitiesWithoutId, facilitiesWithUnknownId } = await readList(ctx, "netsuite/setupReview/locations", "locations");
    await reviewFacilityEntity.snapshotReplace([
      ...(facilitiesWithoutId ?? []).map((facility: any) => ({ ...facility, problem: "WITHOUT_ID" })),
      ...(facilitiesWithUnknownId ?? []).map((facility: any) => ({ ...facility, problem: "UNKNOWN_ID" })),
    ]);
    const { written } = await reviewLocationEntity.snapshotReplace(locations.map((location: any) => ({
      netSuiteLocationId: String(location.netSuiteLocationId),
      name: location.name,
      subsidiaryId: location.subsidiaryId,
      isInactive: yesNo(location.isInactive),
      expectedOwnerPartyId: location.expectedOwnerPartyId,
      facilities: location.facilities ?? [],
      reviewStatus: location.reviewStatus,
      warnings: location.warnings ?? [],
    })));
    return written;
  },
});

export const netSuiteReviewDepartmentsDomain = defineSyncDomain({
  name: NETSUITE_REVIEW_DEPARTMENTS_DOMAIN,
  table: companyDb.tables.netSuiteReviewDepartments,
  label: "NetSuite setup review: departments",
  syncClass: "A",
  intervalMs: 600_000,
  async sync(ctx) {
    const { departments, departmentsWithUnknownId } = await readList(ctx, "netsuite/setupReview/departments", "departments");
    await reviewUnknownDepartmentEntity.snapshotReplace(departmentsWithUnknownId ?? []);
    const { written } = await reviewDepartmentEntity.snapshotReplace(departments.map((department: any) => ({
      departmentId: String(department.departmentId),
      name: department.name,
      subsidiaryIds: department.subsidiaryIds ?? [],
      companySubsidiaryIds: department.companySubsidiaryIds ?? [],
      isInactive: yesNo(department.isInactive),
      parties: department.parties ?? [],
      reviewStatus: department.reviewStatus,
    })));
    return written;
  },
});

export const netSuiteReviewSharingDomain = defineSyncDomain({
  name: NETSUITE_REVIEW_SHARING_DOMAIN,
  table: companyDb.tables.netSuiteReviewSharing,
  label: "NetSuite setup review: location sharing",
  syncClass: "A",
  intervalMs: 600_000,
  async sync(ctx) {
    const { sharingEnabled, relationships } = await readList(ctx, "netsuite/setupReview/locationSharing", "relationships");
    await accountFeatureEntity.upsertMany([{ featureId: "LOCATION_SHARING", isEnabled: yesNo(sharingEnabled) }]);
    const { written } = await reviewSharingEntity.snapshotReplace(relationships.map((relationship: any) => ({
      relationshipId: String(relationship.relationshipId),
      originatingSubsidiaryId: relationship.originatingSubsidiaryId,
      originatingSubsidiaryName: relationship.originatingSubsidiaryName,
      inventorySubsidiaryId: relationship.inventorySubsidiaryId,
      inventorySubsidiaryName: relationship.inventorySubsidiaryName,
      allowsFulfillment: yesNo(relationship.allowsFulfillment),
      allowsCustomerReturn: yesNo(relationship.allowsCustomerReturn),
      allLocationsForFulfillment: yesNo(relationship.allLocationsForFulfillment),
      allLocationsForCustomerReturn: yesNo(relationship.allLocationsForCustomerReturn),
      isInactive: yesNo(relationship.isInactive),
    })));
    return written;
  },
});
