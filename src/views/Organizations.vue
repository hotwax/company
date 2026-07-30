<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-menu-button slot="start" />
        <ion-title>{{ translate("Organizations") }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <ion-searchbar
        v-model="searchText"
        :placeholder="translate('Search organizations')"
      />

      <main v-if="!hydrated">
        <ion-list>
          <ion-item v-for="index in 4" :key="index">
            <ion-label><ion-skeleton-text animated style="width: 60%" /></ion-label>
          </ion-item>
        </ion-list>
      </main>

      <main v-else-if="searchText.trim()">
        <ion-list>
          <ion-list-header>
            <ion-label>{{ translate("Search results") }}</ion-label>
          </ion-list-header>
          <ion-item
            v-for="node in searchResults"
            :key="node.partyId"
            button
            :router-link="`/organization-details/${encodeURIComponent(node.partyId)}`"
            detail
          >
            <ion-label class="ion-text-wrap">
              {{ node.groupName || node.partyId }}
              <p>{{ node.path.join(" / ") }}</p>
            </ion-label>
            <ion-badge v-if="node.partyId === primaryOrganizationId" slot="end">
              {{ translate("Primary") }}
            </ion-badge>
          </ion-item>
          <ion-item v-if="!searchResults.length" lines="none">
            <ion-label>{{ translate("No organizations found") }}</ion-label>
          </ion-item>
        </ion-list>
      </main>

      <main v-else-if="organizations.length">
        <ion-card v-if="forest.anomalies.length" color="warning">
          <ion-card-header>
            <ion-card-title>{{ translate("Hierarchy needs attention") }}</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <p v-for="(anomaly, index) in forest.anomalies" :key="`${anomaly.code}-${index}`">
              {{ anomalyMessage(anomaly) }}
            </p>
          </ion-card-content>
        </ion-card>

        <ion-list :aria-label="translate('Organization hierarchy')">
          <OrganizationTreeItem
            v-for="root in forest.roots"
            :key="root.partyId"
            :node="root"
            :primary-id="primaryOrganizationId"
          />
        </ion-list>
      </main>

      <main v-else>
        <ion-card class="ion-text-center">
          <ion-card-header>
            <ion-icon :icon="businessOutline" color="medium" size="large" />
            <ion-card-title>{{ translate("No organizations yet") }}</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <p>
              {{ translate("Create your first organization to start building your internal company hierarchy.") }}
            </p>
            <ion-button v-if="canManage" class="ion-margin-top" @click="openCreateModal()">
              {{ translate("Create your first organization") }}
              <ion-icon slot="end" :icon="addOutline" />
            </ion-button>
          </ion-card-content>
        </ion-card>
      </main>

      <ion-fab v-if="canManage" slot="fixed" vertical="bottom" horizontal="end">
        <ion-fab-button :aria-label="translate('Create organization')" @click="openCreateModal()">
          <ion-icon :icon="addOutline" />
        </ion-fab-button>
      </ion-fab>

      <ion-modal :is-open="showCreate" @did-dismiss="closeCreateModal()">
        <ion-header>
          <ion-toolbar>
            <ion-buttons slot="start">
              <ion-button @click="closeCreateModal()">
                {{ translate("Cancel") }}
              </ion-button>
            </ion-buttons>
            <ion-title>{{ translate("Create organization") }}</ion-title>
            <ion-buttons slot="end">
              <ion-button :disabled="saving || !canCreate" @click="saveOrganization()">
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
                :label="translate('Subsidiary ID')"
                :helper-text="translate('Mapped subsidiary ID used by order exports.')"
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
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { commonUtil, translate } from "@common";
import {
  IonBadge,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonMenuButton,
  IonModal,
  IonPage,
  IonSearchbar,
  IonSelect,
  IonSelectOption,
  IonSkeletonText,
  IonTitle,
  IonToolbar,
  onIonViewWillEnter,
} from "@ionic/vue";
import { addOutline, businessOutline } from "ionicons/icons";
import { computed, ref, watch } from "vue";
import OrganizationTreeItem from "@/components/organization/OrganizationTreeItem.vue";
import {
  type OrganizationAnomaly,
  createOrganization,
  suggestOrganizationId,
  useOrganizations,
  usePrimaryOrganization,
} from "@/composables/useOrganizations";
import { useAuth } from "@/composables/useSecurity";
import router from "@/router";
import { getResponseErrorMessage } from "@/utils";

const { organizations, forest, hydrated } = useOrganizations();
const { primaryOrganizationId, load: loadPrimaryOrganization } = usePrimaryOrganization();
const { hasPermission } = useAuth();
const canManage = computed(() => hasPermission("PARTYMGR_ADMIN"));
const searchText = ref("");
const showCreate = ref(false);
const groupName = ref("");
const partyId = ref("");
const externalId = ref("");
const parentPartyId = ref("");
const partyIdManuallyEdited = ref(false);
const saving = ref(false);
const canCreate = computed(() => Boolean(groupName.value.trim() && partyId.value.trim()));

const searchResults = computed(() => {
  const term = searchText.value.trim().toLowerCase();
  if(!term) {return [];}

  return [...forest.value.nodesById.values()].filter((node) =>
    `${node.partyId} ${node.groupName ?? ""} ${node.externalId ?? ""}`
      .toLowerCase()
      .includes(term));
});

function anomalyMessage(anomaly: OrganizationAnomaly): string {
  if(anomaly.code === "missing-parent") {
    return translate("Organization has a relationship to a missing parent: {partyId}", {
      partyId: anomaly.relatedPartyId,
    });
  }
  if(anomaly.code === "missing-child") {
    return translate("Organization has a relationship to a missing child: {partyId}", {
      partyId: anomaly.relatedPartyId,
    });
  }
  if(anomaly.code === "multiple-parents") {
    return translate("Organization has multiple active parents: {partyId}", { partyId: anomaly.partyId });
  }
  if(anomaly.code === "self-parent") {
    return translate("Organization is its own parent: {partyId}", { partyId: anomaly.partyId });
  }

  return translate("Organization hierarchy contains a cycle at: {partyId}", { partyId: anomaly.partyId });
}

watch(groupName, (name) => {
  if(!partyIdManuallyEdited.value) {partyId.value = suggestOrganizationId(name);}
});

function openCreateModal() {
  groupName.value = "";
  partyId.value = "";
  externalId.value = "";
  parentPartyId.value = "";
  partyIdManuallyEdited.value = false;
  showCreate.value = true;
}

function closeCreateModal() {
  showCreate.value = false;
}

async function saveOrganization() {
  saving.value = true;
  try {
    const createdPartyId = await createOrganization({
      partyId: partyId.value,
      groupName: groupName.value,
      externalId: externalId.value,
      parentPartyId: parentPartyId.value || undefined,
    });
    closeCreateModal();
    await router.push(`/organization-details/${encodeURIComponent(createdPartyId)}`);
  } catch (error) {
    await commonUtil.showToast(getResponseErrorMessage(error, translate("Failed to create organization.")));
  } finally {
    saving.value = false;
  }
}

onIonViewWillEnter(() => void loadPrimaryOrganization());
</script>

<style scoped>
ion-content {
  --padding-bottom: var(--spacer-2xl);
}

</style>
