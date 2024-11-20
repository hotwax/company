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
    // let currentCarrier = JSON.parse(JSON.stringify(state.current))
    let productStoreShipmentMethods  = [] as any;
    // let pageIndex = 0
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

}

export default actions;