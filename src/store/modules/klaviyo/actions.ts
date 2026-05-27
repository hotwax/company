import { ActionTree } from "vuex";
import RootState from "@/store/RootState";
import KlaviyoState from "./KlaviyoState";
import * as types from "./mutation-types";
import { KlaviyoService } from "@/services/KlaviyoService";
import logger from "@/logger";

const actions: ActionTree<KlaviyoState, RootState> = {
  async fetchUnigateConfig({ commit }) {
    commit(types.KLAVIYO_FETCH_STATUS_UPDATED, { unigate: "pending" });
    try {
      const config = await KlaviyoService.fetchUnigateConfig();
      commit(types.KLAVIYO_UNIGATE_CONFIG_UPDATED, config);
      commit(types.KLAVIYO_FETCH_STATUS_UPDATED, { unigate: "success", lastFetched: Date.now() });
      return config;
    } catch (error) {
      logger.error(error);
      commit(types.KLAVIYO_UNIGATE_CONFIG_UPDATED, null);
      commit(types.KLAVIYO_FETCH_STATUS_UPDATED, { unigate: "error" });
      return null;
    }
  },

  async fetchConnections({ commit }) {
    commit(types.KLAVIYO_FETCH_STATUS_UPDATED, { connections: "pending" });
    try {
      const list = await KlaviyoService.fetchCommGatewayAuths();
      commit(types.KLAVIYO_CONNECTIONS_UPDATED, list);
      commit(types.KLAVIYO_FETCH_STATUS_UPDATED, { connections: "success" });
      return list;
    } catch (error) {
      logger.error(error);
      commit(types.KLAVIYO_FETCH_STATUS_UPDATED, { connections: "error" });
      return [];
    }
  },

  async fetchConfigs({ commit }) {
    commit(types.KLAVIYO_FETCH_STATUS_UPDATED, { configs: "pending" });
    try {
      const list = await KlaviyoService.fetchCommGatewayConfigs();
      commit(types.KLAVIYO_CONFIGS_UPDATED, list);
      commit(types.KLAVIYO_FETCH_STATUS_UPDATED, { configs: "success" });
      return list;
    } catch (error) {
      logger.error(error);
      commit(types.KLAVIYO_FETCH_STATUS_UPDATED, { configs: "error" });
      return [];
    }
  },

  // Fetch every email setting once. The list is small, so we don't paginate.
  async fetchAllEmailSettings({ commit }) {
    commit(types.KLAVIYO_FETCH_STATUS_UPDATED, { emailSettings: "pending" });
    try {
      const list = await KlaviyoService.fetchAllEmailSettings();
      commit(types.KLAVIYO_EMAIL_SETTINGS_UPDATED, list);
      commit(types.KLAVIYO_FETCH_STATUS_UPDATED, { emailSettings: "success" });
      return list;
    } catch (error) {
      logger.error(error);
      commit(types.KLAVIYO_FETCH_STATUS_UPDATED, { emailSettings: "error" });
      return [];
    }
  },

  setCurrent({ commit }, connection) {
    commit(types.KLAVIYO_CURRENT_UPDATED, connection);
  },

  // Convenience: load every piece of state needed for the Klaviyo screens.
  // Called from the index view's onIonViewWillEnter.
  async hydrate({ dispatch, getters }) {
    await dispatch("fetchUnigateConfig");
    if (!getters.hasUnigateConfig) return; // empty state — no point loading the rest
    // Email-type enums live in the existing util store and use admin/enums.
    await Promise.all([
      dispatch("fetchConnections"),
      dispatch("fetchConfigs"),
      dispatch("util/fetchEmailTypes", null, { root: true }),
      dispatch("fetchAllEmailSettings"),
    ]);
  },

  clear({ commit }) {
    commit(types.KLAVIYO_CLEARED);
  },
};

export default actions;
