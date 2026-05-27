export default interface UserState {
  token: string;
  current: object | null;
  instanceUrl: string;
  omsRedirectionInfo: {
    url: string;
    token: string;
  },
  permissions: any;
  fetchStatus: {
    profile: string;
    permissions: string;
    lastFetched: number;
  };
}