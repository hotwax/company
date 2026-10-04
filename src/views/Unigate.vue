<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-menu-button slot="start" />
        <ion-title>{{ translate("Unigate") }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <ion-list v-if="loading" inset>
        <ion-item><ion-label><ion-skeleton-text animated /></ion-label></ion-item>
      </ion-list>
      <ion-list v-else-if="loadError" inset>
        <ion-item>
          <ion-label class="ion-text-wrap">
            <h2>{{ translate("Unable to load the UniGate connection") }}</h2>
            <p>{{ translate("Check your connection and access to this OMS, then try again.") }}</p>
          </ion-label>
          <ion-button slot="end" @click="reload">
            {{ translate("Retry") }}
          </ion-button>
        </ion-item>
      </ion-list>
      <template v-else>
        <section class="ion-padding">
          <h2>{{ translate(editing ? "Connect OMS to UniGate" : "OMS connection to UniGate") }}</h2>
          <p v-if="editing">
            {{ translate("Connect once to enable carrier and messaging integrations. Use the tenant ID and API key issued by your UniGate administrator.") }}
          </p>
          <ion-item v-if="result || !editing" lines="none">
            <ion-icon slot="start" :icon="verified ? checkmarkCircleOutline : informationCircleOutline" :color="verified ? 'success' : 'warning'" />
            <ion-label class="ion-text-wrap" role="status">
              <h2>{{ translate(statusTitle) }}</h2>
              <p>{{ translate(statusMessage) }}</p>
              <p v-if="result?.carrierApiUnavailable">
                {{ translate("Your tenant and API key work. The carrier API is incompatible with this OMS version; align the OMS and UniGate versions before setting up carriers.") }}
              </p>
              <p v-if="verified && result?.checkedAt">
                {{ translate("Last checked") }}: {{ formatCheckedAt(result.checkedAt) }}
              </p>
            </ion-label>
          </ion-item>

          <form v-if="editing" @submit.prevent="connect">
            <ion-select v-model="environment" class="ion-margin-bottom" fill="outline" :label="translate('Environment')" label-placement="floating" interface="popover" :disabled="busy">
              <ion-select-option value="">
                {{ translate("Choose an environment") }}
              </ion-select-option>
              <ion-select-option value="uat">
                {{ translate("Test / UAT") }}
              </ion-select-option>
              <ion-select-option value="production">
                {{ translate("Production") }}
              </ion-select-option>
              <ion-select-option value="custom">
                {{ translate("Custom URL (advanced)") }}
              </ion-select-option>
            </ion-select>
            <ion-input v-if="environment === 'custom'" v-model="customUrl" class="ion-margin-bottom" fill="outline" :label="translate('UniGate URL')" label-placement="floating" type="url" placeholder="https://" :disabled="busy" required />
            <p v-else-if="sendUrl">
              {{ sendUrl }}
            </p>
            <ion-input v-model="tenantId" class="ion-margin-bottom" fill="outline" :label="translate('Tenant ID')" label-placement="floating" :helper-text="translate('Use your tenant organization’s party ID in UniGate.')" :disabled="busy" required />
            <ion-input v-model="key" class="ion-margin-bottom" fill="outline" :label="translate('UniGate API key')" label-placement="floating" type="password" autocomplete="new-password" :helper-text="translate(keyHelp)" :disabled="busy" :required="needsKey" />
            <p v-if="environmentWarning">
              {{ translate(environmentWarning) }}
            </p>
            <ion-button type="submit" :disabled="!canConnect || busy" data-testid="connect-unigate-btn">
              <ion-spinner v-if="busy" slot="start" />
              {{ translate(busy ? "Connecting…" : "Connect") }}
            </ion-button>
            <ion-button v-if="hasSettings" fill="clear" :disabled="busy" @click="cancelEdit">
              {{ translate("Cancel") }}
            </ion-button>
          </form>

          <template v-else>
            <ion-list>
              <ion-item>
                <ion-label class="ion-text-wrap">
                  {{ translate("Tenant ID") }}<p>{{ connection.tenantId }}</p>
                </ion-label>
              </ion-item>
              <ion-item>
                <ion-label class="ion-text-wrap">
                  {{ translate("UniGate URL") }}<p>{{ connection.sendUrl }}</p>
                </ion-label>
              </ion-item>
              <ion-item>
                <ion-label class="ion-text-wrap">
                  {{ translate("UniGate API key") }}<p>{{ translate(keyStatus) }}</p>
                </ion-label>
              </ion-item>
            </ion-list>
            <ion-button :disabled="busy" @click="test">
              <ion-spinner v-if="busy" slot="start" />{{ translate(verified ? "Test again" : "Test connection") }}
            </ion-button>
            <ion-button fill="clear" :disabled="busy" @click="startEdit">
              {{ translate("Edit connection") }}
            </ion-button>
          </template>
          <p v-if="notice" role="alert">
            {{ translate(notice) }}
          </p>
        </section>

        <ion-list v-if="verified && !editing" inset>
          <ion-list-header>{{ translate("Next steps") }}</ion-list-header>
          <ion-item button detail router-link="/carriers">
            <ion-label>{{ translate("Set up FedEx") }}<p>{{ translate("Connect FedEx or another carrier and assign it to your stores.") }}</p></ion-label>
          </ion-item>
          <ion-item button detail router-link="/klaviyo">
            <ion-label>{{ translate("Set up Klaviyo") }}<p>{{ translate("Connect your account for customer notifications.") }}</p></ion-label>
          </ion-item>
        </ion-list>
        <ion-accordion-group v-if="editing" class="ion-margin">
          <ion-accordion value="tenant-help">
            <ion-item slot="header">
              <ion-label>{{ translate("Don't have a UniGate tenant?") }}</ion-label>
            </ion-item>
            <div slot="content" class="ion-padding">
              <p>{{ translate("Ask your UniGate administrator to create a tenant and issue its API key for the selected environment. You need the tenant ID and key before connecting OMS.") }}</p>
              <p>{{ translate("A FedEx account number or FedEx API key cannot be used here. Carrier credentials are added separately on the Carriers page.") }}</p>
              <p v-if="unigateAppUrl">
                <a :href="unigateAppUrl" target="_blank" rel="noopener noreferrer">{{ translate("Open UniGate") }}</a>
              </p>
            </div>
          </ion-accordion>
        </ion-accordion-group>
      </template>
      <UnigateEditHistory :revision="historyRevision" />
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { translate } from "@common";
import { IonAccordion, IonAccordionGroup, IonButton, IonContent, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonList, IonListHeader, IonMenuButton, IonPage, IonSelect, IonSelectOption, IonSkeletonText, IonSpinner, IonTitle, IonToolbar, onIonViewWillEnter, onIonViewWillLeave } from "@ionic/vue";
import { checkmarkCircleOutline, informationCircleOutline } from "ionicons/icons";
import { computed, ref } from "vue";
import UnigateEditHistory from "@/components/unigate/UnigateEditHistory.vue";
import { useMaargConfig } from "@/composables/useSeed";
import { useUnigateConnection } from "@/composables/useUnigateConnection";
import { getDefaultUnigateSendUrl, normalizeUnigateSendUrl } from "@/utils/maarg";

const { connection, loading, loadError, busy, result, notice, load, save, test } = useUnigateConnection();
const { config: maargConfig, load: loadMaargConfig } = useMaargConfig();
const editing = ref(false);
const historyRevision = ref(0);
const environment = ref("");
const customUrl = ref("");
const tenantId = ref("");
const key = ref("");
const urls: Record<string, string> = { uat: "https://unigate-uat.hotwax.io", production: "https://unigate.hotwax.io" };
const sendUrl = computed(() => environment.value === "custom" ? customUrl.value.trim() : urls[environment.value] || "");
const unigateAppUrl = computed(() => {
  try {
    const url = new URL(sendUrl.value);
    if(url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {return "";}

    return `${url.origin}/apps/Unigate`;
  } catch { return ""; }
});
const hasSettings = computed(() => Boolean(connection.value.tenantId && connection.value.sendUrl));
const needsKey = computed(() => !hasSettings.value || connection.value.hasKey === false || tenantId.value.trim() !== connection.value.tenantId || normalizeUnigateSendUrl(sendUrl.value) !== normalizeUnigateSendUrl(connection.value.sendUrl));
const keyHelp = computed(() => needsKey.value ? "Enter the API key issued for this tenant and environment." : "Leave blank to keep the key saved in OMS.");
const keyStatus = computed(() => connection.value.hasKey === true ? "Saved in OMS" : connection.value.hasKey === false ? "Missing" : "Key presence cannot be checked on this OMS version.");
const canConnect = computed(() => {
  try {
    const url = new URL(sendUrl.value);

    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash && Boolean(tenantId.value.trim()) && (!needsKey.value || Boolean(key.value.trim()));
  } catch { return false; }
});
const environmentWarning = computed(() => {
  const expected = getDefaultUnigateSendUrl(maargConfig.value);

  return expected && sendUrl.value && normalizeUnigateSendUrl(sendUrl.value) !== expected ? "This UniGate environment differs from the default for your OMS. Confirm the tenant and key belong to the environment you selected." : "";
});
const verified = computed(() => result.value?.status === "connected");
const statusTitle = computed(() => verified.value ? "Connected to UniGate" : result.value ? "Connection needs attention" : "Saved, not verified");
const messages = {
  connected: "OMS successfully authenticated with UniGate.",
  incomplete: "The saved connection is incomplete. Add the tenant ID, URL and API key.",
  unauthorized: "UniGate did not accept this tenant and API key. Check both values and the selected environment.",
  unreachable: "OMS could not reach UniGate. Check the URL or try again later.",
  "invalid-url": "The saved UniGate URL is invalid. Use an HTTPS URL without credentials, a query or a fragment.",
  "route-unavailable": "OMS received a 404 from UniGate. Check the UniGate URL and whether this instance supports the verification endpoint.",
  "invalid-response": "The server did not return the expected UniGate response. Check the URL.",
  unavailable: "Settings are saved, but connection testing is unavailable on this OMS version. Ask your OMS administrator to enable it.",
  error: "The connection check could not be completed. Check your OMS access and try again.",
};
const statusMessage = computed(() => result.value ? messages[result.value.status] : "These settings are saved in OMS. Test the connection to confirm UniGate accepts them.");
const formatCheckedAt = (value: string) => new Date(value).toLocaleString();
function seedForm() {
  tenantId.value = connection.value.tenantId;
  key.value = "";
  const url = normalizeUnigateSendUrl(connection.value.sendUrl || getDefaultUnigateSendUrl(maargConfig.value));
  environment.value = Object.keys(urls).find((env) => urls[env] === url) || (url ? "custom" : "");
  customUrl.value = url;
}
function startEdit() { seedForm(); editing.value = true; result.value = null; notice.value = ""; }
function cancelEdit() { key.value = ""; editing.value = false; }
async function reload() {
  if(busy.value) {return;}
  await Promise.all([load(), loadMaargConfig()]);
  seedForm();
  editing.value = !hasSettings.value || connection.value.hasKey === false;
  if(!loadError.value && !editing.value) {await test();}
}
async function connect() {
  if(!canConnect.value || busy.value) {return;}
  const saved = await save({ tenantId: tenantId.value, sendUrl: sendUrl.value, key: key.value });
  key.value = "";
  if(saved) { historyRevision.value++; editing.value = false; await test(); }
}
onIonViewWillEnter(reload);
onIonViewWillLeave(() => { key.value = ""; });
</script>
