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
import { useAuthStore } from '@hotwax/dxp-components'
import { resetConfig, updateToken, updateInstanceUrl } from '@/adapter'
import router from '@/router'
import { getServerPermissionsFromRules, prepareAppPermissions, resetPermissions, setPermissions } from "@/authorization"
import useServiceJob from "@/composables/useServiceJob"

const actions: ActionTree<UserState, RootState> = {

  /**
  * Login user and return token
  */
  async login ({ commit, dispatch, state }, payload) {
    try {
      const { token, oms, omsRedirectionUrl } = payload;
      dispatch("setUserInstanceUrl", oms);

      // As the token is not yet set in the state passing url and token headers explicitly
      await dispatch("fetchPermissions", { url: omsRedirectionUrl, token })

      // Checking if the user has permission to access the app
      // If there is no configuration, the permission check is not enabled
      const permissionId = process.env.VUE_APP_PERMISSION_ID;
      if(permissionId) {
        // TODO Abstract this out, how token is handled should be part of the method not the callee
        const hasPermission = state.permissions.some((appPermission: any) => appPermission.action === permissionId );
        // If there are any errors or permission check fails do not allow user to login
        if (!hasPermission) {
          const permissionError = 'You do not have permission to access the app.';
          showToast(translate(permissionError));
          logger.error("error", permissionError);
          return Promise.reject(new Error(permissionError));
        }
      }

      emitter.emit("presentLoader", { message: "Logging in..." })
      const api_key = await UserService.login(token)

      await dispatch('fetchUserProfile', api_key)

      setPermissions(state.permissions);
      if(omsRedirectionUrl && token) {
        dispatch("setOmsRedirectionInfo", { url: omsRedirectionUrl, token })
      }

      updateToken(api_key);

      commit(types.USER_TOKEN_CHANGED, { newToken: api_key })
      this.dispatch('util/fetchOrganizationPartyId');
      this.dispatch('util/fetchStatusItems');
      // Fire-and-forget: callers that need the result (e.g. Klaviyo, Shopify
      // sync migration) re-dispatch and await it themselves. Swallow here so a
      // /admin/maarg failure on a brand-new session doesn't surface as an
      // unhandled rejection while the user is still in the login flow.
      this.dispatch('util/fetchMaargInfo').catch(() => { /* noop */ });
      useServiceJob().fetchJobs();
      emitter.emit("dismissLoader")

      const productStoreId = router.currentRoute.value.query.productStoreId
      if(productStoreId) {
        return `/product-store-details/${productStoreId}`;
      }
    } catch (err: any) {
      emitter.emit("dismissLoader")
      showToast(translate(err));
      logger.error("error", err);
      return Promise.reject(new Error(err))
    }
  },

  async fetchUserProfile({ commit }, api_key) {
    commit(types.USER_FETCH_STATUS_UPDATED, { profile: 'pending' })
    try {
      const resp = await UserService.getUserProfile(api_key);
      if (resp && resp.timeZone) {
        Settings.defaultZone = resp.timeZone;
      }
      commit(types.USER_INFO_UPDATED, resp);
      commit(types.USER_FETCH_STATUS_UPDATED, { profile: 'success', lastFetched: Date.now() })
    } catch (error) {
      logger.error(error)
      commit(types.USER_FETCH_STATUS_UPDATED, { profile: 'error' })
    }
  },

  async fetchPermissions({ commit }, payload) {
    commit(types.USER_FETCH_STATUS_UPDATED, { permissions: 'pending' })
    try {
      // Getting the permissions list from server
      const permissionId = process.env.VUE_APP_PERMISSION_ID;
      // Prepare permissions list
      const serverPermissionsFromRules = getServerPermissionsFromRules();
      if (permissionId) serverPermissionsFromRules.push(permissionId);

      const serverPermissions: Array<string> = await UserService.getUserPermissions({
        permissionIds: [...new Set(serverPermissionsFromRules)]
      }, payload?.url, payload.token);
      const appPermissions = prepareAppPermissions(serverPermissions);
      commit(types.USER_PERMISSIONS_UPDATED, appPermissions);
      commit(types.USER_FETCH_STATUS_UPDATED, { permissions: 'success', lastFetched: Date.now() })
    } catch (error) {
      logger.error(error)
      commit(types.USER_FETCH_STATUS_UPDATED, { permissions: 'error' })
    }
  },

  /**
  * Logout user
  */
  async logout({ commit, dispatch }) {
    emitter.emit('presentLoader', { message: 'Logging out' })

    const authStore = useAuthStore()

    // TODO add any other tasks if need
    commit(types.USER_END_SESSION)
    this.dispatch("productStore/clearProductStoreState");
    this.dispatch("util/clearUtilState");
    this.dispatch("netSuite/clearNetSuiteState");
    dispatch("setOmsRedirectionInfo", { url: "", token: "" })
    resetConfig();
    resetPermissions();
    // reset plugin state on logout
    authStore.$reset()

    emitter.emit('dismissLoader')
  },

  /**
  * Update user timeZone
  */
  async setUserTimeZone({ state, commit }, payload) {
    const current: any = state.current;
    if(current.timeZone !== payload.tzId) {
      try {
        await UserService.setUserTimeZone({
          userId: current.userId,
          timeZone: payload.tzId
        });
        current.timeZone = payload.tzId;
        commit(types.USER_INFO_UPDATED, current);
        Settings.defaultZone = current.timeZone;
        showToast(translate("Time zone updated successfully"));
      } catch (err) {
        showToast(translate("Failed to update time zone"));
        logger.error(err);
      }
    }
  },

  setOmsRedirectionInfo({ commit }, payload) {
    commit(types.USER_OMS_REDIRECTION_INFO_UPDATED, payload)
  },

  /**
  * Set User Instance Url
  */
  setUserInstanceUrl({ commit }, payload) {
    commit(types.USER_INSTANCE_URL_UPDATED, payload)
    updateInstanceUrl(payload)
  },
}

export default actions;
