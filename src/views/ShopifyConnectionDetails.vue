<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-back-button slot="start" default-href="/tabs/shopify-connections"/>
        <ion-title>{{ "<shopifyShopName>" }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <main>
        <div class="connection-info">
          <ion-card class="connection-info connection-details">
            <ion-item lines="none" class="ion-margin-top">
              <ion-label>
                <p class="overline">{{ "SHOP ID" }}</p>
                {{ "Shopify connection name" }}
                <p>{{ "The <country> based <subscription> instance, operating in the <timezone> timezone, owned by <ownerName>." }}</p>
              </ion-label>

              <ion-button fill="clear" slot="end">
                <ion-icon :icon="openOutline" slot="icon-only" />
              </ion-button>
            </ion-item>

            <div class="ion-margin-top">
              <ion-item>
                <ion-icon :icon="shapesOutline" slot="start"/>
                <ion-select :label="translate('Shopify access')" interface="popover" value="">
                  <ion-select-option value="">{{ "Read only" }}</ion-select-option>
                </ion-select>
              </ion-item>
              <ion-item>
                <ion-icon :icon="mapOutline" slot="start"/>
                <ion-select :label="translate('Product store')" interface="popover" value="">
                  <ion-select-option value="">{{ "<storeName>" }}</ion-select-option>
                </ion-select>
              </ion-item>
              <ion-item>
                <ion-icon :icon="cloudUploadOutline" slot="start"/>
                <ion-toggle color="danger">{{ translate("Upload refunds to Shopify") }}</ion-toggle>
              </ion-item>
              <ion-item>
                <ion-icon :icon="cashOutline" slot="start"/>
                <ion-input :label="translate('Weight/Currency')" :placeholder="translate('Kg/USD')" />
              </ion-item>
            </div>
          </ion-card>
        </div>

        <section>
          <ion-card v-if="firstSelected">
            <ion-card-header>
              <div>
                <ion-card-subtitle class="overline">{{ translate("Products downloaded in last 24 hours") }}</ion-card-subtitle>
                <ion-card-title>{{ "<count>" }}</ion-card-title>
              </div>
              <ion-badge>{{ "<status>" }}</ion-badge>
            </ion-card-header>

            <ion-item lines="none">
              <ion-label>
                <p>{{ "<percent> complete" }}</p>
              </ion-label>
            </ion-item>

            <ion-button fill="outline" expand="block">{{ translate("Download products") }}</ion-button>
          </ion-card>

          <ion-card v-else>
            <ion-card-header>
              <ion-card-title>{{ translate("Product downloads") }}</ion-card-title>
            </ion-card-header>

            <ion-item>
              <ion-label>{{ "<count> in last 24hrs" }}</ion-label>
              <ion-badge slot="end">{{ "5 mins ago" }}</ion-badge>
            </ion-item>

            <ion-item lines="full">
              <ion-label>{{ "Total <count> products" }}</ion-label>
            </ion-item>

            <div class="actions">
              <ion-button color="danger" fill="clear">{{ translate("Disable") }}</ion-button>
              <ion-button fill="clear">{{ translate("Quick sync") }}</ion-button>
            </div>
          </ion-card>

          <ion-card v-if="firstSelected">
            <ion-card-header>
              <div>
                <ion-card-subtitle class="overline">{{ translate("Orders downloaded in last 24 hours") }}</ion-card-subtitle>
                <ion-card-title>{{ "<count>" }}</ion-card-title>
              </div>
              <ion-badge>{{ "<status>" }}</ion-badge>
            </ion-card-header>

            <ion-item lines="none">
              <ion-label>
                <p>{{ translate("Only open and unfulfilled orders will be downloaded") }}</p>
              </ion-label>
            </ion-item>

            <ion-item lines="none">
              <ion-input :label="translate('Last Shopify Order')" :placeholder="translate('Internal Shopify ID')" />
            </ion-item>

            <ion-button fill="outline" expand="block">{{ translate("Download orders") }}</ion-button>
          </ion-card>

          <ion-card v-else>
            <ion-card-header>
              <ion-card-title>{{ translate("Order downloads") }}</ion-card-title>
            </ion-card-header>

            <ion-item>
              <ion-label>{{ "<count> in last 1hr" }}</ion-label>
              <ion-badge slot="end">{{ "5 mins ago" }}</ion-badge>
            </ion-item>

            <ion-item lines="full">
              <ion-label>{{ "Total <count> products" }}</ion-label>
              <ion-badge>{{ "from <start>" }}</ion-badge>
            </ion-item>

            <div class="actions">
              <ion-button color="danger" fill="clear">{{ translate("Disable") }}</ion-button>
              <ion-button fill="clear">{{ translate("Quick sync") }}</ion-button>
            </div>
          </ion-card>

          <ion-card v-if="firstSelected">
            <ion-card-header>
              <div>
                <ion-card-subtitle class="overline">{{ "Location ID" }}</ion-card-subtitle>
                <ion-card-title>{{ "<Inventory location>" }}</ion-card-title>
              </div>
              <ion-badge color="success">{{ translate("Default location") }}</ion-badge>
            </ion-card-header>

            <ion-item lines="none">
              <ion-label>
                <p>{{ translate("Map the default Shopify location as the inventory location in OMS, ensures that unified inventory across facilities is updated to a single location in Shopify.") }}</p>
              </ion-label>
            </ion-item>

            <ion-button fill="outline" expand="block">{{ translate("Map location") }}</ion-button>
          </ion-card>

          <ion-card v-else>
            <ion-card-header>
              <div>
                <ion-card-subtitle class="overline">{{ "<LOCATION ID>" }}</ion-card-subtitle>
                <ion-card-title>{{ "<storeName>" }}</ion-card-title>
              </div>
            </ion-card-header>

            <ion-item lines="none">
              <ion-label>
                <p>{{ translate("Shopify location where the ATP numbers are consolidated for all stores in OMS.") }}</p>
              </ion-label>
            </ion-item>

            <ion-item lines="full">
              <ion-label>{{ translate("Last sync on Shopify") }}</ion-label>
              <ion-badge>{{ "5 mins ago" }}</ion-badge>
            </ion-item>

            <ion-item class="ion-no-padding">
              <div>
                <ion-button size="default" color="danger" fill="clear">{{ translate("Disable") }}</ion-button>
                <ion-button size="default" fill="clear">{{ translate("Quick sync") }}</ion-button>
              </div>

              <ion-button size="default" slot="end" fill="clear" color="medium">
                <ion-icon :icon="ellipsisVerticalOutline" slot="icon-only" />
              </ion-button>
            </ion-item>
          </ion-card>
        </section>

        <ion-segment scrollable v-model="selectedSegment">
          <ion-segment-button value="facilities">
            <ion-label>{{ translate("Facilities") }}</ion-label>
          </ion-segment-button>
          <ion-segment-button value="data-mappings">
            <ion-label>{{ translate("Data mappings") }}</ion-label>
          </ion-segment-button>
          <ion-segment-button value="shipping-method-types">
            <ion-label>{{ translate("Shipping method types") }}</ion-label>
          </ion-segment-button>
        </ion-segment>

        <template v-if="selectedSegment === 'facilities'">
          <div v-if="firstSelected" class="ion-text-center">
            <ion-button fill="outline" @click="openImportShopifyLocationsModal()">
              <ion-icon :icon="downloadOutline" slot="start" />
              {{ translate("Import shopify locations in hotwax") }}
            </ion-button>
          </div>
          <template v-else>
            <ion-button fill="outline">
              <ion-icon :icon="syncOutline" slot="start" />
              {{ translate("Sync new locations from shopify") }}
            </ion-button>

            <div class="list-item locations">
              <ion-item lines="none">
                <ion-icon :icon="storefrontOutline" slot="start" />
                <ion-label>
                  {{ "<storeName>" }}
                  <p>{{ "<city>" }}</p>
                </ion-label>
              </ion-item>

              <div class="tablet">
                <ion-chip outline>{{ "<status>" }}</ion-chip>
              </div>

              <div class="tablet">
                <ion-chip outline>
                  <ion-icon :icon="addCircleOutline" />
                  <ion-label>{{ translate("map location with Hotwax facility") }}</ion-label>
                </ion-chip>
              </div>

              <ion-chip outline>
                <ion-icon :icon="openOutline" />
                <ion-label>{{ "Shopify location ID" }}</ion-label>
              </ion-chip>
            </div>
          </template>
        </template>

        <template v-else-if="selectedSegment === 'data-mappings'">
          <div class="data-mappings">
            <ion-card v-if="firstSelected">
              <ion-card-header>
                <ion-card-title>{{ translate("Payment methods") }}</ion-card-title>
              </ion-card-header>

              <ion-item lines="full">
                <ion-label>
                  <p>{{ translate("Map the payment method from Shopify with OMS to make sure the orders in OMS reflects actual payment method.") }}</p>
                </ion-label>
              </ion-item>

              <div class="actions">
                <ion-button fill="clear">
                  <ion-icon :icon="downloadOutline" slot="start" />
                  <ion-label>{{ translate("Import payments") }}</ion-label>
                </ion-button>
              </div>
            </ion-card>
            
            <ion-card v-else>
              <ion-card-header>
                <ion-card-title>{{ translate("Payment methods") }}</ion-card-title>
              </ion-card-header>

              <ion-item lines="none">
                <ion-label>
                  <p>{{ translate("Map the payment method from Shopify with OMS to make sure the orders in OMS reflects actual payment method.") }}</p>
                </ion-label>
              </ion-item>

              <ion-item>
                <ion-label>{{ "<paymentMethodName>" }}</ion-label>
                <ion-note slot="end">{{ "<hotWaxMeth>" }}</ion-note>
                <ion-button slot="end" fill="clear" color="medium">
                  <ion-icon :icon="ellipsisVerticalOutline" slot="icon-only" />
                </ion-button>
              </ion-item>

              <ion-item lines="full">
                <ion-label>{{ "<paymentMethodName>" }}</ion-label>
                <ion-note slot="end">{{ "<hotWaxMeth>" }}</ion-note>
                <ion-button slot="end" fill="clear" color="medium">
                  <ion-icon :icon="ellipsisVerticalOutline" slot="icon-only" />
                </ion-button>
              </ion-item>

              <div class="actions">
                <ion-button fill="clear">{{ translate("Sync again") }}</ion-button>
              </div>
            </ion-card>

            <ion-card v-if="firstSelected">
              <ion-card-header>
                <ion-card-title>{{ translate("Sales channel") }}</ion-card-title>
              </ion-card-header>

              <ion-item lines="full">
                <ion-label>
                  <p>{{ translate("Map the sales channel from Shopify with OMS to make sure the orders in OMS reflects actual sales channel.") }}</p>
                </ion-label>
              </ion-item>

              <div class="actions">
                <ion-button fill="clear">
                  <ion-icon :icon="downloadOutline" slot="start" />
                  <ion-label>{{ translate("Import sales channel") }}</ion-label>
                </ion-button>
              </div>
            </ion-card>

            <ion-card v-else>
              <ion-card-header>
                <ion-card-title>{{ translate("Sales channel") }}</ion-card-title>
              </ion-card-header>

              <ion-item lines="none">
                <ion-label>
                  <p>{{ translate("Map the sales channel from Shopify with OMS to make sure the orders in OMS reflects actual sales channel.") }}</p>
                </ion-label>
              </ion-item>

              <ion-item>
                <ion-label>{{ "<salesChannel>" }}</ion-label>
                <ion-button slot="end" fill="clear">
                  <ion-icon :icon="linkOutline" slot="icon-only" />
                </ion-button>
              </ion-item>

              <ion-item lines="full">
                <ion-label>{{ "<salesChannel>" }}</ion-label>
                <ion-button slot="end" fill="clear">
                  <ion-icon :icon="linkOutline" slot="icon-only" />
                </ion-button>
              </ion-item>

              <div class="actions">
                <ion-button fill="clear">{{ translate("Sync again") }}</ion-button>
              </div>
            </ion-card>

            <ion-card v-if="firstSelected">
              <ion-card-header>
                <ion-card-title>{{ translate("Product types") }}</ion-card-title>
              </ion-card-header>

              <ion-item lines="full">
                <ion-label>
                  <p>{{ translate("Map the product types from Shopify with OMS to make sure the orders in OMS reflects actual product types.") }}</p>
                </ion-label>
              </ion-item>
              
              <ion-item>
                <ion-button size="default" fill="clear">
                  <ion-icon :icon="downloadOutline" slot="start" />
                  <ion-label>{{ translate("Import product types") }}</ion-label>
                </ion-button>
              </ion-item>
            </ion-card>

            <ion-card v-else>
              <ion-card-header>
                <ion-card-title>{{ translate("Product types") }}</ion-card-title>
              </ion-card-header>

              <ion-item lines="none">
                <ion-label>
                  <p>{{ translate("Map the product types from Shopify with OMS to make sure the orders in OMS reflects actual product types.") }}</p>
                </ion-label>
              </ion-item>

              <ion-item>
                <ion-label>{{ "<productType>" }}</ion-label>
                <ion-note slot="end">{{ "<hotWaxMeth>" }}</ion-note>
                <ion-button slot="end" fill="clear" color="medium">
                  <ion-icon :icon="ellipsisVerticalOutline" slot="icon-only" />
                </ion-button>
              </ion-item>

              <ion-item>
                <ion-label>{{ "<productType>" }}</ion-label>
                <ion-note slot="end">{{ "<hotWaxMeth>" }}</ion-note>
                <ion-button slot="end" fill="clear" color="medium">
                  <ion-icon :icon="ellipsisVerticalOutline" slot="icon-only" />
                </ion-button>
              </ion-item>

              <ion-item>
                <ion-label>{{ "<productType>" }}</ion-label>
                <ion-button slot="end" fill="clear">
                  <ion-icon :icon="linkOutline" slot="icon-only" />
                </ion-button>
              </ion-item>

              <ion-item lines="full">
                <ion-label>{{ "<productType>" }}</ion-label>
                <ion-button slot="end" fill="clear" @Click="openDataMappingsLinkActionPopover($event)">
                  <ion-icon :icon="linkOutline" slot="icon-only" />
                </ion-button>
              </ion-item>

              <div class="actions">
                <ion-button fill="clear">{{ translate("Sync again") }}</ion-button>
              </div>
            </ion-card>
          </div>
        </template>

        <template v-else>
          <div v-if="firstSelected" class="ion-text-center">
            <ion-button fill="outline" @click="openImportShippingMethodsModal()">
              <ion-icon :icon="downloadOutline" slot="start" />
              {{ translate("Import shopify shipping methods in hotwax") }}
            </ion-button>
          </div>
          <template v-else>
            <ion-button fill="outline" @click="openImportShippingMethodsModal()">
              <ion-icon :icon="downloadOutline" slot="start" />
              {{ translate("Import new shipping methods") }}
            </ion-button>

            <div class="list-item shipping-method">
              <ion-item lines="none">
                <ion-icon :icon="boatOutline" slot="start" />
                <ion-label>{{ "Shopify shipping method" }}</ion-label>
              </ion-item>

              <div class="tablet">
                <ion-chip outline>
                  <ion-label>{{ "<Carrier>" }}</ion-label>
                  <ion-icon :icon="shareOutline" color="primary" />
                </ion-chip>
              </div>

              <div class="tablet">
                <ion-chip outline @click="openAddShippingMethodModal()">
                  <ion-icon :icon="addCircleOutline" />
                  <ion-label>{{ translate("Map with Hotwax") }}</ion-label>
                </ion-chip>
              </div>

              <div class="tablet">
                <ion-chip outline>
                  <ion-label>{{ "Tracking required" }}</ion-label>
                </ion-chip>
              </div>

              <ion-button fill="clear" color="medium" @click="openShippingMethodActionsPopover($event)">
                <ion-icon slot="icon-only" :icon="ellipsisVerticalOutline" />
              </ion-button>
            </div>
          </template>
        </template>
      </main>
    </ion-content>
  </ion-page>
</template>


<script setup lang="ts">
import { IonBackButton, IonBadge, IonButton, IonCard, IonCardHeader, IonCardSubtitle, IonCardTitle, IonChip, IonContent, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonNote, IonPage, IonSegment, IonSegmentButton, IonSelect, IonSelectOption, IonTitle, IonToggle, IonToolbar, modalController, popoverController } from "@ionic/vue";
import { addCircleOutline, boatOutline, cashOutline, cloudUploadOutline, downloadOutline, ellipsisVerticalOutline, linkOutline, mapOutline, openOutline, shapesOutline, shareOutline, storefrontOutline, syncOutline } from "ionicons/icons";
import { translate } from "@/i18n";
import { ref } from "vue";
import ImportShopifyLocationsModal from "@/components/ImportShopifyLocationsModal.vue";
import ImportShippingMethodsModal from "@/components/ImportShippingMethodsModal.vue";
import ShippingMethodActionsPopover from "@/components/ShippingMethodActionsPopover.vue";
import AddShippingMethodModal from "@/components/AddShippingMethodModal.vue";
import DataMappingsLinkActionPopover from "@/components/DataMappingsLinkActionPopover.vue";

const selectedSegment = ref("facilities")

// Added this for UI implementation to show both screen, will remove on implementation.
const firstSelected = ref(false);

async function openImportShopifyLocationsModal() {
  const importShopifyLocationsModal = await modalController.create({
    component: ImportShopifyLocationsModal
  })

  importShopifyLocationsModal.present();
}

async function openImportShippingMethodsModal() {
  const importShippingMethods = await modalController.create({
    component: ImportShippingMethodsModal
  })

  importShippingMethods.present();
}

async function openAddShippingMethodModal() {
  const addShippingMethodModal = await modalController.create({
    component: AddShippingMethodModal
  })

  addShippingMethodModal.present();
}

async function openShippingMethodActionsPopover(event: any) {
  const shippingMethodActionsPopover = await popoverController.create({
    component: ShippingMethodActionsPopover,
    event,
    showBackdrop: false
  });

  shippingMethodActionsPopover.present()
}

async function openDataMappingsLinkActionPopover(event: any) {
  const dataMappingsLinkActionPopover = await popoverController.create({
    component: DataMappingsLinkActionPopover,
    event,
    showBackdrop: false
  });

  dataMappingsLinkActionPopover.present()
}

</script>

<style scoped>
section {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
  align-items: start;
}

.connection-details {
  grid-column: span 2;
}

ion-card-header {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
}

ion-segment {
  margin-top: var(--spacer-2xl);
  justify-content: start;
  margin-bottom: var(--spacer-lg)
}

.locations {
  --columns-desktop: 5;
  padding-block: var(--spacer-xs);
}

.shipping-method {
  --columns-desktop: 6;
}

.data-mappings, .connection-info {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
  align-items: start; 
}

ion-card > ion-button[expand="block"] {
  margin-inline: var(--spacer-sm);
  margin-bottom: var(--spacer-sm);
}

ion-card {
  /* height: 100%; */
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.actions {
  display: flex;
}

.list-item > ion-item {
  width: 100%;
}

@media screen and (min-width: 700px) {
  ion-content > main {
    margin: var(--spacer-lg)
  }
}
</style>
