export default interface ShopifyState {
  shops: any[];
  current: any;
  shopifyTypeMappings: any;
  shopifyShopsCarrierShipments: any;
  shopifyShopsLocations: any;
  fetchStatus: {
    shops: string;
    lastFetched: number;
  };
}
