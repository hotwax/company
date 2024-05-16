import { GetterTree } from "vuex"
import ProductStoreState from "./ProductStoreState"
import RootState from "@/store/RootState"

const getters: GetterTree <ProductStoreState, RootState> = {
  getProductStores(state) {
    return state.productStores
  },
  getCurrent(state) {
    return state.current ? JSON.parse(JSON.stringify(state.current)) : {};
  }
}
export default getters;