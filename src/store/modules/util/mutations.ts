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
}
export default mutations;