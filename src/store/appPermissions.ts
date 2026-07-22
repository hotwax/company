import { api, commonUtil, logger } from "@common"
import { defineStore } from "pinia"
import { useAuthorizationStore } from "@/store/authorization"
import { toEpochMillis } from "@/utils/appPermissionTime"

export type AppPermissionSecurityGroup = {
  groupId: string;
  groupName?: string;
  description?: string;
  fromDate?: number | string;
  thruDate?: number | string;
};

const isActive = (record: { fromDate?: number | string; thruDate?: number | string }) => {
  const now = Date.now()
  const fromDate = toEpochMillis(record.fromDate) ?? 0
  const thruDate = toEpochMillis(record.thruDate) ?? Number.POSITIVE_INFINITY

  return fromDate <= now && thruDate > now
}

export const useAppPermissionsStore = defineStore("appPermissions", {
  state: () => ({
    securityGroups: [] as AppPermissionSecurityGroup[],
    permissionRecordsByGroup: {} as Record<string, any[]>,
    usersByGroup: {} as Record<string, any[]>,
    loadingGroups: false
  }),

  getters: {
    getActiveGroupsByPermission: (state) => (permissionId: string): AppPermissionSecurityGroup[] => {
      return state.securityGroups.flatMap((group) => {
        const record = (state.permissionRecordsByGroup[group.groupId] || [])
          .find((permission: any) => permission.userPermissionId === permissionId && isActive(permission))

        return record ? [{ ...group, fromDate: record.fromDate, thruDate: record.thruDate }] : []
      })
    },

    getPermissionHistory: (state) => (permissionId: string): AppPermissionSecurityGroup[] => {
      return state.securityGroups.flatMap((group) => {
        return (state.permissionRecordsByGroup[group.groupId] || [])
          .filter((permission: any) => permission.userPermissionId === permissionId)
          .map((permission: any) => ({ ...group, fromDate: permission.fromDate, thruDate: permission.thruDate }))
      }).sort((first, second) => {
        const firstDate = toEpochMillis(first.thruDate) ?? Number.POSITIVE_INFINITY
        const secondDate = toEpochMillis(second.thruDate) ?? Number.POSITIVE_INFINITY

        return secondDate - firstDate
      })
    }
  },

  actions: {
    async fetchSecurityGroups() {
      if(this.securityGroups.length) {return}

      this.loadingGroups = true
      try {
        const resp = await api({
          url: "admin/userGroups",
          method: "get",
          params: { groupTypeEnumId: "UgtUserAccess", pageSize: 1000, orderByField: "description" },
          cache: true
        }) as any

        if(commonUtil.hasError(resp)) {throw resp.data}

        this.securityGroups = (resp.data || []).map((group: any) => ({
          groupId: group.userGroupId,
          groupName: group.description || group.userGroupId,
          description: group.description
        }))
      } catch (error) {
        logger.error("Failed to fetch app permission security groups.", error instanceof Error ? error.message : String(error))
        throw error
      } finally {
        this.loadingGroups = false
      }
    },

    async fetchGroupPermissions(groupId: string, force = false) {
      if(!force && this.permissionRecordsByGroup[groupId]) {return}

      const resp = await api({
        url: `admin/userGroups/${groupId}/permissions`,
        method: "get",
        params: { pageSize: 1000 }
      }) as any

      if(commonUtil.hasError(resp)) {throw resp.data}
      this.permissionRecordsByGroup = {
        ...this.permissionRecordsByGroup,
        [groupId]: resp.data || []
      }
    },

    async fetchAssignmentsForPermissions(permissionIds: readonly string[]) {
      await this.fetchSecurityGroups()
      await Promise.all(this.securityGroups.map((group) => this.fetchGroupPermissions(group.groupId)))

      return permissionIds
    },

    async savePermissionGroups(permissionId: string, originalGroups: AppPermissionSecurityGroup[], selectedGroups: AppPermissionSecurityGroup[]) {
      const authorizationStore = useAuthorizationStore()
      const originalIds = originalGroups.map((group) => group.groupId)
      const selectedIds = selectedGroups.map((group) => group.groupId)
      const groupIdsToCreate = selectedIds.filter((groupId) => !originalIds.includes(groupId))
      const groupsToRemove = originalGroups.filter((group) => !selectedIds.includes(group.groupId))
      const now = Date.now()
      const operations = [
        ...groupIdsToCreate.map((groupId) => ({
          groupId,
          execute: () => authorizationStore.addUserGroupPermission({
            userGroupId: groupId,
            userPermissionId: permissionId,
            fromDate: now
          })
        })),
        ...groupsToRemove.map((group) => {
          const fromDate = toEpochMillis(group.fromDate)
          if(fromDate === undefined) {throw new Error(`Invalid permission assignment start date for ${group.groupId}`)}

          return {
            groupId: group.groupId,
            execute: () => authorizationStore.removeUserGroupPermission({
              userGroupId: group.groupId,
              userPermissionId: permissionId,
              fromDate,
              thruDate: now
            })
          }
        })
      ]

      const results = await Promise.allSettled(operations.map((operation) => operation.execute()))
      const failedGroupIds = results.flatMap((result, index) => {
        if(result.status === "rejected" || commonUtil.hasError(result.value)) {
          return [operations[index].groupId]
        }

        return []
      })

      const changedGroupIds = operations.map((operation) => operation.groupId)
      await Promise.allSettled(changedGroupIds.map((groupId) => this.fetchGroupPermissions(groupId, true)))

      return {
        failed: failedGroupIds.length,
        succeeded: operations.length - failedGroupIds.length
      }
    },

    async fetchGroupUsers(groupId: string, force = false) {
      if(!force && this.usersByGroup[groupId]) {return this.usersByGroup[groupId]}

      const resp = await api({
        url: `admin/groups/${groupId}/users`,
        method: "get",
        params: { pageSize: 1000 }
      }) as any

      if(commonUtil.hasError(resp)) {throw resp.data}
      const users = Array.isArray(resp.data) ? resp.data : (resp.data?.users || resp.data?.docs || [])
      this.usersByGroup = { ...this.usersByGroup, [groupId]: users }

      return users
    }
  }
})
