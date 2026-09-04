<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-menu-button slot="start" />
        <ion-title>{{ translate("Security Groups") }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <!-- Filters the complete cached set as you type — no server round-trip. -->
      <ion-searchbar v-model="query.queryString" :placeholder="translate('Search security groups')" />

      <div v-if="!hydrated">
        <ion-item v-for="n in 5" :key="`sk-${n}`" lines="full">
          <ion-label><ion-skeleton-text animated style="width: 45%" /></ion-label>
        </ion-item>
      </div>
      <div v-else-if="userGroups.length">
        <ion-item v-for="group in userGroups" :key="group.userGroupId" detail class="pointer" @click="viewGroupDetails(group)">
          <ion-label>
            {{ group.description || group.userGroupId }}
            <p>{{ group.userGroupId }}</p>
          </ion-label>
        </ion-item>
      </div>
      <div v-else>
        <p class="ion-text-center">
          {{ translate("No user groups found") }}
        </p>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { translate } from "@common";
import { IonContent, IonHeader, IonItem, IonLabel, IonMenuButton, IonPage, IonSearchbar, IonSkeletonText, IonTitle, IonToolbar } from "@ionic/vue";
import { computed, ref } from "vue";
import router from "@/router";
import { useUserGroups } from "@/composables/useSecurity";

// No store: the complete user-group set is cached, so search filters locally and instantly.
const { search, hydrated } = useUserGroups();

const query = ref({ queryString: "" });
const userGroups = computed(() => search(query.value.queryString));


const viewGroupDetails = (group: any) => {
  router.push({ path: `/security-group-detail/${group.userGroupId}` });
};
</script>

<style scoped>
.list-item {
  --columns-desktop: 4;
}

.list-item > ion-item {
  width: 100%;
}
</style>
