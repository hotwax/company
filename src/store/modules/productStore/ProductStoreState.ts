export default interface ProductStoreState {
  current: any;
  currentStoreSettings: any;
  productStores: any;
  company: any;
  netSuiteProductStore: any;
  fetchStatus: {
    productStores: string;
    lastFetched: number;
  };
}