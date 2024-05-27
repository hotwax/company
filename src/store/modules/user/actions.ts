import { UserService } from "@/services/UserService"
import { ActionTree } from "vuex"
import RootState from "@/store/RootState"
import UserState from "./UserState"
import * as types from "./mutation-types"
import { showToast } from "@/utils"
import { translate } from "@/i18n"
import logger from "@/logger"
import emitter from "@/event-bus"
import { Settings } from "luxon"

const actions: ActionTree<UserState, RootState> = {

  /**
  * Login user and return token
  */
  async login({ commit }, { username, password }) {
    try {
      if(!username.length || !password.length) {
        return Promise.reject('')
      }

      emitter.emit("presentLoader", { message: "Logging in...", backdropDismiss: false })
      // TODO: implement support for permission check
      const token = await UserService.login(username, password)

      const userProfile = await UserService.getUserProfile(token);

      if (userProfile.timeZone) {
        Settings.defaultZone = userProfile.timeZone;
      }

      commit(types.USER_TOKEN_CHANGED, { newToken: token })
      commit(types.USER_INFO_UPDATED, userProfile);
      emitter.emit("dismissLoader")
      return Promise.resolve({ token })
    } catch (err: any) {
      emitter.emit("dismissLoader")
      showToast(translate(err));
      logger.error("error", err);
      return Promise.reject(new Error(err))
    }
  },

  /**
  * Logout user
  */
  async logout({ commit, dispatch }) {
    // TODO add any other tasks if need
    commit(types.USER_END_SESSION)
    this.dispatch("productStore/clearProductStoreState");
    dispatch("util/clearUtilState");

  },

  /**
  * Update user timeZone
  */
  async setUserTimeZone({ state, commit }, payload) {
    const current: any = state.current;
    // TODO: add support to change the user time on server, currently api to update user is not available
    if(current.timeZone !== payload.tzId) {
      current.timeZone = payload.tzId;
      commit(types.USER_INFO_UPDATED, current);
      Settings.defaultZone = current.timeZone;
      showToast(translate("Time zone updated successfully"));
    }
  },

  /**
  * Set User Instance Url
  */
  setUserInstanceUrl({ commit }, payload) {
    commit(types.USER_INSTANCE_URL_UPDATED, payload)
  },
}

export default actions;