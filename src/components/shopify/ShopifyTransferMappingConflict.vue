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
          {{ translate("These Shopify variants share a SKU") }}
          <p>{{ translate("Check duplicate SKUs in Shopify before importing products again, so the conflicting mapping is not recreated.") }}</p>
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
            <p>{{ choice.variantTitle }}{{ choice.sku ? ' / ' + choice.sku : '' }}</p>
            <p v-if="choice.barcode">
              {{ translate("Barcode: {id}", { id: choice.barcode }) }}
            </p>
            <p v-if="!choice.available">
              {{ translate("This variant is unavailable or its inventory item no longer matches. Review it in Shopify.") }}
            </p>
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
import { IonBadge, IonButton, IonIcon, IonImg, IonItem, IonLabel, IonList, IonListHeader, IonRadio, IonRadioGroup, IonSpinner, IonThumbnail, alertController } from "@ionic/vue";
import { checkmarkCircleOutline, openOutline, warningOutline } from "ionicons/icons";
import { computed, ref, watch } from "vue";
import { type ShopifyProductMappingChoice, useTransferMappingResolution } from "@/composables/useShopify";
import { isShopifyObjectId, shopifyAdminHostname } from "@/utils/shopifyAdminUrl";

const { fetchChoices: fetchTransferMappingChoices, keepMapping: keepTransferProductMapping } = useTransferMappingResolution();
const props = defineProps<{ shopId: string; productId: string; domain?: string }>();
const emit = defineEmits<{ busy: [value: boolean]; ready: [value: boolean] }>();
const choices = ref<ShopifyProductMappingChoice[]>([]);
const loading = ref(false);
const saving = ref(false);
const error = ref("");
const selected = ref("");
let version = 0;
const ready = computed(() => choices.value.length === 1 && choices.value[0].available);
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
  emit("ready", false);
  try {
    const rows = await fetchTransferMappingChoices(props.shopId, props.productId);
    if(token === version) {choices.value = rows; emit("ready", ready.value);}
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
