<template>
  <ion-card>
    <ion-card-header>
      <ion-card-title>{{ permission.description }}</ion-card-title>
      <ion-card-subtitle>{{ permission.permissionId }}</ion-card-subtitle>
    </ion-card-header>

    <ion-list>
      <ion-item-divider color="light">
        <ion-label>{{ translate("Security groups with access") }}</ion-label>
        <ion-note slot="end">
          {{ activeGroups.length }}
        </ion-note>
      </ion-item-divider>

      <ion-item button lines="full" @click="$emit('history', permission)">
        <ion-icon slot="start" :icon="timeOutline" />
        <ion-label>{{ translate("View assignment history") }}</ion-label>
      </ion-item>

      <ion-item button lines="full" :disabled="!activeGroups.length" @click="$emit('users', permission)">
        <ion-icon slot="start" :icon="personOutline" />
        <ion-label>{{ translate("View users with access") }}</ion-label>
      </ion-item>

      <ion-item v-for="group in activeGroups" :key="group.groupId">
        <ion-label>
          {{ group.groupName || group.groupId }}
          <p>{{ group.groupId }}</p>
        </ion-label>
      </ion-item>

      <ion-item v-if="!activeGroups.length" lines="none">
        <ion-label>{{ translate("No security groups assigned") }}</ion-label>
      </ion-item>

      <ion-button fill="outline" expand="block" class="ion-margin" :disabled="!canManage" @click="$emit('manage', permission)">
        <ion-icon slot="start" :icon="peopleOutline" />
        {{ translate("Manage security groups") }}
      </ion-button>
    </ion-list>
  </ion-card>
</template>

<script setup lang="ts">
import { translate } from "@common";
import {
  IonButton,
  IonCard,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonIcon,
  IonItem,
  IonItemDivider,
  IonLabel,
  IonList,
  IonNote
} from "@ionic/vue";
import { peopleOutline, personOutline, timeOutline } from "ionicons/icons";
import { PropType } from "vue";
import { AppPermissionDefinition } from "@/config/appPermissions";

defineProps({
  permission: {
    type: Object as PropType<AppPermissionDefinition>,
    required: true
  },
  activeGroups: {
    type: Array as PropType<any[]>,
    default: () => []
  },
  canManage: {
    type: Boolean,
    default: false
  }
});

defineEmits(["history", "manage", "users"]);
</script>
