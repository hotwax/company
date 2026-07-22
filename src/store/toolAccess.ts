import { defineStore } from 'pinia'
import { api, commonUtil, logger } from '@common'

const PAGE_SIZE = 200
const ENTITY_REST_ROOT = '/rest/e1/'

export type SecurityUserGroup = {
  userGroupId: string
  description?: string
  groupTypeEnumId?: string
  thruDate?: number | string
}

export type SecurityUserAccount = {
  userId: string
  username?: string
  userFullName?: string
  emailAddress?: string
  disabled?: string
}

export type SecurityUserGroupMember = {
  userGroupId: string
  userId: string
  fromDate: number | string
  thruDate?: number | string
  username?: string
  userFullName?: string
  emailAddress?: string
  description?: string
}

export type ArtifactGroup = {
  artifactGroupId: string
  description?: string
}

export type ArtifactGroupMember = {
  artifactGroupId: string
  artifactName: string
  artifactTypeEnumId: string
  nameIsPattern?: string
  inheritAuthz?: string
  filterMap?: string
}

export type ArtifactAuthorization = {
  artifactAuthzId: string
  userGroupId: string
  artifactGroupId: string
  authzTypeEnumId: string
  authzActionEnumId: string
  authzServiceName?: string
}

function toList(data: any, keys: string[] = []) {
  if (Array.isArray(data)) return data

  for (const key of keys) {
    if (Array.isArray(data?.[key])) return data[key]
  }

  const firstArray = Object.values(data ?? {}).find((value) => Array.isArray(value))
  return Array.isArray(firstArray) ? firstArray : []
}

function getEntityRestBaseURL() {
  return commonUtil.getMaargURL().replace(/\/rest\/s1\/?$/, '')
}

async function entityApi(config: any) {
  return api({
    ...config,
    url: `${ENTITY_REST_ROOT}${config.url}`,
    baseURL: getEntityRestBaseURL()
  })
}

async function fetchPaged(url: string, keys: string[] = [], params: any = {}) {
  const items: any[] = []
  let pageIndex = 0
  let pageItems: any[] = []

  do {
    const resp = await entityApi({
      url,
      method: 'get',
      params: { ...params, pageSize: PAGE_SIZE, pageIndex }
    }) as any
    if (resp?.data && commonUtil.hasError(resp)) throw resp.data

    pageItems = toList(resp?.data, keys)
    items.push(...pageItems)
    pageIndex++
  } while (pageItems.length >= PAGE_SIZE && pageIndex < 25)

  return items
}

export const useToolAccessStore = defineStore('toolAccess', {
  state: () => ({
    userGroups: [] as SecurityUserGroup[],
    users: [] as SecurityUserAccount[],
    artifactGroups: [] as ArtifactGroup[],
    userGroupMembers: [] as SecurityUserGroupMember[],
    artifactGroupMembers: [] as ArtifactGroupMember[],
    artifactAuthz: [] as ArtifactAuthorization[],
    selectedGroupMembers: [] as SecurityUserGroupMember[],
    selectedUserMemberships: [] as SecurityUserGroupMember[],
    selectedArtifactGroupMembers: [] as ArtifactGroupMember[],
    selectedUserGroupAuthz: [] as ArtifactAuthorization[],
    selectedArtifactGroupAuthz: [] as ArtifactAuthorization[],
    loadError: '',
    loading: false,
    saving: false
  }),

  actions: {
    async fetchReferenceData() {
      this.loading = true
      this.loadError = ''
      try {
        const [
          userGroupsResult,
          usersResult,
          artifactGroupsResult,
          userGroupMembersResult,
          artifactGroupMembersResult,
          artifactAuthzResult
        ] = await Promise.allSettled([
          fetchPaged('userGroups', ['userGroupList', 'userGroups']),
          fetchPaged('users', ['userList', 'users']),
          fetchPaged('artifactGroups', ['artifactGroupList', 'artifactGroups']),
          fetchPaged('moqui.security.UserGroupMemberUser', ['userGroupMemberUserList', 'userGroupMembers']),
          fetchPaged('moqui.security.ArtifactGroupMember', ['artifactGroupMemberList', 'artifactGroupMembers']),
          fetchPaged('moqui.security.ArtifactAuthz', ['artifactAuthzList', 'artifactAuthz'])
        ])

        if (userGroupsResult.status === 'fulfilled') this.userGroups = userGroupsResult.value
        else logger.error(userGroupsResult.reason)

        if (usersResult.status === 'fulfilled') this.users = usersResult.value
        else logger.error(usersResult.reason)

        if (artifactGroupsResult.status === 'fulfilled') this.artifactGroups = artifactGroupsResult.value
        else logger.error(artifactGroupsResult.reason)

        if (userGroupMembersResult.status === 'fulfilled') this.userGroupMembers = userGroupMembersResult.value
        else logger.error(userGroupMembersResult.reason)

        if (artifactGroupMembersResult.status === 'fulfilled') this.artifactGroupMembers = artifactGroupMembersResult.value
        else logger.error(artifactGroupMembersResult.reason)

        if (artifactAuthzResult.status === 'fulfilled') this.artifactAuthz = artifactAuthzResult.value
        else logger.error(artifactAuthzResult.reason)

        const failedLoads = [
          { label: 'security groups', result: userGroupsResult },
          { label: 'users', result: usersResult },
          { label: 'artifact groups', result: artifactGroupsResult },
          { label: 'security group memberships', result: userGroupMembersResult },
          { label: 'artifact group members', result: artifactGroupMembersResult },
          { label: 'artifact group authorizations', result: artifactAuthzResult }
        ].filter(({ result }) => result.status === 'rejected')

        if (failedLoads.length) {
          this.loadError = `Failed to load ${failedLoads.map(({ label }) => label).join(', ')}. Check Moqui security entity grants for this user.`
        }
      } catch (error) {
        logger.error(error)
        throw error
      } finally {
        this.loading = false
      }
    },

    async fetchUserGroupDetail(userGroupId: string) {
      if (!userGroupId) {
        this.selectedGroupMembers = []
        this.selectedUserGroupAuthz = []
        return
      }

      const [membersResult, authzResult] = await Promise.allSettled([
        fetchPaged('moqui.security.UserGroupMemberUser', ['userGroupMemberUserList', 'userGroupMembers'], { userGroupId }),
        fetchPaged(`userGroups/${encodeURIComponent(userGroupId)}/authz`, ['artifactAuthzList', 'authz'])
      ])

      if (membersResult.status === 'fulfilled') {
        this.selectedGroupMembers = membersResult.value
      } else {
        logger.error(membersResult.reason)
        this.selectedGroupMembers = []
      }

      if (authzResult.status === 'fulfilled') {
        this.selectedUserGroupAuthz = authzResult.value
      } else {
        logger.error(authzResult.reason)
        this.selectedUserGroupAuthz = []
      }
    },

    async fetchUserMemberships(userId: string) {
      if (!userId) {
        this.selectedUserMemberships = []
        return
      }

      try {
        this.selectedUserMemberships = await fetchPaged(
          `users/${encodeURIComponent(userId)}/groups`,
          ['userGroupMemberList', 'groups']
        )
      } catch (error) {
        logger.error(error)
        this.selectedUserMemberships = []
      }
    },

    async fetchArtifactGroupDetail(artifactGroupId: string) {
      if (!artifactGroupId) {
        this.selectedArtifactGroupMembers = []
        this.selectedArtifactGroupAuthz = []
        return
      }

      const [artifactResult, authzResult] = await Promise.allSettled([
        fetchPaged(`artifactGroups/${encodeURIComponent(artifactGroupId)}/artifacts`, ['artifactGroupMemberList', 'artifacts']),
        fetchPaged(`artifactGroups/${encodeURIComponent(artifactGroupId)}/authz`, ['artifactAuthzList', 'authz'])
      ])

      if (artifactResult.status === 'fulfilled') {
        this.selectedArtifactGroupMembers = artifactResult.value
      } else {
        logger.error(artifactResult.reason)
        this.selectedArtifactGroupMembers = []
      }

      if (authzResult.status === 'fulfilled') {
        this.selectedArtifactGroupAuthz = authzResult.value
      } else {
        logger.error(authzResult.reason)
        this.selectedArtifactGroupAuthz = []
      }
    },

    async createUserGroup(payload: { userGroupId: string, description?: string, groupTypeEnumId?: string }) {
      this.saving = true
      try {
        const data: any = {
          userGroupId: payload.userGroupId.trim(),
          description: payload.description?.trim()
        }
        if (payload.groupTypeEnumId?.trim()) data.groupTypeEnumId = payload.groupTypeEnumId.trim()

        const resp = await entityApi({ url: 'userGroups', method: 'post', data }) as any
        if (resp?.data && commonUtil.hasError(resp)) throw resp.data
        await this.fetchReferenceData()
        return resp?.data
      } catch (error) {
        logger.error(error)
        throw error
      } finally {
        this.saving = false
      }
    },

    async assignUserToGroup(userId: string, userGroupId: string) {
      this.saving = true
      try {
        const resp = await entityApi({
          url: `users/${encodeURIComponent(userId)}/groups`,
          method: 'post',
          data: {
            userId,
            userGroupId,
            fromDate: Date.now()
          }
        }) as any
        if (resp?.data && commonUtil.hasError(resp)) throw resp.data
        await Promise.all([
          this.fetchUserMemberships(userId),
          this.fetchUserGroupDetail(userGroupId),
          this.fetchReferenceData()
        ])
        return resp?.data
      } catch (error) {
        logger.error(error)
        throw error
      } finally {
        this.saving = false
      }
    },

    async expireUserGroupMembership(membership: SecurityUserGroupMember) {
      this.saving = true
      try {
        const resp = await entityApi({
          url: `users/${encodeURIComponent(membership.userId)}/groups`,
          method: 'put',
          data: {
            userId: membership.userId,
            userGroupId: membership.userGroupId,
            fromDate: membership.fromDate,
            thruDate: Date.now()
          }
        }) as any
        if (resp?.data && commonUtil.hasError(resp)) throw resp.data
        await Promise.all([
          this.fetchUserMemberships(membership.userId),
          this.fetchUserGroupDetail(membership.userGroupId),
          this.fetchReferenceData()
        ])
        return resp?.data
      } catch (error) {
        logger.error(error)
        throw error
      } finally {
        this.saving = false
      }
    },

    async createArtifactGroup(payload: { artifactGroupId: string, description?: string }) {
      this.saving = true
      try {
        const resp = await entityApi({
          url: 'artifactGroups',
          method: 'post',
          data: {
            artifactGroupId: payload.artifactGroupId.trim(),
            description: payload.description?.trim()
          }
        }) as any
        if (resp?.data && commonUtil.hasError(resp)) throw resp.data
        await this.fetchReferenceData()
        return resp?.data
      } catch (error) {
        logger.error(error)
        throw error
      } finally {
        this.saving = false
      }
    },

    async addArtifactToGroup(payload: ArtifactGroupMember) {
      this.saving = true
      try {
        const artifactGroupId = payload.artifactGroupId.trim()
        const resp = await entityApi({
          url: `artifactGroups/${encodeURIComponent(artifactGroupId)}/artifacts`,
          method: 'post',
          data: {
            artifactGroupId,
            artifactName: payload.artifactName.trim(),
            artifactTypeEnumId: payload.artifactTypeEnumId,
            nameIsPattern: payload.nameIsPattern || 'N',
            inheritAuthz: payload.inheritAuthz || 'Y',
            filterMap: payload.filterMap?.trim() || undefined
          }
        }) as any
        if (resp?.data && commonUtil.hasError(resp)) throw resp.data
        await Promise.all([
          this.fetchArtifactGroupDetail(artifactGroupId),
          this.fetchReferenceData()
        ])
        return resp?.data
      } catch (error) {
        logger.error(error)
        throw error
      } finally {
        this.saving = false
      }
    },

    async removeArtifactFromGroup(member: ArtifactGroupMember) {
      this.saving = true
      try {
        const resp = await entityApi({
          url: `artifactGroups/${encodeURIComponent(member.artifactGroupId)}/artifacts`,
          method: 'delete',
          data: {
            artifactGroupId: member.artifactGroupId,
            artifactName: member.artifactName,
            artifactTypeEnumId: member.artifactTypeEnumId
          }
        }) as any
        if (resp?.data && commonUtil.hasError(resp)) throw resp.data
        await Promise.all([
          this.fetchArtifactGroupDetail(member.artifactGroupId),
          this.fetchReferenceData()
        ])
        return resp?.data
      } catch (error) {
        logger.error(error)
        throw error
      } finally {
        this.saving = false
      }
    },

    async grantArtifactGroupAccess(payload: ArtifactAuthorization) {
      this.saving = true
      try {
        const userGroupId = payload.userGroupId.trim()
        const artifactGroupId = payload.artifactGroupId.trim()
        const resp = await entityApi({
          url: `userGroups/${encodeURIComponent(userGroupId)}/authz`,
          method: 'post',
          data: {
            artifactAuthzId: payload.artifactAuthzId.trim(),
            userGroupId,
            artifactGroupId,
            authzTypeEnumId: payload.authzTypeEnumId,
            authzActionEnumId: payload.authzActionEnumId,
            authzServiceName: payload.authzServiceName?.trim() || undefined
          }
        }) as any
        if (resp?.data && commonUtil.hasError(resp)) throw resp.data
        await Promise.all([
          this.fetchUserGroupDetail(userGroupId),
          this.fetchArtifactGroupDetail(artifactGroupId),
          this.fetchReferenceData()
        ])
        return resp?.data
      } catch (error) {
        logger.error(error)
        throw error
      } finally {
        this.saving = false
      }
    },

    async revokeArtifactGroupAccess(authorization: ArtifactAuthorization) {
      this.saving = true
      try {
        const resp = await entityApi({
          url: `userGroups/${encodeURIComponent(authorization.userGroupId)}/authz/${encodeURIComponent(authorization.artifactAuthzId)}`,
          method: 'delete',
          data: {
            artifactAuthzId: authorization.artifactAuthzId
          }
        }) as any
        if (resp?.data && commonUtil.hasError(resp)) throw resp.data
        await Promise.all([
          this.fetchUserGroupDetail(authorization.userGroupId),
          this.fetchArtifactGroupDetail(authorization.artifactGroupId),
          this.fetchReferenceData()
        ])
        return resp?.data
      } catch (error) {
        logger.error(error)
        throw error
      } finally {
        this.saving = false
      }
    },

    clearToolAccessState() {
      this.$reset()
    }
  }
})
