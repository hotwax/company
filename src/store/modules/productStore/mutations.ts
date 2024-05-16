import { MutationTree } from "vuex"
import ProductStoreState from "./ProductStoreState"
import * as types from "./mutation-types"

const mutations: MutationTree <ProductStoreState> = {
  [types.PRODUCT_STORE_STORES_UPDATED] (state, payload) {
    state.productStores = payload
  },
  [types.PRODUCT_STORE_CURRENT_UPDATED] (state, payload) {
    state.current = payload
  },
  [types.PRODUCT_STORE_CURRENT_SETTINGS_UPDATED] (state, payload) {
    state.currentStoreSettings = payload
  },
}
export default mutations;