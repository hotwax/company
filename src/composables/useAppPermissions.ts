import { api, commonUtil } from "@common";
import { type Ref, computed, reactive, watch } from "vue";
import type { AppPermissionDefinition } from "@/config/appPermissions";
import { toEpochMillis } from "@/utils/appPermissionTime";
import { usePermissions, useUserGroups } from "./useSecurity";

/**
 * App-permission assignments — the read/write seam for `AppPermissions.vue` (replaces
 * `store/appPermissions`).
 *
 * What moved where:
 *   - the permission catalog and the security-group list are CACHED tables (`permissions`,
 *     `userGroups` — see the `permission`/`userGroup` domains in workers/domains/referenceDomains.ts),
 *     so they are reactive computeds over `usePermissions()`/`useUserGroups()` instead of fetches;
 *   - per-group UserGroupPermission records and per-group user lists have NO cached table, so they
 *     stay live fetches held in module state (shared across callers, like the store singleton was).
 *
 * The one deliberate behavior change is the `fetchGroupUsers` N+1 documented in
 * docs/cache-sync-remaining-work.md §2: the old view fetched `admin/groups/{id}/users` for EVERY
 * active group the moment the users modal opened (one request per group). The endpoint is genuinely
 * per-group and group membership is not cached, so the fix is laziness, not derivation:
 * `loadGroupUsers` is fetched per group on demand (when that group is expanded) and memoized, so the
 * request count scales with what the user actually looks at, never with the group count.
 */

export type AppPermissionSecurityGroup = {
  groupId: string;
  groupName?: string;
  description?: string;
  fromDate?: number | string;
  thruDate?: number | string;
};

const isActive = (record: { fromDate?: number | string; thruDate?: number | string }) => {
  const now = Date.now();
  const fromDate = toEpochMillis(record.fromDate) ?? 0;
  const thruDate = toEpochMillis(record.thruDate) ?? Number.POSITIVE_INFINITY;

  return fromDate <= now && thruDate > now;
};

/** Live (non-cached) assignment state — module-scoped so every caller shares one copy. */
const state = reactive<{
  permissionRecordsByGroup: Record<string, any[]>;
  usersByGroup: Record<string, any[]>;
}>({ permissionRecordsByGroup: {}, usersByGroup: {} });

/** Collapses concurrent expansions of the same group into one request. */
const inflightUsersByGroup: Record<string, Promise<any[]>> = {};

/**
 * The UserGroupPermission records of ONE group (`admin/userGroups/{id}/permissions`) — the only
 * read shape the backend offers for assignments, so it stays a live fetch. Memoized until `force`.
 */
export async function loadGroupPermissionRecords(groupId: string, force = false): Promise<void> {
  if(!force && state.permissionRecordsByGroup[groupId]) {return;}

  const resp = await api({
    url: `admin/userGroups/${encodeURIComponent(groupId)}/permissions`,
    method: "get",
    params: { pageSize: 1000 },
  }) as any;

  if(commonUtil.hasError(resp)) {throw resp.data;}
  state.permissionRecordsByGroup[groupId] = resp.data || [];
}

/**
 * The users of ONE group, fetched on demand (see the N+1 note in the module docblock) and memoized
 * for the session. Never call this in a loop over all groups — that is the exact defect this
 * migration removes (old `AppPermissions.vue` did `Promise.all(groups.map(...))` on modal open).
 */
export async function loadGroupUsers(groupId: string, force = false): Promise<any[]> {
  if(!force && state.usersByGroup[groupId]) {return state.usersByGroup[groupId];}
  const pending = inflightUsersByGroup[groupId];
  if(!force && pending) {return pending;}

  const request = (async () => {
    const resp = await api({
      url: `admin/groups/${encodeURIComponent(groupId)}/users`,
      method: "get",
      params: { pageSize: 1000 },
    }) as any;

    if(commonUtil.hasError(resp)) {throw resp.data;}
    const users = Array.isArray(resp.data) ? resp.data : (resp.data?.users || resp.data?.docs || []);
    state.usersByGroup[groupId] = users;

    return users;
  })().finally(() => { delete inflightUsersByGroup[groupId]; });

  inflightUsersByGroup[groupId] = request;

  return request;
}

/**
 * Reconcile a permission's group assignments: POST a new UserGroupPermission for each added group,
 * and soft-expire (PUT `thruDate`) the record of each removed group — history is preserved, exactly
 * the two requests the retired `store/authorization` helpers issued.
 *
 * No `refreshAfterMutation` here on purpose: these writes touch UserGroupPermission rows, which
 * live in NO cached table — the `permission` and `userGroup` domains snapshot the catalogs
 * (`admin/userPermissions`, `admin/userGroups`), and neither list changes when an assignment does.
 * The read model for assignments is this module's live state, so the write-through refresh is the
 * forced re-read of each changed group's records below.
 */
export async function savePermissionGroups(
  permissionId: string,
  originalGroups: AppPermissionSecurityGroup[],
  selectedGroups: AppPermissionSecurityGroup[],
): Promise<{ failed: number; succeeded: number }> {
  const originalIds = originalGroups.map((group) => group.groupId);
  const selectedIds = selectedGroups.map((group) => group.groupId);
  const groupIdsToCreate = selectedIds.filter((groupId) => !originalIds.includes(groupId));
  const groupsToRemove = originalGroups.filter((group) => !selectedIds.includes(group.groupId));
  const now = Date.now();
  const operations = [
    ...groupIdsToCreate.map((groupId) => ({
      groupId,
      execute: () => api({
        url: `admin/userGroups/${encodeURIComponent(groupId)}/permissions`,
        method: "post",
        data: { userPermissionId: permissionId, fromDate: now },
      }),
    })),
    ...groupsToRemove.map((group) => {
      const fromDate = toEpochMillis(group.fromDate);
      if(fromDate === undefined) {throw new Error(`Invalid permission assignment start date for ${group.groupId}`);}

      return {
        groupId: group.groupId,
        execute: () => api({
          url: `admin/userGroups/${encodeURIComponent(group.groupId)}/permissions`,
          method: "put",
          data: { userPermissionId: permissionId, fromDate, thruDate: now },
        }),
      };
    }),
  ];

  const results = await Promise.allSettled(operations.map((operation) => operation.execute()));
  const failedGroupIds = results.flatMap((result, index) => {
    if(result.status === "rejected" || commonUtil.hasError(result.value)) {
      return [operations[index].groupId];
    }

    return [];
  });

  const changedGroupIds = operations.map((operation) => operation.groupId);
  await Promise.allSettled(changedGroupIds.map((groupId) => loadGroupPermissionRecords(groupId, true)));

  return {
    failed: failedGroupIds.length,
    succeeded: operations.length - failedGroupIds.length,
  };
}

/** Resolves once a cached table can be trusted (see the `hydrated` note in useCachedList.ts). */
const untilHydrated = (hydrated: Ref<boolean>) => new Promise<void>((resolve) => {
  if(hydrated.value) {
    resolve();

    return;
  }
  const stop = watch(hydrated, (ready) => {
    if(!ready) {return;}
    stop();
    resolve();
  });
});

export function useAppPermissions() {
  const { userGroups, hydrated: userGroupsHydrated } = useUserGroups();
  const { records: permissionRecords, hydrated: permissionsHydrated } = usePermissions();

  /** The cached catalog in the page's shape (`permissionId` ← `userPermissionId`). */
  const permissions = computed<AppPermissionDefinition[]>(() =>
    permissionRecords.value.map((permission: any) => ({
      permissionId: permission.userPermissionId,
      description: permission.description || permission.userPermissionId,
    })));

  const permissionsById = computed(() => new Map(permissions.value.map((permission) => [permission.permissionId, permission])));
  const getPermissionById = (permissionId: string): AppPermissionDefinition | undefined =>
    permissionsById.value.get(permissionId);

  /**
   * The cached group table narrowed to user-access groups. The retired store asked the server for
   * `groupTypeEnumId=UgtUserAccess` ordered by description; the cached table holds every group with
   * `groupTypeEnumId` projected, and `useUserGroups` already sorts by description.
   */
  const securityGroups = computed<AppPermissionSecurityGroup[]>(() =>
    userGroups.value
      .filter((group: any) => group.groupTypeEnumId === "UgtUserAccess")
      .map((group: any) => ({
        groupId: group.userGroupId,
        groupName: group.description || group.userGroupId,
        description: group.description,
      })));

  const activeGroupsByPermission = (permissionId: string): AppPermissionSecurityGroup[] => {
    return securityGroups.value.flatMap((group) => {
      const record = (state.permissionRecordsByGroup[group.groupId] || [])
        .find((permission: any) => permission.userPermissionId === permissionId && isActive(permission));

      return record ? [{ ...group, fromDate: record.fromDate, thruDate: record.thruDate }] : [];
    });
  };

  const permissionHistory = (permissionId: string): AppPermissionSecurityGroup[] => {
    return securityGroups.value.flatMap((group) => {
      return (state.permissionRecordsByGroup[group.groupId] || [])
        .filter((permission: any) => permission.userPermissionId === permissionId)
        .map((permission: any) => ({ ...group, fromDate: permission.fromDate, thruDate: permission.thruDate }));
    }).sort((first, second) => {
      const firstDate = toEpochMillis(first.thruDate) ?? Number.POSITIVE_INFINITY;
      const secondDate = toEpochMillis(second.thruDate) ?? Number.POSITIVE_INFINITY;

      return secondDate - firstDate;
    });
  };

  /**
   * Load everything the page renders from: the two catalogs arrive via the cache (awaited to
   * hydration so a cold cache doesn't fan out over zero groups), then each group's assignment
   * records are fetched live — memoized, so a revisit re-fetches nothing.
   */
  const loadAssignments = async (): Promise<void> => {
    await Promise.all([untilHydrated(userGroupsHydrated), untilHydrated(permissionsHydrated)]);
    await Promise.all(securityGroups.value.map((group) => loadGroupPermissionRecords(group.groupId)));
  };

  /** The memoized users of a group — `undefined` until `loadGroupUsers(groupId)` has resolved. */
  const usersForGroup = (groupId: string): any[] | undefined => state.usersByGroup[groupId];

  return {
    permissions,
    securityGroups,
    getPermissionById,
    activeGroupsByPermission,
    permissionHistory,
    loadAssignments,
    savePermissionGroups,
    loadGroupUsers,
    usersForGroup,
  };
}
