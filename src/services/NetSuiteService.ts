import api from "@/api"


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

const fetchfacilitiesIdentifications = async (payload: any): Promise <any> => {
  return api({
    url: "facilities/identifications",
    method: "get",
    params: payload
  })
}

const updateFacilityIdentification = async (payload: any): Promise <any> => {
  return api({
    url: "facilities/identifications",
    method: "post",
    data: payload
  })
}

const fetchIntegrationTypeMappings = async (payload: any): Promise <any> => {
  return api({
    url: "integrationTypeMappings",
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

const fetchShopifyTypeMappings = async (payload: any): Promise <any> => {
  return api({
    url: "shopifyShops/typeMappings",
    method: "get",
    params: payload
  })
}

const removeIntegrationMappingValue = async (payload: any): Promise <any> => {
  return api({
    url: `integrationTypeMappings/${payload}`,
    method: "delete"
  })
}

// TODO: need to add dynamic api to update the sftp configs.
const updateSftpConfig = async (payload: any): Promise <any> => {
  return api({
    url: "updateSftp",
    method: "post",
    data: payload
  })
}

const addEnumCode = async (payload: any): Promise <any> => {
  return api({
    url: "enums",
    method: "post",
    data: payload
  })
}


export const NetSuiteService = {
  addEnumCode,
  addIntegrationTypeMappings,
  fetchIntegrationTypeMappings,
  fetchPaymentMethods,
  fetchProductStoreShipmentMethods,
  fetchShopifyTypeMappings,
  fetchfacilitiesIdentifications,
  removeIntegrationMappingValue,
  updateFacilityIdentification,
  updateIntegrationTypeMappings,
  updateSftpConfig
}