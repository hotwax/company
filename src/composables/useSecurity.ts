import { computed, onScopeDispose, ref, watch } from "vue";
import { api, commonUtil, logger } from "@common";
import { useUserStore } from "@/store/user";
import { resyncDomain } from "@/services/appCacheBootstrap";
import { permissionCache, userGroupCache } from "@/utils/cacheEntities";
import { byDescription, useCachedList, useCachedRecord } from "./useCachedList";
import { onSessionCleared } from "./sessionScope";

/**
 * Security master entity — user groups, the permission catalog, and what hangs off a group
 * (permission grants, artifact authorizations). Absorbs the former `src/store/authorization.ts`:
 *   - catalog reads (user groups, permissions, authz/user-group-type enums) come from the cache
 *     (`userGroup`/`permission`/`enum` snapshot domains in workers/domains/referenceDomains.ts);
 *   - per-group associations (UserGroupPermission, ArtifactAuthz) have NO cached table, so they
 *     stay live reads, fetched on demand for the ONE group being viewed;
 *   - mutations are plain exported functions; the only one that touches a cached table
 *     (`updateUserGroup`) writes through to the cache.
 *   - user JWT issuance is invocation-scoped through `useUserToken`; credentials are never cached.
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

interface UserCreationDraft {
  firstName: string;
  lastName: string;
}

// A one-time handoff between routed pages. Never persisted or placed in the URL.
let pendingUserCreationDraft: UserCreationDraft | undefined;
const clearUserCreationDraft = () => { pendingUserCreationDraft = undefined; };
onSessionCleared(clearUserCreationDraft);

/** Shared user-account actions, including the search-to-creation handoff. */
export function useUserAccountActions() {
  const userStore = useUserStore();
  const sendResetPasswordEmail = (userLoginId: string) => userStore.sendResetPasswordEmail({ userLoginId });
  const setUserCreationDraftFromSearch = (search: string) => {
    const name = search.trim();
    const [firstName = "", ...lastName] = name ? name.split(/\s+/) : [];
    pendingUserCreationDraft = { firstName, lastName: lastName.join(" ") };
  };
  const consumeUserCreationDraft = (): UserCreationDraft => {
    const draft = pendingUserCreationDraft ?? { firstName: "", lastName: "" };
    clearUserCreationDraft();
    return draft;
  };

  return { sendResetPasswordEmail, setUserCreationDraftFromSearch, consumeUserCreationDraft, clearUserCreationDraft };
}

/** Preserve the authenticated REST context root; reject embedded credentials, queries, and fragments. */
function userTokenBaseUrl(value: string): string | undefined {
  try {
    const url = new URL(value.trim());
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) return;
    if (url.username || url.password || url.search || url.hash) return;
    const path = url.pathname.replace(/\/+$/, "");
    if (!path.endsWith("/rest/s1")) return;
    url.pathname = `${path}/`;
    return url.href;
  } catch {
    return;
  }
}

/**
 * Issue a JWT for the signed-in user on the backend displayed by the caller.
 * Purpose and expiry are supplied by the consuming screen. Credentials stay local to this
 * invocation, never enter the cache/store/logs, and must be cleared when a cached Ionic view leaves.
 */
export function useUserToken(expectedBackend: () => string) {
  const { userProfile } = useAuth();
  const username = computed(() => String(userProfile.value?.username || ""));
  const token = ref("");
  const expirationTime = ref<number>();
  const pending = ref(false);
  const error = ref("");
  let requestId = 0;

  const clear = () => {
    requestId++;
    token.value = "";
    expirationTime.value = undefined;
    error.value = "";
  };

  // Invalidate pending responses as well as displayed credentials when the session changes.
  watch([username, expectedBackend, () => commonUtil.getMaargURL()], clear, { flush: "sync" });
  const unregister = onSessionCleared(clear);
  onScopeDispose(() => { clear(); unregister(); });

  const unconfirmed = "Token generation could not be confirmed. Open JWT token settings in OMS for help.";
  function failure(status?: number) {
    // Older routes can interpret jwtToken as a partyId and return 405.
    if (status === 404 || status === 405) return "This instance needs a backend update to generate tokens from Company. Use JWT token settings in OMS for now.";
    if (status === 401) return "Your session has expired. Sign in again before generating a token.";
    if (status === 403) return "OMS did not authorize token generation through Company. You may still be able to generate a token in JWT token settings in OMS.";
    return unconfirmed;
  }

  async function generate({ purpose, expireDays }: { purpose: string; expireDays: number }) {
    if (pending.value || token.value) return;
    clear();
    const baseURL = userTokenBaseUrl(commonUtil.getMaargURL());
    if (!username.value || !baseURL || baseURL !== userTokenBaseUrl(expectedBackend())) {
      error.value = "Generate a token for your signed-in OMS instance. Sign in to another instance before generating its token.";
      return;
    }
    if (!purpose.trim() || !Number.isInteger(expireDays) || expireDays <= 0) {
      error.value = "Enter a token purpose and a positive whole number of days.";
      return;
    }

    const thisRequest = requestId;
    const owner = username.value;
    pending.value = true;
    try {
      const response = await api({
        baseURL,
        url: "admin/user/jwtToken",
        method: "post",
        data: { username: owner, purpose: purpose.trim(), expireDays },
      });
      if (thisRequest !== requestId) return;
      if (username.value !== owner || userTokenBaseUrl(commonUtil.getMaargURL()) !== baseURL) {
        clear();
        return;
      }
      const result = response.data;
      if (result?.errorCode) {
        error.value = failure(Number(result.errorCode));
      } else if (typeof result?.token !== "string" || !result.token.trim() || !Number.isFinite(result.expirationTime) || result.expirationTime <= Date.now()) {
        error.value = unconfirmed;
      } else {
        token.value = result.token;
        expirationTime.value = result.expirationTime;
      }
    } catch (cause: unknown) {
      if (thisRequest !== requestId) return;
      // Never log/throw an Axios response: it may contain a token or authorization header.
      const response = (cause as { response?: { status?: number; data?: { errorCode?: number } } })?.response;
      error.value = failure(Number(response?.data?.errorCode ?? response?.status));
    } finally {
      pending.value = false;
    }
  }

  return { username, token, expirationTime, pending, error, generate, clear };
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
