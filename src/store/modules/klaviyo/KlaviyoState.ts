import type {
  CommGatewayAuth,
  CommGatewayConfig,
  ProductStoreEmailSetting,
  SystemMessageRemote,
} from "@/services/KlaviyoService";

export type FetchStatus = "none" | "pending" | "success" | "error";

export default interface KlaviyoState {
  unigateConfig: SystemMessageRemote | null;
  hasCheckedUnigate: boolean;
  connections: CommGatewayAuth[];
  current: CommGatewayAuth | null;
  configs: CommGatewayConfig[];
  emailSettings: ProductStoreEmailSetting[];
  fetchStatus: {
    unigate: FetchStatus;
    connections: FetchStatus;
    configs: FetchStatus;
    emailSettings: FetchStatus;
    lastFetched: number;
  };
}
