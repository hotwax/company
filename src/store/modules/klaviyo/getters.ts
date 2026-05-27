import { GetterTree } from "vuex";
import KlaviyoState from "./KlaviyoState";
import RootState from "@/store/RootState";

const getters: GetterTree<KlaviyoState, RootState> = {
  getUnigateConfig(state) {
    return state.unigateConfig;
  },
  hasUnigateConfig(state) {
    return !!state.unigateConfig;
  },
  hasCheckedUnigate(state) {
    return state.hasCheckedUnigate;
  },
  getConnections(state) {
    return state.connections;
  },
  // Klaviyo-only filtered list. The OMS endpoint returns every comm gateway
  // auth for the tenant; the UI scopes itself to KLAVIYO.
  getKlaviyoConnections(state) {
    return state.connections.filter((c: any) => c?.commGatewayConfigId === "KLAVIYO");
  },
  getConnectionById: (state) => (commGatewayAuthId: string) => {
    return state.connections.find((c: any) => c?.commGatewayAuthId === commGatewayAuthId) || null;
  },
  getCurrent(state) {
    return state.current;
  },
  getEmailSettings(state) {
    return state.emailSettings;
  },
  getEmailSettingsForGateway: (state) => (commGatewayAuthId: string) => {
    return state.emailSettings.filter((s: any) => s?.gatewayAuthId === commGatewayAuthId);
  },
  getEmailSettingsForStore: (state) => (productStoreId: string) => {
    return state.emailSettings.filter((s: any) => s?.productStoreId === productStoreId);
  },
  // Returns a count keyed by gatewayAuthId — useful to surface "X events
  // configured" badges on the connection list.
  getEventCountByGateway(state) {
    return state.emailSettings.reduce((acc: Record<string, number>, setting: any) => {
      const id = setting?.gatewayAuthId;
      if (!id) return acc;
      acc[id] = (acc[id] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  },
  getFetchStatus(state) {
    return state.fetchStatus;
  },
  isKlaviyoConfigAvailable(state) {
    return state.configs.some((c: any) => c?.commGatewayConfigId === "KLAVIYO");
  },
};

export default getters;
