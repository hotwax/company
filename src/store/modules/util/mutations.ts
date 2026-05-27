import { MutationTree } from "vuex"
import UtilState from "./UtilState"
import * as types from "./mutation-types"

const mutations: MutationTree <UtilState> = {
  [types.UTIL_FACILITY_GROUPS_UPDATED] (state, payload) {
    state.facilityGroups = payload
  },
  [types.UTIL_FACILITIES_UPDATED] (state, payload) {
    state.facilities = payload
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
  [types.UTIL_EMAIL_TYPES_UPDATED] (state, payload) {
    state.emailTypes = payload;
  },
  [types.UTIL_CLEARED] (state) {
    state.facilityGroups = []
    state.operatingCountries = []
    state.dbicCountries = {}
    state.productIdentifiers = []
    state.shipmentMethodTypes = []
    state.emailTypes = []
    state.statusItems = {}
    state.maargInfo = null
  },
  [types.UTIL_ORGANIZATION_PARTY_ID_UPDATED](state, payload) {
    state.organizationPartyId = payload
  },
  [types.UTIL_STATUS_ITEMS_UPDATED](state, payload) {
    state.statusItems = payload
  },
  [types.UTIL_MAARG_INFO_UPDATED](state, payload) {
    state.maargInfo = payload
  },
  [types.UTIL_FETCH_STATUS_UPDATED](state, payload) {
    state.fetchStatus = {
      ...state.fetchStatus,
      ...payload
    }
  }
}
export default mutations;