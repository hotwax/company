<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button @click="close">
            <ion-icon slot="icon-only" :icon="closeOutline" />
          </ion-button>
        </ion-buttons>
        <ion-title>{{ permission.title }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-searchbar v-model="query" :placeholder="translate('Search users')" />

      <ion-list v-for="group in groups" :key="group.groupId">
        <ion-item-divider color="light">
          <ion-label>
            {{ group.groupName || group.groupId }}
            <p>{{ group.groupId }}</p>
          </ion-label>
          <ion-note slot="end">
            {{ filteredUsers(group.groupId).length }}
          </ion-note>
        </ion-item-divider>

        <ion-item v-for="user in filteredUsers(group.groupId)" :key="user.userId || user.partyId">
          <ion-label>
            {{ displayName(user) }}
            <p>{{ user.userId || user.partyId }}</p>
          </ion-label>
        </ion-item>

        <ion-item v-if="!filteredUsers(group.groupId).length" lines="none">
          <ion-label color="medium">
            {{ translate("No users found") }}
          </ion-label>
        </ion-item>
      </ion-list>

      <div v-if="!groups.length" class="empty-state">
        <p>{{ translate("No security groups assigned") }}</p>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { translate } from "@common"
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonItemDivider, IonLabel, IonList, IonNote, IonPage, IonSearchbar, IonTitle, IonToolbar, modalController } from "@ionic/vue"
import { closeOutline } from "ionicons/icons"
import { PropType, computed, ref } from "vue"
import type { AppPermissionDefinition } from "@/config/app-permissions"
import type { AppPermissionSecurityGroup } from "@/store/appPermissions"

const props = defineProps({
  permission: { type: Object as PropType<AppPermissionDefinition>, required: true },
  groups: { type: Array as PropType<AppPermissionSecurityGroup[]>, default: () => [] },
  usersByGroup: { type: Object as PropType<Record<string, any[]>>, default: () => ({}) }
})

const query = ref("")
const normalizedQuery = computed(() => query.value.trim().toLowerCase())

const close = () => modalController.dismiss(null, "cancel")
const displayName = (user: any) => user.fullName || [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || user.userId || user.partyId
const filteredUsers = (groupId: string) => {
  const users = props.usersByGroup[groupId] || []
  if(!normalizedQuery.value) {return users}

  return users.filter((user: any) => [displayName(user), user.username, user.userId, user.partyId]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(normalizedQuery.value)))
}
</script>

<style scoped>
.empty-state {
  padding: var(--spacer-base);
  text-align: center;
}
</style>
