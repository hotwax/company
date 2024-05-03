<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-back-button slot="start" default-href="/tabs/product-store"/>
        <ion-title>{{ "<productStoreName>" }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <main>
        <div class="store-info">
          <ion-card class="store-info store-details">
            <ion-item lines="none" class="ion-margin-top">
              <ion-label>
                <p class="overline">{{ "PRODUCT STORE ID" }}</p>
                <h1>{{ "Product store name" }}</h1>
                <p>{{ "Company name" }}</p>
              </ion-label>
              <ion-button fill="outline">{{ translate("Edit") }}</ion-button>
            </ion-item>

            <div class="ion-margin-top">
              <ion-item>
                <ion-icon :icon="mapOutline" slot="start"/>
                <ion-select :label="translate('Operating in')" value="countries" interface="popover">
                  <ion-select-option value="countries">{{ "3 countries" }}</ion-select-option>
                </ion-select>
              </ion-item>

              <ion-item>
                <ion-icon :icon="thunderstormOutline" slot="start"/>
                <ion-toggle>{{ translate("Order brokering") }}</ion-toggle>
              </ion-item>

              <ion-item lines="none">
                <ion-icon :icon="wineOutline" slot="start"/>
                <ion-toggle>{{ translate("Inventory reservation") }}</ion-toggle>
              </ion-item>
            </div>
          </ion-card>
        </div>

        <section>
          <ion-card>
            <ion-card-header>
              <ion-card-title>
                {{ translate("Order") }}
              </ion-card-title>
            </ion-card-header>

            <ion-list>
              <ion-item-divider color="light">
                <ion-label>{{ translate("Import") }}</ion-label>
              </ion-item-divider>

              <ion-item>
                <ion-input :label="translate('Id prefix')" placeholder="<prefixValue>" />
              </ion-item>
              <ion-item lines="none">
                <ion-label>
                  <p>{{ translate("Specify any preferred prefix to be added to internal order IDs.") }}</p>
                </ion-label>
              </ion-item>

              <ion-item>
                <ion-toggle>{{ translate("Save billing information") }}</ion-toggle>
              </ion-item>
              <ion-item lines="none">
                <ion-label>
                  <p>{{ translate("Store billing information associated with orders in OMS.") }}</p>
                </ion-label>
              </ion-item>
              
              <ion-item-divider color="light">
                <ion-label>{{ translate("Approval") }}</ion-label>
              </ion-item-divider>
              
              <ion-item>
                <ion-toggle>{{ translate("Approve on import") }}</ion-toggle>
              </ion-item>
              <ion-item lines="none">
                <ion-label>
                  <p>{{ translate("Configure when no further order information is needed prior to order approval.") }}</p>
                </ion-label>
              </ion-item>

              <ion-item-divider color="light">
                <ion-label>{{ translate("Returns") }}</ion-label>
              </ion-item-divider>

              <ion-item>
                <ion-input :label="translate('Create deadline days')" placeholder="<days count>" />
              </ion-item>
              <ion-item lines="none">
                <ion-label>
                  <p>{{ translate("Specify the number of days permitted for creating returns for in-store.") }}</p>
                </ion-label>
              </ion-item>
            </ion-list>
          </ion-card>

          <ion-card>
            <ion-card-header>
              <ion-card-title>
                {{ translate("Brokering") }}
              </ion-card-title>
            </ion-card-header>

            <ion-list>
              <ion-item-divider color="light">
                <ion-label>{{ translate("Seat Allocation") }}</ion-label>
              </ion-item-divider>
              
              <ion-item>
                <ion-input :label="translate('Preselected facility tag')" placeholder="<tagName>" />
              </ion-item>
              <ion-item lines="none">
                <ion-label>
                  <p>{{ translate("Orders tagged with this tag will undergo line item check for fulfillment facility selection.") }}</p>
                </ion-label>
              </ion-item>
                
              <ion-item>
                <ion-input :label="translate('Shipping facility tag')" placeholder="<tagName>" />
              </ion-item>
              <ion-item lines="none">
                <ion-label>
                  <p>{{ translate("Tag will hold the preselected fulfillment facility value.") }}</p>
                </ion-label>
              </ion-item>
                
              <ion-item-divider color="light">
                <ion-label>{{ translate("Routing") }}</ion-label>
              </ion-item-divider>

              <ion-item>
                <ion-toggle>{{ translate("Order splitting") }}</ion-toggle>
              </ion-item>

              <ion-item>
                <ion-input :label="translate('Minimum shipment threshold')" placeholder="<value>" />
              </ion-item>
              <ion-item lines="none">
                <ion-label>
                  <p>{{ translate("Split orders into multiple groups and fulfill them from different fulfillment centers.") }}</p>
                </ion-label>
              </ion-item>
            </ion-list>
          </ion-card>

          <div>
            <ion-card>
              <ion-card-header>
                <ion-card-title>
                  {{ translate("Fulfillment") }}
                </ion-card-title>
              </ion-card-header>
              <ion-list>
                <ion-item-divider color="light">
                  <ion-label>{{ translate("Notifications") }}</ion-label>
                </ion-item-divider>
  
                <ion-item>
                  <ion-toggle>{{ translate("Send notification to Shopify") }}</ion-toggle>
                </ion-item>
                <ion-item lines="none">
                  <ion-label>
                    <p>{{ translate("Update tracking information upon order shipment in Shopify.") }}</p>
                  </ion-label>
                </ion-item>

                <ion-item-divider color="light">
                  <ion-label>{{ translate("Cancellations") }}</ion-label>
                </ion-item-divider>

                <ion-item>
                  <ion-toggle>{{ translate("Auto order cancellation") }}</ion-toggle>
                </ion-item>
  
                <ion-item>
                  <ion-input :label="translate('Auto cancellations days')" placeholder="<days count>" />
                </ion-item>
                <ion-item lines="none">
                  <ion-label>
                    <p>{{ translate("Configure cancellation threshold for unfulfilled orders based on a specified number of days.") }}</p>
                  </ion-label>
                </ion-item>
              </ion-list>
            </ion-card>

            <ion-card>
              <ion-card-header>
                <ion-card-title>
                  {{ translate("Store pickup") }}
                </ion-card-title>
              </ion-card-header>

              <ion-list>
                <ion-item>
                  <ion-toggle>{{ translate("Partial order rejection") }}</ion-toggle>
                </ion-item>
                <ion-item lines="none">
                  <ion-label>
                    <p>{{ translate("Specify whether you reject a BOPIS order partially when any order item inventory is insufficient at the store.") }}</p>
                  </ion-label>
                </ion-item>
              </ion-list>
            </ion-card>
          </div>
        </section>

        <section>
          <ion-card>
            <ion-card-header>
              <ion-card-title>
                {{ translate("Inventory") }}
              </ion-card-title>
            </ion-card-header>

            <ion-list>
              <ion-item-divider color="light">
                <ion-label>{{ translate("Inventory view") }}</ion-label>
              </ion-item-divider>

              <ion-item>
                <ion-toggle>{{ translate("Show systemic inventory") }}</ion-toggle>
              </ion-item>
              <ion-item lines="none">
                <ion-label>
                  <p>{{ translate("Display current physical quantity expected at locations while inventory counting.") }}</p>
                </ion-label>
              </ion-item>
              
              <ion-item-divider color="light">
                <ion-label>{{ translate("Pre-order computation") }}</ion-label>
              </ion-item-divider>
              
              <ion-item>
                <ion-toggle>{{ translate("Hold pre-order physical inventory") }}</ion-toggle>
              </ion-item>

              <ion-item>
                <ion-select :label="translate('Pre-order group')" interface="popover" value="">
                  <ion-select-option value="">
                    {{ "<facilityGroup>" }}
                  </ion-select-option>
                </ion-select>
              </ion-item>
              <ion-item lines="none">
                <ion-label>
                  <p>{{ translate("Configure inventory computation for pre-sell items based on inventory channels and pre-sell queues.") }}</p>
                </ion-label>
              </ion-item>
            </ion-list>
          </ion-card>

          <ion-card>
            <ion-card-header>
              <ion-card-title>
                {{ translate("Product") }}
              </ion-card-title>
            </ion-card-header>
            <ion-list>
              <ion-item-divider color="light">
                <ion-label>{{ translate("Identifier") }}</ion-label>
              </ion-item-divider>
              
              <ion-item>
                <ion-select :label="translate('Global identifier')" interface="popover" value="">
                  <ion-select-option value="">
                    {{ "<UPCA>" }}
                    </ion-select-option>
                </ion-select>
              </ion-item>
              <ion-item lines="none">
                <ion-label>
                  <p>{{ translate("The identifier used globally throughout the business operations.") }}</p>
                </ion-label>
              </ion-item>
              
              <ion-item-divider color="light">
                <ion-label>{{ translate("Preferred identifier") }}</ion-label>
              </ion-item-divider>

              <ion-item>
                <ion-select :label="translate('Primary identifier')" interface="popover" value="">
                  <ion-select-option value="">
                    {{ "Product Id" }}
                    </ion-select-option>
                </ion-select>
              </ion-item>

              <ion-item>
                <ion-select :label="translate('Secondary identifier')" interface="popover" value="">
                  <ion-select-option value="">
                    {{ "SKU" }}
                    </ion-select-option>
                </ion-select>
              </ion-item>

              <ion-item lines="none">
                <ion-label>
                  <p>{{ translate("Choosing a product identifier allows you to view products with your preferred identifiers.") }}</p>
                </ion-label>
              </ion-item>
            </ion-list>
          </ion-card>

          <ion-card>
            <ion-card-header>
              <div>
                <ion-card-subtitle class="overline">{{ translate("Re-route fulfillment") }}</ion-card-subtitle>
                <ion-card-title>{{ translate("Order edit permissions") }}</ion-card-title>
              </div>
            </ion-card-header>

            <ion-list>
              <ion-item>
                <ion-toggle>{{ translate("Delivery method") }}</ion-toggle>
              </ion-item>

              <ion-item>
                <ion-select :label="translate('Shipment method')" interface="popover" value="">
                  <ion-select-option value="">
                    {{ "Two day" }}
                    </ion-select-option>
                </ion-select>
              </ion-item>

              <ion-item>
                <ion-toggle>{{ translate("Delivery address") }}</ion-toggle>
              </ion-item>

              <ion-item>
                <ion-toggle>{{ translate("Pick up location") }}</ion-toggle>
              </ion-item>

              <ion-item>
                <ion-toggle>{{ translate("Cancel order before fulfillment") }}</ion-toggle>
              </ion-item>
              <ion-item>
                <ion-label>
                  <p>{{ translate("Control what your customers are allowed to edit on their own when they are editing their order on Re-route Fulfillment.") }}</p>
                </ion-label>
              </ion-item>
            </ion-list>
          </ion-card>
        </section>
      </main>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonBackButton, IonButton, IonCard, IonCardHeader, IonCardSubtitle, IonCardTitle, IonContent, IonHeader, IonIcon, IonInput, IonItem, IonItemDivider, IonLabel, IonList, IonPage, IonSelect, IonSelectOption, IonTitle, IonToggle, IonToolbar } from "@ionic/vue";
import { mapOutline, thunderstormOutline, wineOutline } from "ionicons/icons";
import { translate } from "@/i18n";
</script>

<style scoped>
section {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  align-items: start;
}

.store-details {
  grid-column: span 2;
}

ion-card-header {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
}

.store-info {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  align-items: start; 
}

@media screen and (min-width: 700px) {

  ion-content > main {
    margin: var(--spacer-lg)
  }
}
</style>
