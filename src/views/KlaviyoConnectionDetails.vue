<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/klaviyo" />
        </ion-buttons>
        <ion-title>{{ connection?.description || translate("Klaviyo connection") }}</ion-title>
        <ion-buttons slot="end" v-if="connection">
          <ion-button @click="openEditModal">
            <ion-icon slot="start" :icon="createOutline" />
            {{ translate("Edit") }}
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-list v-if="isLoading" inset>
        <ion-item v-for="item in 5" :key="item">
          <ion-label>
            <ion-skeleton-text animated />
            <p><ion-skeleton-text animated /></p>
          </ion-label>
        </ion-item>
      </ion-list>

      <ion-card v-else-if="!connection">
        <ion-card-header>
          <ion-card-title>{{ translate("Connection not found") }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <p>{{ translate("This connection may have been deleted, or it doesn't belong to your tenant.") }}</p>
          <ion-button expand="block" fill="outline" @click="goBack">{{ translate("Back to Klaviyo") }}</ion-button>
        </ion-card-content>
      </ion-card>

      <template v-else>
        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ connection.description || translate("Untitled connection") }}</ion-card-title>
            <ion-card-subtitle>{{ connection.commGatewayAuthId }}</ion-card-subtitle>
            <ion-badge color="success">{{ translate("Active") }}</ion-badge>
          </ion-card-header>
          <ion-list>
            <ion-item>
              <ion-label>
                {{ translate("Endpoint") }}
                <p>{{ connection.baseUrl }}</p>
              </ion-label>
            </ion-item>
            <ion-item>
              <ion-label>
                {{ translate("API key") }}
                <p>{{ maskedKey }}</p>
              </ion-label>
            </ion-item>
            <ion-item lines="none">
              <ion-label>
                {{ translate("Tenant") }}
                <p>{{ connection.tenantPartyId || "—" }}</p>
              </ion-label>
            </ion-item>
          </ion-list>
        </ion-card>

        <ion-list inset>
          <ion-item>
            <ion-label>
              <h2>{{ translate("Choose which emails Klaviyo sends") }}</h2>
              <p>{{ translate("Each email event below corresponds to a moment in your customer's journey. Turn one on to send it through {connection} for the selected store.", { connection: connection?.description || translate("this connection") }) }}</p>
            </ion-label>
          </ion-item>
        </ion-list>

        <ion-segment
          v-if="productStores.length"
          :value="selectedStoreId"
          scrollable
          @ionChange="handleStoreChange($event.detail.value)"
        >
          <ion-segment-button
            v-for="productStore in productStores"
            :key="productStore.productStoreId"
            :value="productStore.productStoreId"
          >
            <ion-label>{{ productStore.storeName || productStore.productStoreId }}</ion-label>
          </ion-segment-button>
        </ion-segment>

        <ion-card v-if="!productStores.length && !isLoading">
          <ion-card-header>
            <ion-card-title>{{ translate("No product stores available") }}</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <p>{{ translate("Add or load a product store first before configuring Klaviyo email events.") }}</p>
          </ion-card-content>
        </ion-card>

        <ion-list v-else inset>
          <template v-for="evt in eventsForStore" :key="evt.emailType">
            <ion-item>
              <ion-toggle
                :checked="evt.enabled && evt.ownedByThisGateway"
                :disabled="evt.enabled && !evt.ownedByThisGateway || busyEvent === evt.emailType"
                @ionChange="toggleEvent(evt, $event.detail.checked)"
              >
              {{ evt.label }}
                <p v-if="evt.enabled && !evt.ownedByThisGateway">{{ translate("This event is sent through a different connection. Disable it there first to manage it from here.") }}</p>
              </ion-toggle>
            </ion-item>
            <ion-item v-if="evt.enabled && evt.ownedByThisGateway">
              <ion-input
                :value="evt.subject"
                :label="translate('Subject')"
                label-placement="stacked"
                :placeholder="translate('Email subject your customer sees')"
                @ionInput="onSubjectInput(evt, $event.detail.value)"
                @ionBlur="commitSubjectIfChanged(evt)"
                :debounce="200"
              />
            </ion-item>
          </template>
        </ion-list>

        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ translate("Disconnect Klaviyo") }}</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <p v-if="eventsForThisConnection.length">
              {{ translate("This connection currently sends {count} email event(s). Removing it will stop those emails immediately.", { count: eventsForThisConnection.length }) }}
            </p>
            <p v-else>
              {{ translate("This connection isn't sending any emails right now, but disconnecting will permanently remove the API key and configuration.") }}
            </p>
            <ion-button color="danger" fill="outline" expand="block" @click="confirmDelete">
              <ion-icon slot="start" :icon="trashOutline" />
              {{ translate("Disconnect") }}
            </ion-button>
          </ion-card-content>
        </ion-card>
      </template>
    </ion-content>

    <ion-modal :is-open="showDeleteModal" :backdrop-dismiss="!isDeleting" @didDismiss="cancelDelete">
      <ion-header>
        <ion-toolbar>
          <ion-buttons slot="start">
            <ion-button @click="cancelDelete" :disabled="isDeleting">
              <ion-icon slot="icon-only" :icon="closeOutline" />
            </ion-button>
          </ion-buttons>
          <ion-title>{{ translate("Disconnect Klaviyo?") }}</ion-title>
        </ion-toolbar>
      </ion-header>
      <ion-content>
        <ion-list inset>
          <ion-item>
            <ion-label>
              {{ translate("This cannot be undone") }}
              <p>{{ translate("Disconnecting {name} will:", { name: connection?.description || translate("this connection") }) }}</p>
            </ion-label>
          </ion-item>
          <ion-item>
            <ion-label>{{ translate("Permanently delete the saved Klaviyo API key from Unigate") }}</ion-label>
          </ion-item>
          <ion-item v-if="eventsForThisConnection.length">
            <ion-label>{{ translate("Stop {count} email event(s) from being sent", { count: eventsForThisConnection.length }) }}</ion-label>
          </ion-item>
          <ion-item>
            <ion-label>{{ translate("Require re-entering the API key if you ever want to reconnect") }}</ion-label>
          </ion-item>
          <ion-item v-if="eventsForThisConnection.length">
            <ion-label>
              <h3>{{ translate("Type DELETE below to confirm:") }}</h3>
            </ion-label>
          </ion-item>
          <ion-item v-if="eventsForThisConnection.length">
            <ion-input
              v-model="deleteConfirmText"
              :placeholder="'DELETE'"
              autocomplete="off"
              spellcheck="false"
            />
          </ion-item>
        </ion-list>
      </ion-content>
      <ion-footer>
        <ion-toolbar>
          <ion-buttons slot="start">
            <ion-button fill="clear" @click="cancelDelete" :disabled="isDeleting">{{ translate("Keep connection") }}</ion-button>
          </ion-buttons>
          <ion-buttons slot="end">
            <ion-button
              color="danger"
              @click="performDelete"
              :disabled="!canConfirmDelete || isDeleting"
            >
              <ion-spinner v-if="isDeleting" name="crescent" />
              <span v-else>{{ translate("Disconnect Klaviyo") }}</span>
            </ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-footer>
    </ion-modal>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, defineProps, ref, watch } from "vue";
import {
  IonBackButton,
  IonBadge,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonPage,
  IonSegment,
  IonSegmentButton,
  IonSkeletonText,
  IonSpinner,
  IonTitle,
  IonToggle,
  IonToolbar,
  modalController,
  onIonViewWillEnter,
} from "@ionic/vue";
import { closeOutline, createOutline, trashOutline } from "ionicons/icons";
import { useStore } from "vuex";
import { useRouter } from "vue-router";
import { translate } from "@/i18n";
import { KlaviyoService, ProductStoreEmailSetting } from "@/services/KlaviyoService";
import KlaviyoConnectionModal from "@/components/KlaviyoConnectionModal.vue";
import { getResponseErrorMessage, showToast } from "@/utils";
import logger from "@/logger";
import {
  getDefaultKlaviyoProductStoreId,
  getKlaviyoEventLabel,
  getKlaviyoEventsForStore,
} from "@/utils/klaviyoEmailEvents";

const props = defineProps<{ id: string }>();
const store = useStore();
const router = useRouter();

const isLoading = ref(false);
const showDeleteModal = ref(false);
const isDeleting = ref(false);
const deleteConfirmText = ref("");

const decodedId = computed(() => {
  try {
    return decodeURIComponent(props.id);
  } catch {
    return props.id;
  }
});

const connection = computed(() => store.getters["klaviyo/getConnectionById"](decodedId.value));

const eventsForThisConnection = computed(() => {
  return store.getters["klaviyo/getEmailSettingsForGateway"](decodedId.value) || [];
});
const maskedKey = computed(() => KlaviyoService.maskApiKey(connection.value?.publicKey) || translate("Not set"));

const canConfirmDelete = computed(() => {
  if (!eventsForThisConnection.value.length) return true;
  return deleteConfirmText.value.trim().toUpperCase() === "DELETE";
});

const busyEvent = ref<string | null>(null);
const selectedStoreId = ref<string>("");
const subjectDrafts = ref<Record<string, string>>({});

const productStores = computed(() => store.getters["productStore/getProductStores"] || []);
const allSettings = computed<ProductStoreEmailSetting[]>(() => store.getters["klaviyo/getEmailSettings"] || []);
const emailTypes = computed(() => store.getters["util/getEmailTypes"] || []);

const preferredStoreId = computed(() => {
  const firstConfiguredEvent = allSettings.value.find(
    (setting) => setting.gatewayAuthId === connection.value?.commGatewayAuthId
  );
  return firstConfiguredEvent?.productStoreId || "";
});

const eventsForStore = computed(() => {
  return getKlaviyoEventsForStore({
    productStoreId: selectedStoreId.value,
    emailTypes: emailTypes.value,
    allSettings: allSettings.value,
    gatewayAuthId: connection.value?.commGatewayAuthId,
    subjectDrafts: subjectDrafts.value,
  });
});

watch(
  [() => productStores.value, () => preferredStoreId.value],
  ([stores, nextPreferredStoreId]) => {
    selectedStoreId.value = getDefaultKlaviyoProductStoreId(
      stores,
      selectedStoreId.value,
      nextPreferredStoreId
    );
  },
  { immediate: true }
);

onIonViewWillEnter(async () => {
  isLoading.value = true;
  try {
    await store.dispatch("klaviyo/hydrate");
    
    if (!productStores.value?.length) {
      await store.dispatch("productStore/fetchProductStores");
    }
    if (!emailTypes.value?.length) {
      await store.dispatch("util/fetchEmailTypes");
    }
    if (!allSettings.value?.length) {
      await store.dispatch("klaviyo/fetchAllEmailSettings");
    }
  } catch (error) {
    logger.error(error);
  } finally {
    isLoading.value = false;
  }
});

function handleStoreChange(value: string) {
  selectedStoreId.value = value;
  subjectDrafts.value = {};
}

function getEventLabel(emailType: string) {
  return getKlaviyoEventLabel(emailTypes.value, emailType);
}

function getStateLabel(evt: any) {
  if (!evt.enabled) return translate("Off");
  if (!evt.ownedByThisGateway) return translate("On (other connection)");
  return translate("On");
}

function defaultSubjectFor(emailType: string) {
  const map: Record<string, string> = {
    READY_FOR_PICKUP: translate("Your order is ready for pickup"),
    REJECT_BOPIS_ORDER: translate("Update on your pickup order"),
    CANCEL_BOPIS_ORDER: translate("Your pickup order has been cancelled"),
    HANDOVER_BOPIS_ORDER: translate("Thanks for picking up your order"),
    CREATE_KLAVIYO_EVENT: translate("Order event"),
  };
  return map[emailType] || getEventLabel(emailType);
}

function onSubjectInput(evt: any, value: string | null | undefined) {
  subjectDrafts.value[evt.emailType] = value || "";
}

async function commitSubjectIfChanged(evt: any) {
  if (!evt.ownedByThisGateway || !evt.setting) return;
  const draft = subjectDrafts.value[evt.emailType];
  if (draft === undefined) return;
  if (draft === evt.setting.subject) return;
  if (!draft.trim()) return;
  busyEvent.value = evt.emailType;
  try {
    const payload: ProductStoreEmailSetting = {
      productStoreId: selectedStoreId.value,
      emailType: evt.emailType,
      subject: draft.trim(),
      systemMessageRemoteId: "UNIGATE_CONFIG",
      gatewayAuthId: connection.value.commGatewayAuthId,
      fromAddress: evt.setting.fromAddress,
    };
    await KlaviyoService.upsertEmailSetting(payload);
    await store.dispatch("klaviyo/fetchAllEmailSettings");
    showToast(translate("Subject updated"));
    delete subjectDrafts.value[evt.emailType];
  } catch (error: any) {
    logger.error(error);
    showToast(getResponseErrorMessage(error, translate("Failed to update subject")));
  } finally {
    busyEvent.value = null;
  }
}

async function toggleEvent(evt: any, enabled: boolean) {
  if (busyEvent.value) return;
  if (evt.enabled && !evt.ownedByThisGateway) return;
  busyEvent.value = evt.emailType;
  try {
    if (enabled) {
      const payload: ProductStoreEmailSetting = {
        productStoreId: selectedStoreId.value,
        emailType: evt.emailType,
        subject: evt.setting?.subject || defaultSubjectFor(evt.emailType),
        systemMessageRemoteId: "UNIGATE_CONFIG",
        gatewayAuthId: connection.value.commGatewayAuthId,
      };
      await KlaviyoService.upsertEmailSetting(payload);
      showToast(translate("{label} turned on", { label: getEventLabel(evt.emailType) }));
    } else {
      await KlaviyoService.deleteEmailSetting(selectedStoreId.value, evt.emailType);
      showToast(translate("{label} turned off", { label: getEventLabel(evt.emailType) }));
    }
    await store.dispatch("klaviyo/fetchAllEmailSettings");
  } catch (error: any) {
    logger.error(error);
    showToast(getResponseErrorMessage(error, translate("Failed to update email event")));
  } finally {
    busyEvent.value = null;
  }
}

async function openEditModal() {
  const modal = await modalController.create({
    component: KlaviyoConnectionModal,
    componentProps: { connection: connection.value },
  });
  modal.onDidDismiss().then(async () => {
    await store.dispatch("klaviyo/fetchConnections");
  });
  modal.present();
}

function confirmDelete() {
  showDeleteModal.value = true;
  deleteConfirmText.value = "";
}

function cancelDelete() {
  if (isDeleting.value) return;
  showDeleteModal.value = false;
  deleteConfirmText.value = "";
}

async function performDelete() {
  if (!connection.value) return;
  if (!canConfirmDelete.value) return;
  isDeleting.value = true;
  try {
    await KlaviyoService.deleteCommGatewayAuth(connection.value.commGatewayAuthId);
    showToast(translate("Klaviyo connection disconnected"));
    showDeleteModal.value = false;
    await store.dispatch("klaviyo/hydrate");
    router.replace("/klaviyo");
  } catch (error: any) {
    logger.error(error);
    showToast(getResponseErrorMessage(error, translate("Failed to disconnect Klaviyo")));
  } finally {
    isDeleting.value = false;
  }
}

function goBack() {
  router.replace("/klaviyo");
}
</script>

<style scoped>

ion-card-header {
  display: grid;
  grid-template-columns: 1fr min-content;
  align-items: start;
}

ion-card-header ion-badge {
  grid-column: 2;
  grid-row: 1;
}

ion-card-header ion-card-title {
  grid-row: 1;
  grid-column: 1;
}

ion-card-header ion-card-subtitle {
  grid-row: 2;
  grid-column: 1 / -1;
}

</style>