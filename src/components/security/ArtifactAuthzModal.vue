<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal()">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ isEditMode ? translate("Update authorization") : translate("Add authorization") }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <form @keyup.enter="save()">
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
    <ion-fab-button :disabled="!isFormValid()" @click="save()">
      <ion-icon :icon="saveOutline" />
    </ion-fab-button>
  </ion-fab>
</template>

<script setup lang="ts">
import { PropType, computed, onMounted, ref } from "vue";
import { IonButton, IonButtons, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonInput, IonItem, IonSelect, IonSelectOption, IonTitle, IonToolbar, modalController } from "@ionic/vue";
import { closeOutline, saveOutline } from "ionicons/icons";
import { commonUtil, logger, translate } from "@common";
import { useAuthorizationStore } from "@/store/authorization";

const props = defineProps({
  userGroupId: {
    type: String,
    required: true
  },
  authorization: {
    type: Object as PropType<any>,
    default: null
  }
});

const authorizationStore = useAuthorizationStore();

const form = ref<any>({
  artifactGroupId: "",
  authzTypeEnumId: "",
  authzActionEnumId: "",
  authzServiceName: ""
});

const isEditMode = computed(() => !!props.authorization?.artifactAuthzId);
const artifactGroups = computed(() => authorizationStore.getArtifactGroups);
const authzTypeEnums = computed(() => authorizationStore.getAuthzTypeEnums);
const authzActionEnums = computed(() => authorizationStore.getAuthzActionEnums);

onMounted(() => {
  if(props.authorization) {
    form.value = {
      artifactGroupId: props.authorization.artifactGroupId,
      authzTypeEnumId: props.authorization.authzTypeEnumId,
      authzActionEnumId: props.authorization.authzActionEnumId,
      authzServiceName: props.authorization.authzServiceName || ""
    };
  }
});

const closeModal = () => {
  modalController.dismiss(null, "cancel");
};

const isFormValid = () => {
  return !!(form.value.artifactGroupId && form.value.authzTypeEnumId && form.value.authzActionEnumId);
};

const save = async () => {
  if(!isFormValid()) {return;}

  try {
    const resp = isEditMode.value
      ? await authorizationStore.updateArtifactAuthz({
        userGroupId: props.userGroupId,
        artifactAuthzId: props.authorization.artifactAuthzId,
        ...form.value
      })
      : await authorizationStore.createArtifactAuthz({
        userGroupId: props.userGroupId,
        ...form.value
      });

    if(!commonUtil.hasError(resp)) {
      commonUtil.showToast(isEditMode.value ? translate("Authorization updated successfully.") : translate("Authorization added successfully."));
      modalController.dismiss(null, "save");
    } else {
      throw resp.data;
    }
  } catch (error) {
    commonUtil.showToast(isEditMode.value ? translate("Failed to update authorization.") : translate("Failed to add authorization."));
    logger.error(error);
  }
};
</script>
