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
  }
}
export default getters;