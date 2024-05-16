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

export const ProductStoreService = {
  fetchProductStoreDetails,
  fetchProductStores,
  fetchProductStoresFacilityCount
}