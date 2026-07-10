<template>
  <ion-page>
    <FilterMenu content-id="filter-menu" />

    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-title>{{ translate("Users") }}</ion-title>
        <ion-menu-button slot="end" class="mobile-only">
          <ion-icon :icon="optionsOutline" />
        </ion-menu-button>
      </ion-toolbar>
      <div>
        <ion-searchbar class="searchbar" v-model="userStore.query.queryString" :placeholder="translate('Search users')" @keyup.enter="updateQuery()" />
        <ion-item lines="none">
          <ion-icon slot="start" :icon="idCardOutline" />
          <ion-select v-model="userStore.query.userGroupId" :label="translate('Clearance')" interface="popover" @ion-change="updateQuery()">
            <ion-select-option value="">
              {{ translate("All") }}
            </ion-select-option>
            <ion-select-option v-for="(userGroup, index) in userGroups" :key="index" :value="userGroup.userGroupId">
              {{ userGroup.description || userGroup.userGroupId }}
            </ion-select-option>
          </ion-select>
        </ion-item>
        <ion-item lines="none">
          <ion-icon slot="start" :icon="toggleOutline" />
          <ion-select v-model="userStore.query.status" :label="translate('Login')" interface="popover" @ion-change="updateQuery()">
            <ion-select-option value="">
              {{ translate("All") }}
            </ion-select-option>
            <ion-select-option value="Y">
              {{ translate("Active") }}
            </ion-select-option>
            <ion-select-option value="N">
              {{ translate("Inactive") }}
            </ion-select-option>
          </ion-select>
        </ion-item>
      </div>
    </ion-header>

    <ion-content id="filter-menu">
          <ion-card v-if="currentUser.userId" class="list-item" @click="viewUserDetails(currentUser)">
            <ion-item lines="none">
              <ion-label>
                {{ currentUser.userFullName }}
                <p>{{ currentUser.username }}</p>
                <p>{{ currentUser.emailAddress }}</p>
                <ion-badge>{{ translate("Your user") }}</ion-badge>
              </ion-label>
            </ion-item>

            <div class="tablet">
              <ion-label v-if="currentUser.createdStamp" class="ion-text-center">
                {{ getDate(currentUser.createdStamp) }}
                <p>{{ translate("created") }}</p>
              </ion-label>
              <ion-label v-else>
                {{ '-' }}
              </ion-label>
            </div>

            <ion-item lines="none">
              <div slot="end" class="tablet">
                <ion-chip v-if="currentUser.groups?.length" outline>
                  <ion-label>{{ currentUser.groups.map((group: any) => group.description || group.userGroupId).join(', ') }}</ion-label>
                </ion-chip>
                <ion-label v-else>
                  {{ '-' }}
                </ion-label>
              </div>
            </ion-item>
          </ion-card>
          <div v-if="users?.length">
            <div v-for="(user, index) in users" :key="index" class="list-item" @click="viewUserDetails(user)">
              <ion-item lines="none">
                <ion-label>
                  {{ user.userFullName || user.username }}
                  <p>{{ user.username }}</p>
                  <p>{{ user.emailAddress }}</p>
                </ion-label>
              </ion-item>

              <div class="tablet">
                <ion-label v-if="user.createdStamp" class="ion-text-center">
                  {{ getDate(user.createdStamp) }}
                  <p>{{ translate("created") }}</p>
                </ion-label>
                <ion-label v-else>
                  {{ '-' }}
                </ion-label>
              </div>

              <div class="tablet">
                <ion-chip v-if="user.groups?.length" outline>
                  <ion-label>{{ user.groups.map((group: any) => group.description || group.userGroupId).join(', ') }}</ion-label>
                </ion-chip>
                <ion-label v-else>
                  {{ '-' }}
                </ion-label>
              </div>
            </div>
          </div>
          <div v-else>
            <p class="ion-text-center">
              {{ translate("No users found") }}
            </p>
          </div>

      <ion-fab slot="fixed" vertical="bottom" horizontal="end">
        <ion-fab-button :disabled="!userStore.hasPermission('SECURITY_CREATE OR SECURITY_ADMIN')" @click="createUser()">
          <ion-icon :icon="addOutline" />
        </ion-fab-button>
      </ion-fab>

      <ion-infinite-scroll
        v-if="isScrollable"
        threshold="100px"
        @ion-infinite="loadMoreUsers($event)"
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
import { computed, onMounted, ref } from "vue";
import { IonBadge, IonCard, IonChip, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonInfiniteScroll, IonInfiniteScrollContent, IonItem, IonLabel, IonList, IonMenuButton, IonPage, IonSearchbar, IonSelect, IonSelectOption, IonTitle, IonToolbar, onIonViewWillEnter } from "@ionic/vue";
import { addOutline, idCardOutline, optionsOutline, toggleOutline } from "ionicons/icons";
import router from "@/router";
import { DateTime } from "luxon";
import { translate } from "@common";
import FilterMenu from "@/components/FilterMenu.vue";
import { useUserStore } from "@/store/user";
import { useUtilStore } from "@/store/util";

const userStore = useUserStore();
const utilStore = useUtilStore();

// The logged-in user's own record, pinned at the top of the list. The profile is already available from
// login, but it doesn't carry group associations, so those are fetched separately via getUserGroups().
const currentUser = ref<any>({});

const users = computed(() => userStore.getUsers);
const userGroups = computed(() => utilStore.getUserGroups);
const isScrollable = computed(() => userStore.isScrollable);

onIonViewWillEnter(async () => {
  await fetchUsers();
});

onMounted(async () => {
  await utilStore.fetchUserGroups();
});

const createUser = () => {
  userStore.clearSelectedUser();
  router.push("/create-user");
};

const getDate = (date: any) => {
  return DateTime.fromMillis(date).toFormat("dd LLL yyyy");
};

const updateQuery = async () => {
  await userStore.updateQuery(userStore.query);
  fetchUsers();
};

const fetchUsers = async (pSize?: any, pIndex?: any) => {
  const pageSize = pSize || import.meta.env.VITE_VIEW_SIZE;
  const pageIndex = pIndex || 0;

  if(!userStore.query.queryString) {
    // Do not fetch the current user information again on infinite-scroll pages, as we already have it.
    if(pageIndex === 0) {await fetchCurrentUser()}
  } else {
    currentUser.value = {};
  }

  await userStore.fetchFilteredUsers({ pageSize, pageIndex });
};

const fetchCurrentUser = async () => {
  const profile = userStore.getUserProfile;
  const groups = profile.userId ? await userStore.getUserGroups(profile.userId) : [];
  currentUser.value = { ...profile, groups };
};

const viewUserDetails = async (user: any) => {
  await userStore.updateSelectedUser(user);
  router.push({ path: `/user-details/${user.userId}` });
};

const loadMoreUsers = (event: any) => {
  fetchUsers(
    undefined,
    Math.ceil(users.value?.length / (import.meta.env.VITE_VIEW_SIZE as any)).toString()
  ).then(async () => {
    await event.target.complete();
  });
};
</script>

<style scoped>
@media (min-width: 991px) {
  ion-header > div {
    display: flex;
  }
}


.list-item {
  --columns-desktop: 4;
}

/* Added width property as after updating to ionic7 min-width is getting applied on ion-label inside ion-item
  which results in distorted label text and thus reduced ion-item width */
  .list-item > ion-item {
    width: 100%;
  }
</style>
