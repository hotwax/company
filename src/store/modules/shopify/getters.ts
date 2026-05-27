import { GetterTree } from 'vuex'
import ShopifyState from './ShopifyState'
import RootState from '@/store/RootState'

const getters: GetterTree <ShopifyState, RootState> = {
  getShops (state) {
    return state.shops
  },
  getCurrentShop (state) {
    return state.current
  },
  getShopById: (state) => (id: string) => {
    return state.shops.find((shop: any) => shop.shopId === id)
  },
  getShopifyTypeMappings: (state) => (mappedTypeId: string) => {
    return state.shopifyTypeMappings[mappedTypeId] ? state.shopifyTypeMappings[mappedTypeId] : [];
  },
  getShopifyShopsCarrierShipments: (state) => {
    return state.shopifyShopsCarrierShipments;
  },
  getShopifyShopsLocations: (state) => {
    return state.shopifyShopsLocations;
  },
  getFetchStatus(state) {
    return state.fetchStatus;
  }
}
export default getters;
