import { MutationTree } from "vuex"
import UtilState from "./UtilState"
import * as types from "./mutation-types"

const mutations: MutationTree <UtilState> = {
  [types.UTIL_FACILITY_GROUPS_UPDATED] (state, payload) {
    state.facilityGroups = payload
  },
  [types.UTIL_OPERATING_COUNTRIES_UPDATED] (state, payload) {
    state.operatingCountries = payload
  },
  [types.UTIL_DBIC_COUNTRIES_UPDATED] (state, payload) {
    state.dbicCountries.list = payload.list;
    state.dbicCountries.total = payload.total;
  },
  [types.UTIL_PRODUCT_IDENTIFIERS_UPDATED] (state, payload) {
    state.productIdentifiers = payload;
  },
  [types.UTIL_SHIPMENT_METHOD_TYPES_UPDATED] (state, payload) {
    state.shipmentMethodTypes = payload;
  },
  [types.UTIL_CLEARED] (state) {
    state.facilityGroups = []
    state.operatingCountries = []
    state.dbicCountries = {}
    state.productIdentifiers = []
    state.shipmentMethodTypes = []
  }
}
export default mutations;