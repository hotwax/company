<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-back-button slot="start" default-href="/organizations" />
        <ion-title>{{ translate("Organization details") }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <main v-if="!hydrated">
        <ion-card><ion-card-content><ion-skeleton-text animated /></ion-card-content></ion-card>
      </main>
      <main v-else-if="organization">
        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ organization.groupName || organization.partyId }}</ion-card-title>
            <ion-card-subtitle>{{ organization.partyId }}</ion-card-subtitle>
          </ion-card-header>
          <ion-card-content>
            <ion-badge v-if="organization.partyId === primaryOrganizationId">
              {{ translate("Primary organization") }}
            </ion-badge>
          </ion-card-content>
<<<<<<< HEAD
          <ion-item v-if="organization.externalId">
            <ion-label>{{ translate("External system ID") }}</ion-label>
            <ion-note slot="end">
              {{ organization.externalId }}
            </ion-note>
          </ion-item>
          <ion-item v-if="organization.statusId">
            <ion-label>{{ translate("Status") }}</ion-label>
            <ion-note slot="end">
              {{ organization.statusId }}
            </ion-note>
          </ion-item>
          <ion-item v-if="canManage && !editingName">
            <ion-button fill="clear" @click="startRename()">
              {{ translate("Rename") }}
            </ion-button>
          </ion-item>
          <ion-item v-if="editingName">
            <ion-input v-model="nextName" :label="translate('Organization name')" label-placement="stacked" />
            <ion-button slot="end" fill="clear" @click="saveRename()">
              {{ translate("Save") }}
            </ion-button>
            <ion-button slot="end" fill="clear" color="medium" @click="editingName = false">
              {{ translate("Cancel") }}
            </ion-button>
          </ion-item>
        </ion-card>

        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ translate("Hierarchy") }}</ion-card-title>
          </ion-card-header>
          <ion-item v-if="!canManage">
            <ion-label>{{ translate("Parent organization") }}</ion-label>
            <ion-note slot="end">
              {{ parentName }}
            </ion-note>
          </ion-item>
          <ion-item v-else>
            <ion-select
              v-model="selectedParentId"
              :label="translate('Parent organization')"
              label-placement="stacked"
              interface="popover"
            >
              <ion-select-option value="">
                {{ translate("No parent (root organization)") }}
              </ion-select-option>
              <ion-select-option
                v-for="candidate in parentCandidates"
                :key="candidate.partyId"
                :value="candidate.partyId"
              >
                {{ candidate.groupName || candidate.partyId }}
              </ion-select-option>
            </ion-select>
            <ion-button
              slot="end"
              fill="clear"
              :disabled="moving || Boolean(organizationAnomalies.length)"
              @click="saveParent()"
            >
              {{ translate("Save") }}
            </ion-button>
          </ion-item>
          <ion-list-header>
            <ion-label>{{ translate("Child organizations") }}</ion-label>
          </ion-list-header>
          <ion-item
            v-for="child in node?.children ?? []"
            :key="child.partyId"
            button
            :router-link="`/organization-details/${encodeURIComponent(child.partyId)}`"
          >
            <ion-label>{{ child.groupName || child.partyId }}</ion-label>
          </ion-item>
          <ion-item v-if="!node?.children.length" lines="none">
            <ion-label>{{ translate("No child organizations") }}</ion-label>
          </ion-item>
        </ion-card>

        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ translate("Owned facilities") }}</ion-card-title>
          </ion-card-header>
          <ion-item
            v-for="facility in facilities"
            :key="facility.facilityId"
            button
            :router-link="`/facility-details/${encodeURIComponent(facility.facilityId)}`"
          >
            <ion-label>
              <h2>{{ facility.facilityName || facility.facilityId }}</h2>
              <p>{{ facility.facilityId }}</p>
            </ion-label>
          </ion-item>
          <ion-item v-if="facilitiesHydrated && !facilities.length" lines="none">
            <ion-label>{{ translate("No facilities are owned by this organization") }}</ion-label>
          </ion-item>
        </ion-card>

        <ion-card v-if="organizationAnomalies.length" color="warning">
          <ion-card-header>
            <ion-card-title>{{ translate("Hierarchy needs attention") }}</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            {{ translate("This organization participates in invalid hierarchy data. Moving is disabled until the conflict is resolved.") }}
          </ion-card-content>
        </ion-card>
      </main>
      <main v-else class="empty-state">
        {{ translate("Organization not found") }}
      </main>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { commonUtil, translate } from "@common";
import {
  IonBackButton,
  IonBadge,
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonLabel,
  IonListHeader,
  IonNote,
  IonPage,
  IonSelect,
  IonSelectOption,
  IonSkeletonText,
  IonTitle,
  IonToolbar,
  onIonViewWillEnter,
} from "@ionic/vue";
import { computed, ref, watch } from "vue";
import {
  renameOrganization,
  reparentOrganization,
  useOrganizationFacilities,
  useOrganizationRecord,
  useOrganizations,
  usePrimaryOrganization,
} from "@/composables/useOrganizations";
import { useAuth } from "@/composables/useSecurity";
import { getResponseErrorMessage } from "@/utils";

const props = defineProps<{ partyId: string }>();
const { record: organization, hydrated: organizationHydrated } = useOrganizationRecord(props.partyId);
const { organizations, relationships, forest, hydrated: hierarchyHydrated } = useOrganizations();
const { facilities, hydrated: facilitiesHydrated } = useOrganizationFacilities(props.partyId);
const { primaryOrganizationId, load: loadPrimaryOrganization } = usePrimaryOrganization();
const { hasPermission } = useAuth();

const canManage = computed(() => hasPermission("PARTYMGR_ADMIN"));
const hydrated = computed(() => organizationHydrated.value && hierarchyHydrated.value);
const node = computed(() => forest.value.nodesById.get(props.partyId));
const parentId = computed(() => forest.value.parentById.get(props.partyId) ?? "");
const parentName = computed(() => {
  const parent = forest.value.nodesById.get(parentId.value);

  return parent ? parent.groupName || parent.partyId : translate("No parent (root organization)");
});
const organizationAnomalies = computed(() =>
  forest.value.anomalies.filter((anomaly) =>
    anomaly.partyId === props.partyId || anomaly.relatedPartyId === props.partyId));
const parentCandidates = computed(() =>
  organizations.value.filter((candidate) => candidate.partyId !== props.partyId));

const editingName = ref(false);
const nextName = ref("");
const selectedParentId = ref("");
const moving = ref(false);

watch(parentId, (value) => { selectedParentId.value = value; }, { immediate: true });

function startRename() {
  nextName.value = organization.value?.groupName ?? "";
  editingName.value = true;
}

async function saveRename() {
  if(!nextName.value.trim()) {return;}
  try {
    await renameOrganization(props.partyId, nextName.value);
    editingName.value = false;
    await commonUtil.showToast(translate("Organization renamed."));
  } catch (error) {
    await commonUtil.showToast(getResponseErrorMessage(error, translate("Failed to rename organization.")));
  }
}

async function saveParent() {
  moving.value = true;
  try {
    await reparentOrganization(
      props.partyId,
      selectedParentId.value || undefined,
      relationships.value,
      forest.value.parentById,
    );
    await commonUtil.showToast(translate("Parent organization updated."));
  } catch (error) {
    selectedParentId.value = parentId.value;
    await commonUtil.showToast(getResponseErrorMessage(error, translate("Failed to update parent organization.")));
  } finally {
    moving.value = false;
  }
}

onIonViewWillEnter(() => void loadPrimaryOrganization());
</script>

<style scoped>
.empty-state {
  padding: 24px;
||||||| 544075d
=======
          <ion-item v-if="!editingExternalId">
            <ion-label>
              {{ translate("External ID") }}
              <p>{{ organization.externalId || translate("Not mapped") }}</p>
            </ion-label>
            <ion-button v-if="canManage" slot="end" fill="clear" @click="startExternalIdEdit()">
              {{ translate(organization.externalId ? "Edit" : "Add") }}
            </ion-button>
          </ion-item>
          <ion-item v-else>
            <ion-input
              v-model="nextExternalId"
              data-testid="external-id-input"
              :label="translate('External ID')"
              :helper-text="translate('Leave blank to clear the external ID.')"
              label-placement="stacked"
            />
            <ion-button
              slot="end"
              data-testid="save-external-id"
              fill="clear"
              :disabled="savingExternalId"
              @click="saveExternalId()"
            >
              {{ translate("Save") }}
            </ion-button>
            <ion-button
              slot="end"
              fill="clear"
              color="medium"
              :disabled="savingExternalId"
              @click="editingExternalId = false"
            >
              {{ translate("Cancel") }}
            </ion-button>
          </ion-item>
          <ion-item v-if="organization.statusId">
            <ion-label>{{ translate("Status") }}</ion-label>
            <ion-note slot="end">
              {{ organization.statusId }}
            </ion-note>
          </ion-item>
          <ion-item v-if="canManage && !editingName">
            <ion-button fill="clear" @click="startRename()">
              {{ translate("Rename") }}
            </ion-button>
          </ion-item>
          <ion-item v-if="editingName">
            <ion-input v-model="nextName" :label="translate('Organization name')" label-placement="stacked" />
            <ion-button slot="end" fill="clear" @click="saveRename()">
              {{ translate("Save") }}
            </ion-button>
            <ion-button slot="end" fill="clear" color="medium" @click="editingName = false">
              {{ translate("Cancel") }}
            </ion-button>
          </ion-item>
        </ion-card>

        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ translate("Hierarchy") }}</ion-card-title>
          </ion-card-header>
          <ion-item v-if="!canManage">
            <ion-label>{{ translate("Parent organization") }}</ion-label>
            <ion-note slot="end">
              {{ parentName }}
            </ion-note>
          </ion-item>
          <ion-item v-else>
            <ion-select
              v-model="selectedParentId"
              :label="translate('Parent organization')"
              label-placement="stacked"
              interface="popover"
            >
              <ion-select-option value="">
                {{ translate("No parent (root organization)") }}
              </ion-select-option>
              <ion-select-option
                v-for="candidate in parentCandidates"
                :key="candidate.partyId"
                :value="candidate.partyId"
              >
                {{ candidate.groupName || candidate.partyId }}
              </ion-select-option>
            </ion-select>
            <ion-button
              slot="end"
              fill="clear"
              :disabled="moving || Boolean(organizationAnomalies.length)"
              @click="saveParent()"
            >
              {{ translate("Save") }}
            </ion-button>
          </ion-item>
          <ion-list-header>
            <ion-label>{{ translate("Child organizations") }}</ion-label>
          </ion-list-header>
          <ion-item
            v-for="child in node?.children ?? []"
            :key="child.partyId"
            button
            :router-link="`/organization-details/${encodeURIComponent(child.partyId)}`"
          >
            <ion-label>{{ child.groupName || child.partyId }}</ion-label>
          </ion-item>
          <ion-item v-if="!node?.children.length" lines="none">
            <ion-label>{{ translate("No child organizations") }}</ion-label>
          </ion-item>
        </ion-card>

        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ translate("Owned facilities") }}</ion-card-title>
          </ion-card-header>
          <ion-item
            v-for="facility in facilities"
            :key="facility.facilityId"
            button
            :router-link="`/facility-details/${encodeURIComponent(facility.facilityId)}`"
          >
            <ion-label>
              <h2>{{ facility.facilityName || facility.facilityId }}</h2>
              <p>{{ facility.facilityId }}</p>
            </ion-label>
          </ion-item>
          <ion-item v-if="facilitiesHydrated && !facilities.length" lines="none">
            <ion-label>{{ translate("No facilities are owned by this organization") }}</ion-label>
          </ion-item>
        </ion-card>

        <ion-card v-if="organizationAnomalies.length" color="warning">
          <ion-card-header>
            <ion-card-title>{{ translate("Hierarchy needs attention") }}</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            {{ translate("This organization participates in invalid hierarchy data. Moving is disabled until the conflict is resolved.") }}
          </ion-card-content>
        </ion-card>
      </main>
      <main v-else class="empty-state">
        {{ translate("Organization not found") }}
      </main>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { commonUtil, translate } from "@common";
import {
  IonBackButton,
  IonBadge,
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonLabel,
  IonListHeader,
  IonNote,
  IonPage,
  IonSelect,
  IonSelectOption,
  IonSkeletonText,
  IonTitle,
  IonToolbar,
  onIonViewWillEnter,
} from "@ionic/vue";
import { computed, ref, watch } from "vue";
import {
  renameOrganization,
  reparentOrganization,
  updateOrganizationExternalId,
  useOrganizationFacilities,
  useOrganizationRecord,
  useOrganizations,
  usePrimaryOrganization,
} from "@/composables/useOrganizations";
import { useAuth } from "@/composables/useSecurity";
import { getResponseErrorMessage } from "@/utils";
import Actions from "@/authorization/actions";

const props = defineProps<{ partyId: string }>();
const { record: organization, hydrated: organizationHydrated } = useOrganizationRecord(props.partyId);
const { organizations, relationships, forest, hydrated: hierarchyHydrated } = useOrganizations();
const { facilities, hydrated: facilitiesHydrated } = useOrganizationFacilities(props.partyId);
const { primaryOrganizationId, load: loadPrimaryOrganization } = usePrimaryOrganization();
const { hasPermission } = useAuth();

const canManage = computed(() => hasPermission(Actions.APP_ORGANIZATION_UPDATE));
const hydrated = computed(() => organizationHydrated.value && hierarchyHydrated.value);
const node = computed(() => forest.value.nodesById.get(props.partyId));
const parentId = computed(() => forest.value.parentById.get(props.partyId) ?? "");
const parentName = computed(() => {
  const parent = forest.value.nodesById.get(parentId.value);

  return parent ? parent.groupName || parent.partyId : translate("No parent (root organization)");
});
const organizationAnomalies = computed(() =>
  forest.value.anomalies.filter((anomaly) =>
    anomaly.partyId === props.partyId || anomaly.relatedPartyId === props.partyId));
const parentCandidates = computed(() =>
  organizations.value.filter((candidate) => candidate.partyId !== props.partyId));

const editingName = ref(false);
const nextName = ref("");
const editingExternalId = ref(false);
const nextExternalId = ref("");
const savingExternalId = ref(false);
const selectedParentId = ref("");
const moving = ref(false);

watch(parentId, (value) => { selectedParentId.value = value; }, { immediate: true });

function startRename() {
  nextName.value = organization.value?.groupName ?? "";
  editingName.value = true;
}

function startExternalIdEdit() {
  nextExternalId.value = organization.value?.externalId ?? "";
  editingExternalId.value = true;
}

async function saveRename() {
  if(!nextName.value.trim()) {return;}
  try {
    await renameOrganization(props.partyId, nextName.value);
    editingName.value = false;
    await commonUtil.showToast(translate("Organization renamed."));
  } catch (error) {
    await commonUtil.showToast(getResponseErrorMessage(error, translate("Failed to rename organization.")));
  }
}

async function saveExternalId() {
  savingExternalId.value = true;
  try {
    await updateOrganizationExternalId(props.partyId, nextExternalId.value);
    editingExternalId.value = false;
    await commonUtil.showToast(translate("External ID updated."));
  } catch (error) {
    await commonUtil.showToast(getResponseErrorMessage(error, translate("Failed to update external ID.")));
  } finally {
    savingExternalId.value = false;
  }
}

async function saveParent() {
  moving.value = true;
  try {
    await reparentOrganization(
      props.partyId,
      selectedParentId.value || undefined,
      relationships.value,
      forest.value.parentById,
    );
    await commonUtil.showToast(translate("Parent organization updated."));
  } catch (error) {
    selectedParentId.value = parentId.value;
    await commonUtil.showToast(getResponseErrorMessage(error, translate("Failed to update parent organization.")));
  } finally {
    moving.value = false;
  }
}

onIonViewWillEnter(() => void loadPrimaryOrganization());
</script>

<style scoped>
.empty-state {
  padding: var(--spacer-base);
>>>>>>> refactor/vue-views-composable-extraction-9050245222670725615
  text-align: center;
}
</style>
