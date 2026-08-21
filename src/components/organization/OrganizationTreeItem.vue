<template>
<<<<<<< HEAD
  <li>
    <ion-item
      button
      :router-link="`/organization-details/${encodeURIComponent(node.partyId)}`"
      detail
    >
      <ion-label class="ion-text-wrap">
        <h2>{{ node.groupName || node.partyId }}</h2>
        <p>{{ node.partyId }}<span v-if="node.externalId"> · {{ node.externalId }}</span></p>
      </ion-label>
      <ion-badge v-if="node.partyId === primaryId" slot="end" color="primary">
        {{ translate("Primary") }}
      </ion-badge>
    </ion-item>
    <ul v-if="node.children.length">
      <OrganizationTreeItem
        v-for="child in node.children"
        :key="child.partyId"
        :node="child"
        :primary-id="primaryId"
      />
    </ul>
  </li>
</template>

<script setup lang="ts">
import { translate } from "@common";
import { IonBadge, IonItem, IonLabel } from "@ionic/vue";
import type { OrganizationNode } from "@/composables/useOrganizations";

defineProps<{ node: OrganizationNode; primaryId: string }>();
</script>

<style scoped>
li {
  list-style: none;
}

ul {
  margin: 0 0 0 20px;
  padding: 0;
  border-inline-start: 1px solid var(--ion-color-step-200, #ddd);
}
</style>
||||||| 544075d
=======
  <ion-item
    button
    :router-link="`/organization-details/${encodeURIComponent(node.partyId)}`"
    detail
  >
    <ion-label class="ion-text-wrap">
      {{ node.groupName || node.partyId }}
      <p>{{ node.partyId }}<span v-if="node.externalId"> ({{ node.externalId }})</span></p>
    </ion-label>
    <ion-badge v-if="node.partyId === primaryId" slot="end" color="primary">
      {{ translate("Primary") }}
    </ion-badge>
  </ion-item>
  <ion-list
    v-if="node.children.length"
    inset
    :aria-label="translate('Child organizations')"
  >
    <OrganizationTreeItem
      v-for="child in node.children"
      :key="child.partyId"
      :node="child"
      :primary-id="primaryId"
    />
  </ion-list>
</template>

<script setup lang="ts">
import { translate } from "@common";
import { IonBadge, IonItem, IonLabel, IonList } from "@ionic/vue";
import type { OrganizationNode } from "@/composables/useOrganizations";

defineProps<{ node: OrganizationNode; primaryId: string }>();
</script>
>>>>>>> refactor/vue-views-composable-extraction-9050245222670725615
