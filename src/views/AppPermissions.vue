<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-menu-button slot="start" />
        <ion-title>{{ translate("App permissions") }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content data-testid="app-permissions-page">
      <ion-searchbar v-model="query" :placeholder="translate('Search apps and permissions')" />

      <div class="app-permissions">
        <aside>
          <ion-list>
            <ion-item v-for="app in filteredApps" :key="app.appId" button detail @click="selectApp(app.appId)">
              <ion-label :color="app.appId === selectedAppId ? 'primary' : undefined">
                {{ app.appName }}
                <p>{{ availablePermissions(app).length }} {{ translate("Configured permissions") }}</p>
              </ion-label>
            </ion-item>
          </ion-list>
        </aside>

        <main v-if="selectedApp">
          <ion-item lines="none">
            <ion-icon slot="start" :icon="shieldCheckmarkOutline" />
            <ion-label>
              <ion-note>{{ selectedApp.appId }}</ion-note>
              <h1>{{ selectedApp.appName }}</h1>
            </ion-label>
          </ion-item>

          <div v-if="loading" class="loading-state">
            <ion-spinner name="crescent" />
          </div>

          <div v-else-if="loadError" class="error-state">
            <p>{{ translate("Unable to load permission assignments.") }}</p>
            <ion-button fill="outline" @click="loadSelectedApp">
              {{ translate("Retry") }}
            </ion-button>
          </div>

          <section v-else>
            <AppPermissionCard
              v-for="permission in filteredPermissions"
              :key="permission.permissionId"
              :permission="permission"
              :active-groups="activeGroups(permission.permissionId)"
              :can-manage="canManage"
              @history="openHistory"
              @manage="openManageGroups"
              @users="openUsers"
            />
          </section>

          <div v-if="!loading && !loadError && !filteredPermissions.length" class="empty-state">
            <p>{{ translate("No record found") }}</p>
          </div>
        </main>
      </div>

      <ion-modal :is-open="showHistory" @did-dismiss="closeHistory">
        <ion-header>
          <ion-toolbar>
            <ion-buttons slot="start">
              <ion-button @click="closeHistory()">
                <ion-icon slot="icon-only" :icon="closeOutline" />
              </ion-button>
            </ion-buttons>
            <ion-title>{{ translate("Security group history") }}</ion-title>
          </ion-toolbar>
        </ion-header>

        <ion-content>
          <ion-list v-if="historyRecords.length">
            <ion-item v-for="record in historyRecords" :key="`${record.groupId}-${record.fromDate || ''}-${record.thruDate || ''}`">
              <ion-label>
                {{ record.groupName || record.groupId }}
                <p>{{ record.groupId }}</p>
              </ion-label>
              <ion-note slot="end">
                {{ getDateTime(record.fromDate) }}
                -
                {{ record.thruDate ? getDateTime(record.thruDate) : translate("Current") }}
              </ion-note>
            </ion-item>
          </ion-list>

          <div v-else class="empty-state">
            <p>{{ translate("No history found.") }}</p>
          </div>
        </ion-content>
      </ion-modal>

      <ion-modal :is-open="showManageGroups" @did-dismiss="closeManageGroups">
        <ion-header>
          <ion-toolbar>
            <ion-buttons slot="start">
              <ion-button @click="closeManageGroups()">
                <ion-icon slot="icon-only" :icon="closeOutline" />
              </ion-button>
            </ion-buttons>
            <ion-title>{{ translate("Select security groups") }}</ion-title>
          </ion-toolbar>
        </ion-header>

        <ion-content>
          <ion-searchbar v-model="manageQuery" :placeholder="translate('Search security groups')" />

          <ion-list v-if="filteredSecurityGroups.length">
            <ion-item v-for="securityGroup in filteredSecurityGroups" :key="securityGroup.groupId">
              <ion-checkbox
                :checked="isSelected(securityGroup.groupId)"
                :disabled="isChangeDisabled(securityGroup.groupId)"
                @ion-change="toggleSecurityGroup(securityGroup)"
              >
                <ion-label>
                  {{ securityGroup.groupName || securityGroup.groupId }}
                  <p>{{ securityGroup.groupId }}</p>
                </ion-label>
              </ion-checkbox>
            </ion-item>
          </ion-list>

          <div v-else class="empty-state">
            <p>{{ translate("No security groups found") }}</p>
          </div>

          <ion-fab slot="fixed" vertical="bottom" horizontal="end">
            <ion-fab-button @click="saveManageGroups()">
              <ion-icon :icon="saveOutline" />
            </ion-fab-button>
          </ion-fab>
        </ion-content>
      </ion-modal>

      <ion-modal :is-open="showUsers" @did-dismiss="closeUsers">
        <ion-header>
          <ion-toolbar>
            <ion-buttons slot="start">
              <ion-button @click="closeUsers">
                <ion-icon slot="icon-only" :icon="closeOutline" />
              </ion-button>
            </ion-buttons>
            <ion-title>{{ usersPermission.description }}</ion-title>
          </ion-toolbar>
        </ion-header>

        <ion-content>
          <ion-searchbar v-model="usersQuery" :placeholder="translate('Search users')" />

          <!-- Users are fetched per EXPANDED group, on demand — see the note on openUsers(). -->
          <ion-accordion-group v-if="usersGroups.length" :multiple="true" :value="expandedUserGroups" @ion-change="onExpandedUserGroupsChange($event)">
            <ion-accordion v-for="group in usersGroups" :key="group.groupId" :value="group.groupId">
              <ion-item slot="header" color="light">
                <ion-label>
                  {{ group.groupName || group.groupId }}
                  <p>{{ group.groupId }}</p>
                </ion-label>
                <ion-note v-if="usersForGroup(group.groupId)" slot="end">
                  {{ filteredUsers(group.groupId).length }}
                </ion-note>
              </ion-item>

              <div slot="content">
                <div v-if="loadingUserGroups.includes(group.groupId)" class="loading-state">
                  <ion-spinner name="crescent" />
                </div>

                <ion-list v-else>
                  <ion-item v-for="user in filteredUsers(group.groupId)" :key="user.userId || user.partyId">
                    <ion-label>
                      {{ displayName(user) }}
                      <p>{{ user.userId || user.partyId }}</p>
                    </ion-label>
                  </ion-item>

                  <ion-item v-if="!filteredUsers(group.groupId).length" lines="none">
                    <ion-label color="medium">
                      {{ translate("No users found") }}
                    </ion-label>
                  </ion-item>
                </ion-list>
              </div>
            </ion-accordion>
          </ion-accordion-group>

          <div v-if="!usersGroups.length" class="empty-state">
            <p>{{ translate("No security groups assigned") }}</p>
          </div>
        </ion-content>
      </ion-modal>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { commonUtil, logger, translate } from "@common"
import { IonAccordion, IonAccordionGroup, IonButton, IonButtons, IonCheckbox, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonModal, IonNote, IonPage, IonSearchbar, IonSpinner, IonTitle, IonToolbar } from "@ionic/vue"
import { closeOutline, saveOutline, shieldCheckmarkOutline } from "ionicons/icons"
import { DateTime } from "luxon"
import { computed, ref, watch } from "vue"
import AppPermissionCard from "@/components/security/AppPermissionCard.vue"
import { useAppPermissions } from "@/composables/useAppPermissions"
import { useAuth } from "@/composables/useSecurity"
import { appPermissionCatalogs } from "@/config/appPermissions"
import type { AppPermissionCatalog, AppPermissionDefinition } from "@/config/appPermissions"
import router from "@/router"
import { toEpochMillis } from "@/utils/appPermissionTime"

const {
  securityGroups,
  getPermissionById,
  activeGroupsByPermission,
  permissionHistory,
  loadAssignments,
  savePermissionGroups,
  loadGroupUsers,
  usersForGroup
} = useAppPermissions()
const { hasPermission } = useAuth();
const loading = ref(false)
const loadError = ref(false)
const query = ref("")

const getAppId = (appId: unknown) => {
  const requestedAppId = Array.isArray(appId) ? appId[0] : appId

  return typeof requestedAppId === "string" && appPermissionCatalogs.some((app) => app.appId === requestedAppId)
    ? requestedAppId
    : appPermissionCatalogs[0]?.appId || ""
}

const selectedAppId = ref<string>(getAppId(router.currentRoute.value.query.appId))

const canCreate = computed(() => hasPermission("APP_PERMISSION_CREATE OR SECURITY_ADMIN"))
const canUpdate = computed(() => hasPermission("APP_PERMISSION_UPDATE OR SECURITY_ADMIN"))
const canManage = computed(() => canCreate.value || canUpdate.value)
const selectedApp = computed<AppPermissionCatalog | undefined>(() => appPermissionCatalogs.find((app) => app.appId === selectedAppId.value) || appPermissionCatalogs[0])

const matchesPermission = (permission: AppPermissionDefinition, queryString: string) => {
  return [permission.permissionId, permission.description]
    .some((value) => value.toLowerCase().includes(queryString))
}

const availablePermissions = (app: AppPermissionCatalog): AppPermissionDefinition[] => {
  return app.permissionIds.flatMap((permissionId) => {
    const permission = getPermissionById(permissionId)

    return permission ? [permission] : []
  })
}

const filteredApps = computed<readonly AppPermissionCatalog[]>(() => {
  const queryString = query.value.trim().toLowerCase()
  if(!queryString) {return appPermissionCatalogs}

  return appPermissionCatalogs.filter((app) => app.appName.toLowerCase().includes(queryString) ||
    app.appId.toLowerCase().includes(queryString) ||
    app.permissionIds.some((permissionId) => permissionId.toLowerCase().includes(queryString)) ||
    availablePermissions(app).some((permission) => matchesPermission(permission, queryString)))
})

const filteredPermissions = computed<readonly AppPermissionDefinition[]>(() => {
  if(!selectedApp.value) {return []}
  const queryString = query.value.trim().toLowerCase()

  return queryString
    ? availablePermissions(selectedApp.value).filter((permission) => matchesPermission(permission, queryString))
    : availablePermissions(selectedApp.value)
})

const activeGroups = (permissionId: string) => activeGroupsByPermission(permissionId)

const loadSelectedApp = async () => {
  if(!selectedApp.value) {return}
  loading.value = true
  loadError.value = false
  try {
    await loadAssignments()
  } catch (error) {
    logger.error("Failed to load app permission assignments.", error instanceof Error ? error.message : String(error))
    loadError.value = true
    commonUtil.showToast(translate("Something went wrong."))
  } finally {
    loading.value = false
  }
}

watch(() => router.currentRoute.value.query.appId, async (appId) => {
  selectedAppId.value = getAppId(appId)
  await loadSelectedApp()
}, { immediate: true })

const selectApp = async (appId: string) => {
  await router.replace({
    name: "AppPermissions",
    query: {
      ...router.currentRoute.value.query,
      appId: getAppId(appId)
    }
  })
}

// --- App permission modals (inline) ---
const showHistory = ref(false)
const historyRecords = ref<any[]>([])

const showManageGroups = ref(false)
const managePermission = ref<any>(null)
const manageActiveGroups = ref<any[]>([])
const manageSecurityGroups = ref<any[]>([])
const manageQuery = ref("")
const selectedGroups = ref<any[]>([])

const showUsers = ref(false)
const usersPermission = ref<any>({})
const usersGroups = ref<any[]>([])
const usersQuery = ref("")
const expandedUserGroups = ref<string[]>([])
const loadingUserGroups = ref<string[]>([])

const filteredSecurityGroups = computed(() => {
  const queryString = manageQuery.value.trim().toLowerCase()
  if(!queryString) {return manageSecurityGroups.value}

  return manageSecurityGroups.value.filter((securityGroup: any) => {
    return securityGroup.groupId.toLowerCase().includes(queryString) ||
      (securityGroup.groupName && securityGroup.groupName.toLowerCase().includes(queryString))
  })
})

const usersNormalizedQuery = computed(() => usersQuery.value.trim().toLowerCase())

const getDateTime = (time: any) => {
  if(!time) {return ""}
  const millis = toEpochMillis(time)
  if(millis === undefined) {return ""}

  return DateTime.fromMillis(millis).toLocaleString(DateTime.DATETIME_MED)
}

const isSelected = (groupId: string) => selectedGroups.value.some((group: any) => group.groupId === groupId)

const wasOriginallySelected = (groupId: string) => manageActiveGroups.value.some((group: any) => group.groupId === groupId)

const isChangeDisabled = (groupId: string) => wasOriginallySelected(groupId) ? !canUpdate.value : !canCreate.value

const toggleSecurityGroup = (securityGroup: any) => {
  if(isChangeDisabled(securityGroup.groupId)) {return}

  if(isSelected(securityGroup.groupId)) {
    selectedGroups.value = selectedGroups.value.filter((group: any) => group.groupId !== securityGroup.groupId)

    return
  }

  selectedGroups.value.push({
    groupId: securityGroup.groupId,
    groupName: securityGroup.groupName
  })
}

const displayName = (user: any) => user.fullName || [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || user.userId || user.partyId

const filteredUsers = (groupId: string) => {
  const users = usersForGroup(groupId) || []
  if(!usersNormalizedQuery.value) {return users}

  return users.filter((user: any) => [displayName(user), user.username, user.userId, user.partyId]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(usersNormalizedQuery.value)))
}

const closeHistory = () => {
  showHistory.value = false
}

const closeManageGroups = () => {
  showManageGroups.value = false
}

const closeUsers = () => {
  showUsers.value = false
}

const openHistory = (permission: AppPermissionDefinition) => {
  historyRecords.value = permissionHistory(permission.permissionId)
  showHistory.value = true
}

const openManageGroups = (permission: AppPermissionDefinition) => {
  managePermission.value = permission
  manageActiveGroups.value = activeGroups(permission.permissionId)
  manageSecurityGroups.value = securityGroups.value
  manageQuery.value = ""
  selectedGroups.value = manageActiveGroups.value.map((group: any) => ({
    groupId: group.groupId,
    groupName: group.groupName,
    fromDate: group.fromDate
  }))
  showManageGroups.value = true
}

const saveManageGroups = async () => {
  const originalGroups = manageActiveGroups.value
  const selected = selectedGroups.value

  try {
    const originalIds = originalGroups.map((group: any) => group.groupId)
    const selectedIds = selected.map((group: any) => group.groupId)
    const addsAssignments = selectedIds.some((groupId: string) => !originalIds.includes(groupId))
    const removesAssignments = originalIds.some((groupId: string) => !selectedIds.includes(groupId))
    if((addsAssignments && !canCreate.value) || (removesAssignments && !canUpdate.value)) {
      commonUtil.showToast(translate("You do not have permission to make this change."))

      return
    }

    const outcome = await savePermissionGroups(managePermission.value.permissionId, originalGroups, selected)
    if(outcome.failed && outcome.succeeded) {
      commonUtil.showToast(translate("Some permission assignments were updated, but others failed. The latest state has been reloaded."))
    } else if(outcome.failed) {
      commonUtil.showToast(translate("Failed to update user group permission association."))
    } else {
      commonUtil.showToast(translate("User group permission association successfully updated."))
    }
  } catch (error) {
    logger.error("Failed to update app permission assignments.", error instanceof Error ? error.message : String(error))
    commonUtil.showToast(translate("Failed to update user group permission association."))
  } finally {
    closeManageGroups()
  }
}

/**
 * Opening the users modal fetches NOTHING — each group's users load when that group is expanded.
 * The previous version did `Promise.all(groups.map(fetchGroupUsers))` here: one
 * `admin/groups/{id}/users` request per active group, the N+1 recorded against this page in
 * docs/cache-sync-remaining-work.md §2. The endpoint is per-group and membership is not cached, so
 * on-demand loading (memoized in useAppPermissions) is the fix.
 */
const openUsers = (permission: AppPermissionDefinition) => {
  usersPermission.value = permission
  usersGroups.value = activeGroups(permission.permissionId)
  usersQuery.value = ""
  expandedUserGroups.value = []
  showUsers.value = true
}

const loadUsersForGroup = async (groupId: string) => {
  if(usersForGroup(groupId) || loadingUserGroups.value.includes(groupId)) {return}
  loadingUserGroups.value = [...loadingUserGroups.value, groupId]
  try {
    await loadGroupUsers(groupId)
  } catch (error) {
    logger.error("Failed to load users with app permission access.", error instanceof Error ? error.message : String(error))
    commonUtil.showToast(translate("Something went wrong."))
  } finally {
    loadingUserGroups.value = loadingUserGroups.value.filter((id) => id !== groupId)
  }
}

const onExpandedUserGroupsChange = async (event: CustomEvent) => {
  const value = (event.detail as any)?.value
  const expanded: string[] = Array.isArray(value) ? value : value ? [value] : []
  expandedUserGroups.value = expanded
  await Promise.all(expanded.map((groupId) => loadUsersForGroup(groupId)))
}
</script>

<style scoped>
.app-permissions {
  display: grid;
  gap: var(--spacer-base);
  grid-template-columns: minmax(220px, 320px) minmax(0, 1fr);
  padding: var(--spacer-sm);
}

section {
  display: grid;
  gap: var(--spacer-base);
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
}

.empty-state,
.error-state,
.loading-state {
  padding: var(--spacer-base);
  text-align: center;
}

@media (max-width: 768px) {
  .app-permissions {
    grid-template-columns: 1fr;
  }
}
</style>
