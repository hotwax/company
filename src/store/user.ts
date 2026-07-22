import { defineStore } from "pinia"
import { DateTime, Settings } from "luxon"
import { api, commonUtil, emitter, logger, translate } from "@common"
import { useAuth } from "@common/composables/useAuth"
import { useSolrSearch } from "@common/composables/useSolrSearch"
import { useUtilStore } from "@/store/util"

export const useUserStore = defineStore("user", {
  state: () => ({
    current: {} as any,
    permissions: [] as string[],
    oms: "",
    instanceUrl: "",
    availableTimeZones: [] as any[],
    userAccount: null as any,
    query: {
      queryString: "",
      userGroupId: "",
      status: ""
    },
    selectedUser: {} as any,
    users: {
      list: [] as any[],
      total: 0
    },
    redirectedFrom: "",
    fetchStatus: {
      profile: "" as string,
      permissions: "" as string,
      lastFetched: 0 as number
    }
  }),

  getters: {
    isAuthenticated: () => useAuth().isAuthenticated.value,
    getUserProfile: (state) => state.current,
    getUserPermissions: (state) => state.permissions,
    getInstanceUrl: (state) => state.instanceUrl,
    getQuery: (state) => state.query,
    getSelectedUser: (state) => state.selectedUser,
    getSelectedUserProductStores: (state): any => state.selectedUser?.productStores || [],
    getSelectedUserSecurityGroups: (state): any => state.selectedUser?.securityGroups || [],
    getRedirectedFromUrl: (state): string => state.redirectedFrom,
    getUsers: (state): any[] => state.users.list,
    isScrollable: (state): boolean => {
      return state.users.list?.length > 0 && state.users.list.length < state.users.total
    },
    hasPermission: (state) => (permissionId: string): boolean => {
      const checkPermission = (id: string): boolean => {
        if(!id) {return true}
        if(id.includes(" OR ")) {
          return id.split(" OR ").some((p: string) => checkPermission(p.trim()))
        }
        if(id.includes(" AND ")) {
          return id.split(" AND ").every((p: string) => checkPermission(p.trim()))
        }

        return state.permissions.includes(id)
      }

      return checkPermission(permissionId)
    }
  },

  actions: {
    async fetchUserProfile() {
      this.fetchStatus.profile = "pending"
      try {
        const resp = await api({
          url: "admin/user/profile",
          method: "get",
          baseURL: commonUtil.getMaargURL()
        })
        if(commonUtil.hasError(resp)) {throw resp}
        this.current = resp.data
        useAuth().updateUserId(this.current.userId)
        if(this.current.timeZone) {
          Settings.defaultZone = this.current.timeZone
        }
        this.fetchStatus.profile = "success"
        this.fetchStatus.lastFetched = Date.now()
      } catch (error: any) {
        this.fetchStatus.profile = "error"
        commonUtil.showToast(translate("Failed to fetch user profile"))
        logger.error("fetchUserProfile", error)
        useAuth().clearAuth()

        return Promise.reject(new Error(error))
      }
    },

    async fetchPermissions() {
      this.fetchStatus.permissions = "pending"
      const permissionId = import.meta.env.VITE_APP_PERMISSION_ID
      const serverPermissions: string[] = []
      const viewSize = 200
      let viewIndex = 0

      try {
        let resp: any
        do {
          resp = await api({
            url: "admin/user/permissions",
            method: "get",
            params: { viewIndex, viewSize }
          })
          if(resp.status === 200 && resp.data.docs?.length && !commonUtil.hasError(resp)) {
            serverPermissions.push(...resp.data.docs.map((p: any) => p.permissionId))
            viewIndex++
          } else {
            resp = null
          }
        } while(resp)

        if(permissionId && !serverPermissions.includes(permissionId)) {
          const msg = "You do not have permission to access the app."
          commonUtil.showToast(translate(msg))
          this.fetchStatus.permissions = "error"

          return Promise.reject(new Error(msg))
        }

        this.permissions = serverPermissions
        this.fetchStatus.permissions = "success"
      } catch (error: any) {
        this.fetchStatus.permissions = "error"

        return Promise.reject(error)
      }
    },

    async setUserTimeZone(tzId: string) {
      if(this.current.timeZone === tzId) {return}
      try {
        const resp: any = await api({
          url: "admin/user/profile",
          method: "POST",
          data: { userId: this.current.userId, timeZone: tzId }
        })
        if(resp?.status === 200) {
          this.current.timeZone = tzId
          Settings.defaultZone = tzId
          commonUtil.showToast(translate("Time zone updated successfully"))
        } else {
          throw resp
        }
      } catch (err) {
        logger.error("setUserTimeZone", err)
        commonUtil.showToast(translate("Failed to update time zone"))

        return Promise.reject("")
      }
    },

    async fetchAvailableTimeZones() {
      try {
        const resp = await api({
          url: "admin/user/getAvailableTimeZones",
          method: "get",
          cache: true
        })
        if(resp?.data) {
          this.availableTimeZones = resp.data.timeZones ?? (Array.isArray(resp.data) ? resp.data : [])
        }

        return resp
      } catch (error: any) {
        logger.error("fetchAvailableTimeZones", error)

        return Promise.reject(error)
      }
    },

    async fetchUserAccount(userId: string) {
      try {
        const resp = await api({
          url: `admin/users/${encodeURIComponent(userId)}`,
          method: "GET"
        })
        this.userAccount = resp?.data ?? null

        return resp
      } catch (error: any) {
        logger.error("fetchUserAccount", error)

        return Promise.reject(error)
      }
    },

    async getUserGroups(userId: string): Promise<any> {
      let userGroups = [] as any

      try {
        const resp = await api({
          url: `admin/users/${userId}/groups`,
          method: "get"
        }) as any

        if(!commonUtil.hasError(resp)) {
          userGroups = resp.data
        } else {
          throw resp.data
        }
      } catch (error) {
        logger.error("Failed to fetch user associated groups.", error)
      }

      return userGroups
    },

    updateSelectedUser(selectedUser: any) {
      this.selectedUser = selectedUser
    },

    clearSelectedUser() {
      this.selectedUser = {}
    },

    updateQuery(query: any) {
      this.query = query
    },

    async fetchUsers(payload: { pageIndex: number; pageSize: number }) {
      if (payload.pageIndex === 0) {emitter.emit("presentLoader")}

      const searchTerm = this.query.queryString?.trim()

      const solrPayload = {
        json: {
          params: {
            rows : payload.pageSize,
            start: payload.pageIndex ? payload.pageIndex * payload.pageSize : 0,
            qf: "partyId^100 username^50 firstName^30 lastName^30 groupName^30",
            defType: "edismax"
          },
          query: "*:*",
          filter: ["docType:EMPLOYEE", `-partyId:${this.current.partyId}`]
        }
      } as any

      if (searchTerm) {
        const keywords = searchTerm.split(" ")
        solrPayload.json.query = `(${keywords.map((keyword: string) => `*${keyword}*`).join(" OR ")}) OR "${searchTerm}"^100`
      }
      if (this.query.userGroupId) {solrPayload.json.filter += ` AND userGroupIds:${this.query.userGroupId}`}
      if (this.query.status) {
        solrPayload.json.filter += ` AND statusId:${this.query.status === "Y" ? "PARTY_ENABLED" : "PARTY_DISABLED"}`
      }

      let users = JSON.parse(JSON.stringify(this.users.list))
      let total = this.users.total

      try {
        const resp = await useSolrSearch().runSolrQuery(solrPayload)

        if(!commonUtil.hasError(resp)) {
          const docs: any[] = resp.data?.response?.docs || []
          users = payload.pageIndex > 0 ? users.concat(docs) : docs
          total = resp.data?.response?.numFound || 0
        } else {
          throw resp.data
        }
      } catch (error) {
        if(payload.pageIndex === 0) {
          users = []
          total = 0
        }
        logger.error(error)
      }

      this.users.list = users
      this.users.total = total
      emitter.emit("dismissLoader")
    },

    addPartyToFacility(payload: { partyId: string; facilityId: string; roleTypeId: string; fromDate?: any }): Promise<any> {
      return api({
        url: `oms/facilities/${payload.facilityId}/parties`,
        method: "post",
        data: { partyId: payload.partyId, roleTypeId: payload.roleTypeId, fromDate: payload.fromDate }
      })
    },

    addUserToSecurityGroup(payload: { userId: string; userGroupId: string; fromDate?: any }): Promise<any> {
      // fromDate is part of UserGroupMember's PK (userGroupId, userId, fromDate) with no entity default, so it must be supplied explicitly.
      return api({
        url: `admin/users/${payload.userId}/groups`,
        method: "post",
        data: { userGroupId: payload.userGroupId, fromDate: payload.fromDate || DateTime.now().toMillis() }
      })
    },

    createUser(payload: { partyTypeId: string; person?: { firstName: string; lastName: string }; partyGroup?: { groupName: string }; externalId?: string }): Promise<any> {
      return api({
        url: "oms/parties",
        method: "post",
        data: payload
      })
    },

    createUserAccount(payload: { partyId: string; username: string; newPassword: string; newPasswordVerify: string; requirePasswordChange?: string; emailAddress?: string }): Promise<any> {
      return api({
        url: "moqui/users",
        method: "post",
        data: payload
      })
    },

    createProductStoreRole(payload: { partyId: string; productStoreId: string; roleTypeId: string; fromDate?: any }): Promise<any> {
      return api({
        url: `admin/users/productStores`,
        method: "post",
        data: { productStoreId: payload.productStoreId, partyId: payload.partyId, roleTypeId: payload.roleTypeId, fromDate: payload.fromDate }
      })
    },

    createUpdatePartyEmailAddress(payload: { partyId: string; contactMechId?: string; emailAddress: string; contactMechPurposeTypeId?: string }): Promise<any> {
      return api({
        url: `oms/customers/${payload.partyId}/emails`,
        method: payload.contactMechId ? "put" : "post",
        data: { contactMechId: payload.contactMechId, infoString: payload.emailAddress, contactMechPurposeTypeId: payload.contactMechPurposeTypeId }
      })
    },

    createUpdatePartyTelecomNumber(payload: { partyId: string; contactMechId?: string; contactNumber: string; contactMechPurposeTypeId?: string }): Promise<any> {
      return api({
        url: `oms/customers/${payload.partyId}/telecomNumbers`,
        method: payload.contactMechId ? "put" : "post",
        data: { contactMechId: payload.contactMechId, contactNumber: payload.contactNumber, contactMechPurposeTypeId: payload.contactMechPurposeTypeId }
      })
    },

    deletePartyContactMech(payload: { partyId: string; contactMechId: string }): Promise<any> {
      return api({
        url: `oms/customers/${payload.partyId}/contactMechs/${payload.contactMechId}`,
        method: "delete"
      })
    },

    deletePartyRole(payload: { partyId: string; roleTypeId: string }): Promise<any> {
      return api({
        url: `oms/parties/${payload.partyId}/roles`,
        method: "delete",
        params: { roleTypeId: payload.roleTypeId }
      })
    },

    ensurePartyRole(payload: { partyId: string; roleTypeId: string }): Promise<any> {
      return api({
        url: `oms/parties/${payload.partyId}/roles`,
        method: "post",
        data: { roleTypeId: payload.roleTypeId }
      })
    },

    forceLogout(payload: { userId: string }): Promise<any> {
      return api({
        url: "admin/user/profile",
        method: "post",
        data: { userId: payload.userId, hasLoggedOut: "Y" }
      })
    },

    async getUserFacilities(partyId: string): Promise<any> {
      let facilities = []

      try {
        const resp = await api({
          url: `admin/user/${partyId}/facilities`,
          method: "GET",
          params: { pageSize: 100 }
        }) as any

        if(!commonUtil.hasError(resp)) {
          const now = Date.now()
          facilities = (resp.data || []).filter((facility: any) => !facility.thruDate || facility.thruDate > now)
        } else {
          throw resp.data
        }
      } catch (error) {
        logger.error("Failed to fetch user associated facilities.", error)
      }

      return facilities
    },

    async getUserProductStores(partyId: string): Promise<any> {
      let productStores = []

      try {
        const resp = await api({
          url: `admin/users/productStores`,
          method: "GET",
          params: { partyId }
        }) as any

        const utilStore = useUtilStore()
        await Promise.allSettled([utilStore.fetchProductStores(), utilStore.fetchRoles()])

        if(!commonUtil.hasError(resp)) {
          const now = Date.now()
          const storeNameByProductStoreId = {} as any
          utilStore.getProductStores.forEach((store: any) => { storeNameByProductStoreId[store.productStoreId] = store.storeName })

          productStores = (resp.data || [])
            .filter((productStoreRole: any) => !productStoreRole.thruDate || productStoreRole.thruDate > now)
            .map((productStoreRole: any) => ({ ...productStoreRole, storeName: storeNameByProductStoreId[productStoreRole.productStoreId] }))
        } else {
          throw resp.data
        }
      } catch (error) {
        logger.error("Failed to fetch user associated product stores.", error)
      }

      return productStores
    },

    // Rebuilds and reindexes the EMPLOYEE Solr document from live data, so call after any change
    // to a user's name, group/role associations, login, or contact details.
    async indexEmployee(partyId: string): Promise<any> {
      try {
        const resp = await api({
          url: "oms/search/index/employee",
          method: "post",
          data: { partyId }
        }) as any
        if(commonUtil.hasError(resp)) {throw resp.data}

        return resp
      } catch (error) {
        logger.error("indexEmployee", error)
      }
    },

    async isUserFulfillmentAdmin(groupIds: string): Promise<any> {
      //TODO: Need to write the implementation of it once moqui permission/artifacts security finalized
      return false;
    },

    async isUserLoginIdAlreadyExists(username: string): Promise<any> {
      try {
        const resp = await api({
          url: `admin/users/${username}`,
          method: "GET"
        }) as any
        if(!commonUtil.hasError(resp) && resp.data?.userId) {
          commonUtil.showToast(translate("Could not create login user: user with ID already exists.", { userLoginId: username }))

          return true
        }

        return false
      } catch {
        return false
      }
    },

    removePartyFromFacility(payload: { partyId: string; facilityId: string; roleTypeId: string; fromDate: any; thruDate: any }): Promise<any> {
      // Soft-expire: FacilityParty history is preserved, so this updates thruDate on the existing record rather than deleting it.
      return api({
        url: `oms/facilities/${payload.facilityId}/parties`,
        method: "put",
        data: { partyId: payload.partyId, roleTypeId: payload.roleTypeId, fromDate: payload.fromDate, thruDate: payload.thruDate }
      })
    },

    removeUserSecurityGroup(payload: { userId: string; userGroupId: string; fromDate: any; thruDate: any }): Promise<any> {
      // Soft-expire: UserGroupMember history is preserved, so this updates thruDate on the existing record rather than deleting it.
      return api({
        url: `admin/users/${payload.userId}/groups`,
        method: "put",
        data: { userGroupId: payload.userGroupId, fromDate: payload.fromDate, thruDate: payload.thruDate }
      })
    },

    resetPassword(payload: { userId: string; newPassword: string; newPasswordVerify: string }): Promise<any> {
      // oldPassword is required="true" on update#Password's in-parameters, so the service rejects an empty
      // value before its actions (and the "ignored if admin permission" exemption) ever run. Moqui's own
      // admin screen (UserAccountDetail.xml) works around this by always sending the literal "ignored" for it.
      return api({
        url: `moqui/users/${payload.userId}/password/update`,
        method: "post",
        //Pass a random string as oldPassword, since it is a required API parameter. If the user has the ADMIN_PASSWORD permission, the value of oldPassword is ignored.
        data: { oldPassword: "IGNORED", newPassword: payload.newPassword, newPasswordVerify: payload.newPasswordVerify }
      })
    },

    sendResetPasswordEmail(payload: any): Promise<any> {
      return api({
        baseURL: commonUtil.getOmsURL(),
        url: "sendResetPasswordMail",
        method: "post",
        data: payload
      })
    },

    updatePartyExternalId(payload: { partyId: string; externalId: string }): Promise<any> {
      return api({
        url: `oms/parties/${payload.partyId}`,
        method: "put",
        data: { externalId: payload.externalId }
      })
    },

    updatePartyPersonName(payload: { partyId: string; firstName: string; lastName: string }): Promise<any> {
      return api({
        url: `oms/parties/${payload.partyId}`,
        method: "put",
        data: { person: { firstName: payload.firstName, lastName: payload.lastName } }
      })
    },

    updatePartyGroupName(payload: { partyId: string; groupName: string }): Promise<any> {
      return api({
        url: `oms/parties/${payload.partyId}`,
        method: "put",
        data: { partyGroup: { groupName: payload.groupName } }
      })
    },

    updatePartyStatus(payload: { partyId: string; statusId: string }): Promise<any> {
      return api({
        url: `oms/parties/${payload.partyId}`,
        method: "put",
        data: { statusId: payload.statusId }
      })
    },

    updateProductStoreRole(payload: { partyId: string; productStoreId: string; roleTypeId: string; fromDate: any; thruDate: any }): Promise<any> {
      // Soft-expire: ProductStoreRole history is preserved, so this updates thruDate on the existing record rather than deleting it.
      return api({
        url: `admin/users/productStores`,
        method: "put",
        data: { productStoreId: payload.productStoreId, partyId: payload.partyId, roleTypeId: payload.roleTypeId, fromDate: payload.fromDate, thruDate: payload.thruDate }
      })
    },

    updateUserLoginStatus(payload: { userId: string; disabled: string }): Promise<any> {
      return api({
        url: "admin/user/profile",
        method: "post",
        data: { userId: payload.userId, disabled: payload.disabled }
      })
    },

    uploadPartyImage(payload: { userId: string; formData: FormData }): Promise<any> {
      return api({
        url: `admin/users/${payload.userId}/profileImage`,
        method: "post",
        data: payload.formData,
        headers: { "Content-Type": "multipart/form-data" }
      })
    },

    async finishSetup(payload: any): Promise<any> {
      try {
        const selectedUser = payload.selectedUser
        const selectedTemplate = payload.selectedTemplate
        const partyId = selectedUser.partyId
        const promises = []
        let userId = selectedUser.userId

        if(selectedTemplate.isUserLoginRequired || selectedUser.partyTypeId === "PARTY_GROUP") {
          const resp = await this.createUserAccount({
            partyId,
            username: payload.formData.userLoginId,
            newPassword: payload.formData.currentPassword,
            newPasswordVerify: payload.formData.currentPassword,
            requirePasswordChange: payload.formData.requirePasswordChange ? "Y" : "N",
            emailAddress: payload.formData.emailAddress
          })
          if(commonUtil.hasError(resp)) {
            throw resp.data
          }
          userId = resp.data.userId

          await this.addUserToSecurityGroup({
            userId,
            userGroupId: payload.selectedTemplate.securityGroupId || "STORE_MANAGER",
            fromDate: DateTime.now().toMillis()
          })
        }

        if(selectedTemplate.isEmployeeIdRequired && payload.formData.externalId) {
          promises.push(this.updatePartyExternalId({
            partyId,
            externalId: payload.formData.externalId
          }))
        }

        if(payload.formData.emailAddress && payload.formData.emailAddress !== selectedUser.emailDetails?.email) {
          promises.push(this.createUpdatePartyEmailAddress({
            partyId,
            contactMechId: selectedUser.emailDetails?.contactMechId ? selectedUser.emailDetails?.contactMechId : "",
            emailAddress: payload.formData.emailAddress,
            contactMechPurposeTypeId: "PRIMARY_EMAIL"
          }))
        }

        const roleTypeIdSet = new Set<string>()
        if(payload.selectedTemplate.roleTypeId) {roleTypeIdSet.add(payload.selectedTemplate.roleTypeId)}
        if(payload.selectedTemplate.productStoreRoleTypeId && payload.productStores.length > 0 && selectedTemplate.isProductStoreRequired) {roleTypeIdSet.add(payload.selectedTemplate.productStoreRoleTypeId)}

        if(payload.facilities.length > 0) {
          roleTypeIdSet.add(payload.selectedTemplate.facilityRoleTypeId || "WAREHOUSE_PICKER")

          if(selectedUser.partyTypeId === "PARTY_GROUP") {roleTypeIdSet.add("FAC_LOGIN")}
        }

        for(const roleTypeId of roleTypeIdSet) {
          const result = await this.ensurePartyRole({partyId, roleTypeId})

          if(commonUtil.hasError(result)) {
            throw result.data
          }
        }

        if(payload.productStores.length > 0 && selectedTemplate.isProductStoreRequired) {
          payload.productStores?.forEach((store: any) => {
            promises.push(this.createProductStoreRole({
              partyId,
              productStoreId: store.productStoreId,
              roleTypeId: payload.selectedTemplate.productStoreRoleTypeId,
              fromDate: DateTime.now().toMillis()
            }))
          })
        }

        if(payload.facilities.length > 0) {
          const selectedFacilityIds = new Set(payload.facilities.map((facility: any) => facility.facilityId))
          const facilitiesToAdd = payload.facilities.filter((facility: any) => !selectedUser.facilities?.some((fac: any) => fac.facilityId === facility.facilityId))
          const facilitiesToDelete = selectedUser.facilities?.filter((facility: any) => !selectedFacilityIds.has(facility.facilityId))

          facilitiesToDelete?.forEach((facility: any) => {
            promises.push(this.removePartyFromFacility({
              partyId,
              facilityId: facility.facilityId,
              roleTypeId: facility.roleTypeId,
              fromDate: facility.fromDate,
              thruDate: DateTime.now().toMillis()
            }))
          })

          facilitiesToAdd?.forEach((facility: any) => {
            promises.push(this.addPartyToFacility({
              partyId,
              facilityId: facility.facilityId,
              roleTypeId: payload.selectedTemplate.facilityRoleTypeId ? payload.selectedTemplate.facilityRoleTypeId : "WAREHOUSE_PICKER"
            }))
          })

          if(selectedUser.partyTypeId === "PARTY_GROUP") {
            const facilityId = [...selectedFacilityIds][0]

            promises.push(this.addPartyToFacility({
              partyId,
              facilityId,
              roleTypeId: "FAC_LOGIN"
            }))
          }
        }

        await Promise.all(promises).then(responses => {
          responses.forEach(response => {
            if(commonUtil.hasError(response)) {
              throw response.data
            }
          })
        })

        await this.indexEmployee(partyId)

        return userId
      } catch(error: any) {
        return Promise.reject(error)
      }
    },

    async getSelectedUserDetails(payload: { partyId: string; isFetchRequired?: boolean }) {
      const currentSelectedUser = JSON.parse(JSON.stringify(this.selectedUser))
      if(currentSelectedUser.partyId === payload.partyId && !payload.isFetchRequired) {
        return
      }

      let selectedUser = {} as any

      try {
        const partyResp = await api({
          url: `oms/parties/${payload.partyId}`,
          method: "GET"
        }) as any

        if(!commonUtil.hasError(partyResp)) {
          selectedUser = {
            partyId: payload.partyId,
            partyTypeId: partyResp.data.partyTypeId,
            firstName: partyResp.data.firstName,
            lastName: partyResp.data.lastName,
            groupName: partyResp.data.groupName,
            externalId: partyResp.data.externalId,
            statusId: partyResp.data.statusId,
            userId: partyResp.data.userId
          }

          if(partyResp.data.userId) {
            const userResp = await api({ url: `admin/users/${selectedUser.userId}`, method: "GET" }) as any
            if(!commonUtil.hasError(userResp) && userResp.data) {
              selectedUser = {
                ...userResp.data,
                ...selectedUser
              }
            } else {
              throw userResp.data
            }
          }

          const contactResp = await api({
            url: "oms/partyContactMechs",
            method: "GET",
            params: {
              partyId: payload.partyId,
              contactMechPurposeTypeId: "PRIMARY_EMAIL,PRIMARY_PHONE",
              contactMechPurposeTypeId_op: "in",
              pageSize: 100
            }
          }) as any
          if(!commonUtil.hasError(contactResp)) {
            let emailDetails = {}
            let phoneNumberDetails = {}
            const contactDocs = (contactResp.data || []).filter((doc: any) => !doc.thruDate && !doc.PCMPthruDate)

            contactDocs.forEach((doc: any) => {
              if(doc.contactMechPurposeTypeId === "PRIMARY_EMAIL") {
                emailDetails = {
                  email: doc.infoString,
                  contactMechId: doc.contactMechId
                }
              } else if(doc.contactMechPurposeTypeId === "PRIMARY_PHONE") {
                phoneNumberDetails = {
                  contactNumber: doc.contactNumber,
                  contactMechId: doc.contactMechId
                }
              }
            })

            selectedUser = {
              ...selectedUser,
              ...(Object.keys(emailDetails).length && { emailDetails }),
              ...(Object.keys(phoneNumberDetails).length && { phoneNumberDetails })
            }
          } else {
            throw contactResp.data
          }
        } else {
          throw partyResp.data
        }
      } catch (error) {
        logger.error(error)
      }

      if(Object.keys(selectedUser).length) {
        selectedUser.facilities = await this.getUserFacilities(selectedUser.partyId)
        const userGroups = await this.getUserGroups(selectedUser.userId)
        const now = Date.now()
        selectedUser.securityGroups = userGroups.filter((group: any) => !group.thruDate || group.thruDate > now)
        selectedUser.productStores = await this.getUserProductStores(selectedUser.partyId)
        if(selectedUser.userId) {
          let userPreferences = [] as any
          try {
            const preferencesResp = await api({
              url: "admin/user/preferences",
              method: "GET",
              params: {
                userId: selectedUser.userId,
                preferenceKey: "FAVORITE_PRODUCT_STORE,FAVORITE_SHOPIFY_SHOP",
                preferenceKey_op: "in",
                pageSize: 2
              }
            }) as any

            if(!commonUtil.hasError(preferencesResp)) {
              userPreferences = preferencesResp.data
            } else {
              throw preferencesResp.data
            }
          } catch (error) {
            logger.error(error)
          }
          if(userPreferences) {
            selectedUser.favoriteProductStorePref = userPreferences.find((preference: any) => preference.preferenceKey === "FAVORITE_PRODUCT_STORE")
            selectedUser.favoriteShopifyShopPref = userPreferences.find((preference: any) => preference.preferenceKey === "FAVORITE_SHOPIFY_SHOP")
          }
        }

        const resp = await api({
          url: `oms/parties/${selectedUser.partyId}/roles`,
          method: "GET",
          params: {
            roleTypeId: "WAREHOUSE_PICKER",
            pageSize: 1
          }
        })

        if(!commonUtil.hasError(resp) && resp.data.length) {
          selectedUser.isWarehousePicker = true
        }
      }

      if(selectedUser.createdByUserLogin) {
        const resp = await api({
          baseURL: commonUtil.getOmsURL(),
          url: "performFind",
          method: "POST",
          data: {
            entityName: "UserLogin",
            inputFields: {
              userLoginId: selectedUser.createdByUserLogin
            },
            viewSize: 1,
            fieldList: ["partyId"],
            distinct: "Y",
            noConditionFind: "Y"
          }
        })

        if(!commonUtil.hasError(resp)) {
          selectedUser.createdByUserPartyId = resp.data.docs[0].partyId
        }
      }
      this.selectedUser = selectedUser
    },

    async setFavoriteProductStore(payload: { userId: string; productStoreId: string }) {
      try {
        const params = {
          userId: payload.userId,
          preferenceKey: "FAVORITE_PRODUCT_STORE",
          preferenceValue: payload.productStoreId
        }
        const resp = await api({
          url: "admin/user/preferences",
          method: "put",
          data: params
        })
        if(!commonUtil.hasError(resp)) {
          this.selectedUser = { ...this.selectedUser, favoriteProductStorePref: params }
          await this.setFavoriteShopifyShop({ userId: payload.userId, shopId: "" })

          return Promise.resolve(resp.data)
        } else {
          throw resp.data
        }
      } catch (error) {
        logger.error(error)

        return Promise.reject(error)
      }
    },

    async setFavoriteShopifyShop(payload: { userId: string; shopId: string }) {
      try {
        const params = {
          userId: payload.userId,
          preferenceKey: "FAVORITE_SHOPIFY_SHOP",
          preferenceValue: payload.shopId
        }
        const resp = await api({
          url: "admin/user/preferences",
          method: "put",
          data: params
        })
        if(!commonUtil.hasError(resp)) {
          this.selectedUser = { ...this.selectedUser, favoriteShopifyShopPref: params }

          return Promise.resolve(resp.data)
        } else {
          throw resp.data
        }
      } catch (error) {
        logger.error(error)

        return Promise.reject(error)
      }
    },

    updateRedirectedFromUrl(url: string) {
      this.redirectedFrom = url
    },

    // Called by @common's initialiseConfig after successful login
    async postLogin() {
      try {
        await this.fetchUserProfile()
        await this.fetchPermissions()
      } catch (error: any) {
        return Promise.reject(new Error(error))
      }
    },

    // Called by @common's initialiseConfig after logout
    async postLogout() {
      this.$reset()
      useAuth().clearAuth()

      // Reset all other persisted stores so no data leaks across sessions
      const { useProductStore } = await import("./productStore")
      const { useUtilStore } = await import("./util")
      const { useNetSuiteStore } = await import("./netSuite")
      const { useShopifyStore } = await import("./shopify")
      const { useKlaviyoStore } = await import("./klaviyo")
      const { useComposerStore } = await import("./composer")
      const { useWorkforceStore } = await import("./workforce")
      const { useAuthorizationStore } = await import("./authorization")
      const { useShopifyOrderSyncStore } = await import("./shopifyOrderSync")

      useShopifyOrderSyncStore().clearShopifyOrderSyncState()
      useProductStore().clearProductStoreState()
      useUtilStore().clearUtilState()
      useNetSuiteStore().clearNetSuiteState()
      useShopifyStore().clearShopifyState()
      useKlaviyoStore().clear()
      useComposerStore().clearComposerState()
      useWorkforceStore().clearWorkforceState()
      useAuthorizationStore().$reset()
    }
  },

  persist: true
})
