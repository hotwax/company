import { computed, ref } from "vue";
import { api, client, commonUtil, logger } from "@common";
import { useUserStore } from "@/store/user";
import { resyncDomain } from "@/services/appCacheBootstrap";
import { permissionCache, userGroupCache } from "@/utils/cacheEntities";
import { byDescription, useCachedList, useCachedRecord } from "./useCachedList";

/**
 * Security master entity — user groups, the permission catalog, and what hangs off a group
 * (permission grants, artifact authorizations). Absorbs the former `src/store/authorization.ts`:
 *   - catalog reads (user groups, permissions, authz/user-group-type enums) come from the cache
 *     (`userGroup`/`permission`/`enum` snapshot domains in workers/domains/referenceDomains.ts);
 *   - per-group associations (UserGroupPermission, ArtifactAuthz) have NO cached table, so they
 *     stay live reads, fetched on demand for the ONE group being viewed;
 *   - mutations are plain exported functions; the only one that touches a cached table
 *     (`updateUserGroup`) writes through to the cache.
 */

export function useUserGroups() {
  const { records, hydrated } = useCachedList<any>(userGroupCache);
  const userGroups = computed(() => [...records.value].sort(byDescription));

  /** Client-side search over the complete cached set — no server round-trip. */
  const search = (term: string) => {
    const needle = term.trim().toLowerCase();
    if (!needle) return userGroups.value;
    return userGroups.value.filter((group: any) =>
      `${group.userGroupId ?? ""} ${group.description ?? ""}`.toLowerCase().includes(needle));
  };

  return { userGroups, search, records, hydrated };
}

export const useUserGroupRecord = (userGroupId: string | undefined) =>
  useCachedRecord(userGroupCache, "userGroupId", userGroupId);

/** The master permission catalog (moqui.security.UserPermission). */
export function usePermissions() {
  const { records, hydrated } = useCachedList<any>(permissionCache);
  return { permissions: computed(() => [...records.value].sort(byDescription)), records, hydrated };
}

/**
 * Session-scoped auth reads.
 *
 * The underlying state (permissions, profile) genuinely belongs in the user store — it is set at
 * login and read by the router guard — so this is a thin accessor rather than a reimplementation.
 * Its purpose is to keep views and components from importing the store directly.
 */
export function useAuth() {
  const userStore = useUserStore();
  const hasPermission = (permissionId: string): boolean => userStore.hasPermission(permissionId);
  const userProfile = computed<any>(() => userStore.getUserProfile);
  return { hasPermission, userProfile };
}

/** Account actions a non-user screen occasionally needs (e.g. the facility login popover). */
export function useUserAccountActions() {
  const userStore = useUserStore();
  const sendResetPasswordEmail = (userLoginId: string) => userStore.sendResetPasswordEmail({ userLoginId });
  return { sendResetPasswordEmail };
}

// --- live security reads — associations with no cached table -----------------------------------

/**
 * The artifact-group catalog (`admin/artifactGroups`). Not a registered snapshot domain, so it is a
 * live read — but loaded ONCE per page session, mirroring the old store's `if (length) return`
 * guard. Judgment call on scope: the old Pinia state was `$reset` at logout while this module-level
 * promise survives a re-login in the same tab; artifact groups are tenant-level framework config
 * (moqui.security.ArtifactGroup), not user-scoped, and the old fetch already passed `cache: true`
 * (an HTTP-level cache that also outlives a store reset), so nothing user-specific can leak.
 */
let artifactGroupsPromise: Promise<any[]> | null = null;

async function fetchArtifactGroupsOnce(): Promise<any[]> {
  const resp: any = await api({
    url: "admin/artifactGroups",
    method: "get",
    params: { pageSize: 1000 },
    cache: true,
  });
  if (commonUtil.hasError(resp)) throw resp.data;
  return resp.data ?? [];
}

export function useArtifactGroups() {
  const artifactGroups = ref<any[]>([]);
  const load = async () => {
    try {
      if (!artifactGroupsPromise) artifactGroupsPromise = fetchArtifactGroupsOnce();
      artifactGroups.value = await artifactGroupsPromise;
    } catch (error) {
      // Stay retryable: caching the rejection would pin every later mount to the first failure.
      // The old store behaved the same way — an error left state empty, so the next mount refetched.
      artifactGroupsPromise = null;
      logger.error("Failed to fetch artifact groups.", error);
      artifactGroups.value = [];
    }
  };
  return { artifactGroups, load };
}

/**
 * The ACTIVE permission grants of one user group, keyed by `userPermissionId`.
 *
 * UserGroupPermission is date-effective and has no cached table (the `permission` domain is the
 * catalog, not the association), so this is a live per-group read: fetched on demand for the group
 * being viewed, re-fetched by the caller after a grant/revoke. Expired rows (thruDate in the past)
 * are dropped because the API returns full history — soft-expired revokes included.
 */
export function useUserGroupPermissions(userGroupId: string) {
  const activePermissions = ref<Record<string, any>>({});
  const load = async () => {
    const next: Record<string, any> = {};
    try {
      const resp: any = await api({
        url: `admin/userGroups/${encodeURIComponent(userGroupId)}/permissions`,
        method: "get",
        params: { pageSize: 1000 },
      });
      if (commonUtil.hasError(resp)) throw resp.data;
      const now = Date.now();
      (resp.data || [])
        .filter((groupPermission: any) => !groupPermission.thruDate || groupPermission.thruDate > now)
        .forEach((groupPermission: any) => {
          next[groupPermission.userPermissionId] = groupPermission;
        });
    } catch (error) {
      logger.error("Failed to fetch user group permissions.", error);
    }
    activePermissions.value = next;
  };
  return { activePermissions, load };
}

/** Artifact authorizations of one user group — live per-group read, same contract as above. */
export function useArtifactAuthorizations(userGroupId: string) {
  const authorizations = ref<any[]>([]);
  const load = async () => {
    let next: any[] = [];
    try {
      const resp: any = await api({
        url: `admin/userGroups/${encodeURIComponent(userGroupId)}/artifactAuthorizations`,
        method: "get",
        params: { pageSize: 1000 },
      });
      if (commonUtil.hasError(resp)) throw resp.data;
      next = resp.data ?? [];
    } catch (error) {
      logger.error("Failed to fetch artifact authorizations.", error);
    }
    authorizations.value = next;
  };
  return { authorizations, load };
}

// --- mutations ----------------------------------------------------------------------------------
// Plain exported functions (the useShopify convention). All but `updateUserGroup` mutate rows that
// are NOT in any cached table (UserGroupPermission, ArtifactAuthz), so there is nothing to write
// through — the caller re-runs its live read instead. Each returns the raw response; callers keep
// their existing `commonUtil.hasError` handling.

export function addUserGroupPermission(
  payload: { userGroupId: string; userPermissionId: string; fromDate: number },
): Promise<any> {
  return api({
    url: `admin/userGroups/${encodeURIComponent(payload.userGroupId)}/permissions`,
    method: "post",
    data: { userPermissionId: payload.userPermissionId, fromDate: payload.fromDate },
  });
}

export function removeUserGroupPermission(
  payload: { userGroupId: string; userPermissionId: string; fromDate: number; thruDate: number },
): Promise<any> {
  // Soft-expire: UserGroupPermission history is preserved, so this updates thruDate on the existing
  // record rather than deleting it.
  return api({
    url: `admin/userGroups/${encodeURIComponent(payload.userGroupId)}/permissions`,
    method: "put",
    data: { userPermissionId: payload.userPermissionId, fromDate: String(payload.fromDate), thruDate: String(payload.thruDate) },
  });
}

export function createArtifactAuthz(
  payload: { userGroupId: string; artifactGroupId: string; authzTypeEnumId: string; authzActionEnumId: string; authzServiceName?: string },
): Promise<any> {
  return api({
    url: `admin/userGroups/${encodeURIComponent(payload.userGroupId)}/artifactAuthorizations`,
    method: "post",
    data: payload,
  });
}

export function updateArtifactAuthz(
  payload: { userGroupId: string; artifactAuthzId: string; artifactGroupId: string; authzTypeEnumId: string; authzActionEnumId: string; authzServiceName?: string },
): Promise<any> {
  return api({
    url: `admin/userGroups/${encodeURIComponent(payload.userGroupId)}/artifactAuthorizations/${encodeURIComponent(payload.artifactAuthzId)}`,
    method: "put",
    data: payload,
  });
}

export function deleteArtifactAuthz(payload: { userGroupId: string; artifactAuthzId: string }): Promise<any> {
  return api({
    url: `admin/userGroups/${encodeURIComponent(payload.userGroupId)}/artifactAuthorizations/${encodeURIComponent(payload.artifactAuthzId)}`,
    method: "delete",
  });
}

/**
 * Update a user group and write the change through to the cached `userGroups` table.
 *
 * Write-through is `resyncDomain`, NOT `refreshAfterMutation`: the `userGroup` domain is registered
 * as a plain lookup (referenceDomains.ts:155) with neither `byPk` nor `refetchScope`, and for such
 * a domain `refetchOne` silently returns 0 (snapshotDomain.ts:256) — the row would keep its old
 * description until the next login sync. Re-snapshotting the whole lookup table is one small
 * request and actually lands the update; it also supersedes the old `updateUserGroupInState`
 * hand-patch, because cached readers re-emit via liveQuery.
 */
export async function updateUserGroup(payload: { userGroupId: string; description: string }): Promise<any> {
  const resp: any = await api({
    url: `admin/userGroups/${encodeURIComponent(payload.userGroupId)}`,
    method: "put",
    data: payload,
  });
  if (!commonUtil.hasError(resp)) await resyncDomain("userGroup");
  return resp;
}

export function usePasswordReset() {
  async function resetPassword(userId: string, maarg: string, payload: Record<string, any>): Promise<any> {
    const getBaseURL = () => {
      if (maarg.startsWith("http")) {
        const cleanMaarg = maarg.endsWith("/") ? maarg.slice(0, -1) : maarg;
        return cleanMaarg.includes("/rest/s1") ? cleanMaarg : `${cleanMaarg}/rest/s1/`;
      }
      return `https://${maarg}.hotwax.io/rest/s1/`;
    };

    // The emailed link only carries an API host reference (maarg), never a session -
    // requests here must not depend on cookies/auth state, so we build an explicit
    // baseURL and use the unauthenticated `client` instead of the app-wide `api()` helper.

    return client({
      baseURL: getBaseURL(),
      url: `admin/users/${userId}/changePassword`,
      method: "post",
      data: payload
    });
  }

  return { resetPassword };
}
