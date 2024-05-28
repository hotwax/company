import actions from "./actions"
import getters from "./getters"
import mutations from "./mutations"
import { Module } from "vuex"
import ProductStoreState from "./ProductStoreState"
import RootState from "@/store/RootState"

const productStoreModule: Module<ProductStoreState, RootState> = {
  namespaced: true,
  state: {
    current: {},
    currentStoreSettings: {},
    productStores: [],
    company: {}
  },
  getters,
  actions,
  mutations,
}

export default productStoreModule;