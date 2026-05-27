export default interface UtilState {
  facilityGroups: any;
  facilities: any[];
  operatingCountries: any;
  dbicCountries: any;
  productIdentifiers: any;
  shipmentMethodTypes: any;
  emailTypes: any[];
  organizationPartyId: string;
  statusItems: any;
  maargInfo: any;
  fetchStatus: {
    facilities: string;
    statuses: string;
    organizationPartyId: string;
    facilityGroups: string;
    dbicCountries: string;
    operatingCountries: string;
    productIdentifiers: string;
    shipmentMethodTypes: string;
    emailTypes: string;
    maargInfo: string;
    lastFetched: number;
  };
}