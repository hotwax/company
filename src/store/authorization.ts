import { defineStore } from "pinia"
import { api, commonUtil, logger } from "@common"

export interface AuthorizationState {
  userPermissions: any;
  groupPermissions: any;
  artifactGroups: any[];
  groupAuthorizations: any;
  authzTypeEnums: any[];
  authzActionEnums: any[];
  userGroupTypeEnums: any[];
  userGroupListQuery: { queryString: string };
  userGroupList: { list: any[]; total: number };
}

export const useAuthorizationStore = defineStore("authorization", {
  state: (): AuthorizationState => ({
    userPermissions: {},
    groupPermissions: {},
    artifactGroups: [],
    groupAuthorizations: {},
    authzTypeEnums: [],
    authzActionEnums: [],
    userGroupTypeEnums: [],
    userGroupListQuery: { queryString: "" },
    userGroupList: { list: [], total: 0 }
  }),
  getters: {
    getUserPermissions: (state): any => state.userPermissions,
    getGroupPermissions: (state) => (userGroupId: string): any => state.groupPermissions[userGroupId] || {},
    getArtifactGroups: (state): any[] => state.artifactGroups,
    getGroupAuthorizations: (state) => (userGroupId: string): any[] => state.groupAuthorizations[userGroupId] || [],
    getAuthzTypeEnums: (state): any[] => state.authzTypeEnums,
    getAuthzActionEnums: (state): any[] => state.authzActionEnums,
    getUserGroupTypeEnums: (state): any[] => state.userGroupTypeEnums,
    getUserGroupListQuery: (state) => state.userGroupListQuery,
    getUserGroupList: (state): any[] => state.userGroupList.list,
    isUserGroupListScrollable: (state): boolean => {
      return (
        state.userGroupList.list?.length > 0 &&
        (state.userGroupList.list?.length % Number(import.meta.env.VITE_VIEW_SIZE) === 0)
      )
    }
  },
  actions: {
    async fetchUserPermissions() {
      if(Object.keys(this.userPermissions).length) {
        return;
      }

      const userPermissions = {} as any;
      try {
        const resp = await api({
          url: "admin/userPermissions",
          method: "get",
          params: { pageSize: 1000 },
          cache: true
        }) as any;

        if(!commonUtil.hasError(resp)) {
          (resp.data || []).forEach((permission: any) => {
            userPermissions[permission.userPermissionId] = permission;
          });
        } else {
          throw resp.data;
        }
      } catch (error) {
        logger.error("Failed to fetch user permissions.", error);
      }
      this.userPermissions = userPermissions;
    },

    async fetchArtifactGroups() {
      if(this.artifactGroups.length) {
        return;
      }

      let artifactGroups = [];
      try {
        const resp = await api({
          url: "admin/artifactGroups",
          method: "get",
          params: { pageSize: 1000 },
          cache: true
        }) as any;

        if(!commonUtil.hasError(resp)) {
          artifactGroups = resp.data;
        } else {
          throw resp.data;
        }
      } catch (error) {
        logger.error("Failed to fetch artifact groups.", error);
      }
      this.artifactGroups = artifactGroups;
    },

    async fetchAuthzEnums() {
      if(this.authzTypeEnums.length && this.authzActionEnums.length) {
        return;
      }

      try {
        const [authzTypeResp, authzActionResp] = await Promise.all([
          api({ url: "admin/enums", method: "get", params: { enumTypeId: "AuthzType", pageSize: 100 }, cache: true }) as any,
          api({ url: "admin/enums", method: "get", params: { enumTypeId: "AuthzAction", pageSize: 100 }, cache: true }) as any
        ]);

        this.authzTypeEnums = !commonUtil.hasError(authzTypeResp) ? authzTypeResp.data : [];
        this.authzActionEnums = !commonUtil.hasError(authzActionResp) ? authzActionResp.data : [];
      } catch (error) {
        logger.error("Failed to fetch authorization enumerations.", error);
      }
    },

    async fetchUserGroupTypeEnums() {
      if(this.userGroupTypeEnums.length) {
        return;
      }

      let userGroupTypeEnums = [];
      try {
        const resp = await api({
          url: "admin/enums",
          method: "get",
          params: { enumTypeId: "UserGroupType", pageSize: 100 },
          cache: true
        }) as any;

        if(!commonUtil.hasError(resp)) {
          userGroupTypeEnums = resp.data;
        } else {
          throw resp.data;
        }
      } catch (error) {
        logger.error("Failed to fetch user group type enumerations.", error);
      }
      this.userGroupTypeEnums = userGroupTypeEnums;
    },

    async fetchUserGroupPermissions(userGroupId: string) {
      const activePermissions = {} as any;
      try {
        const resp = await api({
          url: `admin/userGroups/${userGroupId}/permissions`,
          method: "get",
          params: { pageSize: 1000 }
        }) as any;

        if(!commonUtil.hasError(resp)) {
          const now = Date.now();
          (resp.data || [])
            .filter((groupPermission: any) => !groupPermission.thruDate || groupPermission.thruDate > now)
            .forEach((groupPermission: any) => {
              activePermissions[groupPermission.userPermissionId] = groupPermission;
            });
        } else {
          throw resp.data;
        }
      } catch (error) {
        logger.error("Failed to fetch user group permissions.", error);
      }
      this.groupPermissions = { ...this.groupPermissions, [userGroupId]: activePermissions };
    },

    addUserGroupPermission(payload: { userGroupId: string; userPermissionId: string; fromDate: number }): Promise<any> {
      return api({
        url: `admin/userGroups/${payload.userGroupId}/permissions`,
        method: "post",
        data: { userPermissionId: payload.userPermissionId, fromDate: payload.fromDate }
      });
    },

    removeUserGroupPermission(payload: { userGroupId: string; userPermissionId: string; fromDate: number; thruDate: number }): Promise<any> {
      // Soft-expire: UserGroupPermission history is preserved, so this updates thruDate on the existing record rather than deleting it.
      return api({
        url: `admin/userGroups/${payload.userGroupId}/permissions`,
        method: "put",
        data: { userPermissionId: payload.userPermissionId, fromDate: payload.fromDate, thruDate: payload.thruDate }
      });
    },

    async fetchArtifactAuthorizations(userGroupId: string) {
      let authorizations = [];
      try {
        const resp = await api({
          url: `admin/userGroups/${userGroupId}/artifactAuthorizations`,
          method: "get",
          params: { pageSize: 1000 }
        }) as any;

        if(!commonUtil.hasError(resp)) {
          authorizations = resp.data;
        } else {
          throw resp.data;
        }
      } catch (error) {
        logger.error("Failed to fetch artifact authorizations.", error);
      }
      this.groupAuthorizations = { ...this.groupAuthorizations, [userGroupId]: authorizations };
    },

    createArtifactAuthz(payload: { userGroupId: string; artifactGroupId: string; authzTypeEnumId: string; authzActionEnumId: string; authzServiceName?: string }): Promise<any> {
      return api({
        url: `admin/userGroups/${payload.userGroupId}/artifactAuthorizations`,
        method: "post",
        data: payload
      });
    },

    updateArtifactAuthz(payload: { userGroupId: string; artifactAuthzId: string; artifactGroupId: string; authzTypeEnumId: string; authzActionEnumId: string; authzServiceName?: string }): Promise<any> {
      return api({
        url: `admin/userGroups/${payload.userGroupId}/artifactAuthorizations/${payload.artifactAuthzId}`,
        method: "put",
        data: payload
      });
    },

    deleteArtifactAuthz(payload: { userGroupId: string; artifactAuthzId: string }): Promise<any> {
      return api({
        url: `admin/userGroups/${payload.userGroupId}/artifactAuthorizations/${payload.artifactAuthzId}`,
        method: "delete"
      });
    },

    updateUserGroupListQuery(query: { queryString: string }) {
      this.userGroupListQuery = query;
    },

    async fetchFilteredUserGroups(payload: { pageIndex: number; pageSize: number }) {
      const params = {
        pageIndex: payload.pageIndex,
        pageSize: payload.pageSize,
        orderByField: "description",
        groupTypeEnumId: "UgtUserAccess"
      } as any;

      if(this.userGroupListQuery.queryString) {
        params.description_op = "contains";
        params.description = this.userGroupListQuery.queryString;
      }

      let list = payload.pageIndex > 0 ? JSON.parse(JSON.stringify(this.userGroupList.list)) : [];

      try {
        const resp = await api({
          url: "admin/userGroups",
          method: "get",
          params
        }) as any;

        if(!commonUtil.hasError(resp)) {
          const fetched = resp.data || [];
          list = payload.pageIndex > 0 ? list.concat(fetched) : fetched;
        } else {
          throw resp.data;
        }
      } catch (error) {
        if(payload.pageIndex === 0) {
          list = [];
        }
        logger.error("Failed to fetch user groups.", error);
      }

      this.userGroupList = { list, total: list.length };
    }
  }
});
