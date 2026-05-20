<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-menu-button slot="start" />
        <ion-title>{{ translate("Gift cards") }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ translate("Issue gift cards in bulk") }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <p>{{ translate("Pick a Shopify shop, choose a code prefix and amount, then upload a CSV of customer names. Each gift card will be issued in Shopify with the code prefix-name. Download the results to use in your emails.") }}</p>
        </ion-card-content>
      </ion-card>

      <ion-list inset>
        <ion-item>
          <ion-label position="stacked">{{ translate("Shopify shop") }}</ion-label>
          <ion-select interface="popover" :placeholder="translate('Select a shop')" :value="selectedShopId" @ionChange="onShopChange($event.detail.value)">
            <ion-select-option v-for="shop in shops" :key="shop.shopId" :value="shop.shopId">{{ shop.name || shop.shopId }}</ion-select-option>
          </ion-select>
        </ion-item>
        <ion-item v-if="resolvingShop">
          <ion-spinner name="dots" slot="start" />
          <ion-label>{{ translate("Connecting to Shopify…") }}</ion-label>
        </ion-item>
        <ion-item v-else-if="shopError" color="warning">
          <ion-label class="ion-text-wrap">
            <p>{{ shopError }}</p>
          </ion-label>
        </ion-item>
        <ion-item v-else-if="currencyCode" lines="none">
          <ion-label>
            <p>{{ translate("Shop currency") }}: <strong>{{ currencyCode }}</strong></p>
          </ion-label>
        </ion-item>
      </ion-list>

      <ion-list inset>
        <ion-item>
          <ion-label position="stacked">{{ translate("Code prefix") }}</ion-label>
          <ion-input v-model="prefix" :placeholder="translate('e.g. sangam')" />
        </ion-item>
        <ion-item>
          <ion-label position="stacked">{{ translate("Gift card value") }}</ion-label>
          <ion-input v-model="value" type="number" min="0" step="0.01" :placeholder="translate('e.g. 50')" />
        </ion-item>
        <ion-item>
          <ion-label position="stacked">{{ translate("Customer names CSV") }}</ion-label>
          <input type="file" accept=".csv,text/csv,text/plain" @change="onFileChange" />
        </ion-item>
        <ion-item lines="none">
          <ion-label class="ion-text-wrap" color="medium">
            <p>{{ translate("Two columns: first name, last name. Last name is used to disambiguate when first names repeat.") }}</p>
          </ion-label>
        </ion-item>
        <ion-item v-if="parsedRows.length" lines="none">
          <ion-label>
            <p>{{ translate("{count} names loaded", { count: parsedRows.length }) }}</p>
          </ion-label>
        </ion-item>
      </ion-list>

      <ion-list v-if="previewRows.length" inset>
        <ion-list-header>
          <ion-label>{{ translate("Preview") }}</ion-label>
        </ion-list-header>
        <ion-item v-for="row in previewRows.slice(0, 10)" :key="row.code">
          <ion-label>
            <h3>{{ row.name }}</h3>
            <p>{{ row.code }}</p>
          </ion-label>
        </ion-item>
        <ion-item v-if="previewRows.length > 10" lines="none">
          <ion-label color="medium">
            <p>{{ translate("…and {count} more", { count: previewRows.length - 10 }) }}</p>
          </ion-label>
        </ion-item>
      </ion-list>

      <div class="actions">
        <ion-button expand="block" :disabled="!canIssue || issuing" @click="issueAll">
          <ion-spinner v-if="issuing" name="crescent" slot="start" />
          <span v-if="!issuing">{{ translate("Issue {count} gift cards", { count: previewRows.length }) }}</span>
          <span v-else>{{ translate("Issuing {done} / {total}", { done: results.length, total: previewRows.length }) }}</span>
        </ion-button>
      </div>

      <ion-list v-if="results.length" inset>
        <ion-list-header>
          <ion-label>{{ translate("Results") }}</ion-label>
          <ion-button fill="clear" size="small" @click="downloadResults" :disabled="issuing">
            <ion-icon slot="start" :icon="downloadOutline" />
            {{ translate("Download CSV") }}
          </ion-button>
        </ion-list-header>
        <ion-item lines="none">
          <ion-label>
            <p>{{ translate("{success} succeeded, {failed} failed", { success: successCount, failed: failedCount }) }}</p>
          </ion-label>
        </ion-item>
        <ion-item v-for="r in results" :key="r.code">
          <ion-label class="ion-text-wrap">
            <h3>{{ r.name }}</h3>
            <p>{{ r.code }}</p>
            <p v-if="r.error" color="danger">{{ r.error }}</p>
          </ion-label>
          <ion-badge :color="r.status === 'success' ? 'success' : 'danger'" slot="end">{{ r.status === "success" ? translate("Issued") : translate("Failed") }}</ion-badge>
        </ion-item>
      </ion-list>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonBadge,
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonMenuButton,
  IonPage,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTitle,
  IonToolbar,
  onIonViewWillEnter
} from "@ionic/vue";
import { downloadOutline } from "ionicons/icons";
import { computed, ref } from "vue";
import { useStore } from "vuex";
import { translate } from "@/i18n";
import { GiftCardService, GiftCardIssueResult } from "@/services/GiftCardService";
import { ShopifyProductSyncService } from "@/services/ShopifyProductSyncService";
import { downloadTextFile, showToast } from "@/utils";

const store = useStore();

const shops = computed(() => store.getters["shopify/getShops"] || []);

const selectedShopId = ref("");
const systemMessageRemoteId = ref("");
const currencyCode = ref("");
const resolvingShop = ref(false);
const shopError = ref("");

interface ParsedRow {
  firstName: string;
  lastName: string;
}

const prefix = ref("");
const value = ref("");
const parsedRows = ref<ParsedRow[]>([]);

const issuing = ref(false);
const results = ref<GiftCardIssueResult[]>([]);

onIonViewWillEnter(async () => {
  if (!shops.value.length) {
    await store.dispatch("shopify/fetchShopifyShops");
  }
});

const sanitizedPrefix = computed(() => prefix.value.trim().toLowerCase().replace(/\s+/g, "-"));

function slug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const previewRows = computed(() => {
  if (!sanitizedPrefix.value) return [];

  const firstNameCounts = new Map<string, number>();
  for (const row of parsedRows.value) {
    const key = slug(row.firstName);
    if (!key) continue;
    firstNameCounts.set(key, (firstNameCounts.get(key) || 0) + 1);
  }

  const seenCodes = new Set<string>();
  const firstNameSeen = new Map<string, number>();
  const out: { name: string; code: string }[] = [];

  for (const row of parsedRows.value) {
    const firstSlug = slug(row.firstName);
    const lastSlug = slug(row.lastName);
    if (!firstSlug) continue;

    const seenIndex = (firstNameSeen.get(firstSlug) || 0);
    firstNameSeen.set(firstSlug, seenIndex + 1);

    let namePart: string;
    if (seenIndex === 0 && (firstNameCounts.get(firstSlug) || 0) === 1) {
      namePart = firstSlug;
    } else if (seenIndex === 0) {
      namePart = firstSlug;
    } else if (lastSlug) {
      namePart = `${firstSlug}-${lastSlug.charAt(0)}`;
      if (seenCodes.has(`${sanitizedPrefix.value}-${namePart}`)) {
        namePart = `${firstSlug}-${lastSlug}`;
      }
    } else {
      namePart = `${firstSlug}-${seenIndex + 1}`;
    }

    let code = `${sanitizedPrefix.value}-${namePart}`;
    let suffix = 2;
    while (seenCodes.has(code)) {
      code = `${sanitizedPrefix.value}-${namePart}-${suffix++}`;
    }
    seenCodes.add(code);

    const fullName = [row.firstName, row.lastName].filter(Boolean).join(" ").trim() || row.firstName;
    out.push({ name: fullName, code });
  }

  return out;
});

const successCount = computed(() => results.value.filter((r) => r.status === "success").length);
const failedCount = computed(() => results.value.filter((r) => r.status === "error").length);

const canIssue = computed(() => {
  return !!systemMessageRemoteId.value
    && !!sanitizedPrefix.value
    && Number(value.value) > 0
    && previewRows.value.length > 0
    && !resolvingShop.value;
});

async function onShopChange(shopId: string) {
  selectedShopId.value = shopId;
  systemMessageRemoteId.value = "";
  currencyCode.value = "";
  shopError.value = "";
  if (!shopId) return;

  const shop = shops.value.find((s: any) => s.shopId === shopId);
  if (!shop) return;

  resolvingShop.value = true;
  try {
    const remoteId = await ShopifyProductSyncService.fetchShopSystemMessageRemoteId({
      shopifyShopId: shop.shopifyShopId,
      shopId: shop.shopId
    });
    if (!remoteId) throw new Error("No Shopify system message remote found for this shop.");
    systemMessageRemoteId.value = remoteId;
    currencyCode.value = await GiftCardService.fetchShopCurrencyCode(remoteId);
  } catch (error: any) {
    shopError.value = error?.message || "Failed to connect to this Shopify shop.";
  } finally {
    resolvingShop.value = false;
  }
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) {
    parsedRows.value = [];
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result || "");
    parsedRows.value = parseRowsFromCsv(text);
    if (!parsedRows.value.length) {
      showToast(translate("No names found in the file."));
    }
  };
  reader.onerror = () => {
    showToast(translate("Could not read the selected file."));
  };
  reader.readAsText(file);
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { cur += ch; }
    } else {
      if (ch === ",") { out.push(cur); cur = ""; }
      else if (ch === '"' && cur === "") { inQuotes = true; }
      else { cur += ch; }
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

function parseRowsFromCsv(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return [];

  const headerCells = splitCsvLine(lines[0]).map((c) => c.toLowerCase());
  const looksLikeHeader = headerCells.some((c) => /name|first|last|customer/.test(c));
  const startIndex = looksLikeHeader ? 1 : 0;

  const rows: ParsedRow[] = [];
  for (let i = startIndex; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const firstName = (cells[0] || "").trim();
    const lastName = (cells[1] || "").trim();
    if (!firstName) continue;
    rows.push({ firstName, lastName });
  }
  return rows;
}

async function issueAll() {
  if (!canIssue.value) return;
  issuing.value = true;
  results.value = [];
  const initialValue = Number(value.value).toFixed(2);
  try {
    for (const row of previewRows.value) {
      const result = await GiftCardService.issueGiftCard({
        systemMessageRemoteId: systemMessageRemoteId.value,
        name: row.name,
        code: row.code,
        initialValue
      });
      results.value = [...results.value, result];
    }
    if (failedCount.value === 0) {
      showToast(translate("All gift cards issued."));
    } else {
      showToast(translate("{failed} gift cards failed. See results.", { failed: failedCount.value }));
    }
  } finally {
    issuing.value = false;
  }
}

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function downloadResults() {
  if (!results.value.length) return;
  const header = ["name", "code", "amount", "currency", "status", "error"].join(",");
  const rows = results.value.map((r) => [
    csvEscape(r.name),
    csvEscape(r.code),
    csvEscape(Number(value.value).toFixed(2)),
    csvEscape(currencyCode.value || ""),
    csvEscape(r.status),
    csvEscape(r.error || "")
  ].join(","));
  const content = [header, ...rows].join("\n");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  downloadTextFile(content, `gift-cards-${sanitizedPrefix.value || "issued"}-${stamp}.csv`);
}
</script>

<style scoped>
.actions {
  padding: var(--spacer-base, 16px);
}

input[type="file"] {
  padding: 8px 0;
}
</style>
