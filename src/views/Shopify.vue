<template>
  <ion-page>
    <FacilityFilters content-id="filter-content" />

    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-title>{{ translate("Shopify connections") }}</ion-title>
        <ion-buttons slot="end" >
          <ion-menu-button menu="end" class="mobile-only">
            <ion-icon :icon="filterOutline" />
          </ion-menu-button>
          <ion-button slot="icon-only">
            <ion-icon :icon="informationCircleOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content id="filter-content">
      <div class="find">
        <section class="search">
          <ion-searchbar :placeholder="translate('Search keys')" />
        </section>

        <aside class="filters">
          <ion-list>
            <ion-item lines="none">
              <ion-icon :icon="flashOutline" slot="start" />
              <ion-toggle>{{ translate("Show active shops") }}</ion-toggle>
            </ion-item>
          </ion-list>
        </aside>

        <main>
          <div class="list-item" @click="openShopifyConnectionDetails()">
            <ion-item lines="none">
              <ion-icon slot="start" :icon="storefrontOutline" />
              <ion-label class="ion-text-wrap">
                {{ "Shop ID" }}
                <p>{{ "Shop connection name" }}</p>
              </ion-label>
            </ion-item>

            <div class="tablet">
              <ion-chip outline>
                <ion-label>{{ translate("Shopify link") }}</ion-label>
                <ion-icon :icon="openOutline" color="primary"/>
              </ion-chip>
            </div>

            <div class="tablet">
              <ion-label class="ion-text-center">
                {{ "<product store name>" }}
                <p>{{ "product store" }}</p>
              </ion-label>
            </div>

            <ion-button fill="clear" color="medium" @click="openShopifyShopActionsPopover($event)">
              <ion-icon slot="icon-only" :icon="ellipsisVerticalOutline" />
            </ion-button>
          </div>
          <div class="list-item">
            <ion-item lines="none">
              <ion-icon slot="start" :icon="storefrontOutline" />
              <ion-label class="ion-text-wrap">
                {{ "Shop ID" }}
                <p>{{ "Shop connection name" }}</p>
              </ion-label>
            </ion-item>

            <div class="tablet">
              <ion-chip outline>
                <ion-label>{{ translate("Shopify link") }}</ion-label>
                <ion-icon :icon="openOutline" color="primary"/>
              </ion-chip>
            </div>

            <div class="tablet">
              <ion-label class="ion-text-center">
                {{ "<product store name>" }}
                <p>{{ "product store" }}</p>
              </ion-label>
            </div>

            <ion-button fill="clear" color="medium" @click="openShopifyShopActionsPopover($event)">
              <ion-icon slot="icon-only" :icon="ellipsisVerticalOutline" />
            </ion-button>
          </div>
        </main>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonButton, IonButtons, IonChip, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonPage, IonSearchbar, IonTitle, IonToggle, IonToolbar, popoverController } from "@ionic/vue";
import { ellipsisVerticalOutline, filterOutline, flashOutline, informationCircleOutline, openOutline, storefrontOutline } from "ionicons/icons";
import { translate } from "@/i18n";
import ShopifyShopActionsPopover from "@/components/ShopifyShopActionsPopover.vue";
import router from "@/router";

async function openShopifyShopActionsPopover(event: Event) {
  const popover = await popoverController.create({
    component: ShopifyShopActionsPopover,
    event,
    showBackdrop: false
  });

  popover.present()
}

function openShopifyConnectionDetails() {
  console.log('enter');
  
  router.push({ path: "/shopify-connection-details" })
}
</script>

<style scoped>
.list-item {
  --columns-desktop: 5;
  border-bottom: var(--border-medium);
}

.list-item > ion-item {
  width: 100%;
}
</style>