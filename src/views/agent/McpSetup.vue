<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-menu-button slot="start" />
        <ion-title>{{ translate("MCP setup") }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <main class="mcp-setup ion-padding">
        <ion-card>
          <ion-card-header>
            <ion-card-subtitle>{{ translate("Your OMS, in your AI workspace") }}</ion-card-subtitle>
            <ion-card-title>{{ translate("Connect your AI assistant") }}</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <p>{{ translate("Model Context Protocol (MCP) lets Codex, Claude, and Antigravity use tools provided by your OMS. Ask questions about your operations using live data from your instance.") }}</p>
            <p class="ion-padding-top">{{ translate("Your administrator must enable MCP on the instance first. Available tools depend on the installed components, and actions run with the token owner's OMS permissions. Keep approval enabled for actions that change data.") }}</p>
          </ion-card-content>
        </ion-card>

        <ion-card>
          <ion-card-header>
            <ion-card-subtitle>{{ translate("Step 1") }}</ion-card-subtitle>
            <ion-card-title>{{ translate("Get your connection details") }}</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <p>{{ translate("These connection details use the OMS instance you're signed into.") }}</p>
          </ion-card-content>
          <ion-list lines="full">
            <ion-item>
              <ion-icon slot="start" :icon="linkOutline" aria-hidden="true" />
              <ion-label class="ion-text-wrap">
                <h2>{{ translate("MCP server URL") }}</h2>
                <p class="mcp-url">{{ connection?.endpoint || translate("Your OMS connection could not be determined. Sign in again to load your instance.") }}</p>
              </ion-label>
              <ion-button slot="end" fill="clear" :disabled="!connection" :aria-label="translate('Copy MCP server URL')" @click="copy(connection!.endpoint)">
                <ion-icon slot="icon-only" :icon="copyOutline" aria-hidden="true" />
              </ion-button>
            </ion-item>
            <ion-item>
              <ion-icon slot="start" :icon="keyOutline" aria-hidden="true" />
              <ion-label class="ion-text-wrap">
                <h2>{{ translate("Generate your MCP token") }}</h2>
                <p>{{ translate("Create a token for your signed-in account. It uses your existing OMS permissions and the purpose MCP.") }}</p>
              </ion-label>
            </ion-item>
            <ion-item>
              <ion-label class="ion-text-wrap">
                <h2>{{ translate("Token owner") }}</h2>
                <p>{{ username || translate("Waiting for your user profile") }}</p>
              </ion-label>
            </ion-item>
            <ion-item>
              <ion-select v-model="expireDays" :label="translate('Expires in')" :disabled="tokenPending || !!token" interface="popover">
                <ion-select-option :value="1">{{ translate("1 day") }}</ion-select-option>
                <ion-select-option :value="7">{{ translate("7 days") }}</ion-select-option>
                <ion-select-option :value="30">{{ translate("30 days") }}</ion-select-option>
                <ion-select-option :value="90">{{ translate("90 days") }}</ion-select-option>
                <ion-select-option :value="180">{{ translate("180 days") }}</ion-select-option>
                <ion-select-option :value="365">{{ translate("365 days") }}</ion-select-option>
              </ion-select>
            </ion-item>
          </ion-list>
          <ion-card-content>
            <template v-if="token">
              <ion-input :value="token" :type="revealToken ? 'text' : 'password'" readonly fill="outline" label-placement="stacked" :label="translate('Generated JWT token')" autocomplete="off" :spellcheck="false">
                <ion-button slot="end" fill="clear" :aria-label="revealToken ? translate('Hide token') : translate('Show token')" @click="revealToken = !revealToken">
                  <ion-icon slot="icon-only" :icon="revealToken ? eyeOffOutline : eyeOutline" aria-hidden="true" />
                </ion-button>
              </ion-input>
              <p class="ion-padding-top">{{ translate("Token expires {date}", { date: tokenExpiryLabel }) }}</p>
              <ion-button @click="copy(token)">
                <ion-icon slot="start" :icon="copyOutline" aria-hidden="true" />
                {{ translate("Copy token") }}
              </ion-button>
              <ion-button fill="clear" @click="clearToken">{{ translate("Clear from page") }}</ion-button>
              <p class="ion-padding-top">{{ translate("Copy this token into your AI client's setup below. It is cleared from this page when you leave or sign out. Clearing the page does not revoke the token.") }}</p>
            </template>
            <template v-else>
              <ion-button :disabled="tokenPending || !username || !connection" @click="generateToken">
                <ion-spinner v-if="tokenPending" slot="start" name="crescent" />
                <ion-icon v-else slot="start" :icon="keyOutline" aria-hidden="true" />
                {{ tokenPending ? translate("Generating token") : translate("Generate token") }}
              </ion-button>
            </template>
            <p v-if="tokenError" role="alert" class="ion-padding-top"><ion-text color="danger">{{ translate(tokenError) }}</ion-text></p>
            <p class="ion-padding-top">{{ translate("Keep your token private. Do not paste it into a chat or a shared repository. The token's purpose label does not restrict its permissions.") }}</p>
            <ion-button v-if="tokenError && connection" fill="clear" :disabled="tokenPending" :href="connection.tokenSettings" target="_blank" rel="noopener noreferrer">
              {{ translate("Open JWT token settings in OMS") }}
              <ion-icon slot="end" :icon="openOutline" aria-hidden="true" />
            </ion-button>
          </ion-card-content>
        </ion-card>

        <ion-card>
          <ion-card-header>
            <ion-card-subtitle>{{ translate("Step 2") }}</ion-card-subtitle>
            <ion-card-title>{{ translate("Set up your AI client") }}</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <ion-segment v-model="client" :aria-label="translate('AI client')">
              <ion-segment-button value="codex"><ion-label>Codex</ion-label></ion-segment-button>
              <ion-segment-button value="claude"><ion-label>Claude</ion-label></ion-segment-button>
              <ion-segment-button value="antigravity"><ion-label>Antigravity</ion-label></ion-segment-button>
            </ion-segment>
            <ion-select v-if="client === 'claude'" v-model="claudeSurface" :label="translate('Claude app')" interface="popover">
              <ion-select-option value="code">{{ translate("Claude Code") }}</ion-select-option>
              <ion-select-option value="desktop">{{ translate("Claude Desktop / web") }}</ion-select-option>
            </ion-select>
          </ion-card-content>

          <template v-if="client === 'codex'">
            <ion-list lines="none">
              <ion-item>
                <ion-label class="ion-text-wrap">
                  <h2>{{ translate("Open MCP settings in the Codex app") }}</h2>
                  <p>{{ translate("Open Settings from the app menu (Cmd+, on Mac or Ctrl+, on Windows), then select MCP servers → Add server.") }}</p>
                </ion-label>
              </ion-item>
              <ion-item>
                <ion-label class="ion-text-wrap">
                  <h2>{{ translate("Add your OMS server") }}</h2>
                  <p>{{ translate("Name the server hotwax-oms, choose Streamable HTTP, and paste the MCP server URL from Step 1 into the URL field.") }}</p>
                </ion-label>
              </ion-item>
              <ion-item>
                <ion-label class="ion-text-wrap">
                  <h2>{{ translate("Add the token as an HTTP header") }}</h2>
                  <p>{{ translate("If the form offers HTTP headers, add a header named Authorization. For its value, type Bearer followed by a space, then paste the token from Step 1. Leave the bearer-token environment-variable field empty. If header fields are unavailable, use the config.toml setup below.") }}</p>
                </ion-label>
              </ion-item>
              <ion-item>
                <ion-label class="ion-text-wrap">
                  <h2>{{ translate("Save and restart in the app") }}</h2>
                  <p>{{ translate("Save the server, then select Restart in MCP settings. Open a new task and type /mcp in the composer to check hotwax-oms. Use the verification prompt in Step 3 to confirm access. This OMS connection uses your JWT token and does not need an OAuth sign-in.") }}</p>
                </ion-label>
              </ion-item>
            </ion-list>
            <ion-accordion-group class="ion-padding">
              <ion-accordion value="codex-config">
                <ion-item slot="header">
                  <ion-label class="ion-text-wrap">{{ translate("Set up with config.toml") }}</ion-label>
                </ion-item>
                <div slot="content" class="ion-padding">
                  <p>{{ translate("Open your user config file in a text editor: ~/.codex/config.toml on Mac or Linux, or %USERPROFILE%\\.codex\\config.toml on Windows. Add this entry, or replace the existing hotwax-oms entry, and replace the token placeholder locally.") }}</p>
                  <template v-if="connection">
                    <pre tabindex="0" :aria-label="translate('Codex app configuration')"><code>{{ configuration }}</code></pre>
                    <ion-button fill="clear" @click="copy(configuration)">{{ translate("Copy configuration") }}</ion-button>
                  </template>
                  <p v-else>{{ translate("Sign in again to load your OMS configuration.") }}</p>
                  <p>{{ translate("Remove any bearer_token_env_var line from this server entry so it uses the header. Save the file, then restart MCP from the Codex app. Keep the file private because it contains your token.") }}</p>
                </div>
              </ion-accordion>
            </ion-accordion-group>
          </template>

          <template v-else-if="client === 'claude' && claudeSurface === 'desktop'">
            <ion-list lines="none">
              <ion-item>
                <ion-label class="ion-text-wrap">
                  <h2>{{ translate("Requires the Request headers beta") }}</h2>
                  <p>{{ translate("Claude Desktop and web use account connectors. Bearer-token headers are currently available only to selected organizations. An organization owner must configure the connector with an approved shared OMS account; its credential is shared across the organization.") }}</p>
                </ion-label>
              </ion-item>
              <ion-item>
                <ion-label class="ion-text-wrap">
                  <h2>{{ translate("Add a custom web connector") }}</h2>
                  <p>{{ translate("In Organization settings → Connectors, select Add → Custom → Web, name it hotwax-oms, and enter the MCP server URL above. In the new two-step dialog, choose No sign-in, then add a required authorization request header with the value Bearer followed by a space and your token.") }}</p>
                </ion-label>
              </ion-item>
              <ion-item>
                <ion-label class="ion-text-wrap">
                  <h2>{{ translate("Enable it in your conversation") }}</h2>
                  <p>{{ translate("Add the connector, then connect to it under Customize → Connectors and enable it in your chat. The instance must be reachable from Anthropic's servers, even when using the desktop app.") }}</p>
                </ion-label>
              </ion-item>
              <ion-item>
                <ion-label class="ion-text-wrap">
                  <h2>{{ translate("No Request headers option?") }}</h2>
                  <p>{{ translate("Use the Claude Code instructions instead. A URL-only connector cannot authenticate to this token-based OMS endpoint. Do not put the token in the URL or in the OAuth client ID or secret fields.") }}</p>
                </ion-label>
              </ion-item>
            </ion-list>
          </template>

          <template v-else>
            <ion-list lines="none">
              <ion-item v-if="client === 'claude'">
                <ion-label class="ion-text-wrap">
                  <h2>{{ translate("Make your token available to the client") }}</h2>
                  <p>{{ translate("In a bash or zsh terminal, run the commands below and paste your token at the hidden prompt. This sets HOTWAX_OMS_MCP_TOKEN for programs launched from that terminal. It is not saved for future sessions.") }}</p>
                </ion-label>
              </ion-item>
            </ion-list>
            <ion-card-content v-if="client === 'claude'">
              <pre tabindex="0" :aria-label="translate('Token environment commands')"><code>{{ tokenEnvironmentCommand }}</code></pre>
              <ion-button fill="clear" @click="copy(tokenEnvironmentCommand)">{{ translate("Copy commands") }}</ion-button>
            </ion-card-content>
            <ion-list lines="none">
              <ion-item>
                <ion-label class="ion-text-wrap">
                  <h2>{{ translate(configInstructions.title) }}</h2>
                  <p>{{ translate(configInstructions.body) }}</p>
                </ion-label>
              </ion-item>
            </ion-list>
            <ion-card-content>
              <template v-if="connection">
                <pre tabindex="0" :aria-label="translate('MCP configuration')"><code>{{ configuration }}</code></pre>
                <ion-button fill="clear" @click="copy(configuration)">
                  <ion-icon slot="start" :icon="copyOutline" aria-hidden="true" />
                  {{ translate("Copy configuration") }}
                </ion-button>
              </template>
              <p v-else>{{ translate("Sign in again to load your OMS configuration.") }}</p>
              <p>{{ translate("Merge this entry with your existing servers. Use a different server name and token variable for each OMS environment.") }}</p>
            </ion-card-content>
            <ion-list lines="none">
              <ion-item>
                <ion-label class="ion-text-wrap">
                  <h2>{{ translate("Reload and connect") }}</h2>
                  <p v-if="client === 'claude'">{{ translate("Start claude from that terminal in the project containing .mcp.json. Approve the project server when prompted, then use /mcp to check hotwax-oms. The Code tab in Claude Desktop also needs the token in its process environment.") }}</p>
                  <p v-else>{{ translate("Save the file, refresh the MCP server list, and enable hotwax-oms. In the CLI, use /mcp to reload and inspect its status. Update older clients if they do not support serverUrl and custom headers.") }}</p>
                </ion-label>
              </ion-item>
            </ion-list>
          </template>
          <ion-card-content>
            <ion-button fill="clear" :href="documentationUrl" target="_blank" rel="noopener noreferrer">
              {{ translate("Official setup documentation") }}
              <ion-icon slot="end" :icon="openOutline" aria-hidden="true" />
            </ion-button>
          </ion-card-content>
        </ion-card>

        <ion-card>
          <ion-card-header>
            <ion-card-subtitle>{{ translate("Step 3") }}</ion-card-subtitle>
            <ion-card-title>{{ translate("Verify with a read-only request") }}</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <p>{{ translate("Start a new conversation and try this prompt. A successful tool call confirms access; seeing a server or its tool list does not, because discovery can work without a valid token.") }}</p>
            <p class="ion-padding-top">{{ translate(verificationPrompt) }}</p>
            <ion-button fill="clear" @click="copy(translate(verificationPrompt))">{{ translate("Copy verification prompt") }}</ion-button>
            <p>{{ translate("Look for a successful list_ai_models result, even if the model list is empty. This checks MCP access, not whether an AI model is ready to run. If the tool is absent, ask your administrator which read-only tool is available on this version.") }}</p>
          </ion-card-content>
        </ion-card>

        <ion-accordion-group>
          <ion-accordion value="troubleshooting">
            <ion-item slot="header">
              <ion-icon slot="start" :icon="helpCircleOutline" aria-hidden="true" />
              <ion-label>{{ translate("Troubleshooting") }}</ion-label>
            </ion-item>
            <ion-list slot="content" lines="full">
              <ion-item v-for="item in troubleshooting" :key="item.title">
                <ion-label class="ion-text-wrap">
                  <h2>{{ translate(item.title) }}</h2>
                  <p>{{ translate(item.body) }}</p>
                </ion-label>
              </ion-item>
            </ion-list>
          </ion-accordion>
        </ion-accordion-group>
        <p class="ion-padding"><ion-note>{{ translate("Setup references checked September 11, 2026. Client screens and instance capabilities can vary.") }}</ion-note></p>
        <p class="ion-padding" role="status" aria-live="polite">{{ copyStatus }}</p>
      </main>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { commonUtil, translate } from "@common";
import { IonAccordion, IonAccordionGroup, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonContent, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonList, IonMenuButton, IonNote, IonPage, IonSegment, IonSegmentButton, IonSelect, IonSelectOption, IonSpinner, IonText, IonTitle, IonToolbar, onIonViewWillEnter, onIonViewWillLeave, toastController } from "@ionic/vue";
import { copyOutline, eyeOffOutline, eyeOutline, helpCircleOutline, keyOutline, linkOutline, openOutline } from "ionicons/icons";
import { computed, ref, watch } from "vue";
import { getMcpConfig, getMcpConnection, tokenEnvironmentCommand, verificationPrompt } from "@/utils/mcpSetup";
import type { McpClient } from "@/utils/mcpSetup";
import { useUserToken } from "@/composables/useSecurity";

const backendUrl = ref(commonUtil.getMaargURL());
const connection = computed(() => getMcpConnection(backendUrl.value));
const client = ref<McpClient>("codex");
const claudeSurface = ref("code");
const copyStatus = ref("");
const expireDays = ref(30);
const { username, token, expirationTime, pending: tokenPending, error: tokenError, generate, clear: clearToken } = useUserToken(() => backendUrl.value);
const generateToken = () => generate({ purpose: "MCP", expireDays: expireDays.value });
const revealToken = ref(false);
watch(token, () => { revealToken.value = false; });
const tokenExpiryLabel = computed(() => expirationTime.value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(expirationTime.value) : "");
const configuration = computed(() => connection.value ? getMcpConfig(client.value, connection.value.endpoint) : "");

// Ionic caches route components. Re-read the current instance on every entry.
onIonViewWillEnter(() => {
  clearToken();
  backendUrl.value = commonUtil.getMaargURL();
  copyStatus.value = "";
});
onIonViewWillLeave(clearToken);

const instructions = {
  claude: {
    title: "Add the server to Claude Code",
    body: "Create or edit .mcp.json at your project root and merge in the entry below. Keep the token variable exactly as shown; Claude Code expands it from your environment when it connects.",
  },
  antigravity: {
    title: "Add the server to Antigravity",
    body: "In the IDE agent panel, open … → MCP Servers → Manage MCP Servers → View raw config. Add this entry to mcpServers and replace REPLACE_WITH_YOUR_OMS_TOKEN locally. Current clients use ~/.gemini/config/mcp_config.json; use the file opened by your client.",
  },
};
const configInstructions = computed(() => client.value === "antigravity" ? instructions.antigravity : instructions.claude);
const documentationUrl = computed(() => ({
  codex: "https://learn.chatgpt.com/docs/extend/mcp#configure-in-the-chatgpt-desktop-app",
  claude: claudeSurface.value === "code" ? "https://code.claude.com/docs/en/mcp" : "https://claude.com/docs/connectors/custom/remote-mcp#authenticating-with-request-headers",
  antigravity: "https://antigravity.google/docs/mcp",
})[client.value]);

const troubleshooting = [
  { title: "Server not found or 404", body: "Confirm the instance and /mcp/json URL. Ask your administrator to check that the MCP component is installed and enabled on this instance. Installation alone does not enable it." },
  { title: "Authentication required or 401", body: "Check that the token belongs to this instance, has not expired, and is available to the process running your AI client. Header values must start with Bearer followed by a space. A tool can report an authentication error even when the HTTP request succeeds." },
  { title: "Not permitted or 403", body: "The token owner may lack permission for the selected tool. Ask your OMS administrator to review the account's permissions; a new token does not grant additional access." },
  { title: "405 when opening the URL in a browser", body: "This endpoint accepts MCP POST requests. Opening it in the address bar sends GET and may return 405. Use an MCP client and the verification prompt to test it." },
  { title: "Too many requests or 429", body: "Pause and retry after the server's suggested delay. Avoid repeatedly reconnecting or asking the assistant to retry in a loop." },
];

async function copy(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    copyStatus.value = translate("Copied to clipboard");
  } catch {
    copyStatus.value = translate("Could not copy. Select and copy the text manually.");
  }
  const toast = await toastController.create({ message: copyStatus.value, duration: 2500 });
  await toast.present();
}
</script>

<style scoped>
.mcp-setup {
  max-width: 64rem;
  margin-inline: auto;
}

pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.mcp-url {
  overflow-wrap: anywhere;
}
</style>
