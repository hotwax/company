import { Module } from 'vuex'
import ShopifyState from './ShopifyState'
import RootState from '@/store/RootState'
import mutations from './mutations'
import getters from './getters'
import actions from './actions'

const shopifyModule: Module <ShopifyState, RootState> = {
  namespaced: true,
  state: {
    shops: [],
    current: {},
    shopifyTypeMappings: {},
    shopifyShopsCarrierShipments: {},
    shopifyShopsLocations: {},
    fetchStatus: {
      shops: 'none',
      lastFetched: 0
    }
  },
  getters,
  actions,
  mutations
}

export default shopifyModule;
