import { GetterTree } from "vuex"
import ProductStoreState from "./ProductStoreState"
import RootState from "@/store/RootState"

const getters: GetterTree <ProductStoreState, RootState> = {
  getCurrent(state) {
    return state.current ? JSON.parse(JSON.stringify(state.current)) : {};
  },
  getCurrentStoreSettings(state) {
    return state.currentStoreSettings
  },
  getProductStores(state) {
    return state.productStores
  },
  getCompany(state) {
    return state.company
  },
}
export default getters;