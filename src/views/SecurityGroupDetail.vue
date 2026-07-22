<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/permissions" />
        </ion-buttons>
        <ion-title>{{ currentUserGroup?.description || currentUserGroup?.userGroupId }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <main>
        <div class="group-detail">
          <ion-card>
            <ion-item lines="none">
              <ion-label>
                <p class="overline">{{ currentUserGroup?.userGroupId }}</p>
                {{ currentUserGroup?.description || currentUserGroup?.userGroupId }}
                <p v-if="currentUserGroup?.groupTypeEnumId">
                  {{ getUserGroupTypeDescription(currentUserGroup.groupTypeEnumId) }}
                </p>
              </ion-label>
              <ion-button slot="end" fill="outline" :disabled="!userStore.hasPermission('SECURITY_UPDATE OR SECURITY_ADMIN')" @click="editUserGroup()">
                {{ translate("Edit") }}
              </ion-button>
            </ion-item>
          </ion-card>
        </div>

        <ion-segment scrollable :value="viewMode" @ion-change="updateViewMode($event)">
          <ion-segment-button value="permissions">
            <ion-label>{{ translate("Permissions") }}</ion-label>
          </ion-segment-button>
          <ion-segment-button value="authorizations">
            <ion-label>{{ translate("Authorizations") }}</ion-label>
          </ion-segment-button>
        </ion-segment>

        <template v-if="viewMode === 'permissions'">
          <ion-searchbar v-model="query" :placeholder="translate('Search permissions')" />

          <template v-if="filteredUserPermissions.length">
            <section>
              <ion-card v-for="permission in filteredUserPermissions" :key="permission.userPermissionId" button @click="togglePermission(permission)">
                <ion-card-header>
                  <div>
                    <ion-card-title>{{ permission.userPermissionId }}</ion-card-title>
                    <p>{{ permission.description }}</p>
                  </div>
                  <ion-spinner v-if="updatingPermissionIds[permission.userPermissionId]" name="crescent" data-spinner-size="medium" />
                  <ion-checkbox
                    v-else
                    :disabled="permission.isChecked ? !userStore.hasPermission('SECURITY_UPDATE OR SECURITY_ADMIN') : !userStore.hasPermission('SECURITY_CREATE OR SECURITY_ADMIN')"
                    :checked="permission.isChecked"
                  />
                </ion-card-header>
              </ion-card>
            </section>
          </template>
          <div v-else class="empty-state">
            <p>{{ translate("No record found") }}</p>
          </div>
        </template>

        <template v-else>
          <ion-item>
            <ion-button slot="end" :disabled="!userStore.hasPermission('SECURITY_CREATE OR SECURITY_ADMIN')" @click="openAddAuthorization()">
              <ion-icon slot="start" :icon="addOutline" />
              {{ translate("Add") }}
            </ion-button>
          </ion-item>

          <section v-if="groupAuthorizations.length">
            <ion-card v-for="authorization in groupAuthorizations" :key="authorization.artifactAuthzId">
              <ion-card-header>
                <ion-card-title>{{ getArtifactGroupDescription(authorization.artifactGroupId) }}</ion-card-title>
                <ion-card-subtitle>{{ authorization.artifactGroupId }}</ion-card-subtitle>
              </ion-card-header>

              <ion-list>
                <ion-item lines="full">
                  <ion-label>
                    <p class="overline">
                      {{ translate("Authz type") }}
                    </p>
                    {{ getAuthzTypeDescription(authorization.authzTypeEnumId) }}
                  </ion-label>
                </ion-item>
                <ion-item :lines="authorization.authzServiceName ? 'full' : 'none'">
                  <ion-label>
                    <p class="overline">
                      {{ translate("Action") }}
                    </p>
                    {{ getAuthzActionDescription(authorization.authzActionEnumId) }}
                  </ion-label>
                </ion-item>
                <ion-item v-if="authorization.authzServiceName" lines="none">
                  <ion-label class="ion-text-wrap">
                    <p class="overline">
                      {{ translate("Service") }}
                    </p>
                    {{ authorization.authzServiceName }}
                  </ion-label>
                </ion-item>
              </ion-list>

              <div class="card-actions">
                <ion-button fill="outline" color="medium" expand="block" :disabled="!userStore.hasPermission('SECURITY_UPDATE OR SECURITY_ADMIN')" @click="openEditAuthorization(authorization)">
                  <ion-icon slot="start" :icon="pencilOutline" />
                  {{ translate("Edit") }}
                </ion-button>
                <ion-button fill="outline" color="medium" expand="block" :disabled="!userStore.hasPermission('SECURITY_UPDATE OR SECURITY_ADMIN')" @click="confirmRemoveAuthorization(authorization)">
                  <ion-icon slot="start" :icon="trashOutline" />
                  {{ translate("Remove") }}
                </ion-button>
              </div>
            </ion-card>
          </section>
          <div v-else class="empty-state">
            <p>{{ translate("No record found") }}</p>
          </div>
        </template>
      </main>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { IonBackButton, IonButton, IonButtons, IonCard, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCheckbox, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonPage, IonSearchbar, IonSegment, IonSegmentButton, IonSpinner, IonTitle, IonToolbar, alertController, modalController } from "@ionic/vue";
import { addOutline, pencilOutline, trashOutline } from "ionicons/icons";
import { DateTime } from "luxon";
import { commonUtil, logger, translate } from "@common";
import ArtifactAuthzModal from "@/components/ArtifactAuthzModal.vue";
import EditUserGroupModal from "@/components/EditUserGroupModal.vue";
import { useAuthorizationStore } from "@/store/authorization";
import { useUtilStore } from "@/store/util";
import { useUserStore } from "@/store/user";

const props = defineProps({
  userGroupId: {
    type: String,
    required: true
  }
});

const authorizationStore = useAuthorizationStore();
const utilStore = useUtilStore();
const userStore = useUserStore();

const query = ref("");
const viewMode = ref<"permissions" | "authorizations">("permissions");
const updatingPermissionIds = ref<Record<string, boolean>>({});

const userGroups = computed(() => utilStore.getUserGroups);
const currentUserGroup = computed(() => userGroups.value.find((group: any) => group.userGroupId === props.userGroupId));
const userPermissions = computed(() => authorizationStore.getUserPermissions);
const artifactGroups = computed(() => authorizationStore.getArtifactGroups);
const authzTypeEnums = computed(() => authorizationStore.getAuthzTypeEnums);
const authzActionEnums = computed(() => authorizationStore.getAuthzActionEnums);
const userGroupTypeEnums = computed(() => authorizationStore.getUserGroupTypeEnums);
const groupPermissions = computed(() => authorizationStore.getGroupPermissions(props.userGroupId));
const groupAuthorizations = computed(() => authorizationStore.getGroupAuthorizations(props.userGroupId));

const filteredUserPermissions = computed(() => {
  const queryString = query.value.trim().toLowerCase();

  return Object.values(userPermissions.value)
    .filter((permission: any) => !queryString ||
      permission.userPermissionId.toLowerCase().includes(queryString) ||
      (permission.description && permission.description.toLowerCase().includes(queryString)))
    .map((permission: any) => ({
      ...permission,
      isChecked: !!groupPermissions.value[permission.userPermissionId]
    }));
});

const getArtifactGroupDescription = (artifactGroupId: string) => {
  return artifactGroups.value.find((artifactGroup: any) => artifactGroup.artifactGroupId === artifactGroupId)?.description || artifactGroupId;
};

const getAuthzTypeDescription = (authzTypeEnumId: string) => {
  return authzTypeEnums.value.find((authzType: any) => authzType.enumId === authzTypeEnumId)?.description || authzTypeEnumId;
};

const getAuthzActionDescription = (authzActionEnumId: string) => {
  return authzActionEnums.value.find((authzAction: any) => authzAction.enumId === authzActionEnumId)?.description || authzActionEnumId;
};

const getUserGroupTypeDescription = (groupTypeEnumId: string) => {
  return userGroupTypeEnums.value.find((groupType: any) => groupType.enumId === groupTypeEnumId)?.description || groupTypeEnumId;
};

const loadSegmentData = async () => {
  if(viewMode.value === "permissions") {
    await authorizationStore.fetchUserGroupPermissions(props.userGroupId);
  } else {
    await authorizationStore.fetchArtifactAuthorizations(props.userGroupId);
  }
};

onMounted(async () => {
  await Promise.all([
    utilStore.fetchUserGroups(),
    authorizationStore.fetchUserPermissions(),
    authorizationStore.fetchArtifactGroups(),
    authorizationStore.fetchAuthzEnums(),
    authorizationStore.fetchUserGroupTypeEnums()
  ]);
  await loadSegmentData();
});

const updateViewMode = async (event: CustomEvent) => {
  const nextViewMode = event.detail.value === "authorizations" ? "authorizations" : "permissions";
  if(viewMode.value === nextViewMode) {return;}

  viewMode.value = nextViewMode;
  await loadSegmentData();
};

const togglePermission = async (permission: any) => {
  updatingPermissionIds.value[permission.userPermissionId] = true;

  try {
    let resp;
    if(permission.isChecked) {
      const fromDate = groupPermissions.value[permission.userPermissionId].fromDate;
      resp = await authorizationStore.removeUserGroupPermission({
        userGroupId: props.userGroupId,
        userPermissionId: permission.userPermissionId,
        fromDate,
        thruDate: DateTime.now().toMillis()
      });
    } else {
      resp = await authorizationStore.addUserGroupPermission({
        userGroupId: props.userGroupId,
        userPermissionId: permission.userPermissionId,
        fromDate: DateTime.now().toMillis()
      });
    }

    if(!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate("User group permission association successfully updated."));
      await authorizationStore.fetchUserGroupPermissions(props.userGroupId);
    } else {
      throw resp.data;
    }
  } catch (error) {
    commonUtil.showToast(translate("Failed to update user group permission association."));
    logger.error(error);
  }

  updatingPermissionIds.value[permission.userPermissionId] = false;
};

const editUserGroup = async () => {
  const editUserGroupModal = await modalController.create({
    component: EditUserGroupModal,
    componentProps: { userGroup: currentUserGroup.value }
  });

  return editUserGroupModal.present();
};

const openAddAuthorization = async () => {
  const authorizationModal = await modalController.create({
    component: ArtifactAuthzModal,
    componentProps: { userGroupId: props.userGroupId }
  });

  authorizationModal.present();
  const result = await authorizationModal.onDidDismiss();
  if(result.role === "save") {
    await authorizationStore.fetchArtifactAuthorizations(props.userGroupId);
  }
};

const openEditAuthorization = async (authorization: any) => {
  const authorizationModal = await modalController.create({
    component: ArtifactAuthzModal,
    componentProps: { userGroupId: props.userGroupId, authorization }
  });

  authorizationModal.present();
  const result = await authorizationModal.onDidDismiss();
  if(result.role === "save") {
    await authorizationStore.fetchArtifactAuthorizations(props.userGroupId);
  }
};

const removeAuthorization = async (authorization: any) => {
  try {
    const resp = await authorizationStore.deleteArtifactAuthz({
      userGroupId: props.userGroupId,
      artifactAuthzId: authorization.artifactAuthzId
    });

    if(!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate("Authorization removed successfully."));
      await authorizationStore.fetchArtifactAuthorizations(props.userGroupId);
    } else {
      throw resp.data;
    }
  } catch (error) {
    commonUtil.showToast(translate("Failed to remove authorization."));
    logger.error(error);
  }
};

const confirmRemoveAuthorization = async (authorization: any) => {
  const alert = await alertController.create({
    header: translate("Remove authorization"),
    message: translate("Are you sure you want to remove this authorization?"),
    buttons: [
      { text: translate("No") },
      { text: translate("Yes"), handler: async () => { await removeAuthorization(authorization); } }
    ]
  });

  return alert.present();
};
</script>

<style scoped>
ion-segment {
  margin-bottom: 16px;
}


.section-header {
  align-items: center;
  display: flex;
  justify-content: space-between;
}

section {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
}

ion-card-header {
  align-items: center;
  display: flex;
  flex-direction: row;
  justify-content: space-between;
}

ion-card-header > ion-checkbox {
  flex-shrink: 0;
}

.empty-state {
  padding: 16px;
  text-align: center;
}

.card-actions {
  display: flex;
  gap: 8px;
  padding: 0 16px 16px;
}

.card-actions ion-button {
  flex: 1;
  margin: 0;
}

ion-content > main {
  max-width: 1110px;
  margin-right: auto;
  margin-left: auto;
}

.group-detail {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  align-items: start;
}

@media screen and (min-width: 700px) {
  ion-content > main {
    margin: var(--spacer-lg)
  }
}
</style>
