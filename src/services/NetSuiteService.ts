import api from "@/api"

const fetchProductStoreShipmentMethods = async (payload: any): Promise<any> => {
  return api({
    url: `oms/productStores/${payload.productStoreId}/shipmentMethods`,
    method: "get",
    params: payload
  })
}

const fetchPaymentMethods = async (payload: any): Promise <any> => {
  return api({
    url: "admin/paymentMethodTypes",
    method: "get",
    params: payload
  });
}

const fetchfacilitiesIdentifications = async (payload: any): Promise <any> => {
  return api({
    url: "oms/facilities/identifications",
    method: "get",
    params: payload
  })
}

const updateFacilityIdentification = async (payload: any): Promise <any> => {
  return api({
    url: `oms/facilities/${payload.facilityId}/identifications`,
    method: "post",
    data: payload
  })
}

const fetchIntegrationTypeMappings = async (payload: any): Promise <any> => {
  return api({
    url: "admin/integrationTypeMappings",
    method: "get",
    params: payload
  })
}

const addIntegrationTypeMappings = async (payload: any): Promise <any> => {
  return api({
    url: "admin/integrationTypeMappings",
    method: "post",
    data: payload
  })
}

const updateIntegrationTypeMappings = async (payload: any, integrationMappingId: any): Promise <any> => {
  return api({
    url: `admin/integrationTypeMappings/${integrationMappingId}`,
    method: "post",
    data: payload
  })
}

const removeIntegrationMappingValue = async (payload: any): Promise <any> => {
  return api({
    url: `admin/integrationTypeMappings/${payload}`,
    method: "delete"
  })
}

const updateSftpConfig = async (payload: any): Promise <any> => {
  return api({
    url: "updateSftp",
    method: "post",
    data: payload
  })
}

const updateEnumCode = async (payload: any): Promise <any> => {
  return api({
    url: `admin/enums/${payload.enumId}`,
    method: "put",
    data: payload
  })
}

export const NetSuiteService = {
  addIntegrationTypeMappings,
  fetchIntegrationTypeMappings,
  fetchPaymentMethods,
  fetchProductStoreShipmentMethods,
  fetchfacilitiesIdentifications,
  removeIntegrationMappingValue,
  updateEnumCode,
  updateFacilityIdentification,
  updateIntegrationTypeMappings,
  updateSftpConfig
}