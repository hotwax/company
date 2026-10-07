<template>
  <ion-list lines="full">
    <ion-list-header>
      <ion-label>{{ translate(mapped ? "Product mapped to Shopify" : "Map this product to Shopify") }}</ion-label>
    </ion-list-header>
    <ion-item v-if="loading">
      <ion-spinner slot="start" name="crescent" />
      <ion-label>{{ translate("Loading the OMS product and its current mapping") }}</ion-label>
    </ion-item>
    <ion-item v-else-if="loadError" role="alert">
      <ion-icon slot="start" :icon="warningOutline" color="warning" />
      <ion-label class="ion-text-wrap">
        {{ loadError }}
      </ion-label>
    </ion-item>
    <template v-if="product">
      <ion-item>
        <ion-thumbnail v-if="product.imageUrl" slot="start">
          <ion-img :src="product.imageUrl" :alt="product.name || ''" />
        </ion-thumbnail>
        <ion-label class="ion-text-wrap">
          <h2>{{ product.name || product.internalName || product.productId }}</h2>
          <p v-if="identifiers">
            {{ identifiers }}
          </p>
          <p>
            {{ productDetail }}
          </p>
        </ion-label>
      </ion-item>

      <ion-item v-if="mapped">
        <ion-icon slot="start" :icon="checkmarkCircleOutline" color="success" />
        <ion-label class="ion-text-wrap">
          {{ translate("Mapped to {name}", { name: mapped.title || mapped.variantId }) }}
          <p>{{ mapped.variantTitle }}{{ mapped.sku ? ' / ' + mapped.sku : '' }}</p>
          <p>{{ translate("Run the creation stager to send this transfer to Shopify.") }}</p>
        </ion-label>
      </ion-item>
      <ion-item v-else-if="existingCount > 1">
        <ion-icon slot="start" :icon="warningOutline" color="warning" />
        <ion-label class="ion-text-wrap">
          {{ translate("This product now has several Shopify mappings") }}
          <p>{{ translate("Recheck this transfer to resolve the duplicate mappings instead.") }}</p>
        </ion-label>
      </ion-item>

      <template v-else-if="!loading && !loadError">
        <ion-searchbar
          v-model="query"
          :placeholder="translate('Search Shopify by SKU, barcode or title')"
          :disabled="saving"
          @keydown.enter="search(query)"
          @ion-clear="candidates = []; searched = false"
        />
        <ion-item v-if="searching">
          <ion-spinner slot="start" name="crescent" />
          <ion-label>{{ translate("Searching Shopify") }}</ion-label>
        </ion-item>
        <ion-item v-else-if="searchError" role="alert">
          <ion-icon slot="start" :icon="warningOutline" color="warning" />
          <ion-label class="ion-text-wrap">
            {{ searchError }}
          </ion-label>
        </ion-item>
        <ion-item v-else-if="searched && !candidates.length">
          <ion-icon slot="start" :icon="warningOutline" color="warning" />
          <ion-label class="ion-text-wrap">
            {{ translate("Not found in Shopify") }}
            <p>{{ translate("No Shopify variant matches {query}. Create this product in Shopify with inventory tracking on and run the product sync, or turn off Native Inventory Transfer Sync for this shop on the transfer sync page.", { query: lastQueryLabel }) }}</p>
          </ion-label>
        </ion-item>
        <ion-radio-group v-else-if="candidates.length" v-model="selected">
          <ion-item
            v-for="candidate in candidates"
            :key="candidate.variantId"
            :button="mappable(candidate)"
            :detail="false"
            :disabled="saving"
            @click="mappable(candidate) && (selected = candidate.variantId)"
          >
            <ion-radio
              slot="start"
              :value="candidate.variantId"
              :disabled="!mappable(candidate)"
              :aria-label="candidate.title || translate('Shopify variant {id}', { id: candidate.variantId })"
            />
            <ion-thumbnail v-if="candidate.imageUrl" slot="start">
              <ion-img :src="candidate.imageUrl" :alt="candidate.title || ''" />
            </ion-thumbnail>
            <ion-label class="ion-text-wrap">
              <h2>{{ candidate.title || translate("Shopify variant {id}", { id: candidate.variantId }) }}</h2>
              <p>{{ candidate.variantTitle }}{{ candidate.sku ? ' / ' + candidate.sku : '' }}</p>
              <p v-if="candidate.barcode">
                {{ translate("Barcode: {id}", { id: candidate.barcode }) }}
              </p>
              <p v-if="!candidate.tracked">
                {{ translate("Shopify doesn't track inventory for this variant, so it can't be on a transfer") }}
              </p>
              <p v-if="candidate.mappedProductIds.length">
                {{ translate("Already mapped to OMS product {ids}", { ids: candidate.mappedProductIds.join(", ") }) }}
              </p>
              <p v-if="!candidate.onlineStorePublished">
                {{ translate("Not on the Online Store") }}
              </p>
            </ion-label>
            <ion-badge v-if="candidate.status" slot="end" :color="candidate.status === 'ACTIVE' ? 'success' : 'medium'">
              {{ translate(candidate.status) }}
            </ion-badge>
            <ion-button
              v-if="variantUrl(candidate)"
              slot="end"
              fill="clear"
              :href="variantUrl(candidate)"
              target="_blank"
              rel="noopener noreferrer"
              :aria-label="translate('Open {name} in Shopify', { name: candidate.title || candidate.variantId })"
              @click.stop
            >
              <ion-icon slot="icon-only" :icon="openOutline" />
            </ion-button>
          </ion-item>
        </ion-radio-group>
        <ion-item v-if="saveError" role="alert">
          <ion-icon slot="start" :icon="warningOutline" color="warning" />
          <ion-label class="ion-text-wrap">
            {{ saveError }}
          </ion-label>
        </ion-item>
        <ion-item v-if="candidates.length" lines="none">
          <ion-button :disabled="!selected || saving" @click="confirmMap">
            <ion-spinner v-if="saving" name="crescent" />
            <template v-else>
              {{ translate("Map to selected variant") }}
            </template>
          </ion-button>
        </ion-item>
      </template>
    </template>
  </ion-list>
</template>

<script setup lang="ts">
import { translate } from "@common";
import { IonBadge, IonButton, IonIcon, IonImg, IonItem, IonLabel, IonList, IonListHeader, IonRadio, IonRadioGroup, IonSearchbar, IonSpinner, IonThumbnail, alertController } from "@ionic/vue";
import { checkmarkCircleOutline, openOutline, warningOutline } from "ionicons/icons";
import { computed, ref, watch } from "vue";
import { type OmsProductSummary, type ShopifyProductMappingChoice, type ShopifyVariantCandidate, useTransferMappingResolution } from "@/composables/useShopify";
import { formatDateTime } from "@/utils";
import { isShopifyObjectId, shopifyAdminHostname } from "@/utils/shopifyAdminUrl";
import { initialVariantQuery } from "@/utils/shopifyTransferSync";

const props = defineProps<{ shopId: string; productId: string; productStoreId?: string; domain?: string }>();
const emit = defineEmits<{ busy: [value: boolean]; ready: [value: boolean] }>();
const { fetchChoices, fetchOmsProduct, searchVariants, addMapping } = useTransferMappingResolution();

const product = ref<OmsProductSummary>();
const existing = ref<ShopifyProductMappingChoice[]>([]);
const loading = ref(false);
const loadError = ref("");
const query = ref("");
const lastQueryLabel = ref("");
const candidates = ref<ShopifyVariantCandidate[]>([]);
const searching = ref(false);
const searched = ref(false);
const searchError = ref("");
const selected = ref("");
const saving = ref(false);
const saveError = ref("");
let version = 0;

const existingCount = computed(() => existing.value.length);
const mapped = computed(() => existing.value.length === 1 && existing.value[0].available ? existing.value[0] : undefined);
const identifiers = computed(() => [
  product.value?.sku ? translate("SKU {id}", { id: product.value.sku }) : "",
  product.value?.upc ? translate("UPC {id}", { id: product.value.upc }) : "",
].filter(Boolean).join(" / "));
const productDetail = computed(() => {
  const created = formatDateTime(product.value?.createdDate);

  return created
    ? translate("OMS product {id}, created {date}", { id: props.productId, date: created })
    : translate("OMS product {id}", { id: props.productId });
});

/** A variant can only be offered when Shopify tracks it and no other OMS product holds it. */
function mappable(candidate: ShopifyVariantCandidate) {
  return candidate.tracked && !candidate.mappedProductIds.length;
}
function variantUrl(candidate: ShopifyVariantCandidate) {
  const host = shopifyAdminHostname(props.domain);

  return host && isShopifyObjectId(candidate.shopifyProductId) && isShopifyObjectId(candidate.variantId)
    ? `https://${host}/admin/products/${candidate.shopifyProductId}/variants/${candidate.variantId}` : "";
}

async function search(text: string, label = text) {
  const token = version;

  if(!props.productStoreId) {
    searchError.value = translate("This shop has no product store, so existing mappings can't be checked.");

    return;
  }
  if(!text.trim()) {return;}
  searching.value = true;
  searchError.value = "";
  saveError.value = "";
  selected.value = "";
  try {
    const rows = await searchVariants(props.shopId, props.productStoreId, text);
    if(token === version) {candidates.value = rows; searched.value = true; lastQueryLabel.value = label;}
  } catch (cause: any) {
    if(token === version) {searchError.value = cause.message || translate("Shopify could not be searched. Try again.");}
  } finally {if(token === version) {searching.value = false;}}
}

async function load() {
  const token = ++version;
  loading.value = true;
  loadError.value = "";
  product.value = undefined;
  existing.value = [];
  candidates.value = [];
  searched.value = false;
  emit("ready", false);
  try {
    const [summary, choices] = await Promise.all([fetchOmsProduct(props.productId), fetchChoices(props.shopId, props.productId)]);
    if(token !== version) {return;}
    product.value = summary;
    existing.value = choices;
    emit("ready", Boolean(mapped.value));
    if(!choices.length) {
      // Start from the exact identifiers; the search box shows the plain SKU so it can be edited.
      query.value = summary.sku || summary.upc || summary.name || "";
      const initial = initialVariantQuery(summary);
      if(initial) {void search(initial, query.value);}
    }
  } catch (cause: any) {
    if(token === version) {loadError.value = cause.message || translate("The OMS product could not be loaded.");}
  } finally {if(token === version) {loading.value = false;}}
}

async function confirmMap() {
  const target = candidates.value.find(row => row.variantId === selected.value && mappable(row));
  if(!target || saving.value || !props.productStoreId) {return;}
  const productName = product.value?.name || product.value?.internalName || props.productId;
  const variantName = [target.title, target.variantTitle].filter(Boolean).join(" / ") || target.variantId;
  const alert = await alertController.create({
    header: translate("Confirm product mapping"),
    message: translate("Map {product} to {variant}? The OMS will use this Shopify variant for this product's inventory and transfers in this shop.", { product: productName, variant: variantName })
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
    buttons: [{ text: translate("Cancel"), role: "cancel" }, { text: translate("Map product"), handler: () => {
      saving.value = true;
      saveError.value = "";
      emit("busy", true);
      void addMapping(props.shopId, props.productId, props.productStoreId!, target.variantId)
        .then(load)
        .catch((cause: any) => { saveError.value = cause.message; selected.value = ""; })
        .finally(() => { saving.value = false; emit("busy", false); });
    } }],
  });
  await alert.present();
}

watch(() => [props.shopId, props.productId], load, { immediate: true });
</script>
