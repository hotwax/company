<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/netsuite" />
        </ion-buttons>
        <ion-title>{{ subsidiary ? translate("{name} ({subsidiaryId})", { name: subsidiary.name, subsidiaryId }) : subsidiaryId }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding-horizontal">
      <ion-card v-if="loadError" class="ion-margin-top" data-testid="netsuite-subsidiary-load-error">
        <ion-card-content>
          {{ translate(subsidiary ? "Could not read the subsidiaries from NetSuite. This page uses the last good read." : "Could not read the subsidiaries from NetSuite.") }}
          <p>{{ loadError }}</p>
        </ion-card-content>
      </ion-card>

      <ion-skeleton-text v-if="isLoading" :animated="true" class="ion-margin-top" />

      <ion-card v-else-if="!subsidiary" class="ion-margin-top" data-testid="netsuite-subsidiary-unknown">
        <ion-card-content>{{ translate("NetSuite has no subsidiary with this id.") }}</ion-card-content>
      </ion-card>

      <ion-card v-else-if="subsidiary.status === 'SKIPPED'" class="ion-margin-top" data-testid="netsuite-subsidiary-skipped">
        <ion-card-content>{{ translate("This subsidiary exists only for accounting. The OMS does not use it.") }}</ion-card-content>
      </ion-card>

      <template v-else>
        <ion-card v-if="isCompanyNotSetUp(subsidiary)" class="ion-margin-top" data-testid="netsuite-subsidiary-not-set-up">
          <ion-card-header>
            <ion-card-subtitle>{{ translate("Next step") }}</ion-card-subtitle>
            <ion-card-title>{{ translate("This company is not set up in the OMS") }}</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <p>{{ translate("Set it up before you switch on the flows of its stores.") }}</p>
            <ion-button class="ion-margin-top" data-testid="netsuite-subsidiary-fix" @click="router.push(reviewRoute('subsidiaries', subsidiaryId))">{{ translate("Review and fix") }}</ion-button>
          </ion-card-content>
        </ion-card>
      </template>

      <template v-if="!isLoading && subsidiary && partyId && subsidiary.status !== 'SKIPPED'">
        <ion-card v-if="companySetupError" class="ion-margin-top" data-testid="netsuite-subsidiary-setup-error">
          <ion-card-content>
            {{ translate("Could not read this company's locations and stores.") }}
            <p>{{ companySetupError }}</p>
          </ion-card-content>
        </ion-card>

        <div class="ion-margin-top">
          <h1>{{ translate("Locations") }}</h1>
          <p class="section-note">{{ translate(hasReview ? "OMS locations of this company, compared with NetSuite at the last setup review." : "OMS locations of this company. Open Review setup to compare them with NetSuite.") }}</p>
          <p v-if="locations.length" data-testid="netsuite-subsidiary-location-counts">{{ locationCountsText }}</p>
          <ion-list lines="full" data-testid="netsuite-subsidiary-locations">
            <ion-item v-if="!locations.length">
              <ion-label>{{ translate("This company owns no OMS location.") }}</ion-label>
            </ion-item>
            <ion-item v-for="location in shownLocations" :key="location.facilityId" :data-testid="`netsuite-subsidiary-location-${location.facilityId}`">
              <ion-label class="ion-text-wrap">
                <h2>{{ location.facilityName || location.facilityId }}</h2>
                <p>{{ location.externalId ? translate("NetSuite location {locationId}", { locationId: location.externalId }) : translate("No NetSuite location id") }}</p>
                <p v-if="location.state === 'OTHER_SUBSIDIARY'"><ion-text color="warning">{{ translate("NetSuite puts this location under {company}.", { company: location.netSuiteCompanyName }) }}</ion-text></p>
                <p v-if="location.state === 'OTHER_OWNER'">
                  <ion-text color="warning">{{ location.ownerName ? translate("NetSuite puts this location under this company. In the OMS it belongs to {company}.", { company: location.ownerName }) : translate("NetSuite puts this location under this company. In the OMS it has no owner.") }}</ion-text>
                </p>
                <p v-if="location.state === 'NOT_IN_NETSUITE'"><ion-text color="warning">{{ translate("NetSuite has no location with this id.") }}</ion-text></p>
              </ion-label>
              <ion-button v-if="FIXABLE_LOCATION_STATES.includes(location.state)" slot="end" fill="outline" size="small" :data-testid="`netsuite-subsidiary-location-fix-${location.facilityId}`"
                @click="router.push(reviewRoute('locations', location.state === 'NO_ID' ? undefined : location.externalId))">{{ translate("Fix") }}</ion-button>
              <ion-badge slot="end" :color="LOCATION_STATE_COLORS[location.state]">{{ translate(LOCATION_STATE_LABELS[location.state]) }}</ion-badge>
            </ion-item>
          </ion-list>
          <ion-button v-if="shownLocations.length < locations.length" fill="clear" data-testid="netsuite-subsidiary-show-all-locations" @click="isShowingAllLocations = true">
            {{ translate("Show all {count} locations", { count: locations.length }) }}
          </ion-button>
        </div>

        <div class="ion-margin-top">
          <h1>{{ translate("Stores") }}</h1>
          <p class="section-note">{{ translate("Product stores that sell from this company's locations.") }}</p>
          <ion-list v-if="!stores.length" lines="none">
            <ion-item>
              <ion-label>{{ translate("No product store sells from this company's locations.") }}</ion-label>
            </ion-item>
          </ion-list>
          <div v-for="store in stores" :key="store.productStoreId" class="store-block" :data-testid="`netsuite-subsidiary-store-${store.productStoreId}`">
            <h2>{{ store.storeName || store.productStoreId }}</h2>
            <p class="section-note">{{ translate(store.locationCount === 1 ? "Sells from 1 location of this company" : "Sells from {count} locations of this company", { count: store.locationCount }) }}</p>
            <section>
              <NetSuiteStoreOrdersItem :product-store-id="store.productStoreId" :setup-warning="ordersSetupWarning" />
              <NetSuiteStoreShipmentsItem :product-store-id="store.productStoreId" />
            </section>
          </div>
        </div>
      </template>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { IonBackButton, IonBadge, IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonContent, IonHeader, IonItem, IonLabel, IonList, IonPage, IonSkeletonText, IonText, IonTitle, IonToolbar, onIonViewDidLeave, onIonViewWillEnter } from "@ionic/vue";
import { translate } from "@common";
import router from "@/router";
import { activateSyncDomains, createSyncDomainOwner, deactivateSyncDomains } from "@/db/appDbSync";
import { useNetSuiteSubsidiary } from "@/composables/useNetSuiteSubsidiaries";
import { reviewRoute, SETUP_STATUS_DOMAINS, useNetSuiteSetupStatus } from "@/composables/useNetSuiteSetupReview";
import NetSuiteStoreOrdersItem from "@/components/netsuite-subsidiary/NetSuiteStoreOrdersItem.vue";
import NetSuiteStoreShipmentsItem from "@/components/netsuite-subsidiary/NetSuiteStoreShipmentsItem.vue";
import {
  NETSUITE_COMPANY_SETUP_DOMAIN, NETSUITE_ORDERS_SETUP_DOMAIN, NETSUITE_SENDING_COUNTS_DOMAIN, NETSUITE_SHIPMENT_STEP_COUNTS_DOMAIN, NETSUITE_STEP_COUNTS_DOMAIN,
  NETSUITE_SUBSIDIARIES_DOMAIN,
} from "@/config/appSyncConfig";

const props = defineProps<{ subsidiaryId: string }>();

const LOCATION_STATE_LABELS: Record<string, string> = {
  MATCHES: "Matches", OTHER_SUBSIDIARY: "Differs", OTHER_OWNER: "Differs", NOT_IN_NETSUITE: "Not in NetSuite", NO_ID: "No NetSuite id", NOT_CHECKED: "Not checked",
};
const LOCATION_STATE_COLORS: Record<string, string> = {
  MATCHES: "success", OTHER_SUBSIDIARY: "warning", OTHER_OWNER: "warning", NOT_IN_NETSUITE: "warning", NO_ID: "medium", NOT_CHECKED: "medium",
};

const { subsidiary, partyId, loadError, companySetupError, isLoading, locations, stores, hasReview } = useNetSuiteSubsidiary(() => props.subsidiaryId);

const ATTENTION_STATES = ["OTHER_SUBSIDIARY", "OTHER_OWNER", "NOT_IN_NETSUITE", "NO_ID"];
const FIXABLE_LOCATION_STATES = ["OTHER_SUBSIDIARY", "OTHER_OWNER", "NO_ID"];

const { flowWarning, isCompanyNotSetUp } = useNetSuiteSetupStatus();
const ordersSetupWarning = computed(() => (isCompanyNotSetUp(subsidiary.value) ? "Set up this company first." : flowWarning.value));
const isShowingAllLocations = ref(false);
const shownLocations = computed(() => (isShowingAllLocations.value
  ? locations.value
  : locations.value.filter((location: any) => ATTENTION_STATES.includes(location.state))));

const locationCountsText = computed(() => {
  const countOf = (states: string[]) => locations.value.filter((location: any) => states.includes(location.state)).length;
  const parts = [
    translate(locations.value.length === 1 ? "1 location" : "{count} locations", { count: locations.value.length }),
    countOf(["MATCHES"]) ? translate("{count} match NetSuite", { count: countOf(["MATCHES"]) }) : "",
    countOf(["OTHER_SUBSIDIARY", "OTHER_OWNER"]) ? translate("{count} differ", { count: countOf(["OTHER_SUBSIDIARY", "OTHER_OWNER"]) }) : "",
    countOf(["NOT_IN_NETSUITE"]) ? translate("{count} not in NetSuite", { count: countOf(["NOT_IN_NETSUITE"]) }) : "",
    countOf(["NO_ID"]) ? translate("{count} with no NetSuite id", { count: countOf(["NO_ID"]) }) : "",
    countOf(["NOT_CHECKED"]) ? translate("{count} not checked", { count: countOf(["NOT_CHECKED"]) }) : "",
  ];
  return parts.filter(Boolean).join(" · ");
});

const SYNC_OWNER = createSyncDomainOwner("netSuiteSubsidiary");

function screenDomains() {
  const companyDomains = partyId.value ? [{ name: NETSUITE_COMPANY_SETUP_DOMAIN, args: { partyId: partyId.value } }] : [];
  const storeDomains = stores.value.flatMap((store: any) => [
    { name: NETSUITE_STEP_COUNTS_DOMAIN, args: { productStoreId: store.productStoreId } },
    { name: NETSUITE_ORDERS_SETUP_DOMAIN, args: { productStoreId: store.productStoreId } },
    { name: NETSUITE_SHIPMENT_STEP_COUNTS_DOMAIN, args: { productStoreId: store.productStoreId } },
  ]);
  const sendingDomains = stores.value.length ? [{ name: NETSUITE_SENDING_COUNTS_DOMAIN }] : [];
  return [{ name: NETSUITE_SUBSIDIARIES_DOMAIN }, ...SETUP_STATUS_DOMAINS, ...companyDomains, ...sendingDomains, ...storeDomains];
}

let isOnScreen = false;
const activate = () => activateSyncDomains(screenDomains(), SYNC_OWNER);

watch(() => [partyId.value, stores.value.map((store: any) => store.productStoreId).join(",")], () => { if (isOnScreen) void activate(); });
onIonViewWillEnter(() => {
  isOnScreen = true;
  void activate();
});
onIonViewDidLeave(() => {
  isOnScreen = false;
  void deactivateSyncDomains(SYNC_OWNER);
});
</script>

<style scoped>
section {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: var(--spacer-sm);
}

.store-block {
  margin-bottom: var(--spacer-lg);
}

.section-note {
  color: var(--ion-color-medium);
}

</style>
