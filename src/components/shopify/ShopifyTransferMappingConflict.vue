<template>
  <ion-list lines="full">
    <ion-list-header>
      <ion-label>{{ translate(ready ? "Current Shopify mapping" : "Choose the correct Shopify variant") }}</ion-label>
      <ion-button fill="clear" :disabled="loading || saving" @click="load">
        {{ translate("Recheck mappings") }}
      </ion-button>
    </ion-list-header>
    <ion-item v-if="loading">
      <ion-spinner slot="start" name="crescent" />
      <ion-label>{{ translate("Checking current mappings and Shopify variants") }}</ion-label>
    </ion-item>
    <ion-item v-else-if="error" role="alert">
      <ion-icon slot="start" :icon="warningOutline" color="warning" />
      <ion-label class="ion-text-wrap">
        {{ error }}
      </ion-label>
    </ion-item>
    <template v-if="!loading && !error">
      <ion-item v-if="ready">
        <ion-icon slot="start" :icon="checkmarkCircleOutline" color="success" />
        <ion-label class="ion-text-wrap">
          {{ translate("One valid mapping remains") }}
          <p>{{ translate("This mapping blocker is cleared. Run the appropriate staging job after resolving the remaining issues.") }}</p>
        </ion-label>
      </ion-item>
      <ion-item v-else-if="!choices.length">
        <ion-label class="ion-text-wrap">
          {{ translate("No mapping remains for this product. Map it to the intended Shopify variant before retrying.") }}
        </ion-label>
      </ion-item>
      <ion-item v-if="duplicateSku">
        <ion-label class="ion-text-wrap">
          {{ sharedSku ? translate("These Shopify variants share SKU {sku}", { sku: sharedSku }) : translate("These Shopify variants share a SKU") }}
          <p>{{ translate("Check duplicate SKUs in Shopify before importing products again, so the conflicting mapping is not recreated.") }}</p>
        </ion-label>
      </ion-item>
      <ion-item v-if="sellingCount > 1">
        <ion-icon slot="start" :icon="warningOutline" color="warning" />
        <ion-label class="ion-text-wrap">
          {{ translate("More than one of these listings is selling") }}
          <p>{{ translate("Keeping one mapping means the OMS updates inventory and transfers for that listing only. Decide how the other listing should be handled in Shopify before choosing.") }}</p>
        </ion-label>
      </ion-item>
      <ion-item v-if="activityError">
        <ion-label class="ion-text-wrap">
          {{ translate("Recent orders could not be loaded") }}
          <p>{{ activityError }}</p>
        </ion-label>
      </ion-item>
      <ion-radio-group v-model="selected">
        <ion-item
          v-for="choice in choices"
          :key="choice.variantId"
          :button="choices.length > 1"
          :detail="false"
          :disabled="saving"
          @click="choices.length > 1 && choice.available && (selected = choice.variantId)"
        >
          <ion-radio
            v-if="choices.length > 1"
            slot="start"
            :value="choice.variantId"
            :disabled="!choice.available"
            :aria-label="choice.title || translate('Shopify variant {id}', { id: choice.variantId })"
          />
          <ion-thumbnail v-if="choice.imageUrl" slot="start">
            <ion-img :src="choice.imageUrl" :alt="choice.title || ''" />
          </ion-thumbnail>
          <ion-label class="ion-text-wrap">
            <h2>{{ choice.title || translate("Shopify variant {id}", { id: choice.variantId }) }}</h2>
            <p>{{ choice.variantTitle }}{{ choice.sku && !sharedSku ? ' / ' + choice.sku : '' }}</p>
            <p v-if="choice.barcode && !sharedBarcode">
              {{ translate("Barcode: {id}", { id: choice.barcode }) }}
            </p>
            <p v-if="!choice.available">
              {{ translate("This variant is unavailable or its inventory item no longer matches. Review it in Shopify.") }}
            </p>
            <p v-if="choice.onlineStorePublished === false">
              {{ translate("Not on the Online Store") }}
            </p>
            <p v-if="!choice.sku && activityLoaded">
              {{ translate("Recent orders can't be checked without a SKU") }}
            </p>
            <div v-if="activity[choice.variantId]?.orders">
              <ion-chip v-for="channel in channelBreakdown(activity[choice.variantId])" :key="channel.label" outline>
                <ion-label>{{ channel.label }} {{ channel.count }}</ion-label>
              </ion-chip>
            </div>
          </ion-label>
          <ion-spinner v-if="activityLoading" slot="end" name="dots" :aria-label="translate('Checking recent orders')" />
          <ion-label v-else-if="activity[choice.variantId]" slot="end" class="ion-text-end">
            {{ orderCount(activity[choice.variantId]) }}
            <p>{{ orderWindow(activity[choice.variantId]) }}</p>
          </ion-label>
          <ion-badge v-if="choice.status" slot="end" :color="choice.status === 'ACTIVE' ? 'success' : 'medium'">
            {{ translate(choice.status) }}
          </ion-badge>
          <ion-button
            v-if="variantUrl(choice)"
            slot="end"
            fill="clear"
            :href="variantUrl(choice)"
            target="_blank"
            rel="noopener noreferrer"
            :aria-label="translate('Open {name} in Shopify', { name: choice.title || choice.variantId })"
            @click.stop
          >
            <ion-icon slot="icon-only" :icon="openOutline" />
          </ion-button>
        </ion-item>
      </ion-radio-group>
      <ion-item v-if="choices.length > 1">
        <ion-label class="ion-text-wrap">
          {{ translate("Choose based on the actual product, not its Active or Draft status alone.") }}
          <p>{{ translate("Keeping one mapping removes the other mappings for this OMS product in this shop. This affects all syncs using this product; it does not delete Shopify products.") }}</p>
        </ion-label>
      </ion-item>
      <ion-item v-if="choices.length > 1" lines="none">
        <ion-button :disabled="!selected || saving" @click="confirmKeep">
          <ion-spinner v-if="saving" name="crescent" />
          <template v-else>
            {{ translate("Keep selected mapping") }}
          </template>
        </ion-button>
      </ion-item>
    </template>
  </ion-list>
</template>

<script setup lang="ts">
import { translate } from "@common";
import { IonBadge, IonButton, IonChip, IonIcon, IonImg, IonItem, IonLabel, IonList, IonListHeader, IonRadio, IonRadioGroup, IonSpinner, IonThumbnail, alertController } from "@ionic/vue";
import { checkmarkCircleOutline, openOutline, warningOutline } from "ionicons/icons";
import { computed, ref, watch } from "vue";
import { type ShopifyProductMappingChoice, type VariantOrderActivity, useTransferMappingResolution } from "@/composables/useShopify";
import { formatDateTime } from "@/utils";
import { isShopifyObjectId, shopifyAdminHostname } from "@/utils/shopifyAdminUrl";

const { fetchChoices: fetchTransferMappingChoices, keepMapping: keepTransferProductMapping, fetchRecentOrders } = useTransferMappingResolution();
const ACTIVITY_DAYS = 30;
const CHANNEL_LABELS: Record<string, string> = { web: "Online Store", pos: "POS", shopify_draft_order: "Draft orders" };
const props = defineProps<{ shopId: string; productId: string; domain?: string }>();
const emit = defineEmits<{ busy: [value: boolean]; ready: [value: boolean] }>();
const choices = ref<ShopifyProductMappingChoice[]>([]);
const loading = ref(false);
const saving = ref(false);
const error = ref("");
const selected = ref("");
let version = 0;
const activity = ref<Record<string, VariantOrderActivity>>({});
const activityLoading = ref(false);
const activityError = ref("");
/** Set once a lookup finished, so a variant with no entry reads as "unknown" only after the lookup ran. */
const activityLoaded = ref(false);
const ready = computed(() => choices.value.length === 1 && choices.value[0].available);
const sellingCount = computed(() => choices.value.filter(choice => (activity.value[choice.variantId]?.orders ?? 0) > 0).length);
function orderCount(entry: VariantOrderActivity) {
  return translate("{orders} orders", { orders: entry.capped ? `${entry.orders}+` : String(entry.orders) });
}
function orderWindow(entry: VariantOrderActivity) {
  return entry.lastOrderAt
    ? translate("{days} days, last {date}", { days: ACTIVITY_DAYS, date: formatDateTime(entry.lastOrderAt, "LLL d") })
    : translate("Last {days} days", { days: ACTIVITY_DAYS });
}
/** Largest channel first; app-created orders only carry an app id, so they are grouped as Other. */
function channelBreakdown(entry: VariantOrderActivity) {
  let other = 0;
  const named: Array<{ label: string; count: number }> = [];
  for(const [channel, count] of Object.entries(entry.channels)) {
    if(CHANNEL_LABELS[channel]) {named.push({ label: translate(CHANNEL_LABELS[channel]), count });} else {other += count;}
  }
  named.sort((a, b) => b.count - a.count);
  if(other) {named.push({ label: translate("Other"), count: other });}

  return named;
}
async function loadActivity(token: number, rows: ShopifyProductMappingChoice[]) {
  activityLoading.value = true;
  try {
    const result = await fetchRecentOrders(props.shopId, rows, ACTIVITY_DAYS);
    if(token === version) {activity.value = result; activityLoaded.value = true;}
  } catch (cause: any) {
    if(token === version) {activityError.value = cause.message || translate("Recent Shopify orders could not be loaded.");}
  } finally {if(token === version) {activityLoading.value = false;}}
}
/** The one value every choice carries, so it is said once instead of on each row. */
function sharedValue(field: "sku" | "barcode") {
  const values = choices.value.map(row => row[field]);

  return choices.value.length > 1 && values[0] && values.every(value => value === values[0]) ? values[0] : "";
}
const sharedSku = computed(() => sharedValue("sku"));
const sharedBarcode = computed(() => sharedValue("barcode"));
const duplicateSku = computed(() => {
  const skus = choices.value.map(row => row.sku).filter(Boolean);

  return new Set(skus).size < skus.length;
});
function variantUrl(choice: ShopifyProductMappingChoice) {
  const host = shopifyAdminHostname(props.domain);

  return host && isShopifyObjectId(choice.shopifyProductId) && isShopifyObjectId(choice.variantId)
    ? `https://${host}/admin/products/${choice.shopifyProductId}/variants/${choice.variantId}` : "";
}
async function load() {
  const token = ++version;
  loading.value = true;
  error.value = "";
  selected.value = "";
  choices.value = [];
  activity.value = {};
  activityLoaded.value = false;
  activityError.value = "";
  emit("ready", false);
  try {
    const rows = await fetchTransferMappingChoices(props.shopId, props.productId);
    if(token === version) {
      choices.value = rows;
      emit("ready", ready.value);
      // Order history only informs the choice; it loads after the mappings so a slow or failed read never blocks the repair.
      if(rows.length > 1) {void loadActivity(token, rows);}
    }
  } catch (cause: any) {
    if(token === version) {error.value = cause.message || translate("Current product mappings could not be verified.");}
  } finally {if(token === version) {loading.value = false;}}
}
async function confirmKeep() {
  const keep = choices.value.find(row => row.variantId === selected.value && row.available);
  if(!keep || saving.value) {return;}
  const targetShop = props.shopId;
  const targetProduct = props.productId;
  const expected = [...choices.value];
  const removed = expected.filter(row => row.variantId !== keep.variantId).map(row => row.title || row.variantId).join(", ");
  const alert = await alertController.create({
    header: translate("Confirm product mapping change"),
    message: translate("Keep {keep} and remove the mappings for {removed}? This changes all syncs for this OMS product in this shop. Shopify products will remain unchanged.", { keep: keep.title || keep.variantId, removed }).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
    buttons: [{ text: translate("Cancel"), role: "cancel" }, { text: translate("Keep this mapping"), handler: () => {
      saving.value = true;
      emit("busy", true);
      void keepTransferProductMapping(targetShop, targetProduct, keep.variantId, expected)
        .then(load)
        .catch((cause: any) => { error.value = cause.message; selected.value = ""; })
        .finally(() => { saving.value = false; emit("busy", false); });
    } }],
  });
  await alert.present();
}
watch(() => [props.shopId, props.productId], load, { immediate: true });
</script>
