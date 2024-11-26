import { ActionTree } from "vuex"
import RootState from "@/store/RootState"
import * as types from "./mutation-types"
import { hasError } from "@/utils"
import logger from "@/logger"
import NetSuiteState from "./NetSuiteState"
import { NetSuiteService } from "@/services/NetSuiteService"
import { UtilService } from "@/services/UtilService"

const actions: ActionTree<NetSuiteState, RootState> = {
  
  async fetchInventoryVariances({ commit }) {
    let inventoryVariances  = [] as any;
    try {
      const payload = {
        enumTypeId:  ["REPORT_AN_ISSUE", "RPRT_NO_VAR_LOG"],
        enumTypeId_op: "in",
        pageSize: 20,
      }

      const resp = await UtilService.fetchEnums(payload)
      if(!hasError(resp)) {
        inventoryVariances = resp.data
      } else {
        throw resp.data
      }
    } catch (err) {
      logger.error(err)
    }

    commit(types.NET_SUITE_INVENTORY_VARIANCES_UPDATED, inventoryVariances)
  },

  async fetchSalesChannel({ commit }) {
    let salesChannel  = [] as any;
    try {
      const payload = {
        enumTypeId:  ["ORDER_SALES_CHANNEL"],
        enumTypeId_op: "in",
        pageSize: 10,
      }

      const resp = await UtilService.fetchEnums(payload)
      if(!hasError(resp)) {
        salesChannel = resp.data
      } else {
        throw resp.data
      }
    } catch (err) {
      logger.error(err)
    }

    commit(types.NET_SUITE_SALES_CHANNEL_UPDATED, salesChannel)
  },

  async fetchPaymentMethods({ commit }) {
    let paymentMethods = [] as any;

    try {
      const resp = await NetSuiteService.fetchPaymentMethods({ pageSize: 100 });

      if(!hasError(resp)) {
        paymentMethods = resp.data;
      } else {
        throw resp.data;
      }
    } catch(error: any) {
      logger.error(error);
    }
    commit(types.NET_SUITE_PAYMENT_METHODS_UPDATED, paymentMethods);
  },

  async fetchProductStoreShipmentMethods({ state, commit }, payload) {
    let productStoreShipmentMethods = [] as any;
    let resp;
    
    try {
      resp = await NetSuiteService.fetchProductStoreShipmentMethods("STORE")

      if (!hasError(resp) && resp.data) {
        productStoreShipmentMethods = resp.data
      } else {
        throw resp.data
      }
    } catch(error) {
      logger.error(error);
    }
    commit(types.NET_SUITE_PRODUCT_STORE_SHIPMENT_METHODS_UPDATED, productStoreShipmentMethods)
  },
  async fetchIntegrationTypeMappings({ commit }, integrationTypeId) {
    let integrationTypeMappings = [] as any
    let resp;

    try {
      const payload = {
        integrationTypeId: integrationTypeId,
        pageSize: 100
      }

      resp = await NetSuiteService.fetchIntegrationTypeMappings(payload)
      if (!hasError(resp) && resp.data) {
        const responseData = resp.data
        integrationTypeMappings = responseData.reduce((integrationTypeId: any, integrationTypeMappings: any) => {
          const typeId = integrationTypeMappings.integrationTypeId;

          if (!integrationTypeId[typeId]) {
            integrationTypeId[typeId] = [];
          }
          integrationTypeId[typeId].push(integrationTypeMappings);
          return integrationTypeId;
        }, {});   
      } else {
        throw resp.data
      }
    } catch(error) {
      logger.error(error);
    }
    commit(types.NET_SUITE_INTEGRATION_TYPE_MAPPINGS_UPDATED, integrationTypeMappings)
  },
  async fetchShopifyTypeMappings({commit}, mappedTypeId) {
    let shopifyTypeMappings = [] as any
    let resp;

    try {
      const payload = {
        mappedTypeId: mappedTypeId,
        pageSize: 100
      }

      resp = await NetSuiteService.fetchShopifyTypeMappings(payload)
      if (!hasError(resp) && resp.data) {
        const responseData = resp.data
        shopifyTypeMappings = responseData.reduce((mappedTypeId: any, shopifyTypeMappings: any) => {
          const typeId = shopifyTypeMappings.mappedTypeId;
          
          if (!mappedTypeId[typeId]) {
            mappedTypeId[typeId] = [];
          }
          mappedTypeId[typeId].push(shopifyTypeMappings);
          return mappedTypeId;
        }, {});   
      } else {
        throw resp.data
      }
    } catch(error) {
      logger.error(error);
    }
    commit(types.NET_SUITE_SHOPIFY_TYPE_MAPPINGS_UPDATED, shopifyTypeMappings)
  }
} 

export default actions;