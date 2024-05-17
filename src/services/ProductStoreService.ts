import api from "@/api"

const fetchProductStores = async (): Promise <any>  => {
  return api({
    url: "productStores",
    method: "get"
  });
}

const fetchProductStoresFacilityCount = async (): Promise <any>  => {
  return api({
    url: "productStores/facilities/counts",
    method: "get"
  });
}

const fetchProductStoreDetails = async (productStoreId: any): Promise <any>  => {
  return api({
    url: `productStores/${productStoreId}`,
    method: "get"
  });
}

const fetchCurrentStoreSettings = async (productStoreId: any): Promise <any>  => {
  return api({
    url: `productStores/${productStoreId}/settings`,
    method: "get"
  });
}

const updateProductStore = async (payload: any): Promise <any>  => {
  return api({
    url: `productStores/${payload.productStoreId}`,
    method: "post",
    data: payload
  });
}

export const ProductStoreService = {
  fetchCurrentStoreSettings,
  fetchProductStoreDetails,
  fetchProductStores,
  fetchProductStoresFacilityCount,
  updateProductStore
}