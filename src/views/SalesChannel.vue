<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-back-button slot="start" default-href="/netsuite" />
        <ion-title>{{ translate("Sales Channel") }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div class="header ion-margin-top">
        <ion-item lines="none">
          <ion-icon slot="start" :icon="shieldCheckmarkOutline" />
          <ion-label>
            {{ translate("Map sales channel with NetSuite") }}
            <p>{{ translate("Learn more about mapping sales channels with NetSuite to make sure orders are attributed correctly.") }}</p>
          </ion-label>
          <ion-button fill="clear" size="small" color="medium">
            <ion-icon :icon="openOutline" slot="icon-only" />
          </ion-button>
        </ion-item>
      </div>

      <div class="list-item ion-padding-end ion-margin-top" v-for="channel in salesChannel" :key="channel.enumId">
        <ion-item lines="none">
          <ion-label>
            {{ channel.description ? channel.description : channel.enumId }}
            <p>{{ channel.enumId }}</p>
          </ion-label>
        </ion-item>
        
        <!-- TODO: need to make this shopify mapping dynamic -->
        <ion-label>
          {{ getShopifyMappingId(channel.enumId) ? getShopifyMappingId(channel.enumId) : '-' }}
          <p>{{ translate("Shopify") }}</p>
        </ion-label>

        <div class="netsuite-id ion-margin-end">
          <template v-if="editingNetSuiteId === channel.enumId">
            <ion-input v-show="editingNetSuiteId === channel.enumId" :ref="(el => setNetSuiteInputRef(el, channel.enumId))" :clear-input="true" v-model="netSuiteInputValue" @keyup.enter="saveNetSuiteId(channel)" @ionBlur="netSuiteInputValue ? saveNetSuiteId(channel) : ''"/>
          </template>
          <template v-else>
            <div class="ion-text-center" v-if="channel.enumCode">
              <ion-chip outline @click="updateNetSuiteId(channel)">
                <ion-label>{{ channel.enumCode }}</ion-label>
                <ion-icon :icon="closeCircleOutline" @click.stop="updateSalesChannelNetSuiteId(channel, '')"/>
              </ion-chip>
              <ion-label>
                <p>{{ translate("NetSuite sales channel") }}</p>
              </ion-label>
            </div>
            <ion-button v-else size="small" fill="outline" @click="updateNetSuiteId(channel)">
              <ion-icon :icon="addOutline"/>
              <ion-label>{{ translate("NetSuite ID") }}</ion-label>
            </ion-button>
          </template>
        </div>
        <!-- TODO: need to make this order analytics dynamic -->
        <!-- <ion-label class="ion-margin">
          150
          <p>orders</p>
        </ion-label> -->
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonButton, IonBackButton, IonChip, IonContent, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonPage, IonTitle, IonToolbar, onIonViewDidEnter } from "@ionic/vue";
import { addOutline, closeCircleOutline, openOutline, shieldCheckmarkOutline } from 'ionicons/icons'
import { translate } from "@/i18n"
import { NetSuiteService } from '@/services/NetSuiteService';
import { useStore } from "vuex";
import { computed, nextTick, ref } from "vue";
import { showToast, hasError } from '@/utils';
import emitter from "@/event-bus";
import logger from '@/logger';

const store = useStore();

let editingNetSuiteId = ref("") as any;
let netSuiteInputValue = ref("") as any;
let netSuiteInputRefs = ref({}) as any;

const salesChannel = computed(() => store.getters["netSuite/getSalesChannel"])
const shopifyTypeMappings = computed(() => store.getters["netSuite/getShopifyTypeMappings"]("SHOPIFY_ORDER_SOURCE"))

onIonViewDidEnter(async () => {
  await store.dispatch("netSuite/fetchSalesChannel")
  await store.dispatch("netSuite/fetchShopifyTypeMappings", "SHOPIFY_ORDER_SOURCE")
})

function getShopifyMappingId(salesChannelEnumId: any) {
  const shopifyMappingId = shopifyTypeMappings.value.find((mapping: any) => mapping.mappedValue === salesChannelEnumId);
  return shopifyMappingId ? shopifyMappingId.mappedKey : "";
}

function setNetSuiteInputRef(el: any, id: string) {
  if(el) netSuiteInputRefs.value[id] = el;
}

async function updateNetSuiteId(channel: any) {
  editingNetSuiteId.value = channel.enumId;
  netSuiteInputValue.value = channel.enumCode || "";
  // Waiting for DOM updations before focus inside the text-area, as it is conditionally rendered in the DOM
  await nextTick()
  setTimeout(async () => {
    const inputElement = netSuiteInputRefs.value[channel.enumId];
    if(inputElement && inputElement.$el) {
      await inputElement.$el.setFocus();
    }
  }, 0);
}

async function saveNetSuiteId(channel: any) {
  await editNetSuiteSalesChannelId(channel, netSuiteInputValue.value.trim());
  editingNetSuiteId.value = "";
}

async function editNetSuiteSalesChannelId(channel: any, netSuiteId: any) {   
  if(!netSuiteId) {
    showToast(translate("Please enter a valid NetSuite ID"));
    return false;
  }

  if(channel.enumCode === netSuiteId) {
    showToast(translate("Please update the NetSuite ID"));
    return false;
  }
  await updateSalesChannelNetSuiteId(channel, netSuiteId);
}

async function updateSalesChannelNetSuiteId(channel: any, netSuiteId: any) {
  emitter.emit("presentLoader");
  let resp;

  try {
    channel.enumCode = netSuiteId;
    resp = await NetSuiteService.updateEnumCode(channel);

    if(!hasError(resp)) {
      showToast(translate("NetSuite Id updated successfully"));
      await store.dispatch("netSuite/fetchSalesChannel");
    } else {
      throw resp.data;
    }
  } catch (err) {
    logger.error(err);
  }
  emitter.emit('dismissLoader');
}

</script>

<style scoped>
.list-item {
  --columns-desktop: 4;
}

.netsuite-id {
  width: 220px;
}

@media (max-width: 700px) {
  .header {
    grid-template-columns: 1fr;
  }
}
</style>