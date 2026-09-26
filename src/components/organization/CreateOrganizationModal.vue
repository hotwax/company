<template>
  <ion-modal :is-open="isOpen" @did-dismiss="emit('dismiss')">
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button @click="emit('dismiss')">
            {{ translate("Cancel") }}
          </ion-button>
        </ion-buttons>
        <ion-title>{{ translate("Create organization") }}</ion-title>
        <ion-buttons slot="end">
          <ion-button :disabled="saving || !isValid" @click="save()">
            {{ translate("Create") }}
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <ion-list>
        <ion-item>
          <ion-input
            v-model="groupName"
            :label="translate('Organization name')"
            label-placement="stacked"
            :maxlength="100"
            required
          />
        </ion-item>
        <ion-item>
          <ion-input
            v-model="partyId"
            :label="translate('Organization ID')"
            :helper-text="translate('Generated from the name. You can edit it before creating the organization.')"
            label-placement="stacked"
            :maxlength="20"
            required
            @ion-input="partyIdManuallyEdited = true"
          />
        </ion-item>
        <ion-item>
          <ion-input
            v-model="externalId"
            :label="translate('External system ID')"
            label-placement="stacked"
          />
        </ion-item>
        <ion-item>
          <ion-select
            v-model="parentPartyId"
            :label="translate('Parent organization')"
            label-placement="stacked"
            interface="popover"
          >
            <ion-select-option value="">
              {{ translate("No parent (root organization)") }}
            </ion-select-option>
            <ion-select-option
              v-for="organization in organizations"
              :key="organization.partyId"
              :value="organization.partyId"
            >
              {{ organization.groupName || organization.partyId }}
            </ion-select-option>
          </ion-select>
        </ion-item>
      </ion-list>
    </ion-content>
  </ion-modal>
</template>

<script setup lang="ts">
import { commonUtil, translate } from "@common";
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonList,
  IonModal,
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToolbar,
} from "@ionic/vue";
import { computed, ref, watch } from "vue";
import {
  type Organization,
  createOrganization,
  suggestOrganizationId,
} from "@/composables/useOrganizations";
import { getResponseErrorMessage } from "@/utils";

const props = defineProps<{ isOpen: boolean; organizations: Organization[] }>();
const emit = defineEmits<{ dismiss: []; created: [partyId: string] }>();

const groupName = ref("");
const partyId = ref("");
const externalId = ref("");
const parentPartyId = ref("");
const partyIdManuallyEdited = ref(false);
const saving = ref(false);
const isValid = computed(() => Boolean(groupName.value.trim() && partyId.value.trim()));

watch(() => props.isOpen, (open) => {
  if(!open) {return;}
  groupName.value = "";
  partyId.value = "";
  partyIdManuallyEdited.value = false;
  externalId.value = "";
  parentPartyId.value = "";
});

watch(groupName, (name) => {
  if(!partyIdManuallyEdited.value) {partyId.value = suggestOrganizationId(name);}
});

async function save() {
  saving.value = true;
  try {
    const createdPartyId = await createOrganization({
      partyId: partyId.value,
      groupName: groupName.value,
      externalId: externalId.value,
      parentPartyId: parentPartyId.value || undefined,
    });
    emit("created", createdPartyId);
  } catch (error) {
    await commonUtil.showToast(getResponseErrorMessage(error, translate("Failed to create organization.")));
  } finally {
    saving.value = false;
  }
}
</script>
