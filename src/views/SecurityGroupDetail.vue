<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/security-groups" />
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

      <ion-modal :is-open="showArtifactAuthzModal" @didDismiss="closeArtifactAuthzModal">
        <ion-header>
          <ion-toolbar>
            <ion-buttons slot="start">
              <ion-button @click="closeArtifactAuthzModal()">
                <ion-icon slot="icon-only" :icon="closeOutline" />
              </ion-button>
            </ion-buttons>
            <ion-title>{{ isEditMode ? translate("Update authorization") : translate("Add authorization") }}</ion-title>
          </ion-toolbar>
        </ion-header>

        <ion-content>
          <form @keyup.enter="saveArtifactAuthz()">
            <ion-item lines="full">
              <ion-select v-model="form.artifactGroupId" :label="translate('Artifact group')" interface="popover" :disabled="isEditMode">
                <ion-select-option v-for="artifactGroup in artifactGroups" :key="artifactGroup.artifactGroupId" :value="artifactGroup.artifactGroupId">
                  {{ artifactGroup.description || artifactGroup.artifactGroupId }} [{{ artifactGroup.artifactGroupId }}]
                </ion-select-option>
              </ion-select>
            </ion-item>
            <ion-item lines="full">
              <ion-select v-model="form.authzTypeEnumId" :label="translate('Authz type')" interface="popover">
                <ion-select-option v-for="authzType in authzTypeEnums" :key="authzType.enumId" :value="authzType.enumId">
                  {{ authzType.description || authzType.enumId }}
                </ion-select-option>
              </ion-select>
            </ion-item>
            <ion-item lines="full">
              <ion-select v-model="form.authzActionEnumId" :label="translate('Action')" interface="popover">
                <ion-select-option v-for="authzAction in authzActionEnums" :key="authzAction.enumId" :value="authzAction.enumId">
                  {{ authzAction.description || authzAction.enumId }}
                </ion-select-option>
              </ion-select>
            </ion-item>
            <ion-item lines="none">
              <ion-input v-model="form.authzServiceName" :label="translate('Authz service name')" placeholder="co.hotwax.SomeServices.some#Service" />
            </ion-item>
          </form>
        </ion-content>

        <ion-fab slot="fixed" vertical="bottom" horizontal="end">
          <ion-fab-button :disabled="!isFormValid()" @click="saveArtifactAuthz()">
            <ion-icon :icon="saveOutline" />
          </ion-fab-button>
        </ion-fab>
      </ion-modal>

      <ion-modal :is-open="showEditUserGroupModal" @didDismiss="closeEditUserGroupModal">
        <ion-header>
          <ion-toolbar>
            <ion-buttons slot="start">
              <ion-button @click="closeEditUserGroupModal()">
                <ion-icon slot="icon-only" :icon="closeOutline" />
              </ion-button>
            </ion-buttons>
            <ion-title>{{ translate("Update user group") }}</ion-title>
          </ion-toolbar>
        </ion-header>

        <ion-content>
          <form @keyup.enter="updateUserGroup()">
            <ion-item lines="none">
              <ion-textarea v-model="description" :label="translate('Description')" :counter="true" :maxlength="255" :auto-grow="true" />
            </ion-item>
          </form>
        </ion-content>

        <ion-fab slot="fixed" vertical="bottom" horizontal="end">
          <ion-fab-button :disabled="description === (currentUserGroup?.description || '')" @click="updateUserGroup()">
            <ion-icon :icon="saveOutline" />
          </ion-fab-button>
        </ion-fab>
      </ion-modal>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { IonBackButton, IonButton, IonButtons, IonCard, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCheckbox, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonModal, IonPage, IonSearchbar, IonSegment, IonSegmentButton, IonSelect, IonSelectOption, IonSpinner, IonTextarea, IonTitle, IonToolbar, alertController } from "@ionic/vue";
import { addOutline, closeOutline, pencilOutline, saveOutline, trashOutline } from "ionicons/icons";
import { DateTime } from "luxon";
import { commonUtil, logger, translate } from "@common";
import {
  addUserGroupPermission,
  createArtifactAuthz,
  deleteArtifactAuthz,
  removeUserGroupPermission,
  updateArtifactAuthz,
  updateUserGroup as updateUserGroupRequest,
  useArtifactAuthorizations,
  useArtifactGroups,
  usePermissions,
  useUserGroupPermissions,
  useUserGroupRecord,
} from "@/composables/useSecurity";
import { useTypedEnums } from "@/composables/useSeed";
import { useUserStore } from "@/store/user";

const props = defineProps({
  userGroupId: {
    type: String,
    required: true
  }
});

// Session permissions only — every other read now comes from the security composables.
const userStore = useUserStore();

const query = ref("");
const viewMode = ref<"permissions" | "authorizations">("permissions");
const updatingPermissionIds = ref<Record<string, boolean>>({});

const showArtifactAuthzModal = ref(false);
const selectedAuthorization = ref<any>(null);
const form = ref<any>({
  artifactGroupId: "",
  authzTypeEnumId: "",
  authzActionEnumId: "",
  authzServiceName: ""
});

const showEditUserGroupModal = ref(false);
const description = ref("");

// Cached reads: the group itself, the permission catalog, and the three enum slices all come from
// the reference cache and re-emit reactively — no onMounted fetches for any of them.
const { record: currentUserGroup } = useUserGroupRecord(props.userGroupId);
const { permissions: userPermissions } = usePermissions();
const { values: authzTypeEnums, descriptionById: authzTypeDescriptions } = useTypedEnums("AuthzType");
const { values: authzActionEnums, descriptionById: authzActionDescriptions } = useTypedEnums("AuthzAction");
const { descriptionById: userGroupTypeDescriptions } = useTypedEnums("UserGroupType");

// Live reads: per-group associations (no cached table), fetched for this group only.
const { artifactGroups, load: loadArtifactGroups } = useArtifactGroups();
const { activePermissions: groupPermissions, load: loadGroupPermissions } = useUserGroupPermissions(props.userGroupId);
const { authorizations: groupAuthorizations, load: loadGroupAuthorizations } = useArtifactAuthorizations(props.userGroupId);

const isEditMode = computed(() => !!selectedAuthorization.value?.artifactAuthzId);

const filteredUserPermissions = computed(() => {
  const queryString = query.value.trim().toLowerCase();

  // Judgment call: the old store listed permissions in the server's (unspecified) response order;
  // the cached catalog is description-sorted, matching every other lookup list in the app.
  return userPermissions.value
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
  return authzTypeDescriptions.value[authzTypeEnumId] || authzTypeEnumId;
};

const getAuthzActionDescription = (authzActionEnumId: string) => {
  return authzActionDescriptions.value[authzActionEnumId] || authzActionEnumId;
};

const getUserGroupTypeDescription = (groupTypeEnumId: string) => {
  return userGroupTypeDescriptions.value[groupTypeEnumId] || groupTypeEnumId;
};

const loadSegmentData = async () => {
  if(viewMode.value === "permissions") {
    await loadGroupPermissions();
  } else {
    await loadGroupAuthorizations();
  }
};

onMounted(async () => {
  // Artifact groups are the one remaining catalog fetch (not a cached domain); the segment data is
  // independent of it, so both load in parallel.
  await Promise.all([loadArtifactGroups(), loadSegmentData()]);
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
      resp = await removeUserGroupPermission({
        userGroupId: props.userGroupId,
        userPermissionId: permission.userPermissionId,
        fromDate,
        thruDate: DateTime.now().toMillis()
      });
    } else {
      resp = await addUserGroupPermission({
        userGroupId: props.userGroupId,
        userPermissionId: permission.userPermissionId,
        fromDate: DateTime.now().toMillis()
      });
    }

    if(!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate("User group permission association successfully updated."));
      await loadGroupPermissions();
    } else {
      throw resp.data;
    }
  } catch (error) {
    commonUtil.showToast(translate("Failed to update user group permission association."));
    logger.error(error);
  }

  updatingPermissionIds.value[permission.userPermissionId] = false;
};

const editUserGroup = () => {
  description.value = currentUserGroup.value?.description || "";
  showEditUserGroupModal.value = true;
};

const closeEditUserGroupModal = () => {
  showEditUserGroupModal.value = false;
};

const updateUserGroup = async () => {
  if(description.value === (currentUserGroup.value?.description || "")) {return;}

  try {
    // The composable writes through to the cached userGroups table on success, so the title and
    // detail card re-emit on their own — no hand-patched `updateUserGroupInState` equivalent.
    const resp = await updateUserGroupRequest({
      userGroupId: currentUserGroup.value?.userGroupId,
      description: description.value
    });

    if(!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate("User group updated successfully."));
      closeEditUserGroupModal();
    } else {
      throw resp.data;
    }
  } catch (error) {
    commonUtil.showToast(translate("Failed to update user group."));
    logger.error(error);
  }
};

const openAddAuthorization = () => {
  selectedAuthorization.value = null;
  form.value = {
    artifactGroupId: "",
    authzTypeEnumId: "",
    authzActionEnumId: "",
    authzServiceName: ""
  };
  showArtifactAuthzModal.value = true;
};

const openEditAuthorization = (authorization: any) => {
  selectedAuthorization.value = authorization;
  form.value = {
    artifactGroupId: authorization.artifactGroupId,
    authzTypeEnumId: authorization.authzTypeEnumId,
    authzActionEnumId: authorization.authzActionEnumId,
    authzServiceName: authorization.authzServiceName || ""
  };
  showArtifactAuthzModal.value = true;
};

const closeArtifactAuthzModal = () => {
  showArtifactAuthzModal.value = false;
};

const isFormValid = () => {
  return !!(form.value.artifactGroupId && form.value.authzTypeEnumId && form.value.authzActionEnumId);
};

const saveArtifactAuthz = async () => {
  if(!isFormValid()) {return;}

  try {
    const resp = isEditMode.value
      ? await updateArtifactAuthz({
        userGroupId: props.userGroupId,
        artifactAuthzId: selectedAuthorization.value.artifactAuthzId,
        ...form.value
      })
      : await createArtifactAuthz({
        userGroupId: props.userGroupId,
        ...form.value
      });

    if(!commonUtil.hasError(resp)) {
      commonUtil.showToast(isEditMode.value ? translate("Authorization updated successfully.") : translate("Authorization added successfully."));
      await loadGroupAuthorizations();
      closeArtifactAuthzModal();
    } else {
      throw resp.data;
    }
  } catch (error) {
    commonUtil.showToast(isEditMode.value ? translate("Failed to update authorization.") : translate("Failed to add authorization."));
    logger.error(error);
  }
};

const removeAuthorization = async (authorization: any) => {
  try {
    const resp = await deleteArtifactAuthz({
      userGroupId: props.userGroupId,
      artifactAuthzId: authorization.artifactAuthzId
    });

    if(!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate("Authorization removed successfully."));
      await loadGroupAuthorizations();
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
