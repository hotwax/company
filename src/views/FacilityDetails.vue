<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-back-button slot="start" default-href="/facilities/find"/>
        <ion-title>{{ translate("Facility details") }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <main v-if="isLoading">
        <div class="facility-info">
          <ion-card class="facility-info facility-details">
            <ion-skeleton-text animated style="width: 40%; height: 20px; margin: 16px;" />
            <ion-skeleton-text animated style="width: 60%; height: 28px; margin: 16px;" />
            <ion-skeleton-text animated style="width: 80%; height: 20px; margin: 16px;" />
          </ion-card>
        </div>
        <section>
          <ion-card v-for="n in 4" :key="n">
            <ion-skeleton-text animated style="width: 50%; height: 20px; margin: 16px;" />
            <ion-skeleton-text animated style="width: 90%; height: 16px; margin: 16px;" />
            <ion-skeleton-text animated style="width: 70%; height: 16px; margin: 16px;" />
          </ion-card>
        </section>
      </main>

      <main v-else-if="current?.facilityId">
        <div class="facility-info">
          <ion-card class="facility-info facility-details">
            <ion-item lines="none" class="ion-margin-top">
              <ion-label>
                <p class="overline">{{ current.facilityId }}</p>
                <h1>{{ current.facilityName }}</h1>
              </ion-label>
              <ion-button @click="renameFacility()" fill="outline">{{ translate('Edit') }}</ion-button>
            </ion-item>

            <div class="ion-margin-top">
              <ion-item>
                <ion-icon :icon="bookmarkOutline" slot="start"/>
                <ion-select :label="translate('Facility Type')" interface="popover" v-model="parentFacilityTypeId" @ionChange="getFacilityTypesByParentTypeId()">
                  <ion-select-option value="PHYSICAL_STORE">{{ translate('Physical Store') }}</ion-select-option>
                  <ion-select-option value="DISTRIBUTION_CENTER">{{ translate('Distribution Center') }}</ion-select-option>
                </ion-select>
              </ion-item>

              <ion-item>
                <ion-icon :icon="bookmarksOutline" slot="start"/>
                <ion-select :label="translate('Facility SubType')" interface="popover" v-model="facilityTypeId" @ionChange="updateFacilityType()">
                  <ion-select-option v-for="(type, fTypeId) in facilityTypeIdOptions" :key="fTypeId" :value="fTypeId">{{ type.description ? type.description : fTypeId }}</ion-select-option>
                </ion-select>
              </ion-item>
              <ion-item lines="none" class="ion-margin-bottom">
                <ion-icon :icon="lockClosedOutline" slot="start"/>
                <ion-toggle :checked="!!current.closedDate" @click.prevent="closeFacility($event)">{{ translate('Permanently Closed') }}</ion-toggle>
              </ion-item>
            </div>
          </ion-card>
        </div>

        <section>
          <div>
            <ion-card>
              <ion-card-header>
                <ion-card-title>
                  {{ translate("Address and contact details") }}
                </ion-card-title>
              </ion-card-header>
              <template v-if="postalAddress?.address1">
                <ion-item lines="full">
                  <ion-label>
                    <h3>{{ postalAddress.toName }}</h3>
                    <h3>{{ postalAddress.address1 }}</h3>
                    <h3>{{ postalAddress.address2 }}</h3>
                    <p class="ion-text-wrap">{{ postalAddress.postalCode ? `${postalAddress.city}, ${postalAddress.postalCode}` : postalAddress.city }}</p>
                    <p class="ion-text-wrap">{{ postalAddress.countryGeoId ? `${postalAddress.stateProvinceGeoId}, ${postalAddress.countryGeoId}` : postalAddress.stateProvinceGeoId }}</p>
                    <p class="ion-text-wrap" v-if="contactDetails?.telecomNumber?.contactNumber">{{ [contactDetails.telecomNumber.countryCode, contactDetails.telecomNumber.contactNumber].filter(Boolean).join('-') }}</p>
                    <p class="ion-text-wrap" v-if="contactDetails?.emailAddress">{{ contactDetails.emailAddress?.infoString }}</p>
                  </ion-label>
                </ion-item>
                <ion-button fill="clear" @click="openAddressModal">{{ translate("Edit") }}</ion-button>
              </template>
              <ion-button v-else expand="block" fill="outline" @click="openAddressModal">
                {{ translate("Add") }}
                <ion-icon slot="end" :icon="addCircleOutline" />
              </ion-button>
            </ion-card>

            <ion-card>
              <ion-card-header>
                <ion-card-title>
                  {{ translate("Latitude & Longitude") }}
                </ion-card-title>
              </ion-card-header>
              <template v-if="postalAddress?.latitude || postalAddress?.latitude == 0">
                <ion-card-content>
                  {{ translate("These values are used to help customers lookup how close they are to your stores when they are finding nearby stores.") }}
                </ion-card-content>
                <ion-item lines="full">
                  <ion-label>
                    <p>{{ translate("Facility zipcode") }}</p>
                  </ion-label>
                  <ion-label slot="end"><ion-text :color="isRegenerationRequired ? 'danger' : ''">{{ postalAddress.postalCode }}</ion-text></ion-label>
                </ion-item>
                <ion-item lines="full">
                  <ion-label>
                    <p>{{ translate("Latitude") }}</p>
                  </ion-label>
                  <ion-label slot="end">{{ postalAddress.latitude }}</ion-label>
                </ion-item>
                <ion-item lines="full">
                  <ion-label>
                    <p>{{ translate("Longitude") }}</p>
                  </ion-label>
                  <ion-label slot="end">{{ postalAddress.longitude }}</ion-label>
                </ion-item>
                <div class="actions">
                  <ion-button fill="clear" :disabled="!postalAddress.address1" @click="openGeoPointModal">{{ translate("Edit") }}</ion-button>
                  <ion-button slot="end" fill="clear" color="medium" @click="openLatLongPopover">
                    <ion-icon slot="icon-only" :icon="ellipsisVerticalOutline" />
                  </ion-button>
                </div>
              </template>
              <ion-button v-else expand="block" fill="outline" :disabled="!postalAddress.address1" @click="openGeoPointModal">
                {{ translate("Add") }}
                <ion-icon slot="end" :icon="addCircleOutline" />
              </ion-button>
            </ion-card>
          </div>

          <ion-card v-if="!facilityCalendar?.calendarId">
            <ion-card-header>
              <ion-card-title>
                {{ translate("Operating hours") }}
              </ion-card-title>
            </ion-card-header>
            <ion-item lines="none">
              <ion-label>
                <p class="overline">{{ translate("Selected TimeZone") }}</p>
                {{ current?.facilityTimeZone || '-' }}
                <p v-if="current?.facilityTimeZone">{{ getCurrentTime(current?.facilityTimeZone) }}</p>
              </ion-label>
              <ion-button slot="end" fill="outline" color="dark" @click="openTimeZoneModal">{{ translate(current?.facilityTimeZone ? "Change" : "Add") }}</ion-button>
            </ion-item>
            <ion-card-content>
              {{ translate("Select a saved calendar of store hours or create a new calendar") }}
            </ion-card-content>
            <ion-radio-group v-model="selectedCalendarId">
              <ion-item v-for="(calendar, index) in calendars.slice(0, 3)" :key="index" lines="none">
                <ion-radio :value="calendar.calendarId">
                  <div class="ion-text-wrap">{{ calendar.description ? calendar.description : calendar.calendarId }}</div>
                </ion-radio>
              </ion-item>
            </ion-radio-group>
            <ion-item button lines="none" v-if="calendars?.length > 3" @click="addOperatingHours">
              <ion-label>{{ calendars.length - 3 }} {{ translate("Others") }}</ion-label>
              <ion-icon slot="end" :icon="chevronForwardOutline" />
            </ion-item>
            <ion-item button lines="none" @click="addCustomSchedule">
              <ion-label>{{ translate("Custom schedule") }}</ion-label>
              <ion-icon slot="end" color="primary" :icon="addCircleOutline" />
            </ion-item>
            <ion-button fill="outline" expand="block" :disabled="!selectedCalendarId" @click="associateCalendarToFacility">
              {{ translate("Add operating hours") }}
              <ion-icon slot="end" :icon="addCircleOutline" />
            </ion-button>
          </ion-card>

          <ion-card v-else>
            <ion-card-header>
              <div>
                <p class="overline">{{ translate("Operating hours") }}</p>
                <ion-card-title>{{ facilityCalendar.description || facilityCalendar.calendarId }}</ion-card-title>
              </div>
              <ion-button color="medium" fill="clear" class="ion-no-padding" @click="openOperatingHoursPopover($event)">
                <ion-icon slot="icon-only" :icon="ellipsisVerticalOutline" />
              </ion-button>
            </ion-card-header>
            <ion-item lines="none">
              <ion-label>
                <p class="overline">{{ translate("Selected TimeZone") }}</p>
                {{ current?.facilityTimeZone || '-' }}
                <p v-if="current?.facilityTimeZone">{{ getCurrentTime(current?.facilityTimeZone) }}</p>
              </ion-label>
              <ion-button slot="end" fill="outline" color="dark" @click="openTimeZoneModal">{{ translate(current?.facilityTimeZone ? "Change" : "Add") }}</ion-button>
            </ion-item>
            <ion-list lines="none">
              <ion-item v-for="day in days" :key="day">
                <ion-label>
                  <p>{{ translate(day.charAt(0).toUpperCase() + day.slice(1)) }}</p>
                </ion-label>
                <ion-label slot="end">
                  <p>{{ facilityCalendar[day+'StartTime'] ? getOpenEndTime(facilityCalendar[day+'StartTime'], facilityCalendar[day+'Capacity']) : translate('Closed') }}</p>
                </ion-label>
              </ion-item>
            </ion-list>
          </ion-card>

          <div>
            <ion-card>
              <ion-card-header>
                <ion-card-title>
                  {{ translate("Product Stores") }}
                </ion-card-title>
                <ion-button v-if="facilityProductStores?.length" @click="selectProductStores" fill="clear">
                  <ion-icon :icon="addCircleOutline" slot="end" />
                  {{ translate("Add") }}
                </ion-button>
              </ion-card-header>
              <ion-item v-for="store in facilityProductStores" :key="store.productStoreId">
                <ion-label>{{ store.storeName || store.productStoreId }}</ion-label>
                <ion-button slot="end" fill="clear" color="medium" @click="productStorePopover($event, store)">
                  <ion-icon slot="icon-only" :icon="ellipsisVerticalOutline" />
                </ion-button>
              </ion-item>
              <ion-button v-if="!facilityProductStores?.length" expand="block" fill="outline" @click="selectProductStores">
                {{ translate("Add") }}
                <ion-icon slot="end" :icon="addCircleOutline" />
              </ion-button>
            </ion-card>

            <ion-card>
              <ion-card-header>
                <ion-card-title>
                  {{ translate('Map Link') }}
                </ion-card-title>
              </ion-card-header>
              <template v-if="contactDetails?.googleMapUrl?.infoString">
                <ion-item lines="full">
                  <ion-label>{{ contactDetails.googleMapUrl.infoString }}</ion-label>
                </ion-item>
                <div class="actions">
                  <ion-button fill="clear" @click="editMapUrl">{{ translate('Edit') }}</ion-button>
                  <ion-button fill="clear" :href="contactDetails.googleMapUrl.infoString" target="_blank">
                    {{ translate('Preview') }}
                    <ion-icon slot="end" :icon="openOutline" />
                  </ion-button>
                  <ion-button fill="clear" color="danger" @click="deleteMapUrl">{{ translate('Remove') }}</ion-button>
                </div>
              </template>
              <ion-button v-else fill="clear" @click="editMapUrl">
                {{ translate('Add') }}
              </ion-button>
            </ion-card>
          </div>
        </section>

        <section>
          <ion-card>
            <ion-card-header>
              <ion-card-title>
                {{ translate("Fulfillment Settings") }}
              </ion-card-title>
            </ion-card-header>
            <ion-item>
              <ion-toggle :checked="current.allowPickup" @click.prevent="updateFulfillmentSetting($event, 'PICKUP')">{{ translate("Allow pickup") }}</ion-toggle>
            </ion-item>
            <ion-item>
              <ion-toggle :checked="current.useOMSFulfillment" @click.prevent="updateFulfillmentSetting($event, 'OMS_FULFILLMENT')">{{ translate("Uses native fulfillment app") }}</ion-toggle>
            </ion-item>
            <ion-item>
              <ion-toggle :checked="current.generateShippingLabel" @click.prevent="updateFulfillmentSetting($event, 'AUTO_SHIPPING_LABEL')">{{ translate("Generate shipping labels") }}</ion-toggle>
            </ion-item>
            <ion-item lines="full">
              <ion-input :label="translate('Days to ship')" v-model="defaultDaysToShip" type="number" min="0" :placeholder="translate('days to ship')"/>
            </ion-item>
            <ion-button fill="outline" expand="block" @click="updateDefaultDaysToShip">
              {{ translate("Update days to ship") }}
            </ion-button>
          </ion-card>

          <ion-card>
            <ion-card-header>
              <ion-card-title>
                {{ translate("Sell inventory online") }}
              </ion-card-title>
              <ion-button v-if="associatedInventoryGroups.length" @click="openCreateInventoryGroupModal()" fill="clear">
                <ion-icon :icon="addCircleOutline" slot="end" />
                {{ translate("Add") }}
              </ion-button>
            </ion-card-header>
            <ion-card-content>
              {{ inventoryGroups?.length ? translate("Select which channels this facility publishes inventory too.") : translate("There are no inventory channels setup yet") }}
            </ion-card-content>
            <ion-item v-for="group in associatedInventoryGroups" :key="group.facilityGroupId">
              <ion-toggle :checked="group.isChecked" @click.prevent="updateSellInventoryOnlineSetting($event, group)">{{ group?.facilityGroupName }}</ion-toggle>
            </ion-item>
            <ion-button v-if="!associatedInventoryGroups.length" expand="block" fill="outline" @click="openCreateInventoryGroupModal()">
              {{ translate("Add") }}
              <ion-icon slot="end" :icon="addCircleOutline" />
            </ion-button>
          </ion-card>

          <ion-card>
            <ion-card-header>
              <ion-card-title>
                {{ translate("Online Order Fulfillment") }}
              </ion-card-title>
            </ion-card-header>
            <ion-card-content>
              {{ translate("Configure the order fulfillment capacity of your facility.") }}
              <br/><br/>
              {{ translate("Setting fulfillment capacity to 0 disables new order from being allocated to this facility. Leave this empty if this facility's fulfillment capacity is unrestricted.") }}
            </ion-card-content>
            <ion-item lines="none" v-if="current.orderLimitType === 'custom'">
              <ion-text>{{ current.orderCount }}</ion-text>
              <ion-progress-bar class="ion-margin" :value="current.orderCount / (current.maximumOrderLimit || 1)" />
              <ion-chip outline @click="changeOrderLimitPopover($event)">{{ current.maximumOrderLimit }}</ion-chip>
            </ion-item>
            <ion-item lines="none" v-else-if="current.orderLimitType === 'unlimited'">
              <ion-label>{{ translate("orders allocated today", { orderCount: current.orderCount }) }}</ion-label>
              <ion-chip outline @click="changeOrderLimitPopover($event)">{{ translate("Unlimited") }}</ion-chip>
            </ion-item>
            <ion-item lines="none" v-else>
              <ion-label>{{ translate("orders in fulfillment queue", { orderCount: current.orderCount }) }}</ion-label>
              <ion-chip outline @click="changeOrderLimitPopover($event)" color="danger" fill="outline">{{ current.maximumOrderLimit }}</ion-chip>
            </ion-item>
            <ion-item lines="none" detail button @click="openFacilityOrderCountModal">
              <ion-label>{{ translate("View order count history") }}</ion-label>
            </ion-item>
          </ion-card>

          <ion-card>
            <ion-card-header>
              <ion-card-title>
                {{ facilityTypesById[current.facilityTypeId]?.description ? translate(`${facilityTypesById[current.facilityTypeId]?.description} logins`) : translate('logins', { facilitytype: `${current.facilityTypeId}` }) }}
              </ion-card-title>
            </ion-card-header>
            <ion-item v-for="facilityLogin in facilityLogins" :key="facilityLogin.partyId">
              <ion-avatar slot="start">
                <Image :src="getImageUrl(facilityLogin.objectInfo)"/>
              </ion-avatar>
              <ion-label>
                {{ facilityLogin.fullName }}
                <p>{{ facilityLogin.partyId }}</p>
              </ion-label>
              <ion-button slot="end" fill="clear" size="default" color="medium" @click="openFacilityLoginActionPopover($event, facilityLogin)">
                <ion-icon slot="icon-only" :icon="ellipsisVerticalOutline" />
              </ion-button>
            </ion-item>
          </ion-card>
        </section>

        <ion-segment scrollable v-model="segment">
          <ion-segment-button value="external-mappings" layout="icon-start">
            <ion-icon :icon="globeOutline" />
            <ion-label>{{ translate("External mappings") }}</ion-label>
          </ion-segment-button>
          <ion-segment-button value="staff" layout="icon-start">
            <ion-icon :icon="personOutline" />
            <ion-label>{{ translate("Staff") }}</ion-label>
          </ion-segment-button>
          <ion-segment-button value="locations" layout="icon-start">
            <ion-icon :icon="locationOutline" />
            <ion-label>{{ translate("Locations") }}</ion-label>
          </ion-segment-button>
          <ion-segment-button value="groups" layout="icon-start">
            <ion-icon :icon="albumsOutline" />
            <ion-label>{{ translate("Groups") }}</ion-label>
          </ion-segment-button>
        </ion-segment>

        <template v-if="segment === 'external-mappings'">
          <ion-button fill="outline" @click="openFacilityMappingPopover($event)">
            <ion-icon :icon="addCircleOutline" slot="start" />
            {{ translate("Map facility to an external system") }}
          </ion-button>
          <div class="external-mappings">
            <ion-card v-for="(shopifyFacilityMapping, index) in current.shopifyFacilityMappings" :key="'shopify-' + index">
              <ion-card-header>
                <ion-card-title>
                  {{ translate("Shopify facility") }}
                </ion-card-title>
              </ion-card-header>
              <ion-item lines="full">
                <ion-label>
                  {{ shopifyFacilityMapping.name }}
                  <p>{{ shopifyFacilityMapping.shopId }}</p>
                </ion-label>
              </ion-item>
              <ion-item lines="full">
                <ion-label>{{ shopifyFacilityMapping.shopifyLocationId }}</ion-label>
              </ion-item>
              <ion-button fill="clear" @click="editShopifyFacilityMapping(shopifyFacilityMapping)">{{ translate("Edit") }}</ion-button>
              <ion-button fill="clear" color="danger" @click="removeShopifyFacilityMapping(shopifyFacilityMapping)">{{ translate("Remove") }}</ion-button>
            </ion-card>
            <ion-card v-for="(mapping, index) in current.identifications" :key="'mapping-' + index">
              <ion-card-header>
                <ion-card-title>
                  {{ externalMappingTypes[mapping.facilityIdenTypeId] || mapping.facilityIdenTypeId }}
                </ion-card-title>
                <ion-button fill="clear" @click="copyToClipboard(mapping.idValue)">
                  <ion-icon slot="icon-only" :icon="copyOutline" />
                </ion-button>
              </ion-card-header>
              <ion-item lines="full">
                <ion-label>{{ translate('Identification') }}</ion-label>
                <ion-label slot="end">{{ mapping.idValue }}</ion-label>
              </ion-item>
              <ion-button fill="clear" @click="editFacilityMapping(mapping)">{{ translate("Edit") }}</ion-button>
              <ion-button fill="clear" color="danger" @click="removeFacilityMapping(mapping)">{{ translate("Remove") }}</ion-button>
            </ion-card>
            <ion-card v-if="current.externalId">
              <ion-card-header>
                <ion-card-title>
                  {{ translate('Facility External ID') }}
                </ion-card-title>
                <ion-button fill="clear" @click="copyToClipboard(current.externalId)">
                  <ion-icon slot="icon-only" :icon="copyOutline" />
                </ion-button>
              </ion-card-header>
              <ion-item lines="full">
                <ion-label>{{ translate('Identification') }}</ion-label>
                <ion-label slot="end">{{ current.externalId }}</ion-label>
              </ion-item>
              <ion-button fill="clear" @click="editFacilityExternalId()">{{ translate("Edit") }}</ion-button>
              <ion-button fill="clear" color="danger" @click="removeFacilityExternalID()">{{ translate("Remove") }}</ion-button>
            </ion-card>
          </div>
        </template>

        <template v-else-if="segment === 'staff'">
          <ion-button fill="outline" @click="addStaffMemberModal()">
            <ion-icon :icon="addCircleOutline" slot="start" />
            {{ translate("Staff member") }}
          </ion-button>

          <div v-for="(party, index) in staffParties" class="list-item staff" :key="index">
            <ion-item lines="none">
              <ion-icon :icon="personOutline" slot="start" />
              <ion-label>
                {{ party.fullName }}
                <p>{{ party.partyId }}</p>
              </ion-label>
            </ion-item>

            <ion-label class="tablet">
              <ion-chip outline>{{ partyRoles[party.roleTypeId] ? partyRoles[party.roleTypeId] : party.roleTypeId }}</ion-chip>
              <p>{{ translate("role") }}</p>
            </ion-label>

            <ion-label class="tablet">
              <ion-chip outline>{{ getDate(party.fromDate) }}</ion-chip>
              <p>{{ translate("added") }}</p>
            </ion-label>

            <ion-button @click="removePartyFromFacility(party)" fill="clear" color="medium">
              <ion-icon slot="icon-only" :icon="closeCircleOutline" />
            </ion-button>
          </div>
        </template>

        <template v-else-if="segment == 'locations'">
          <ion-button fill="outline" @click="addLocationModal()">
            <ion-icon :icon="addCircleOutline" slot="start" />
            {{ translate("Internal locations") }}
          </ion-button>

          <div class="list-item" v-for="location in current.locations" :key="location.locationSeqId">
            <ion-item lines="none">
              <ion-icon :icon="locationOutline" slot="start" />
              <ion-label>
                {{ location.locationSeqId }}
                <p>{{ locationTypes[location.locationTypeEnumId] }}</p>
              </ion-label>
            </ion-item>

            <ion-label class="tablet">
              {{ location.areaId }}
              <p>{{ translate("area") }}</p>
            </ion-label>

            <ion-label>
              {{ location.aisleId }}
              <p>{{ translate("aisle") }}</p>
            </ion-label>

            <ion-label>
              {{ location.sectionId }}
              <p>{{ translate("section") }}</p>
            </ion-label>

            <ion-label class="tablet">
              {{ location.levelId }}
              <p>{{ translate("level") }}</p>
            </ion-label>

            <ion-label>
              {{ location.positionId ? location.positionId : '-' }}
              <p>{{ translate("sequence") }}</p>
            </ion-label>

            <ion-button fill="clear" color="medium" @click="openLocationDetailsPopover($event, location)">
              <ion-icon slot="icon-only" :icon="ellipsisVerticalOutline" />
            </ion-button>
          </div>
        </template>

        <template v-else-if="segment == 'groups'">
          <ion-button fill="outline" @click="addFacilityGroupModal()">
            <ion-icon :icon="addCircleOutline" slot="start" />
            {{ translate("Link to groups") }}
          </ion-button>

          <div class="external-mappings">
            <ion-card v-for="(group, index) in current.groupInformation" :key="index">
              <p v-if="getFacilityGroupTypeDesc(group.facilityGroupTypeId)" class="ion-margin-start overline">{{ getFacilityGroupTypeDesc(group.facilityGroupTypeId) }}</p>
              <ion-card-header>
                <div>
                  <ion-card-title>{{ group.facilityGroupName }}</ion-card-title>
                  <ion-card-subtitle>{{ group.facilityGroupId }}</ion-card-subtitle>
                </div>
                <ion-button fill="clear" @click="removeFacilityFromGroup(group.facilityGroupId)">
                  <ion-icon slot="icon-only" :icon="unlinkOutline" />
                </ion-button>
              </ion-card-header>
              <ion-item v-if="group.description" lines="none">
                <ion-label class="ion-text-wrap">{{ group.description }}</ion-label>
              </ion-item>
            </ion-card>
          </div>
        </template>
      </main>
      <main v-else class="ion-text-center ion-padding-top">
        {{ translate("Failed to fetch facility information") }}
      </main>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  alertController,
  IonBackButton,
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonChip,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonInput,
  IonLabel,
  IonList,
  IonPage,
  IonProgressBar,
  IonRadio,
  IonRadioGroup,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonSkeletonText,
  IonText,
  IonTitle,
  IonToggle,
  IonToolbar,
  modalController,
  onIonViewWillEnter,
  popoverController
} from '@ionic/vue'
import {
  addCircleOutline,
  albumsOutline,
  bookmarkOutline,
  bookmarksOutline,
  chevronForwardOutline,
  closeCircleOutline,
  copyOutline,
  ellipsisVerticalOutline,
  globeOutline,
  locationOutline,
  lockClosedOutline,
  openOutline,
  personOutline,
  unlinkOutline
} from 'ionicons/icons'
import { ref, computed } from 'vue';
import { commonUtil, emitter, logger, translate } from "@common";
import { DateTime } from 'luxon';
import { useFacilityStore } from '@/store/facility';
import { useUtilStore } from '@/store/util';
import { useProductStore } from '@/store/productStore';
import FacilityAddressModal from '@/components/FacilityAddressModal.vue';
import GeoPointPopover from '@/components/GeoPointPopover.vue';
import SelectProductStoreModal from '@/components/SelectProductStoreModal.vue';
import ProductStorePopover from '@/components/ProductStorePopover.vue';
import FacilityGeoPointModal from '@/components/FacilityGeoPointModal.vue';
import FacilityTimeZoneSwitcher from '@/components/FacilityTimeZoneSwitcher.vue';
import CustomScheduleModal from '@/components/CustomScheduleModal.vue';
import AddOperatingHoursModal from '@/components/AddOperatingHoursModal.vue';
import OperatingHoursPopover from '@/components/OperatingHoursPopover.vue';
import OrderLimitPopover from '@/components/OrderLimitPopover.vue';
import ViewFacilityOrderCountModal from '@/components/ViewFacilityOrderCountModal.vue';
import FacilityLoginActionPopover from '@/components/FacilityLoginActionPopover.vue';
import Image from '@/components/Image.vue';
import CreateFacilityGroupModal from '@/components/CreateFacilityGroupModal.vue';
import AddStaffMemberModal from '@/components/AddStaffMemberModal.vue';
import AddLocationModal from '@/components/AddLocationModal.vue';
import LocationDetailsPopover from '@/components/LocationDetailsPopover.vue';
import AddFacilityGroupModal from '@/components/AddFacilityGroupModal.vue';
import FacilityMappingModal from '@/components/FacilityMappingModal.vue';
import FacilityShopifyMappingModal from '@/components/FacilityShopifyMappingModal.vue';
import FacilityExternalIdModal from '@/components/FacilityExternalIdModal.vue';
import FacilityMappingPopover from '@/components/FacilityMappingPopover.vue';

const props = defineProps<{ facilityId: string }>();
const facilityStore = useFacilityStore();
const utilStore = useUtilStore();
const productStoreStore = useProductStore();

const isLoading = ref(true);
const segment = ref('external-mappings');
const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const current = computed(() => facilityStore.getCurrent);
const postalAddress = computed(() => current.value.postalAddress || {});
const contactDetails = computed(() => current.value.contactDetails || {});
const facilityCalendar = computed(() => current.value.calendar || {});
const facilityProductStores = computed(() => current.value.productStores || []);
const facilityParties = computed(() => current.value.parties || []);
const facilityLogins = computed(() => facilityParties.value.filter((p: any) => p.roleTypeId === 'FAC_LOGIN'));
const staffParties = computed(() => facilityParties.value.filter((p: any) => p.roleTypeId !== 'FAC_LOGIN'));
const calendars = computed(() => facilityStore.getCalendars);
const externalMappingTypes = computed(() => facilityStore.getExternalMappingTypes);
const locationTypes = computed(() => facilityStore.getLocationTypes);
const partyRoles = computed(() => facilityStore.getPartyRoles);
const facilityGroupTypes = computed(() => facilityStore.getFacilityGroupTypes);
const inventoryGroups = computed(() => utilStore.getInventoryGroups);
const facilityTypesById = computed(() => facilityStore.getFacilityTypes.reduce((acc: any, type: any) => {
  acc[type.facilityTypeId] = type;
  return acc;
}, {}));
const parentFacilityTypeId = ref('');
const facilityTypeId = ref('');
const facilityTypeIdOptions = ref({} as any);
const initialParentFacilityTypeId = ref('');

const associatedInventoryGroups = computed(() => inventoryGroups.value.map((group: any) => ({
  ...group,
  isChecked: current.value.groupInformation?.some((facilityGroup: any) => facilityGroup?.facilityGroupId === group.facilityGroupId)
})));

const isRegenerationRequired = ref(false);
const selectedCalendarId = ref('');
const defaultDaysToShip = ref<number | undefined>();
const baseUrl = computed(() => commonUtil.getOmsURL());

function getImageUrl(imageUrl: string) {
  return (baseUrl.value.startsWith('http') ? baseUrl.value.replace(/api\/?/, "") : `https://${baseUrl.value}.hotwax.io/`) + imageUrl;
}

onIonViewWillEnter(async () => {
  isLoading.value = true;
  await Promise.all([
    facilityStore.fetchFacilityGroupTypes(),
    utilStore.fetchFacilityGroups(),
    (facilityStore as any).fetchPartyRoles()
  ]);
  await Promise.all([
    facilityStore.fetchCurrentFacility({ facilityId: props.facilityId }),
    facilityStore.fetchExternalMappingTypes(),
    facilityStore.fetchLocationTypes(),
    facilityStore.fetchFacilityTypes()
  ]);

  await Promise.all([
    facilityStore.fetchFacilityLocations({ facilityId: props.facilityId }),
    facilityStore.fetchFacilityParties({ facilityId: props.facilityId }),
    facilityStore.fetchFacilityIdentifications({ facilityId: props.facilityId }),
    facilityStore.fetchShopifyFacilityMappings({ facilityId: props.facilityId }),
    facilityStore.fetchCurrentFacilityProductStores({ facilityId: props.facilityId }),
    productStoreStore.fetchProductStores(),
    facilityStore.fetchFacilityContactDetailsAndTelecom({ facilityId: props.facilityId }),
    facilityStore.fetchCalendars(),
    facilityStore.fetchFacilityCalendar({ facilityId: props.facilityId }),
    facilityStore.fetchCurrentFacilityGroups({ facilityId: props.facilityId })
  ]);

  parentFacilityTypeId.value = facilityStore.getParentFacilityTypeId(current.value.facilityTypeId);
  initialParentFacilityTypeId.value = parentFacilityTypeId.value;
  facilityTypeId.value = current.value.facilityTypeId;
  getFacilityTypesByParentTypeId();
  console.log('=-=-=-=-=-=-=-=-=-=- current.value.defaultDaysToShip', current.value.defaultDaysToShip)
  defaultDaysToShip.value = current.value.defaultDaysToShip;  isLoading.value = false;
});

function getFacilityTypesByParentTypeId() {
  facilityTypeIdOptions.value = parentFacilityTypeId.value ? Object.keys(facilityTypesById.value).reduce((acc: any, fId: string) => {
    if (facilityTypesById.value[fId].parentTypeId === parentFacilityTypeId.value) {
      acc[fId] = facilityTypesById.value[fId];
    }
    return acc;
  }, {}) : facilityTypesById.value;

  // Stops this flow from auto-selecting/persisting a subtype on initial load, only react to an actual
  // user-driven change of the parent type select.
  if (initialParentFacilityTypeId.value === parentFacilityTypeId.value) {
    return;
  }

  // RETAIL_STORE and WAREHOUSE are treated as default elements within the list, wherever they appear.
  facilityTypeId.value = facilityTypeIdOptions.value['RETAIL_STORE'] ? 'RETAIL_STORE' : facilityTypeIdOptions.value['WAREHOUSE'] ? 'WAREHOUSE' : Object.keys(facilityTypeIdOptions.value)[0];
  updateFacilityType();
}

async function renameFacility() {
  await alertController.create({
    header: translate('Rename Facility'),
    inputs: [
      {
        name: 'facilityName',
        type: 'text',
        value: current.value.facilityName,
        placeholder: translate('Enter new facility name')
      }
    ],
    buttons: [
      {
        text: translate('Cancel'),
        role: 'cancel'
      },
      {
        text: translate('Save'),
        handler: async (data) => {
          if (data.facilityName && data.facilityName !== current.value.facilityName) {
            try {
              await facilityStore.updateFacility({
                facilityId: props.facilityId,
                facilityName: data.facilityName
              });

              commonUtil.showToast(translate("Facility name updated"));
              facilityStore.updateCurrentFacility({ ...current.value, facilityName: data.facilityName });
            } catch (error) {
              commonUtil.showToast(translate('Failed to update facility name.'));
              logger.error('Failed to update facility name.', error);
            }
          }
        }
      }
    ]
  }).then(alert => alert.present());
}

async function updateFacilityType() {
  try {
    const resp = await facilityStore.updateFacility({
      facilityId: props.facilityId,
      facilityTypeId: facilityTypeId.value
    });

    if (!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate("Facility type updated"));
      facilityStore.updateCurrentFacility({ ...current.value, facilityTypeId: facilityTypeId.value });
    } else {
      throw resp.data;
    }
  } catch (error) {
    parentFacilityTypeId.value = facilityStore.getParentFacilityTypeId(current.value.facilityTypeId);
    facilityTypeId.value = current.value.facilityTypeId;
    commonUtil.showToast(translate('Failed to update facility type.'));
    logger.error('Failed to update facility type.', error);
  }
}

async function closeFacility(event: any) {
  event.stopImmediatePropagation();
  emitter.emit("presentLoader");
  const isChecked = !event.target.checked;

  let closedDate = isChecked ? DateTime.now().toMillis() : ""

  try {
    await facilityStore.updateFacility({
      "facilityId": current.value.facilityId,
      "closedDate": closedDate
    })
    commonUtil.showToast(translate('Facility has been marked as ', { status: isChecked ? 'closed' : 'open' }))
    await facilityStore.updateCurrentFacility({ ...current.value, closedDate })
  } catch(err) {
    commonUtil.showToast(translate('Failed to update facility.'))
    logger.error('Failed to update facility.', err)
  }
  emitter.emit("dismissLoader");
}

async function editMapUrl() {
  const alert = await alertController.create({
    header: translate("Map Link"),
    inputs: [{
      name: 'mapUrl',
      type: 'url',
      placeholder: translate("Enter new Map Url"),
      value: contactDetails.value?.googleMapUrl?.infoString || ""
    }],
    buttons: [
      { text: translate('Cancel'), role: 'cancel' },
      {
        text: translate('Save'),
        handler: async (data) => {
          let isValidUrl = true;
          try { new URL(data.mapUrl); } catch (_) { isValidUrl = false; }

          if (!isValidUrl) {
            commonUtil.showToast(translate("Please enter a valid URL"));
            return false;
          }

          try {
            const payload = { facilityId: props.facilityId, infoString: data.mapUrl.trim() };
            let resp;
            if (contactDetails.value?.googleMapUrl?.contactMechId) {
              if (data.mapUrl && data.mapUrl !== contactDetails.value.googleMapUrl.infoString) {
                resp = await facilityStore.updateFacilityContactMech({
                  ...payload,
                  contactMechId: contactDetails.value.googleMapUrl.contactMechId,
                  contactMechTypeId: "MAP_URL"
                });
              } else {
                return;
              }
            } else {
              resp = await facilityStore.createFacilityContactMech({
                ...payload,
                contactMechTypeId: "MAP_URL",
                contactMechPurposeTypeId: "GOOGLE_MAP_URL"
              });
            }

            if (!commonUtil.hasError(resp)) {
              commonUtil.showToast(translate("Map URL updated successfully"));
              await facilityStore.fetchFacilityContactDetailsAndTelecom({ facilityId: props.facilityId });
            } else {
              throw resp.data;
            }
          } catch (err) {
            logger.error("Failed to update Map URL", err);
            commonUtil.showToast(translate("Failed to update Map URL"));
          }
        }
      }
    ]
  });
  await alert.present();
}

async function deleteMapUrl() {
  try {
    const resp = await facilityStore.deleteFacilityContactMech({
      facilityId: props.facilityId,
      contactMechId: contactDetails.value?.googleMapUrl?.contactMechId
    });
    if (!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate('Map URL removed successfully.'));
      await facilityStore.fetchFacilityContactDetailsAndTelecom({ facilityId: props.facilityId });
    } else {
      throw resp.data;
    }
  } catch (err) {
    logger.error('Failed to remove map url.', err);
    commonUtil.showToast(translate('Failed to remove map url.'));
  }
}

async function selectProductStores() {
  const modal = await modalController.create({
    component: SelectProductStoreModal,
    componentProps: { selectedProductStores: facilityProductStores.value }
  });

  modal.onDidDismiss().then(async (result: any) => {
    if (result.data?.value) {
      emitter.emit('presentLoader');

      const { productStoresToCreate, productStoresToRemove } = result.data.value;

      const removePromises = productStoresToRemove.map((payload: any) =>
        facilityStore.updateProductStoreFacility({
          facilityId: props.facilityId,
          productStoreId: payload.productStoreId,
          fromDate: facilityProductStores.value.find((s: any) => s.productStoreId === payload.productStoreId)?.fromDate,
          thruDate: DateTime.now().toMillis()
        })
      );

      const createPromises = productStoresToCreate.map((payload: any) =>
        facilityStore.createProductStoreFacility({
          productStoreId: payload.productStoreId,
          facilityId: props.facilityId,
          fromDate: DateTime.now().toMillis()
        })
      );

      const responses = await Promise.allSettled([...removePromises, ...createPromises]);
      if (responses.some((r: any) => r.status === 'rejected')) {
        commonUtil.showToast(translate('Failed to update some product stores'));
      } else {
        commonUtil.showToast(translate('Product stores updated successfully.'));
      }

      await facilityStore.fetchCurrentFacilityProductStores({ facilityId: props.facilityId });
      emitter.emit('dismissLoader');
    }
  });

  modal.present();
}

async function productStorePopover(ev: Event, store: any) {
  const popover = await popoverController.create({
    component: ProductStorePopover,
    componentProps: { currentProductStore: store, facilityId: props.facilityId },
    event: ev,
    showBackdrop: false
  });
  return popover.present();
}

async function openGeoPointModal() {
  const modal = await modalController.create({
    component: FacilityGeoPointModal,
    componentProps: { facilityId: props.facilityId }
  });

  modal.onDidDismiss().then(async (result) => {
    if (result.data?.geoPoints) {
      await fetchPostalCodeByGeoPoints();
    }
  });

  modal.present();
}

async function openAddressModal() {
  const modal = await modalController.create({
    component: FacilityAddressModal,
    componentProps: { facilityId: props.facilityId, facilityName: current.value.facilityName }
  });

  modal.onDidDismiss().then(async (result) => {
    if (result.data?.postalAddress) {
      await fetchPostalCodeByGeoPoints();
    }
  });

  modal.present().then(() => {
    const el = document.querySelector("#inputElement") as any;
    if (el) el.setFocus();
  });
}

async function fetchPostalCodeByGeoPoints() {
  const payload = {
    json: {
      "query": "*:*",
      "filter": "{!geofilt sfield=location}",
      "params": {
        "pt": `${postalAddress.value.latitude}, ${postalAddress.value.longitude}`,
        "d": "10"
      },
      sort: 'geodist(location, ' + postalAddress.value.latitude + ',' + postalAddress.value.longitude + ') asc',
      "limit": 1
    }
  };

  try {
    const resp = await utilStore.generateLatLong(payload);
    const pCode = postalAddress.value.postalCode;
    const fetchedPostcode = resp.response.docs[0].postcode;
    isRegenerationRequired.value = !(pCode.startsWith('0') ? pCode.substring(1) === fetchedPostcode || pCode === fetchedPostcode : pCode === fetchedPostcode);
  } catch (err) {
    logger.error(err);
  }
}

async function openLatLongPopover(event: Event) {
  const popover = await popoverController.create({
    component: GeoPointPopover,
    componentProps: { facilityId: props.facilityId, isRegenerationRequired: isRegenerationRequired.value },
    event,
    showBackdrop: false
  });

  popover.onDidDismiss().then((result) => {
    if (result?.data?.generatedLatLong) {
      isRegenerationRequired.value = false;
    }
  });

  return popover.present();
}

async function openTimeZoneModal() {
  const modal = await modalController.create({
    component: FacilityTimeZoneSwitcher
  });
  return modal.present();
}

async function associateCalendarToFacility() {
  emitter.emit('presentLoader');
  try {
    const resp = await facilityStore.associateCalendarToFacility({
      facilityId: props.facilityId,
      calendarId: selectedCalendarId.value,
      fromDate: DateTime.now().toMillis(),
      facilityCalendarTypeId: 'OPERATING_HOURS'
    });
    if (!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate("Successfully associated calendar to the facility."));
      await facilityStore.fetchFacilityCalendar({ facilityId: props.facilityId });
    } else {
      throw resp.data;
    }
  } catch (err) {
    commonUtil.showToast(translate("Failed to associate calendar to the facility."));
    logger.error(err);
  }
  emitter.emit('dismissLoader');
}

async function addCustomSchedule() {
  const modal = await modalController.create({
    component: CustomScheduleModal,
    componentProps: { facilityId: props.facilityId }
  });
  return modal.present();
}

async function addOperatingHours() {
  const modal = await modalController.create({
    component: AddOperatingHoursModal,
    componentProps: { facilityId: props.facilityId }
  });
  return modal.present();
}

async function openOperatingHoursPopover(event: Event) {
  const popover = await popoverController.create({
    component: OperatingHoursPopover,
    componentProps: { facilityId: props.facilityId },
    event,
    showBackdrop: false
  });
  return popover.present();
}

async function openFacilityLoginActionPopover(ev: Event, facilityLogin: any) {
  const popover = await popoverController.create({
    component: FacilityLoginActionPopover,
    componentProps: { currentFacility: current.value, currentFacilityUser: facilityLogin, facilityTypeDesc: facilityTypesById.value[current.value.facilityTypeId]?.description },
    event: ev,
    showBackdrop: false
  });
  return popover.present();
}

async function changeOrderLimitPopover(ev: Event) {
  const popover = await popoverController.create({
    component: OrderLimitPopover,
    event: ev,
    showBackdrop: false,
    componentProps: { fulfillmentOrderLimit: current.value.maximumOrderLimit }
  });
  popover.present();

  const result = await popover.onDidDismiss();
  if (result.data !== undefined && result.data !== current.value.maximumOrderLimit) {
    emitter.emit('presentLoader');
    try {
      const resp = await facilityStore.updateFacility({
        facilityId: current.value.facilityId,
        maximumOrderLimit: result.data === "" ? null : result.data
      });
      if (!commonUtil.hasError(resp)) {
        const newLimit = result.data === "" ? null : result.data;
        const orderLimitType = newLimit === 0 ? 'no-capacity' : (newLimit ? 'custom' : 'unlimited');
        facilityStore.updateCurrentFacility({ ...current.value, maximumOrderLimit: newLimit, orderLimitType });
        commonUtil.showToast(translate('Fulfillment capacity updated successfully for ', { facilityName: current.value.facilityName }));
      } else {
        throw resp.data;
      }
    } catch (err) {
      commonUtil.showToast(translate('Failed to update fulfillment capacity for ', { facilityName: current.value.facilityName }));
      logger.error('Failed to update facility', err);
    }
    emitter.emit('dismissLoader');
  }
}

async function openCreateInventoryGroupModal() {
  const modal = await modalController.create({
    component: CreateFacilityGroupModal,
    componentProps: { selectedFacilityGroupTypeId: 'CHANNEL_FAC_GROUP' }
  });

  await modal.present();
  await modal.onDidDismiss();

  await utilStore.fetchFacilityGroups();
  const invGroups = JSON.parse(JSON.stringify(inventoryGroups.value));
  invGroups.forEach((group: any) => {
    group['isChecked'] = current.value.groupInformation?.some((facilityGroup: any) => facilityGroup?.facilityGroupId === group.facilityGroupId);
  });
  facilityStore.updateCurrentFacility({ ...current.value, inventoryGroups: invGroups });
}

async function updateSellInventoryOnlineSetting(event: any, facilityGroup: any) {
  event.stopImmediatePropagation();
  const isChecked = !event.target.checked;
  emitter.emit("presentLoader");
  try {
    let resp;
    if (isChecked) {
      resp = await facilityStore.addFacilityToGroup({
        facilityId: current.value.facilityId,
        facilityGroupId: facilityGroup.facilityGroupId
      });
    } else {
      const groupInfo = current.value.groupInformation.find((g: any) => g.facilityGroupId === facilityGroup.facilityGroupId);
      resp = await facilityStore.updateFacilityToGroup({
        facilityId: current.value.facilityId,
        facilityGroupId: facilityGroup.facilityGroupId,
        fromDate: groupInfo.fromDate,
        thruDate: DateTime.now().toMillis()
      });
    }
    if (!commonUtil.hasError(resp)) {
      commonUtil.showToast(isChecked
        ? translate("is now selling on", { facilityName: current.value.facilityName, facilityGroupId: facilityGroup.facilityGroupName })
        : translate("no longer sells on", { facilityName: current.value.facilityName, facilityGroupId: facilityGroup.facilityGroupName })
      );
      await facilityStore.fetchCurrentFacilityGroups({ facilityId: current.value.facilityId });
    } else {
      throw resp.data;
    }
  } catch (err) {
    commonUtil.showToast(translate("Failed to update sell inventory online setting"));
    logger.error("Failed to update sell inventory online setting", err);
  }
  emitter.emit("dismissLoader");
}

async function openFacilityOrderCountModal() {
  const modal = await modalController.create({
    component: ViewFacilityOrderCountModal,
    componentProps: { facilityId: props.facilityId }
  });
  modal.present();
}

async function updateFulfillmentSetting(event: any, facilityGroupId: string) {
  event.stopImmediatePropagation();
  emitter.emit('presentLoader');
  const isChecked = !event.target.checked;
  try {
    let resp;
    if (isChecked) {
      resp = await facilityStore.addFacilityToGroup({ facilityId: props.facilityId, facilityGroupId });
    } else {
      const groupInformation = current.value.groupInformation.find((group: any) => group.facilityGroupId === facilityGroupId);
      resp = await facilityStore.updateFacilityToGroup({
        facilityId: props.facilityId,
        facilityGroupId,
        fromDate: groupInformation.fromDate,
        thruDate: DateTime.now().toMillis()
      });
    }
    if (!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate('Fulfillment setting updated successfully'));
      await facilityStore.fetchCurrentFacilityGroups({ facilityId: props.facilityId });
    } else {
      throw resp.data;
    }
  } catch (err) {
    commonUtil.showToast(translate('Failed to update fulfillment setting'));
    logger.error('Failed to update fulfillment setting', err);
  }
  emitter.emit('dismissLoader');
}

async function updateDefaultDaysToShip() {
  emitter.emit('presentLoader');
  try {
    const resp = await facilityStore.updateDefaultDaysToShip({ facilityId: props.facilityId, defaultDaysToShip: defaultDaysToShip.value });
    if (!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate('Updated default days to ship'));
    } else {
      throw resp.data;
    }
  } catch (err) {
    logger.error('Failed to update default days to ship', err);
    commonUtil.showToast(translate('Failed to update default days to ship'));
  }
  emitter.emit('dismissLoader');
}

async function openFacilityMappingPopover(ev: Event) {
  const popover = await popoverController.create({
    component: FacilityMappingPopover,
    event: ev,
    showBackdrop: false
  });
  return popover.present();
}

async function editShopifyFacilityMapping(shopifyFacilityMapping: any) {
  const modal = await modalController.create({
    component: FacilityShopifyMappingModal,
    componentProps: { shopifyFacilityMapping, type: 'update' }
  });
  modal.present().then(() => {
    const el = document.querySelector("#inputElement") as any;
    if (el) el.setFocus();
  });
}

async function removeShopifyFacilityMapping(shopifyFacilityMapping: any) {
  try {
    const resp = await facilityStore.deleteShopifyShopLocation({
      facilityId: current.value.facilityId,
      shopId: shopifyFacilityMapping.shopId,
      shopifyLocationId: shopifyFacilityMapping.shopifyLocationId
    });
    if (!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate('Removed shopify mapping successfully'));
      await facilityStore.fetchShopifyFacilityMappings({ facilityId: props.facilityId });
    } else {
      throw resp.data;
    }
  } catch (err) {
    logger.error('Failed to remove shopify mapping', err);
    commonUtil.showToast(translate('Failed to remove shopify mapping'));
  }
}

async function editFacilityMapping(mapping: any) {
  const modal = await modalController.create({
    component: FacilityMappingModal,
    componentProps: { mappingId: mapping.facilityIdenTypeId, mapping, type: 'update' }
  });
  modal.present().then(() => {
    const el = document.querySelector("#inputElement") as any;
    if (el) el.setFocus();
  });
}

async function removeFacilityMapping(mapping: any) {
  emitter.emit('presentLoader');
  try {
    const resp = await facilityStore.updateFacilityIdentification({
      facilityId: current.value.facilityId,
      facilityIdenTypeId: mapping.facilityIdenTypeId,
      fromDate: mapping.fromDate,
      thruDate: DateTime.now().toMillis()
    });
    if (!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate('Removed facility mapping successfully'));
      await facilityStore.fetchFacilityMappings({ facilityId: props.facilityId });
    } else {
      throw resp.data;
    }
  } catch (err) {
    logger.error('Failed to remove facility mapping', err);
    commonUtil.showToast(translate('Failed to remove facility mapping'));
  }
  emitter.emit('dismissLoader');
}

async function editFacilityExternalId() {
  const modal = await modalController.create({ component: FacilityExternalIdModal });
  modal.present().then(() => {
    const el = document.querySelector("#inputElement") as any;
    if (el) el.setFocus();
  });
}

async function removeFacilityExternalID() {
  emitter.emit('presentLoader');
  try {
    const resp = await facilityStore.updateFacility({ facilityId: current.value.facilityId, externalId: '' });
    if (!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate('Removed facility external ID'));
      facilityStore.updateCurrentFacility({ ...current.value, externalId: '' });
    } else {
      throw resp.data;
    }
  } catch (err) {
    logger.error('Failed to remove facility external ID', err);
    commonUtil.showToast(translate('Failed to remove facility external ID'));
  }
  emitter.emit('dismissLoader');
}

async function addStaffMemberModal() {
  const modal = await modalController.create({
    component: AddStaffMemberModal,
    componentProps: { facilityId: props.facilityId, selectedParties: staffParties.value }
  });
  return modal.present();
}

async function removePartyFromFacility(party: any) {
  emitter.emit('presentLoader');
  try {
    const resp = await facilityStore.removePartyFromFacility({
      facilityId: party.facilityId,
      fromDate: party.fromDate,
      thruDate: DateTime.now().toMillis(),
      partyId: party.partyId,
      roleTypeId: party.roleTypeId
    });
    if (!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate("Party was removed from facility.", { partyName: party.fullName, facilityName: current.value.facilityName }));
      await facilityStore.fetchFacilityParties({ facilityId: props.facilityId });
    } else {
      throw resp.data;
    }
  } catch (err) {
    logger.error('Failed to remove party from facility', err);
    commonUtil.showToast(translate('Failed to remove party from facility'));
  }
  emitter.emit('dismissLoader');
}

async function addLocationModal() {
  const modal = await modalController.create({ component: AddLocationModal });
  return modal.present();
}

async function openLocationDetailsPopover(ev: Event, location: any) {
  const popover = await popoverController.create({
    component: LocationDetailsPopover,
    componentProps: { location },
    event: ev,
    showBackdrop: false
  });
  return popover.present();
}

async function addFacilityGroupModal() {
  const modal = await modalController.create({ component: AddFacilityGroupModal });
  await modal.present();
  const result = await modal.onDidDismiss();
  if (result?.data?.fetchGroups) {
    facilityStore.fetchCurrentFacilityGroups({ facilityId: props.facilityId });
  }
}

async function removeFacilityFromGroup(facilityGroupId: string) {
  emitter.emit('presentLoader');
  const groupInformation = current.value.groupInformation.find((group: any) => group.facilityGroupId === facilityGroupId);
  try {
    const resp = await facilityStore.updateFacilityToGroup({
      facilityId: current.value.facilityId,
      facilityGroupId,
      fromDate: groupInformation.fromDate,
      thruDate: DateTime.now().toMillis()
    });
    if (!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate('Group unlinked from facility'));
      await facilityStore.fetchCurrentFacilityGroups({ facilityId: props.facilityId });
    } else {
      throw resp.data;
    }
  } catch (err) {
    logger.error('Failed to unlink group from facility', err);
    commonUtil.showToast(translate('Failed to unlink group'));
  }
  emitter.emit('dismissLoader');
}

function copyToClipboard(value: string) {
  navigator.clipboard.writeText(value);
  commonUtil.showToast(translate("Copied", { value }));
}

function getCurrentTime(zone: string, format = 't ZZZZ') {
  return DateTime.now().setZone(zone).toFormat(format);
}

function getDate(date: any) {
  return DateTime.fromMillis(date).toFormat('dd LLL yyyy');
}

function getOpenEndTime(startTime: any, capacity: any) {
  const openTime = DateTime.fromFormat(startTime, 'HH:mm:ss').toFormat('HH:mm a');
  const endTime = DateTime.fromMillis(DateTime.fromFormat(startTime, 'HH:mm:ss').toMillis() + capacity).toFormat('hh:mm a');
  return `${openTime} - ${endTime}`;
}

function getFacilityGroupTypeDesc(groupTypeId: string) {
  return facilityGroupTypes.value.find((groupType: any) => groupType.facilityGroupTypeId === groupTypeId)?.description || groupTypeId;
}
</script>

<style scoped>
section {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
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

.external-mappings, .facility-info {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  align-items: start;
}

ion-card > ion-button[expand="block"] {
  margin-inline: var(--spacer-sm);
  margin-bottom: var(--spacer-sm);
}

.actions {
  display: flex;
  justify-content: space-between;
}

@media screen and (min-width: 700px) {
  ion-content > main {
    margin: var(--spacer-lg)
  }
}
</style>
