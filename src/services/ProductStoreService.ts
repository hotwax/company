import api from "@/api"
import logger from "@/logger";
import { hasError } from "@/utils";

const createProductStore = async (payload: any): Promise <any> => {
  return api({
    url: "productStores",
    method: "post",
    data: payload
  });
}

const fetchCurrentStoreSettings = async (productStoreId: any): Promise <any> => {
  return api({
    url: `productStores/${productStoreId}/settings`,
    method: "get"
  });
}

const fetchProductStoreDetails = async (productStoreId: any): Promise <any> => {
  return api({
    url: `productStores/${productStoreId}`,
    method: "get"
  });
}

const fetchProductStores = async (): Promise <any> => {
  return api({
    url: "productStores",
    method: "get"
  });
}

const fetchProductStoresFacilityCount = async (): Promise <any> => {
  return api({
    url: "productStores/facilities/counts",
    method: "get"
  });
}

const updateProductStore = async (payload: any): Promise <any> => {
  return api({
    url: `productStores/${payload.productStoreId}`,
    method: "post",
    data: payload
  });
}

const updateDBICCountries = async (payload: any): Promise <any> => {
  return api({
    url: "countries/dbic",
    method: "post",
    data: payload
  });
}

const fetchCompany = async (payload: any): Promise <any> => {
  return api({
    url: `organizations/${payload.partyId}`,
    method: "get",
    params: payload
  });
}

const updateCompany = async (payload: any): Promise <any> => {
  try {
    const resp = await api({
      url: `organizations/${payload.partyId}`,
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
    url: `productStores/${payload.productStoreId}/settings`,
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
  updateCompany,
  updateCurrentStoreSettings,
  updateDBICCountries,
  updateProductStore
}