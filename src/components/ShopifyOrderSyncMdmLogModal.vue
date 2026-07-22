<template>
  <ion-modal :is-open="isOpen" @didDismiss="close">
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button :aria-label="translate('Close')" @click="close">
            <ion-icon slot="icon-only" :icon="closeOutline" />
          </ion-button>
        </ion-buttons>
        <ion-title>{{ translate("Data Manager Log") }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <ion-card v-if="isLoading">
        <ion-card-content>
          <ion-spinner name="crescent" />
        </ion-card-content>
      </ion-card>
      <ion-card v-else-if="loadError" role="alert">
        <ion-card-content>{{ loadError }}</ion-card-content>
      </ion-card>
      <ion-list v-else lines="full">
        <ion-item>
          <ion-label>{{ translate("Log ID") }}</ion-label>
          <ion-label slot="end">{{ mdmLog.logId || translate("Not available") }}</ion-label>
        </ion-item>
        <ion-item>
          <ion-label>{{ translate("Status") }}</ion-label>
          <ion-label slot="end">{{ statusLabel }}</ion-label>
        </ion-item>
        <ion-item v-if="mdmLog.totalRecordCount !== undefined">
          <ion-label>{{ translate("Total Records") }}</ion-label>
          <ion-label slot="end">{{ mdmLog.totalRecordCount }}</ion-label>
        </ion-item>
        <ion-item v-if="mdmLog.successRecordCount !== undefined">
          <ion-label>{{ translate("Success Records") }}</ion-label>
          <ion-label slot="end">{{ mdmLog.successRecordCount }}</ion-label>
        </ion-item>
        <ion-item v-if="mdmLog.failedRecordCount !== undefined">
          <ion-label>{{ translate("Failed Records") }}</ion-label>
          <ion-label slot="end">{{ mdmLog.failedRecordCount }}</ion-label>
        </ion-item>
      </ion-list>
    </ion-content>
  </ion-modal>
</template>

<script setup lang="ts">
import {
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from "@ionic/vue";
import { computed, ref, watch } from "vue";
import { closeOutline } from "ionicons/icons";
import { translate } from "@common";
import { useDataManagerLog } from "@/composables/useDataManagerLog";

const props = defineProps<{ isOpen: boolean; logId: string }>();
const emit = defineEmits<{ close: [] }>();
const { currentMdmLog, fetchLogDetails } = useDataManagerLog();
const isLoading = ref(false);
const loadError = ref("");

const mdmLog = computed(() => currentMdmLog.value || {});
const statusLabel = computed(() => {
  const status = String(mdmLog.value.statusId || mdmLog.value.status || "").trim();
  return status || translate("Not available");
});

watch(() => [props.isOpen, props.logId], ([isOpen]) => {
  if (isOpen && props.logId) void load();
});

async function load() {
  isLoading.value = true;
  loadError.value = "";
  try {
    await fetchLogDetails(props.logId);
  } catch (_error) {
    loadError.value = translate("Failed to load sync step details.");
  } finally {
    isLoading.value = false;
  }
}

function close() {
  emit("close");
}
</script>
