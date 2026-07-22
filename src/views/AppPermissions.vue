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
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { commonUtil, logger, translate } from "@common"
import { IonButton, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonNote, IonPage, IonSearchbar, IonSpinner, IonTitle, IonToolbar, modalController } from "@ionic/vue"
import { shieldCheckmarkOutline } from "ionicons/icons"
import { computed, ref, watch } from "vue"
import { useRoute } from "vue-router"
import AppPermissionCard from "@/components/AppPermissionCard.vue"
import AppPermissionGroupModal from "@/components/AppPermissionGroupModal.vue"
import AppPermissionHistoryModal from "@/components/AppPermissionHistoryModal.vue"
import AppPermissionUsersModal from "@/components/AppPermissionUsersModal.vue"
import { appPermissionCatalogs } from "@/config/appPermissions"
import type { AppPermissionCatalog, AppPermissionDefinition } from "@/config/appPermissions"
import { useAppPermissionsStore } from "@/store/appPermissions"
import { useUserStore } from "@/store/user"

const appPermissionsStore = useAppPermissionsStore()
const userStore = useUserStore()
const route = useRoute()
const loading = ref(false)
const loadError = ref(false)
const query = ref("")

const getAppId = (appId: unknown) => {
  const requestedAppId = Array.isArray(appId) ? appId[0] : appId

  return typeof requestedAppId === "string" && appPermissionCatalogs.some((app) => app.appId === requestedAppId)
    ? requestedAppId
    : appPermissionCatalogs[0]?.appId || ""
}

const selectedAppId = ref<string>(getAppId(route.query.appId))

const canCreate = computed(() => userStore.hasPermission("APP_PERMISSION_CREATE OR SECURITY_ADMIN"))
const canUpdate = computed(() => userStore.hasPermission("APP_PERMISSION_UPDATE OR SECURITY_ADMIN"))
const canManage = computed(() => canCreate.value || canUpdate.value)
const selectedApp = computed<AppPermissionCatalog | undefined>(() => appPermissionCatalogs.find((app) => app.appId === selectedAppId.value) || appPermissionCatalogs[0])

const matchesPermission = (permission: AppPermissionDefinition, queryString: string) => {
  return [permission.permissionId, permission.description]
    .some((value) => value.toLowerCase().includes(queryString))
}

const availablePermissions = (app: AppPermissionCatalog): AppPermissionDefinition[] => {
  return app.permissionIds.flatMap((permissionId) => {
    const permission = appPermissionsStore.getPermissionById(permissionId)

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

const activeGroups = (permissionId: string) => appPermissionsStore.getActiveGroupsByPermission(permissionId)

const loadSelectedApp = async () => {
  if(!selectedApp.value) {return}
  loading.value = true
  loadError.value = false
  try {
    await appPermissionsStore.fetchAssignments()
  } catch (error) {
    logger.error("Failed to load app permission assignments.", error instanceof Error ? error.message : String(error))
    loadError.value = true
    commonUtil.showToast(translate("Something went wrong."))
  } finally {
    loading.value = false
  }
}

watch(() => route.query.appId, async (appId) => {
  selectedAppId.value = getAppId(appId)
  await loadSelectedApp()
}, { immediate: true })

const selectApp = async (appId: string) => {
  selectedAppId.value = getAppId(appId)

  const url = new URL(window.location.href)
  url.searchParams.set("appId", selectedAppId.value)
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`)

  await loadSelectedApp()
}

const openHistory = async (permission: AppPermissionDefinition) => {
  const modal = await modalController.create({
    component: AppPermissionHistoryModal,
    componentProps: { records: appPermissionsStore.getPermissionHistory(permission.permissionId) }
  })
  await modal.present()
}

const openManageGroups = async (permission: AppPermissionDefinition) => {
  const originalGroups = activeGroups(permission.permissionId)
  const modal = await modalController.create({
    component: AppPermissionGroupModal,
    componentProps: {
      activeGroups: originalGroups,
      canCreate: canCreate.value,
      canUpdate: canUpdate.value,
      permission,
      securityGroups: appPermissionsStore.securityGroups
    }
  })
  await modal.present()

  const result = await modal.onDidDismiss()
  if(result.role !== "save" || !result.data) {return}

  try {
    const originalIds = result.data.originalGroups.map((group: any) => group.groupId)
    const selectedIds = result.data.selectedGroups.map((group: any) => group.groupId)
    const addsAssignments = selectedIds.some((groupId: string) => !originalIds.includes(groupId))
    const removesAssignments = originalIds.some((groupId: string) => !selectedIds.includes(groupId))
    if((addsAssignments && !canCreate.value) || (removesAssignments && !canUpdate.value)) {
      commonUtil.showToast(translate("You do not have permission to make this change."))

      return
    }

    const outcome = await appPermissionsStore.savePermissionGroups(permission.permissionId, result.data.originalGroups, result.data.selectedGroups)
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
  }
}

const openUsers = async (permission: AppPermissionDefinition) => {
  const groups = activeGroups(permission.permissionId)
  loading.value = true
  try {
    await Promise.all(groups.map((group) => appPermissionsStore.fetchGroupUsers(group.groupId)))
    const modal = await modalController.create({
      component: AppPermissionUsersModal,
      componentProps: { groups, permission, usersByGroup: appPermissionsStore.usersByGroup }
    })
    await modal.present()
  } catch (error) {
    logger.error("Failed to load users with app permission access.", error instanceof Error ? error.message : String(error))
    commonUtil.showToast(translate("Something went wrong."))
  } finally {
    loading.value = false
  }
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
