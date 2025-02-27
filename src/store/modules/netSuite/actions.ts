import { ActionTree } from "vuex"
import RootState from "@/store/RootState"
import * as types from "./mutation-types"
import { hasError } from "@/utils"
import logger from "@/logger"
import store from "@/store"
import NetSuiteState from "./NetSuiteState"
import { NetSuiteService } from "@/services/NetSuiteService"
import { UtilService } from "@/services/UtilService"

const actions: ActionTree<NetSuiteState, RootState> = {
  
  async fetchInventoryVariances({ commit }) {
    let inventoryVariances  = [] as any;
    try {
      const payload = {
        enumTypeId:  "IID_REASON",
        enumTypeId_op: "in",
        pageSize: 100,
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

  async fetchEnumGroupMember({commit}) {
    let enumsInEnumGroup  = [] as any;
    try {
      const payload = {
        enumerationGroupId:  "NETSUITE_IIV_REASON",
        enumerationGroupId_op: "in",
        pageSize: 100,
      }

      const resp = await UtilService.fetchEnumGroupMember(payload)

      if(!hasError(resp) && resp.data) {
        // TODO: need to remove this filter check , after api change of not giving expired results.
        enumsInEnumGroup = resp.data.filter((item: any) => !item.thruDate).reduce((enumId: any, item: any) => {
          enumId[item.enumId] = {
            fromDate: item.fromDate,
            enumerationGroupId: item.enumerationGroupId,
          };
          return enumId;
        }, {});
      } else {
        throw resp.data
      }
    } catch (err) {
      logger.error(err)
    }
    commit(types.NET_SUITE_ENUM_GROUPS_UPDATED, enumsInEnumGroup)
  },

  async fetchFacilitiesIdentifications({ commit }) {
    let facilitiesIdentifications  = [] as any;
    try {
      const payload = {
        facilityIdenTypeId:  "ORDR_ORGN_DPT",
        facilityIdenTypeId_op: "in",
        pageSize: 100,
      }

      const resp = await NetSuiteService.fetchfacilitiesIdentifications(payload)
      if(!hasError(resp)) {
        // TODO: need to handle the case of removing the facility from the faciliyIdentofication, need to add the thruDate in the payload
        facilitiesIdentifications = resp.data.filter((item: any) => !item.thruDate)
      } else {
        throw resp.data
      }
    } catch (err) {
      logger.error(err)
    }
    commit(types.NET_SUITE_FACILITIES_IDENTIFICATIONS_UPDATED, facilitiesIdentifications)
  },

  async fetchSalesChannel({ commit }) {
    let salesChannel  = [] as any;
    try {
      const payload = {
        enumTypeId: "ORDER_SALES_CHANNEL",
        enumTypeId_op: "in",
        pageSize: 100,
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

  async fetchProductStoreShipmentMethods({ commit }) {
    let productStoreShipmentMethods = [] as any;
    let resp;
    
    try {
      const netSuiteProductStoreId = store.getters["productStore/getNetSuiteProductStore"]
      resp = await NetSuiteService.fetchProductStoreShipmentMethods(netSuiteProductStoreId?.productStoreId)

      if(!hasError(resp) && resp.data) {
        productStoreShipmentMethods = resp.data
      } else {
        throw resp.data
      }
    } catch(error) {
      logger.error(error);
    }
    commit(types.NET_SUITE_PRODUCT_STORE_SHIPMENT_METHODS_UPDATED, productStoreShipmentMethods)
  },

  async fetchIntegrationTypeMappings({ commit }, params: any) {
    let integrationTypeMappings = [] as any
    let resp;

    try {
      let payload = {
        integrationTypeId: params.integrationTypeId,
        pageSize: 100
      } as any

      if(params.mappingKey) {
        payload = {...payload, mappingKey: params.mappingKey }
      }

      resp = await NetSuiteService.fetchIntegrationTypeMappings(payload)
      if(!hasError(resp) && resp.data) {
        const responseData = resp.data
        integrationTypeMappings = responseData.reduce((integrationTypeId: any, integrationTypeMappings: any) => {
          const typeId = integrationTypeMappings.integrationTypeId;

          if(!integrationTypeId[typeId]) {
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

  async fetchShopifyShopsCarrierShipments({commit}) {
    let shopifyShopsCarrierShipments;
    try {
      const resp = await NetSuiteService.fetchShopifyShopsCarrierShipments({ pageSize: 100 });

      if(!hasError(resp)) {
        shopifyShopsCarrierShipments = resp.data.reduce((shipmentMethods: any, shipmentMethod: any) => {
          shipmentMethods[shipmentMethod.shipmentMethodTypeId] = {
            carrierPartyId: shipmentMethod.carrierPartyId,
            shopifyShippingMethod: shipmentMethod.shopifyShippingMethod,
          };
          return shipmentMethods;
        }, {});
      } else {
        throw resp.data;
      }
    } catch(error: any) {
      logger.error(error);
    }
    commit(types.NET_SUITE_SHOPIFY_SHOPS_CARRIER_SHIPMENTS_UPDATED, shopifyShopsCarrierShipments);
  },

  async fetchShopifyShopLocation({commit}) {
    let resp, shopifyShopLocations;
    try {
      resp = await NetSuiteService.fetchShopifyShopLocation({ pageSize: 100 });
      if(!hasError(resp)) {
        shopifyShopLocations = resp.data.reduce((shopifyShop: any, shopifyShopLocation: any) => {
          shopifyShop[shopifyShopLocation.facilityId] = shopifyShopLocation.shopifyLocationId
          return shopifyShop;
        }, {});
      } else {
        throw resp.data;
      }
    } catch(error: any) {
      logger.error(error);
    }
    commit(types.NET_SUITE_SHOPIFY_SHOPS_LOCATIONS_UPDATED, shopifyShopLocations);
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
      if(!hasError(resp) && resp.data) {
        const responseData = resp.data
        shopifyTypeMappings = responseData.reduce((mappedTypeId: any, shopifyTypeMappings: any) => {
          const typeId = shopifyTypeMappings.mappedTypeId;
          
          if(!mappedTypeId[typeId]) {
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