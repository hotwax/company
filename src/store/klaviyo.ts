import { defineStore } from 'pinia'
import { logger } from '@common'
import { KlaviyoService } from '@/services/KlaviyoService'
import { useUtilStore } from './util'
import type { CommGatewayAuth, CommGatewayConfig, ProductStoreEmailSetting, SystemMessageRemote } from '@/services/KlaviyoService'

type FetchStatus = 'none' | 'pending' | 'success' | 'error'

export const useKlaviyoStore = defineStore('klaviyo', {
  state: () => ({
    unigateConfig: null as SystemMessageRemote | null,
    hasCheckedUnigate: false,
    connections: [] as CommGatewayAuth[],
    current: null as CommGatewayAuth | null,
    configs: [] as CommGatewayConfig[],
    emailSettings: [] as ProductStoreEmailSetting[],
    fetchStatus: {
      unigate: 'none' as FetchStatus,
      connections: 'none' as FetchStatus,
      configs: 'none' as FetchStatus,
      emailSettings: 'none' as FetchStatus,
      lastFetched: 0
    }
  }),

  getters: {
    getUnigateConfig: (state) => state.unigateConfig,
    hasUnigateConfig: (state) => !!state.unigateConfig,
    hasCheckedUnigateStatus: (state) => state.hasCheckedUnigate,
    getConnections: (state) => state.connections,
    getKlaviyoConnections: (state) =>
      state.connections.filter((c: any) => c?.commGatewayConfigId === 'KLAVIYO'),
    getConnectionById: (state) => (commGatewayAuthId: string) =>
      state.connections.find((c: any) => c?.commGatewayAuthId === commGatewayAuthId) || null,
    getCurrent: (state) => state.current,
    getEmailSettings: (state) => state.emailSettings,
    getEmailSettingsForGateway: (state) => (commGatewayAuthId: string) =>
      state.emailSettings.filter((s: any) => s?.gatewayAuthId === commGatewayAuthId),
    getEmailSettingsForStore: (state) => (productStoreId: string) =>
      state.emailSettings.filter((s: any) => s?.productStoreId === productStoreId),
    getEventCountByGateway: (state) =>
      state.emailSettings.reduce((acc: Record<string, number>, setting: any) => {
        const id = setting?.gatewayAuthId
        if (!id) return acc
        acc[id] = (acc[id] || 0) + 1
        return acc
      }, {}),
    getFetchStatus: (state) => state.fetchStatus,
    isKlaviyoConfigAvailable: (state) =>
      state.configs.some((c: any) => c?.commGatewayConfigId === 'KLAVIYO')
  },

  actions: {
    async fetchUnigateConfig() {
      this.fetchStatus = { ...this.fetchStatus, unigate: 'pending' }
      try {
        const config = await KlaviyoService.fetchUnigateConfig()
        this.unigateConfig = config
        this.hasCheckedUnigate = true
        this.fetchStatus = { ...this.fetchStatus, unigate: 'success', lastFetched: Date.now() }
        return config
      } catch (error) {
        logger.error(error)
        this.unigateConfig = null
        this.hasCheckedUnigate = true
        this.fetchStatus = { ...this.fetchStatus, unigate: 'error' }
        return null
      }
    },

    async fetchConnections() {
      this.fetchStatus = { ...this.fetchStatus, connections: 'pending' }
      try {
        const list = await KlaviyoService.fetchCommGatewayAuths()
        this.connections = list
        this.fetchStatus = { ...this.fetchStatus, connections: 'success' }
        return list
      } catch (error) {
        logger.error(error)
        this.fetchStatus = { ...this.fetchStatus, connections: 'error' }
        return []
      }
    },

    async fetchConfigs() {
      this.fetchStatus = { ...this.fetchStatus, configs: 'pending' }
      try {
        const list = await KlaviyoService.fetchCommGatewayConfigs()
        this.configs = list
        this.fetchStatus = { ...this.fetchStatus, configs: 'success' }
        return list
      } catch (error) {
        logger.error(error)
        this.fetchStatus = { ...this.fetchStatus, configs: 'error' }
        return []
      }
    },

    async fetchAllEmailSettings() {
      this.fetchStatus = { ...this.fetchStatus, emailSettings: 'pending' }
      try {
        const list = await KlaviyoService.fetchAllEmailSettings()
        this.emailSettings = list
        this.fetchStatus = { ...this.fetchStatus, emailSettings: 'success' }
        return list
      } catch (error) {
        logger.error(error)
        this.fetchStatus = { ...this.fetchStatus, emailSettings: 'error' }
        return []
      }
    },

    setCurrent(connection: CommGatewayAuth | null) {
      this.current = connection
    },

    async hydrate() {
      await this.fetchUnigateConfig()
      if (!this.unigateConfig) return
      const utilStore = useUtilStore()
      await Promise.all([
        this.fetchConnections(),
        this.fetchConfigs(),
        utilStore.fetchEmailTypes(),
        this.fetchAllEmailSettings()
      ])
    },

    clear() {
      this.$reset()
    }
  }
})
