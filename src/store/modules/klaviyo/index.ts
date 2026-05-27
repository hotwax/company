import { Module } from "vuex";
import KlaviyoState from "./KlaviyoState";
import RootState from "@/store/RootState";
import mutations from "./mutations";
import getters from "./getters";
import actions from "./actions";

const klaviyoModule: Module<KlaviyoState, RootState> = {
  namespaced: true,
  state: {
    unigateConfig: null,
    hasCheckedUnigate: false,
    connections: [],
    current: null,
    configs: [],
    emailSettings: [],
    fetchStatus: {
      unigate: "none",
      connections: "none",
      configs: "none",
      emailSettings: "none",
      lastFetched: 0,
    },
  },
  getters,
  actions,
  mutations,
};

export default klaviyoModule;
