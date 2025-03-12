import api from "@/api"
import logger from "@/logger";
import { hasError } from "@/utils";

const createProductStore = async (payload: any): Promise <any> => {
  return api({
    url: "oms/productStores",
    method: "post",
    data: payload
  });
}

const fetchCurrentStoreSettings = async (productStoreId: any): Promise <any> => {
  return api({
    url: `oms/productStores/${productStoreId}/settings`,
    method: "get"
  });
}

const fetchProductStoreDetails = async (productStoreId: any): Promise <any> => {
  return api({
    url: `oms/productStores/${productStoreId}`,
    method: "get"
  });
}

const fetchProductStores = async (payload: any): Promise <any> => {
  return api({
    url: "oms/productStores",
    method: "get",
    params: payload
  });
}

const fetchProductStoresFacilityCount = async (payload: any): Promise <any> => {
  return api({
    url: "oms/productStores/facilities/counts",
    method: "get",
    params: payload
  });
}

const fetchProductStoresShipmentMethodCount = async (payload: any): Promise <any> => {
  return api({
    url: "oms/productStores/shipmentMethods/counts",
    method: "get",
    params: payload
  });
}

const updateProductStore = async (payload: any): Promise <any> => {
  return api({
    url: `oms/productStores/${payload.productStoreId}`,
    method: "put",
    data: payload
  });
}

const addDBICCountries = async (payload: any): Promise <any> => {
  return api({
    url: "admin/geos/assocs",
    method: "post",
    data: payload
  });
}

const fetchCompany = async (payload: any): Promise <any> => {
  return api({
    url: `admin/organizations/${payload.partyId}`,
    method: "get",
    params: payload
  });
}

const updateCompany = async (payload: any): Promise <any> => {
  try {
    const resp = await api({
      url: `admin/organizations/${payload.partyId}`,
      method: "post",
      data: payload
    }) as any;

    if(hasError(resp)) {
      return Promise.resolve(resp.data);
    } else {
      throw resp.data;
    }
  } catch(error: any) {
    logger.error(error);
    return Promise.resolve({});
  }
}

const updateCurrentStoreSettings = async (payload: any): Promise <any> => {
  return api({
    url: `oms/productStores/${payload.productStoreId}/settings`,
    method: "post",
    data: payload
  });
}

export const ProductStoreService = {
  createProductStore,
  fetchCompany,
  fetchCurrentStoreSettings,
  fetchProductStoreDetails,
  fetchProductStores,
  fetchProductStoresFacilityCount,
  fetchProductStoresShipmentMethodCount,
  updateCompany,
  updateCurrentStoreSettings,
  addDBICCountries,
  updateProductStore
}