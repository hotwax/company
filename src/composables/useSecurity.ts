import { computed } from "vue";
import { useUserStore } from "@/store/user";
import { permissionCache, userGroupCache } from "@/utils/cacheEntities";
import { byDescription, useCachedList, useCachedRecord } from "./useCachedList";

/** Security master entity — user groups and the permission catalog. */

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
