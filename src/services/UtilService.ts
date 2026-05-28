import api from "@/api"

const fetchDBICCountries = async (payload: any): Promise <any> => {
  return api({
    url: "admin/geos/assocs",
    method: "get",
    params: payload
  });
}

const fetchFacilityGroups = async (payload: any): Promise <any> => {
  return api({
    url: "admin/facilityGroups",
    method: "get",
    params: payload
  });
}

const fetchFacilities = async (payload: any): Promise <any> => {
  return api({
    url: "admin/facilities",
    method: "get",
    params: payload
  })
}

const fetchOperatingCountries = async (payload: any): Promise <any> => {
  return api({
    url: "admin/geos",
    method: "get",
    params: payload
  });
}

const fetchEnums = async (payload: any): Promise <any> => {
  return api({
    url: "admin/enums",
    method: "get",
    params: payload
  });
}

const fetchEnumGroupMember = async (payload: any): Promise <any> => {
  return api({
    url: `admin/enumGroups/${payload.enumerationGroupId}/members`,
    method: "get",
    params: payload
  });
}

const addEnumToEnumGroup = async (payload: any): Promise <any> => {
  return api({
    url: `admin/enumGroups/${payload.enumerationGroupId}/members`,
    method: "post",
    data: payload
  })
}

const fetchShipmentMethodTypes = async (payload: any): Promise <any> => {
  return api({
    url: "oms/shippingGateways/shipmentMethodTypes",
    method: "get",
    params: payload
  });
}

const fetchOrganization = async (payload: any): Promise<any> => {
  return api({
    url: "admin/organizations",
    method: "get",
    params: payload
  })
}

const fetchAppsInfo = async(): Promise<any> => {
  return api({
    url: "admin/apps",
    method: "get",
    params: {
      pageSize: 250
    }
  })
}

const fetchAppVersions = async(): Promise<any> => {
  return api({
    url: "admin/appVersion",
    method: "get",
    params: {
      pageSize: 250
    }
  })
}

const updateAppVersion = async(payload: any): Promise<any> => {
  return api({
    url: "admin/appVersion",
    method: "PUT",
    data: payload
  })
}

const createAppVersion = async(payload: any): Promise<any> => {
  return api({
    url: "admin/appVersion",
    method: "POST",
    data: payload
  })
}

const removeAppVersion = async(payload: any): Promise<any> => {
  return api({
    url: "admin/appVersion",
    method: "DELETE",
    data: payload
  })
}

const fetchStatusItems = async (payload: any): Promise<any> => {
  return api({
    url: "oms/statuses",
    method: "get",
    params: payload
  })
}

const fetchCurrencies = async (payload: any): Promise<any> => {
  return api({
    url: "admin/uoms",
    method: "get",
    params: payload
  })
}

export const UtilService = {
  createAppVersion,
  fetchAppsInfo,
  fetchAppVersions,
  fetchDBICCountries,
  fetchEnums,
  fetchEnumGroupMember,
  addEnumToEnumGroup,
  fetchFacilityGroups,
  fetchFacilities,
  fetchOperatingCountries,
  fetchOrganization,
  fetchShipmentMethodTypes,
  updateAppVersion,
  fetchCurrencies,
  fetchStatusItems,
  removeAppVersion
}