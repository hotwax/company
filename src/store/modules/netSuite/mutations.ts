import { MutationTree } from "vuex"
import * as types from "./mutation-types"
import NetSuiteState from "./NetSuiteState"

const mutations: MutationTree <NetSuiteState> = {
  [types.NET_SUITE_INVENTORY_VARIANCES_UPDATED] (state, payload) {
    state.inventoryVariances = payload
  },
  [types.NET_SUITE_PRODUCT_STORE_SHIPMENT_METHODS_UPDATED] (state, payload) {
    state.productStoreShipmentMethods = payload
  },
  [types.NET_SUITE_PAYMENT_METHODS_UPDATED] (state, payload) {
    state.paymentMethods = payload
  }
}
export default mutations;