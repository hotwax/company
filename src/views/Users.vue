<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-menu-button slot="start" />
        <ion-title>{{ translate("Users") }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-card class="filter-card">
        <ion-card-content>
          <ion-searchbar v-model="userStore.query.queryString" class="searchbar" :placeholder="translate('Search users')" @keyup.enter="updateQuery()" />
          <div class="filter-row">
            <ion-select
              v-model="userStore.query.userGroupId"
              :label="translate('Security groups')"
              label-placement="stacked"
              fill="outline"
              interface="popover"
              @ion-change="updateQuery()"
            >
              <ion-select-option value="">
                {{ translate("All") }}
              </ion-select-option>
              <ion-select-option v-for="(userGroup, index) in userGroups" :key="index" :value="userGroup.userGroupId">
                {{ userGroup.description || userGroup.userGroupId }}
              </ion-select-option>
            </ion-select>
            <ion-select
              v-model="userStore.query.status"
              :label="translate('Status')"
              label-placement="stacked"
              fill="outline"
              interface="popover"
              @ion-change="updateQuery()"
            >
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
          </div>
        </ion-card-content>
      </ion-card>

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
              {{ `${user.firstName} ${user.lastName ?? ''}`.trim() }}
              <p>{{ user.username }}</p>
              <p>{{ user.emailAddress }}</p>
            </ion-label>
          </ion-item>

          <div class="tablet">
            <ion-label v-if="user.createdDate" class="ion-text-center">
              {{ commonUtil.formatUtcDate(user.createdDate, currentTimeZoneId, 'dd LLL yyyy') }}
              <p>{{ translate("created") }}</p>
            </ion-label>
            <ion-label v-else>
              {{ '-' }}
            </ion-label>
          </div>

          <div class="tablet">
            <ion-chip v-if="user.userGroupIds?.length" outline>
              <ion-label>{{ user.userGroupIds.map((userGroupId: any) => getUserGroupDescription(userGroupId)).join(', ') }}</ion-label>
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
import { commonUtil, translate } from "@common";
import { IonBadge, IonCard, IonCardContent, IonChip, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonInfiniteScroll, IonInfiniteScrollContent, IonItem, IonLabel, IonMenuButton, IonPage, IonSearchbar, IonSelect, IonSelectOption, IonTitle, IonToolbar, onIonViewWillEnter } from "@ionic/vue";
import { addOutline } from "ionicons/icons";
import { DateTime } from "luxon";
import { computed, ref } from "vue";
import router from "@/router";
import { useUserGroups } from "@/composables/useSecurity";
import { useUserStore } from "@/store/user";

const userStore = useUserStore();
const USERS_PAGE_SIZE = 25;

// The logged-in user's own record, pinned at the top of the list. The profile is already available from
// login, but it doesn't carry group associations, so those are fetched separately via getUserGroups().
const currentUser = ref<any>({});

const users = computed(() => userStore.getUsers);
// Cached, reactive — the filter dropdown fills as the table hydrates, no fetch needed. This app
// only ever manages login-capable groups, and the cache holds EVERY group (framework/system ones
// like UgtMoquiAdmin included), so the old server-side UgtUserAccess scope is kept client-side.
const { userGroups: cachedUserGroups } = useUserGroups();
const userGroups = computed(() => cachedUserGroups.value.filter((group: any) => group.groupTypeEnumId === "UgtUserAccess"));
const isScrollable = computed(() => userStore.isScrollable);
const userProfile = computed(() => userStore.getUserProfile)
const currentTimeZoneId = computed(() => userProfile.value.timeZone)

onIonViewWillEnter(async () => {
  await fetchUsers();
});

const createUser = () => {
  userStore.clearSelectedUser();
  router.push("/create-user");
};

const getDate = (date: any) => {
  return DateTime.fromMillis(date).toFormat("dd LLL yyyy");
};

const getUserGroupDescription = (userGroupId: string) => {
  const userGroup = userGroups.value.find((userGroup: any) => userGroup.userGroupId === userGroupId);

  return userGroup?.description || userGroupId;
};

const updateQuery = async () => {
  await userStore.updateQuery(userStore.query);
  fetchUsers();
};

const fetchUsers = async (pSize?: any, pIndex?: any) => {
  const pageSize = pSize || USERS_PAGE_SIZE;
  const pageIndex = pIndex || 0;

  if(!userStore.query.queryString) {
    // Do not fetch the current user information again on infinite-scroll pages, as we already have it.
    if(pageIndex === 0) {await fetchCurrentUser()}
  } else {
    currentUser.value = {};
  }

  await userStore.fetchUsers({ pageIndex, pageSize });
};

const fetchCurrentUser = async () => {
  const profile = userStore.getUserProfile;
  const groups = profile.userId ? await userStore.getUserGroups(profile.userId) : [];
  currentUser.value = { ...profile, groups };
};

const viewUserDetails = async (user: any) => {
  await userStore.updateSelectedUser(user);
  router.push({ path: `/user-details/${user.partyId}` });
};

const loadMoreUsers = (event: any) => {
  fetchUsers(
    undefined,
    Math.ceil(users.value?.length / USERS_PAGE_SIZE).toString()
  ).then(async () => {
    await event.target.complete();
  });
};
</script>

<style scoped>
.filter-card {
  margin: var(--spacer-sm);
}

.filter-card ion-card-content {
  display: flex;
  flex-direction: column;
  gap: var(--spacer-sm);
  padding: var(--spacer-sm);
}

.filter-row {
  display: flex;
  gap: var(--spacer-sm);
}

.filter-row ion-select {
  flex: 1 1 0;
  min-width: 0;
}

@media (max-width: 640px) {
  .filter-row {
    flex-direction: column;
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
