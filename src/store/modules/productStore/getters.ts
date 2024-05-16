import { GetterTree } from "vuex"
import ProductStoreState from "./ProductStoreState"
import RootState from "@/store/RootState"

const getters: GetterTree <ProductStoreState, RootState> = {
  getProductStores(state) {
    return state.productStores
  },
}
export default getters;