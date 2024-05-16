import { MutationTree } from "vuex"
import ProductStoreState from "./ProductStoreState"
import * as types from "./mutation-types"

const mutations: MutationTree <ProductStoreState> = {
  [types.PRODUCT_STORE_STORES_UPDATED] (state, payload) {
    state.productStores = payload
  },
}
export default mutations;