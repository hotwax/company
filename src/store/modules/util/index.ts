import actions from "./actions"
import getters from "./getters"
import mutations from "./mutations"
import { Module } from "vuex"
import UtilState from "./UtilState"
import RootState from "@/store/RootState"

const utilModule: Module<UtilState, RootState> = {
  namespaced: true,
  state: {
    facilityGroups: [],
    facilities: [],
    operatingCountries: [],
    dbicCountries: {},
    productIdentifiers: [],
    shipmentMethodTypes: [],
    emailTypes: [],
    organizationPartyId: "",
    statusItems: {},
    maargInfo: null,
    fetchStatus: {
      facilities: 'none',
      statuses: 'none',
      organizationPartyId: 'none',
      facilityGroups: 'none',
      dbicCountries: 'none',
      operatingCountries: 'none',
      productIdentifiers: 'none',
      shipmentMethodTypes: 'none',
      emailTypes: 'none',
      maargInfo: 'none',
      lastFetched: 0
    }
  },
  getters,
  actions,
  mutations,
}

export default utilModule;