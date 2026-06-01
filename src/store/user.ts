import { defineStore } from 'pinia'
import { Settings } from 'luxon'
import { api, commonUtil, translate } from '@common'
import { useAuth } from '@common/composables/useAuth'
import logger from '@/logger'

export const useUserStore = defineStore('user', {
  state: () => ({
    current: {} as any,
    permissions: [] as string[],
    oms: '',
    instanceUrl: '',
    fetchStatus: {
      profile: '' as string,
      permissions: '' as string,
      lastFetched: 0 as number
    }
  }),

  getters: {
    isAuthenticated: () => useAuth().isAuthenticated.value,
    getUserProfile: (state) => state.current,
    getUserPermissions: (state) => state.permissions,
    getInstanceUrl: (state) => state.instanceUrl,
    hasPermission: (state) => (permissionId: string): boolean => {
      if (!permissionId) return true
      if (permissionId.includes(' OR ')) {
        return permissionId.split(' OR ').some((p: string) => useUserStore().hasPermission(p.trim()))
      }
      if (permissionId.includes(' AND ')) {
        return permissionId.split(' AND ').every((p: string) => useUserStore().hasPermission(p.trim()))
      }
      return state.permissions.includes(permissionId)
    }
  },

  actions: {
    async fetchUserProfile() {
      this.fetchStatus.profile = 'pending'
      try {
        const resp = await api({
          url: 'admin/user/profile',
          method: 'get',
          baseURL: commonUtil.getMaargURL()
        })
        if (commonUtil.hasError(resp)) throw resp.data._ERROR_MESSAGE_
        this.current = resp.data
        useAuth().updateUserId(this.current.userId)
        if (this.current.timeZone) {
          Settings.defaultZone = this.current.timeZone
        }
        this.fetchStatus.profile = 'success'
        this.fetchStatus.lastFetched = Date.now()
      } catch (error: any) {
        this.fetchStatus.profile = 'error'
        commonUtil.showToast(translate('Failed to fetch user profile'))
        logger.error('fetchUserProfile', error)
        useAuth().clearAuth()
        return Promise.reject(new Error(error))
      }
    },

    async fetchPermissions() {
      this.fetchStatus.permissions = 'pending'
      const permissionId = import.meta.env.VITE_APP_PERMISSION_ID
      const serverPermissions: string[] = []
      const viewSize = 200
      let viewIndex = 0

      try {
        let resp: any
        do {
          resp = await api({
            url: 'admin/user/permissions',
            method: 'get',
            params: { viewIndex, viewSize }
          })
          if (resp.status === 200 && resp.data.docs?.length && !commonUtil.hasError(resp)) {
            serverPermissions.push(...resp.data.docs.map((p: any) => p.permissionId))
            viewIndex++
          } else {
            resp = null
          }
        } while (resp)

        if (permissionId && !serverPermissions.includes(permissionId)) {
          const msg = 'You do not have permission to access the app.'
          commonUtil.showToast(translate(msg))
          this.fetchStatus.permissions = 'error'
          return Promise.reject(new Error(msg))
        }

        this.permissions = serverPermissions
        this.fetchStatus.permissions = 'success'
      } catch (error: any) {
        this.fetchStatus.permissions = 'error'
        return Promise.reject(error)
      }
    },

    async setUserTimeZone(tzId: string) {
      if (this.current.timeZone === tzId) return
      try {
        const resp: any = await api({
          url: 'admin/user/profile',
          method: 'POST',
          data: { userId: this.current.userId, tzId }
        })
        if (resp?.status === 200) {
          this.current.timeZone = tzId
          Settings.defaultZone = tzId
          commonUtil.showToast(translate('Time zone updated successfully'))
        } else {
          throw resp
        }
      } catch (err) {
        logger.error('setUserTimeZone', err)
        commonUtil.showToast(translate('Failed to update time zone'))
        return Promise.reject('')
      }
    },

    // Called by @common's initialiseConfig after successful login
    async postLogin() {
      try {
        await this.fetchUserProfile()
        await this.fetchPermissions()
      } catch (error: any) {
        return Promise.reject(new Error(error))
      }
    },

    // Called by @common's initialiseConfig after logout
    async postLogout() {
      this.$reset()
    }
  },

  persist: true
})
