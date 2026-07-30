/* eslint-disable no-restricted-syntax -- pure hierarchy helpers and entity mutations share this entity composable */
import { api, commonUtil, translate } from "@common";
import { computed, ref } from "vue";
import { refreshAfterMutation, resyncDomain } from "@/services/appCacheBootstrap";
import { getResponseErrorMessage } from "@/utils";
import {
  facilityCache,
  organizationCache,
  organizationRelationshipCache,
} from "@/utils/cacheEntities";
import { isEffectiveNow } from "@/utils/cacheProjection";
import { onSessionCleared } from "./sessionScope";
import { useCachedList, useCachedRecord } from "./useCachedList";

export const INTERNAL_ORGANIZATION_ROLE = "INTERNAL_ORGANIZATIO";
export const ORGANIZATION_RELATIONSHIP_TYPE = "SUB_DIVISION";

export interface Organization {
  partyId: string;
  partyTypeId?: string;
  groupName?: string;
  externalId?: string;
  statusId?: string;
  roleTypeId?: string;
}

export interface OrganizationRelationship {
  partyIdFrom: string;
  partyIdTo: string;
  roleTypeIdFrom: string;
  roleTypeIdTo: string;
  partyRelationshipTypeId: string;
  fromDate?: string | number;
  thruDate?: string | number;
  statusId?: string;
}

export type OrganizationAnomalyCode =
  | "missing-parent" |
  "missing-child" |
  "multiple-parents" |
  "self-parent" |
  "cycle";

export interface OrganizationAnomaly {
  code: OrganizationAnomalyCode;
  partyId?: string;
  relatedPartyId?: string;
}

export interface OrganizationNode extends Organization {
  children: OrganizationNode[];
  path: string[];
}

export interface OrganizationForest {
  roots: OrganizationNode[];
  nodesById: Map<string, OrganizationNode>;
  parentById: Map<string, string>;
  anomalies: OrganizationAnomaly[];
}

export function isOrganizationRelationshipActive(
  relationship: OrganizationRelationship,
  now = Date.now(),
): boolean {
  return relationship.partyRelationshipTypeId === ORGANIZATION_RELATIONSHIP_TYPE &&
    relationship.roleTypeIdFrom === INTERNAL_ORGANIZATION_ROLE &&
    relationship.roleTypeIdTo === INTERNAL_ORGANIZATION_ROLE &&
    isEffectiveNow(relationship as unknown as Record<string, unknown>, now);
}

function byOrganizationName(a: Organization, b: Organization): number {
  return String(a.groupName ?? a.partyId).localeCompare(String(b.groupName ?? b.partyId)) ||
    a.partyId.localeCompare(b.partyId);
}

/** Build a complete, cycle-safe forest while keeping invalid records visible as roots. */
export function deriveOrganizationForest(
  organizations: Organization[],
  relationships: OrganizationRelationship[],
  now = Date.now(),
): OrganizationForest {
  const uniqueOrganizations = new Map<string, Organization>();
  for(const organization of organizations) {
    if(organization.partyId) {uniqueOrganizations.set(organization.partyId, organization);}
  }

  const candidateParents = new Map<string, Set<string>>();
  const anomalies: OrganizationAnomaly[] = [];
  for(const relationship of relationships.filter((row) => isOrganizationRelationshipActive(row, now))) {
    const parentId = String(relationship.partyIdFrom ?? "");
    const childId = String(relationship.partyIdTo ?? "");
    if(!uniqueOrganizations.has(parentId)) {
      anomalies.push({ code: "missing-parent", partyId: childId, relatedPartyId: parentId });
      continue;
    }
    if(!uniqueOrganizations.has(childId)) {
      anomalies.push({ code: "missing-child", partyId: parentId, relatedPartyId: childId });
      continue;
    }
    if(parentId === childId) {
      anomalies.push({ code: "self-parent", partyId: childId, relatedPartyId: parentId });
      continue;
    }
    const parents = candidateParents.get(childId) ?? new Set<string>();
    parents.add(parentId);
    candidateParents.set(childId, parents);
  }

  const parentById = new Map<string, string>();
  for(const [childId, parents] of candidateParents) {
    if(parents.size > 1) {
      anomalies.push({ code: "multiple-parents", partyId: childId });
      continue;
    }
    parentById.set(childId, [...parents][0]);
  }

  // Remove every parent edge participating in a cycle so all affected records remain reachable.
  const cycleMembers = new Set<string>();
  for(const partyId of uniqueOrganizations.keys()) {
    const path: string[] = [];
    const offsets = new Map<string, number>();
    let cursor: string | undefined = partyId;
    while(cursor && parentById.has(cursor)) {
      if(offsets.has(cursor)) {
        for(const member of path.slice(offsets.get(cursor))) {cycleMembers.add(member);}
        break;
      }
      offsets.set(cursor, path.length);
      path.push(cursor);
      cursor = parentById.get(cursor);
    }
  }
  for(const partyId of cycleMembers) {
    anomalies.push({ code: "cycle", partyId, relatedPartyId: parentById.get(partyId) });
    parentById.delete(partyId);
  }

  const nodesById = new Map<string, OrganizationNode>();
  for(const organization of uniqueOrganizations.values()) {
    nodesById.set(organization.partyId, { ...organization, children: [], path: [] });
  }
  for(const [childId, parentId] of parentById) {
    nodesById.get(parentId)?.children.push(nodesById.get(childId)!);
  }
  for(const node of nodesById.values()) {node.children.sort(byOrganizationName);}

  const roots = [...nodesById.values()]
    .filter((node) => !parentById.has(node.partyId))
    .sort(byOrganizationName);

  const assignPaths = (node: OrganizationNode, ancestors: string[]) => {
    node.path = [...ancestors, node.groupName || node.partyId];
    for(const child of node.children) {assignPaths(child, node.path);}
  };
  for(const root of roots) {assignPaths(root, []);}

  return { roots, nodesById, parentById, anomalies };
}

export function wouldCreateOrganizationCycle(
  childId: string,
  newParentId: string | undefined,
  parentById: ReadonlyMap<string, string>,
): boolean {
  if(!newParentId) {return false;}
  if(childId === newParentId) {return true;}
  const visited = new Set<string>();
  let cursor: string | undefined = newParentId;
  while(cursor && !visited.has(cursor)) {
    if(cursor === childId) {return true;}
    visited.add(cursor);
    cursor = parentById.get(cursor);
  }

  return false;
}

export function useOrganizations() {
  const organizationRead = useCachedList<Organization>(organizationCache);
  const relationshipRead = useCachedList<OrganizationRelationship>(organizationRelationshipCache);
  const forest = computed(() =>
    deriveOrganizationForest(organizationRead.records.value, relationshipRead.records.value));
  const organizations = computed(() =>
    [...organizationRead.records.value].sort(byOrganizationName));
  const hydrated = computed(() =>
    organizationRead.hydrated.value && relationshipRead.hydrated.value);

  return {
    organizations,
    relationships: relationshipRead.records,
    forest,
    hydrated,
  };
}

export const useOrganizationRecord = (partyId: string | undefined) =>
  useCachedRecord<Organization>(organizationCache, "partyId", partyId);

export function useOrganizationFacilities(partyId: string | undefined) {
  const { records, hydrated } = useCachedList<any>(facilityCache, {
    ...(partyId ? { scope: { field: "ownerPartyId", value: partyId } } : {}),
  });

  return { facilities: computed(() => records.value), hydrated };
}

const primaryOrganizationId = ref("");
let primaryOrganizationRequest: Promise<string> | null = null;
onSessionCleared(() => {
  primaryOrganizationId.value = "";
  primaryOrganizationRequest = null;
});

export function usePrimaryOrganization() {
  const load = (): Promise<string> => {
    if(primaryOrganizationId.value) {return Promise.resolve(primaryOrganizationId.value);}
    if(primaryOrganizationRequest) {return primaryOrganizationRequest;}
    primaryOrganizationRequest = (async () => {
      try {
        const response: any = await api({
          url: "admin/systemProperties",
          method: "get",
          params: {
            systemResourceId: "general",
            systemPropertyId: "ORGANIZATION_PARTY",
            pageSize: 2,
          },
        });
        if(commonUtil.hasError(response)) {throw response.data;}
        const rows = Array.isArray(response.data)
          ? response.data
          : response.data?.systemPropertyList ?? [];
        primaryOrganizationId.value = String(rows[0]?.systemPropertyValue ?? "");

        return primaryOrganizationId.value;
      } finally {
        primaryOrganizationRequest = null;
      }
    })();

    return primaryOrganizationRequest;
  };

  return { primaryOrganizationId, load };
}

function assertSuccessful(response: any, fallback: string): void {
  if(commonUtil.hasError(response)) {
    throw new Error(getResponseErrorMessage(response, fallback));
  }
}

export interface CreateOrganizationInput {
  partyId: string;
  groupName: string;
  externalId?: string;
  parentPartyId?: string;
}

const PARTIAL_CREATION_MESSAGES = {
  party: "The server already saved the party; review the organization before retrying.",
  partyAndName: "The server already saved the party and name; review the organization before retrying.",
  organization: "The server already saved the organization; review the organization before retrying.",
} as const;

/** Suggest a valid, stable internal id without overwriting a later manual edit in the form. */
export function suggestOrganizationId(groupName: string): string {
  return groupName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 20)
    .replace(/_+$/g, "");
}

/**
 * Uses the existing entity APIs. This is intentionally stage-aware because the calls are not
 * transactional: if a later stage fails, the error tells the operator what was already committed.
 */
export async function createOrganization(input: CreateOrganizationInput): Promise<string> {
  const partyId = input.partyId.trim().toUpperCase();
  const groupName = input.groupName.trim();
  if(!partyId || !groupName) {throw new Error(translate("Organization ID and name are required."));}
  if(partyId.length > 20) {throw new Error(translate("Organization ID must be 20 characters or fewer."));}
  if(!/^[A-Z0-9_-]+$/.test(partyId)) {
    throw new Error(translate("Organization ID may contain only letters, numbers, underscores, and hyphens."));
  }

  let completed: keyof typeof PARTIAL_CREATION_MESSAGES | undefined;
  try {
    const partyResponse: any = await api({
      url: "admin/organizations",
      method: "post",
      data: {
        partyId,
        partyTypeId: "PARTY_GROUP",
        ...(input.externalId?.trim() ? { externalId: input.externalId.trim() } : {}),
      },
    });
    assertSuccessful(partyResponse, translate("Failed to create the organization party."));
    completed = "party";

    const groupResponse: any = await api({
      url: `admin/organizations/${encodeURIComponent(partyId)}`,
      method: "post",
      data: { partyId, groupName },
    });
    assertSuccessful(groupResponse, translate("Failed to save the organization name."));
    completed = "partyAndName";

    const roleResponse: any = await api({
      url: `admin/organizations/${encodeURIComponent(partyId)}/roles`,
      method: "post",
      data: { partyId, roleTypeId: INTERNAL_ORGANIZATION_ROLE },
    });
    assertSuccessful(roleResponse, translate("Failed to assign the internal organization role."));
    completed = "organization";
    await refreshAfterMutation("organization", { partyId });

    if(input.parentPartyId) {
      const relationshipResponse: any = await api({
        url: "oms/partyRelationships",
        method: "post",
        data: {
          partyIdFrom: input.parentPartyId,
          partyIdTo: partyId,
          roleTypeIdFrom: INTERNAL_ORGANIZATION_ROLE,
          roleTypeIdTo: INTERNAL_ORGANIZATION_ROLE,
          partyRelationshipTypeId: ORGANIZATION_RELATIONSHIP_TYPE,
          fromDate: Date.now(),
        },
      });
      assertSuccessful(relationshipResponse, translate("Failed to save the parent organization."));
      await refreshAfterMutation("organizationRelationship", { partyIdTo: partyId });
    }

    return partyId;
  } catch (error) {
    if(completed) {
      await resyncDomain("organization");
      await resyncDomain("organizationRelationship");
      const failureMessage = getResponseErrorMessage(error, translate("Organization creation failed."));
      const partialMessage = translate(PARTIAL_CREATION_MESSAGES[completed]);
      throw new Error(
        `${failureMessage} ${partialMessage}`,
        { cause: error },
      );
    }
    throw error;
  }
}

export async function renameOrganization(partyId: string, groupName: string): Promise<void> {
  const response: any = await api({
    url: `admin/organizations/${encodeURIComponent(partyId)}`,
    method: "post",
    data: { partyId, groupName: groupName.trim() },
  });
  assertSuccessful(response, translate("Failed to rename the organization."));
  await refreshAfterMutation("organization", { partyId });
}

export async function updateOrganizationExternalId(partyId: string, externalId: string): Promise<void> {
  const response: any = await api({
    url: `oms/parties/${encodeURIComponent(partyId)}`,
    method: "put",
    data: { externalId: externalId.trim() },
  });
  assertSuccessful(response, translate("Failed to update subsidiary ID."));
  await refreshAfterMutation("organization", { partyId });
}

export async function reparentOrganization(
  childId: string,
  newParentId: string | undefined,
  relationships: OrganizationRelationship[],
  parentById: ReadonlyMap<string, string>,
): Promise<void> {
  if(wouldCreateOrganizationCycle(childId, newParentId, parentById)) {
    throw new Error(translate("The selected parent would create an organization cycle."));
  }
  const activeParents = relationships.filter((relationship) =>
    relationship.partyIdTo === childId && isOrganizationRelationshipActive(relationship));
  if(activeParents.length > 1) {
    throw new Error(translate("This organization has multiple active parents. Resolve the data conflict before moving it."));
  }
  const current = activeParents[0];
  if(current?.partyIdFrom === newParentId || (!current && !newParentId)) {return;}

  if(current) {
    const closeResponse: any = await api({
      url: "oms/partyRelationships",
      method: "put",
      data: { ...current, thruDate: Date.now() },
    });
    assertSuccessful(closeResponse, translate("Failed to close the existing parent relationship."));
    await refreshAfterMutation("organizationRelationship", { partyIdTo: childId });
  }

  if(!newParentId) {return;}
  try {
    const createResponse: any = await api({
      url: "oms/partyRelationships",
      method: "post",
      data: {
        partyIdFrom: newParentId,
        partyIdTo: childId,
        roleTypeIdFrom: INTERNAL_ORGANIZATION_ROLE,
        roleTypeIdTo: INTERNAL_ORGANIZATION_ROLE,
        partyRelationshipTypeId: ORGANIZATION_RELATIONSHIP_TYPE,
        fromDate: Date.now(),
      },
    });
    assertSuccessful(createResponse, translate("Failed to create the new parent relationship."));
    await refreshAfterMutation("organizationRelationship", { partyIdTo: childId });
  } catch (error) {
    await resyncDomain("organizationRelationship");
    if(current) {
      const rootMessage = translate("The old relationship was already closed, so the organization is currently a root.");
      throw new Error(
        `${getResponseErrorMessage(error, translate("Failed to create the new parent relationship."))} ${rootMessage}`,
        { cause: error },
      );
    }
    throw error;
  }
}
