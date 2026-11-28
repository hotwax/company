export interface NetSuiteOrdersSetupList {
  list: string;
  label: string;
  countField: string;
  urlPath: string;
  recordsKey: string;
  recordCountKey: string;
  title: string;
  titleOne: string;
  meaning: string;
  toRecord: (row: any) => { recordId: string; recordName?: string; recordDetail?: string; orderCount?: number; firstOrderDate?: unknown };
  addNetSuiteId?: { label: string; inputLabel: string; urlPath: string; recordIdField: string; netSuiteIdField: string };
  picksNetSuiteLocation?: boolean;
  asksNetSuiteBySku?: boolean;
}

export const LOCATION_CUSTOMER_SERVICE = "co.hotwax.netsuite.NetSuiteOrderCustomerServices.set#NetSuiteOrderCustomerFromFacility";

export const EACH_BUYER_SERVICE = "co.hotwax.netsuite.NetSuiteOrderCustomerServices.set#NetSuiteOrderCustomerFromParty";

export const CUSTOMER_POLICIES = [
  { customerServiceName: EACH_BUYER_SERVICE, label: "Each buyer gets a NetSuite customer" },
  { customerServiceName: LOCATION_CUSTOMER_SERVICE, label: "Each selling location has a common NetSuite customer" },
];

export const usesLocationCustomer = (setup?: { customerServiceName?: string }) => setup?.customerServiceName === LOCATION_CUSTOMER_SERVICE;

export const NETSUITE_ORDERS_SETUP_LISTS: Record<string, NetSuiteOrdersSetupList> = {
  products: {
    list: "products",
    asksNetSuiteBySku: true,
    label: "Products have NetSuite item ids",
    countField: "productCount",
    urlPath: "netsuite/ordersSetup/products",
    recordsKey: "products",
    recordCountKey: "productCount",
    title: "{count} products with no NetSuite id",
    titleOne: "1 product with no NetSuite id",
    meaning: "On the store's orders placed after the go-live date that NetSuite does not have. An order waits while one of its products has no NetSuite id. The product on the most orders first.",
    toRecord: (row) => ({
      recordId: row.productId,
      recordName: row.internalName || row.productId,
      recordDetail: [row.productName, row.productTypeId].filter((part) => part).join(" · "),
      orderCount: row.orderCount,
      firstOrderDate: row.firstOrderDate,
    }),
  },
  facilities: {
    list: "facilities",
    picksNetSuiteLocation: true,
    label: "Facilities have NetSuite location ids",
    countField: "facilityCount",
    urlPath: "netsuite/ordersSetup/facilities",
    recordsKey: "facilities",
    recordCountKey: "facilityCount",
    title: "{count} facilities with no NetSuite location id",
    titleOne: "1 facility with no NetSuite location id",
    meaning: "Stores and warehouses on the store's orders placed after the go-live date that NetSuite does not have. Virtual facilities are left out. The facility on the most orders first.",
    toRecord: (row) => ({
      recordId: row.facilityId,
      recordName: row.facilityName || row.facilityId,
      recordDetail: row.facilityTypeId,
      orderCount: row.orderCount,
      firstOrderDate: row.firstOrderDate,
    }),
  },
  "location-customers": {
    list: "location-customers",
    label: "Selling locations have a NetSuite customer",
    countField: "locationCustomerCount",
    urlPath: "netsuite/ordersSetup/locationCustomers",
    addNetSuiteId: {
      label: "NetSuite customer",
      inputLabel: "NetSuite customer id",
      urlPath: "netsuite/ordersSetup/locationCustomers",
      recordIdField: "facilityId",
      netSuiteIdField: "netSuiteCustomerId",
    },
    recordsKey: "facilities",
    recordCountKey: "facilityCount",
    title: "{count} selling locations with no NetSuite customer",
    titleOne: "1 selling location with no NetSuite customer",
    meaning: "Stores and shops whose orders bill to the location's common customer, on the store's orders placed after the go-live date that NetSuite does not have. An order of such a location is refused until its customer has a NetSuite id. The location on the most orders first.",
    toRecord: (row) => ({
      recordId: row.facilityId,
      recordName: row.facilityName || row.facilityId,
      orderCount: row.orderCount,
      firstOrderDate: row.firstOrderDate,
    }),
  },
};
