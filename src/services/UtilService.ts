import api, {client} from "@/api"
import { hasError } from "@/utils";

const fetchDBICCountries = async (payload: any): Promise <any> => {
  return api({
    url: "countries/dbic",
    method: "get",
    params: payload
  });
}

const fetchFacilityGroups = async (payload: any): Promise <any> => {
  return api({
    url: "facilityGroups",
    method: "get",
    params: payload
  });
}

const fetchOperatingCountries = async (payload: any): Promise <any> => {
  return api({
    url: "countries",
    method: "get",
    params: payload
  });
}

const fetchEnums = async (payload: any): Promise <any> => {
  return api({
    url: "enums",
    method: "get",
    params: payload
  });
}

const fetchShipmentMethodTypes = async (payload: any): Promise <any> => {
  return api({
    url: "shipmentMethodTypes",
    method: "get",
    params: payload
  });
}

const askQuery = async (payload: any): Promise <any> => {
  const token = process.env.VUE_APP_GITBOOK_API_KEY;
  const baseURL = `https://api.gitbook.com/v1/spaces/${process.env.VUE_APP_SPACE_ID}/search/`

  return await client({
    url: `ask`, 
    method: "post",
    baseURL,
    data: {
      "query": payload.queryString
    },
    headers: {
      Authorization:  'Bearer ' + token,
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin":   "*"
    }
  }) as any;
}

const getGitboookPage = async (pageId: any): Promise <any> => {
  const token = process.env.VUE_APP_GITBOOK_API_KEY;
  const baseURL = `https://api.gitbook.com/v1/spaces/${process.env.VUE_APP_SPACE_ID}/`

  return await client({
    url: `content/page/${pageId}`, 
    method: "get",
    baseURL,
    headers: {
      Authorization:  'Bearer ' + token,
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin":   "*"
    }
  }) as any;
}

const searchQuery = async (payload: any): Promise <any> => {
  const token = process.env.VUE_APP_GITBOOK_API_KEY;
  const baseURL = `https://api.gitbook.com/v1/spaces/`

  return await client({
    url: `${process.env.VUE_APP_SPACE_ID}/search`, 
    method: "get",
    baseURL,
    params: {
      "query": payload.queryString
    },
    headers: {
      Authorization:  'Bearer ' + token,
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin":   "*"
    }
  }) as any;
}

export const UtilService = {
  askQuery,
  fetchDBICCountries,
  fetchEnums,
  fetchFacilityGroups,
  fetchOperatingCountries,
  fetchShipmentMethodTypes,
  getGitboookPage,
  searchQuery
}