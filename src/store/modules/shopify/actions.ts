import { ActionTree } from 'vuex'
import RootState from "@/store/RootState"
import ShopifyState from "./ShopifyState"
import * as types from "./mutation-types"
import { ShopifyService } from "@/services/ShopifyService"
import { hasError } from "@/utils"
import logger from "@/logger"

const actions: ActionTree<ShopifyState, RootState> = {
  async fetchShopifyShops({ commit }) {
    commit(types.SHOPIFY_FETCH_STATUS_UPDATED, { shops: 'pending' })
    let shops = [];
    try {
      const resp = await ShopifyService.fetchShopifyShops({ pageSize: 100 });
      if (!hasError(resp) && resp.data) {
        shops = resp.data;
        commit(types.SHOPIFY_FETCH_STATUS_UPDATED, { shops: 'success', lastFetched: Date.now() })
      } else {
        throw resp.data;
      }
    } catch (error) {
      logger.error(error);
      commit(types.SHOPIFY_FETCH_STATUS_UPDATED, { shops: 'error' })
    }
    commit(types.SHOPIFY_SHOPS_UPDATED, shops);
  },

  updateCurrentShop({ commit }, shop) {
    commit(types.SHOPIFY_CURRENT_UPDATED, shop);
  },

  async fetchShopifyShopsCarrierShipments({ commit }, payload: any = {}) {
    let shopifyShopsCarrierShipments = {} as any, pageIndex = 0, resp;

    try {
      do {
        const params = {
          ...payload,
          pageSize: 100,
          pageIndex
        }

        resp = await ShopifyService.fetchShopifyShopsCarrierShipments(params)

        if(!hasError(resp)) {
          const newShipments = resp.data.reduce((shipmentMethods: any, shipmentMethod: any) => {
            shipmentMethods[`${shipmentMethod.carrierPartyId}_${shipmentMethod.shipmentMethodTypeId}`] = {
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
    commit(types.SHOPIFY_SHOPS_CARRIER_SHIPMENTS_UPDATED, shopifyShopsCarrierShipments);
  },

  async fetchShopifyShopLocations({ commit }) {
    let shopifyShopLocations = {} as any, pageIndex = 0, resp;

    try {
      do {
        const payload = {
          pageSize: 100,
          pageIndex
        }

        resp = await ShopifyService.fetchShopifyShopLocations(payload)

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
    commit(types.SHOPIFY_SHOPS_LOCATIONS_UPDATED, shopifyShopLocations);
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

        resp = await ShopifyService.fetchShopifyTypeMappings(payload)
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
    commit(types.SHOPIFY_TYPE_MAPPINGS_UPDATED, shopifyTypeMappings)
  },

  async clearShopifyState({ commit }) {
    commit(types.SHOPIFY_CLEARED);
  }
}

export default actions;
