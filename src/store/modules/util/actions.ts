import { ActionTree } from "vuex"
import RootState from "@/store/RootState"
import * as types from "./mutation-types"
import { deduplicateByField, hasError, sortByProperty } from "@/utils"
import logger from "@/logger"
import UtilState from "./UtilState"
import { UtilService } from "@/services/UtilService"
import store from "@/store";

const actions: ActionTree<UtilState, RootState> = {

  async fetchFacilityGroups({ commit }) {
    let facilityGroups = [] as any, pageIndex = 0, resp;

    try {
      do {
        resp = await UtilService.fetchFacilityGroups({ pageSize: 100, pageIndex });

        if(!hasError(resp)) {
          facilityGroups = facilityGroups.concat(resp.data);
        } else {
          throw resp.data;
        }
        pageIndex++;
      } while (resp.data.length >= 100);
    } catch(error: any) {
      logger.error(error);
    }
    commit(types.UTIL_FACILITY_GROUPS_UPDATED, facilityGroups);
  },
  
  async fetchFacilities({ commit }) {
    let facilities = [] as any, pageIndex = 0, resp;

    try {
      do {
        resp = await UtilService.fetchFacilities({
          facilityTypeId: "VIRTUAL_FACILITY",
          facilityTypeId_not: "Y",
          parentTypeId: "VIRTUAL_FACILITY",
          parentTypeId_not: "Y",
          pageSize: 100,
          pageIndex
        })

        if(!hasError(resp) && resp.data) {
          facilities = facilities.concat(resp.data);
          // Remove duplicates based on facilityId using util function
          facilities = deduplicateByField(facilities, 'facilityId')
          // Sort by facilityName alphabetically
          facilities = sortByProperty(facilities, 'facilityName');
        } else {
          throw resp.data
        }
        pageIndex++;
      } while (resp.data.length >= 100);
    } catch (error) {
      logger.error(error);
    }
    commit(types.UTIL_FACILITIES_UPDATED, facilities)
  },

  async fetchFacility({ commit }, facilityId: string) {
    const facilities = store.getters['util/getFacilities'];

    try {
      const resp = await UtilService.fetchFacility({ facilityId });
      if(!hasError(resp)) {
        // Update the facility's externalId in the existing facilities list
        facilities.map((facility: any) => {
          if(facility.facilityId === resp.data.facilityId) facility.externalId = resp.data.externalId;
        })
      } else {
        throw resp.data;
      }
    } catch(error: any) {
      logger.error(error);
    }
    commit(types.UTIL_FACILITIES_UPDATED, facilities)
  },
  
  async fetchDBICCountries({ commit }) {
    let countries = [] as any;

    try {
      const resp = await UtilService.fetchDBICCountries({toGeoId: "DBIC", pageSize: 200 })
      if(!hasError(resp)) {
        countries = resp.data;
      } else {
        throw resp.data;
      }
    } catch(error: any) {
      logger.error(error);
    }
    commit(types.UTIL_DBIC_COUNTRIES_UPDATED, { list: countries, total: countries.length })
  },

  async fetchOperatingCountries({ commit, state }) {
    if(state.operatingCountries.length) return;

    let operatingCountries = [] as any;

    try {
      const resp = await UtilService.fetchOperatingCountries({ pageSize: 300, geoTypeEnumId: 'GEOT_COUNTRY' })
      if(!hasError(resp)) {
        operatingCountries = resp.data;
      } else {
        throw resp.data;
      }
    } catch(error: any) {
      logger.error(error);
    }
    commit(types.UTIL_OPERATING_COUNTRIES_UPDATED, operatingCountries)
  },

  async fetchProductIdentifiers({ commit, state }) {
    if(state.productIdentifiers.length) return;

    let productIdentifiers = [] as any;

    try {
      const resp = await UtilService.fetchEnums({ enumTypeId: "SHOP_PROD_IDENTITY", pageSize: 100 })
      if(!hasError(resp)) {
        productIdentifiers = resp.data;
      } else {
        throw resp.data;
      }
    } catch(error: any) {
      logger.error(error);
    }
    commit(types.UTIL_PRODUCT_IDENTIFIERS_UPDATED, productIdentifiers)
  },

  async fetchShipmentMethodTypes({ commit, state }) {
    if(state.shipmentMethodTypes.length) return;

    let shipmentMethodTypes = [] as any, pageIndex = 0, resp;

    try {
      do {
        resp = await UtilService.fetchShipmentMethodTypes({ pageSize: 100, pageIndex });

        if(!hasError(resp)) {
          shipmentMethodTypes = shipmentMethodTypes.concat(resp.data);
        } else {
          throw resp.data;
        }
        pageIndex++;
      } while (resp.data.length >= 100);
    } catch (error: any) {
      logger.error(error);
    }
    commit(types.UTIL_SHIPMENT_METHOD_TYPES_UPDATED, shipmentMethodTypes)
  },

  async fetchOrganizationPartyId({ commit }) {
    let partyId = ""

    try {
      const resp = await UtilService.fetchOrganization({
        roleTypeId: 'INTERNAL_ORGANIZATIO',
        pageSize: 1
      })

      if(!hasError(resp)) {
        partyId = resp.data[0]?.partyId
      } else {
        throw resp.data
      }
    } catch (error) {
      logger.error(error)
    }
    commit(types.UTIL_ORGANIZATION_PARTY_ID_UPDATED, partyId)
  },

  async clearUtilState({ commit }) {
    commit(types.UTIL_CLEARED)
    commit(types.UTIL_ORGANIZATION_PARTY_ID_UPDATED, "")
  }
}

export default actions;