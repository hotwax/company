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
    url: "oms/facilityGroups",
    method: "get",
    params: payload
  });
}

const fetchFacility = async (payload: any): Promise <any> => {
  return api({
    url: `oms/facilities/${payload.facilityId}`,
    method: "get",
    params: payload
  })
}

const fetchFacilities = async (payload: any): Promise <any> => {
  return api({
    url: "oms/facilities",
    method: "get",
    params: payload
  })
}

const updateFacility = async (payload: any): Promise <any> => {
  return api({
    url: `oms/facilities/${payload.facilityId}`,
    method: "PUT",
    data: payload
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

export const UtilService = {
  fetchDBICCountries,
  fetchEnums,
  fetchEnumGroupMember,
  addEnumToEnumGroup,
  fetchFacilityGroups,
  fetchFacility,
  fetchFacilities,
  fetchOperatingCountries,
  fetchOrganization,
  fetchShipmentMethodTypes,
  updateFacility
}