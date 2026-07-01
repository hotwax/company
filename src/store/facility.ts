import { defineStore } from "pinia";
import { api, commonUtil, logger, translate } from "@common";
import { DateTime } from "luxon";

export const useFacilityStore = defineStore("facility", {
  state: () => ({
    facilityQuery: {
      queryString: "",
      productStoreId: "",
      facilityTypeId: "",
      facilityGroupId: ""
    },
    facilities: {
      list: [] as any[],
      total: 0
    },
    current: {} as any,
    facilityTypes: [] as any[],
    externalMappingTypes: {} as any,
    locationTypes: {} as any,
    facilityGroupTypes: [] as any[],
    calendars: [] as any[],
    partyRoles: {} as any
  }),
  getters: {
    getFacilities: (state) => (state.facilities.list ? JSON.parse(JSON.stringify(state.facilities.list)) : []),
    getFacilityQuery: (state) => JSON.parse(JSON.stringify(state.facilityQuery)),
    isFacilitiesScrollable: (state) => state.facilities.list?.length > 0 && state.facilities.list?.length < state.facilities.total,
    getCurrent: (state) => (state.current ? JSON.parse(JSON.stringify(state.current)) : {}),
    getFacilityTypes: (state) => state.facilityTypes,
    getParentFacilityTypeId: (state) => (facilityTypeId: string) => state.facilityTypes.find((type: any) => type.facilityTypeId === facilityTypeId)?.parentTypeId,
    getExternalMappingTypes: (state) => state.externalMappingTypes,
    getLocationTypes: (state) => state.locationTypes,
    getFacilityGroupTypes: (state) => state.facilityGroupTypes,
    getCalendars: (state) => state.calendars,
    getFacilityCalendar: (state) => state.current.calendar || {},
    getPartyRoles: (state) => state.partyRoles,
    getPostalAddress: (state) => (state.current?.postalAddress ? JSON.parse(JSON.stringify(state.current.postalAddress)) : {}),
    getTelecomAndEmailAddress: (state) => state.current?.contactDetails
  },
  actions: {
    async fetchFacilities(payload: any) {
      const filters = {
        "parentFacilityTypeId": "VIRTUAL_FACILITY",
        "parentFacilityTypeId_not": "Y",
        "facilityTypeId": "VIRTUAL_FACILITY",
        "facilityTypeId_not": "Y",
      } as any;

      if (this.facilityQuery.productStoreId) {
        filters["productStoreId"] = this.facilityQuery.productStoreId;
        filters["productStoreId_op"] = "equals";
      }

      if (this.facilityQuery.facilityTypeId) {
        filters["facilityTypeId"] = this.facilityQuery.facilityTypeId;
        filters["facilityTypeId_op"] = "equals";
        delete filters["facilityTypeId_not"];
      }

      if (this.facilityQuery.queryString) {
        filters["keyword"] = this.facilityQuery.queryString;
      }

      if (this.facilityQuery.facilityGroupId) {
        filters["facilityGroupId"] = this.facilityQuery.facilityGroupId;
        filters["facilityGroupId_op"] = "equals";
      }

      const params = {
        ...filters,
        fieldsToSelect: "facilityId,facilityName,facilityTypeId,maximumOrderLimit,defaultDaysToShip,externalId,primaryFacilityGroupId,parentFacilityTypeId,closedDate,facilityTimeZone",
        ...payload
      };

      let facilities = this.facilities.list ? JSON.parse(JSON.stringify(this.facilities.list)) : [];
      let total = 0;
      let newFacilities: any[] = [];

      try {
        const resp = await api({
          url: "oms/facilities/facilityView",
          method: "get",
          params
        });
        if (!commonUtil.hasError(resp) && resp.data.count > 0) {
          newFacilities = resp.data.facilities.map((facility: any) => ({
            ...facility,
            orderLimitType: facility.maximumOrderLimit === 0 ? "no-capacity" : (facility.maximumOrderLimit ? "custom" : "unlimited"),
            isEnriched: false
          }));
          if (payload.pageIndex && payload.pageIndex > 0) {
            facilities = facilities.concat(newFacilities);
          } else {
            facilities = newFacilities;
          }
          total = resp.data.count;
        } else {
          throw resp.data;
        }
      } catch (error) {
        logger.error(error);
        if (payload.pageIndex === 0) {
          facilities = [];
          total = 0;
        }
      }

      this.facilities = { list: facilities, total };

      if (newFacilities.length) {
        await this.fetchFacilitiesAdditionalInformation(newFacilities);
      }
    },
    async fetchFacilityOrderCounts(facilityIds: string[]) {
      let orderCounts = {} as any;
      try {
        const resp = await api({
          url: "admin/facilities/orderCount",
          method: "get",
          params: {
            facilityId: facilityIds,
            facilityId_op: "in",
            entryDate: DateTime.now().toFormat("yyyy-MM-dd"),
            pageSize: facilityIds.length
          }
        });
        if (!commonUtil.hasError(resp) && resp.data?.length) {
          orderCounts = resp.data.reduce((acc: any, item: any) => {
            acc[item.facilityId] = item.lastOrderCount;
            return acc;
          }, {});
        }
      } catch (error) {
        logger.error(error);
      }
      return orderCounts;
    },
    async fetchFacilityGroupMemberships(facilityIds: string[]) {
      const groupsByFacility = {} as any;
      const responses = await Promise.all(facilityIds.map((facilityId: string) =>
        api({ url: `oms/facilities/${facilityId}/groups`, method: "get", params: { pageNoLimit: true } })
          .then((resp: any) => ({ facilityId, resp }))
          .catch((error: any) => ({ facilityId, error }))
      ));
      responses.forEach((result: any) => {
        if (result.resp && !commonUtil.hasError(result.resp)) {
          groupsByFacility[result.facilityId] = result.resp.data || [];
        } else {
          if (result.error) logger.error(result.error);
          groupsByFacility[result.facilityId] = [];
        }
      });
      return groupsByFacility;
    },
    async fetchFacilitiesAdditionalInformation(facilities: any[]) {
      const facilityIds = facilities.map((facility: any) => facility.facilityId);

      const [orderCounts, groupsByFacility] = await Promise.all([
        this.fetchFacilityOrderCounts(facilityIds),
        this.fetchFacilityGroupMemberships(facilityIds)
      ]);

      const enrichedById = facilities.reduce((acc: any, facility: any) => {
        const groupInformation = groupsByFacility[facility.facilityId] || [];
        acc[facility.facilityId] = {
          ...facility,
          orderCount: orderCounts[facility.facilityId] || 0,
          groupInformation,
          sellOnline: groupInformation.some((group: any) => group.facilityGroupTypeId === "CHANNEL_FAC_GROUP"),
          isEnriched: true
        };
        return acc;
      }, {});

      const currentList = this.facilities.list ? JSON.parse(JSON.stringify(this.facilities.list)) : [];
      const updatedList = currentList.map((facility: any) => enrichedById[facility.facilityId] || facility);
      this.facilities = { list: updatedList, total: this.facilities.total };
    },
    async updateFacility(payload: any) {
      return api({ url: `oms/facilities/${payload.facilityId}`, method: "put", data: payload });
    },
    async updateFacilityTimeZone(payload: { facilityId: string; facilityTimeZone: string }) {
      return api({ url: `oms/facilities/${payload.facilityId}`, method: "put", data: payload });
    },
    async updateDefaultDaysToShip(payload: { facilityId: string; defaultDaysToShip: string | number }) {
      return api({ url: `oms/facilities/${payload.facilityId}`, method: "put", data: payload });
    },
    async fetchFacilityOrderCountHistory(facilityId: string) {
      return api({ url: "oms/facilities/facilityOrderCounts", method: "get", params: { facilityId, orderByField: "entryDate DESC", pageSize: 10 } });
    },
    async fetchFacilityLogins(payload: { facilityId: string }) {
      let facilityLogins = [] as any[];
      try {
        const resp = await api({ url: `oms/facilities/${payload.facilityId}/logins`, method: "get" });
        if (!commonUtil.hasError(resp) && resp.data?.facilityLogins?.length) {
          facilityLogins = resp.data.facilityLogins;
        }
      } catch (err) {
        logger.error("Failed to fetch facility logins", err);
      }
      this.current.facilityLogins = facilityLogins;
    },
    async addFacilityToGroup(payload: any) {
      return api({ url: `oms/facilities/${payload.facilityId}/groups`, method: "post", data: payload });
    },
    async updateFacilityToGroup(payload: any) {
      return api({ url: `oms/facilities/${payload.facilityId}/groups/${payload.facilityGroupId}`, method: "put", data: payload });
    },
    updateFacilities(facilities: any[]) {
      this.facilities = { list: facilities, total: facilities.length };
    },
    async updateFacilityGroupAssociation(currentFacility: any, facilityGroup: any, isChecked: boolean) {
      try {
        let resp, successMessage;
        if (isChecked) {
          resp = await this.addFacilityToGroup({
            facilityId: currentFacility.facilityId,
            facilityGroupId: facilityGroup.facilityGroupId
          });
          successMessage = translate("is now selling on", { facilityName: currentFacility.facilityName, facilityGroupId: facilityGroup.facilityGroupName });
        } else {
          const groupInformation = currentFacility.groupInformation.find((group: any) => group.facilityGroupId === facilityGroup.facilityGroupId);
          resp = await this.updateFacilityToGroup({
            facilityId: currentFacility.facilityId,
            facilityGroupId: facilityGroup.facilityGroupId,
            fromDate: groupInformation.fromDate,
            thruDate: DateTime.now().toMillis()
          });
          successMessage = translate("no longer sells on", { facilityName: currentFacility.facilityName, facilityGroupId: facilityGroup.facilityGroupName });
        }
        if (!commonUtil.hasError(resp)) {
          commonUtil.showToast(successMessage);
          const groupsByFacility = await this.fetchFacilityGroupMemberships([currentFacility.facilityId]);
          const updatedGroupInformation = groupsByFacility[currentFacility.facilityId] || [];
          const updatedFacilities = this.getFacilities.map((facility: any) => {
            if (facility.facilityId === currentFacility.facilityId) {
              facility.groupInformation = updatedGroupInformation;
              facility.sellOnline = updatedGroupInformation.some((group: any) => group.facilityGroupTypeId === "CHANNEL_FAC_GROUP");
            }
            return facility;
          });
          this.updateFacilities(updatedFacilities);
        } else {
          throw resp.data;
        }
      } catch (err) {
        commonUtil.showToast(translate("Failed to update sell inventory online setting"));
        logger.error("Failed to update sell inventory online setting", err);
      }
    },
    updateFacilityQuery(query: any) {
      this.facilityQuery = query;
    },
    clearFacilityState() {
      this.facilityQuery = { queryString: "", productStoreId: "", facilityTypeId: "", facilityGroupId: "" };
      this.facilities = { list: [], total: 0 };
      this.current = {};
    },
    async fetchCurrentFacility(payload: { facilityId: string }) {
      let facility = {} as any;
      try {
        const resp = await api({ url: `oms/facilities/${payload.facilityId}`, method: "get" });
        if (!commonUtil.hasError(resp)) {
          facility = resp.data;
          facility.orderLimitType = facility.maximumOrderLimit === 0 ? "no-capacity" : (facility.maximumOrderLimit ? "custom" : "unlimited");
          const orderCounts = await this.fetchFacilityOrderCounts([facility.facilityId]);
          facility.orderCount = orderCounts[facility.facilityId] || 0;
        } else {
          throw resp.data;
        }
      } catch (error) {
        logger.error(error);
      }
      this.current = facility;
    },
    updateCurrentFacility(facility: any) {
      this.current = facility;
    },
    async fetchFacilityContactDetailsAndTelecom(payload: { facilityId: string }) {
      let postalAddress = {} as any;
      const contactDetails = {} as any;
      try {
        const resp = await api({ url: "oms/facilityContactMechs", method: "get", params: { facilityId: payload.facilityId, pageNoLimit: true } });
        if (!commonUtil.hasError(resp) && resp.data?.facilityContactMechs?.length) {
          resp.data.facilityContactMechs.forEach((item: any) => {
            if (item.contactMechTypeId === "POSTAL_ADDRESS") {
              postalAddress = { ...item, stateProvinceGeoId: item.stateProvinceGeoId };
            } else if (item.contactMechTypeId === "TELECOM_NUMBER") {
              contactDetails.telecomNumber = { contactMechId: item.contactMechId, contactNumber: item.contactNumber, countryCode: item.countryCode };
            } else if (item.contactMechTypeId === "EMAIL_ADDRESS") {
              contactDetails.emailAddress = { contactMechId: item.contactMechId, infoString: item.infoString };
            } else if (item.contactMechTypeId === "MAP_URL") {
              contactDetails.googleMapUrl = { contactMechId: item.contactMechId, infoString: item.infoString };
            }
          });
        }
      } catch (err) {
        logger.error("Failed to fetch facility contact details and telecom information", err);
      }
      this.current.postalAddress = postalAddress;
      this.current.contactDetails = contactDetails;
    },
    async fetchFacilityLocations(payload: { facilityId: string }) {
      let locations = [];
      try {
        const resp = await api({ url: `oms/facilities/${payload.facilityId}/locations`, method: "get", params: { pageNoLimit: true } });
        if (!commonUtil.hasError(resp) && resp.data?.length) {
          locations = resp.data;
        }
      } catch (err) {
        logger.error("Failed to find the facility locations", err);
      }
      this.current.locations = locations;
    },
    async fetchFacilityParties(payload: { facilityId: string }) {
      let parties = [];
      try {
        const resp = await api({ url: `oms/facilities/${payload.facilityId}/parties`, method: "get", params: { pageNoLimit: true } });
        if (!commonUtil.hasError(resp) && resp.data?.length) {
          parties = resp.data.map((party: any) => ({
            ...party,
            fullName: party.groupName || [party.firstName, party.lastName].filter(Boolean).join(" ") || party.partyId
          }));
        }
      } catch (err) {
        logger.error("Failed to fetch facility parties", err);
      }
      this.current.parties = parties;
    },
    async fetchFacilityIdentifications(payload: { facilityId: string }) {
      let identifications = [];
      try {
        const resp = await api({ url: `oms/facilities/${payload.facilityId}/identifications`, method: "get", params: { pageNoLimit: true } });
        if (!commonUtil.hasError(resp) && resp.data?.length) {
          identifications = resp.data;
        }
      } catch (err) {
        logger.error("Failed to fetch facility identifications", err);
      }
      this.current.identifications = identifications;
    },
    async fetchCurrentFacilityProductStores(payload: { facilityId: string }) {
      let productStores = [];
      try {
        const resp = await api({ url: `oms/facilities/${payload.facilityId}/productStores`, method: "get", params: { pageNoLimit: true } });
        if (!commonUtil.hasError(resp) && resp.data?.length) {
          productStores = resp.data;
        }
      } catch (err) {
        logger.error("Failed to fetch facility product stores", err);
      }
      this.current.productStores = productStores;
    },
    async fetchCurrentFacilityGroups(payload: { facilityId: string }) {
      let groupInformation = [];
      try {
        const resp = await api({ url: `oms/facilities/${payload.facilityId}/groups`, method: "get", params: { pageNoLimit: true } });
        if (!commonUtil.hasError(resp) && resp.data?.length) {
          groupInformation = resp.data;
        }
      } catch (err) {
        logger.error("Failed to fetch facility groups", err);
      }
      this.current.groupInformation = groupInformation;
      this.current.sellOnline = groupInformation.some((group: any) => group.facilityGroupTypeId === "CHANNEL_FAC_GROUP");
      this.current.useOMSFulfillment = groupInformation.some((group: any) => group.facilityGroupId === "OMS_FULFILLMENT");
      this.current.generateShippingLabel = groupInformation.some((group: any) => group.facilityGroupId === "AUTO_SHIPPING_LABEL");
      this.current.allowPickup = groupInformation.some((group: any) => group.facilityGroupId === "PICKUP");
    },
    async fetchFacilityCalendar(payload: { facilityId: string }) {
      let facilityCalendar = {};
      try {
        const resp = await api({ url: `oms/facilities/${payload.facilityId}/calendars/operatingHours`, method: "get", params: { facilityId: payload.facilityId } });
        if (!commonUtil.hasError(resp) && resp.data?.length) {
          facilityCalendar = resp.data[0];
        }
      } catch (err) {
        logger.error(err);
      }
      this.current.calendar = facilityCalendar;
    },
    async fetchShopifyFacilityMappings(payload: { facilityId: string }) {
      let shopifyFacilityMappings = [];
      try {
        const resp = await api({ url: "oms/ShopFacilityMappings", method: "get", params: { facilityId: payload.facilityId, pageNoLimit: true } });
        if (!commonUtil.hasError(resp) && resp.data?.length) {
          shopifyFacilityMappings = resp.data;
        }
      } catch (err) {
        logger.error("Failed to fetch shopify facility mappings", err);
      }
      this.current.shopifyFacilityMappings = shopifyFacilityMappings;
    },
    async fetchFacilityTypes() {
      if (this.facilityTypes.length) return;
      let facilityTypes: any[] = [];
      try {
        const resp = await api({
          url: "oms/facilityTypes",
          method: "get",
          params: {
            parentTypeId: 'VIRTUAL_FACILITY',
            parentTypeId_not: 'Y',
            facilityTypeId: 'VIRTUAL_FACILITY',
            facilityTypeId_not: 'Y',
            pageSize: 200
          }
        });
        if (!commonUtil.hasError(resp)) {
          facilityTypes = resp.data;
        } else {
          throw resp.data;
        }
      } catch (error) {
        logger.error(error);
      }
      this.facilityTypes = facilityTypes;
    },
    async fetchExternalMappingTypes() {
      if (Object.keys(this.externalMappingTypes).length) return;
      let externalMappingTypes: any = {};
      try {
        const resp = await api({
          url: "admin/enums",
          method: "get",
          params: { enumTypeId: "FACILITY_IDENTITY", enumId: "SHOPIFY_FAC_ID", enumId_not: "Y", pageNoLimit: true }
        });
        if (!commonUtil.hasError(resp) && resp.data?.length) {
          externalMappingTypes = resp.data.reduce((acc: any, type: any) => {
            acc[type.enumId] = type.description;
            return acc;
          }, {});
        } else {
          throw resp.data;
        }
      } catch (error) {
        logger.error(error);
      }
      this.externalMappingTypes = externalMappingTypes;
    },
    async fetchLocationTypes() {
      if (Object.keys(this.locationTypes).length) return;
      let locationTypes: any = {};
      try {
        const resp = await api({ url: "admin/enums", method: "get", params: { enumTypeId: "FACLOC_TYPE", pageNoLimit: true } });
        if (!commonUtil.hasError(resp) && resp.data?.length) {
          locationTypes = resp.data.reduce((acc: any, type: any) => {
            acc[type.enumId] = type.description;
            return acc;
          }, {});
        } else {
          throw resp.data;
        }
      } catch (error) {
        logger.error(error);
      }
      this.locationTypes = locationTypes;
    },
    async fetchFacilityGroupTypes() {
      if (this.facilityGroupTypes.length) return;
      let facilityGroupTypes: any[] = [];
      try {
        const resp = await api({ url: "oms/facilityGroups/types", method: "get", params: { pageNoLimit: true } });
        if (!commonUtil.hasError(resp) && resp.data?.length) {
          facilityGroupTypes = resp.data;
        } else {
          throw resp.data;
        }
      } catch (error) {
        logger.error(error);
      }
      this.facilityGroupTypes = facilityGroupTypes;
    },
    async fetchCalendars() {
      let calendars: any[] = [];
      try {
        const [calendarResp, weekResp] = await Promise.all([
          api({ url: "oms/calendars/techData", method: "get", params: { pageNoLimit: true } }),
          api({ url: "oms/calendars/techData/week", method: "get", params: { pageNoLimit: true } })
        ]);
        if (!commonUtil.hasError(calendarResp) && calendarResp.data?.length) {
          const weekTimings = weekResp.data || [];
          calendars = calendarResp.data.map((calendar: any) => ({
            ...calendar,
            ...weekTimings.find((week: any) => week.calendarWeekId === calendar.calendarWeekId)
          }));
        }
      } catch (error) {
        logger.error(error);
      }
      this.calendars = calendars;
    },
    async createFacilityPostalAddress(payload: any) {
      return api({
        url: "oms/facilityContactMechs/facilityAddress",
        method: "post",
        data: { ...payload, facilityId: payload.facilityId, contactMechPurposeTypeId: 'PRIMARY_LOCATION' }
      });
    },
    async updateFacilityPostalAddress(payload: any) {
      return api({ url: "oms/facilityContactMechs/facilityAddress", method: "put", data: payload });
    },
    async createFacilityTelecomNumber(payload: any) {
      return api({ url: "oms/facilityContactMechs/facilityPhone", method: "post", data: payload });
    },
    async updateFacilityTelecomNumber(payload: any) {
      return api({ url: "oms/facilityContactMechs/facilityPhone", method: "put", data: payload });
    },
    async createFacilityEmailAddress(payload: any) {
      return api({ url: "oms/facilityContactMechs/facilityEmail", method: "post", data: payload });
    },
    async updateFacilityEmailAddress(payload: any) {
      return api({ url: "oms/facilityContactMechs/facilityEmail", method: "put", data: payload });
    },
    async createProductStoreFacility(payload: any) {
      return api({ url: `oms/facilities/${payload.facilityId}/productStores`, method: "post", data: payload });
    },
    async updateProductStoreFacility(payload: any) {
      return api({ url: `oms/facilities/${payload.facilityId}/productStores/${payload.productStoreId}`, method: "put", data: payload });
    },
    async fetchFacilityGroup(facilityGroupId: string) {
      return api({ url: `oms/facilityGroups/${facilityGroupId}`, method: "get" });
    },
    async createFacilityGroup(payload: any) {
      return api({ url: "oms/facilityGroups", method: "post", data: payload });
    },
    async createFacilityContactMech(payload: any) {
      return api({ url: "oms/facilityContactMechs/facilityMapUrl", method: "post", data: payload });
    },
    async updateFacilityContactMech(payload: any) {
      return api({ url: "oms/facilityContactMechs/facilityMapUrl", method: "put", data: payload });
    },
    async deleteFacilityContactMech(payload: any) {
      return api({ url: "oms/facilityContactMechs/facilityMapUrl", method: "delete", data: payload });
    },
    async associateCalendarToFacility(payload: any) {
      return api({ url: `oms/facilities/${payload.facilityId}/calendars`, method: "post", data: payload });
    },
    async removeFacilityCalendar(payload: any) {
      return api({ url: `oms/facilities/${payload.facilityId}/calendars`, method: "post", data: { ...payload, facilityCalendarTypeId: 'OPERATING_HOURS', thruDate: DateTime.now().toMillis() } });
    },
    async createFacilityCalendar(payload: any) {
      const { description, facilityId, fromDate, facilityCalendarTypeId, ...weekTimings } = payload;
      return api({
        url: "oms/calendars/techData/week",
        method: "post",
        data: {
          ...weekTimings,
          "org.apache.ofbiz.manufacturing.techdata.TechDataCalendar": {
            description,
            "org.apache.ofbiz.product.facility.FacilityCalendar": { facilityId, fromDate, facilityCalendarTypeId }
          }
        }
      });
    },
    async createFacilityLocation(payload: any) {
      return api({ url: `oms/facilities/${payload.facilityId}/locations`, method: "post", data: payload });
    },
    async updateFacilityLocation(payload: any) {
      return api({ url: `oms/facilities/${payload.facilityId}/locations`, method: "post", data: payload });
    },
    async deleteFacilityLocation(payload: any) {
      return api({ url: `oms/facilities/${payload.facilityId}/locations/${payload.locationSeqId}`, method: "delete" });
    },
    async createFacilityIdentification(payload: any) {
      return api({ url: `oms/facilities/${payload.facilityId}/identifications`, method: "post", data: payload });
    },
    async updateFacilityIdentification(payload: any) {
      return api({ url: `oms/facilities/${payload.facilityId}/identifications`, method: "post", data: payload });
    },
    async fetchFacilityMappings(payload: { facilityId: string }) {
      let identifications = [];
      try {
        const resp = await api({ url: `oms/facilities/${payload.facilityId}/identifications`, method: "get", params: { pageNoLimit: true } });
        if (!commonUtil.hasError(resp) && resp.data?.length) {
          identifications = resp.data;
        }
      } catch (err) {
        logger.error("Failed to fetch facility mappings", err);
      }
      this.current.identifications = identifications;
    },
    async createShopifyShopLocation(payload: any) {
      return api({ url: "oms/shopifyShops/locations", method: "post", data: payload });
    },
    async updateShopifyShopLocation(payload: any) {
      return api({ url: `oms/shopifyShops/${payload.shopId}/locations`, method: "post", data: payload });
    },
    async deleteShopifyShopLocation(payload: any) {
      return api({ url: `oms/shopifyShops/locations/${payload.shopId}/${payload.facilityId}`, method: "delete" });
    },
    async fetchPartyRoles() {
      if (Object.keys(this.partyRoles).length) return;
      try {
        const resp = await api({
          url: "oms/roleTypes",
          method: "get",
          params: {
            roleTypeId: ["WAREHOUSE_PICKER", "CARRIER", "WAREHOUSE_MANAGER"],
            roleTypeId_op: "in",
            pageNoLimit: true
          }
        });
        if (!commonUtil.hasError(resp) && resp.data?.length) {
          this.partyRoles = resp.data.reduce((acc: any, role: any) => {
            acc[role.roleTypeId] = role.description || role.roleTypeId;
            return acc;
          }, {});
        }
      } catch (err) {
        logger.error("Failed to fetch party roles", err);
      }
    },
    async getPartyRoleAndPartyDetails(payload: { roleTypeId: string; [key: string]: any }) {
      const { roleTypeId, ...params } = payload;
      return api({ url: `oms/parties/roles/${roleTypeId}`, method: "get", params });
    },
    async addPartyToFacility(payload: any) {
      return api({ url: `oms/facilities/${payload.facilityId}/parties`, method: "post", data: payload });
    },
    async removePartyFromFacility(payload: any) {
      return api({ url: `oms/facilities/${payload.facilityId}/parties`, method: "put", data: payload });
    },
    async fetchFacilityPartyRoles(payload: any) {
      return api({ url: `oms/facilities/${payload.facilityId}/parties`, method: "get", params: { partyId: payload.partyId, filterByDate: true } });
    }
  },
  persist: true
});
