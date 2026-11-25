<template>
  <ion-modal :is-open="isOpen" @didPresent="onPresent" @didDismiss="emit('close')">
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button :aria-label="translate('Close')" @click="emit('close')"><ion-icon slot="icon-only" :icon="closeOutline" /></ion-button>
        </ion-buttons>
        <ion-title>{{ translate("Choose an order to preview with") }}</ion-title>
      </ion-toolbar>
      <ion-toolbar>
        <ion-searchbar ref="searchbar" :value="keyword" :debounce="350"
          :placeholder="sourceParameter === 'orderId' ? translate('Transfer order name or ID') : translate('Order name, order ID or external ID')"
          data-testid="preview-order-search" @ionInput="runSearch(String($event.detail.value || ''))" />
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-list>
        <ion-item v-if="search.loading.value" lines="none"><ion-label><ion-skeleton-text animated style="width: 70%" /></ion-label></ion-item>
        <ion-item v-else-if="search.error.value" lines="none" data-testid="preview-order-search-error">
          <ion-icon slot="start" color="danger" :icon="alertCircleOutline" />
          <ion-label class="ion-text-wrap">{{ translate("Orders could not be searched.") }}</ion-label>
          <ion-button slot="end" fill="clear" @click="runSearch(keyword)">{{ translate("Try again") }}</ion-button>
        </ion-item>
        <ion-item v-else-if="!choices.length" lines="none" data-testid="preview-order-search-empty">
          <ion-label class="ion-text-wrap secondary-label">{{ emptyMessage }}</ion-label>
        </ion-item>

        <!-- A picklist can be shared by several orders, so each order/document pair is a separate choice. -->
        <ion-radio-group v-if="choices.length && !search.loading.value && !search.error.value" :value="selectedChoiceId" @ionChange="pick($event.detail.value)">
          <ion-item v-for="{ order, document, id } in choices" :key="id" :data-testid="`preview-document-${document.sourceId}`">
            <ion-radio :value="id" label-placement="end" justify="start">
              <ion-label class="ion-text-wrap">
                {{ order.orderName || order.orderId }}
                <p>
                  {{ [documentLabel(document),
                    document.statusId ? seed.statusDescription(document.statusId) : "", order.facilityName, order.customerName].filter(Boolean).join(" · ") }}
                </p>
              </ion-label>
            </ion-radio>
          </ion-item>
        </ion-radio-group>
      </ion-list>
    </ion-content>
  </ion-modal>
</template>

<script setup lang="ts">
import { translate } from "@common";
import { useSeedData } from "@common/db";
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonModal, IonRadio, IonRadioGroup, IonSearchbar, IonSkeletonText, IonTitle, IonToolbar } from "@ionic/vue";
import { alertCircleOutline, closeOutline } from "ionicons/icons";
import { computed, ref } from "vue";
import { usePreviewOrderSearch } from "@/composables/useDocumentTemplates";
import type { SampleDocument, SourceParameter } from "@/utils/documentTemplates";

const props = defineProps<{ isOpen: boolean; sourceParameter: SourceParameter; documentTypeId?: string; selectedDocument?: SampleDocument | null }>();
const emit = defineEmits<{
  (e: "close"): void;
  (e: "select", document: SampleDocument): void;
}>();

const seed = useSeedData();
const search = usePreviewOrderSearch();
const keyword = ref("");
const searchbar = ref<any>(null);
const choiceId = (orderId: string, sourceId: string) => JSON.stringify([orderId, sourceId]);
const selectedChoiceId = computed(() => {
  const document = props.selectedDocument;
  return document ? choiceId(document.orderId || document.sourceId, document.sourceId) : undefined;
});
const choices = computed(() => search.orders.value.flatMap(order => order.documents.map(document => ({
  order, document, id: choiceId(order.orderId, document.sourceId),
}))));
const emptyMessage = computed(() => {
  if(props.sourceParameter === "orderId") {
    return keyword.value ? translate("No approved transfer order matches {keyword}.", { keyword: keyword.value }) : translate("No approved transfer orders.");
  }
  const isPicklist = props.sourceParameter === "picklistId";
  if(search.documentsError.value) {return isPicklist ? translate("Pick lists could not be loaded.") : translate("Shipments could not be loaded.");}
  if(isPicklist) {
    return keyword.value ? translate("No approved order matching {keyword} is on a pick list.", { keyword: keyword.value }) : translate("No approved orders are on a pick list.");
  }
  return keyword.value ? translate("No approved order matching {keyword} has a shipment.", { keyword: keyword.value }) : translate("No approved orders have a shipment.");
});

function documentLabel(document: SampleDocument) {
  if(document.kind === "picklist") {return translate("Pick list {id}", { id: document.sourceId });}
  return document.kind === "order" ? translate("Transfer order {id}", { id: document.sourceId }) : translate("Shipment {id}", { id: document.sourceId });
}

function runSearch(value: string) {
  keyword.value = value.trim();
  void search.search(props.sourceParameter, keyword.value, props.documentTypeId);
}

function onPresent() {
  // Recent approved orders until the user types, so there is something to choose from straight away.
  runSearch(keyword.value);
  void searchbar.value?.$el?.setFocus?.();
}

// Choosing a radio applies it: the preview re-renders and the modal closes.
function pick(id: string) {
  const choice = choices.value.find(row => row.id === id);
  if(choice) {
    const { order, document } = choice;
    emit("select", { ...document, orderId: order.orderId, orderName: order.orderName || order.orderId });
  }
}
</script>

<style scoped>
.secondary-label {
  color: var(--ion-color-medium);
}
</style>
