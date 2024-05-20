import { UserService } from "@/services/UserService"
import { ActionTree } from "vuex"
import RootState from "@/store/RootState"
import * as types from "./mutation-types"
import { hasError, showToast } from "@/utils"
import { translate } from "@/i18n"
import logger from "@/logger"
import UtilState from "./UtilState"
import { UtilService } from "@/services/UtilService"

const actions: ActionTree<UtilState, RootState> = {

  async fetchFacilityGroups({ commit }) {
    let facilityGroups = [] as any;

    try {
      const resp = await UtilService.fetchFacilityGroups({ pageSize: 100 });

      if(!hasError(resp)) {
        facilityGroups = resp.data;
      } else {
        throw resp.data;
      }
    } catch(error: any) {
      logger.error(error);
    }
    commit(types.UTIL_FACILITY_GROUPS_UPDATED, facilityGroups);
  },
  
  async fetchDBICCountries({ commit }) {
    let countries = [] as any;

    try {
      const resp = await UtilService.fetchDBICCountries({ geoIdTo: "DBIC", pageSize: 200 })
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
      const resp = await UtilService.fetchOperatingCountries({ pageSize: 200 })
      if(!hasError(resp)) {
        operatingCountries = resp.data;
      } else {
        throw resp.data;
      }
    } catch(error: any) {
      logger.error(error);
    }
    commit(types.UTIL_OPERATING_COUNTRIES_UPDATED, operatingCountries)
  }
}

export default actions;