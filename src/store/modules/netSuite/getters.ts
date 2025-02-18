import { GetterTree } from "vuex"
import RootState from "@/store/RootState"
import NetSuiteState from "./NetSuiteState";

const getters: GetterTree <NetSuiteState, RootState> = {
  getInventoryVariances(state) {
    return state.inventoryVariances ? state.inventoryVariances : []
  },
  getProductStoreShipmentMehtods(state) {
    return state.productStoreShipmentMethods
  },
  getPaymentMehtods(state) {
    return state.paymentMethods
  },
  getSalesChannel(state) {
    return state.salesChannel
  },
  getFacilitiesIdentifications: (state) => {
    return state.facilitiesIdentifications
  },
  getEnumGroups: (state) => (enumId: any) => {
    return state.enumsInEnumGroup[enumId]
  },
  getIntegrationTypeMappings: (state) => (typeId: any) => {
    return state.integrationTypeMappings[typeId] ? state.integrationTypeMappings[typeId] : []
  },
  getShopifyTypeMappings: (state) => (typeId: any) => {
    return state.shopifyTypeMappings[typeId] ? state.shopifyTypeMappings[typeId] : []
  },
  getShopifyShopsCarrierShipments: (state) => (shipmentMethodTypeId: any) => {
    return state.shopifyShopsCarrierShipments[shipmentMethodTypeId] ? state.shopifyShopsCarrierShipments[shipmentMethodTypeId] : []
  }
}
export default getters;