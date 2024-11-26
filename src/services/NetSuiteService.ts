import api from "@/api"
import logger from "@/logger";
import { hasError } from "@/utils";


const fetchProductStoreShipmentMethods = async (productStoreId: any): Promise<any> => {
  return api({
    url: `productStores/${productStoreId}/shipmentMethods`,
    method: "get",
  })
}

const fetchPaymentMethods = async (payload: any): Promise <any> => {
  return api({
    url: "paymentMethodTypes",
    method: "get",
    params: payload
  });
}

const fetchIntegrationTypeMappings = async (payload: any): Promise <any> => {
  return api({
    url: "integrationTypeMappings",
    method: "get",
    params: payload
  })
}

const fetchShopifyTypeMappings = async (payload: any): Promise <any> => {
  return api({
    url: "shopifyShops/typeMappings",
    method: "get",
    params: payload
  })
}

const addIntegrationTypeMappings = async (payload: any): Promise <any> => {
  return api({
    url: "integrationTypeMappings",
    method: "post",
    data: payload
  })
}

const updateIntegrationTypeMappings = async (payload: any, integrationMappingId: any): Promise <any> => {
  return api({
    url: `integrationTypeMappings/${integrationMappingId}`,
    method: "post",
    data: payload
  })
}

const deleteNetsuiteId = async (payload: any): Promise <any> => {
  return api({
    url: `integrationTypeMappings/${payload}`,
    method: "delete"
  })
}

export const NetSuiteService = {
  fetchProductStoreShipmentMethods,
  fetchPaymentMethods,
  fetchIntegrationTypeMappings,
  fetchShopifyTypeMappings,
  addIntegrationTypeMappings,
  updateIntegrationTypeMappings,
  deleteNetsuiteId
}