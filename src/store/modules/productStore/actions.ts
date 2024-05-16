import { ActionTree } from "vuex"
import RootState from "@/store/RootState"
import ProductStoreState from "./ProductStoreState"
import * as types from "./mutation-types"
import { hasError, showToast } from "@/utils"
import logger from "@/logger"
import { ProductStoreService } from "@/services/ProductStoreService"

const actions: ActionTree<ProductStoreState, RootState> = {

  async fetchProductStores({ commit, dispatch }) {
    let productStores = [];

    try {
      const resp = await ProductStoreService.fetchProductStores();

      if(!hasError(resp)) {
        productStores = resp.data;

        const productStoresFacilityCount = await dispatch("fetchProductStoresFacilityCount")
        if(Object.keys(productStoresFacilityCount).length) {
          productStores.map((store: any) => store.facilityCount = productStoresFacilityCount[store.productStoreId] ? productStoresFacilityCount[store.productStoreId] : 0)
        }
      } else {
        throw resp.data;
      }
    } catch(error: any) {
      logger.error(error);
    }
    commit(types.PRODUCT_STORE_STORES_UPDATED, productStores);
  },

  async fetchProductStoresFacilityCount() {
    const productStoresFacilityCount = {} as any;

    try {
      const resp = await ProductStoreService.fetchProductStoresFacilityCount();

      if(!hasError(resp)) {
        resp.data.map((response: any) => productStoresFacilityCount[response.productStoreId] = response.facilityCount)
      } else {
        throw resp.data;
      }
    } catch(error: any) {
      logger.error(error);
    }
    return productStoresFacilityCount;
  },
}

export default actions;