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


export const NetSuiteService = {
  fetchProductStoreShipmentMethods,
  fetchPaymentMethods
  
}