<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-back-button :default-href="`/create-facility/address/${facilityId}`" slot="start" />
        <ion-title>{{ translate("Add Store Configuration") }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <main>
        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ translate("Product Stores") }}</ion-card-title>
            <ion-button v-if="selectedProductStores.length" @click="selectProductStore()" fill="clear">
              <ion-icon :icon="addCircleOutline" slot="start" />
              {{ translate("Add") }}
            </ion-button>
          </ion-card-header>
          <template v-if="selectedProductStores.length">
            <ion-list>
              <ion-item v-for="store in selectedProductStores" :key="store.productStoreId">
                <ion-label>
                  <h2>{{ store.storeName || store.productStoreId }}</h2>
                </ion-label>
                <ion-badge v-if="store.productStoreId === primaryProductStoreId">
                  {{ translate("primary store") }}
                </ion-badge>
                <ion-button :id="`store-actions-${store.productStoreId}`" size="default" slot="end" fill="clear" color="medium">
                  <ion-icon slot="icon-only" :icon="ellipsisVerticalOutline" />
                </ion-button>
                <ion-popover :trigger="`store-actions-${store.productStoreId}`" showBackdrop="false" dismissOnSelect="true">
                  <ion-content>
                    <ion-list>
                      <ion-list-header>{{ store.storeName || store.productStoreId }}</ion-list-header>
                      <ion-item button @click="updatePrimary(store.productStoreId)">
                        {{ translate("Primary") }}
                        <ion-icon slot="end" :color="store.productStoreId === primaryProductStoreId ? 'warning' : ''" :icon="store.productStoreId === primaryProductStoreId ? star : starOutline" />
                      </ion-item>
                      <ion-item button lines="none" @click="removeProductStore(store.productStoreId)">
                        {{ translate("Unlink") }}
                        <ion-icon slot="end" :icon="removeCircleOutline" />
                      </ion-item>
                    </ion-list>
                  </ion-content>
                </ion-popover>
              </ion-item>
            </ion-list>
          </template>
          <ion-button v-else expand="block" fill="outline" @click="selectProductStore()">
            {{ translate("Add") }}
            <ion-icon slot="end" :icon="addCircleOutline" />
          </ion-button>
        </ion-card>

        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ translate("Fulfillment Settings") }}</ion-card-title>
          </ion-card-header>
          <ion-list>
            <ion-item>
              <ion-toggle v-model="fulfillmentSettings.FAC_GRP">{{ translate("Sell Inventory Online") }}</ion-toggle>
            </ion-item>
            <ion-item>
              <ion-toggle v-model="fulfillmentSettings.PICKUP">{{ translate("Allow pickup") }}</ion-toggle>
            </ion-item>
            <ion-item lines="none">
              <ion-toggle v-model="fulfillmentSettings.OMS_FULFILLMENT">{{ translate("Uses native fulfillment app") }}</ion-toggle>
            </ion-item>
          </ion-list>
        </ion-card>

        <div class="ion-text-center ion-margin">
          <ion-button @click="saveStoreConfig()">
            <ion-icon slot="start" :icon="locationOutline" />
            {{ translate("Save configurations") }}
          </ion-button>
          <ion-button @click="router.replace(`/facility-details/${facilityId}`)" color="medium" fill="clear">
            {{ translate("Configure settings later") }}
          </ion-button>
        </div>
      </main>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonBackButton,
  IonBadge,
  IonButton,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonPage,
  IonPopover,
  IonTitle,
  IonToggle,
  IonToolbar,
  modalController,
  onIonViewWillEnter
} from "@ionic/vue";
import { ref } from "vue";
import { addCircleOutline, ellipsisVerticalOutline, locationOutline, removeCircleOutline, star, starOutline } from "ionicons/icons";
import { commonUtil, logger, translate } from "@common";
import { useFacilityGroupMutations, useFacilityMutations } from "@/composables/useFacilities";
import { useShopifyShopIdForProductStore } from "@/composables/useShopify";
import SelectProductStoreModal from "@/components/product-store/SelectProductStoreModal.vue";
import router from "@/router";
import { DateTime } from "luxon";

const props = defineProps<{ facilityId: string }>();

const facilityMutations = useFacilityMutations(props.facilityId);
const { shopifyShopIdFor } = useShopifyShopIdForProductStore();
const groupMutations = useFacilityGroupMutations();

const selectedProductStores = ref<any[]>([]);
const primaryProductStoreId = ref("");
const fulfillmentSettings = ref({ FAC_GRP: false, PICKUP: false, OMS_FULFILLMENT: false });

onIonViewWillEnter(async () => {
  selectedProductStores.value = [];
  primaryProductStoreId.value = "";
  fulfillmentSettings.value = { FAC_GRP: false, PICKUP: false, OMS_FULFILLMENT: false };
});

function updatePrimary(productStoreId: string) {
  primaryProductStoreId.value = primaryProductStoreId.value === productStoreId ? "" : productStoreId;
}

function removeProductStore(productStoreId: string) {
  selectedProductStores.value = selectedProductStores.value.filter((productStore: any) => productStore.productStoreId !== productStoreId);
  if (primaryProductStoreId.value === productStoreId) primaryProductStoreId.value = "";
}

async function selectProductStore() {
  const modal = await modalController.create({
    component: SelectProductStoreModal,
    componentProps: { selectedProductStores: selectedProductStores.value }
  });
  modal.onDidDismiss().then(({ data }: any) => {
    if (data?.value) {
      selectedProductStores.value = data.value.selectedProductStores;
    }
  });
  modal.present();
}

async function saveFulfillmentSettings() {
  const groupsToAdd = Object.entries(fulfillmentSettings.value)
    .filter(([, enabled]) => enabled)
    .map(([groupId]) => groupId);

  // NOT `oms/facilityGroups/{groupId}/facilities` — that route does not exist (no nested
  // `facilities` resource under `oms/facilityGroups/{id}` in oms.rest.xml), so this silently 404'd
  // and no fulfillment setting was ever applied. The real route is per-facility, and `addToGroup`
  // also refreshes the cached memberships.
  const results = await Promise.allSettled(
    groupsToAdd.map((facilityGroupId) =>
      facilityMutations.addToGroup({ facilityGroupId, fromDate: DateTime.now().toMillis() })
    )
  );
  if (results.some((result) => result.status === "rejected")) {
    throw new Error(translate("Failed to update some fulfillment settings."));
  }
}

async function addProductStoresToFacility() {
  const results = await Promise.allSettled(
    selectedProductStores.value.map((store: any) =>
      facilityMutations.addProductStore({
        productStoreId: store.productStoreId,
        fromDate: DateTime.now().toMillis()
      })
    )
  );
  if (results.some((result) => result.status === "rejected")) {
    throw new Error(translate("Failed to add some product stores to the facility."));
  }
}

async function makeProductStorePrimary() {
  const shopifyShopId = shopifyShopIdFor(primaryProductStoreId.value);
  if (!shopifyShopId) return;

  // ensure the FEATURING facility group exists
  let facilityGroupId = shopifyShopId;
  try {
    const existingGroup = await groupMutations.findGroup(shopifyShopId);
    if (!existingGroup) {
      const storeName = selectedProductStores.value.find((productStore: any) => productStore.productStoreId === primaryProductStoreId.value)?.storeName || primaryProductStoreId.value;
      await groupMutations.createGroup({
        facilityGroupId: shopifyShopId,
        facilityGroupTypeId: "FEATURING",
        facilityGroupName: storeName
      });
    }
  } catch { /* group creation failed — still try to set primary */ }

  const resp = await facilityMutations.updateFacility({ primaryFacilityGroupId: facilityGroupId });
  if (commonUtil.hasError(resp)) {
    throw new Error(translate("Failed to make product store as primary."));
  }
}

async function saveStoreConfig() {
  try {
    if (Object.values(fulfillmentSettings.value).some(Boolean)) {
      await saveFulfillmentSettings();
    }
    if (selectedProductStores.value.length) {
      await addProductStoresToFacility();
      if (primaryProductStoreId.value) {
        await makeProductStorePrimary();
      }
    }
    commonUtil.showToast(translate("Facility configurations created successfully."));
    router.replace(`/facility-details/${props.facilityId}`);
  } catch (error: any) {
    commonUtil.showToast(error.message || translate("Failed to save configurations."));
    logger.error(error);
  }
}
</script>

<style scoped>
ion-card-header {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
}

@media (min-width: 700px) {
  main {
    max-width: 375px;
    margin: auto;
  }
}
</style>
