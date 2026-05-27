<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button data-testid="product-sync-products-modal-close-btn" @click="closeModal">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ modalTitle }}</ion-title>
      <ion-buttons slot="end" v-if="!isSearchMode">
        <ion-button @click="loadProducts" :disabled="isLoading" :aria-label="translate('Refresh')">
          <ion-icon slot="icon-only" :icon="refreshOutline" />
        </ion-button>
      </ion-buttons>
      <ion-buttons slot="end" v-else-if="isLoading">
        <ion-spinner data-testid="product-sync-products-toolbar-loader" name="crescent" />
      </ion-buttons>
    </ion-toolbar>
    <ion-toolbar v-if="isSearchMode">
      <ion-searchbar
        data-testid="product-sync-products-search-input"
        @ionFocus="selectSearchBarText($event)"
        v-model="queryString"
        :placeholder="translate('Search SKU, product name, or Shopify ID')"
        @keyup.enter="handleSearch"
        @ionInput="handleInput"
      />
    </ion-toolbar>
  </ion-header>

  <ion-content data-testid="product-sync-products-modal-content" ref="contentRef" :scroll-events="true" @ionScroll="enableScrolling()">
    <ion-list v-if="limitExceeded" lines="full">
      <ion-item>
        <ion-label>{{ translate("Showing the first 100 updated products.") }}</ion-label>
        <ion-note slot="end">{{ translate("100+") }}</ion-note>
      </ion-item>
    </ion-list>

    <template v-if="products.length">
      <ion-list lines="full">
        <ion-list-header v-if="showDefaultProductsHeader">
          <ion-label>{{ translate("Recently updated products from Shopify") }}</ion-label>
        </ion-list-header>

        <ion-item button data-testid="product-sync-products-select-all-row" @click="toggleAllVisibleProducts">
          <ion-label>
            {{ translate("Select all") }}
            <p>{{ selectedProducts.length }} {{ translate("selected") }}</p>
          </ion-label>
          <ion-checkbox
            slot="end"
            :checked="areAllVisibleProductsSelected"
            :indeterminate="areSomeVisibleProductsSelected"
            data-testid="product-sync-products-select-all-checkbox"
            @click.stop="toggleAllVisibleProducts"
          />
        </ion-item>

        <ion-item v-for="product in products" :key="product.id" :data-testid="`product-sync-products-row-${getProductId(product)}`" lines="none" button @click="toggleProduct(product)">
          <ion-thumbnail v-if="product.imageUrl" slot="start">
            <ion-img :src="product.imageUrl" :alt="product.imageAltText || product.title" />
          </ion-thumbnail>
          <ion-label>
            <h2>{{ product.title }}</h2>
            <p>{{ product.handle }}</p>
            <p>{{ translate("Vendor") }}: {{ product.vendor || translate("No vendor") }} · {{ translate("Type") }}: {{ product.productType || translate("No type") }}</p>
            <p>{{ translate("Updated") }} {{ formatShopifyDate(product.updatedAt) }}</p>
            <p>{{ translate("Shopify ID") }}: {{ getProductId(product) }}</p>
          </ion-label>
          <ion-note slot="end">
            {{ product.variantsCount }} {{ translate("variants") }}
            <p>{{ product.status }}</p>
            <p>{{ translate("Inventory") }} {{ product.totalInventory ?? 0 }}</p>
          </ion-note>
          <ion-checkbox
            slot="end"
            :checked="isProductSelected(product.id)"
            :data-testid="`product-sync-products-checkbox-${getProductId(product)}`"
            @click.stop="toggleProduct(product)"
          />
        </ion-item>
      </ion-list>

      <ion-infinite-scroll data-testid="product-sync-products-infinite-scroll" @ionInfinite="loadMoreProducts($event)" threshold="100px" v-show="hasNextPage" ref="infiniteScrollRef">
        <ion-infinite-scroll-content loading-spinner="crescent" :loading-text="translate('Loading')" />
      </ion-infinite-scroll>
    </template>

    <ion-list v-else-if="isLoading" lines="none">
      <ion-item>
        <ion-spinner name="crescent" />
      </ion-item>
    </ion-list>

    <ion-list v-else-if="queryString && isSearching" data-testid="product-sync-products-search-empty-state">
      <ion-item>
        <ion-label>{{ translate("No products found") }}</ion-label>
      </ion-item>
    </ion-list>

    <ion-list v-else data-testid="product-sync-products-empty-state">
      <ion-item>
        <ion-label>{{ emptyStateLabel }}</ion-label>
      </ion-item>
    </ion-list>
  </ion-content>

  <ion-footer>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button fill="clear" :disabled="!selectedProducts.length" @click="clearSelectedProducts">
          {{ translate("Clear") }}
        </ion-button>
      </ion-buttons>
      <ion-buttons slot="end">
        <ion-button
          data-testid="product-sync-products-submit-btn"
          fill="solid"
          color="primary"
          :disabled="!selectedProducts.length"
          @click="submitSelectedProducts"
        >
          {{ translate("Sync selected products") }}{{ selectedProducts.length ? ` (${selectedProducts.length})` : "" }}
        </ion-button>
      </ion-buttons>
    </ion-toolbar>
  </ion-footer>
</template>

<script setup lang="ts">
import {
  IonButton,
  IonButtons,
  IonCheckbox,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonImg,
  IonInfiniteScroll,
  IonInfiniteScrollContent,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonNote,
  IonSearchbar,
  IonSpinner,
  IonThumbnail,
  IonTitle,
  IonToolbar,
  modalController,
  onIonViewWillEnter
} from "@ionic/vue";
import { closeOutline, refreshOutline } from "ionicons/icons";
import { computed, defineProps, onBeforeUnmount, onMounted, ref } from "vue";

import { translate } from "@/i18n";
import { formatDateTime, showToast } from "@/utils";
import logger from "@/logger";
import { ShopifyProductSyncService } from "@/services/ShopifyProductSyncService";
import type { ShopifyProductSyncProductSearchResult } from "@/services/ShopifyProductSyncService";

type ProductPickerMode = "search" | "unsynced";
const SEARCH_DEBOUNCE_MS = 600;

const props = defineProps<{
  mode?: ProductPickerMode
  systemMessageRemoteId: string
  shopId?: string
  lastSyncedAt?: string
  shopifyShopProductCount?: number
}>();

const queryString = ref("");
const products = ref<ShopifyProductSyncProductSearchResult[]>([]);
const selectedProductsById = ref<Record<string, ShopifyProductSyncProductSearchResult>>({});
const isScrollingEnabled = ref(false);
const isSearching = ref(false);
const isLoading = ref(false);
const hasNextPage = ref(false);
const endCursor = ref("");
const contentRef = ref(null as any);
const infiniteScrollRef = ref(null as any);
let scrollElement: HTMLElement | null = null;
let searchDebounceTimer: number | undefined;
let productSearchRequestId = 0;

const isSearchMode = computed(() => props.mode !== "unsynced");
const modalTitle = computed(() => isSearchMode.value ? translate("Select products") : translate("Un-synced updates"));
const selectedProducts = computed(() => Object.values(selectedProductsById.value));
const areAllVisibleProductsSelected = computed(() => {
  return !!products.value.length && products.value.every((product) => selectedProductsById.value[product.id]);
});
const areSomeVisibleProductsSelected = computed(() => {
  return products.value.some((product) => selectedProductsById.value[product.id]) && !areAllVisibleProductsSelected.value;
});
const showDefaultProductsHeader = computed(() => {
  return isSearchMode.value && !isSearching.value && !queryString.value.trim();
});
const limitExceeded = computed(() => {
  return !isSearchMode.value && Number(props.shopifyShopProductCount || 0) > products.value.length && products.value.length >= 100;
});
const emptyStateLabel = computed(() => {
  if (isSearchMode.value) return translate("Enter a SKU, or product name to search a product");
  return translate("No un-synced product updates");
});

onMounted(() => {
  void initializeScrollElement();
  void loadProducts();
});

onIonViewWillEnter(() => {
  isScrollingEnabled.value = false;
});

onBeforeUnmount(() => {
  clearSearchDebounce();
});

async function loadProducts() {
  if (isSearchMode.value && queryString.value.trim()) {
    await searchProducts();
    return;
  }

  isSearching.value = false;
  isLoading.value = true;
  const requestId = ++productSearchRequestId;
  try {
    const response = isSearchMode.value
      ? await ShopifyProductSyncService.fetchRecentlyUpdatedShopifyProducts({
          systemMessageRemoteId: props.systemMessageRemoteId,
          pageSize: 15
        })
      : {
          products: await ShopifyProductSyncService.fetchUnsyncedProductUpdates({
            systemMessageRemoteId: props.systemMessageRemoteId,
            shopId: props.shopId,
            lastSyncedAt: props.lastSyncedAt,
            pageSize: 100
          }) as ShopifyProductSyncProductSearchResult[],
          hasNextPage: false,
          endCursor: ""
        };

    if (requestId !== productSearchRequestId) return;
    products.value = response.products;
    hasNextPage.value = response.hasNextPage;
    endCursor.value = response.endCursor;
  } catch (error: any) {
    if (requestId !== productSearchRequestId) return;
    logger.error(error);
    showToast(isSearchMode.value ? translate("Failed to load recently updated products.") : translate("Failed to load un-synced product updates."));
    products.value = [];
    hasNextPage.value = false;
    endCursor.value = "";
  } finally {
    if (requestId === productSearchRequestId) {
      isLoading.value = false;
    }
  }
}

async function searchProducts(after?: string) {
  isLoading.value = true;
  const requestId = ++productSearchRequestId;
  try {
    const response = await ShopifyProductSyncService.searchShopifyProducts({
      systemMessageRemoteId: props.systemMessageRemoteId,
      queryString: queryString.value.trim(),
      pageSize: 20,
      after
    });

    if (requestId !== productSearchRequestId) return;
    products.value = after ? products.value.concat(response.products) : response.products;
    hasNextPage.value = response.hasNextPage;
    endCursor.value = response.endCursor;
  } catch (error: any) {
    if (requestId !== productSearchRequestId) return;
    logger.error(error);
    showToast(translate("Failed to search Shopify products."));
    products.value = after ? products.value : [];
    hasNextPage.value = false;
    endCursor.value = "";
  } finally {
    if (requestId === productSearchRequestId) {
      isLoading.value = false;
    }
  }
}

async function handleSearch() {
  clearSearchDebounce();
  if (!queryString.value.trim()) {
    showToast(translate("Enter product sku to search"));
    await loadProducts();
    return;
  }

  isSearching.value = true;
  await searchProducts();
}

function handleInput() {
  clearSearchDebounce();
  productSearchRequestId++;

  searchDebounceTimer = window.setTimeout(async () => {
    if (!queryString.value.trim()) {
      await loadProducts();
      return;
    }

    isSearching.value = true;
    await searchProducts();
  }, SEARCH_DEBOUNCE_MS);
}

function clearSearchDebounce() {
  if (!searchDebounceTimer) return;
  window.clearTimeout(searchDebounceTimer);
  searchDebounceTimer = undefined;
}

async function initializeScrollElement() {
  scrollElement = await contentRef.value?.$el?.getScrollElement?.();
}

function enableScrolling() {
  if (!scrollElement) return;
  const scrollHeight = scrollElement.scrollHeight;
  const infiniteHeight = infiniteScrollRef.value?.$el?.offsetHeight || 0;
  const scrollTop = scrollElement.scrollTop;
  const threshold = 100;
  const height = scrollElement.offsetHeight;
  const distanceFromInfinite = scrollHeight - infiniteHeight - scrollTop - threshold - height;
  isScrollingEnabled.value = distanceFromInfinite >= 0;
}

async function loadMoreProducts(event: any) {
  if (!(isScrollingEnabled.value && hasNextPage.value && endCursor.value)) {
    await event.target.complete();
    return;
  }

  await searchProducts(endCursor.value);
  await event.target.complete();
}

function getProductId(product: ShopifyProductSyncProductSearchResult) {
  return product.legacyResourceId || product.id;
}

function formatShopifyDate(value: string) {
  if (!value) return translate("Recent");
  return formatDateTime(value);
}

function isProductSelected(productId: string) {
  return !!selectedProductsById.value[productId];
}

function toggleProduct(product: ShopifyProductSyncProductSearchResult) {
  if (selectedProductsById.value[product.id]) {
    const updatedProducts = { ...selectedProductsById.value };
    delete updatedProducts[product.id];
    selectedProductsById.value = updatedProducts;
    return;
  }

  selectedProductsById.value = {
    ...selectedProductsById.value,
    [product.id]: product
  };
}

function toggleAllVisibleProducts() {
  if (areAllVisibleProductsSelected.value) {
    const updatedProducts = { ...selectedProductsById.value };
    products.value.forEach((product) => {
      delete updatedProducts[product.id];
    });
    selectedProductsById.value = updatedProducts;
    return;
  }

  const updatedProducts = { ...selectedProductsById.value };
  products.value.forEach((product) => {
    updatedProducts[product.id] = product;
  });
  selectedProductsById.value = updatedProducts;
}

function clearSelectedProducts() {
  selectedProductsById.value = {};
}

function submitSelectedProducts() {
  modalController.dismiss({
    dismissed: true,
    products: selectedProducts.value,
    productIds: selectedProducts.value.map((product) => product.id),
    legacyResourceIds: selectedProducts.value.map((product) => product.legacyResourceId).filter(Boolean)
  });
}

function closeModal() {
  modalController.dismiss({ dismissed: true });
}

function selectSearchBarText(event: any) {
  event.target.getInputElement().then((element: any) => {
    element.select();
  });
}
</script>
