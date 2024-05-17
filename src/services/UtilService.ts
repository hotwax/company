import api from "@/api"

const fetchDBICCountries = async (payload: any): Promise <any>  => {
  return api({
    url: "countries/dbic",
    method: "get",
    params: payload
  });
}

const fetchFacilityGroups = async (payload: any): Promise <any>  => {
  return api({
    url: `facilityGroups`,
    method: "get",
    params: payload
  });
}

const fetchOperatingCountries = async (payload: any): Promise <any>  => {
  return api({
    url: "countries",
    method: "get",
    params: payload
  });
}

export const UtilService = {
  fetchDBICCountries,
  fetchFacilityGroups,
  fetchOperatingCountries
}