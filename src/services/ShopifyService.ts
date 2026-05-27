import api from "@/api"

const fetchShopifyShops = async (payload: any): Promise <any> => {
  return api({
    url: "admin/shopifyShops",
    method: "get",
    params: payload
  });
}

const updateShopifyShop = async (payload: any): Promise <any> => {
  return api({
    url: `oms/shopifyShops/shops/${payload.shopId}`,
    method: "put",
    data: payload
  });
}

const fetchShopifyTypeMappings = async (payload: any): Promise <any> => {
  return api({
    url: "oms/shopifyShops/typeMappings",
    method: "get",
    params: payload
  })
}

const createShopifyShopTypeMapping = async (payload: any): Promise <any> => {
  return api({
    url: "oms/shopifyShops/typeMappings",
    method: "post",
    data: payload
  })
}

const deleteShopifyShopTypeMapping = async (payload: any): Promise <any> => {
  return api({
    url: "oms/shopifyShops/typeMappings",
    method: "delete",
    data: payload
  })
}

const fetchShopifyShopsCarrierShipments = async (payload: any): Promise <any> => {
  return api({
    url: "oms/shopifyShops/carrierShipments",
    method: "get",
    params: payload
  })
}

const createShopifyShopCarrierShipment = async (payload: any): Promise <any> => {
  return api({
    url: "oms/shopifyShops/carrierShipments",
    method: "post",
    data: payload
  })
}

const updateShopifyShopCarrierShipment = async (payload: any): Promise <any> => {
  return api({
    url: `oms/shopifyShops/carrierShipments`,
    method: "post",
    data: payload
  })
}

const deleteShopifyShopCarrierShipment = async (payload: any): Promise <any> => {
  return api({
    url: "oms/shopifyShops/carrierShipments",
    method: "delete",
    data: payload
  })
}

const fetchShopifyShopLocations = async (payload: any): Promise <any> => {
  return api({
    url: "oms/shopifyShops/locations",
    method: "get",
    params: payload
  })
}

const createShopifyShopLocation = async (payload: any): Promise <any> => {
  return api({
    url: "oms/shopifyShops/locations",
    method: "post",
    data: payload
  })
}

const deleteShopifyShopLocation = async (payload: any): Promise <any> => {
  return api({
    url: "oms/shopifyShops/locations",
    method: "delete",
    data: payload
  })
}

export const ShopifyService = {
  createShopifyShopCarrierShipment,
  createShopifyShopLocation,
  createShopifyShopTypeMapping,
  deleteShopifyShopCarrierShipment,
  deleteShopifyShopLocation,
  deleteShopifyShopTypeMapping,
  fetchShopifyShops,
  fetchShopifyTypeMappings,
  fetchShopifyShopsCarrierShipments,
  fetchShopifyShopLocations,
  updateShopifyShop,
  updateShopifyShopCarrierShipment
}
