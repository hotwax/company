import api from "@/api"

const fetchOperatingCountries = async (payload: any): Promise <any>  => {
  return api({
    url: "countries",
    method: "get",
    params: payload
  });
}

const fetchDBICCountries = async (payload: any): Promise <any>  => {
  return api({
    url: "countries/dbic",
    method: "get",
    params: payload
  });
}

export const UtilService = {
  fetchDBICCountries,
  fetchOperatingCountries
}