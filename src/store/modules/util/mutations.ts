import { MutationTree } from "vuex"
import UtilState from "./UtilState"
import * as types from "./mutation-types"

const mutations: MutationTree <UtilState> = {
  [types.UTIL_OPERATING_COUNTRIES_UPDATED] (state, payload) {
    state.operatingCountries = payload
  },
}
export default mutations;