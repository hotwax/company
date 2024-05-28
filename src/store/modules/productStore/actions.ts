import { ActionTree } from "vuex"
import RootState from "@/store/RootState"
import ProductStoreState from "./ProductStoreState"
import * as types from "./mutation-types"
import { hasError } from "@/utils"
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
  
  async fetchProductStoreDetails({ commit }, productStoreId) {
    let current = {} as any;

    try {
      const resp = await ProductStoreService.fetchProductStoreDetails(productStoreId);
      
      if(!hasError(resp)) {
        current = resp.data;
      } else {
        throw resp.data;
      }
    } catch(error: any) {
      logger.error(error);
    }
    commit(types.PRODUCT_STORE_CURRENT_UPDATED, current);
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

  async fetchCurrentStoreSettings({ commit }, productStoreId) {
    const storeSettings = {} as any;

    try {
      const resp = await ProductStoreService.fetchCurrentStoreSettings(productStoreId);

      if(!hasError(resp)) {
        // Api returning expired record also hence manually removing them.
        // Todo: update after fixed in api backend
        resp.data.map((setting: any) => {
          if(!setting.thruDate) {
            storeSettings[setting.settingTypeEnumId] = setting
          }
        })
      } else {
        throw resp.data;
      }
    } catch(error: any) {
      logger.error(error);
    }
    commit(types.PRODUCT_STORE_CURRENT_SETTINGS_UPDATED, storeSettings);
  },

  async fetchCompany({ commit }) {
    let company = {};

    try {
      const resp = await ProductStoreService.fetchCompany({ partyId: process.env.VUE_APP_COMPANY_PARTY_ID });

      if(!hasError(resp)) {
        company = resp.data;
      } else {
        throw resp.data;
      }
    } catch(error: any) {
      logger.error(error);
    }
    commit(types.PRODUCT_STORE_COMPANY_UPDATED, company);
  },

  async updateCurrentStoreSettings({ commit }, payload) {
    commit(types.PRODUCT_STORE_CURRENT_SETTINGS_UPDATED, payload);
  },

  async updateCurrent({ commit }, current) {
    commit(types.PRODUCT_STORE_CURRENT_UPDATED, current);
  },

  async clearProductStoreState({ commit }) {
    commit(types.PRODUCT_STORE_CLEARED);
  },
}

export default actions;