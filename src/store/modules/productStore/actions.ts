import { ActionTree } from "vuex"
import RootState from "@/store/RootState"
import ProductStoreState from "./ProductStoreState"
import * as types from "./mutation-types"
import { hasError } from "@/utils"
import logger from "@/logger"
import { ProductStoreService } from "@/services/ProductStoreService"
import store from "@/store"

const actions: ActionTree<ProductStoreState, RootState> = {

  async fetchProductStores({ commit, dispatch }, payload) {
    let productStores = [];

    try {
      const resp = await ProductStoreService.fetchProductStores({ pageSize: 100 });

      if(!hasError(resp)) {
        productStores = resp.data;

        if(!payload) {
          const productStoresFacilityCount = await dispatch("fetchProductStoresFacilityCount")
          const productStoresShipmentMethodCount = await dispatch("fetchProductStoresShipmentMethodCount")
          if(Object.keys(productStoresFacilityCount).length) {
            productStores.map((store: any) => store.facilityCount = productStoresFacilityCount[store.productStoreId] ? productStoresFacilityCount[store.productStoreId] : 0)
          }
          if(Object.keys(productStoresShipmentMethodCount).length) {
            productStores.map((store: any) => store.shipmentMethodCount = productStoresShipmentMethodCount[store.productStoreId] ? productStoresShipmentMethodCount[store.productStoreId] : 0)
          }
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
      const resp = await ProductStoreService.fetchProductStoresFacilityCount({ pageSize: 100 });

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

  async fetchProductStoresShipmentMethodCount() {
    const productStoresShipmentMethodCount = {} as any;

    try {
      const resp = await ProductStoreService.fetchProductStoresShipmentMethodCount({ pageSize: 100 });

      if(!hasError(resp)) {
        resp.data.map((response: any) => productStoresShipmentMethodCount[response.productStoreId] = response.shipmentMethodCount)
      } else {
        throw resp.data;
      }
    } catch(error: any) {
      logger.error(error);
    }
    return productStoresShipmentMethodCount;
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

  async fetchProductStoreShopifyShops({ commit }) {
    let shopifyShopId = '' as any;
    const netSuiteProductStoreId = store.getters["productStore/getProductStoreShopifyShopId"]

    try {
      const resp = await ProductStoreService.fetchProductStoreShopifyShops({ productStoreId: netSuiteProductStoreId?.productStoreId })
      
      if(!hasError(resp)) {
        shopifyShopId = resp.data[0].shopId;
      } else {
        throw resp.data;
      }
    } catch(error: any) {
      logger.error(error);
    }
    commit(types.PRODUCT_STORE_SHOPIFY_SHOP_UPDATED, shopifyShopId);
  },

  async fetchCompany({ commit }) {
    let company = {};

    try {
      const resp = await ProductStoreService.fetchCompany({ partyId: store.state.util.organizationPartyId });

      if(!hasError(resp)) {
        company = { ...resp.data, companyName: resp.data.groupName };
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

  async updateSelectedProductStore({ commit }, netSuiteProductStore) {
    commit(types.PRODUCT_STORE_NETSUITE_UPDATED, netSuiteProductStore);
  }
}

export default actions;