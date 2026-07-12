import { defineStore } from "pinia";
import { DateTime } from "luxon";
import { api, commonUtil, logger } from "@common";

export type CarrierRecord = {
  partyId: string;
  groupName?: string;
  roleTypeId?: string;
  shipmentMethodCount?: number;
};

type FetchStatus = "none" | "pending" | "success" | "error";

const dataDocumentValues = (response: any) => response?.data?.entityValueList || [];

export const useCarrierStore = defineStore("carrier", {
  state: () => ({
    carriers: [] as CarrierRecord[],
    current: null as CarrierRecord | null,
    shipmentMethodTypes: [] as any[],
    carrierShipmentMethods: [] as any[],
    facilities: [] as any[],
    facilityAssociations: [] as any[],
    productStores: [] as any[],
    productStoreShipmentMethods: [] as any[],
    shipmentGatewayConfigs: [] as any[],
    gatewayConfigAvailable: false,
    fetchStatus: {
      carriers: "none" as FetchStatus,
      detail: "none" as FetchStatus,
      lastFetched: 0,
    },
  }),

  getters: {
    getCarriers: (state) => state.carriers,
    getCurrent: (state) => state.current,
    getShipmentMethodTypes: (state) => state.shipmentMethodTypes,
    getCarrierShipmentMethods: (state) => state.carrierShipmentMethods,
    getFacilities: (state) => state.facilities,
    getFacilityAssociationIds: (state) => new Set(state.facilityAssociations.map((item: any) => item.facilityId)),
    getProductStores: (state) => state.productStores,
    getProductStoreShipmentMethods: (state) => state.productStoreShipmentMethods,
    getShipmentGatewayConfigs: (state) => state.shipmentGatewayConfigs,
    getFetchStatus: (state) => state.fetchStatus,
  },

  actions: {
    async fetchCarriers() {
      this.fetchStatus = { ...this.fetchStatus, carriers: "pending" };
      const carriers: CarrierRecord[] = [];
      let pageIndex = 0;
      let page: CarrierRecord[] = [];

      try {
        do {
          const response: any = await api({
            url: "oms/shippingGateways/carrierShipmentMethods/counts",
            method: "get",
            params: {
              roleTypeId: "CARRIER",
              partyTypeId: "PARTY_GROUP",
              pageIndex,
              pageSize: 250,
              orderByField: "groupName",
            },
          });
          if (commonUtil.hasError(response)) throw response.data;
          page = Array.isArray(response.data) ? response.data : [];
          carriers.push(...page);
          pageIndex += 1;
        } while (page.length >= 250);

        this.carriers = carriers;
        this.fetchStatus = { ...this.fetchStatus, carriers: "success", lastFetched: Date.now() };
        return carriers;
      } catch (error) {
        logger.error("Failed to fetch carriers", error);
        this.carriers = [];
        this.fetchStatus = { ...this.fetchStatus, carriers: "error" };
        return [];
      }
    },

    async fetchDataDocument(dataDocumentId: string, customParametersMap: Record<string, any>) {
      const response: any = await api({
        url: "oms/dataDocumentView",
        method: "post",
        data: {
          dataDocumentId,
          filterByDate: true,
          customParametersMap: {
            ...customParametersMap,
            pageIndex: 0,
            pageSize: 250,
          },
        },
      });
      if (commonUtil.hasError(response)) throw response.data;
      return dataDocumentValues(response);
    },

    async fetchCarrierDetail(partyId: string) {
      this.fetchStatus = { ...this.fetchStatus, detail: "pending" };
      try {
        const gatewayConfigsRequest = api({
          url: "oms/shippingGateways/config",
          method: "get",
          params: { pageSize: 100 },
        }).catch(() => null);

        const [
          carrierResponse,
          shipmentMethodsResponse,
          carrierMethodsResponse,
          facilitiesResponse,
          productStoresResponse,
          facilityAssociations,
          productStoreShipmentMethods,
          gatewayConfigsResponse,
        ]: any[] = await Promise.all([
          api({
            url: "oms/shippingGateways/carrierShipmentMethods/counts",
            method: "get",
            params: { roleTypeId: "CARRIER", partyId, pageIndex: 0, pageSize: 1 },
          }),
          api({
            url: "oms/shippingGateways/shipmentMethodTypes",
            method: "get",
            params: { pageIndex: 0, pageSize: 250 },
          }),
          api({
            url: "oms/shippingGateways/carrierShipmentMethods",
            method: "get",
            params: { roleTypeId: "CARRIER", partyId, pageIndex: 0, pageSize: 250, orderByField: "sequenceNumber" },
          }),
          api({ url: "oms/facilities", method: "get", params: { pageSize: 250 } }),
          api({ url: "admin/productStores", method: "get", params: { pageSize: 100 } }),
          this.fetchDataDocument("FacilityCarrier", { partyId }),
          this.fetchDataDocument("ProductStoreShipmentMethod", { partyId, roleTypeId: "CARRIER" }),
          gatewayConfigsRequest,
        ]);

        const requiredResponses = [carrierResponse, shipmentMethodsResponse, carrierMethodsResponse, facilitiesResponse, productStoresResponse];
        const failed = requiredResponses.find((response: any) => commonUtil.hasError(response));
        if (failed) throw failed.data;

        this.current = carrierResponse.data?.[0] || { partyId, groupName: partyId, roleTypeId: "CARRIER" };
        this.shipmentMethodTypes = shipmentMethodsResponse.data || [];
        this.carrierShipmentMethods = carrierMethodsResponse.data || [];
        this.facilities = (facilitiesResponse.data || []).filter((facility: any) => facility.parentTypeId !== "VIRTUAL_FACILITY" && facility.facilityTypeId !== "VIRTUAL_FACILITY");
        this.productStores = productStoresResponse.data || [];
        this.facilityAssociations = facilityAssociations;
        this.productStoreShipmentMethods = productStoreShipmentMethods;
        this.gatewayConfigAvailable = Boolean(gatewayConfigsResponse && !commonUtil.hasError(gatewayConfigsResponse));
        this.shipmentGatewayConfigs = this.gatewayConfigAvailable ? gatewayConfigsResponse.data || [] : [];
        this.fetchStatus = { ...this.fetchStatus, detail: "success", lastFetched: Date.now() };
        return this.current;
      } catch (error) {
        logger.error("Failed to fetch carrier detail", error);
        this.fetchStatus = { ...this.fetchStatus, detail: "error" };
        return null;
      }
    },

    async updateCarrierName(partyId: string, groupName: string) {
      return api({
        url: `admin/organizations/${encodeURIComponent(partyId)}`,
        method: "post",
        data: { partyId, groupName },
      });
    },

    async createCarrier(partyId: string, groupName: string) {
      return api({
        url: "oms/shippingGateways/carrierParties",
        method: "post",
        data: { partyId, groupName },
      });
    },

    async setCarrierShipmentMethod(partyId: string, shipmentMethodTypeId: string, enabled: boolean) {
      return api({
        url: "oms/shippingGateways/carrierShipmentMethods",
        method: enabled ? "post" : "delete",
        data: {
          partyId,
          roleTypeId: "CARRIER",
          shipmentMethodTypeId,
          ...(enabled ? {} : { thruDate: DateTime.now().toMillis() }),
        },
      });
    },

    async updateCarrierShipmentMethod(partyId: string, shipmentMethodTypeId: string, fields: Record<string, any>) {
      return api({
        url: "oms/shippingGateways/carrierShipmentMethods",
        method: "put",
        data: { partyId, roleTypeId: "CARRIER", shipmentMethodTypeId, ...fields },
      });
    },

    async createShipmentMethod(shipmentMethod: any) {
      return api({
        url: "oms/shippingGateways/shipmentMethodTypes",
        method: "post",
        data: shipmentMethod,
      });
    },

    async renameShipmentMethod(shipmentMethodTypeId: string, description: string) {
      return api({
        url: `oms/shippingGateways/shipmentMethodTypes/${encodeURIComponent(shipmentMethodTypeId)}`,
        method: "put",
        data: { shipmentMethodTypeId, description },
      });
    },

    async saveShipmentMethodsOrder(partyId: string, shipmentMethods: any[]) {
      return Promise.all(shipmentMethods.map((shipmentMethod, index) => api({
        url: "oms/shippingGateways/carrierShipmentMethods",
        method: "put",
        data: {
          partyId,
          roleTypeId: "CARRIER",
          shipmentMethodTypeId: shipmentMethod.shipmentMethodTypeId,
          sequenceNumber: index + 1,
        },
      })));
    },

    async setFacilityAssociation(partyId: string, facility: any, enabled: boolean) {
      const existing = this.facilityAssociations.find((item: any) => item.facilityId === facility.facilityId);
      return api({
        url: `oms/facilities/${encodeURIComponent(facility.facilityId)}/parties`,
        method: enabled ? "post" : "put",
        data: {
          partyId,
          facilityId: facility.facilityId,
          roleTypeId: "CARRIER",
          ...(enabled
            ? { fromDate: DateTime.now().toMillis() }
            : { fromDate: existing?.fromDate, thruDate: DateTime.now().toMillis() }),
        },
      });
    },

    async setProductStoreShipmentMethod(productStoreId: string, shipmentMethod: any, enabled: boolean) {
      if (enabled) {
        return api({
          url: `admin/productStores/${encodeURIComponent(productStoreId)}/shipmentMethods`,
          method: "post",
          data: {
            productStoreId,
            partyId: shipmentMethod.partyId,
            roleTypeId: "CARRIER",
            shipmentMethodTypeId: shipmentMethod.shipmentMethodTypeId,
            fromDate: DateTime.now().toMillis(),
          },
        });
      }
      return api({
        url: `admin/productStores/${encodeURIComponent(productStoreId)}/shipmentMethods`,
        method: "put",
        data: { productStoreShipMethId: shipmentMethod.productStoreShipMethId, thruDate: DateTime.now().toMillis() },
      });
    },

    async updateProductStoreShipmentMethod(productStoreId: string, shipmentMethod: any, fields: Record<string, any>) {
      return api({
        url: `admin/productStores/${encodeURIComponent(productStoreId)}/shipmentMethods`,
        method: "put",
        data: { productStoreShipMethId: shipmentMethod.productStoreShipMethId, ...fields },
      });
    },

    clear() {
      this.$reset();
    },
  },
});
