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
  },
  [types.NET_SUITE_SALES_CHANNEL_UPDATED] (state, payload) {
    state.salesChannel = payload
  },
  [types.NET_SUITE_INTEGRATION_TYPE_MAPPINGS_UPDATED] (state, payload) {
    state.integrationTypeMappings = payload
  },
  [types.NET_SUITE_SHOPIFY_TYPE_MAPPINGS_UPDATED] (state, payload) {
    state.shopifyTypeMappings = payload
  },
  [types.NET_SUITE_SHOPIFY_SHOPS_CARRIER_SHIPMENTS_UPDATED] (state, payload) {
    state.shopifyShopsCarrierShipments = payload
  },
  [types.NET_SUITE_FACILITIES_IDENTIFICATIONS_UPDATED] (state, payload) {
    state.facilitiesIdentifications = payload
  },
  [types.NET_SUITE_ENUM_GROUPS_UPDATED] (state, payload) {
    state.enumsInEnumGroup = payload
  }
}
export default mutations;