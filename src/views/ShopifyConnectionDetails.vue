<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-back-button slot="start" default-href="/tabs/shopify"/>
        <ion-title>{{ "<shopifyShopName>" }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <main>
        <div class="facility-info">
          <ion-card class="facility-info facility-details">
            <ion-item lines="none" class="ion-margin-top">
              <ion-label>
                <p class="overline">{{ "SHOP ID" }}</p>
                <h1>{{ "Shopify connection name" }}</h1>
                <p>{{ "The <country> based <subscription> instance, operating in the <timezone> timezone, owned by <ownerName>." }}</p>
              </ion-label>
              <ion-button fill="outline">{{ translate('Edit') }}</ion-button>
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
                  <ion-select-option value="">{{ "<storeName></storeName>" }}</ion-select-option>
                </ion-select>
              </ion-item>
              <ion-item>
                <ion-icon :icon="cloudUploadOutline" slot="start"/>
                <ion-toggle>{{ translate("Upload refunds to Shopify") }}</ion-toggle>
              </ion-item>
              <ion-item>
                <ion-icon :icon="cashOutline" slot="start"/>
                <ion-input :label="translate('Weight/Currency')" :placeholder="translate('Kg/USD')" />
              </ion-item>
            </div>
          </ion-card>
        </div>

        <section>
          <ion-card>
            <ion-card-header>
              <div>
                <ion-card-subtitle class="overline">{{ "Products downloaded in last 24 hours" }}</ion-card-subtitle>
                <ion-card-title>{{ "<count>" }}</ion-card-title>
                  <ion-card-subtitle>{{ "<percent> complete" }}</ion-card-subtitle>
              </div>
              <ion-badge>{{ "<status>" }}</ion-badge>
            </ion-card-header>

            <ion-button fill="outline" expand="block">
              {{ translate("Download products") }}
            </ion-button>
          </ion-card>

          <ion-card>
            <ion-card-header class="ion-margin-bottom">
              <div>
                <ion-card-subtitle class="overline">{{ "Orders downloaded in last 24 hours" }}</ion-card-subtitle>
                <ion-card-title>{{ "<count>" }}</ion-card-title>
                <ion-card-subtitle>{{ "Only open and unfulfilled orders will be downloaded" }}</ion-card-subtitle>
              </div>
              <ion-badge>{{ "<status>" }}</ion-badge>
            </ion-card-header>

            <ion-item>
              <ion-input :label="translate('Last Shopify Order')" :placeholder="translate('Internal Shopify ID')" />
            </ion-item>
            <ion-button fill="outline" expand="block">
              {{ translate("Download products") }}
            </ion-button>
          </ion-card>

          <ion-card>
            <ion-card-header>
              <div>
                <ion-card-subtitle class="overline">{{ "Location ID" }}</ion-card-subtitle>
                <ion-card-title>{{ "<Inventory location>" }}</ion-card-title>
              </div>
              <ion-badge color="success">{{ "Default location" }}</ion-badge>
            </ion-card-header>

            <ion-item lines="none">
              <ion-label>
                <p>{{ translate("Map the default Shopify location as the inventory location in OMS, ensures that unified inventory across facilities is updated to a single location in Shopify.") }}</p>
              </ion-label>
            </ion-item>

            <ion-button fill="outline" expand="block">
              {{ translate("Map location") }}
            </ion-button>
          </ion-card>
        </section>

        <section>
          <ion-card>
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

          <ion-card>
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

          <ion-card>
            <ion-card-header>
              <div>
                <ion-card-subtitle class="overline">{{ "<LOCATION ID>" }}</ion-card-subtitle>
                <ion-card-title>{{ translate("<storeName>") }}</ion-card-title>
                <ion-card-subtitle>{{ translate("Shopify location ") }}</ion-card-subtitle>
              </div>
            </ion-card-header>

            <ion-item>
              <ion-label>{{ "<count> in last 1hr" }}</ion-label>
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
          <div class="ion-text-center">
            <ion-button fill="outline">
              <ion-icon :icon="downloadOutline" slot="start" />
              {{ translate("Import shopify locations in hotwax") }}
            </ion-button>
          </div>
        </template>
        <template v-else-if="selectedSegment === 'data-mappings'">
          <div class="data-mappings">
            <ion-card>
              <ion-card-header>
                <ion-card-title>{{ translate("Payment method") }}</ion-card-title>
              </ion-card-header>

              <ion-item>
                <ion-label>{{ translate("Map the payment method from Shopify with OMS to make sure the orders in OMS reflects actual payment method.") }}</ion-label>
              </ion-item>
              <ion-item v-if="group.description" lines="none">
                <ion-label class="ion-text-wrap">{{ group.description }}</ion-label>
              </ion-item>
            </ion-card>
          </div>
        </template>
        <template v-else>
          <div class="ion-text-center">
            <ion-button fill="outline">
              <ion-icon :icon="downloadOutline" slot="start" />
              {{ translate("Import shopify shipping methods in hotwax") }}
            </ion-button>
          </div>
        </template>
      </main>
    </ion-content>
  </ion-page>
</template>


<script setup lang="ts">
import { IonBackButton, IonBadge, IonButton, IonCard, IonCardHeader, IonCardSubtitle, IonCardTitle, IonContent, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonPage, IonSegment, IonSegmentButton, IonSelect, IonSelectOption, IonTitle, IonToggle, IonToolbar } from "@ionic/vue";
import { cashOutline, cloudUploadOutline, downloadOutline, mapOutline, shapesOutline } from "ionicons/icons";
import { translate } from "@/i18n";
import { ref } from "vue";

const selectedSegment = ref("facilities")

</script>

<style scoped>

section {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
  align-items: start;
}

.facility-details {
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

.staff {
  --columns-desktop: 5;
  padding-block: var(--spacer-xs);
}

.data-mappings, .facility-info {
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

@media screen and (min-width: 700px) {
  ion-content > main {
    margin: var(--spacer-lg)
  }
}
</style>
