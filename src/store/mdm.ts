import { defineStore } from 'pinia'
import { api, commonUtil, logger } from '@common'

export const useMdmStore = defineStore('mdm', {
  state: () => ({
    configs: [] as any[],
    logs: [] as any[],
    fetchStatus: {
      configs: 'none' as string,   // 'none' | 'pending' | 'success' | 'error'
      logs: 'none' as string,
      lastFetched: 0 as number
    }
  }),

  getters: {
    getConfigs: (state) => state.configs,
    getLogs: (state) => state.logs,
    getConfigById: (state) => (configId: string) =>
      state.configs.find((c: any) => c.configId === configId),
    getFetchStatus: (state) => state.fetchStatus
  },

  actions: {
    async fetchConfigs() {
      this.fetchStatus = { ...this.fetchStatus, configs: 'pending' }
      let configs: any[] = []
      try {
        const resp = await api({
          url: 'admin/dataManager',
          method: 'get',
          params: { pageSize: 200 }
        }) as any
        if (!commonUtil.hasError(resp) && resp.data) {
          configs = Array.isArray(resp.data) ? resp.data : (resp.data.dataManagerConfigList ?? [])
          this.fetchStatus = { ...this.fetchStatus, configs: 'success', lastFetched: Date.now() }
        } else {
          throw resp.data
        }
      } catch (error) {
        logger.error(error)
        this.fetchStatus = { ...this.fetchStatus, configs: 'error' }
      }
      this.configs = configs
    },

    async fetchLogs(params: Record<string, any> = {}) {
      this.fetchStatus = { ...this.fetchStatus, logs: 'pending' }
      let logs: any[] = []
      try {
        const resp = await api({
          url: 'admin/dataManager/details',
          method: 'get',
          params: { pageSize: 50, orderByField: '-createdDate', pageIndex: 0, ...params }
        }) as any
        if (resp?.data?.dataManagerLogs) {
          logs = resp.data.dataManagerLogs
          this.fetchStatus = { ...this.fetchStatus, logs: 'success', lastFetched: Date.now() }
        } else if (commonUtil.hasError(resp)) {
          throw resp.data
        } else {
          // empty result is still success
          this.fetchStatus = { ...this.fetchStatus, logs: 'success', lastFetched: Date.now() }
        }
      } catch (error) {
        logger.error(error)
        this.fetchStatus = { ...this.fetchStatus, logs: 'error' }
      }
      this.logs = logs
    },

    async fetchMoreLogs(params: Record<string, any> = {}): Promise<number> {
      try {
        const resp = await api({
          url: 'admin/dataManager/details',
          method: 'get',
          params: { pageSize: 50, orderByField: '-createdDate', ...params }
        }) as any
        const more = resp?.data?.dataManagerLogs ?? []
        this.logs = [...this.logs, ...more]
        return more.length
      } catch (error) {
        logger.error(error)
        return 0
      }
    },

    async createConfig(payload: any) {
      return api({ url: 'admin/dataManager', method: 'post', data: payload })
    },

    async updateConfig(payload: any) {
      return api({ url: `admin/dataManager/${payload.configId}`, method: 'put', data: payload })
    },

    async removeLog(logId: string) {
      return api({ url: `admin/dataManager/logs/${logId}`, method: 'delete' })
    },

    clearMdmState() {
      this.$reset()
    }
  },

  persist: true
})
