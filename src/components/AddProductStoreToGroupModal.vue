<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal()">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate("Product stores") }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <ion-list>
      <ion-item
        v-for="productStore in productStores"
        :key="productStore.productStoreId"
        @click="toggleSelection(productStore)"
      >
        <ion-checkbox :checked="isSelected(productStore.productStoreId)">
          <ion-label>
            {{ productStore.storeName || productStore.productStoreId }}
            <p>{{ productStore.productStoreId }}</p>
          </ion-label>
        </ion-checkbox>
      </ion-item>
      <ion-item v-if="!productStores.length" lines="none">
        <ion-label>{{ translate("No product stores found") }}</ion-label>
      </ion-item>
    </ion-list>

    <ion-fab vertical="bottom" horizontal="end" slot="fixed">
      <ion-fab-button :disabled="!isModified" @click="save()">
        <ion-icon :icon="saveOutline" />
      </ion-fab-button>
    </ion-fab>
  </ion-content>
</template>

<script setup lang="ts">
import {
  IonButton,
  IonButtons,
  IonCheckbox,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonTitle,
  IonToolbar,
  modalController
} from "@ionic/vue";
import { closeOutline, saveOutline } from "ionicons/icons";
import { translate, commonUtil, logger, api } from "@common";
import { useProductStore } from "@/store/productStore";
import { computed, onMounted, ref } from "vue";
import { DateTime } from "luxon";

const props = defineProps<{ facilityGroup: any }>();

const productStoreStore = useProductStore();
const productStores = computed(() => productStoreStore.getProductStores);

// snapshot of already-associated records (with fromDate for expiry)
const currentAssociations = ref<any[]>([]);
// working set of selected productStoreIds
const selectedIds = ref<Set<string>>(new Set());

const isModified = computed(() => {
  const currentIds = new Set(currentAssociations.value.map((a: any) => a.productStoreId));
  if (currentIds.size !== selectedIds.value.size) return true;
  for (const id of selectedIds.value) if (!currentIds.has(id)) return true;
  return false;
});

onMounted(async () => {
  await productStoreStore.fetchProductStores();
  await fetchCurrentAssociations();
});

async function fetchCurrentAssociations() {
  try {
    const resp = await api({
      url: "oms/groupProductStores",
      method: "get",
      params: { facilityGroupId: props.facilityGroup.facilityGroupId, filterByDate: "Y", pageNoLimit: true }
    });
    if (!commonUtil.hasError(resp) && resp.data?.length) {
      currentAssociations.value = resp.data;
      selectedIds.value = new Set(resp.data.map((a: any) => a.productStoreId));
    } else {
      currentAssociations.value = [];
      selectedIds.value = new Set();
    }
  } catch (err) {
    logger.error("Failed to fetch group product stores", err);
  }
}

function isSelected(productStoreId: string) {
  return selectedIds.value.has(productStoreId);
}

function toggleSelection(store: any) {
  const next = new Set(selectedIds.value);
  if (next.has(store.productStoreId)) {
    next.delete(store.productStoreId);
  } else {
    next.add(store.productStoreId);
  }
  selectedIds.value = next;
}

function closeModal(updatedCount?: number) {
  modalController.dismiss({ updatedCount });
}

async function save() {
  const currentIds = new Set(currentAssociations.value.map((a: any) => a.productStoreId));
  const associationByStoreId = Object.fromEntries(currentAssociations.value.map((a: any) => [a.productStoreId, a]));

  const toAdd = [...selectedIds.value].filter((id) => !currentIds.has(id));
  const toRemove = [...currentIds].filter((id) => !selectedIds.value.has(id));

  const addRequests = toAdd.map((productStoreId) =>
    api({
      url: `oms/productStores/${productStoreId}/facilityGroups`,
      method: "post",
      data: { facilityGroupId: props.facilityGroup.facilityGroupId, fromDate: DateTime.now().toMillis() }
    })
  );

  const removeRequests = toRemove.map((productStoreId) =>
    api({
      url: `oms/productStores/${productStoreId}/facilityGroups`,
      method: "post",
      data: {
        facilityGroupId: props.facilityGroup.facilityGroupId,
        fromDate: associationByStoreId[productStoreId].fromDate,
        thruDate: DateTime.now().toMillis()
      }
    })
  );

  const results = await Promise.allSettled([...addRequests, ...removeRequests]);
  const anyFailed = results.some((r) => r.status === "rejected");

  if (anyFailed) {
    commonUtil.showToast(translate("Failed to update some product store associations"));
  } else {
    commonUtil.showToast(translate("Product stores updated"));
  }

  closeModal(selectedIds.value.size);
}
</script>

<style scoped>
ion-content {
  --padding-bottom: 80px;
}
</style>
