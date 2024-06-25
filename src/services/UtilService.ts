import api, {client} from "@/api";

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

  return await client({
    url: `${process.env.VUE_APP_SPACE_ID}/search/ask`, 
    method: "post",
    baseURL: process.env.VUE_APP_GITBOOK_BASE_URL,
    data: {
      "query": payload.queryString
    },
    headers: {
      Authorization:  'Bearer ' + token,
      "Content-Type": "application/json"
    }
  }) as any;
}

const getGitBookPage = async (pageId: any): Promise <any> => {
  const token = process.env.VUE_APP_GITBOOK_API_KEY;

  return await client({
    url: `${process.env.VUE_APP_SPACE_ID}/content/page/${pageId}`, 
    method: "get",
    baseURL: process.env.VUE_APP_GITBOOK_BASE_URL,
    headers: {
      Authorization:  'Bearer ' + token,
      "Content-Type": "application/json"
    }
  }) as any;
}

const searchQuery = async (payload: any): Promise <any> => {
  const token = process.env.VUE_APP_GITBOOK_API_KEY;

  return await client({
    url: `${process.env.VUE_APP_SPACE_ID}/search`, 
    method: "get",
    baseURL: process.env.VUE_APP_GITBOOK_BASE_URL,
    params: {
      "query": payload.queryString
    },
    headers: {
      Authorization:  'Bearer ' + token,
      "Content-Type": "application/json"
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
  getGitBookPage,
  searchQuery
}