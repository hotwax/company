import { GetterTree } from "vuex"
import UtilState from "./UtilState"
import RootState from "@/store/RootState"

const getters: GetterTree <UtilState, RootState> = {
  getFacilityGroups(state) {
    return state.facilityGroups
  },
  getOperatingCountries(state) {
    return state.operatingCountries;
  },
  getDBICCountriesCount(state) {
    return state.dbicCountries.total;
  },
  getProductIdentifiers(state) {
    return state.productIdentifiers;
  },
  getShipmentMethodTypes(state) {
    return state.shipmentMethodTypes;
  },
  getOrganizationPartyId(state) {
    return state.organizationPartyId;
  }
}
export default getters;