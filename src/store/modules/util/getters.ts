import { GetterTree } from "vuex"
import UtilState from "./UtilState"
import RootState from "@/store/RootState"

const getters: GetterTree <UtilState, RootState> = {
  getFacilityGroups(state) {
    return state.facilityGroups
  },
  getFacilities(state) {
    return state.facilities
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
  getEmailTypes(state) {
    return state.emailTypes;
  },
  getOrganizationPartyId(state) {
    return state.organizationPartyId;
  },
  getStatusItems(state) {
    return state.statusItems;
  },
  getMaargInfo(state) {
    return state.maargInfo;
  },
  getFetchStatus(state) {
    return state.fetchStatus;
  }
}
export default getters;