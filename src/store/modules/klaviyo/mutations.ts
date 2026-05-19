import { MutationTree } from "vuex";
import KlaviyoState from "./KlaviyoState";
import * as types from "./mutation-types";

const mutations: MutationTree<KlaviyoState> = {
  [types.KLAVIYO_UNIGATE_CONFIG_UPDATED](state, payload) {
    state.unigateConfig = payload;
    state.hasCheckedUnigate = true;
  },
  [types.KLAVIYO_CONNECTIONS_UPDATED](state, payload) {
    state.connections = Array.isArray(payload) ? payload : [];
  },
  [types.KLAVIYO_CURRENT_UPDATED](state, payload) {
    state.current = payload || null;
  },
  [types.KLAVIYO_CONFIGS_UPDATED](state, payload) {
    state.configs = Array.isArray(payload) ? payload : [];
  },
  [types.KLAVIYO_EMAIL_SETTINGS_UPDATED](state, payload) {
    state.emailSettings = Array.isArray(payload) ? payload : [];
  },
  [types.KLAVIYO_FETCH_STATUS_UPDATED](state, payload) {
    state.fetchStatus = { ...state.fetchStatus, ...payload };
  },
  [types.KLAVIYO_CLEARED](state) {
    state.unigateConfig = null;
    state.hasCheckedUnigate = false;
    state.connections = [];
    state.current = null;
    state.configs = [];
    state.emailSettings = [];
    state.fetchStatus = {
      unigate: "none",
      connections: "none",
      configs: "none",
      emailSettings: "none",
      lastFetched: 0,
    };
  },
};

export default mutations;
