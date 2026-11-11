<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="dismiss()">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate("Generate a sample label") }}</ion-title>
    </ion-toolbar>
    <ion-toolbar>
      <ion-searchbar
        v-model="queryString"
        :placeholder="translate('Search orders')"
        @keyup.enter="loadOrders()"
        @ion-clear="clearSearch()"
      />
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <ion-note class="ion-padding ion-text-wrap" style="display: block">
      {{ translate("Orders whose shipping label hasn't been generated. Generating one asks FedEx for a real label, and picks and packs the order. Pick a test order.") }}
    </ion-note>

    <div v-if="isLoading" class="ion-padding ion-text-center"><ion-spinner name="crescent" /></div>
    <p v-else-if="loadError" class="ion-padding" data-testid="orders-error">{{ loadError }}</p>
    <p v-else-if="!orders.length" class="ion-padding" data-testid="orders-empty">
      {{ translate("No orders without a shipping label found for this product store.") }}
    </p>

    <ion-list v-else>
      <ion-item v-for="order in orders" :key="orderKey(order)" :data-testid="`order-${orderKey(order)}`">
        <ion-label class="ion-text-wrap">
          <h2>{{ order.orderName || order.orderId }}</h2>
          <p>{{ order.customerName }} · {{ translate("{count} items", { count: order.itemCount }) }}</p>
          <p v-if="!order.hasShipment">{{ translate("Not picked yet. Generating a label will pick and pack it.") }}</p>
          <p v-if="results[orderKey(order)]?.trackingCode">
            {{ translate("Tracking") }}: {{ results[orderKey(order)].trackingCode }}
          </p>
          <p v-if="errors[orderKey(order)] || (order.labelError && !results[orderKey(order)])" :data-testid="`error-${orderKey(order)}`">
            <ion-text color="danger">{{ errors[orderKey(order)] || order.labelError }}</ion-text>
          </p>
        </ion-label>
        <ion-button
          v-if="results[orderKey(order)]"
          slot="end"
          fill="outline"
          size="small"
          @click="openAgain(order)"
        >
          {{ translate("Open label") }}
        </ion-button>
        <ion-button
          v-else
          slot="end"
          size="small"
          :disabled="Boolean(activeShipmentId)"
          :data-testid="`generate-${orderKey(order)}`"
          @click="generate(order)"
        >
          <ion-spinner v-if="activeShipmentId === orderKey(order)" slot="start" name="crescent" />
          {{ errors[orderKey(order)] || order.labelError ? translate("Retry") : translate("Generate label") }}
        </ion-button>
      </ion-item>
    </ion-list>

    <ion-infinite-scroll v-if="hasMore" @ion-infinite="loadMore($event)">
      <ion-infinite-scroll-content />
    </ion-infinite-scroll>
  </ion-content>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInfiniteScroll,
  IonInfiniteScrollContent,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonSearchbar,
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar,
  modalController,
} from "@ionic/vue";
import { closeOutline } from "ionicons/icons";
import { commonUtil, logger, translate } from "@common";
import { useFedexSetup, type SampleLabelOrder } from "@/composables/useFedexSetup";
import { resolveLabelTarget, type SampleLabel } from "@/utils/fedexLabel";

const props = defineProps<{ productStoreId: string }>();

const { fetchSampleLabelOrders, fetchOrdersWithoutShipment, generateLabel } = useFedexSetup();

const PAGE_SIZE = 20;
const MAX_EMPTY_PAGES = 5;
const queryString = ref("");
const orders = ref<SampleLabelOrder[]>([]);
const hasMore = ref(false);
const pageIndex = ref(0);
const isLoading = ref(false);
const loadError = ref("");
const activeShipmentId = ref("");
const results = reactive<Record<string, SampleLabel>>({});
const errors = reactive<Record<string, string>>({});

const orderKey = (order: SampleLabelOrder) => order.shipmentId || `${order.orderId}-${order.shipGroupSeqId}`;

const dismiss = () => modalController.dismiss();

let requestId = 0;

async function loadOrders(append = false) {
  const current = ++requestId;
  if(!append) {
    pageIndex.value = 0;
    isLoading.value = true;
  }
  loadError.value = "";
  try {
    let found: SampleLabelOrder[] = [];
    let more = false;
    // A filtered page can be empty while later ones aren't.
    for(let attempt = 0; attempt < MAX_EMPTY_PAGES; attempt++) {
      const page = await fetchSampleLabelOrders({
        productStoreId: props.productStoreId,
        queryString: queryString.value,
        pageIndex: pageIndex.value,
        pageSize: PAGE_SIZE,
      });
      if(current !== requestId) {return;}
      found = [...found, ...page.orders];
      more = page.hasMore;
      if(page.orders.length || !page.hasMore) {break;}
      pageIndex.value += 1;
    }

    // Listed once, after the first page.
    const unshipped = append ? [] : await fetchOrdersWithoutShipment({
      productStoreId: props.productStoreId,
      queryString: queryString.value,
      pageSize: PAGE_SIZE,
    });
    if(current !== requestId) {return;}
    orders.value = append ? [...orders.value, ...found] : [...found, ...unshipped];
    hasMore.value = more;
  } catch(error: any) {
    if(current !== requestId) {return;}
    logger.error(error);
    if(append) {
      pageIndex.value = Math.max(0, pageIndex.value - 1);
      commonUtil.showToast(error?.message || translate("Failed to load orders."));
    } else {
      loadError.value = error?.message || translate("Failed to load orders.");
    }
  } finally {
    if(current === requestId) {isLoading.value = false;}
  }
}

const clearSearch = () => {
  queryString.value = "";
  loadOrders();
};

async function loadMore(event: any) {
  pageIndex.value += 1;
  await loadOrders(true);
  event.target.complete();
}

/** The tab is opened before the await so popup blockers allow it. */
function openLabelTab(tab: Window | null, label: SampleLabel) {
  const target = resolveLabelTarget(label);
  if(!target) {
    tab?.close();
    commonUtil.showToast(translate("The label was created but this format can't be previewed. Print it from Fulfillment."));
    return;
  }

  const url = target.kind === "url" ? target.url : URL.createObjectURL(target.blob);
  if(tab) {
    tab.location.href = url;
  } else if(!window.open(url, "_blank", "noopener")) {
    commonUtil.showToast(translate("Your browser blocked the label tab. Use Open label to try again."));
  }
  if(target.kind === "blob") {setTimeout(() => URL.revokeObjectURL(url), 60_000);}
}

async function generate(order: SampleLabelOrder) {
  const tab = window.open("", "_blank");
  activeShipmentId.value = orderKey(order);
  delete errors[orderKey(order)];
  try {
    const label = await generateLabel(order, props.productStoreId);
    results[orderKey(order)] = label;
    openLabelTab(tab, label);
    commonUtil.showToast(translate("Sample label generated"));
  } catch(error: any) {
    tab?.close();
    logger.error(error);
    errors[orderKey(order)] = error?.message || translate("Failed to generate the label.");
  } finally {
    activeShipmentId.value = "";
  }
}

const openAgain = (order: SampleLabelOrder) => openLabelTab(null, results[orderKey(order)]);

onMounted(() => loadOrders());
</script>
