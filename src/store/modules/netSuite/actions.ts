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
    let inventoryVariances = [] as any, pageIndex = 0, resp;
    try {
      do {
        const payload = {
          enumTypeId: "IID_REASON",
          pageSize: 100,
          pageIndex
        }

        resp = await UtilService.fetchEnums(payload)
        if(!hasError(resp)) {
          inventoryVariances = inventoryVariances.concat(resp.data)
        } else {
          throw resp.data
        }
        pageIndex++;
      } while (resp.data.length >= 100);
    } catch (err) {
      logger.error(err)
    }
    commit(types.NET_SUITE_INVENTORY_VARIANCES_UPDATED, inventoryVariances)
  },

  async fetchEnumGroupMember({ commit }) {
    let enumsInEnumGroup = {} as any, pageIndex = 0, resp;

    try {
      do {
        const payload = {
          enumerationGroupId: "NETSUITE_IIV_REASON",
          pageSize: 100,
          pageIndex
        }

        resp = await UtilService.fetchEnumGroupMember(payload)

        if(!hasError(resp) && resp.data) {
          // TODO: need to remove this filter check , after api change of not giving expired results.
          const newEnums = resp.data.filter((item: any) => !item.thruDate).reduce((enumId: any, item: any) => {
            enumId[item.enumId] = {
              fromDate: item.fromDate,
              enumerationGroupId: item.enumerationGroupId,
            };
            return enumId;
          }, {});
          // Using object spread to merge new mappings into the existing object, preserving the nested structure created by reduce()j
          enumsInEnumGroup = { ...enumsInEnumGroup, ...newEnums };
        } else {
          throw resp.data
        }
        pageIndex++;
      } while (resp.data.length >= 100);
    } catch (err) {
      logger.error(err)
    }
    commit(types.NET_SUITE_ENUM_GROUPS_UPDATED, enumsInEnumGroup)
  },

  async fetchFacilitiesIdentifications({ commit }) {
    let facilitiesIdentifications = [] as any, pageIndex = 0, resp;

    try {
      do {
        const payload = {
          facilityIdenTypeId: "ORDR_ORGN_DPT",
          pageSize: 100,
          pageIndex
        }

        resp = await NetSuiteService.fetchfacilitiesIdentifications(payload)
        if(!hasError(resp)) {
          // TODO: need to handle the case of removing the facility from the faciliyIdentofication, need to add the thruDate in the payload
          facilitiesIdentifications = facilitiesIdentifications.concat(resp.data.filter((item: any) => !item.thruDate));
        } else {
          throw resp.data
        }
        pageIndex++;
      } while (resp.data.length >= 100);
    } catch (err) {
      logger.error(err)
    }
    commit(types.NET_SUITE_FACILITIES_IDENTIFICATIONS_UPDATED, facilitiesIdentifications)
  },

  async fetchSalesChannel({ commit }) {
    let salesChannel = [] as any, pageIndex = 0, resp;

    try {
      do {
        const payload = {
          enumTypeId: "ORDER_SALES_CHANNEL",
          pageSize: 100,
          pageIndex
        }
  
        resp = await UtilService.fetchEnums(payload)
        if(!hasError(resp)) {
          salesChannel = salesChannel.concat(resp.data);
        } else {
          throw resp.data
        }
        pageIndex++;
      } while (resp.data.length >= 100);
    } catch (err) {
      logger.error(err)
    }
    commit(types.NET_SUITE_SALES_CHANNEL_UPDATED, salesChannel)
  },

  async fetchPaymentMethods({ commit }) {
    let paymentMethods = [] as any, pageIndex = 0, resp;

    try {
      do {
        const payload = {
          pageSize: 100,
          pageIndex
        }
        resp = await NetSuiteService.fetchPaymentMethods(payload);

        if(!hasError(resp)) {
          paymentMethods = paymentMethods.concat(resp.data);
        } else {
          throw resp.data;
        }
        pageIndex++;
      } while (resp.data.length >= 100);
    } catch (error) {
      logger.error(error);
    }
    commit(types.NET_SUITE_PAYMENT_METHODS_UPDATED, paymentMethods);
  },

  async fetchProductStoreShipmentMethods({ commit }) {
    let productStoreShipmentMethods = [] as any, pageIndex = 0, resp;
    
    try {
      const netSuiteProductStoreId = store.getters["productStore/getNetSuiteProductStore"]
      do {
        const payload = {
          productStoreId: netSuiteProductStoreId?.productStoreId,
          pageSize: 100,
          pageIndex
        }

        resp = await NetSuiteService.fetchProductStoreShipmentMethods(payload)

        if(!hasError(resp) && resp.data) {
          productStoreShipmentMethods = productStoreShipmentMethods.concat(resp.data)
        } else {
          throw resp.data
        }
        pageIndex++;
      } while (resp.data.length >= 100);
    } catch (error) {
      logger.error(error);
    }
    commit(types.NET_SUITE_PRODUCT_STORE_SHIPMENT_METHODS_UPDATED, productStoreShipmentMethods)
  },

  async fetchIntegrationTypeMappings({ commit }, params: any) {
    let integrationTypeMappings = {} as any, pageIndex = 0, resp;

    try {
      do {
        let payload = {
          integrationTypeId: params.integrationTypeId,
          pageSize: 100,
          pageIndex
        } as any

        if(params.mappingKey) {
          payload = {...payload, mappingKey: params.mappingKey }
        }

        resp = await NetSuiteService.fetchIntegrationTypeMappings(payload)
        if(!hasError(resp) && resp.data) {
          const responseData = resp.data
          const newIntegrationTypeMappings = responseData.reduce((integrationTypeId: any, integrationTypeMappings: any) => {
            const typeId = integrationTypeMappings.integrationTypeId;

            if(!integrationTypeId[typeId]) {
              integrationTypeId[typeId] = [];
            }

            integrationTypeId[typeId].push(integrationTypeMappings);
            return integrationTypeId;
          }, {});   
          integrationTypeMappings = { ...integrationTypeMappings, ...newIntegrationTypeMappings };
        } else {
          throw resp.data
        }
        pageIndex++;
      } while (resp.data.length >= 100);
    } catch (error) {
      logger.error(error);
    }
    commit(types.NET_SUITE_INTEGRATION_TYPE_MAPPINGS_UPDATED, integrationTypeMappings)
  },

  async fetchShopifyShopsCarrierShipments({ commit }) {
    let shopifyShopsCarrierShipments = {} as any, pageIndex = 0, resp;

    try {
      do {
        const payload = {
          pageSize: 100,
          pageIndex
        }

        resp = await NetSuiteService.fetchShopifyShopsCarrierShipments(payload)

        if(!hasError(resp)) {
          const newShipments = resp.data.reduce((shipmentMethods: any, shipmentMethod: any) => {
            shipmentMethods[shipmentMethod.shipmentMethodTypeId] = {
              carrierPartyId: shipmentMethod.carrierPartyId,
              shopifyShippingMethod: shipmentMethod.shopifyShippingMethod,
            };
            return shipmentMethods;
          }, {});
          shopifyShopsCarrierShipments = { ...shopifyShopsCarrierShipments, ...newShipments };
        } else {
          throw resp.data;
        }
        pageIndex++;
      } while (resp.data.length >= 100);
    } catch (error) {
      logger.error(error);
    }
    commit(types.NET_SUITE_SHOPIFY_SHOPS_CARRIER_SHIPMENTS_UPDATED, shopifyShopsCarrierShipments);
  },

  async fetchShopifyShopLocation({ commit }) {
    let shopifyShopLocations = {} as any, pageIndex = 0, resp;

    try {
      do {
        const payload = {
          pageSize: 100,
          pageIndex
        }

        resp = await NetSuiteService.fetchShopifyShopLocation(payload)

        if(!hasError(resp)) {
          const newshopifyShopLocations = resp.data.reduce((shopifyShop: any, shopifyShopLocation: any) => {
            shopifyShop[shopifyShopLocation.facilityId] = shopifyShopLocation.shopifyLocationId
            return shopifyShop;
          }, {});
          shopifyShopLocations = { ...shopifyShopLocations, ...newshopifyShopLocations };
        } else {
          throw resp.data;
        }
        pageIndex++;
      } while (resp.data.length >= 100);
    } catch (error: any) {
      logger.error(error);
    }
    commit(types.NET_SUITE_SHOPIFY_SHOPS_LOCATIONS_UPDATED, shopifyShopLocations);
  },

  async fetchShopifyTypeMappings({ commit }, mappedTypeId) {
    let shopifyTypeMappings = {} as any, pageIndex = 0, resp;

    try {
      do {
        const payload = {
          mappedTypeId: mappedTypeId,
          pageSize: 100,
          pageIndex
        }

        resp = await NetSuiteService.fetchShopifyTypeMappings(payload)
        if(!hasError(resp) && resp.data) {
          const responseData = resp.data
          const newShopifyTypeMappings = responseData.reduce((mappedTypeId: any, shopifyTypeMappings: any) => {
            const typeId = shopifyTypeMappings.mappedTypeId;
          
            if(!mappedTypeId[typeId]) {
              mappedTypeId[typeId] = [];
            }

            mappedTypeId[typeId].push(shopifyTypeMappings);
            return mappedTypeId;
          }, {});   
          shopifyTypeMappings = { ...shopifyTypeMappings, ...newShopifyTypeMappings };
        } else {
          throw resp.data
        }
        pageIndex++;
      } while (resp.data.length >= 100);
    } catch (error) {
      logger.error(error);
    }
    commit(types.NET_SUITE_SHOPIFY_TYPE_MAPPINGS_UPDATED, shopifyTypeMappings)
  },

  async clearNetSuiteState({ commit }) {
    commit(types.NET_SUITE_CLEARED);
  }
} 

export default actions;