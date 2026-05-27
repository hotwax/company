import { MutationTree } from 'vuex'
import ShopifyState from './ShopifyState'
import * as types from './mutation-types'

const mutations: MutationTree <ShopifyState> = {
  [types.SHOPIFY_SHOPS_UPDATED] (state, payload) {
    state.shops = payload
  },
  [types.SHOPIFY_CURRENT_UPDATED] (state, payload) {
    state.current = payload
  },
  [types.SHOPIFY_TYPE_MAPPINGS_UPDATED] (state, payload) {
    state.shopifyTypeMappings = payload
  },
  [types.SHOPIFY_SHOPS_CARRIER_SHIPMENTS_UPDATED] (state, payload) {
    state.shopifyShopsCarrierShipments = payload
  },
  [types.SHOPIFY_SHOPS_LOCATIONS_UPDATED] (state, payload) {
    state.shopifyShopsLocations = payload
  },
  [types.SHOPIFY_CLEARED] (state) {
    state.shops = []
    state.current = {}
    state.shopifyTypeMappings = {}
    state.shopifyShopsCarrierShipments = {}
    state.shopifyShopsLocations = {}
  },
  [types.SHOPIFY_FETCH_STATUS_UPDATED] (state, payload) {
    state.fetchStatus = { ...state.fetchStatus, ...payload }
  }
}
export default mutations;
