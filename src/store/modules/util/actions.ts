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

  async fetchOperatingCountries({ commit }) {
    let operatingCountries = [] as any;
    let resp = {} as any;

    try {
      resp = await UtilService.fetchDBICCountries({ geoIdTo: "DBIC", pageSize: 200 })
      if(hasError(resp)) {
        throw resp.data;
      }

      const geoIds = resp.data.map((response: any) => response.geoId);

      resp = await UtilService.fetchOperatingCountries({ geoId: geoIds.join(","), geoId_op: "in", pageSize: 200 })
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