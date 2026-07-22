<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-title>{{ translate("Security Groups") }}</ion-title>
      </ion-toolbar>
      <div>
        <ion-searchbar v-model="query.queryString" :placeholder="translate('Search security groups')" @keyup.enter="updateQuery()" />
      </div>
    </ion-header>

    <ion-content>
      <div v-if="userGroups?.length">
        <ion-item v-for="(group, index) in userGroups" :key="index" @click="viewGroupDetails(group)" detail class="pointer">
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

      <ion-infinite-scroll
        v-if="isScrollable"
        threshold="100px"
        @ion-infinite="loadMoreGroups($event)"
      >
        <ion-infinite-scroll-content
          loading-spinner="crescent"
          :loading-text="translate('Loading')"
        />
      </ion-infinite-scroll>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { IonContent, IonHeader, IonInfiniteScroll, IonInfiniteScrollContent, IonItem, IonLabel, IonPage, IonSearchbar, IonTitle, IonToolbar, onIonViewWillEnter } from "@ionic/vue";
import { translate } from "@common";
import router from "@/router";
import { useAuthorizationStore } from "@/store/authorization";

const authorizationStore = useAuthorizationStore();

const query = ref({ queryString: "" });

const userGroups = computed(() => authorizationStore.getUserGroupList);
const isScrollable = computed(() => authorizationStore.isUserGroupListScrollable);

onIonViewWillEnter(async () => {
  await fetchUserGroups();
});

const updateQuery = async () => {
  await authorizationStore.updateUserGroupListQuery(query.value);
  fetchUserGroups();
};

const fetchUserGroups = async (pSize?: any, pIndex?: any) => {
  const pageSize = pSize || import.meta.env.VITE_VIEW_SIZE;
  const pageIndex = pIndex || 0;

  await authorizationStore.fetchFilteredUserGroups({ pageSize, pageIndex });
};

const viewGroupDetails = (group: any) => {
  router.push({ path: `/security-group-detail/${group.userGroupId}` });
};

const loadMoreGroups = (event: any) => {
  fetchUserGroups(
    undefined,
    Math.ceil(userGroups.value?.length / (import.meta.env.VITE_VIEW_SIZE as any)).toString()
  ).then(async () => {
    await event.target.complete();
  });
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
