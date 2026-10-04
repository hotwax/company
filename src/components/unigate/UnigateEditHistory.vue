<template>
  <ion-list inset lines="full">
    <ion-list-header>
      <ion-label>{{ translate("Edit history") }}</ion-label>
      <ion-button :disabled="loading" @click="load()">
        {{ translate("Refresh") }}
      </ion-button>
    </ion-list-header>
    <ion-item v-for="row in rows" :key="row.id">
      <ion-label class="ion-text-wrap">
        {{ fieldLabels[row.field] ? translate(fieldLabels[row.field]) : translate("Connection updated") }}
        <p>{{ formatDate(row.changedAt) }} — {{ translate("Changed by") }}: {{ row.changedBy || translate("Unknown user") }}</p>
        <template v-if="row.oldValue !== undefined">
          <p>{{ translate("Previous value") }}: {{ row.oldValue || translate("Not set") }}</p>
          <p>{{ translate("New value") }}: {{ row.newValue || translate("Not set") }}</p>
        </template>
        <p v-else>
          {{ translate("Value changed; contents hidden.") }}
        </p>
      </ion-label>
    </ion-item>
    <ion-item v-if="loading">
      <ion-spinner slot="start" /><ion-label>{{ translate("Loading edit history…") }}</ion-label>
    </ion-item>
    <ion-item v-else-if="error">
      <ion-label class="ion-text-wrap">
        {{ translate("Could not load edit history.") }}
      </ion-label>
      <ion-button slot="end" @click="load()">
        {{ translate("Retry") }}
      </ion-button>
    </ion-item>
    <ion-item v-else-if="!rows.length">
      <ion-label>{{ translate("No recorded changes yet.") }}</ion-label>
    </ion-item>
    <ion-item v-if="hasMore && !error" lines="none">
      <ion-button fill="clear" :disabled="loading" @click="load(false)">
        {{ translate("Load more") }}
      </ion-button>
    </ion-item>
  </ion-list>
</template>

<script setup lang="ts">
import { translate } from "@common";
import { IonButton, IonItem, IonLabel, IonList, IonListHeader, IonSpinner } from "@ionic/vue";
import { onMounted, watch } from "vue";
import { useUnigateHistory } from "@/composables/useUnigateHistory";

const props = defineProps<{ revision: number }>();
const { rows, loading, error, hasMore, load } = useUnigateHistory();
const fieldLabels: Record<string, string> = { internalId: "Tenant ID", username: "Tenant ID", sendUrl: "UniGate URL", publicKey: "UniGate API key", password: "UniGate API key", privateKey: "Private key", sharedSecret: "Shared secret", sendSharedSecret: "Shared secret" };
function formatDate(value: string | number) {
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? translate("Date unavailable") : date.toLocaleString();
}
onMounted(() => load());
watch(() => props.revision, () => load());
</script>
