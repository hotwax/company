import { companyDb } from "@/db/companyDb";
import { hasSyncedThisLogin, markSyncedThisLogin } from "@common/db";
import { defineSyncDomain } from "@common/db/sync/defineSyncDomain";
import type { SyncContext } from "@common/db/types";
import { pageAll, workerGet } from "@common/core/workerRemoteApi";

const organizationEntity = companyDb.entity("organizations");

const INTERNAL_ORG_ROLE = "INTERNAL_ORGANIZATIO";
const PARTY_GROUP = "PARTY_GROUP";

function unwrapPartyDetail(response: any): Record<string, unknown> | undefined {
  if (!response || typeof response !== "object") { return undefined; }

  const detail = Array.isArray(response)
    ? response[0]
    : (response.partyNameDetail ?? response.partyDetail ?? response.party ?? response);

  return Array.isArray(detail) ? detail[0] : detail;
}

/** Merge the PartyRole list row with the PartyNameDetail record used by the UI. */
export function mergeInternalOrganization(
  role: Record<string, unknown>,
  detailResponse: any,
): Record<string, unknown> | undefined {
  const detail = unwrapPartyDetail(detailResponse);
  if (!detail) { return undefined; }

  return { ...role, ...detail, roleTypeId: INTERNAL_ORG_ROLE };
}

function fetchRoleRows(ctx: SyncContext, partyId?: string): Promise<Record<string, unknown>[]> {
  return pageAll({
    ctx,
    url: "admin/organizations",
    collectionKey: null,
    params: {
      roleTypeId: INTERNAL_ORG_ROLE,
      ...(partyId ? { partyId } : {}),
    },
    keyOf: (row) => row?.partyId ? String(row.partyId) : undefined,
    label: partyId ? `organization:${partyId}` : "organization",
  });
}

async function fetchOrganization(
  ctx: SyncContext,
  role: Record<string, unknown>,
): Promise<Record<string, unknown> | undefined> {
  const partyId = String(role.partyId ?? "");
  if(!partyId) {return undefined;}
  const detail = await workerGet(ctx, `oms/parties/${encodeURIComponent(partyId)}`, {});

  return mergeInternalOrganization(role, detail);
}

/** Bound detail fan-out so a large tenant cannot burst one request per organization at once. */
async function fetchOrganizations(
  ctx: SyncContext,
  roles: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  const organizations: Record<string, unknown>[] = [];

  for(let offset = 0; offset < roles.length; offset += 8) {
    const batch = await Promise.all(roles.slice(offset, offset + 8).map((role) => fetchOrganization(ctx, role)),);
    organizations.push(...batch.filter((row): row is Record<string, unknown> => Boolean(row)),);
  }

  return organizations;
}

export const organizationDomain = defineSyncDomain({
  name: "organization",
  table: "organizations",
  label: "Organizations",
  syncClass: "B",

  async sync(ctx, _args, options) {
    if(!options?.force && (await hasSyncedThisLogin(companyDb.raw(), "organization"))) {return 0;}

    const roles = await fetchRoleRows(ctx);
    const organizations = await fetchOrganizations(ctx, roles);

    const existing = await (companyDb.raw() as any).organizations.count();
    if(!options?.force && organizations.length === 0 && existing > 0) {
      console.warn("[sync] organization: server returned no usable internal organizations while the cache " +
        "is populated; refusing to prune. Use a manual resync to clear it deliberately.",);

      return 0;
    }

    const { written } = await organizationEntity.snapshotReplace(organizations);
    if (roles.length === 0 || written > 0) { await markSyncedThisLogin(companyDb.raw(), "organization"); }

    return written;
  },

  async refetchOne(ctx, pk) {
    const partyId = String(pk.partyId ?? "");
    if(!partyId) {return 0;}

    const roles = await fetchRoleRows(ctx, partyId);
    const role = roles.find((row) =>
      String(row.partyId) === partyId && row.roleTypeId === INTERNAL_ORG_ROLE);
    if(!role) {
      await organizationEntity.remove(partyId);

      return 0;
    }

    const organization = await fetchOrganization(ctx, role);
    if(!organization) {
      await organizationEntity.remove(partyId);

      return 0;
    }

    return organizationEntity.upsertMany([organization]);
  },
});

export { INTERNAL_ORG_ROLE, PARTY_GROUP };

