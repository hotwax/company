import { GetterTree } from "vuex"
import UtilState from "./UtilState"
import RootState from "@/store/RootState"

const getters: GetterTree <UtilState, RootState> = {
  getFacilityGroups(state) {
    return state.facilityGroups
  },
  getOperatingCountries(state) {
    return state.operatingCountries;
  }
}
export default getters;