<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-menu-button slot="start" />
        <ion-title>{{ translate("Push notifications") }}</ion-title>
        <ion-buttons slot="end">
          <ion-button :disabled="state.loading" @click="refresh()">
            <ion-icon slot="start" :icon="refreshOutline" />
            {{ translate("Refresh") }}
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding-horizontal">
      <ion-segment :value="state.applicationId" @ion-change="selectApp($event)">
        <ion-segment-button v-for="app in apps" :key="app.applicationId" :value="app.applicationId">
          <ion-label>{{ translate(app.label) }}</ion-label>
        </ion-segment-button>
      </ion-segment>

      <section class="filters ion-margin-top">
        <ion-searchbar
          :value="state.filters.search"
          :placeholder="translate('Search topic, event, facility or user')"
          :debounce="150"
          @ion-input="state.filters.search = ($event.target as HTMLIonSearchbarElement).value ?? ''"
        />
        <ion-select
          :value="state.filters.facilityId"
          interface="popover"
          :label="translate('Facility')"
          label-placement="stacked"
          @ion-change="state.filters.facilityId = $event.detail.value"
        >
          <ion-select-option value="">{{ translate("All facilities") }}</ion-select-option>
          <ion-select-option v-for="facility in facilityOptions" :key="facility.facilityId" :value="facility.facilityId">
            {{ facility.facilityName }}
          </ion-select-option>
        </ion-select>
        <ion-select
          :value="state.filters.userId"
          interface="popover"
          :label="translate('User')"
          label-placement="stacked"
          @ion-change="state.filters.userId = $event.detail.value"
        >
          <ion-select-option value="">{{ translate("All users") }}</ion-select-option>
          <ion-select-option v-for="user in userOptions" :key="user.userId" :value="user.userId">
            {{ user.userName }}
          </ion-select-option>
        </ion-select>
        <ion-button v-if="hasActiveFilters" fill="clear" size="small" @click="clearFilters()">
          {{ translate("Clear filters") }}
        </ion-button>
      </section>

      <section class="summary-grid ion-margin-top">
        <ion-card>
          <ion-card-header>
            <ion-card-subtitle>{{ translate("Topics with subscribers") }}</ion-card-subtitle>
            <ion-card-title>
              <!--
                Three states, never collapsed into one: a real number, "unavailable" when the read
                failed, and a skeleton while it is in flight. Rendering a failed read as 0 would
                look like a healthy empty tenant.
              -->
              <ion-skeleton-text v-if="state.loading" :animated="true" class="count-skeleton" />
              <template v-else-if="state.subscriptions">{{ filteredTopics.length }}</template>
              <template v-else>{{ translate("Unavailable") }}</template>
            </ion-card-title>
          </ion-card-header>
        </ion-card>

        <ion-card>
          <ion-card-header>
            <ion-card-subtitle>{{ translate("Facilities covered") }}</ion-card-subtitle>
            <ion-card-title>
              <ion-skeleton-text v-if="state.loading" :animated="true" class="count-skeleton" />
              <template v-else-if="state.subscriptions">{{ facilityCount }}</template>
              <template v-else>{{ translate("Unavailable") }}</template>
            </ion-card-title>
          </ion-card-header>
        </ion-card>

        <ion-card>
          <ion-card-header>
            <ion-card-subtitle>{{ translate("Users subscribed") }}</ion-card-subtitle>
            <ion-card-title>
              <ion-skeleton-text v-if="state.loading" :animated="true" class="count-skeleton" />
              <template v-else-if="state.subscriptions">{{ userCount }}</template>
              <template v-else>{{ translate("Unavailable") }}</template>
            </ion-card-title>
          </ion-card-header>
        </ion-card>

        <ion-card class="unavailable-card">
          <ion-card-header>
            <ion-card-subtitle>{{ translate("Registered devices") }}</ion-card-subtitle>
            <ion-card-title>{{ translate("Not available") }}</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            {{ translate("Device registrations are not exposed by any API, and no record links a device to a topic. This needs backend work before it can be shown.") }}
          </ion-card-content>
        </ion-card>
      </section>

      <ion-card v-if="state.error" color="danger">
        <ion-card-header>
          <ion-card-title>{{ translate("Subscriptions could not be read") }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>{{ state.error }}</ion-card-content>
      </ion-card>

      <ion-card v-if="state.looksSelfScoped">
        <ion-card-header>
          <ion-card-title>{{ translate("Showing your own subscriptions only") }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          {{ translate("Every row returned belongs to the signed-in user, so this endpoint appears to be scoped to the caller on this instance. Treat the counts above as your own, not the tenant's.") }}
        </ion-card-content>
      </ion-card>

      <ion-list v-if="filteredTopics.length">
        <ion-list-header>
          <ion-label>{{ translate("Subscriptions by topic") }}</ion-label>
        </ion-list-header>
        <ion-item v-for="topic in filteredTopics" :key="topic.topic" lines="full">
          <ion-label class="ion-text-wrap">
            <h2>{{ topic.eventName }}</h2>
            <p class="topic-name">{{ topic.topic }}</p>
            <p>
              {{ topic.facilityName || translate("unknown") }}<span v-if="topic.facilityName !== topic.facilityId"> ({{ topic.facilityId }})</span>,
              {{ translate("Instance") }}: {{ topic.omsInstance || translate("unknown") }}
            </p>
            <p class="subscribers">{{ topic.userNames.join(", ") }}</p>
            <!--
              A name that did not end in a known event id was split by position, so the facility
              and instance shown are a guess. Say so rather than presenting them as read values.
            -->
            <ion-badge v-if="!topic.recognised" color="warning">{{ translate("Name not recognised") }}</ion-badge>
          </ion-label>
          <ion-note slot="end">
            {{ topic.userIds.length }} {{ topic.userIds.length === 1 ? translate("user") : translate("users") }}
          </ion-note>
        </ion-item>
      </ion-list>

      <ion-card v-else-if="!state.loading && state.subscriptions && hasActiveFilters">
        <ion-card-header>
          <ion-card-title>{{ translate("No matches") }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          {{ translate("No subscription matches the current filters. There are subscriptions for this app, they are just filtered out.") }}
        </ion-card-content>
      </ion-card>

      <ion-card v-else-if="!state.loading && state.subscriptions">
        <ion-card-header>
          <ion-card-title>{{ translate("No subscriptions") }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          {{ translate("Nobody has switched on a notification for this app. Store users subscribe from the app's own settings screen.") }}
        </ion-card-content>
      </ion-card>

      <ion-list v-if="unsubscribedEvents.length">
        <ion-list-header>
          <ion-label>{{ translate("Events nobody subscribes to") }}</ion-label>
        </ion-list-header>
        <ion-item v-for="event in unsubscribedEvents" :key="event.enumId" lines="full">
          <ion-label class="ion-text-wrap">
            <h2>{{ event.description || event.enumName || event.enumId }}</h2>
            <p class="topic-name">{{ event.enumId }}</p>
          </ion-label>
        </ion-item>
      </ion-list>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonBadge, IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader, IonCardSubtitle,
  IonCardTitle, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonListHeader,
  IonMenuButton, IonNote, IonPage, IonSearchbar, IonSegment, IonSegmentButton, IonSelect,
  IonSelectOption, IonSkeletonText, IonTitle, IonToolbar, onIonViewWillEnter
} from "@ionic/vue";
import { refreshOutline } from "ionicons/icons";
import { translate } from "@common";
import { NOTIFICATION_APPS, useNotificationSubscriptions } from "@/composables/useNotificationSubscriptions";
import { useUserStore } from "@/store/user";

const apps = NOTIFICATION_APPS;
const {
  state, topics, filteredTopics, facilityCount, userCount, unsubscribedEvents,
  facilityOptions, userOptions, hasActiveFilters, clearFilters, load
} = useNotificationSubscriptions();

function currentUserId() {
  return (useUserStore().getUserProfile as any)?.userId;
}

function refresh() {
  return load(state.applicationId, currentUserId());
}

function selectApp(event: CustomEvent) {
  const applicationId = event.detail.value;
  if (applicationId && applicationId !== state.applicationId) load(applicationId, currentUserId());
}

onIonViewWillEnter(refresh);
</script>

<style scoped>
.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--spacer-xs, 8px);
}

.count-skeleton {
  width: 40%;
  height: 1.2em;
}

.filters {
  display: grid;
  grid-template-columns: minmax(220px, 2fr) repeat(2, minmax(160px, 1fr)) auto;
  gap: var(--spacer-xs, 8px);
  align-items: end;
}

@media (max-width: 720px) {
  .filters {
    grid-template-columns: 1fr;
  }
}

.subscribers {
  font-size: 0.85em;
}

.topic-name {
  font-family: monospace;
  word-break: break-all;
}

.unavailable-card {
  opacity: 0.75;
}
</style>
