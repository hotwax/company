import { GetterTree } from "vuex"
import RootState from "@/store/RootState"
import NetSuiteState from "./NetSuiteState";

const getters: GetterTree <NetSuiteState, RootState> = {
  getInventoryVariances(state) {
    return state.inventoryVariances ? state.inventoryVariances : []
  },
  getProductStoreShipmentMehtods(state) {
    return state.productStoreShipmentMethods
  },
  getPaymentMehtods(state) {
    return state.paymentMethods
  },
  getSalesChannel(state) {
    return state.salesChannel
  },
  getIntegrationTypeMappings: (state) => (typeId: any) => {
    return state.integrationTypeMappings[typeId] ? state.integrationTypeMappings[typeId] : []
  },
  getShopifyTypeMappings: (state) => (typeId: any) => {
    return state.shopifyTypeMappings[typeId] ? state.shopifyTypeMappings[typeId] : []
  }
}
export default getters;