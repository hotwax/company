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
              <h2>{{ node.groupName || node.partyId }}</h2>
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

        <ion-list>
          <ul class="organization-tree" aria-label="Organization hierarchy">
            <OrganizationTreeItem
              v-for="root in forest.roots"
              :key="root.partyId"
              :node="root"
              :primary-id="primaryOrganizationId"
            />
          </ul>
        </ion-list>
      </main>

      <main v-else class="empty-state">
        {{ translate("No organizations found") }}
      </main>

      <ion-fab v-if="canManage" slot="fixed" vertical="bottom" horizontal="end">
        <ion-fab-button :aria-label="translate('Create organization')" @click="showCreate = true">
          <ion-icon :icon="addOutline" />
        </ion-fab-button>
      </ion-fab>

      <CreateOrganizationModal
        :is-open="showCreate"
        :organizations="organizations"
        @dismiss="showCreate = false"
        @created="organizationCreated"
      />
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { translate } from "@common";
import {
  IonBadge,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonMenuButton,
  IonPage,
  IonSearchbar,
  IonSkeletonText,
  IonTitle,
  IonToolbar,
  onIonViewWillEnter,
} from "@ionic/vue";
import { addOutline } from "ionicons/icons";
import { computed, ref } from "vue";
import CreateOrganizationModal from "@/components/organization/CreateOrganizationModal.vue";
import OrganizationTreeItem from "@/components/organization/OrganizationTreeItem.vue";
import {
  type OrganizationAnomaly,
  useOrganizations,
  usePrimaryOrganization,
} from "@/composables/useOrganizations";
import { useAuth } from "@/composables/useSecurity";
import router from "@/router";

const { organizations, forest, hydrated } = useOrganizations();
const { primaryOrganizationId, load: loadPrimaryOrganization } = usePrimaryOrganization();
const { hasPermission } = useAuth();
const canManage = computed(() => hasPermission("PARTYMGR_ADMIN"));
const searchText = ref("");
const showCreate = ref(false);

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
      partyId: anomaly.partyId,
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

function organizationCreated(partyId: string) {
  showCreate.value = false;
  void router.push(`/organization-details/${encodeURIComponent(partyId)}`);
}

onIonViewWillEnter(() => void loadPrimaryOrganization());
</script>

<style scoped>
ion-content {
  --padding-bottom: 80px;
}

.organization-tree {
  margin: 0;
  padding: 0;
}

.empty-state {
  padding: 24px;
  text-align: center;
}
</style>
