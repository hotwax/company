import actions from "./actions"
import getters from "./getters"
import mutations from "./mutations"
import { Module } from "vuex"
import RootState from "@/store/RootState"
import NetSuiteState from "./NetSuiteState"

const netSuiteModule: Module<NetSuiteState, RootState> = {
  namespaced: true,
  state: {
    inventoryVariances: [],
    productStoreShipmentMethods: [],
    paymentMethods: [],
    salesChannel: [],
    facilitiesIdentifications: [],
    enumsInEnumGroup: [],
    shopifyTypeMappings: [],
    shopifyShopsCarrierShipments: [],
    integrationTypeMappings: []
  },
  getters,
  actions,
  mutations,
}

export default netSuiteModule;